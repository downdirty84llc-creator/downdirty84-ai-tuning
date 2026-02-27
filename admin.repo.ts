import { query } from "./db.js";

type AdminJobRow = {
  id: string;
  user_id: string;
  service_type: string;
  platform: string;
  engine_family: string | null;
  vehicle: string | null;
  ecu: string | null;
  notes: string | null;
  internal_notes: string | null;
  status: string;
  created_at: string;
  updated_at: string | null;
};

export async function adminListJobs(): Promise<AdminJobRow[]> {
  return query<AdminJobRow>("SELECT * FROM jobs ORDER BY created_at DESC");
}

export async function adminGetJob(jobId: string): Promise<AdminJobRow | null> {
  const rows = await query<AdminJobRow>("SELECT * FROM jobs WHERE id=$1 LIMIT 1", [jobId]);
  return rows[0] || null;
}

export async function adminUpdateJob(jobId: string, patch: { status?: string; internal_notes?: string | null }): Promise<void> {
  if (patch.status !== undefined && patch.internal_notes !== undefined) {
    await query(
      "UPDATE jobs SET status=$1, internal_notes=$2, updated_at=now() WHERE id=$3",
      [patch.status, patch.internal_notes, jobId]
    );
    return;
  }

  if (patch.status !== undefined) {
    await query("UPDATE jobs SET status=$1, updated_at=now() WHERE id=$2", [patch.status, jobId]);
    return;
  }

  if (patch.internal_notes !== undefined) {
    await query("UPDATE jobs SET internal_notes=$1, updated_at=now() WHERE id=$2", [patch.internal_notes, jobId]);
  }
}
