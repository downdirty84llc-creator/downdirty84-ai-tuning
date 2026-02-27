import { query } from "./db.js";
export async function adminListJobs() {
    return query("SELECT * FROM jobs ORDER BY created_at DESC");
}
export async function adminGetJob(jobId) {
    const rows = await query("SELECT * FROM jobs WHERE id=$1 LIMIT 1", [jobId]);
    return rows[0] || null;
}
export async function adminUpdateJob(jobId, patch) {
    if (patch.status !== undefined && patch.internal_notes !== undefined) {
        await query("UPDATE jobs SET status=$1, internal_notes=$2, updated_at=now() WHERE id=$3", [patch.status, patch.internal_notes, jobId]);
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
