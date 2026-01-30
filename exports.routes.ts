import { Router } from "express";
import { requireAuth } from "../middleware/session.js";
import { getBrandProfile } from "../services/brand/brand_profile.js";
import { renderSummaryText } from "../services/render/summary.renderer.js";
import { exportCsv } from "../services/render/csv.exporter.js";
import { findDiffSetById } from "../services/analyze/run_store.js";
import { badRequest, notFound } from "../util/http.js";

export const exportsRouter = Router();

/**
 * POST /api/v1/diffsets/:diffSetId/export/summary
 */
exportsRouter.post("/diffsets/:diffSetId/export/summary", requireAuth, (req, res) => {
  const diffset = findDiffSetById(req.params.diffSetId);
  if (!diffset) return notFound(res, "DiffSet not found.");

  const brand = getBrandProfile();
  const text = renderSummaryText(diffset, { brand });

  return res.json({ text });
});

/**
 * POST /api/v1/diffsets/:diffSetId/export/csv
 */
exportsRouter.post("/diffsets/:diffSetId/export/csv", requireAuth, (req, res) => {
  const diffset = findDiffSetById(req.params.diffSetId);
  if (!diffset) return notFound(res, "DiffSet not found.");

  const includeSuggested = Boolean(req.body?.includeSuggested ?? false);
  const minConfidence =
    typeof req.body?.minConfidence === "number" ? req.body.minConfidence : 0.45;

  if (minConfidence < 0 || minConfidence > 1) {
    return badRequest(res, "minConfidence must be between 0 and 1.", { minConfidence });
  }

  const csv = exportCsv(diffset, {
    includeSuggested,
    minConfidence
  });

  const fileName = `DownDirty84_Job_${String(diffset.jobId ?? "").slice(0, 8)}_Rev_1_ChangeList.csv`;
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  return res.status(200).send(csv);
});
