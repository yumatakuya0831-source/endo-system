import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(await readFile(path.join(root, ".local-postgres/config.json"), "utf8"));
const connection = new URL(process.env.DATABASE_URL);
assert.equal(connection.hostname, "127.0.0.1");
assert.equal(Number(connection.port), config.port);
const database = `endo_transfer_test_${Date.now()}`;
const evidenceDir = path.join(root, ".local-postgres/transfer-tests", database);
const admin = new pg.Client({ host: "127.0.0.1", port: config.port, database: "postgres", user: "postgres", password: config.adminPassword, ssl: false });
const source = new pg.Client({ connectionString: connection.toString(), ssl: false });
let target;

try {
  await admin.connect();
  await admin.query(`create database "${database}" owner "${decodeURIComponent(connection.username).replaceAll('"', '""')}"`);
  connection.pathname = `/${database}`;
  await mkdir(evidenceDir, { recursive: true });
  const envPath = path.join(evidenceDir, "target.env");
  await writeFile(envPath, `DATABASE_URL=${connection.toString()}\nPOSTGRES_SSL=disable\n`, { mode: 0o600 });
  target = new pg.Client({ connectionString: connection.toString(), ssl: false });
  await target.connect();
  const run = (apply) => spawnSync(process.execPath, ["scripts/transfer-postgres.mjs", "--target-env", envPath, "--allow-local-test", ...(apply ? ["--apply"] : [])], { cwd: root, env: process.env, encoding: "utf8", windowsHide: true, timeout: 60000 });
  const dryRun = run(false);
  assert.equal(dryRun.status, 0, dryRun.stderr);
  assert.equal((await target.query("select count(*)::int as count from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")).rows[0].count, 0);
  const applied = run(true);
  assert.equal(applied.status, 0, applied.stderr);
  await source.connect();
  const expectedUsers = (await source.query("select id, password_hash, role from app_users where id <> 'dev-demo-admin' and email <> 'admin@demo.invalid' order by id")).rows;
  assert.deepEqual((await target.query("select id, password_hash, role from app_users order by id")).rows, expectedUsers);
  for (const table of ["app_user_sessions", "password_reset_tokens"]) assert.equal((await target.query(`select count(*)::int as count from ${table}`)).rows[0].count, 0);
  const before = (await target.query("select to_jsonb(t) as row from app_users t order by id")).rows;
  const repeated = run(true);
  assert.equal(repeated.status, 1);
  assert.match(repeated.stderr, /Destination is not empty/);
  assert.deepEqual((await target.query("select to_jsonb(t) as row from app_users t order by id")).rows, before);
  const report = { status: "success", database, dryRunRolledBack: true, transferredUsers: expectedUsers.length, passwordHashesPreserved: true, demoAndSessionsExcluded: true, nonemptyDestinationRejected: true, transfer: JSON.parse(applied.stdout.trim()), verifiedAt: new Date().toISOString() };
  await writeFile(path.join(evidenceDir, "verification.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} finally {
  await source.end().catch(() => {});
  await target?.end().catch(() => {});
  await admin.end().catch(() => {});
}
