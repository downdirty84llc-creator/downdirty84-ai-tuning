import { Router } from "express";
import { requireAuth } from "./session.js";
import { getRun } from "./run_store.js";
import { getJob } from "./jobs.repo.js";
import { notFound } from "./http.js";

export const runsRouter = Router();

runsRouter.get("/:runId", requireAuth, async (req, res) => {
  const run = await getRun(String(req.params.runId));
  if (!run) return notFound(res, "Run not found.");

  const job = await getJob(req.user!.id, run.jobId);
  if (!job) return notFound(res, "Run not found.");

  return res.json({
    runId: run.runId,
    status: run.status,
    progress: run.progress,
    startedAt: run.startedAt ?? null,
    finishedAt: run.finishedAt ?? null,
    errors: run.errors ?? []
  });
});
