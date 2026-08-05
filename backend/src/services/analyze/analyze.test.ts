import { test } from "node:test";
import assert from "node:assert/strict";

import { parseLog, LogParseError, detectFileKind } from "./log/parser.js";
import { makeSyntheticLog } from "./log/synthetic.js";
import { resolveChannel, detectLambda } from "./log/channels.js";
import { findSustained, mad, median, rejectOutliers, peakToPeak } from "./log/series.js";
import { validateLog } from "./validation.js";
import { runRules, diffgenAllowed } from "./rules/index.js";
import { generateMafSuggestions } from "./diffgen/maf.js";
import { NO_THRESHOLDS, THRESHOLDS, THRESHOLD_SOURCE, type Thresholds } from "../../config/thresholds.js";

/** Thresholds a test can use. Never a suggestion for production values. */
function testThresholds(): Thresholds {
  return {
    safety: {
      leanAfrDelta: 1.0,
      leanMinTps: 60,
      leanMinSeconds: 2,
      krDegrees: 4,
      krMinSeconds: 1,
      ectMaxC: 110,
      iatMaxC: 90,
      overtempMinSeconds: 3,
      fuelPressDropPct: 0.15,
      fuelPressMinSeconds: 1
    },
    drivability: {
      surgeStftP2P: 10,
      cruiseMaxRpmVariation: 200,
      cruiseMaxTpsVariation: 3,
      cruiseMinSeconds: 5,
      throttleClosureMinDelta: 5,
      throttleClosureMinSeconds: 1
    },
    diffgen: {
      mafMaxStepPct: 0.03,
      mafMaxTotalPct: 0.2,
      mafMinBinSeconds: 5,
      mafBinWidthHz: 200
    }
  };
}

/* ------------------------------------------------------------- channels -- */

test("resolves vendor column names onto canonical channels", () => {
  assert.equal(resolveChannel("SAE.RPM"), "rpm");
  assert.equal(resolveChannel("Engine Speed"), "rpm");
  assert.equal(resolveChannel("rpm "), "rpm");
  assert.equal(resolveChannel("MAF Freq"), "maf_hz");
  assert.equal(resolveChannel("WBAFR"), "afr_wb");
  assert.equal(resolveChannel("Short Term Fuel Trim Bank 1"), "stft_b1");
});

test("does not substring-match a desired value onto a measured channel", () => {
  // "Fuel Pressure Desired" contains "fuelpress"; mapping it onto the measured
  // channel would produce a confident, wrong fuel-delivery finding.
  assert.equal(resolveChannel("Fuel Pressure Desired"), null);
  assert.equal(resolveChannel("Fuel Pressure"), "fuel_press");
});

test("MAF frequency does not get captured by the generic MAF alias", () => {
  assert.equal(resolveChannel("MAF Frequency"), "maf_hz");
  assert.equal(resolveChannel("MAF"), "maf_gs");
});

test("detects lambda logged on an AFR channel", () => {
  assert.equal(detectLambda([0.98, 1.0, 1.02, 0.99]), true);
  assert.equal(detectLambda([14.7, 14.5, 15.1]), false);
});

/* --------------------------------------------------------------- parser -- */

test("parses a synthetic log into canonical channels", () => {
  const log = parseLog(makeSyntheticLog());
  assert.equal(log.sampleCount, 600);
  assert.ok(log.series.rpm && log.series.maf_hz && log.series.afr_wb);
  assert.equal(log.unmappedColumns.length, 0);
  assert.ok(Math.abs((log.sampleRateHz ?? 0) - 10) < 0.1);
  assert.ok(Math.abs(log.durationSec - 59.9) < 0.2);
});

test("skips a variable preamble to find the real header", () => {
  const log = parseLog(
    makeSyntheticLog({ preamble: ["HP Tuners VCM Scanner", "Vehicle: 2002 Silverado", ""] })
  );
  assert.equal(log.toolchain, "HPT");
  assert.equal(log.sampleCount, 600);
});

test("reports unmapped columns instead of dropping them silently", () => {
  const log = parseLog(makeSyntheticLog({ extraColumns: { "Wibble Sensor": () => 1 } }));
  assert.deepEqual(log.unmappedColumns, ["Wibble Sensor"]);
});

