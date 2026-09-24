import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { createCalibrationPackage, evaluatePreflash, sha256, verifyCalibrationPackage } from '../shared/protocol.mjs';

test('signed calibration package rejects tampering', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pkg = createCalibrationPackage({ privateKey, payload: { calibrationId: 'X', vinHash: sha256('VIN'), controllerId: 'ECM' } });
  assert.equal(verifyCalibrationPackage(pkg, publicKey), true);
  pkg.payload.controllerId = 'OTHER';
  assert.equal(verifyCalibrationPackage(pkg, publicKey), false);
});

test('preflash gate is fail closed', () => {
  const expected = { vinHash: sha256('VIN'), controllerId: 'ECM' };
  const result = evaluatePreflash({
    vin: 'VIN', controllerId: 'ECM', batteryVoltage: 13.0, engineRunning: true,
    vehicleSpeedKph: 0, backupCreated: true, transportStable: true,
  }, expected);
  assert.equal(result.ok, false);
  assert.equal(result.checks.engineOff, false);
});
