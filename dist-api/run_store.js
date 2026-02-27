import { query } from "./db.js";
function toRunRecord(row) {
    return {
        runId: row.run_id,
        jobId: row.job_id,
        status: row.status,
        progress: row.progress_json,
        errors: row.errors_json ?? [],
        validation: row.validation_json ?? null,
        findings: row.findings_json ?? null,
        diffsets: row.diffsets_json ?? [],
        startedAt: row.started_at ?? undefined,
        finishedAt: row.finished_at
    };
}
export async function putRun(run) {
    await query(`
    INSERT INTO runs (
      run_id, job_id, status, progress_json, errors_json, validation_json, findings_json, diffsets_json, started_at, finished_at
    )
    VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb,$9,$10)
    `, [
        run.runId,
        run.jobId,
        run.status,
        JSON.stringify(run.progress ?? { pct: 0, stage: "QUEUED" }),
        JSON.stringify(run.errors ?? []),
        run.validation === undefined ? null : JSON.stringify(run.validation),
        run.findings === undefined ? null : JSON.stringify(run.findings),
        JSON.stringify(run.diffsets ?? []),
        run.startedAt ?? null,
        run.finishedAt ?? null
    ]);
}
export async function getRun(runId) {
    const rows = await query(`SELECT * FROM runs WHERE run_id=$1 LIMIT 1`, [runId]);
    if (rows.length === 0)
        return undefined;
    return toRunRecord(rows[0]);
}
export async function updateRun(runId, patch) {
    const current = await getRun(runId);
    if (!current)
        return;
    const next = { ...current, ...patch };
    await query(`
    UPDATE runs
    SET status=$2,
        progress_json=$3::jsonb,
        errors_json=$4::jsonb,
        validation_json=$5::jsonb,
        findings_json=$6::jsonb,
        diffsets_json=$7::jsonb,
        started_at=$8,
        finished_at=$9,
        updated_at=now()
    WHERE run_id=$1
    `, [
        runId,
        next.status,
        JSON.stringify(next.progress ?? { pct: 0, stage: "QUEUED" }),
        JSON.stringify(next.errors ?? []),
        next.validation === undefined ? null : JSON.stringify(next.validation),
        next.findings === undefined ? null : JSON.stringify(next.findings),
        JSON.stringify(next.diffsets ?? []),
        next.startedAt ?? null,
        next.finishedAt ?? null
    ]);
}
export async function findRunByJobLatest(jobId, runId) {
    if (runId) {
        const r = await getRun(runId);
        if (r && r.jobId === jobId)
            return r;
        return undefined;
    }
    const rows = await query(`
    SELECT *
    FROM runs
    WHERE job_id=$1
    ORDER BY started_at DESC NULLS LAST, created_at DESC
    LIMIT 1
    `, [jobId]);
    if (rows.length === 0)
        return undefined;
    return toRunRecord(rows[0]);
}
export async function listRunsByJob(jobId) {
    const rows = await query(`
    SELECT *
    FROM runs
    WHERE job_id=$1
    ORDER BY started_at DESC NULLS LAST, created_at DESC
    `, [jobId]);
    return rows.map(toRunRecord);
}
export async function findDiffSetById(diffSetId) {
    const rows = await query(`SELECT job_id, diffsets_json FROM runs WHERE diffsets_json IS NOT NULL`);
    for (const row of rows) {
        const arr = Array.isArray(row.diffsets_json) ? row.diffsets_json : [];
        const hit = arr.find((d) => d?.diffSetId === diffSetId);
        if (hit) {
            if (!hit.jobId)
                hit.jobId = row.job_id;
            return hit;
        }
    }
    return undefined;
}
