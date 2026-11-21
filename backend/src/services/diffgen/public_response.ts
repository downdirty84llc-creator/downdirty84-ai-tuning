import { currentFuelPolicy } from "./fuel_policy.js";
import type { DiffSetRecord } from "../analyze/run_store.js";

/** Pending/rejected proposals are visible only to an authenticated owner-review admin. */
export function publicDiffSet(d: DiffSetRecord, asAdmin = false) {
  return {
    ...(asAdmin || (d.releaseStatus === "RELEASED" && currentFuelPolicy(d.payload)) ? d.payload : {}),
    diffSetId: d.diffSetId,
    runId: d.runId,
    jobId: d.jobId,
    createdAt: d.createdAt,
    releaseStatus: d.releaseStatus,
    releasedAt: d.releasedAt,
    releaseNote: d.releaseNote
  };
}
