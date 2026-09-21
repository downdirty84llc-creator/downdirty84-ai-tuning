import { createHash, createHmac, randomBytes, sign, verify, timingSafeEqual } from 'node:crypto';

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
  if (typeof a !== 'string' || typeof b !== 'string' || !/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  const aa = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

export function createCalibrationPackage({ payload, privateKey }) {
  const body = canonicalize(payload);
  const signature = sign(null, Buffer.from(body), privateKey).toString('base64');
  return { protocol: PROTOCOL_VERSION, payload, signature, digest: sha256(body) };
}

export function verifyCalibrationPackage(pkg, publicKey) {
  try {
  if (pkg?.protocol !== PROTOCOL_VERSION || typeof pkg.signature !== 'string') return false;
  const body = canonicalize(pkg.payload);
  if (sha256(body) !== pkg.digest) return false;
  return verify(null, Buffer.from(body), publicKey, Buffer.from(pkg.signature, 'base64'));
  } catch { return false; }
}

export function evaluatePreflash(state, expected) {
  state = state ?? {};
  const checks = {
    voltage: typeof state.batteryVoltage === 'number' && Number.isFinite(state.batteryVoltage) && state.batteryVoltage >= MIN_FLASH_VOLTAGE,
    engineOff: state.engineRunning === false,
    stationary: typeof state.vehicleSpeedKph === 'number' && state.vehicleSpeedKph === 0,
    controllerMatch: state.controllerId === expected.controllerId,
    vinMatch: typeof state.vin === 'string' && sha256(state.vin) === expected.vinHash,
    backupCreated: state.backupCreated === true,
    transportStable: state.transportStable === true,
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}
