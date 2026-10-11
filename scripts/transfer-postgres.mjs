import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";
import pg from "pg";

const tables = ["companies", "customers", "work_items", "place_templates", "material_templates", "estimates", "estimate_places", "estimate_items", "invoices", "invoice_items", "app_settings", "app_users"];
const allTables = [...tables, "app_user_sessions", "password_reset_tokens"];
const root = fileURLToPath(new URL("../", import.meta.url));
const targetEnvIndex = process.argv.indexOf("--target-env");
const targetEnvPath = targetEnvIndex < 0 ? path.join(root, ".env.production.local") : process.argv[targetEnvIndex + 1];
const targetEnv = parseEnv(await readFile(targetEnvPath, "utf8"));
const sourceUrl = new URL(process.env.DATABASE_URL);
const targetUrl = new URL(targetEnv.DATABASE_URL);
const allowLocalTest = process.argv.includes("--allow-local-test");
const apply = process.argv.includes("--apply");
if (sourceUrl.hostname === targetUrl.hostname && sourceUrl.port === targetUrl.port && sourceUrl.pathname === targetUrl.pathname) throw new Error("Source and destination must be different databases.");
if (!allowLocalTest && ["127.0.0.1", "localhost", "[::1]"].includes(targetUrl.hostname)) throw new Error("A production database must have an external hostname.");
const source = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.POSTGRES_SSL === "disable" ? false : { rejectUnauthorized: true } });
// URL SSL options must not override certificate verification.
for (const option of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) targetUrl.searchParams.delete(option);
const target = new pg.Client({ connectionString: targetUrl.toString(), ssl: targetEnv.POSTGRES_SSL === "disable" && allowLocalTest ? false : { rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
const quote = (name) => `"${name.replaceAll('"', '""')}"`;
const backupDir = path.join(root, ".local-postgres", "production-transfers", new Date().toISOString().replace(/[:.]/g, "-"));
let transaction = false;
let stage = "connect";

try {
  await source.connect();
  await source.query("begin isolation level repeatable read read only");
  await source.query("set local time zone 'UTC'");
  const data = {};
  for (const table of tables) {
    const filter = table === "app_users" ? "where t.id <> 'dev-demo-admin' and t.email <> 'admin@demo.invalid'" : "";
    data[table] = (await source.query(`select to_jsonb(t) as row from ${quote(table)} t ${filter} order by id`)).rows.map((row) => row.row);
  }
  await source.query("commit");
  await mkdir(backupDir, { recursive: true });
  await writeFile(path.join(backupDir, "source.json"), JSON.stringify(data, null, 2), { mode: 0o600 });
  await target.connect();
  await target.query("begin");
  transaction = true;
  await target.query("set local time zone 'UTC'");
  await target.query("set local lock_timeout = '5s'");
  stage = "check-destination";
  const existingTables = (await target.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")).rows.map((row) => row.table_name);
  if (existingTables.some((table) => !allTables.includes(table))) throw new Error("Destination contains other application tables. No data was overwritten.");
  const before = {};
  for (const table of existingTables) before[table] = (await target.query(`select to_jsonb(t) as row from ${quote(table)} t order by id`)).rows.map((row) => row.row);
  await writeFile(path.join(backupDir, "destination-before.json"), JSON.stringify(before, null, 2), { mode: 0o600 });
  await target.query(await readFile(path.join(root, "postgres", "schema.sql"), "utf8"));
  await target.query(`lock table ${allTables.map(quote).join(",")} in exclusive mode`);
  for (const table of allTables) {
    const existing = (await target.query(`select * from ${quote(table)}`)).rows;
    if (table === "app_settings") {
      if (existing.length !== 1 || existing[0].id !== "default" || Number(existing[0].payment_due_days) !== 30 || Number(existing[0].profit_rate) !== 20) throw new Error("Destination settings have been customized. No data was overwritten.");
    } else if (existing.length) throw new Error("Destination is not empty. No data was overwritten.");
  }
  if (apply) {
    stage = "copy-and-verify";
    for (const table of tables) {
      for (const row of data[table]) {
        const columns = Object.keys(row);
        const conflict = table === "app_settings" ? `on conflict (id) do update set ${columns.filter((column) => column !== "id").map((column) => `${quote(column)} = excluded.${quote(column)}`).join(",")}` : "";
        await target.query(`insert into ${quote(table)} (${columns.map(quote).join(",")}) values (${columns.map((_, i) => `$${i + 1}`).join(",")}) ${conflict}`, columns.map((column) => row[column]));
      }
      const actual = (await target.query(`select to_jsonb(t) as row from ${quote(table)} t order by id`)).rows.map((row) => row.row);
      if (JSON.stringify(actual) !== JSON.stringify(data[table])) throw new Error(`Data verification failed: ${table}`);
    }
    await target.query("select setval(pg_get_serial_sequence('invoice_items','id'),greatest(coalesce((select max(id) from invoice_items),1),1),true)");
    await target.query("commit");
    transaction = false;
  } else {
    await target.query("rollback");
    transaction = false;
  }
  const report = { status: apply ? "success" : "ready", counts: Object.fromEntries(tables.map((table) => [table, data[table].length])), demoAccountTransferred: false, sessionsTransferred: false, backupDir };
  await writeFile(path.join(backupDir, "report.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} catch (error) {
  if (transaction) await target.query("rollback").catch(() => {});
  console.error(`Transfer failed at ${stage}: ${error.code ?? error.message}`);
  process.exitCode = 1;
} finally {
  await source.end().catch(() => {});
  await target.end().catch(() => {});
}
