import { Router } from "express";
import { requireAuth } from "../middleware/session.js";
import { v4 as uuid } from "uuid";
import { createJob, listJobs, getJob, updateJobStatus } from "../services/jobs/jobs.repo.js";

import { putRun, updateRun, findRunByJobLatest } from "../services/analyze/run_store.js";
import { loadFixtureJson } from "../util/fixtures.js";
import { badRequest, notFound } from "../util/http.js";

export const jobsRouter = Router();

/**
 * POST /api/v1/jobs
 * Create a job (customer order/work item)
 */
jobsRouter.post("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const body = req.body ?? {};
  const serviceType = String(body.serviceType || "");
  const platform = String(body.platform || "");
  if (!serviceType || !platform) return badRequest(res, "serviceType and platform are required.");

  const job = await createJob({
    user_id: userId,
    service_type: serviceType,
    platform,
    engine_family: body.engineFamily ? String(body.engineFamily) : null,
    vehicle: body.vehicle ? String(body.vehicle) : null,
    ecu: body.ecu ? String(body.ecu) : null,
    notes: body.notes ? String(body.notes) : null
  });

  return res.status(201).json({ job });
});

/**
 * GET /api/v1/jobs
 * List jobs for current user
 */
jobsRouter.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const jobs = await listJobs(userId);
  return res.json({ jobs });
});

/**
 * GET /api/v1/jobs/:jobId
 */
jobsRouter.get("/:jobId", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const job = await getJob(userId, req.params.jobId);
  if (!job) return notFound(res, "Job not found.");
  return res.json({ job });
});



/**
 * POST /api/v1/jobs/:jobId/analyze
 * MVP stub: creates an async run, then loads fixtures.
 */
jobsRouter.post("/:jobId/analyze", requireAuth, async (req, res) => {
  const { jobId } = req.params;
  const { logUploadIds } = req.body ?? {};

  if (!Array.isArray(logUploadIds) || logUploadIds.length === 0) {
    return badRequest(res, "No logUploadIds provided.", { field: "logUploadIds" });
  }

  await updateJobStatus(req.user!.id, jobId, "ANALYZING");

  const runId = uuid();
  const startedAt = new Date().toISOString();

  putRun({
    runId,
    jobId,
    status: "QUEUED",
    progress: { pct: 0, stage: "UPLOAD_VERIFIED" },
    startedAt,
    finishedAt: null,
    errors: [],
    validation: null,
    findings: null,
    diffsets: []
  });

  setTimeout(() => {
    updateRun(runId, { status: "RUNNING", progress: { pct: 45, stage: "VALIDATING" } });
  }, 250);

  setTimeout(() => {
    const validation = loadFixtureJson("validation.pass.gm_ls.json");
    const findings = loadFixtureJson("findings.gm_ls.sample.json");

    updateRun(runId, {
      status: "SUCCEEDED",
      progress: { pct: 100, stage: "REPORTING" },
      finishedAt: new Date().toISOString(),
      validation,
      findings
    });
  }, 700);

  return res.status(202).json({ runId, status: "QUEUED" });
});

/**
 * GET /api/v1/jobs/:jobId/validation?runId=...
 * If runId omitted, returns latest run for that job (MVP convenience).
 */
jobsRouter.get("/:jobId/validation", requireAuth, (req, res) => {
  const { jobId } = req.params;
  const runId = typeof req.query.runId === "string" ? req.query.runId : null;

  const run = runId ? findRunByJobLatest(jobId, runId) : findRunByJobLatest(jobId);
  if (!run) return notFound(res, "Job or run not found.");

  return res.json(run.validation);
});

/**
 * GET /api/v1/jobs/:jobId/findings?runId=...
 * If runId omitted, returns latest run for that job (MVP convenience).
 */
jobsRouter.get("/:jobId/findings", requireAuth, (req, res) => {
  const { jobId } = req.params;
  const runId = typeof req.query.runId === "string" ? req.query.runId : null;

  const run = runId ? findRunByJobLatest(jobId, runId) : findRunByJobLatest(jobId);
  if (!run) return notFound(res, "Job or run not found.");

  return res.json(run.findings);
});
