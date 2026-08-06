import { Router } from "express";
import { requireAuth } from "../middleware/session.js";
import { v4 as uuid } from "uuid";
import { createJob, listJobs, getJob, updateJobStatus } from "../services/jobs/jobs.repo.js";

import { createRun, updateRun, findRunForJob } from "../services/analyze/run_store.js";
import { loadFixtureJson } from "../util/fixtures.js";
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
 * MVP stub: creates an async run, then loads fixtures.
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

  // MVP stub: the real analysis pipeline is not built yet, so the run walks
  // through its states on a timer and serves fixture output.
  setTimeout(() => {
    void updateRun(run.runId, {
      status: "RUNNING",
      progress: { pct: 45, stage: "VALIDATING" }
    }).catch((err) => console.error("[DD84] run update failed", run.runId, err));
  }, 250);

  setTimeout(() => {
    void (async () => {
      try {
        const validation = loadFixtureJson("validation.pass.gm_ls.json");
        const findings = loadFixtureJson("findings.gm_ls.sample.json");
        await updateRun(run.runId, {
          status: "SUCCEEDED",
          progress: { pct: 100, stage: "REPORTING" },
          finishedAt: new Date().toISOString(),
          validation,
          findings
        });
      } catch (err) {
        console.error("[DD84] analysis failed", run.runId, err);
        await updateRun(run.runId, {
          status: "FAILED",
          progress: { pct: 100, stage: "FAILED" },
          finishedAt: new Date().toISOString(),
          errors: [{ code: "ANALYSIS_FAILED", message: String((err as Error)?.message ?? err) }]
        }).catch(() => undefined);
      }
    })();
  }, 700);

  return res.status(202).json({ runId: run.runId, status: run.status });
}));

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
