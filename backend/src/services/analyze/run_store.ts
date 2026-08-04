import { query } from "../../db.js";

export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";
export type ReleaseStatus = "DRAFT" | "OWNER_REVIEW" | "RELEASED" | "REJECTED";

export type RunRecord = {
  runId: string;
  jobId: string;
  userId: string;
  status: RunStatus;
  progress: { pct: number; stage: string };
  startedAt: string;
  finishedAt: string | null;
  errors: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
  validation: any | null;
  findings: any | null;
};

export type DiffSetRecord = {
  diffSetId: string;
  runId: string;
  jobId: string;
  userId: string;
  name: string | null;
  source: string | null;
  generator: string;
  payload: any;
  releaseStatus: ReleaseStatus;
  releasedBy: string | null;
  releasedAt: string | null;
  releaseNote: string | null;
  createdAt: string;
};

type RunRow = {
  id: string;
  job_id: string;
  user_id: string;
  status: RunStatus;
  progress_pct: number;
  progress_stage: string;
  errors_json: any;
  validation_json: any;
  findings_json: any;
  started_at: string;
  finished_at: string | null;
};

type DiffSetRow = {
  id: string;
  run_id: string;
  job_id: string;
  user_id: string;
  name: string | null;
  source: string | null;
  generator: string;
  payload_json: any;
  release_status: ReleaseStatus;
  released_by: string | null;
  released_at: string | null;
  release_note: string | null;
  created_at: string;
};

function toRun(r: RunRow): RunRecord {
  return {
    runId: r.id,
    jobId: r.job_id,
    userId: r.user_id,
    status: r.status,
    progress: { pct: r.progress_pct, stage: r.progress_stage },
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    errors: r.errors_json ?? [],
    validation: r.validation_json,
    findings: r.findings_json
  };
}

function toDiffSet(r: DiffSetRow): DiffSetRecord {
  return {
    diffSetId: r.id,
    runId: r.run_id,
    jobId: r.job_id,
    userId: r.user_id,
    name: r.name,
    source: r.source,
    generator: r.generator,
    payload: r.payload_json,
    releaseStatus: r.release_status,
    releasedBy: r.released_by,
    releasedAt: r.released_at,
    releaseNote: r.release_note,
    createdAt: r.created_at
  };
}

/* ------------------------------------------------------------------ runs -- */

/**
 * Creates a run, but only for a job the user actually owns. The ownership
 * check is part of the INSERT so a caller cannot forget it.
 */
export async function createRun(input: {
  jobId: string;
  userId: string;
  status?: RunStatus;
  progress?: { pct: number; stage: string };
}): Promise<RunRecord | null> {
  const rows = await query<RunRow>(
    `
    INSERT INTO runs (job_id, user_id, status, progress_pct, progress_stage)
    SELECT $1, $2, $3, $4, $5
    WHERE EXISTS (SELECT 1 FROM jobs WHERE id = $1 AND user_id = $2)
    RETURNING *
    `,
    [
      input.jobId,
      input.userId,
      input.status ?? "QUEUED",
      input.progress?.pct ?? 0,
      input.progress?.stage ?? "UPLOAD_VERIFIED"
    ]
  );
  return rows[0] ? toRun(rows[0]) : null;
}

/** Every read is scoped by user_id. There is no unscoped getter, by design. */
export async function getRun(runId: string, userId: string): Promise<RunRecord | null> {
  const rows = await query<RunRow>(`SELECT * FROM runs WHERE id = $1 AND user_id = $2 LIMIT 1`, [
    runId,
    userId
  ]);
  return rows[0] ? toRun(rows[0]) : null;
}