test("turns implausible values into NaN rather than clamping them", () => {
  // A clamped sensor dropout reads as real data to every rule downstream.
  const log = parseLog(makeSyntheticLog({ overrides: (i) => (i === 5 ? { RPM: 99999 } : undefined) }));
  assert.ok(Number.isNaN(log.series.rpm![5]));
  assert.ok(Number.isFinite(log.series.rpm![6]));
});

test("converts lambda to AFR and says so", () => {
  const log = parseLog(makeSyntheticLog({ commandedAfr: 1.0 }));
  assert.ok(log.notes.some((n) => n.includes("lambda")));
  assert.ok(Math.abs(log.series.afr_cmd![0] - 14.7) < 0.01);
});

test("rejects empty and headerless input", () => {
  assert.throws(() => parseLog(""), LogParseError);
  assert.throws(() => parseLog("1,2,3\n4,5,6"), LogParseError);
});

test("identifies an HP Tuners tune file and says what to send instead", () => {
  // Real .hpt files start with this magic, then an encrypted payload. Customers
  // send these by mistake — .hpt (tune) and .hpl (log) sit in the same folder
  // and differ by one letter. Only the 4-byte signature is reproduced here; no
  // customer calibration is stored in this repo.
  const fake = Buffer.concat([Buffer.from("HPT "), Buffer.alloc(4096, 0xa7)]);
  assert.equal(detectFileKind(fake).kind, "HPT_TUNE");
  try {
    parseLog(fake);
    assert.fail("should have thrown");
  } catch (err) {
    const msg = (err as Error).message;
    assert.match(msg, /tune file/i);
    assert.match(msg, /not a datalog/i);
    assert.match(msg, /VCM Scanner/); // tells them where to go
    assert.doesNotMatch(msg, /header row/i); // the old, useless message
  }
});

test("identifies a generic binary upload", () => {
  const bin = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(2048, 0), Buffer.alloc(2048, 0xff)]);
  assert.equal(detectFileKind(bin).kind, "BINARY");
  assert.throws(() => parseLog(bin), /binary, not a text datalog/i);
});

test("does not mistake a normal CSV for binary", () => {
  assert.equal(detectFileKind(Buffer.from(makeSyntheticLog())).kind, "TEXT");
  // UTF-8 accents and CRLF line endings must still read as text.
  assert.equal(detectFileKind(Buffer.from("Temps,RPM\r\n20,800\r\n21,810\r\n", "utf8")).kind, "TEXT");
});

test("handles quoted fields containing commas", () => {
  const csv = 'Time,RPM,"Notes, extra"\n0,800,"a,b"\n0.1,810,"c,d"\n0.2,820,"e,f"';
  const log = parseLog(csv);
  assert.equal(log.series.rpm?.length, 3);
  assert.deepEqual(log.unmappedColumns, ["Notes, extra"]);
});

/* ------------------------------------------------------------- validate -- */

test("passes a complete log", () => {
  // Needs realistic wideband movement: a flat WB is correctly reported as
  // IMPLAUSIBLE, since a sensor that never changes is not measuring.
  const v = validateLog(parseLog(makeSyntheticLog({ mafErrorAt: () => 0.02, noise: 0.2 })));
  assert.equal(v.status, "PASS");
  assert.equal(v.wbStatus, "OK");
});

test("fails a log that is too short, and says what to do", () => {
  const v = validateLog(
    parseLog(makeSyntheticLog({ plateaus: [{ hz: 3000, rpm: 2000, tps: 15, seconds: 5 }] }))
  );
  assert.equal(v.status, "FAIL");
  assert.ok(v.notes.some((n) => n.includes("too short")));
  assert.ok(v.nextLogPlan);
});

test("flags a wideband that never moved as implausible, not OK", () => {
  const v = validateLog(parseLog(makeSyntheticLog({ mafErrorAt: () => 0, noise: 0 })));
  assert.equal(v.wbStatus, "IMPLAUSIBLE");
});

test("does not claim a platform it cannot detect", () => {
  const v = validateLog(parseLog(makeSyntheticLog()));
  assert.equal(v.vehicleProfileDetected.platform, null);
});

/* ---------------------------------------------------------------- rules -- */

