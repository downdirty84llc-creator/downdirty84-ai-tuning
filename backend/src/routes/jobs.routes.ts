import { Router } from "express";
import { requireAuth } from "../middleware/session.js";
import { v4 as uuid } from "uuid";
import { createJob, listJobs, getJob, updateJobStatus } from "../services/jobs/jobs.repo.js";

import { createRun, updateRun, findRunForJob } from "../services/analyze/run_store.js";
import { getUploadsByIds } from "../services/uploads/uploads.repo.js";
import { readObject } from "../services/uploads/storage.js";
import { analyzeUploads } from "../services/analyze/pipeline.js";
import {
  normaliseFuel,
  normaliseInduction,
  selectProfile,
  type ProfileKey
} from "../config/thresholds.profiles.js";
import { badRequest, notFound, wrap } from "../util/http.js";

export const jobsRouter = Router();

/**
 * POST /api/v1/jobs
 * Create a job (customer order/work item)
 */
jobsRouter.post("/", requireAuth, wrap(async (req, res) => {
  const userId = req.user!.id;
  const body = req.body ?? {};
  const serviceType = String(body.serviceType || "");
  const platform = String(body.platform || "");
  if (!serviceType || !platform) return badRequest(res, "serviceType and platform are required.");

  // Normalised rather than stored raw, and left null when unrecognised. A
  // value the profile selector cannot match is worse than no value: it looks
  // like the question was answered.
  const fuel = normaliseFuel(body.fuel);
  const induction = normaliseInduction(body.induction);

  const job = await createJob({
    user_id: userId,
    service_type: serviceType,
    platform,
    engine_family: body.engineFamily ? String(body.engineFamily) : null,
    vehicle: body.vehicle ? String(body.vehicle) : null,
    ecu: body.ecu ? String(body.ecu) : null,
    notes: body.notes ? String(body.notes) : null,
    fuel,
    induction
  });

  return res.status(201).json({ job });
}));

/**
 * GET /api/v1/jobs
 * List jobs for current user
 */
jobsRouter.get("/", requireAuth, wrap(async (req, res) => {
  const userId = req.user!.id;
  const jobs = await listJobs(userId);
  return res.json({ jobs });
}));

/**
 * GET /api/v1/jobs/:jobId
 */
jobsRouter.get("/:jobId", requireAuth, wrap(async (req, res) => {
  const userId = req.user!.id;
  const job = await getJob(userId, req.params.jobId);
  if (!job) return notFound(res, "Job not found.");
  return res.json({ job });
}));



/**
 * POST /api/v1/jobs/:jobId/analyze
 *
 * Creates a run, then parses, validates and rules-checks the customer's actual
 * uploaded log. Returns 202 immediately; poll GET /api/v1/runs/:runId.
 */
jobsRouter.post("/:jobId/analyze", requireAuth, wrap(async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user!.id;
  const { logUploadIds } = req.body ?? {};

  if (!Array.isArray(logUploadIds) || logUploadIds.length === 0) {
    return badRequest(res, "No logUploadIds provided.", { field: "logUploadIds" });
  }

  // createRun only inserts when the job belongs to this user, so a null here
  // means "not yours or not there" — reported the same way either way.
  const run = await createRun({ jobId, userId });
  if (!run) return notFound(res, "Job not found.");

  await updateJobStatus(userId, jobId, "ANALYZING");

  // Kicked off in the background; the client polls GET /runs/:runId. Errors are
  // written to the run rather than thrown, so a failed analysis is a reportable
  // state and not a lost request.
  // The profile is worked out here, from the job, and handed down. Doing it
  // inside the pipeline would mean the analysis re-reading the database to
  // discover what it is judging, and a null there would be silent.
  const job = await getJob(userId, jobId);
  const profile = job ? selectProfile(job) : null;

  void executeAnalysis(run.runId, userId, logUploadIds.map(String), profile).catch(async (err) => {
    console.error("[DD84] analysis crashed", run.runId, err);
    await updateRun(run.runId, {
      status: "FAILED",
      progress: { pct: 100, stage: "FAILED" },
      finishedAt: new Date().toISOString(),
      errors: [{ code: "ANALYSIS_CRASHED", message: String((err as Error)?.message ?? err) }]
    }).catch(() => undefined);
  });

  return res.status(202).json({ runId: run.runId, status: run.status });
}));

