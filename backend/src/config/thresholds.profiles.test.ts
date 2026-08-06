import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveThresholds,
  OWNER_OVERRIDES,
  OWNER_CONFIRMED_PROFILES,
  unconfirmedProfiles,
  allProfilesConfirmed
} from "./thresholds.js";
import {
  PROFILE_DEFAULTS,
  PROFILE_KEYS,
  STOICH,
  profileKey,
  selectProfile,
  normaliseFuel,
  normaliseInduction,
  strictestAcrossProfiles
} from "./thresholds.profiles.js";

test("the owner confirmed NA gasoline and nothing else", () => {
  assert.equal(OWNER_CONFIRMED_PROFILES.NA_GAS, true);
  assert.deepEqual(unconfirmedProfiles().sort(), ["BOOSTED_E85", "BOOSTED_GAS", "NA_E85"]);
  assert.equal(allProfilesConfirmed(), false);
});

test("only the confirmed profile reports OWNER_CONFIRMED", () => {
  assert.equal(resolveThresholds("NA_GAS").source, "OWNER_CONFIRMED");
  for (const k of PROFILE_KEYS.filter((k) => k !== "NA_GAS")) {
    assert.equal(
      resolveThresholds(k).source,
      "CONSERVATIVE_DEFAULTS",
      `${k} must not inherit NA_GAS's confirmation`
    );
  }
});

test("an unknown platform is never judged by the confirmed profile", () => {
  // The dangerous shortcut would be falling through to NA_GAS: a boosted E85
  // truck with no fuel recorded would then be measured against gasoline
  // numbers, under an owner's signature, with no warning on the report.
  const r = resolveThresholds(null);
  assert.equal(r.source, "CONSERVATIVE_DEFAULTS");
  assert.equal(r.profile, null);
  assert.deepEqual(r.thresholds, strictestAcrossProfiles());
});

test("the unknown-platform thresholds are at least as strict as every profile", () => {
  const strict = strictestAcrossProfiles();
  for (const k of PROFILE_KEYS) {
    const p = PROFILE_DEFAULTS[k];
    // A smaller lean margin fires sooner, so strictest must be <= each profile.
    assert.ok(
      strict.safety.leanAfrDelta! <= p.safety.leanAfrDelta!,
      `leanAfrDelta not strict enough vs ${k}`
    );
    assert.ok(strict.safety.krDegrees! <= p.safety.krDegrees!, `krDegrees vs ${k}`);
    assert.ok(strict.safety.iatMaxC! <= p.safety.iatMaxC!, `iatMaxC vs ${k}`);
    assert.ok(
      strict.diffgen.mafMaxTotalPct! <= p.diffgen.mafMaxTotalPct!,
      `mafMaxTotalPct vs ${k}`
    );
  }
});

test("the owner-approved values are written out, not inherited", () => {
  // If NA_GAS's overrides were left null they would track PROFILE_DEFAULTS,
  // and a later edit to the defaults would silently change numbers carrying
  // the owner's approval. A signature must not float.
  const o = OWNER_OVERRIDES.NA_GAS;
  assert.equal(o.safety.leanAfrDelta, 0.8);
  assert.equal(o.safety.leanMinTps, 55);
  assert.equal(o.safety.leanMinSeconds, 1.5);
  assert.equal(o.safety.krDegrees, 3);
  assert.equal(o.safety.ectMaxC, 108);
  assert.equal(o.safety.iatMaxC, 70);
  assert.equal(o.diffgen.mafMaxStepPct, 0.03);
  assert.equal(o.diffgen.mafMaxTotalPct, 0.15);
  assert.equal(o.diffgen.mafMinBinSeconds, 8);
  assert.equal(o.diffgen.mafBinWidthHz, 200);

  // And they are what actually gets used.
  assert.deepEqual(resolveThresholds("NA_GAS").thresholds, o);
});

test("unconfirmed profiles have no owner values set at all", () => {
  for (const k of PROFILE_KEYS.filter((k) => k !== "NA_GAS")) {
    const values = Object.values(OWNER_OVERRIDES[k].safety);
    assert.ok(
      values.every((v) => v === null),
      `${k} has owner values but is not marked confirmed — set the flag or clear the values`
    );
  }
});

