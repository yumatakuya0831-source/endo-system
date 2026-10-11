import { spawn } from "node:child_process";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("../", import.meta.url));
const localDir = path.join(root, ".local-postgres");
const config = JSON.parse(await readFile(path.join(localDir, "config.json"), "utf8"));
const connection = new URL(process.env.DATABASE_URL);
if (connection.hostname !== "127.0.0.1" || Number(connection.port) !== config.port) throw new Error("Only the local database is supported.");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = path.join(localDir, "backups", stamp);
const dumpPath = path.join(backupDir, "endo.dump");
const restoreDatabase = `endo_restore_${Date.now()}`;
const source = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: false });
const admin = new pg.Client({ host: "127.0.0.1", port: config.port, database: "postgres", user: "postgres", password: config.adminPassword, ssl: false });
let restored;
const quote = (name) => `"${name.replaceAll('"', '""')}"`;

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      windowsHide: true, stdio: "inherit",
      env: { ...process.env, PGPASSWORD: decodeURIComponent(connection.password), PGSSLMODE: "disable" },
    });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} failed (${code}).`)));
  });
}

try {
  await mkdir(backupDir, { recursive: true });
  await source.connect();
  await source.query("begin isolation level repeatable read read only");
  await source.query("set local time zone 'UTC'");
  const snapshot = (await source.query("select pg_export_snapshot() as id")).rows[0].id;
  const tables = (await source.query("select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name")).rows.map((row) => row.table_name);
  const expected = {};
  for (const table of tables) expected[table] = (await source.query(`select to_jsonb(t) as row from ${quote(table)} t order by id`)).rows.map((row) => row.row);
  const commonArgs = ["-h", connection.hostname, "-p", String(config.port), "-U", decodeURIComponent(connection.username), "-w"];
  await run(path.join(config.binDir, "pg_dump.exe"), [...commonArgs, "-d", connection.pathname.slice(1), "-Fc", "--snapshot", snapshot, "-f", dumpPath]);
  await source.query("commit");
  await admin.connect();
  await admin.query(`create database ${quote(restoreDatabase)} owner ${quote(decodeURIComponent(connection.username))}`);
  await run(path.join(config.binDir, "pg_restore.exe"), [...commonArgs, "-d", restoreDatabase, "--no-owner", "--no-privileges", "--exit-on-error", dumpPath]);
  const restoreConnection = new URL(connection);
  restoreConnection.pathname = `/${restoreDatabase}`;
  restored = new pg.Client({ connectionString: restoreConnection.toString(), ssl: false });
  await restored.connect();
  await restored.query("set time zone 'UTC'");
  const counts = {};
  for (const table of tables) {
    const actual = (await restored.query(`select to_jsonb(t) as row from ${quote(table)} t order by id`)).rows.map((row) => row.row);
    if (JSON.stringify(actual) !== JSON.stringify(expected[table])) throw new Error(`Restored data mismatch: ${table}`);
    counts[table] = actual.length;
  }
  const migrationDir = path.join(localDir, "migrations");
  const latest = (await readdir(migrationDir)).sort().at(-1);
  await copyFile(path.join(migrationDir, latest, "source.json"), path.join(backupDir, "supabase-source.json"));
  const report = { status: "success", backupDir, restoreDatabase, verifiedTables: tables.length, counts, verifiedAt: new Date().toISOString() };
  await writeFile(path.join(backupDir, "verification.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(error.code ?? error.message);
  process.exitCode = 1;
} finally {
  await source.end().catch(() => {});
  await restored?.end().catch(() => {});
  await admin.end().catch(() => {});
}
