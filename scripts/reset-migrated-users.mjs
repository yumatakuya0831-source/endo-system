import { createHash, randomBytes } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const migrationDir = fileURLToPath(new URL("../.local-postgres/migrations/", import.meta.url));
const latest = (await readdir(migrationDir)).sort().at(-1);
if (!latest) throw new Error("No migration snapshot found.");
const source = JSON.parse(await readFile(path.join(migrationDir, latest, "source.json"), "utf8"));
const sourceIds = (source.users ?? []).map((user) => user.id);
if (!sourceIds.length) throw new Error("No migrated users found.");
const destination = new URL(process.env.DATABASE_URL);
const production = process.argv.includes("--production");
const emailIndex = process.argv.indexOf("--email");
const email = emailIndex < 0 ? undefined : process.argv[emailIndex + 1]?.trim().toLowerCase();
if (production) {
  if (!email) throw new Error("A specific email is required for production reset.");
  if (!destination.hostname.endsWith(".neon.tech")) throw new Error("Production reset requires the Neon database.");
} else if (destination.hostname !== "127.0.0.1" || destination.port !== "5433") throw new Error("Only the local migration database is supported.");
for (const option of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) destination.searchParams.delete(option);
const origin = production ? "https://endo-system.vercel.app" : "http://127.0.0.1:3000";
const client = new pg.Client({ connectionString: destination.toString(), ssl: production ? { rejectUnauthorized: true } : false, connectionTimeoutMillis: 15000 });
const password = process.env.ENDO_RESET_NEW_PASSWORD;
const userId = process.env.ENDO_RESET_USER_ID;
delete process.env.ENDO_RESET_NEW_PASSWORD;
delete process.env.ENDO_RESET_USER_ID;
let tokenId;
try {
  await client.connect();
  const users = (await client.query("select id, email, role from app_users where id = any($1::text[]) and ($2::text is null or email = $2) order by email", [sourceIds, email ?? null])).rows;
  if (email && users.length !== 1) throw new Error("The specified migrated user was not found.");
  if (process.argv[2] === "list") {
    console.log(JSON.stringify(users));
  } else if (process.argv[2] === "reset") {
    const user = users.find((item) => item.id === userId);
    if (!user || !password || password.length < 8) throw new Error("A migrated user and a password of at least 8 characters are required.");
    const token = randomBytes(32).toString("hex");
    tokenId = `reset-${randomBytes(16).toString("hex")}`;
    await client.query(
      "insert into password_reset_tokens (id,user_id,token_hash,expires_at) values ($1,$2,$3,now()+interval '10 minutes')",
      [tokenId, user.id, createHash("sha256").update(token).digest("hex")],
    );
    const reset = await fetch(`${origin}/api/auth/password-reset/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }), signal: AbortSignal.timeout(15000),
    });
    if (!reset.ok) throw new Error(`Password reset failed (HTTP ${reset.status}).`);
    const login = await fetch(`${origin}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, password }), signal: AbortSignal.timeout(15000),
    });
    if (!login.ok) throw new Error(`Login verification failed (HTTP ${login.status}).`);
    const session = await login.json();
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    if (!cookie) throw new Error("Login verification did not create a session.");
    const logout = await fetch(`${origin}/api/auth/logout`, {
      method: "POST", headers: { Cookie: cookie }, signal: AbortSignal.timeout(15000),
    });
    if (!logout.ok || session.session?.user.id !== user.id) throw new Error("Session verification failed.");
    const result = { userId: user.id, environment: production ? "production" : "local", passwordReset: true, loginVerified: true, verifiedAt: new Date().toISOString() };
    const resultFile = fileURLToPath(new URL(`../.local-postgres/reset-${production ? "production-" : ""}${user.id}.json`, import.meta.url));
    await writeFile(resultFile, JSON.stringify(result), { mode: 0o600 });
    console.log("Password reset and login verification succeeded.");
  } else throw new Error("Use list or reset.");
} catch (error) {
  console.error(error.code ?? error.message);
  process.exitCode = 1;
} finally {
  if (tokenId) await client.query("delete from password_reset_tokens where id = $1", [tokenId]).catch(() => {});
  await client.end().catch(() => {});
}
