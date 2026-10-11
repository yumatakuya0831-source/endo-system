import { randomBytes, scryptSync } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const tables = ["companies", "customers", "work_items", "place_templates", "material_templates", "estimates", "estimate_places", "estimate_items", "invoices", "invoice_items", "app_settings"];
const apply = process.argv.includes("--apply");
const includeUsers = process.argv.includes("--include-users");
const sourceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sourceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!sourceUrl || !sourceKey || !process.env.DATABASE_URL) throw new Error("Source and destination environment variables are required.");
const headers = { apikey: sourceKey, Authorization: `Bearer ${sourceKey}`, Prefer: "count=exact" };
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.POSTGRES_SSL === "disable" ? false : { rejectUnauthorized: false } });
const backupDir = fileURLToPath(new URL(`../.local-postgres/migrations/${new Date().toISOString().replace(/[:.]/g, "-")}/`, import.meta.url));
const quote = (identifier) => `"${identifier.replaceAll('"', '""')}"`;
let transaction = false;
let stage = "read-source";

async function fetchJson(url) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Source read failed (HTTP ${response.status}).`);
  return { data: await response.json(), range: response.headers.get("content-range") };
}

async function fetchTable(table) {
  const rows = [];
  let total;
  for (let offset = 0; ; offset += 500) {
    const url = new URL(`/rest/v1/${table}`, sourceUrl);
    url.search = new URLSearchParams({ select: "*", order: "id.asc", offset: String(offset), limit: "500" }).toString();
    const { data, range } = await fetchJson(url);
    if (!Array.isArray(data)) throw new Error(`Invalid source table response: ${table}`);
    const currentTotal = Number(range?.split("/")[1]);
    if (!Number.isInteger(currentTotal) || (total !== undefined && currentTotal !== total)) throw new Error(`Source count changed or is unavailable: ${table}`);
    total = currentTotal;
    rows.push(...data);
    if (rows.length === total) return rows;
    if (!data.length || rows.length > total) throw new Error(`Incomplete source export: ${table}`);
  }
}

async function fetchUsers() {
  const users = [];
  for (let page = 1; ; page++) {
    const { data } = await fetchJson(new URL(`/auth/v1/admin/users?page=${page}&per_page=100`, sourceUrl));
    if (!Array.isArray(data.users)) throw new Error("Invalid source user response.");
    users.push(...data.users);
    if (data.users.length < 100) return users.sort((a, b) => a.id.localeCompare(b.id));
  }
}

async function sameRow(table, row, columns) {
  const comparisons = columns.map((column, index) => `${quote(column)} is not distinct from $${index + 2}`).join(" and ");
  const result = await client.query(`select 1 from ${quote(table)} where id = $1 and ${comparisons}`, [row.id, ...columns.map((column) => row[column])]);
  return result.rowCount === 1;
}

try {
  const source = {};
  for (const table of tables) source[table] = await fetchTable(table);
  if (includeUsers) source.users = await fetchUsers();
  // A second export detects edits made while reading across the source tables.
  for (const table of tables) {
    if (JSON.stringify(source[table]) !== JSON.stringify(await fetchTable(table))) throw new Error(`Source changed during export: ${table}`);
  }
  if (includeUsers && JSON.stringify(source.users) !== JSON.stringify(await fetchUsers())) throw new Error("Source users changed during export.");
  stage = "backup-destination";
  await client.connect();
  await client.query("begin isolation level serializable");
  transaction = true;
  await client.query("set local lock_timeout = '5s'");
  await client.query(`lock table ${[...tables, "app_users"].map(quote).join(",")} in exclusive mode`);
  const destination = {};
  const columnMap = {};
  for (const table of [...tables, "app_users", "app_user_sessions", "password_reset_tokens"]) {
    destination[table] = (await client.query(`select * from ${quote(table)} order by id`)).rows;
    const columns = await client.query("select column_name from information_schema.columns where table_schema = 'public' and table_name = $1 order by ordinal_position", [table]);
    columnMap[table] = columns.rows.map((column) => column.column_name);
  }
  await mkdir(backupDir, { recursive: true });
  await writeFile(path.join(backupDir, "source.json"), JSON.stringify(source, null, 2), { flag: "wx", mode: 0o600 });
  await writeFile(path.join(backupDir, "destination.json"), JSON.stringify(destination, null, 2), { flag: "wx", mode: 0o600 });
  const counts = Object.fromEntries(tables.map((table) => [table, source[table].length]));
  console.log(JSON.stringify({ mode: apply ? "apply" : "backup-only", sourceCounts: counts, sourceUsers: source.users?.length ?? 0 }));
  if (apply) {
    stage = "import-business-data";
    for (const table of tables) {
      for (const row of source[table]) {
        const columns = columnMap[table].filter((column) => Object.hasOwn(row, column));
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(",");
        const conflict = table === "app_settings"
          ? `do update set ${columns.filter((column) => column !== "id").map((column) => `${quote(column)} = excluded.${quote(column)}`).join(",")}`
          : "do nothing";
        await client.query(`insert into ${quote(table)} (${columns.map(quote).join(",")}) values (${placeholders}) on conflict (id) ${conflict}`, columns.map((column) => row[column]));
        if (!await sameRow(table, row, columns)) throw new Error(`Conflicting destination row: ${table}. Migration rolled back.`);
      }
    }
    stage = "import-users";
    const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase());
    let importedUsers = 0;
    for (const user of source.users ?? []) {
      if (!user.email || user.is_anonymous) throw new Error("A source user has no email. Migration rolled back.");
      const email = user.email.trim().toLowerCase();
      const role = user.app_metadata?.role === "admin" || adminEmails.includes(email) ? "admin" : "user";
      const existing = await client.query("select id, email, role from app_users where id = $1 or email = $2", [user.id, email]);
      if (existing.rowCount) {
        if (existing.rowCount !== 1 || existing.rows[0].id !== user.id || existing.rows[0].email !== email || existing.rows[0].role !== role) throw new Error("Conflicting destination user. Migration rolled back.");
        continue;
      }
      const salt = randomBytes(16).toString("hex");
      const hash = scryptSync(randomBytes(32), salt, 64).toString("hex");
      await client.query(
        "insert into app_users (id, email, password_hash, role, confirmed_at, created_at, updated_at, last_sign_in_at) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [user.id, email, `scrypt$${salt}$${hash}`, role, user.email_confirmed_at ?? user.confirmed_at ?? user.created_at, user.created_at, user.updated_at ?? user.created_at, user.last_sign_in_at ?? null],
      );
      const verified = await client.query("select 1 from app_users where id = $1 and email = $2 and role = $3", [user.id, email, role]);
      if (verified.rowCount !== 1) throw new Error("User verification failed.");
      importedUsers++;
    }
    stage = "verify-business-data";
    for (const table of tables) {
      for (const row of source[table]) {
        if (!await sameRow(table, row, columnMap[table].filter((column) => Object.hasOwn(row, column)))) throw new Error(`Verification failed: ${table}`);
      }
    }
    // Explicit source IDs must not collide with later generated invoice-item IDs.
    await client.query("select setval(pg_get_serial_sequence('invoice_items', 'id'), greatest(coalesce((select max(id) from invoice_items), 1), (select last_value from invoice_items_id_seq)), true)");
    await client.query("commit");
    transaction = false;
    const report = { status: "success", verifiedCounts: counts, importedUsers, passwordsRequireReset: importedUsers, backupDir };
    await writeFile(path.join(backupDir, "report.json"), JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify(report));
  } else {
    await client.query("rollback");
    transaction = false;
    console.log("Backups saved. Add --apply to import after reviewing the source counts.");
  }
} catch (error) {
  if (transaction) await client.query("rollback").catch(() => {});
  console.error(`Migration failed at ${stage}: ${error.code ?? error.cause?.code ?? error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
