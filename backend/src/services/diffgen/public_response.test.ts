import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiffSetRecord } from "../analyze/run_store.js";
import { publicDiffSet } from "./public_response.js";
const record: DiffSetRecord = {
  diffSetId: "diff", runId: "run", jobId: "job", userId: "private-owner",
  name: "proposal", source: "source", generator: "GM_LS_MAF_V1",
  payload: { items: [{ after: 1.04 }], futureCalibrationField: "secret", releaseStatus: "RELEASED" },
  releaseStatus: "OWNER_REVIEW", releasedBy: "private-admin", releasedAt: null,
  releaseNote: null, createdAt: "2026-11-16"
};
for (const releaseStatus of ["DRAFT", "OWNER_REVIEW", "REJECTED"] as const) {
  test(`customer receives only status metadata for ${releaseStatus}`, () => {
    const result = publicDiffSet({ ...record, releaseStatus });
    assert.deepEqual(Object.keys(result).sort(), ["diffSetId", "runId", "jobId", "createdAt", "releaseStatus", "releasedAt", "releaseNote"].sort());
    assert.equal(result.releaseStatus, releaseStatus);
  });
}
test("released customer receives calibration without internal owner identifiers", () => {
  const result = publicDiffSet({ ...record, releaseStatus: "RELEASED" });
  assert.deepEqual(result.items, record.payload.items);
  assert.equal(result.userId, undefined); assert.equal(result.releasedBy, undefined);
});
test("trusted admin can inspect unreleased proposal; stored status beats payload", () => {
  const result = publicDiffSet(record, true);
  assert.deepEqual(result.items, record.payload.items);
  assert.equal(result.releaseStatus, "OWNER_REVIEW");
});
