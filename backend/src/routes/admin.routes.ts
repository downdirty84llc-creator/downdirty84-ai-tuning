import { Router } from "express";
import { requireAuth } from "../middleware/session.js";
import { requireAdmin } from "../middleware/admin.js";
import { adminListJobs, adminGetJob, adminUpdateJob } from "../services/admin/admin.repo.js";
import { listUploadsForJob } from "../services/uploads/uploads.repo.js";
import { getReviewQueue, getQueueCounts } from "../services/admin/review_queue.js";
import { notFound, badRequest, wrap } from "../util/http.js";

export const adminRouter = Router();

adminRouter.get("/jobs", requireAuth, requireAdmin, wrap(async (_req, res) => {
  const jobs = await adminListJobs();
  return res.json({ jobs });
}));

adminRouter.get("/jobs/:jobId", requireAuth, requireAdmin, wrap(async (req, res) => {
  const job = await adminGetJob(req.params.jobId);
  if (!job) return notFound(res, "Job not found.");
  const uploads = await listUploadsForJob(job.user_id, job.id);
  return res.json({ job, uploads });
}));

adminRouter.patch("/jobs/:jobId", requireAuth, requireAdmin, wrap(async (req, res) => {
  const patch = req.body || {};
  const status = patch.status ? String(patch.status) : undefined;
  const internal_notes = patch.internal_notes !== undefined ? String(patch.internal_notes) : undefined;

  if (!status && internal_notes === undefined) return badRequest(res, "Nothing to update.");
  await adminUpdateJob(req.params.jobId, { status, internal_notes: internal_notes ?? null });
  return res.json({ ok: true });
}));

/**
 * GET /api/v1/admin/queue
 *
 * Everything waiting on an owner decision, with the whole decision
 * pre-assembled: what changed, by how much, at what confidence, what the
 * safety verdict was, and what deserves a second look.
 *
 * The release itself cannot be automated — a human accepts a calibration
 * before it reaches an engine. Everything around it can be, and this is that.
 */
adminRouter.get("/queue", requireAuth, requireAdmin, wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const [items, counts] = await Promise.all([getReviewQueue(limit), getQueueCounts()]);
  return res.json({ counts, items });
}));

/**
 * GET /api/v1/admin/dashboard
 * Counts only — cheap enough to poll for a badge.
 */
adminRouter.get("/dashboard", requireAuth, requireAdmin, wrap(async (_req, res) => {
  return res.json(await getQueueCounts());
}));
