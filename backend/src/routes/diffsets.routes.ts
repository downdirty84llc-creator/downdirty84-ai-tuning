import { Router } from "express";
import { requireAuth } from "../middleware/session.js";
import { requireAdmin } from "../middleware/admin.js";
import {
  createDiffSet,
  findDiffSetById,
  findRunForJob,
  listDiffSetsForRun,
  setDiffSetRelease,
  type DiffSetRecord
} from "../services/analyze/run_store.js";
import { enforceMvpDiffAllowlist } from "../services/diffgen/mvp_enforcement.js";
import { generateMafSuggestions } from "../services/analyze/diffgen/maf.js";
import { parseLog } from "../services/analyze/log/parser.js";
import { getUploadsByIds } from "../services/uploads/uploads.repo.js";
import { readObject } from "../services/uploads/storage.js";
import { resolveThresholds } from "../config/thresholds.js";
import { getDiffSetContext } from "../services/admin/review_queue.js";
import {
  adminRecipients,
  notify,
  reportReadyEmail,
  reviewWaitingEmail
} from "../services/notify/notifications.js";
import { badRequest, notFound, conflict, forbidden, wrap } from "../util/http.js";

export const diffsetsRouter = Router();

function itemCounts(payload: any) {
  const counts = { total: 0, approved: 0, suggested: 0, rejected: 0 };
  for (const it of payload?.items ?? []) {
    counts.total++;
    if (it.status === "APPROVED" || it.status === "APPROVED_OVERRIDE") counts.approved++;
    else if (it.status === "SUGGESTED") counts.suggested++;
    else if (it.status === "REJECTED") counts.rejected++;
  }
  return counts;
}

/** Customer-facing shape. Deliberately omits user_id and released_by. */
function publicDiffSet(d: DiffSetRecord) {
  return {
    ...d.payload,
    diffSetId: d.diffSetId,
    runId: d.runId,
    jobId: d.jobId,
    createdAt: d.createdAt,
    releaseStatus: d.releaseStatus,
    releasedAt: d.releasedAt,
    releaseNote: d.releaseNote
  };
}

/**
 * POST /api/v1/jobs/:jobId/diffsets/generate
 *
 * Re-reads the customer's log and recomputes the MAF suggestions from it, then
 * enforces the MVP allowlist before anything is persisted.
 *
 * A generated diffset lands in OWNER_REVIEW. It is a *proposed* calibration
 * change and is not exportable until an owner releases it.
 */
diffsetsRouter.post("/jobs/:jobId/diffsets/generate", requireAuth, wrap(async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user!.id;
  const { runId, generator } = req.body ?? {};

  if (typeof runId !== "string" || !runId) {
    return badRequest(res, "runId is required.", { field: "runId" });
  }
  if (generator !== "GM_LS_MAF_V1") {
    return badRequest(res, "Unsupported generator.", { generator });
  }

  const run = await findRunForJob(jobId, userId, runId);
  if (!run) return notFound(res, "Job or run not found.");
  if (run.status !== "SUCCEEDED") {
    return badRequest(res, "Run not completed.", { runStatus: run.status });
  }

  // The safety verdict recorded by the run decides whether a calibration
  // change may be proposed at all. Refusing here rather than at export means
  // the unsafe proposal is never written down in the first place.
  const gate = run.findings?.diffgen as { allowed?: boolean; reason?: string } | undefined;
  if (!gate || gate.allowed !== true) {
    return forbidden(
      res,
      "Suggestions cannot be generated for this run.",
      { reason: gate?.reason ?? "The run did not record a safety verdict." }
    );
  }

  // Re-read and re-analyse the log so the suggestions come from the data, not
  // from whatever a previous request happened to persist.
  const rows = await getUploadsByIds(userId, [String(req.body?.uploadId ?? "")]);
  const source = rows[0]
    ? rows[0]
    : (await getUploadsByIds(userId, [String(run.validation?.analyzedUploadId ?? "")]))[0];

  if (!source) {
    return badRequest(res, "The log analysed by this run is no longer available.", {
      hint: "Re-upload the log and run the analysis again."
    });
  }

  let content: Buffer;
  try {
    content = await readObject({
      provider: source.storage_provider as "S3" | "LOCAL",
      key: source.storage_key
    });
  } catch (err) {
    return badRequest(res, "Could not read the log for this run.", {
      reason: String((err as Error)?.message ?? err)
    });
  }

  const parsed = parseLog(content);
  const { thresholds } = resolveThresholds();
  const result = generateMafSuggestions(parsed, thresholds.diffgen);

  if (!result.ok) {
    return badRequest(res, result.reason, { missing: result.missing ?? [] });
  }

  const payload = {
    ...result.diffSet,
    jobId,
    runId,
    createdAt: new Date().toISOString()
  };

  // HARD MVP ENFORCEMENT — runs before anything is persisted, so a diffset
  // touching a non-allowlisted path never reaches the database.
  enforceMvpDiffAllowlist(payload);

  const saved = await createDiffSet({
    runId,
    jobId,
    userId,
    name: payload.name ?? null,
    source: payload.source ?? null,
    generator,
    payload
  });

  // Tell the owner it is waiting. Without this the queue only works if someone
  // remembers to look at it, and the job sits until they do — which is the
  // manual overhead this system exists to remove.
  //
  // After the 201-worthy work is done and before the response, so a failure to
  // notify is logged against this request, but it cannot fail the generation:
  // notify() never throws.
  const context = await getDiffSetContext(saved.diffSetId);
  if (context) {
    for (const admin of adminRecipients()) {
      await notify(
        reviewWaitingEmail({
          to: admin,
          vehicle: context.vehicle,
          customerEmail: context.customerEmail,
          itemCount: context.summary.itemCount,
          largestChangePct: context.summary.largestChangePct,
          lowestConfidence: context.summary.lowestConfidence,
          blockers: context.safety.blockers,
          warnings: context.safety.warnings,
          attention: context.attention,
          diffSetId: saved.diffSetId
        })
      );
    }
  }

  return res.status(201).json(publicDiffSet(saved));
}));

