import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import {
  createCalibrationPackage,
  verifyCalibrationPackage,
  evaluatePreflash,
  sha256,
  equalProof,
  deviceProof,
} from "./protocol.js";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const payload = {
  deviceSerial: "D",
  vinHash: sha256("1GCHK23U05F123456"),
  controllerId: "ECM",
  hwRev: "A0",
  fwVersion: "0.1.0-dev",
  writeStrategy: "SIMULATION_ONLY",
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
};
const binding = {
  device_serial: "D",
  vin_hash: payload.vinHash,
  controller_id: "ECM",
  hw_rev: "A0",
  fw_version: "0.1.0-dev",
  state: { originalBackup: "factory" },
};
const safe = {
  vin: "1GCHK23U05F123456",
  controllerId: "ECM",
  batteryVoltage: 13.5,
  engineRunning: false,
  vehicleSpeedKph: 0,
  backupCreated: true,
  transportStable: true,
  hwRev: "A0",
  fwVersion: "0.1.0-dev",
};
test("Ed25519 package rejects tampering and malformed signatures", () => {
  const pkg = createCalibrationPackage(payload, privateKey);
  assert.equal(verifyCalibrationPackage(pkg, publicKey), true);
  assert.equal(
    verifyCalibrationPackage(
      { ...pkg, payload: { ...payload, deviceSerial: "other" } },
      publicKey,
    ),
    false,
  );
  for (const p of [
    null,
    {},
    { ...pkg, signature: null },
    { ...pkg, signature: "garbage" },
  ])
    assert.equal(verifyCalibrationPackage(p, publicKey), false);
});
test("every required preflash input fails closed when absent or unsafe", () => {
  assert.equal(evaluatePreflash(safe, payload, binding).ok, true);
  for (const key of Object.keys(safe)) {
    const s: any = { ...safe };
    delete s[key];
    assert.equal(evaluatePreflash(s, payload, binding).ok, false, key);
  }
  for (const s of [
    { batteryVoltage: 12.1 },
    { batteryVoltage: NaN },
    { batteryVoltage: Infinity },
    { batteryVoltage: "13.5" },
    { engineRunning: true },
    { vehicleSpeedKph: null },
    { vehicleSpeedKph: "0" },
    { vehicleSpeedKph: 1 },
    { controllerId: "other" },
    { vin: "other" },
    { backupCreated: false },
    { transportStable: false },
    { hwRev: "B" },
    { fwVersion: "new" },
  ])
    assert.equal(
      evaluatePreflash({ ...safe, ...s }, payload, binding).ok,
      false,
      JSON.stringify(s),
    );
  for (const p of [
    { deviceSerial: "other" },
    { vinHash: "other" },
    { controllerId: "other" },
    { writeStrategy: "REAL" },
    { expiresAt: "bad" },
    { expiresAt: "2000-01-01" },
    { hwRev: "B" },
    { fwVersion: "new" },
  ])
    assert.equal(
      evaluatePreflash(safe, { ...payload, ...p }, binding).ok,
      false,
    );
  assert.equal(
    evaluatePreflash(safe, payload, { ...binding, state: {} }).ok,
    false,
  );
});
test("device proof comparison rejects malformed data without coercion", () => {
  const p = deviceProof("secret", "D", { nonce: "n", issuedAt: "now" });
  assert.equal(equalProof(p, p), true);
  for (const v of [
    undefined,
    null,
    [],
    {},
    "",
    "zz".repeat(32),
    "00".repeat(32),
  ])
    assert.equal(equalProof(p, v), false);
});
