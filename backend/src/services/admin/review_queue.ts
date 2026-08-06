import { query } from "../../db.js";
import { PROFILE_LABELS, type ProfileKey } from "../../config/thresholds.profiles.js";

/**
 * The owner's whole job, in one query.
 *
 * The release gate is the one thing that cannot be automated — a human has to
 * accept a calibration before it reaches a customer's engine. What *can* be
 * automated is everything around that decision: gathering the log, the
 * findings, the proposed changes, the confidence, and the reason each number
 * was produced, so the decision itself takes seconds instead of a morning.
 *
 * That is the difference between "the owner reviews every job" and "the owner
 * does 10% of the work". This function is that difference.
 */

export type QueueItem = {
  diffSetId: string;
  jobId: string;
  runId: string;
  customerEmail: string;
  serviceType: string;
  platform: string;
  vehicle: string | null;
  createdAt: string;
  waitingHours: number;

  /** Everything needed to decide, pre-assembled. */
  summary: {
    itemCount: number;
    approvedCount: number;
    suggestedCount: number;
    /** Largest proposed change, as a percentage. The number that matters most. */
    largestChangePct: number;
    /** Lowest per-bin confidence in the set. */
    lowestConfidence: number;
    /** Frequency range the corrections cover. */
    hzRange: [number, number] | null;
  };

  /** Safety verdict recorded by the run that produced this. */
  safety: {
    blockers: number;
    warnings: number;
    thresholdsConfirmed: boolean;
    /** Which profile judged the run. null = the job did not record fuel/induction. */
    thresholdProfile: ProfileKey | null;
    findingCodes: string[];
  };

  /** Set when something about this item deserves a closer look. */
  attention: string[];
};

type Row = {
  id: string;
  job_id: string;
  run_id: string;
  payload_json: any;
  created_at: string;
  customer_email: string;
  service_type: string;
  platform: string;
  vehicle: string | null;
  findings_json: any;
};

/**
 * Flags worth a second look before approving. These do not block — they sort
 * the owner's attention, which is the scarce resource.
 */
function attentionFlags(payload: any, findings: any): string[] {
  const flags: string[] = [];
  const items: any[] = payload?.items ?? [];

  const largest = items.reduce(
    (m, i) => Math.max(m, Math.abs((Number(i.after) || 1) - 1)),
    0
  );
  if (largest >= 0.1) {
    flags.push(`Large correction: ${(largest * 100).toFixed(1)}% — worth checking for a leak or wrong sensor`);
  }

  const lowConf = items.filter((i) => Number(i.confidence) < 0.6).length;
  if (lowConf > 0) flags.push(`${lowConf} bin(s) below 0.6 confidence, marked SUGGESTED`);

  const clamped = items.filter((i) => i.provenance?.clampedFrom !== undefined).length;
  if (clamped > 0) flags.push(`${clamped} bin(s) were clamped from a larger raw value`);

  if (items.length < 3) flags.push(`Only ${items.length} bin(s) — thin coverage, a longer log would be better`);

  const codes: string[] = (findings?.items ?? []).map((f: any) => f.code);
  if (codes.includes("R3_THRESHOLDS_UNCONFIRMED")) {
    // Name the profile. "Unconfirmed thresholds" is a shrug; "judged as
    // boosted E85, which you have not reviewed" tells the owner what to check.
    const profile = findings?.thresholdProfile ?? null;
    flags.push(
      profile
        ? `Judged as ${PROFILE_LABELS[profile as ProfileKey] ?? profile} — a profile you have not confirmed yet`
        : "Fuel/induction not recorded — judged against the strictest values across every profile, and reported unconfirmed"
    );
  }
  if ((findings?.summary?.warnings ?? 0) > 0) {
    flags.push(`${findings.summary.warnings} drivability warning(s) on this run`);
  }
  return flags;
}