test("unset thresholds skip safety rules and block diffgen", () => {
  const log = parseLog(makeSyntheticLog());
  const result = runRules(log, NO_THRESHOLDS, "run-1");

  const r1 = result.findings.find((f) => f.code === "R1_THRESHOLD_UNSET");
  assert.ok(r1, "expected R1_THRESHOLD_UNSET");
  assert.ok(result.unevaluatedSafetyRules.length > 0);

  const gate = diffgenAllowed(result);
  assert.equal(gate.allowed, false);
  assert.match(gate.reason!, /not a pass/);
});

test("an unevaluated safety rule never reads as clean", () => {
  const log = parseLog(makeSyntheticLog());
  const result = runRules(log, NO_THRESHOLDS, "run-1");
  // No blockers, yet diffgen is still refused — the distinction that matters.
  assert.equal(result.summary.blockers, 0);
  assert.equal(diffgenAllowed(result).allowed, false);
});

test("detects sustained lean under load as a blocker", () => {
  const csv = makeSyntheticLog({
    plateaus: [{ hz: 3000, rpm: 4000, tps: 80, seconds: 40 }],
    overrides: (_i, t) => (t >= 10 && t <= 20 ? { WBAFR: 16.5 } : undefined)
  });
  const result = runRules(parseLog(csv), testThresholds(), "run-2");
  const lean = result.findings.find((f) => f.code === "S1_LEAN_UNDER_LOAD");
  assert.ok(lean, "expected S1_LEAN_UNDER_LOAD");
  assert.equal(lean!.severity, "BLOCKER");
  assert.equal(lean!.evidence.ranges.length, 1);
  const [start, end] = lean!.evidence.ranges[0];
  assert.ok(start >= 9.5 && start <= 10.5, `start ${start}`);
  assert.ok(end >= 19.5 && end <= 20.5, `end ${end}`);
});

test("a brief lean spike is not a blocker", () => {
  const csv = makeSyntheticLog({
    plateaus: [{ hz: 3000, rpm: 4000, tps: 80, seconds: 40 }],
    overrides: (_i, t) => (t >= 10 && t <= 10.5 ? { WBAFR: 16.5 } : undefined)
  });
  const result = runRules(parseLog(csv), testThresholds(), "run-3");
  assert.equal(result.findings.some((f) => f.code === "S1_LEAN_UNDER_LOAD"), false);
});

test("lean is only a blocker under load", () => {
  const csv = makeSyntheticLog({
    plateaus: [{ hz: 1200, rpm: 900, tps: 5, seconds: 40 }],
    overrides: (_i, t) => (t >= 10 && t <= 25 ? { WBAFR: 16.5 } : undefined)
  });
  const result = runRules(parseLog(csv), testThresholds(), "run-4");
  assert.equal(result.findings.some((f) => f.code === "S1_LEAN_UNDER_LOAD"), false);
});

test("detects sustained knock retard", () => {
  const csv = makeSyntheticLog({
    plateaus: [{ hz: 3000, rpm: 4000, tps: 80, seconds: 40 }],
    overrides: (_i, t) => (t >= 5 && t <= 12 ? { KR: 6 } : undefined)
  });
  const result = runRules(parseLog(csv), testThresholds(), "run-5");
  const kr = result.findings.find((f) => f.code === "S2_EXCESSIVE_KR");
  assert.ok(kr);
  assert.equal(kr!.stats.peakKr, 6);
});

test("a blocker stops diffgen", () => {
  const csv = makeSyntheticLog({
    plateaus: [{ hz: 3000, rpm: 4000, tps: 80, seconds: 40 }],
    overrides: (_i, t) => (t >= 10 && t <= 20 ? { WBAFR: 16.5 } : undefined)
  });
  const result = runRules(parseLog(csv), testThresholds(), "run-6");
  const gate = diffgenAllowed(result);
  assert.equal(gate.allowed, false);
  assert.match(gate.reason!, /blocker/i);
});

test("a clean log with thresholds set allows diffgen", () => {
  // No fuel pressure channel here, which is fine: S4 declares its data
  // optional, so its absence is "not applicable" rather than "unchecked".
  const csv = makeSyntheticLog({ mafErrorAt: () => 0.02, noise: 0.05 });
  const result = runRules(parseLog(csv), testThresholds(), "run-7");
  assert.equal(result.summary.blockers, 0);
  assert.deepEqual(result.unevaluatedSafetyRules, []);
  assert.equal(diffgenAllowed(result).allowed, true);
});

