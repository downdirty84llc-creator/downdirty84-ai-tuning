import http from 'node:http';
import { generateKeyPairSync } from 'node:crypto';
import { URL } from 'node:url';
import {
  createCalibrationPackage,
  deviceProof,
  makeNonce,
  sha256,
  timingSafeEqualHex,
} from '../shared/protocol.mjs';

function json(res, code, value) {
  const body = JSON.stringify(value);
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

export function createCloud({ provisioning = new Map() } = {}) {
  const challenges = new Map();
  const sessions = new Map();
  const devices = new Map();
  const logs = [];
  const audit = [];
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');

  function authorize(req) {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    return token ? sessions.get(token) : null;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, { ok: true, service: 'dd84-link-cloud', protocol: '0.1' });
      }

      if (req.method === 'POST' && url.pathname === '/v1/device/challenge') {
        const body = await readJson(req);
        if (!provisioning.has(body.serial)) return json(res, 404, { error: 'device_not_provisioned' });
        const challenge = { nonce: makeNonce(), issuedAt: new Date().toISOString() };
        challenges.set(body.serial, challenge);
        return json(res, 200, challenge);
      }

      if (req.method === 'POST' && url.pathname === '/v1/device/authenticate') {
        const body = await readJson(req);
        const secret = provisioning.get(body.serial);
        const challenge = challenges.get(body.serial);
        if (!secret || !challenge) return json(res, 401, { error: 'challenge_required' });
        const expected = deviceProof({ secret, serial: body.serial, ...challenge });
        if (!timingSafeEqualHex(expected, body.proof)) return json(res, 401, { error: 'invalid_device_proof' });
        const token = makeNonce(24);
        sessions.set(token, { serial: body.serial, authenticatedAt: Date.now() });
        devices.set(body.serial, { ...body.device, serial: body.serial, lastSeenAt: new Date().toISOString() });
        challenges.delete(body.serial);
        audit.push({ event: 'device_authenticated', serial: body.serial, at: new Date().toISOString() });
        return json(res, 200, {
          token,
          cloudSigningPublicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
        });
      }

      const session = authorize(req);
      if (!session) return json(res, 401, { error: 'unauthorized' });

      if (req.method === 'POST' && url.pathname === '/v1/vehicle/session') {
        const body = await readJson(req);
        const vehicleSessionId = makeNonce(12);
        const vehicle = {
          id: vehicleSessionId,
          deviceSerial: session.serial,
          vinHash: sha256(body.vin),
          controllerId: body.controllerId,
          protocol: body.protocol,
          createdAt: new Date().toISOString(),
        };
        devices.set(`${session.serial}:vehicle`, vehicle);
        audit.push({ event: 'vehicle_session_created', serial: session.serial, vehicleSessionId, at: new Date().toISOString() });
        return json(res, 201, vehicle);
      }

      if (req.method === 'POST' && url.pathname === '/v1/logs') {
        const body = await readJson(req);
        const vehicle = devices.get(`${session.serial}:vehicle`);
        if (!vehicle || body.vehicleSessionId !== vehicle.id) return json(res, 409, { error: 'vehicle_session_mismatch' });
        const record = {
          id: makeNonce(10), serial: session.serial, vehicleSessionId: vehicle.id,
          sequence: body.sequence, samples: body.samples, receivedAt: new Date().toISOString(),
        };
        logs.push(record);
        return json(res, 202, { accepted: true, logId: record.id, sampleCount: body.samples.length });
      }

      if (req.method === 'POST' && url.pathname === '/v1/calibrations/mock-release') {
        const body = await readJson(req);
        const vehicle = devices.get(`${session.serial}:vehicle`);
        if (!vehicle) return json(res, 409, { error: 'vehicle_session_required' });
        const payload = {
          calibrationId: `DD84-${makeNonce(6).toUpperCase()}`,
          revision: 1,
          deviceSerial: session.serial,
          vinHash: vehicle.vinHash,
          controllerId: vehicle.controllerId,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString(),
          calibrationBlobDigest: sha256(body.calibrationBlobBase64 ?? 'prototype-calibration'),
          writeStrategy: 'SIMULATION_ONLY',
        };
        const pkg = createCalibrationPackage({ payload, privateKey });
        audit.push({ event: 'calibration_released', serial: session.serial, calibrationId: payload.calibrationId, at: new Date().toISOString() });
        return json(res, 201, pkg);
      }

      if (req.method === 'POST' && url.pathname === '/v1/audit/flash-event') {
        const body = await readJson(req);
        audit.push({ ...body, serial: session.serial, at: new Date().toISOString() });
        return json(res, 202, { accepted: true });
      }

      return json(res, 404, { error: 'not_found' });
    } catch (error) {
      json(res, 500, { error: 'internal_error', message: error.message });
    }
  });

  return {
    server,
    state: { devices, logs, audit },
    listen(port = 0) {
      return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve(server.address())));
    },
    close() { return new Promise(resolve => server.close(resolve)); },
  };
}
