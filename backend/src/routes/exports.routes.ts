import { Router } from "express";
import type { Response } from "express";
import { requireAuth } from "../middleware/session.js";
import { getBrandProfile } from "../services/brand/brand_profile.js";
import { renderSummaryText } from "../services/render/summary.renderer.js";
import { exportCsv } from "../services/render/csv.exporter.js";
import { findDiffSetById, type DiffSetRecord } from "../services/analyze/run_store.js";
import { badRequest, notFound, forbidden, wrap } from "../util/http.js";

export const exportsRouter = Router();

/**
 * The owner-release gate, enforced on the way out.
 *
 * A diffset is a proposed calibration change. Nothing leaves this system for a
 * customer until an owner has explicitly released it — see
 * POST /api/v1/diffsets/:diffSetId/release. Both export paths go through here
 * so a new export format cannot accidentally bypass the gate.
 */
function assertReleased(res: Response, diff: DiffSetRecord): boolean {
  if (diff.releaseStatus === "RELEASED") return true;

  forbidden(
    res,
    "This change list has not been released by Down Dirty 84 and cannot be exported yet.",
    { releaseStatus: diff.releaseStatus }
  );
  return false;
}

/**
 * POST /api/v1/diffsets/:diffSetId/export/summary
 */
exportsRouter.post("/diffsets/:diffSetId/export/summary", requireAuth, wrap(async (req, res) => {
  const diff = await findDiffSetById(req.params.diffSetId, req.user!.id);
  if (!diff) return notFound(res, "DiffSet not found.");
  if (!assertReleased(res, diff)) return;

  const brand = getBrandProfile();
  const text = renderSummaryText({ ...diff.payload, diffSetId: diff.diffSetId }, { brand });

  return res.json({ text, releasedAt: diff.releasedAt });
}));

/**
 * POST /api/v1/diffsets/:diffSetId/export/csv
 */
exportsRouter.post("/diffsets/:diffSetId/export/csv", requireAuth, wrap(async (req, res) => {
  const diff = await findDiffSetById(req.params.diffSetId, req.user!.id);
  if (!diff) return notFound(res, "DiffSet not found.");
  if (!assertReleased(res, diff)) return;

  const includeSuggested = Boolean(req.body?.includeSuggested ?? false);
  const minConfidence =
    typeof req.body?.minConfidence === "number" ? req.body.minConfidence : 0.45;

  if (!Number.isFinite(minConfidence) || minConfidence < 0 || minConfidence > 1) {
    return badRequest(res, "minConfidence must be between 0 and 1.", { minConfidence });
  }

  // The stored payload predates the database-assigned id, so stamp it on for
  // the export — otherwise every row's diffSetId column ships empty and the
  // change list cannot be traced back to the record it came from.
  const csv = exportCsv(
    { ...diff.payload, diffSetId: diff.diffSetId },
    { includeSuggested, minConfidence }
  );

  const fileName = `DownDirty84_Job_${String(diff.jobId ?? "").slice(0, 8)}_Rev_1_ChangeList.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
  return res.status(200).send(csv);
}));
