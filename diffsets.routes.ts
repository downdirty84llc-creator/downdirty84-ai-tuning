import { Router } from "express";
import { requireAuth } from "./session.js";
import { v4 as uuid } from "uuid";
import { getRun, updateRun, findDiffSetById, findRunByJobLatest } from "./run_store.js";
import { getJob } from "./jobs.repo.js";
import { enforceMvpDiffAllowlist } from "./mvp_enforcement.js";
import { loadFixtureJson } from "./fixtures.js";
import { badRequest, notFound } from "./http.js";

export const diffsetsRouter = Router();

/**
 * POST /api/v1/jobs/:jobId/diffsets/generate
 * MVP stub: uses fixture diffset + enforces allowlist.
 */
diffsetsRouter.post("/jobs/:jobId/diffsets/generate", requireAuth, async (req, res) => {
  const jobId = String(req.params.jobId);
  const { runId, generator } = req.body ?? {};

  const job = await getJob(req.user!.id, jobId);
  if (!job) return notFound(res, "Job or run not found.");

  if (typeof runId !== "string" || !runId) {
    return badRequest(res, "runId is required.", { field: "runId" });
  }
  if (generator !== "GM_LS_MAF_V1") {
    return badRequest(res, "Unsupported generator.", { generator });
  }

  const run = await getRun(runId);
  if (!run || run.jobId !== jobId) return notFound(res, "Job or run not found.");
  if (run.status !== "SUCCEEDED") return badRequest(res, "Run not completed.", { runStatus: run.status });

  const diffset = loadFixtureJson("diffset.gm_ls_maf.sample.json");
  diffset.diffSetId = uuid();
  diffset.jobId = jobId;
  diffset.runId = runId;
  diffset.createdAt = new Date().toISOString();

  // HARD MVP ENFORCEMENT
  enforceMvpDiffAllowlist(diffset);

  const diffsets = run.diffsets ?? [];
  diffsets.push(diffset);
  await updateRun(runId, { diffsets });

  return res.json(diffset);
});

/**
 * GET /api/v1/jobs/:jobId/diffsets?runId=...
 * If runId omitted, uses latest run for that job.
 */
diffsetsRouter.get("/jobs/:jobId/diffsets", requireAuth, async (req, res) => {
  const jobId = String(req.params.jobId);
  const runId = typeof req.query.runId === "string" ? req.query.runId : null;

  const job = await getJob(req.user!.id, jobId);
  if (!job) return notFound(res, "Job or run not found.");

  const run = runId ? await getRun(runId) : await findRunByJobLatest(jobId);
  if (!run || run.jobId !== jobId) return notFound(res, "Job or run not found.");

  const out = (run.diffsets ?? []).map((d: any) => {
    const counts = { total: 0, approved: 0, suggested: 0, rejected: 0 };
    for (const it of d.items || []) {
      counts.total++;
      if (it.status === "APPROVED" || it.status === "APPROVED_OVERRIDE") counts.approved++;
      else if (it.status === "SUGGESTED") counts.suggested++;
      else if (it.status === "REJECTED") counts.rejected++;
    }
    return {
      diffSetId: d.diffSetId,
      runId: d.runId,
      name: d.name,
      source: d.source ?? null,
      createdAt: d.createdAt ?? null,
      itemCounts: counts
    };
  });

  return res.json(out);
});

/**
 * GET /api/v1/diffsets/:diffSetId
 */
diffsetsRouter.get("/diffsets/:diffSetId", requireAuth, async (req, res) => {
  const diff = await findDiffSetById(String(req.params.diffSetId));
  if (!diff) return notFound(res, "DiffSet not found.");

  const job = await getJob(req.user!.id, String(diff.jobId || ""));
  if (!job) return notFound(res, "DiffSet not found.");

  return res.json(diff);
});
