import { Router } from "express";
import { requireAuth } from "./session.js";
import { v4 as uuid } from "uuid";
import { createJob, listJobs, getJob, updateJobStatus } from "./jobs.repo.js";
import { listUploadsForJob } from "./uploads.repo.js";
import { putRun, updateRun, findRunByJobLatest, listRunsByJob } from "./run_store.js";
import { loadFixtureJson } from "./fixtures.js";
import { badRequest, notFound } from "./http.js";
export const jobsRouter = Router();
/**
 * POST /api/v1/jobs
 * Create a job (customer order/work item)
 */
jobsRouter.post("/", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const body = req.body ?? {};
    const serviceType = String(body.serviceType || "");
    const platform = String(body.platform || "");
    if (!serviceType || !platform)
        return badRequest(res, "serviceType and platform are required.");
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
    const userId = req.user.id;
    const jobs = await listJobs(userId);
    return res.json({ jobs });
});
/**
 * GET /api/v1/jobs/:jobId
 */
jobsRouter.get("/:jobId", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const job = await getJob(userId, String(req.params.jobId));
    if (!job)
        return notFound(res, "Job not found.");
    return res.json({ job });
});
/**
 * GET /api/v1/jobs/:jobId/runs/latest
 */
jobsRouter.get("/:jobId/runs/latest", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const jobId = String(req.params.jobId);
    const job = await getJob(userId, jobId);
    if (!job)
        return notFound(res, "Job not found.");
    const run = await findRunByJobLatest(jobId);
    if (!run)
        return notFound(res, "Run not found.");
    return res.json({
        runId: run.runId,
        status: run.status,
        progress: run.progress,
        startedAt: run.startedAt ?? null,
        finishedAt: run.finishedAt ?? null,
        errors: run.errors ?? []
    });
});
/**
 * GET /api/v1/jobs/:jobId/runs
 */
jobsRouter.get("/:jobId/runs", requireAuth, async (req, res) => {
    const userId = req.user.id;
    const jobId = String(req.params.jobId);
    const job = await getJob(userId, jobId);
    if (!job)
        return notFound(res, "Job not found.");
    const runs = (await listRunsByJob(jobId)).map((run) => ({
        runId: run.runId,
        status: run.status,
        progress: run.progress,
        startedAt: run.startedAt ?? null,
        finishedAt: run.finishedAt ?? null,
        errors: run.errors ?? []
    }));
    return res.json({ runs });
});
/**
 * POST /api/v1/jobs/:jobId/analyze
 * MVP stub: creates an async run, then loads fixtures.
 */
jobsRouter.post("/:jobId/analyze", requireAuth, async (req, res) => {
    const jobId = String(req.params.jobId);
    const { logUploadIds } = req.body ?? {};
    const userId = req.user.id;
    const job = await getJob(userId, jobId);
    if (!job)
        return notFound(res, "Job or run not found.");
    if (!Array.isArray(logUploadIds) || logUploadIds.length === 0) {
        return badRequest(res, "No logUploadIds provided.", { field: "logUploadIds" });
    }
    const normalizedLogUploadIds = Array.from(new Set(logUploadIds.map((id) => String(id)).filter(Boolean)));
    if (normalizedLogUploadIds.length === 0) {
        return badRequest(res, "No valid logUploadIds provided.", { field: "logUploadIds" });
    }
    const uploadsForJob = await listUploadsForJob(userId, jobId);
    const uploadsById = new Map(uploadsForJob.map((upload) => [upload.id, upload]));
    const isAllLogUploads = normalizedLogUploadIds.every((uploadId) => uploadsById.get(uploadId)?.kind === "LOG");
    if (!isAllLogUploads) {
        return badRequest(res, "logUploadIds must be LOG uploads for this job.", {
            field: "logUploadIds"
        });
    }
    await updateJobStatus(userId, jobId, "ANALYZING");
    const runId = uuid();
    const startedAt = new Date().toISOString();
    await putRun({
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
    setTimeout(async () => {
        await updateRun(runId, { status: "RUNNING", progress: { pct: 45, stage: "VALIDATING" } });
    }, 250);
    setTimeout(async () => {
        const validation = loadFixtureJson("validation.pass.gm_ls.json");
        const findings = loadFixtureJson("findings.gm_ls.sample.json");
        await updateRun(runId, {
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
jobsRouter.get("/:jobId/validation", requireAuth, async (req, res) => {
    const jobId = String(req.params.jobId);
    const runId = typeof req.query.runId === "string" ? req.query.runId : null;
    const job = await getJob(req.user.id, jobId);
    if (!job)
        return notFound(res, "Job or run not found.");
    const run = runId ? await findRunByJobLatest(jobId, runId) : await findRunByJobLatest(jobId);
    if (!run)
        return notFound(res, "Job or run not found.");
    return res.json(run.validation);
});
/**
 * GET /api/v1/jobs/:jobId/findings?runId=...
 * If runId omitted, returns latest run for that job (MVP convenience).
 */
jobsRouter.get("/:jobId/findings", requireAuth, async (req, res) => {
    const jobId = String(req.params.jobId);
    const runId = typeof req.query.runId === "string" ? req.query.runId : null;
    const job = await getJob(req.user.id, jobId);
    if (!job)
        return notFound(res, "Job or run not found.");
    const run = runId ? await findRunByJobLatest(jobId, runId) : await findRunByJobLatest(jobId);
    if (!run)
        return notFound(res, "Job or run not found.");
    return res.json(run.findings);
});
