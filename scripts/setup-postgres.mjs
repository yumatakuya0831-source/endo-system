import { randomBytes } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

const resultPath = process.argv[2];
const database = "endo_system_dev";
const user = "endo_app_dev";
const port = Number(process.env.ENDO_SETUP_PORT ?? 5432);
const admin = new pg.Client({
  host: "127.0.0.1", port, user: "postgres", database: "postgres",
  password: process.env.ENDO_SETUP_ADMIN_PASSWORD,
  ssl: false, connectionTimeoutMillis: 10000,
});
delete process.env.ENDO_SETUP_ADMIN_PASSWORD;
const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
const tempEnvPath = fileURLToPath(new URL(`../.env.postgres-${randomBytes(8).toString("hex")}.local`, import.meta.url));
let client;
let stage = "administrator-login";
let result;
try {
  await admin.connect();
  stage = "check-database-name";
  const existing = await admin.query(
    "select exists(select 1 from pg_database where datname = $1) as database_exists, exists(select 1 from pg_roles where rolname = $2) as role_exists",
    [database, user],
  );
  if (existing.rows[0].database_exists || existing.rows[0].role_exists) {
    throw new Error("SETUP_NAMES_ALREADY_EXIST");
  }
  const password = randomBytes(32).toString("hex");
  const connectionString = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}`;
  let envText;
  try { envText = await readFile(envPath, "utf8"); }
  catch (error) { if (error.code !== "ENOENT") throw error; envText = ""; }
  for (const [key, value] of Object.entries({ DATABASE_URL: connectionString, POSTGRES_SSL: "disable" })) {
    const line = new RegExp(`^${key}=.*$`, "gm");
    envText = line.test(envText) ? envText.replace(line, `${key}=${value}`) : `${envText.trimEnd()}\n${key}=${value}\n`;
  }
  stage = "prepare-local-config";
  await writeFile(tempEnvPath, envText, { flag: "wx", mode: 0o600 });
  stage = "create-application-user";
  // The identifiers are fixed, and the generated password contains only hexadecimal characters.
  await admin.query(`create role ${user} login password '${password}' nosuperuser nocreatedb nocreaterole noreplication`);
  stage = "create-database";
  await admin.query(`create database ${database} owner ${user}`);
  await admin.query(`revoke all on database ${database} from public`);
  client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 10000 });
  await client.connect();
  stage = "apply-schema";
  await client.query("begin");
  await client.query(await readFile(new URL("../postgres/schema.sql", import.meta.url), "utf8"));
  await client.query("commit");
  stage = "verify-connection";
  const tables = await client.query("select count(*)::integer as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'");
  if (tables.rows[0].count !== 14) throw new Error("UNEXPECTED_TABLE_COUNT");
  stage = "save-local-config";
  await rename(tempEnvPath, envPath);
  result = { status: "success", database, user, tables: tables.rows[0].count };
  console.log(`Connected to ${database}. Created ${result.tables} tables and updated .env.local.`);
} catch (error) {
  result = { status: "failed", stage, code: error.code ?? (error.message === "SETUP_NAMES_ALREADY_EXIST" ? error.message : "SETUP_FAILED") };
  console.error(`Setup failed at ${stage} (${result.code}). Existing databases are not overwritten.`);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
  await admin.end().catch(() => {});
  await unlink(tempEnvPath).catch(() => {});
  if (resultPath) await writeFile(resultPath, JSON.stringify(result), { mode: 0o600 });
}
