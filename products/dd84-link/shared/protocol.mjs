import { createHash, createHmac, randomBytes, sign, verify } from 'node:crypto';

export const PROTOCOL_VERSION = 'DD84-LINK/0.1';
export const MIN_FLASH_VOLTAGE = 12.2;

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function makeNonce(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function deviceProof({ secret, serial, nonce, issuedAt }) {
  return createHmac('sha256', secret)
    .update(`${PROTOCOL_VERSION}|${serial}|${nonce}|${issuedAt}`)
    .digest('hex');
}

export function timingSafeEqualHex(a, b) {
  const aa = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (aa.length !== bb.length) return false;
  return aa.every((byte, i) => byte === bb[i]);
}

export function createCalibrationPackage({ payload, privateKey }) {
  const body = canonicalize(payload);
  const signature = sign(null, Buffer.from(body), privateKey).toString('base64');
  return { protocol: PROTOCOL_VERSION, payload, signature, digest: sha256(body) };
}

export function verifyCalibrationPackage(pkg, publicKey) {
  if (pkg?.protocol !== PROTOCOL_VERSION) return false;
  const body = canonicalize(pkg.payload);
  if (sha256(body) !== pkg.digest) return false;
  return verify(null, Buffer.from(body), publicKey, Buffer.from(pkg.signature, 'base64'));
}

export function evaluatePreflash(state, expected) {
  const checks = {
    voltage: Number(state.batteryVoltage) >= MIN_FLASH_VOLTAGE,
    engineOff: state.engineRunning === false,
    stationary: Number(state.vehicleSpeedKph) === 0,
    controllerMatch: state.controllerId === expected.controllerId,
    vinMatch: sha256(state.vin) === expected.vinHash,
    backupCreated: state.backupCreated === true,
    transportStable: state.transportStable === true,
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}
