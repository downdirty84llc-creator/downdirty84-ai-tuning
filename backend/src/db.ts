import pg from "pg";
const { Pool, types } = pg;

// Return timestamptz as an ISO string rather than a JS Date. Every consumer
// serialises these straight to JSON, and going through Date silently applies
// the server's local timezone.
types.setTypeParser(1184, (v) => (v === null ? null : new Date(v).toISOString()));
types.setTypeParser(1114, (v) => (v === null ? null : new Date(v + "Z").toISOString()));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}

export type Tx = {
  query<T = any>(text: string, params?: any[]): Promise<T[]>;
};

/**
 * Runs `fn` inside a single transaction on one connection, committing on
 * success and rolling back on any throw. Use when two writes must land
 * together or not at all — notably the Stripe order/job pair, where a partial
 * commit would leave a paid order with no job and no way to retry it.
 */
export async function withTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tx: Tx = {
      async query<R = any>(text: string, params: any[] = []): Promise<R[]> {
        const r = await client.query(text, params);
        return r.rows as R[];
      }
    };
    const out = await fn(tx);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // A rollback failure means the connection is already broken; releasing
      // it below is the only useful action left.
    }
    throw err;
  } finally {
    client.release();
  }
}