/**
 * The analysis itself: read the customer's uploads, parse, validate, run rules,
 * persist. Every exit path leaves the run in a terminal state with a reason,
 * because a run stuck in RUNNING is indistinguishable from a hung server.
 */
async function executeAnalysis(
  runId: string,
  userId: string,
  uploadIds: string[],
  profile: ProfileKey | null
): Promise<void> {
  await updateRun(runId, { status: "RUNNING", progress: { pct: 10, stage: "READING_UPLOADS" } });

  const rows = await getUploadsByIds(userId, uploadIds);
  if (rows.length === 0) {
    await updateRun(runId, {
      status: "FAILED",
      progress: { pct: 100, stage: "FAILED" },
      finishedAt: new Date().toISOString(),
      errors: [{ code: "UPLOADS_NOT_FOUND", message: "None of the supplied uploads were found for this account." }]
    });
    return;
  }

  const files: Array<{ uploadId: string; filename: string; content: Buffer }> = [];
  const unreadable: string[] = [];
  for (const row of rows) {
    try {
      const content = await readObject({ provider: row.storage_provider as "S3" | "LOCAL", key: row.storage_key });
      files.push({ uploadId: row.id, filename: row.filename, content });
    } catch (err) {
      unreadable.push(`${row.filename}: ${String((err as Error)?.message ?? err)}`);
    }
  }

  if (files.length === 0) {
    await updateRun(runId, {
      status: "FAILED",
      progress: { pct: 100, stage: "FAILED" },
      finishedAt: new Date().toISOString(),
      errors: [{ code: "UPLOADS_UNREADABLE", message: unreadable.join("; ") }]
    });
    return;
  }

  await updateRun(runId, { progress: { pct: 45, stage: "VALIDATING" } });

  const { outcome, usedUploadId, skipped } = analyzeUploads(files, runId, profile);

  if (!outcome.ok) {
    await updateRun(runId, {
      status: "FAILED",
      progress: { pct: 100, stage: "FAILED" },
      finishedAt: new Date().toISOString(),
      validation: outcome.validation,
      errors: [
        { code: outcome.error.code, message: outcome.error.message, details: { stage: outcome.stage, skipped } }
      ]
    });
    return;
  }

  await updateRun(runId, { progress: { pct: 80, stage: "REPORTING" } });

  await updateRun(runId, {
    status: "SUCCEEDED",
    progress: { pct: 100, stage: "REPORTING" },
    finishedAt: new Date().toISOString(),
    validation: {
      ...outcome.validation,
      analyzedUploadId: usedUploadId,
      skippedUploads: skipped,
      unreadableUploads: unreadable,
      thresholdSource: outcome.thresholdSource,
      thresholdProfile: outcome.thresholdProfile
    },
    findings: {
      summary: outcome.rules.summary,
      items: outcome.rules.findings,
      chartSpecs: [],
      diffgen: outcome.diffgen,
      thresholdSource: outcome.rules.thresholdSource,
      thresholdProfile: outcome.thresholdProfile
    }
  });
}

/**
 * GET /api/v1/jobs/:jobId/validation?runId=...
 * If runId omitted, returns latest run for that job (MVP convenience).
 */
jobsRouter.get("/:jobId/validation", requireAuth, wrap(async (req, res) => {
  const { jobId } = req.params;
  const runId = typeof req.query.runId === "string" ? req.query.runId : null;

  const run = await findRunForJob(jobId, req.user!.id, runId);
  if (!run) return notFound(res, "Job or run not found.");

  return res.json(run.validation);
}));

/**
 * GET /api/v1/jobs/:jobId/findings?runId=...
 * If runId omitted, returns latest run for that job (MVP convenience).
 */
jobsRouter.get("/:jobId/findings", requireAuth, wrap(async (req, res) => {
  const { jobId } = req.params;
  const runId = typeof req.query.runId === "string" ? req.query.runId : null;

  const run = await findRunForJob(jobId, req.user!.id, runId);
  if (!run) return notFound(res, "Job or run not found.");

  return res.json(run.findings);
}));
