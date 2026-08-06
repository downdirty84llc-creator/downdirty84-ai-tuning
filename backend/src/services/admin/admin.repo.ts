import { query } from "../../db.js";
import type { JobRow } from "../jobs/jobs.repo.js";

export type AdminJobRow = JobRow & {
  internal_notes: string | null;
  updated_at: string;
  customer_email: string;
};

/**
 * Admin views are deliberately NOT scoped by user_id — that is the whole
 * point of the admin role. Access is gated by requireAdmin upstream.
 */
export async function adminListJobs(limit = 200): Promise<AdminJobRow[]> {
  return query<AdminJobRow>(
    `
    SELECT j.*, u.email AS customer_email
    FROM jobs j
    JOIN users u ON u.id = j.user_id
    ORDER BY j.created_at DESC
    LIMIT $1
    `,
    [limit]
  );
}

export async function adminGetJob(jobId: string): Promise<AdminJobRow | null> {
  const r = await query<AdminJobRow>(
    `
    SELECT j.*, u.email AS customer_email
    FROM jobs j
    JOIN users u ON u.id = j.user_id
    WHERE j.id = $1
    LIMIT 1
    `,
    [jobId]
  );
  return r[0] || null;
}

/**
 * Partial update. Only the fields actually supplied are written, so a caller
 * sending just `status` cannot blank out internal_notes by omission.
 */
export async function adminUpdateJob(
  jobId: string,
  patch: { status?: string; internal_notes?: string | null }
): Promise<AdminJobRow | null> {
  const sets: string[] = [];
  const params: any[] = [];

  if (patch.status !== undefined) {
    params.push(patch.status);
    sets.push(`status = $${params.length}`);
  }
  if (patch.internal_notes !== undefined) {
    params.push(patch.internal_notes);
    sets.push(`internal_notes = $${params.length}`);
  }
  if (sets.length === 0) return adminGetJob(jobId);

  sets.push(`updated_at = now()`);
  params.push(jobId);

  const r = await query<AdminJobRow>(
    `UPDATE jobs SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return r[0] || null;
}