/**
 * GET /api/v1/jobs/:jobId/diffsets?runId=...
 */
diffsetsRouter.get("/jobs/:jobId/diffsets", requireAuth, wrap(async (req, res) => {
  const { jobId } = req.params;
  const userId = req.user!.id;
  const runId = typeof req.query.runId === "string" ? req.query.runId : null;

  const run = await findRunForJob(jobId, userId, runId);
  if (!run) return notFound(res, "Job or run not found.");

  const diffsets = await listDiffSetsForRun(run.runId, userId);

  return res.json(
    diffsets.map((d) => ({
      diffSetId: d.diffSetId,
      runId: d.runId,
      name: d.name,
      source: d.source,
      createdAt: d.createdAt,
      releaseStatus: d.releaseStatus,
      releasedAt: d.releasedAt,
      itemCounts: itemCounts(d.payload)
    }))
  );
}));

/**
 * GET /api/v1/diffsets/:diffSetId
 */
diffsetsRouter.get("/diffsets/:diffSetId", requireAuth, wrap(async (req, res) => {
  const diff = await findDiffSetById(req.params.diffSetId, req.user!.id);
  if (!diff) return notFound(res, "DiffSet not found.");
  return res.json(publicDiffSet(diff));
}));

/**
 * POST /api/v1/diffsets/:diffSetId/release   (admin only)
 * body: { decision: "RELEASE" | "REJECT", note?: string }
 *
 * The owner-release gate. Exports stay blocked until this records a RELEASED
 * decision, so no calibration reaches a customer without a named human
 * accepting it. The decision is immutable once made.
 */
diffsetsRouter.post("/diffsets/:diffSetId/release", requireAuth, requireAdmin, wrap(async (req, res) => {
  const decision = String(req.body?.decision ?? "").toUpperCase();
  if (decision !== "RELEASE" && decision !== "REJECT") {
    return badRequest(res, 'decision must be "RELEASE" or "REJECT".', { field: "decision" });
  }
  const note = req.body?.note != null ? String(req.body.note) : null;

  const existing = await findDiffSetById(req.params.diffSetId, req.user!.id, { asAdmin: true });
  if (!existing) return notFound(res, "DiffSet not found.");

  // Re-enforce the allowlist at the moment of release. The generator already
  // checked it, but this is the gate that matters — the last point before
  // anything can be exported to a customer.
  try {
    enforceMvpDiffAllowlist(existing.payload);
  } catch (err) {
    return badRequest(res, "DiffSet fails MVP enforcement and cannot be released.", {
      reason: String((err as Error)?.message ?? err)
    });
  }

  const updated = await setDiffSetRelease(req.params.diffSetId, {
    status: decision === "RELEASE" ? "RELEASED" : "REJECTED",
    byUserId: req.user!.id,
    note
  });

  if (!updated) {
    return conflict(res, "DiffSet has already been released or rejected.", {
      releaseStatus: existing.releaseStatus
    });
  }

  // On release, tell the customer. This is the last hand-written email in the
  // pipeline, and removing it is what makes the owner's job one decision per
  // job rather than a decision plus a message.
  //
  // Runs after the decision is committed, so a mail failure cannot un-release
  // a calibration. The outcome is reported rather than assumed — the owner
  // needs to know when to follow up by hand.
  let customerNotified: boolean | null = null;
  if (updated.releaseStatus === "RELEASED") {
    const context = await getDiffSetContext(updated.diffSetId);
    if (context) {
      const sent = await notify(
        reportReadyEmail({
          to: context.customerEmail,
          vehicle: context.vehicle,
          itemCount: context.summary.itemCount,
          largestChangePct: context.summary.largestChangePct,
          diffSetId: updated.diffSetId
        })
      );
      customerNotified = sent.ok;
    } else {
      customerNotified = false;
    }
  }

  return res.json({
    diffSetId: updated.diffSetId,
    releaseStatus: updated.releaseStatus,
    releasedAt: updated.releasedAt,
    releaseNote: updated.releaseNote,
    // null on a rejection — nothing was meant to be sent. false means it was
    // meant to be sent and was not, which needs a human. Never conflate them.
    customerNotified
  });
}));
