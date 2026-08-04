import { test } from "node:test";
import assert from "node:assert/strict";
import { exportCsv } from "./csv.exporter.js";

const opts = { includeSuggested: false, minConfidence: 0.45 };

function item(overrides: Record<string, unknown> = {}) {
  return {
    itemId: 1,
    type: "CURVE_POINT",
    path: "Airflow.MAF.Curve",
    coordinates: { x: 1000, y: null },
    before: 1.0,
    after: 1.04,
    units: "multiplier",
    confidence: 0.9,
    reason: "Lean under load",
    applyNotes: "",
    status: "APPROVED",
    ...overrides
  };
}

function rowsOf(csv: string) {
  return csv.split("\n").slice(1);
}

test("quotes values containing a comma", () => {
  const csv = exportCsv({ diffSetId: "ds", items: [item({ reason: "Lean under load, cyl 5,7" })] }, opts);
  assert.match(rowsOf(csv)[0], /"Lean under load, cyl 5,7"/);
});

test("doubles embedded quotes per RFC 4180", () => {
  const csv = exportCsv({ diffSetId: "ds", items: [item({ applyNotes: 'Verify "scaling"' })] }, opts);
  assert.match(rowsOf(csv)[0], /"Verify ""scaling"""/);
});

test("quotes values containing CR or LF so a row cannot split", () => {
  for (const brk of ["\n", "\r", "\r\n"]) {
    const csv = exportCsv({ diffSetId: "ds", items: [item({ reason: `line1${brk}line2` })] }, opts);
    assert.ok(csv.includes(`"line1${brk}line2"`), `not quoted for ${JSON.stringify(brk)}`);
  }
});

test("never emits raw template-literal source (regression)", () => {
  const csv = exportCsv({ diffSetId: "ds", items: [item({ reason: "a,b" })] }, opts);
  assert.ok(!csv.includes("${"), "escaped template literal leaked into output");
  assert.ok(!csv.includes("s.replace"), "source text leaked into output");
});

test("leaves plain values unquoted", () => {
  const csv = exportCsv({ diffSetId: "ds", items: [item({ reason: "Lean under load" })] }, opts);
  assert.match(rowsOf(csv)[0], /,Lean under load,/);
});

test("filters by confidence, status, and includeSuggested", () => {
  const items = [
    item({ itemId: 1, confidence: 0.2 }),
    item({ itemId: 2, status: "REJECTED" }),
    item({ itemId: 3, status: "SUGGESTED" }),
    item({ itemId: 4, status: "APPROVED" })
  ];
  assert.equal(rowsOf(exportCsv({ diffSetId: "ds", items }, opts)).length, 1);
  assert.equal(
    rowsOf(exportCsv({ diffSetId: "ds", items }, { ...opts, includeSuggested: true })).length,
    2
  );
});

test("orders deterministically by path, type, x, y, itemId", () => {
  const items = [
    item({ itemId: 9, coordinates: { x: 3000, y: null } }),
    item({ itemId: 7, coordinates: { x: 1000, y: null } }),
    item({ itemId: 8, coordinates: { x: 2000, y: null } })
  ];
  const xs = rowsOf(exportCsv({ diffSetId: "ds", items }, opts)).map((r) => r.split(",")[4]);
  assert.deepEqual(xs, ["1000", "2000", "3000"]);
});
