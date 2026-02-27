import { Router } from "express";
import { requireAuth } from "./session.js";
import { requireAdmin } from "./admin.middleware.js";
import { adminListJobs, adminGetJob, adminUpdateJob } from "./admin.repo.js";
import { listUploadsForJob } from "./uploads.repo.js";
import { notFound, badRequest } from "./http.js";

export const adminRouter = Router();

adminRouter.get("/jobs", requireAuth, requireAdmin, async (_req, res) => {
  const jobs = await adminListJobs();
  return res.json({ jobs });
});

adminRouter.get("/jobs/:jobId", requireAuth, requireAdmin, async (req, res) => {
  const job = await adminGetJob(String(req.params.jobId));
  if (!job) return notFound(res, "Job not found.");
  const uploads = await listUploadsForJob(job.user_id, job.id);
  return res.json({ job, uploads });
});

adminRouter.patch("/jobs/:jobId", requireAuth, requireAdmin, async (req, res) => {
  const patch = req.body || {};
  const status = patch.status ? String(patch.status) : undefined;
  const internal_notes = patch.internal_notes !== undefined ? String(patch.internal_notes) : undefined;

  if (!status && internal_notes === undefined) return badRequest(res, "Nothing to update.");
  await adminUpdateJob(String(req.params.jobId), { status, internal_notes: internal_notes ?? null });
  return res.json({ ok: true });
});
