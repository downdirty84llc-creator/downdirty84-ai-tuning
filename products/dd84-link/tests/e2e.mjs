import { createCloud } from '../cloud/server.mjs';
import { DD84LinkSimulator } from '../simulator/device.mjs';

const serial = 'DD84-LINK-A0-000001';
const secret = 'prototype-provisioning-secret-rotate-me';
const cloud = createCloud({ provisioning: new Map([[serial, secret]]) });
const address = await cloud.listen();
const baseUrl = `http://127.0.0.1:${address.port}`;
const device = new DD84LinkSimulator({ baseUrl, serial, secret });

try {
  console.log('1/6 Authenticating device');
  await device.authenticate();
  console.log('2/6 Opening vehicle session');
  await device.openVehicle({ vin: '1DD84PROTOTYPE001', controllerId: 'SIM-ECM-01' });
  console.log('3/6 Uploading log');
  console.log(await device.uploadLog([{ t: 0, rpm: 900, lambda: 1.0 }, { t: 100, rpm: 3000, lambda: 0.86 }]));
  console.log('4/6 Fetching signed prototype calibration');
  const pkg = await device.requestPrototypeCalibration();
  console.log({ calibrationId: pkg.payload.calibrationId, digest: pkg.digest });
  console.log('5/6 Demonstrating fail-closed preflash guard');
  console.log(await device.install(pkg, {
    vin: '1DD84PROTOTYPE001', controllerId: 'SIM-ECM-01', batteryVoltage: 11.7,
    engineRunning: false, vehicleSpeedKph: 0, backupCreated: true, transportStable: true,
  }));
  console.log('6/6 Simulated safe flash + recovery');
  console.log(await device.install(pkg, {
    vin: '1DD84PROTOTYPE001', controllerId: 'SIM-ECM-01', batteryVoltage: 13.5,
    engineRunning: false, vehicleSpeedKph: 0, backupCreated: true, transportStable: true,
  }));
  console.log(await device.recover());
  console.log('AUDIT', cloud.state.audit);
} finally {
  await cloud.close();
}
