import { createPublicKey } from 'node:crypto';
import { deviceProof, evaluatePreflash, verifyCalibrationPackage } from '../shared/protocol.mjs';

async function requestJson(url, { method = 'GET', token, body } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(value)}`);
  return value;
}

export class DD84LinkSimulator {
  constructor({ baseUrl, serial, secret, hwRev = 'A0', fwVersion = '0.1.0-dev' }) {
    this.baseUrl = baseUrl;
    this.serial = serial;
    this.secret = secret;
    this.hwRev = hwRev;
    this.fwVersion = fwVersion;
    this.token = null;
    this.cloudKey = null;
    this.vehicle = null;
    this.flashState = { activeSlot: 'A', slotA: 'factory', slotB: null, recoveryBackup: null, originalBackup: null };
  }

  async authenticate() {
    const challenge = await requestJson(`${this.baseUrl}/v1/device/challenge`, {
      method: 'POST', body: { serial: this.serial },
    });
    const proof = deviceProof({ secret: this.secret, serial: this.serial, ...challenge });
    const auth = await requestJson(`${this.baseUrl}/v1/device/authenticate`, {
      method: 'POST',
      body: {
        serial: this.serial,
        proof,
        device: { hwRev: this.hwRev, fwVersion: this.fwVersion, capabilities: ['CAN', 'CAN_FD', 'USB'] },
      },
    });
    this.token = auth.token;
    this.cloudKey = createPublicKey(auth.cloudSigningPublicKeyPem);
    return auth;
  }

  async openVehicle({ vin, controllerId, protocol = 'CAN_UDS' }) {
    this.vehicleIdentity = { vin, controllerId };
    this.vehicle = await requestJson(`${this.baseUrl}/v1/vehicle/session`, {
      method: 'POST', token: this.token, body: { vin, controllerId, protocol },
    });
    return this.vehicle;
  }

  async uploadLog(samples, sequence = 1) {
    return requestJson(`${this.baseUrl}/v1/logs`, {
      method: 'POST', token: this.token,
      body: { vehicleSessionId: this.vehicle.id, sequence, samples },
    });
  }

  async requestPrototypeCalibration() {
    return requestJson(`${this.baseUrl}/v1/calibrations/mock-release`, {
      method: 'POST', token: this.token,
      body: { calibrationBlobBase64: Buffer.from('DD84-PROTOTYPE-CAL').toString('base64') },
    });
  }

  async install(pkg, state) {
    if (!verifyCalibrationPackage(pkg, this.cloudKey)) throw new Error('calibration_signature_invalid');
    if (pkg.payload.writeStrategy !== 'SIMULATION_ONLY') throw new Error('real_writes_disabled');
    if (!Number.isFinite(Date.parse(pkg.payload.expiresAt)) || Date.parse(pkg.payload.expiresAt) <= Date.now()) throw new Error('calibration_expired');
    if (pkg.payload.hwRev !== this.hwRev || pkg.payload.fwVersion !== this.fwVersion) throw new Error('incompatible_version');
    if (pkg.payload.deviceSerial !== this.serial) throw new Error('device_binding_mismatch');
    const result = evaluatePreflash(state, pkg.payload);
    if (!result.ok) {
      await this.#audit({ event: 'flash_blocked', calibrationId: pkg.payload.calibrationId, checks: result.checks });
      return { installed: false, ...result };
    }

    this.flashState.originalBackup ??= this.flashState.slotA;
    this.flashState.recoveryBackup = this.flashState[this.flashState.activeSlot === 'A' ? 'slotA' : 'slotB'];
    const inactive = this.flashState.activeSlot === 'A' ? 'B' : 'A';
    this.flashState[`slot${inactive}`] = pkg.digest;
    this.flashState.activeSlot = inactive;
    await this.#audit({ event: 'flash_simulated', calibrationId: pkg.payload.calibrationId, digest: pkg.digest });
    return { installed: true, activeSlot: inactive, digest: pkg.digest, checks: result.checks };
  }

  async recover() {
    if (!this.flashState.recoveryBackup) throw new Error('no_recovery_backup');
    const inactive = this.flashState.activeSlot === 'A' ? 'B' : 'A';
    this.flashState[`slot${inactive}`] = this.flashState.recoveryBackup;
    this.flashState.activeSlot = inactive;
    await this.#audit({ event: 'recovery_simulated' });
    return { recovered: true, activeSlot: inactive };
  }

  #audit(body) {
    return requestJson(`${this.baseUrl}/v1/audit/flash-event`, { method: 'POST', token: this.token, body });
  }
}
