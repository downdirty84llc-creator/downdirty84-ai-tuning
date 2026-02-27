import { query } from "./db.js";
export async function createJob(input) {
    const r = await query(`
    INSERT INTO jobs (user_id, service_type, platform, engine_family, vehicle, ecu, notes, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    RETURNING *
    `, [
        input.user_id,
        input.service_type,
        input.platform,
        input.engine_family,
        input.vehicle,
        input.ecu,
        input.notes,
        input.status || "NEW"
    ]);
    return r[0];
}
export async function listJobs(userId) {
    return query(`SELECT * FROM jobs WHERE user_id=$1 ORDER BY created_at DESC`, [userId]);
}
export async function getJob(userId, jobId) {
    const r = await query(`SELECT * FROM jobs WHERE user_id=$1 AND id=$2 LIMIT 1`, [userId, jobId]);
    return r[0] || null;
}
export async function updateJobStatus(userId, jobId, status) {
    await query(`UPDATE jobs SET status=$1 WHERE user_id=$2 AND id=$3`, [status, userId, jobId]);
}