test("a missing wideband leaves the log uncleared, not clean", () => {
  // Contrast with the test above: wideband is NOT optional, so without it the
  // lean check never ran and diffgen must refuse.
  const csv = makeSyntheticLog({ header: ["Time", "RPM", "TPS", "MAF Freq", "KR", "ECT", "IAT"] });
  const result = runRules(parseLog(csv), testThresholds(), "run-8");
  assert.equal(result.summary.blockers, 0);
  assert.ok(result.unevaluatedSafetyRules.includes("S1_LEAN_UNDER_LOAD"));
  assert.equal(diffgenAllowed(result).allowed, false);
});

test("finding ids are stable across identical runs", () => {
  const csv = makeSyntheticLog({
    plateaus: [{ hz: 3000, rpm: 4000, tps: 80, seconds: 40 }],
    overrides: (_i, t) => (t >= 10 && t <= 20 ? { WBAFR: 16.5 } : undefined)
  });
  const a = runRules(parseLog(csv), testThresholds(), "same-run");
  const b = runRules(parseLog(csv), testThresholds(), "same-run");
  assert.deepEqual(a.findings.map((f) => f.id), b.findings.map((f) => f.id));
});

/* ------------------------------------------------------------- maf math -- */

test("recovers a known MAF error", () => {
  // MAF reads 5% low at every frequency; the correction should be ~1.05.
  const csv = makeSyntheticLog({ mafErrorAt: () => 0.05, noise: 0.02 });
  const res = generateMafSuggestions(parseLog(csv), testThresholds().diffgen);
  assert.equal(res.ok, true);
  if (!res.ok) return;

  assert.ok(res.diffSet.items.length >= 3);
  for (const item of res.diffSet.items) {
    assert.ok(
      Math.abs(item.after - 1.05) < 0.01,
      `bin ${item.coordinates.x} Hz gave ${item.after}, expected ~1.05`
    );
  }
});

test("recovers a frequency-dependent MAF error", () => {
  const csv = makeSyntheticLog({
    mafErrorAt: (hz) => (hz <= 2000 ? 0.0 : hz <= 3000 ? 0.03 : 0.06),
    noise: 0.01
  });
  const res = generateMafSuggestions(parseLog(csv), testThresholds().diffgen);
  assert.equal(res.ok, true);
  if (!res.ok) return;

  const byHz = new Map(res.diffSet.items.map((i) => [i.coordinates.x, i.after]));
  assert.ok(Math.abs(byHz.get(2000)! - 1.0) < 0.01, `2000Hz: ${byHz.get(2000)}`);
  assert.ok(Math.abs(byHz.get(3000)! - 1.03) < 0.01, `3000Hz: ${byHz.get(3000)}`);
});

test("emits only allowlist-compliant items", () => {
  const csv = makeSyntheticLog({ mafErrorAt: () => 0.04, noise: 0.01 });
  const res = generateMafSuggestions(parseLog(csv), testThresholds().diffgen);
  assert.equal(res.ok, true);
  if (!res.ok) return;

  for (const item of res.diffSet.items) {
    assert.equal(item.path, "Airflow.MAF.Curve");
    assert.equal(item.type, "CURVE_POINT");
    assert.equal(item.valueMode, "MULTIPLIER");
    assert.equal(item.units, "multiplier");
    assert.equal(typeof item.coordinates.x, "number");
  }
});

test("clamps a correction that exceeds the single-pass limit", () => {
  const csv = makeSyntheticLog({ mafErrorAt: () => 0.5, noise: 0.01 });
  const res = generateMafSuggestions(parseLog(csv), testThresholds().diffgen);
  assert.equal(res.ok, true);
  if (!res.ok) return;

  for (const item of res.diffSet.items) assert.ok(item.after <= 1.2 + 1e-9, `${item.after}`);
  assert.ok(res.diffSet.diagnostics.totalClamped > 0);
  assert.ok(res.diffSet.diagnostics.notes.some((n) => n.includes("mechanical")));
});

