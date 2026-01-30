import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/session.js";
import { storeBuffer } from "../services/uploads/storage.js";
import { createUpload, listUploadsForJob, attachUploadsToJob } from "../services/uploads/uploads.repo.js";
import { badRequest } from "../util/http.js";

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

/**
 * POST /api/v1/uploads
 * multipart/form-data: file, jobId?, kind?
 */
uploadsRouter.post("/", requireAuth, upload.single("file"), async (req, res) => {
  const userId = req.user!.id;
  const jobId = req.body?.jobId ? String(req.body.jobId) : null;
  const kind = req.body?.kind ? String(req.body.kind) : "LOG";

  if (!req.file) return badRequest(res, "Missing file.");

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
});

/**
 * GET /api/v1/uploads/jobs/:jobId
 */
uploadsRouter.get("/jobs/:jobId", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { jobId } = req.params;
  const uploads = await listUploadsForJob(userId, jobId);
  return res.json({ uploads });
});

/**
 * POST /api/v1/uploads/jobs/:jobId/attach
 * { uploadIds: [] }
 */
uploadsRouter.post("/jobs/:jobId/attach", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { jobId } = req.params;
  const uploadIds = req.body?.uploadIds;
  if (!Array.isArray(uploadIds) || uploadIds.length === 0) return badRequest(res, "uploadIds required.");
  await attachUploadsToJob(userId, jobId, uploadIds.map(String));
  return res.json({ ok: true });
});
