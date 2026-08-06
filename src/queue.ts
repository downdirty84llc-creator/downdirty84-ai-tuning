import { apiGet, apiPost } from "./client";

/** Mirrors QueueItem in backend/src/services/admin/review_queue.ts. */
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
  summary: {
    itemCount: number;
    approvedCount: number;
    suggestedCount: number;
    largestChangePct: number;
    lowestConfidence: number;
    hzRange: [number, number] | null;
  };
  safety: {
    blockers: number;
    warnings: number;
    thresholdsConfirmed: boolean;
    /** Which profile judged the run. null = the job never said what the car is. */
    thresholdProfile: "NA_GAS" | "BOOSTED_GAS" | "NA_E85" | "BOOSTED_E85" | null;
    findingCodes: string[];
  };
  attention: string[];
};

export type QueueCounts = {
  awaitingRelease: number;
  oldestWaitingHours: number;
  jobsInProgress: number;
  failedRuns24h: number;
};

export function getQueue() {
  return apiGet<{ counts: QueueCounts; items: QueueItem[] }>("/api/v1/admin/queue");
}

/**
 * The release decision.
 *
 * `customerNotified` is deliberately part of the result: true means the
 * customer already has the email and there is nothing left to do, false means
 * the release stands but nobody told them. Null on a rejection, where no
 * message was meant to go out.
 */
export function releaseDiffSet(diffSetId: string, decision: "RELEASE" | "REJECT", note: string) {
  return apiPost<{
    diffSetId: string;
    releaseStatus: string;
    releasedAt: string | null;
    customerNotified: boolean | null;
  }>(`/api/v1/diffsets/${diffSetId}/release`, { decision, note });
}

export function getDiffSet(diffSetId: string) {
  return apiGet<any>(`/api/v1/diffsets/${diffSetId}`);
}

export function exportSummary(diffSetId: string) {
  return apiPost<{ text: string; releasedAt: string }>(
    `/api/v1/diffsets/${diffSetId}/export/summary`,
    {}
  );
}
