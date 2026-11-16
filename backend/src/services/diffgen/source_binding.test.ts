import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveGenerationSource } from "./source_binding.js";
import type { UploadRow } from "../uploads/uploads.repo.js";

const logA: UploadRow = {
  id: "log-a", user_id: "owner", job_id: "job-a", kind: "LOG",
  filename: "a.csv", mime_type: "text/csv", size_bytes: 1,
  storage_provider: "LOCAL", storage_key: "a", created_at: "2026-11-16"
};
const input = { userId: "owner", jobId: "job-a", analyzedUploadId: "log-a", requestedUploadId: undefined };

test("generation uses recorded source when client omits uploadId", async () => {
  const result = await resolveGenerationSource(input, async (owner, ids) => {
    assert.equal(owner, "owner"); assert.deepEqual(ids, ["log-a"]); return [logA];
  });
  assert.equal(result, logA);
});

test("generation accepts explicit matching analysed source", async () => {
  assert.equal(await resolveGenerationSource({ ...input, requestedUploadId: "log-a" }, async () => [logA]), logA);
});

test("safe log A verdict cannot authorize caller-selected log B", async () => {
  let reads = 0;
  assert.equal(await resolveGenerationSource({ ...input, requestedUploadId: "log-b" }, async () => {
    reads++; return [{ ...logA, id: "log-b" }];
  }), null);
  assert.equal(reads, 0, "reject before loading alternate customer data");
});

for (const source of [[], [{ ...logA, job_id: "other-job" }], [{ ...logA, job_id: null }],
  [{ ...logA, user_id: "other-owner" }], [{ ...logA, id: "wrong-log" }]]) {
  test(`generation fails closed for missing or mismatched persisted source ${JSON.stringify(source)}`, async () => {
    assert.equal(await resolveGenerationSource(input, async () => source), null);
  });
}

for (const analyzedUploadId of [undefined, null, "", 123]) {
  test(`generation requires recorded provenance: ${String(analyzedUploadId)}`, async () => {
    assert.equal(await resolveGenerationSource({ ...input, analyzedUploadId }, async () => { throw Error("must not load"); }), null);
  });
}