export async function updateRun(
  runId: string,
  patch: {
    status?: RunStatus;
    progress?: { pct: number; stage: string };
    finishedAt?: string | null;
    errors?: unknown[];
    validation?: unknown;
    findings?: unknown;
  }
): Promise<void> {
  const sets: string[] = [];
  const params: any[] = [];

  const push = (frag: string, value: any) => {
    params.push(value);
    sets.push(frag.replace("?", `$${params.length}`));
  };

  if (patch.status !== undefined) push("status = ?", patch.status);
  if (patch.progress !== undefined) {
    push("progress_pct = ?", patch.progress.pct);
    push("progress_stage = ?", patch.progress.stage);
  }
  if (patch.finishedAt !== undefined) push("finished_at = ?", patch.finishedAt);
  if (patch.errors !== undefined) push("errors_json = ?::jsonb", JSON.stringify(patch.errors));
  if (patch.validation !== undefined)
    push("validation_json = ?::jsonb", JSON.stringify(patch.validation));
  if (patch.findings !== undefined)
    push("findings_json = ?::jsonb", JSON.stringify(patch.findings));

  if (sets.length === 0) return;

  params.push(runId);
  await query(`UPDATE runs SET ${sets.join(", ")} WHERE id = $${params.length}`, params);
}

/**
 * Latest run for a job. When runId is supplied it must belong to both the job
 * and the user, so a known run id from another account resolves to null.
 */
export async function findRunForJob(
  jobId: string,
  userId: string,
  runId?: string | null
): Promise<RunRecord | null> {
  if (runId) {
    const rows = await query<RunRow>(
      `SELECT * FROM runs WHERE id = $1 AND job_id = $2 AND user_id = $3 LIMIT 1`,
      [runId, jobId, userId]
    );
    return rows[0] ? toRun(rows[0]) : null;
  }
  const rows = await query<RunRow>(
    `SELECT * FROM runs WHERE job_id = $1 AND user_id = $2 ORDER BY started_at DESC LIMIT 1`,
    [jobId, userId]
  );
  return rows[0] ? toRun(rows[0]) : null;
}

/* -------------------------------------------------------------- diffsets -- */

export async function createDiffSet(input: {
  runId: string;
  jobId: string;
  userId: string;
  name: string | null;
  source: string | null;
  generator: string;
  payload: any;
}): Promise<DiffSetRecord> {
  const rows = await query<DiffSetRow>(
    `
    INSERT INTO diffsets (run_id, job_id, user_id, name, source, generator, payload_json)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
    RETURNING *
    `,
    [
      input.runId,
      input.jobId,
      input.userId,
      input.name,
      input.source,
      input.generator,
      JSON.stringify(input.payload)
    ]
  );
  return toDiffSet(rows[0]);
}

/**
 * Owner-scoped lookup. `asAdmin` lifts the scope for the release flow, and is
 * only ever passed from a route already behind requireAdmin.
 */
export async function findDiffSetById(
  diffSetId: string,
  userId: string,
  opts: { asAdmin?: boolean } = {}
): Promise<DiffSetRecord | null> {
  const rows = opts.asAdmin
    ? await query<DiffSetRow>(`SELECT * FROM diffsets WHERE id = $1 LIMIT 1`, [diffSetId])
    : await query<DiffSetRow>(`SELECT * FROM diffsets WHERE id = $1 AND user_id = $2 LIMIT 1`, [
        diffSetId,
        userId
      ]);
  return rows[0] ? toDiffSet(rows[0]) : null;
}

export async function listDiffSetsForRun(runId: string, userId: string): Promise<DiffSetRecord[]> {
  const rows = await query<DiffSetRow>(
    `SELECT * FROM diffsets WHERE run_id = $1 AND user_id = $2 ORDER BY created_at ASC`,
    [runId, userId]
  );
  return rows.map(toDiffSet);
}

/**
 * Records an owner release decision. Guarded so a diffset can only move out of
 * DRAFT or OWNER_REVIEW — a replayed call, or one against an already released
 * or rejected diffset, returns null instead of silently re-releasing.
 */
export async function setDiffSetRelease(
  diffSetId: string,
  input: {
    status: Extract<ReleaseStatus, "RELEASED" | "REJECTED">;
    byUserId: string;
    note: string | null;
  }
): Promise<DiffSetRecord | null> {
  const rows = await query<DiffSetRow>(
    `
    UPDATE diffsets
       SET release_status = $2,
           released_by    = $3,
           released_at    = now(),
           release_note   = $4
     WHERE id = $1
       AND release_status IN ('DRAFT', 'OWNER_REVIEW')
    RETURNING *
    `,
    [diffSetId, input.status, input.byUserId, input.note]
  );
  return rows[0] ? toDiffSet(rows[0]) : null;
}