test("keeps adjacent bins within the step limit", () => {
  const csv = makeSyntheticLog({
    plateaus: [
      { hz: 2000, rpm: 1600, tps: 12, seconds: 20 },
      { hz: 2200, rpm: 1700, tps: 13, seconds: 20 }
    ],
    mafErrorAt: (hz) => (hz === 2000 ? 0.0 : 0.15),
    noise: 0.01
  });
  const res = generateMafSuggestions(parseLog(csv), testThresholds().diffgen);
  assert.equal(res.ok, true);
  if (!res.ok) return;

  const items = [...res.diffSet.items].sort((a, b) => a.coordinates.x - b.coordinates.x);
  for (let i = 1; i < items.length; i++) {
    const ratio = items[i].after / items[i - 1].after;
    assert.ok(ratio <= 1.03 + 1e-9, `step ${ratio} between ${items[i - 1].coordinates.x} and ${items[i].coordinates.x}`);
  }
  assert.ok(res.diffSet.diagnostics.stepClamped > 0);
});

test("ignores transient samples", () => {
  // Sweeping RPM/TPS the whole time means no steady state, so no correction —
  // pairing a wideband reading with a transient airflow value produces a
  // confident, wrong number.
  const plateaus = Array.from({ length: 40 }, (_, k) => ({
    hz: 2000 + k * 100,
    rpm: 1500 + k * 100,
    tps: 10 + k,
    seconds: 1
  }));
  const csv = makeSyntheticLog({ plateaus, mafErrorAt: () => 0.05 });
  const res = generateMafSuggestions(parseLog(csv), testThresholds().diffgen);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /steady-state/);
});

test("refuses to run without thresholds", () => {
  const res = generateMafSuggestions(parseLog(makeSyntheticLog()), NO_THRESHOLDS.diffgen);
  assert.equal(res.ok, false);
  if (res.ok) return;
  assert.match(res.reason, /not configured/);
  assert.ok((res.missing ?? []).includes("mafBinWidthHz"));
});

test("marks low-confidence bins SUGGESTED rather than APPROVED", () => {
  const csv = makeSyntheticLog({ mafErrorAt: () => 0.05, noise: 0.8 });
  const res = generateMafSuggestions(parseLog(csv), testThresholds().diffgen);
  if (!res.ok) return; // noisy data may legitimately yield nothing
  for (const item of res.diffSet.items) {
    if (item.confidence < 0.6) assert.equal(item.status, "SUGGESTED");
  }
});

/* ---------------------------------------------------- shipped thresholds -- */

test("ships conservative defaults, marked unconfirmed", () => {
  assert.equal(THRESHOLD_SOURCE, "CONSERVATIVE_DEFAULTS");
  // Every safety threshold must have a value, or the pipeline cannot run.
  for (const [k, v] of Object.entries(THRESHOLDS.safety)) {
    assert.ok(v !== null, `safety.${k} is null`);
  }
  for (const [k, v] of Object.entries(THRESHOLDS.diffgen)) {
    assert.ok(v !== null, `diffgen.${k} is null`);
  }
});

test("defaults are biased toward over-flagging", () => {
  // Each of these sits at the cautious end of a defensible range. If someone
  // loosens one, this test should make them justify it.
  assert.ok(THRESHOLDS.safety.leanAfrDelta! <= 1.0, "lean delta should be tight");
  assert.ok(THRESHOLDS.safety.krDegrees! <= 4, "knock threshold should be low");
  assert.ok(THRESHOLDS.safety.ectMaxC! <= 110, "coolant ceiling should be conservative");
  assert.ok(THRESHOLDS.diffgen.mafMaxTotalPct! <= 0.2, "single-pass MAF cap should be modest");
});

test("every run on defaults reports R3_THRESHOLDS_UNCONFIRMED", () => {
  const log = parseLog(makeSyntheticLog({ mafErrorAt: () => 0.02, noise: 0.2 }));
  const result = runRules(log, THRESHOLDS, "run-defaults", "CONSERVATIVE_DEFAULTS");
  const r3 = result.findings.find((f) => f.code === "R3_THRESHOLDS_UNCONFIRMED");
  assert.ok(r3, "expected R3_THRESHOLDS_UNCONFIRMED");
  assert.equal(result.thresholdSource, "CONSERVATIVE_DEFAULTS");
  // Unconfirmed thresholds do NOT block analysis — they annotate it.
  assert.equal(diffgenAllowed(result).allowed, true);
});