test("E85 lean margins hold the same fraction of stoich as gasoline", () => {
  // 0.8 AFR is 5.4% lean on gasoline but 8.2% lean on E85. Carrying the same
  // AFR number across would mean an E85 log had to go half again as far lean
  // before the rule noticed.
  const gasFraction = PROFILE_DEFAULTS.NA_GAS.safety.leanAfrDelta! / STOICH.GASOLINE;
  const e85Fraction = PROFILE_DEFAULTS.NA_E85.safety.leanAfrDelta! / STOICH.E85;
  assert.ok(
    Math.abs(gasFraction - e85Fraction) < 0.005,
    `NA: gasoline ${gasFraction.toFixed(4)} vs E85 ${e85Fraction.toFixed(4)}`
  );

  const boostGas = PROFILE_DEFAULTS.BOOSTED_GAS.safety.leanAfrDelta! / STOICH.GASOLINE;
  const boostE85 = PROFILE_DEFAULTS.BOOSTED_E85.safety.leanAfrDelta! / STOICH.E85;
  assert.ok(
    Math.abs(boostGas - boostE85) < 0.005,
    `boosted: gasoline ${boostGas.toFixed(4)} vs E85 ${boostE85.toFixed(4)}`
  );
});

test("boost is stricter than NA on everything that boost makes worse", () => {
  const na = PROFILE_DEFAULTS.NA_GAS.safety;
  const boost = PROFILE_DEFAULTS.BOOSTED_GAS.safety;
  assert.ok(boost.leanAfrDelta! < na.leanAfrDelta!);
  assert.ok(boost.leanMinSeconds! <= na.leanMinSeconds!);
  assert.ok(boost.krDegrees! < na.krDegrees!);
  assert.ok(boost.iatMaxC! < na.iatMaxC!);
  assert.ok(boost.fuelPressDropPct! < na.fuelPressDropPct!);
});

test("profile selection reads the job", () => {
  assert.equal(selectProfile({ fuel: "GASOLINE", induction: "NA" }), "NA_GAS");
  assert.equal(selectProfile({ fuel: "E85", induction: "FORCED" }), "BOOSTED_E85");
  assert.equal(selectProfile({ fuel: "GASOLINE", induction: "FORCED" }), "BOOSTED_GAS");
  assert.equal(selectProfile({ fuel: "E85", induction: "NA" }), "NA_E85");
});

test("service type supplies induction when the field is blank", () => {
  // STAGE1_BOOST is an explicit statement that the car is boosted.
  assert.equal(selectProfile({ fuel: "GASOLINE", service_type: "STAGE1_BOOST" }), "BOOSTED_GAS");
  assert.equal(selectProfile({ fuel: "GASOLINE", service_type: "STAGE1_NA" }), "NA_GAS");
  // LOG_REVIEW says nothing about induction, so it must not be treated as NA.
  assert.equal(selectProfile({ fuel: "GASOLINE", service_type: "LOG_REVIEW" }), null);
});

test("a half-answered job selects no profile rather than guessing", () => {
  assert.equal(selectProfile({ fuel: "E85" }), null);
  assert.equal(selectProfile({ induction: "NA" }), null);
  assert.equal(selectProfile({}), null);
  assert.equal(selectProfile({ fuel: "diesel", induction: "NA" }), null);
});

test("input normalisation accepts what people actually type", () => {
  assert.equal(normaliseFuel(" e85 "), "E85");
  assert.equal(normaliseFuel("Gas"), "GASOLINE");
  assert.equal(normaliseFuel("pump"), "GASOLINE");
  assert.equal(normaliseFuel("propane"), null);
  assert.equal(normaliseInduction("turbo"), "FORCED");
  assert.equal(normaliseInduction("Supercharged"), "FORCED");
  assert.equal(normaliseInduction("n/a"), "NA");
  assert.equal(normaliseInduction("nitrous"), null);
});

test("profileKey covers every combination exactly once", () => {
  const seen = new Set<string>();
  for (const fuel of ["GASOLINE", "E85"] as const) {
    for (const induction of ["NA", "FORCED"] as const) {
      seen.add(profileKey(fuel, induction));
    }
  }
  assert.equal(seen.size, PROFILE_KEYS.length);
  for (const k of PROFILE_KEYS) assert.ok(seen.has(k), `${k} unreachable`);
});
