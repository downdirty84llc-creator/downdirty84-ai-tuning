import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloud } from '../cloud/server.mjs';
import { DD84LinkSimulator } from '../simulator/device.mjs';

const SERIAL = 'DD84-LINK-A0-000001';
const SECRET = 'prototype-provisioning-secret-rotate-me';

test('full secure DD84 LINK vertical slice', async () => {
  const cloud = createCloud({ provisioning: new Map([[SERIAL, SECRET]]) });
  const address = await cloud.listen();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const device = new DD84LinkSimulator({ baseUrl, serial: SERIAL, secret: SECRET });
  try {
    await device.authenticate();
    await device.openVehicle({ vin: '1DD84PROTOTYPE001', controllerId: 'SIM-ECM-01' });
    const log = await device.uploadLog([
      { t: 0, rpm: 850, mapKpa: 38, lambda: 1.00, batteryV: 14.1 },
      { t: 100, rpm: 2200, mapKpa: 71, lambda: 0.94, batteryV: 14.0 },
    ]);
    assert.equal(log.sampleCount, 2);

    const pkg = await device.requestPrototypeCalibration();
    const blocked = await device.install(pkg, {
      vin: '1DD84PROTOTYPE001', controllerId: 'SIM-ECM-01', batteryVoltage: 11.8,
      engineRunning: false, vehicleSpeedKph: 0, backupCreated: true, transportStable: true,
    });
    assert.equal(blocked.installed, false);
    assert.equal(blocked.checks.voltage, false);

    const flashed = await device.install(pkg, {
      vin: '1DD84PROTOTYPE001', controllerId: 'SIM-ECM-01', batteryVoltage: 13.4,
      engineRunning: false, vehicleSpeedKph: 0, backupCreated: true, transportStable: true,
    });
    assert.equal(flashed.installed, true);
    assert.equal(device.flashState.activeSlot, 'B');

    const recovered = await device.recover();
    assert.equal(recovered.recovered, true);
    assert.equal(device.flashState.activeSlot, 'A');
    assert.equal(cloud.state.logs.length, 1);
    assert.ok(cloud.state.audit.some(x => x.event === 'flash_blocked'));
    assert.ok(cloud.state.audit.some(x => x.event === 'flash_simulated'));
    assert.ok(cloud.state.audit.some(x => x.event === 'recovery_simulated'));
  } finally {
    await cloud.close();
  }
});