test("owner-confirmed runs carry no unconfirmed warning", () => {
  const log = parseLog(makeSyntheticLog({ mafErrorAt: () => 0.02, noise: 0.2 }));
  const result = runRules(log, testThresholds(), "run-confirmed", "OWNER_CONFIRMED");
  assert.equal(result.findings.some((f) => f.code === "R3_THRESHOLDS_UNCONFIRMED"), false);
});

test("the shipped defaults actually detect a real lean event", () => {
  // Guards against defaults so loose they never fire.
  const csv = makeSyntheticLog({
    plateaus: [{ hz: 3000, rpm: 4000, tps: 80, seconds: 40 }],
    overrides: (_i, t) => (t >= 10 && t <= 20 ? { WBAFR: 16.0 } : undefined)
  });
  const result = runRules(parseLog(csv), THRESHOLDS, "run-real", "CONSERVATIVE_DEFAULTS");
  assert.ok(result.findings.some((f) => f.code === "S1_LEAN_UNDER_LOAD"));
  assert.equal(diffgenAllowed(result).allowed, false);
});

/* -------------------------------------------------------------- pipeline -- */

test("pipeline runs parse -> validate -> rules end to end", async () => {
  const { analyzeLogContent } = await import("./pipeline.js");
  const csv = makeSyntheticLog({ mafErrorAt: () => 0.04, noise: 0.2 });
  const out = analyzeLogContent(csv, "pipeline-1");
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.validation.status, "PASS");
  assert.equal(out.thresholdSource, "CONSERVATIVE_DEFAULTS");
  assert.ok(out.rules.findings.length > 0);
});

test("pipeline stops at validation and never runs rules on rejected data", async () => {
  const { analyzeLogContent } = await import("./pipeline.js");
  const csv = makeSyntheticLog({ plateaus: [{ hz: 3000, rpm: 2000, tps: 15, seconds: 5 }] });
  const out = analyzeLogContent(csv, "pipeline-2");
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.stage, "VALIDATE");
  assert.ok(out.validation);
});

test("pipeline reports a parse failure rather than throwing", async () => {
  const { analyzeLogContent } = await import("./pipeline.js");
  const out = analyzeLogContent("", "pipeline-3");
  assert.equal(out.ok, false);
  if (out.ok) return;
  assert.equal(out.stage, "PARSE");
  assert.equal(out.error.code, "LOG_PARSE_FAILED");
});

test("multi-upload picks the largest parseable log and names what it skipped", async () => {
  const { analyzeUploads } = await import("./pipeline.js");
  const good = Buffer.from(makeSyntheticLog({ mafErrorAt: () => 0.03, noise: 0.2 }));
  const junk = Buffer.from("not,a,log\n");
  const out = analyzeUploads(
    [
      { uploadId: "u-junk", filename: "junk.csv", content: junk },
      { uploadId: "u-good", filename: "good.csv", content: good }
    ],
    "pipeline-4"
  );
  assert.equal(out.outcome.ok, true);
  assert.equal(out.usedUploadId, "u-good");
  assert.ok(out.skipped.some((s) => s.includes("junk.csv")));
});

/* --------------------------------------------------------------- series -- */

test("median, mad and outlier rejection", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(mad([1, 1, 1, 1]), 0);
  assert.deepEqual(rejectOutliers([1, 1, 1, 1, 50]), [1, 1, 1, 1]);
  assert.equal(peakToPeak([2, 9, 4]), 7);
});

test("findSustained bridges a brief gap but respects the minimum", () => {
  const log = parseLog(makeSyntheticLog({ plateaus: [{ hz: 3000, rpm: 2000, tps: 15, seconds: 30 }] }));
  const long = findSustained(log, (i) => i >= 50 && i <= 150, { minSeconds: 5 });
  assert.equal(long.length, 1);
  const short = findSustained(log, (i) => i >= 50 && i <= 55, { minSeconds: 5 });
  assert.equal(short.length, 0);
});