function toQueueItem(r: Row): QueueItem {
  const items: any[] = r.payload_json?.items ?? [];
  const confidences = items.map((i) => Number(i.confidence)).filter(Number.isFinite);
  const hz = items.map((i) => Number(i.coordinates?.x)).filter(Number.isFinite);
  const findings = r.findings_json;
  const codes: string[] = (findings?.items ?? []).map((f: any) => f.code);

  return {
    diffSetId: r.id,
    jobId: r.job_id,
    runId: r.run_id,
    customerEmail: r.customer_email,
    serviceType: r.service_type,
    platform: r.platform,
    vehicle: r.vehicle,
    createdAt: r.created_at,
    waitingHours:
      Math.round(((Date.now() - new Date(r.created_at).getTime()) / 3_600_000) * 10) / 10,

    summary: {
      itemCount: items.length,
      approvedCount: items.filter((i) => i.status === "APPROVED").length,
      suggestedCount: items.filter((i) => i.status === "SUGGESTED").length,
      largestChangePct:
        Math.round(
          items.reduce((m, i) => Math.max(m, Math.abs((Number(i.after) || 1) - 1)), 0) * 1000
        ) / 10,
      lowestConfidence: confidences.length ? Math.min(...confidences) : 0,
      hzRange: hz.length ? [Math.min(...hz), Math.max(...hz)] : null
    },

    safety: {
      blockers: findings?.summary?.blockers ?? 0,
      warnings: findings?.summary?.warnings ?? 0,
      thresholdsConfirmed: findings?.thresholdSource === "OWNER_CONFIRMED",
      thresholdProfile: (findings?.thresholdProfile ?? null) as ProfileKey | null,
      findingCodes: codes
    },

    attention: attentionFlags(r.payload_json, findings)
  };
}

/**
 * Everything awaiting an owner decision, newest wait first.
 *
 * Admin-scoped: callers must already be behind requireAdmin. Ordered by how
 * long each has been waiting, because a customer waiting on a release is the
 * thing that costs the business.
 */
export async function getReviewQueue(limit = 50): Promise<QueueItem[]> {
  const rows = await query<Row>(
    `
    SELECT d.id, d.job_id, d.run_id, d.payload_json, d.created_at,
           u.email AS customer_email,
           j.service_type, j.platform, j.vehicle,
           r.findings_json
    FROM diffsets d
    JOIN jobs  j ON j.id = d.job_id
    JOIN users u ON u.id = d.user_id
    LEFT JOIN runs r ON r.id = d.run_id
    WHERE d.release_status IN ('OWNER_REVIEW', 'DRAFT')
    ORDER BY d.created_at ASC
    LIMIT $1
    `,
    [limit]
  );

  return rows.map(toQueueItem);
}

/**
 * The same assembled view for a single diffset, whatever its release status.
 *
 * Notifications need exactly what the queue needs — who the customer is, how
 * big the change is, what deserves a second look — so it is computed here once
 * rather than reassembled slightly differently in a route and drifting.
 *
 * Returns null when the diffset is gone, so a caller can distinguish "no one to
 * notify" from "notified nobody".
 */
export async function getDiffSetContext(diffSetId: string): Promise<QueueItem | null> {
  const rows = await query<Row>(
    `
    SELECT d.id, d.job_id, d.run_id, d.payload_json, d.created_at,
           u.email AS customer_email,
           j.service_type, j.platform, j.vehicle,
           r.findings_json
    FROM diffsets d
    JOIN jobs  j ON j.id = d.job_id
    JOIN users u ON u.id = d.user_id
    LEFT JOIN runs r ON r.id = d.run_id
    WHERE d.id = $1
    LIMIT 1
    `,
    [diffSetId]
  );
  return rows[0] ? toQueueItem(rows[0]) : null;
}

/** Counts for a dashboard badge, cheap enough to poll. */
export async function getQueueCounts(): Promise<{
  awaitingRelease: number;
  oldestWaitingHours: number;
  jobsInProgress: number;
  failedRuns24h: number;
}> {
  const rows = await query<{
    awaiting: string;
    oldest: string | null;
    in_progress: string;
    failed: string;
  }>(
    `
    SELECT
      (SELECT count(*) FROM diffsets WHERE release_status IN ('OWNER_REVIEW','DRAFT')) AS awaiting,
      (SELECT min(created_at) FROM diffsets WHERE release_status IN ('OWNER_REVIEW','DRAFT')) AS oldest,
      (SELECT count(*) FROM jobs WHERE status IN ('NEW','ANALYZING')) AS in_progress,
      (SELECT count(*) FROM runs WHERE status = 'FAILED' AND started_at > now() - interval '24 hours') AS failed
    `
  );
  const r = rows[0];
  return {
    awaitingRelease: Number(r.awaiting),
    oldestWaitingHours: r.oldest
      ? Math.round(((Date.now() - new Date(r.oldest).getTime()) / 3_600_000) * 10) / 10
      : 0,
    jobsInProgress: Number(r.in_progress),
    failedRuns24h: Number(r.failed)
  };
}
