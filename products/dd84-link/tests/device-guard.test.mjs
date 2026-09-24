import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { DD84LinkSimulator } from '../simulator/device.mjs';
import { createCalibrationPackage, sha256 } from '../shared/protocol.mjs';

test('device refuses signed real-write, expired and incompatible envelopes', async () => {
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  const device=new DD84LinkSimulator({baseUrl:'http://127.0.0.1:1',serial:'DD84-TEST',secret:'test'});
  device.cloudKey=publicKey;
  const payload={deviceSerial:'DD84-TEST',controllerId:'ECM',vinHash:sha256('VIN'),hwRev:'A0',fwVersion:'0.1.0-dev',writeStrategy:'SIMULATION_ONLY',expiresAt:new Date(Date.now()+60000).toISOString()};
  for(const patch of [{writeStrategy:'REAL'},{expiresAt:'2000-01-01'},{expiresAt:null},{hwRev:'B'},{fwVersion:'unknown'},{deviceSerial:'other'}]) {
    const pkg=createCalibrationPackage({payload:{...payload,...patch},privateKey});
    await assert.rejects(device.install(pkg,{}));
    assert.equal(device.flashState.activeSlot,'A');
    assert.equal(device.flashState.slotB,null);
  }
});
