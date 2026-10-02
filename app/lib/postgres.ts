import "server-only";
import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | undefined;

export function isPostgresConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPostgresPool() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }

  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.POSTGRES_SSL === "disable" ? false : { rejectUnauthorized: false },
  });

  return pool;
}
