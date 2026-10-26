import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/session.js";
import { storeBuffer } from "../services/uploads/storage.js";
import { createUpload, listUploadsForJob, attachUploadsToJob, getUploadsByIds } from "../services/uploads/uploads.repo.js";
import { getJob } from "../services/jobs/jobs.repo.js";
import { validate as validUuid } from "uuid";
import { badRequest, notFound, wrap } from "../util/http.js";

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

/**
 * POST /api/v1/uploads
 * multipart/form-data: file, jobId?, kind?
 */
uploadsRouter.post("/", requireAuth, upload.single("file"), wrap(async (req, res) => {
  const userId = req.user!.id;
  const jobId = req.body?.jobId ? String(req.body.jobId) : null;
  const kind = req.body?.kind ? String(req.body.kind) : "LOG";

  if (!req.file) return badRequest(res, "Missing file.");
  if (jobId && !validUuid(jobId)) return badRequest(res, "Invalid job ID.");
  if (jobId && !await getJob(userId, jobId)) return notFound(res, "Job not found.");

  const stored = await storeBuffer({
    userId,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    body: req.file.buffer
  });

  const row = await createUpload({
    user_id: userId,
    job_id: jobId,
    kind,
    filename: req.file.originalname,
    mime_type: req.file.mimetype,
    size_bytes: req.file.size,
    storage_provider: stored.provider,
    storage_key: stored.key
  });

  return res.json({ uploadId: row.id, filename: row.filename, sizeBytes: row.size_bytes });
}));

/**
 * GET /api/v1/uploads/jobs/:jobId
 */
uploadsRouter.get("/jobs/:jobId", requireAuth, wrap(async (req, res) => {
  const userId = req.user!.id;
  const { jobId } = req.params;
  if (!validUuid(jobId)) return badRequest(res, "Invalid job ID.");
  if (!await getJob(userId, jobId)) return notFound(res, "Job not found.");
  const uploads = await listUploadsForJob(userId, jobId);
  return res.json({ uploads });
}));

/**
 * POST /api/v1/uploads/jobs/:jobId/attach
 * { uploadIds: [] }
 */
uploadsRouter.post("/jobs/:jobId/attach", requireAuth, wrap(async (req, res) => {
  const userId = req.user!.id;
  const { jobId } = req.params;
  const uploadIds = req.body?.uploadIds;
  if (!validUuid(jobId)) return badRequest(res, "Invalid job ID.");
  if (!await getJob(userId, jobId)) return notFound(res, "Job not found.");
  if (!Array.isArray(uploadIds) || !uploadIds.length || uploadIds.length > 100 || !uploadIds.every(id=>typeof id === 'string' && validUuid(id))) return badRequest(res, "Valid uploadIds required (up to 100).");
  const ids = [...new Set<string>(uploadIds)];
  const rows = await getUploadsByIds(userId, ids);
  if (rows.length !== ids.length || rows.some(row=>row.job_id && row.job_id !== jobId)) return badRequest(res, "Uploads must belong to this account and be unassigned or already attached to this job.");
  await attachUploadsToJob(userId, jobId, ids);
  return res.json({ ok: true });
}));
