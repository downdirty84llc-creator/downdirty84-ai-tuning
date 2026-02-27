import pg from "pg";
import { newDb } from "pg-mem";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
const { Pool } = pg;
const isProduction = process.env.NODE_ENV === "production";

function normalizeMigrationSql(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto;?/gi, "")
    .replace(/CREATE EXTENSION IF NOT EXISTS citext;?/gi, "")
    .replace(/\bcitext\b/gi, "text")
    .replace(/::jsonb/gi, "");
}

async function createMemoryPool() {
  const db = newDb();
  db.public.registerFunction({
    name: "gen_random_uuid",
    impure: true,
    implementation: () => crypto.randomUUID()
  });

  const memPg = db.adapters.createPg();
  const memPool = new memPg.Pool();

  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const migrations = ["001_auth.sql", "002_jobs_uploads.sql", "003_orders_admin.sql", "004_runs.sql"];
  for (const file of migrations) {
    const sql = fs.readFileSync(path.join(baseDir, file), "utf8");
    await memPool.query(normalizeMigrationSql(sql));
  }

  console.warn("[DD84][config-warning] DATABASE_URL not set. Using in-memory pg-mem database.");
  return memPool;
}

export const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : isProduction
    ? (() => {
        throw new Error("DATABASE_URL is required in production.");
      })()
    : await createMemoryPool();

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}
