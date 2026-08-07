import { test } from "node:test";
import assert from "node:assert/strict";
import { compareCatalog, expectedCatalog, type LivePrice } from "./catalog_drift.js";

/** The account exactly as it was left after tagging: all eight, correct. */
function healthyAccount(): LivePrice[] {
  return [...expectedCatalog()].map(([id, want]) => ({
    id,
    active: true,
    metadata: { [want.key]: want.value }
  }));
}

test("a correctly tagged account reports no drift", () => {
  const r = compareCatalog(healthyAccount());
  assert.deepEqual(r.findings, []);
  assert.equal(r.taggedAndAgreeing, r.total);
  assert.equal(r.total, 8);
});

test("an add-on tagged as a service is caught as SWAPPED", () => {
  // The dangerous one. Every rush fee would start creating a tuning job.
  const live = healthyAccount().map((p) =>
    p.id === "price_1Sv1SrINLKqe1c6gfB6r7cHn" // Rush Fee
      ? { ...p, metadata: { dd84_service: "PRIORITY_LOG_REVIEW" } }
      : p
  );
  const r = compareCatalog(live);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].kind, "SWAPPED");
  assert.equal(r.onlyUntagged, false);
  assert.match(r.findings[0].message, /Stripe wins at runtime/);
});

test("a service tagged as an add-on is caught too", () => {
  // The inverse: the customer pays $399 and no job is ever created.
  const live = healthyAccount().map((p) =>
    p.id === "price_1Sv1RMINLKqe1c6gWBxwWuqH" // Stage 1 Boosted
      ? { ...p, metadata: { dd84_addon: "RUSH" } }
      : p
  );
  const r = compareCatalog(live);
  assert.equal(r.findings[0].kind, "SWAPPED");
});

test("a typo in the tag value is a MISMATCH, not silently accepted", () => {
  const live = healthyAccount().map((p) =>
    p.id === "price_1Sv1QfINLKqe1c6gckbURtNx"
      ? { ...p, metadata: { dd84_service: "STAGE1_N" } }
      : p
  );
  const r = compareCatalog(live);
  assert.equal(r.findings[0].kind, "MISMATCH");
  assert.match(r.findings[0].message, /STAGE1_N.*STAGE1_NA/);
});

test("an untagged account is a warning, not a failure", () => {
  // The static table still classifies these correctly, so nothing is broken —
  // conflating it with a real mismatch would train someone to ignore the check.
  const live = healthyAccount().map((p) => ({ ...p, metadata: {} }));
  const r = compareCatalog(live);
  assert.equal(r.findings.length, 8);
  assert.equal(r.onlyUntagged, true);
  assert.ok(r.findings.every((f) => f.kind === "UNTAGGED"));
});

test("one untagged among seven correct is still only-untagged", () => {
  const live = healthyAccount().map((p, i) => (i === 0 ? { ...p, metadata: {} } : p));
  const r = compareCatalog(live);
  assert.equal(r.onlyUntagged, true);
  assert.equal(r.taggedAndAgreeing, 7);
});

test("an archived price is flagged — the app would be selling a dead button", () => {
  const live = healthyAccount().map((p) =>
    p.id === "price_1Sv1NzINLKqe1c6gaCcSA90s" ? { ...p, active: false } : p
  );
  const r = compareCatalog(live);
  assert.ok(r.findings.some((f) => f.kind === "ARCHIVED"));
  assert.equal(r.onlyUntagged, false);
});

test("a price deleted from Stripe is reported rather than skipped", () => {
  const live = healthyAccount().filter((p) => p.id !== "price_1Sv1W1INLKqe1c6gBHjDTx0x");
  const r = compareCatalog(live);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].kind, "MISSING");
});

test("an empty response does not read as a healthy account", () => {
  // A failed or filtered list must never look like "everything is fine".
  const r = compareCatalog([]);
  assert.equal(r.taggedAndAgreeing, 0);
  assert.equal(r.findings.length, 8);
  assert.ok(r.findings.every((f) => f.kind === "MISSING"));
});

test("extra metadata alongside the tag is fine", () => {
  // Owners put their own keys on prices. Only the dd84_ ones are ours.
  const live = healthyAccount().map((p) => ({
    ...p,
    metadata: { ...p.metadata, internal_note: "raised for 2026", website: "DD84TUNING.COM" }
  }));
  const r = compareCatalog(live);
  assert.deepEqual(r.findings, []);
});
