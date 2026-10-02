import "server-only";
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { getPostgresPool } from "./postgres";

export type AppUserRole = "admin" | "user";
export type AppUser = {
  id: string;
  email: string;
  role: AppUserRole;
  confirmedAt: string;
  createdAt: string;
  lastSignInAt?: string;
};

export const sessionCookieName = "endo_session";
const sessionMaxAgeSeconds = 60 * 60 * 24 * 7;

const normalizeEmail = (email: string) => email.trim().toLowerCase();
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const toAppUser = (row: {
  id: string;
  email: string;
  role: AppUserRole;
  confirmed_at: string;
  created_at: string;
  last_sign_in_at?: string | null;
}): AppUser => ({
  id: row.id,
  email: row.email,
  role: isBootstrapAdmin(row.email) ? "admin" : row.role,
  confirmedAt: String(row.confirmed_at),
  createdAt: String(row.created_at),
  lastSignInAt: row.last_sign_in_at ? String(row.last_sign_in_at) : undefined,
});

export function getAdminEmails() {
  return (process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
}

export function isBootstrapAdmin(email: string) {
  return getAdminEmails().includes(normalizeEmail(email));
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [method, salt, expected] = storedHash.split("$");
  if (method !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function createId(prefix: string) {
  return `${prefix}-${randomBytes(16).toString("hex")}`;
}

function readCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

async function findUserByEmail(client: PoolClient, email: string) {
  const { rows } = await client.query<{
    id: string;
    email: string;
    password_hash: string;
    role: AppUserRole;
    confirmed_at: string;
    created_at: string;
    last_sign_in_at?: string | null;
  }>("select id, email, password_hash, role, confirmed_at, created_at, last_sign_in_at from app_users where email = $1 limit 1", [normalizeEmail(email)]);
  return rows[0];
}

export async function ensureBootstrapAdmin(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  if (!isBootstrapAdmin(normalizedEmail)) return;

  const client = await getPostgresPool().connect();
  try {
    const existing = await findUserByEmail(client, normalizedEmail);
    if (existing) {
      if (existing.role !== "admin") {
        await client.query("update app_users set role = 'admin', updated_at = now() where id = $1", [existing.id]);
      }
      return;
    }

    await client.query(
      "insert into app_users (id, email, password_hash, role, confirmed_at, created_at, updated_at) values ($1, $2, $3, 'admin', now(), now(), now())",
      [createId("user"), normalizedEmail, hashPassword(password)],
    );
  } finally {
    client.release();
  }
}

export async function authenticateUser(email: string, password: string) {
  const bootstrapPassword = process.env.ADMIN_INITIAL_PASSWORD;
  if (bootstrapPassword && password === bootstrapPassword) {
    await ensureBootstrapAdmin(email, password);
  }

  const client = await getPostgresPool().connect();
  try {
    const row = await findUserByEmail(client, email);
    if (!row || !verifyPassword(password, row.password_hash)) return null;

    await client.query("update app_users set last_sign_in_at = now(), updated_at = now() where id = $1", [row.id]);
    return toAppUser({ ...row, last_sign_in_at: new Date().toISOString() });
  } finally {
    client.release();
  }
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  await getPostgresPool().query(
    "insert into app_user_sessions (id, user_id, token_hash, expires_at, created_at) values ($1, $2, $3, now() + interval '7 days', now())",
    [createId("session"), userId, hashToken(token)],
  );
  return token;
}

export async function deleteSession(request: Request) {
  const token = readCookie(request, sessionCookieName);
  if (!token) return;
  await getPostgresPool().query("delete from app_user_sessions where token_hash = $1", [hashToken(token)]);
}

export async function getUserFromRequest(request: Request) {
  const token = readCookie(request, sessionCookieName);
  if (!token) return null;

  const { rows } = await getPostgresPool().query<{
    id: string;
    email: string;
    role: AppUserRole;
    confirmed_at: string;
    created_at: string;
    last_sign_in_at?: string | null;
  }>(
    `select users.id, users.email, users.role, users.confirmed_at, users.created_at, users.last_sign_in_at
     from app_user_sessions sessions
     join app_users users on users.id = sessions.user_id
     where sessions.token_hash = $1 and sessions.expires_at > now()
     limit 1`,
    [hashToken(token)],
  );

  return rows[0] ? toAppUser(rows[0]) : null;
}

export async function requireLogin(request: Request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return { error: NextResponse.json({ error: "Login is required." }, { status: 401 }) };
  }
  return { user };
}

export async function requireAdmin(request: Request) {
  const login = await requireLogin(request);
  if (login.error) return login;
  if (login.user.role !== "admin") {
    return { error: NextResponse.json({ error: "Only administrators can manage users." }, { status: 403 }) };
  }
  return { user: login.user };
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(sessionCookieName, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function publicUser(user: AppUser) {
  return {
    id: user.id,
    email: user.email,
    app_metadata: { role: user.role },
  };
}

export async function listUsers() {
  const { rows } = await getPostgresPool().query<{
    id: string;
    email: string;
    role: AppUserRole;
    confirmed_at: string;
    created_at: string;
    last_sign_in_at?: string | null;
  }>("select id, email, role, confirmed_at, created_at, last_sign_in_at from app_users order by created_at desc");
  return rows.map(toAppUser);
}

export async function createUser(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email);
  const role: AppUserRole = isBootstrapAdmin(normalizedEmail) ? "admin" : "user";
  const { rows } = await getPostgresPool().query<{ id: string; email: string }>(
    "insert into app_users (id, email, password_hash, role, confirmed_at, created_at, updated_at) values ($1, $2, $3, $4, now(), now(), now()) returning id, email",
    [createId("user"), normalizedEmail, hashPassword(password), role],
  );
  return rows[0];
}

export async function updateUserRole(userId: string, role: AppUserRole) {
  const { rows } = await getPostgresPool().query<{
    id: string;
    email: string;
    role: AppUserRole;
    confirmed_at: string;
    created_at: string;
    last_sign_in_at?: string | null;
  }>(
    "update app_users set role = $2, updated_at = now() where id = $1 returning id, email, role, confirmed_at, created_at, last_sign_in_at",
    [userId, role],
  );
  return rows[0] ? toAppUser(rows[0]) : null;
}

export async function deleteUserById(userId: string) {
  const { rows } = await getPostgresPool().query<{ id: string; email: string }>(
    "delete from app_users where id = $1 returning id, email",
    [userId],
  );
  return rows[0] ?? null;
}

export async function createPasswordResetToken(email: string) {
  const client = await getPostgresPool().connect();
  try {
    const user = await findUserByEmail(client, email);
    if (!user) return null;

    const token = randomBytes(32).toString("hex");
    await client.query(
      "insert into password_reset_tokens (id, user_id, token_hash, expires_at, created_at) values ($1, $2, $3, now() + interval '1 hour', now())",
      [createId("reset"), user.id, hashToken(token)],
    );
    return token;
  } finally {
    client.release();
  }
}

export async function resetPassword(token: string, password: string) {
  const client = await getPostgresPool().connect();
  try {
    await client.query("begin");
    const { rows } = await client.query<{ id: string; user_id: string }>(
      "select id, user_id from password_reset_tokens where token_hash = $1 and expires_at > now() and used_at is null limit 1",
      [hashToken(token)],
    );
    const reset = rows[0];
    if (!reset) {
      await client.query("rollback");
      return false;
    }

    await client.query("update app_users set password_hash = $2, updated_at = now() where id = $1", [reset.user_id, hashPassword(password)]);
    await client.query("update password_reset_tokens set used_at = now() where id = $1", [reset.id]);
    await client.query("delete from app_user_sessions where user_id = $1", [reset.user_id]);
    await client.query("commit");
    return true;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
