import { query } from "../../db.js";

export type JobRow = {
  id: string;
  user_id: string;
  service_type: string;
  platform: string;
  engine_family: string | null;
  vehicle: string | null;
  ecu: string | null;
  notes: string | null;
  /** GASOLINE | E85 | null. Selects the threshold profile — see thresholds.profiles.ts. */
  fuel: string | null;
  /** NA | FORCED | null. */
  induction: string | null;
  status: string;
  created_at: string;
};

export async function createJob(input: Omit<JobRow, "id" | "created_at" | "status"> & { status?: string }): Promise<JobRow> {
  const r = await query<JobRow>(
    `
    INSERT INTO jobs (user_id, service_type, platform, engine_family, vehicle, ecu, notes, fuel, induction, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING *
    `,
    [
      input.user_id,
      input.service_type,
      input.platform,
      input.engine_family,
      input.vehicle,
      input.ecu,
      input.notes,
      // Null rather than a default. "We do not know" has to stay
      // distinguishable from "naturally aspirated gasoline", because only one
      // of those is judged against owner-confirmed numbers.
      input.fuel ?? null,
      input.induction ?? null,
      input.status || "NEW"
    ]
  );
  return r[0];
}

export async function listJobs(userId: string): Promise<JobRow[]> {
  return query<JobRow>(`SELECT * FROM jobs WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
}

export async function getJob(userId: string, jobId: string): Promise<JobRow | null> {
  const r = await query<JobRow>(`SELECT * FROM jobs WHERE user_id=$1 AND id=$2 LIMIT 1`, [userId, jobId]);
  return r[0] || null;
}

export async function updateJobStatus(userId: string, jobId: string, status: string): Promise<void> {
  await query(`UPDATE jobs SET status=$1 WHERE user_id=$2 AND id=$3`, [status, userId, jobId]);
}
