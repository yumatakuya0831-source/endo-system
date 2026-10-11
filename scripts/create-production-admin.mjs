import { randomBytes, scryptSync } from "node:crypto";
import { writeFile } from "node:fs/promises";
import pg from "pg";

const emailIndex = process.argv.indexOf("--email");
const email = process.argv[emailIndex + 1]?.trim().toLowerCase();
if (!process.argv.includes("--production") || emailIndex < 0 || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid production email is required.");
const destination = new URL(process.env.DATABASE_URL);
if (!destination.hostname.endsWith(".neon.tech")) throw new Error("The production Neon database is required.");
for (const option of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) destination.searchParams.delete(option);
const client = new pg.Client({ connectionString: destination.toString(), ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
const password = process.env.ENDO_RESET_NEW_PASSWORD;
delete process.env.ENDO_RESET_NEW_PASSWORD;
let cookie;
const origin = "https://endo-system.vercel.app";
try {
  await client.connect();
  if ((await client.query("select id from app_users where email=$1", [email])).rowCount) throw new Error("This email is already registered. No account was changed.");
  if (process.argv[2] === "list") {
    console.log(JSON.stringify([{ id: "new-admin", email, role: "admin" }]));
  } else if (process.argv[2] === "create") {
    if (!password || password.length < 8) throw new Error("A password of at least 8 characters is required.");
    const salt = randomBytes(16).toString("hex");
    const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
    const id = `user-${randomBytes(16).toString("hex")}`;
    await client.query("insert into app_users (id,email,password_hash,role) values ($1,$2,$3,'admin')", [id, email, hash]);
    console.log("The production administrator was created. Checking login...");
    const login = await fetch(`${origin}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }), signal: AbortSignal.timeout(15000),
    });
    if (!login.ok) throw new Error(`Account created, but login verification failed (HTTP ${login.status}).`);
    cookie = login.headers.get("set-cookie")?.split(";")[0];
    const session = await login.json();
    if (!cookie || session.session?.user.id !== id || session.session?.user.role !== "admin") throw new Error("Account created, but administrator session verification failed.");
    const state = await fetch(`${origin}/api/app-state`, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(15000) });
    if (!state.ok) throw new Error(`Account created, but business data access failed (HTTP ${state.status}).`);
    const report = { userId: id, role: "admin", environment: "production", loginVerified: true, businessDataAccessVerified: true, verifiedAt: new Date().toISOString() };
    await writeFile(new URL(`../.local-postgres/created-production-${id}.json`, import.meta.url), JSON.stringify(report), { mode: 0o600 });
    console.log("Administrator login and business data access verification succeeded.");
  } else throw new Error("Use list or create.");
} catch (error) {
  console.error(error.code ?? error.message);
  process.exitCode = 1;
} finally {
  if (cookie) {
    try {
      const logout = await fetch(`${origin}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie }, signal: AbortSignal.timeout(15000) });
      if (!logout.ok) {
        console.error("Verification session logout failed.");
        process.exitCode = 1;
      }
    } catch {
      console.error("Verification session logout failed.");
      process.exitCode = 1;
    }
  }
  await client.end().catch(() => {});
}
