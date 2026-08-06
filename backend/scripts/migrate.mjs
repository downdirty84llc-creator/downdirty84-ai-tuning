#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Applies backend/migrations/*.sql in filename order, once each, inside a
 * transaction per file, and records what ran in schema_migrations.
 *
 * Written so it is safe to run on every deploy: already-applied files are
 * skipped, a failing file rolls back rather than leaving the schema half
 * changed, and a file whose contents changed after being applied is reported
 * rather than silently ignored — an edited migration means the database and
 * the repo disagree about what the schema is.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

if (!process.env.DATABASE_URL) {
  console.error("[migrate] DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const sha = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename    text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Map(
    (await pool.query("SELECT filename, checksum FROM schema_migrations")).rows.map((r) => [
      r.filename,
      r.checksum
    ])
  );

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let ran = 0;
  let drift = 0;

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const sum = sha(sql);

    if (applied.has(file)) {
      if (applied.get(file) !== sum) {
        console.error(
          `[migrate] DRIFT  ${file} has changed since it was applied. ` +
            `The database and the repo disagree. Write a new migration instead of editing this one.`
        );
        drift++;
      } else {
        console.log(`[migrate] skip   ${file}`);
      }
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)",
        [file, sum]
      );
      await client.query("COMMIT");
      console.log(`[migrate] apply  ${file}`);
      ran++;
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      console.error(`[migrate] FAILED ${file}: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  if (drift > 0) {
    console.error(`[migrate] ${drift} migration(s) drifted. Refusing to report success.`);
    process.exit(1);
  }
  console.log(`[migrate] done — ${ran} applied, ${files.length - ran} already present.`);
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error("[migrate] " + (err?.message ?? err));
    await pool.end().catch(() => {});
    process.exit(1);
  });
