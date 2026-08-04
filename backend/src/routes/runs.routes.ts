import { Router } from "express";
import { requireAuth } from "../middleware/session.js";
import { getRun } from "../services/analyze/run_store.js";
import { notFound, wrap } from "../util/http.js";

export const runsRouter = Router();

runsRouter.get("/:runId", requireAuth, wrap(async (req, res) => {
  // Scoped to the caller: a run id belonging to another account returns 404,
  // not that account's progress.
  const run = await getRun(req.params.runId, req.user!.id);
  if (!run) return notFound(res, "Run not found.");

  return res.json({
    runId: run.runId,
    status: run.status,
    progress: run.progress,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    errors: run.errors ?? []
  });
}));
