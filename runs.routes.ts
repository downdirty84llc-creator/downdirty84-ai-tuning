import { Router } from "express";
import { requireAuth } from "../middleware/session.js";
import { getRun } from "../services/analyze/run_store.js";
import { notFound } from "../util/http.js";

export const runsRouter = Router();

runsRouter.get("/:runId", requireAuth, (req, res) => {
  const run = getRun(req.params.runId);
  if (!run) return notFound(res, "Run not found.");

  return res.json({
    runId: run.runId,
    status: run.status,
    progress: run.progress,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    errors: run.errors ?? []
  });
});
