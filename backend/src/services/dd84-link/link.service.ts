import { randomUUID } from "node:crypto";
import { query, withTransaction, type Tx } from "../../db.js";
import {
  nonce,
  sha256,
  deviceProof,
  equalProof,
  encryptSecret,
  decryptSecret,
  signingKeys,
  createCalibrationPackage,
  verifyCalibrationPackage,
  evaluatePreflash,
  WRITE_STRATEGY,
} from "./protocol.js";

export class LinkError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function text(value: unknown, field: string, max = 100): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new LinkError(400, `Invalid ${field}`);
  return value.trim();
}
export function id(value: unknown) {
  const s = text(value, "id", 36);
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s)
  )
    throw new LinkError(400, "Invalid id");
  return s;
}
export type Actor = { userId?: string; admin?: boolean; serial?: string };
async function event(
  tx: Tx,
  serial: string,
  name: string,
  details: any = {},
  sessionId: string | null = null,
) {
  await tx.query(
    "INSERT INTO dd84_link_events(device_serial, session_id, event, details) VALUES($1,$2,$3,$4)",
    [serial, sessionId, name, JSON.stringify(details)],
  );
}
export async function enroll(body: any, actor: Actor) {
  const serial = text(body.serial, "serial", 32),
    ownerId = id(body.ownerId);
  if (!/^[A-Z0-9-]+$/.test(serial)) throw new LinkError(400, "Invalid serial");
  const hwRev = text(body.hwRev, "hwRev"),
    fwVersion = text(body.fwVersion, "fwVersion");
  if (hwRev !== "A0" || fwVersion !== "0.1.0-dev")
    throw new LinkError(400, "Only Rev-A simulation firmware is supported");
  const secret = nonce();
  const encrypted = encryptSecret(secret);
  signingKeys();
  await withTransaction(async (tx) => {
    if (!(await tx.query("SELECT id FROM users WHERE id=$1", [ownerId])).length)
      throw new LinkError(400, "Owner account does not exist");
    await tx.query(
      "INSERT INTO dd84_link_devices(serial,secret_encrypted,hw_rev,fw_version) VALUES($1,$2,$3,$4)",
      [serial, JSON.stringify(encrypted), hwRev, fwVersion],
    );
    await tx.query(
      "INSERT INTO dd84_link_ownership(device_serial,user_id) VALUES($1,$2)",
      [serial, ownerId],
    );
    await event(tx, serial, "device_enrolled", {
      ownerId,
      actor: actor.userId,
    });
  });
  return { serial, secret, writeStrategy: WRITE_STRATEGY };
}
export async function challenge(serialValue: unknown) {
  const serial = text(serialValue, "serial", 32);
  return withTransaction(async (tx) => {
    if (
      !(
        await tx.query(
          "SELECT serial FROM dd84_link_devices WHERE serial=$1 FOR UPDATE",
          [serial],
        )
      ).length
    )
      throw new LinkError(401, "Device unavailable");
    const current = await tx.query(
      "SELECT 1 FROM dd84_link_challenges WHERE device_serial=$1 AND expires_at > now()",
      [serial],
    );
    if (current.length)
      throw new LinkError(429, "Challenge already issued; wait for expiry");
    const value = { nonce: nonce(), issuedAt: new Date().toISOString() };
    await tx.query(
      `INSERT INTO dd84_link_challenges VALUES($1,$2,$3,now()+interval '60 seconds') ON CONFLICT(device_serial) DO UPDATE SET nonce=$2,issued_at=$3,expires_at=now()+interval '60 seconds'`,
      [serial, value.nonce, value.issuedAt],
    );
    return value;
  });
}
export async function authenticate(body: any) {
  const serial = text(body.serial, "serial", 32);
  const result = await withTransaction(async (tx) => {
    const [device] = await tx.query(
      "SELECT * FROM dd84_link_devices WHERE serial=$1 FOR UPDATE",
      [serial],
    );
    const [c] = await tx.query(
      "DELETE FROM dd84_link_challenges WHERE device_serial=$1 RETURNING *",
      [serial],
    );
    if (!device || !c) return null;
    const valid =
      Date.parse(c.expires_at) > Date.now() &&
      equalProof(
        deviceProof(decryptSecret(device.secret_encrypted), serial, {
          nonce: c.nonce,
          issuedAt: c.issued_at,
        }),
        body.proof,
      );
    if (
      !valid ||
      body.device?.hwRev !== device.hw_rev ||
      body.device?.fwVersion !== device.fw_version
    ) {
      await event(tx, serial, "device_authentication_rejected");
      return null;
    }
    const token = nonce();
    await tx.query("DELETE FROM dd84_link_auth WHERE device_serial=$1", [
      serial,
    ]);
    await tx.query(
      `INSERT INTO dd84_link_auth VALUES($1,$2,now()+interval '15 minutes')`,
      [sha256(token), serial],
    );
    await event(tx, serial, "device_authenticated");
    return {
      token,
      expiresIn: 900,
      cloudSigningPublicKeyPem: signingKeys().publicKey.export({
        type: "spki",
        format: "pem",
      }),
    };
  });
  if (!result) throw new LinkError(401, "Invalid or expired device challenge");
  return result;
}
export async function deviceActor(token: string): Promise<Actor> {
  const [row] = await query(
    "SELECT device_serial FROM dd84_link_auth WHERE token_hash=$1 AND expires_at>now()",
    [sha256(token)],
  );
  if (!row) throw new LinkError(401, "Device authentication required");
  return { serial: row.device_serial };
}
async function authorizeDevice(tx: Tx, serial: string, actor: Actor) {
  const [d] = await tx.query(
    `SELECT d.serial FROM dd84_link_devices d JOIN dd84_link_ownership o ON o.device_serial=d.serial WHERE d.serial=$1 AND ($2::boolean OR o.user_id=$3::uuid OR d.serial=$4)`,
    [serial, !!actor.admin, actor.userId ?? null, actor.serial ?? null],
  );
  if (!d) throw new LinkError(404, "Device not found");
}
async function session(tx: Tx, sessionId: string, actor: Actor) {
  const [s] = await tx.query(
    `SELECT s.*,v.vin_hash,v.controller_id,d.hw_rev,d.fw_version FROM dd84_link_sessions s JOIN dd84_link_vehicles v ON v.id=s.vehicle_id JOIN dd84_link_devices d ON d.serial=s.device_serial JOIN dd84_link_ownership o ON o.device_serial=d.serial WHERE s.id=$1 AND ($2::boolean OR o.user_id=$3::uuid OR d.serial=$4) FOR UPDATE OF s`,
    [id(sessionId), !!actor.admin, actor.userId ?? null, actor.serial ?? null],
  );
  if (!s) throw new LinkError(404, "Session not found");
  return s;
}
export async function openSession(body: any, actor: Actor) {
  const serial = actor.serial ?? text(body.serial, "serial", 32);
  const vin = text(body.vin, "VIN", 17).toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin))
    throw new LinkError(400, "VIN must contain 17 valid characters");
  const controller = text(body.controllerId, "controllerId", 32);
  return withTransaction(async (tx) => {
    await authorizeDevice(tx, serial, actor);
    const [v] = await tx.query(
      `INSERT INTO dd84_link_vehicles(device_serial,vin_hash,controller_id) VALUES($1,$2,$3) ON CONFLICT(device_serial,vin_hash,controller_id) DO UPDATE SET controller_id=EXCLUDED.controller_id RETURNING id`,
      [serial, sha256(vin), controller],
    );
    const [s] = await tx.query(
      `INSERT INTO dd84_link_sessions(device_serial,vehicle_id,protocol) VALUES($1,$2,'CAN_UDS') RETURNING *`,
      [serial, v.id],
    );
    await event(tx, serial, "vehicle_session_created", {}, s.id);
    return s;
  });
}
export async function uploadLog(body: any, actor: Actor) {
  const sessionId = id(body.vehicleSessionId);
  if (
    !Number.isSafeInteger(body.sequence) ||
    body.sequence < 0 ||
    body.sequence > 2147483647 ||
    !Array.isArray(body.samples) ||
    !body.samples.length ||
    body.samples.length > 10000
  )
    throw new LinkError(400, "Invalid sequence or samples (1–10000 required)");
  if (
    body.samples.some(
      (s: any) =>
        !s ||
        Array.isArray(s) ||
        typeof s !== "object" ||
        Object.keys(s).length > 64 ||
        Object.values(s).some(
          (v) => typeof v !== "number" || !Number.isFinite(v),
        ),
    )
  )
    throw new LinkError(400, "Samples must contain finite numeric channels");
  return withTransaction(async (tx) => {
    const s = await session(tx, sessionId, actor);
    const [log] = await tx.query(
      "INSERT INTO dd84_link_logs(session_id,sequence,samples) VALUES($1,$2,$3) RETURNING id",
      [s.id, body.sequence, JSON.stringify(body.samples)],
    );
    await event(
      tx,
      s.device_serial,
      "log_uploaded",
      { logId: log.id, sampleCount: body.samples.length },
      s.id,
    );
    return { accepted: true, logId: log.id, sampleCount: body.samples.length };
  });
}
export async function backup(sessionId: string, actor: Actor) {
  return withTransaction(async (tx) => {
    const s = await session(tx, sessionId, actor);
    // This is the simulator's factory state, never a claim of an ECU read.
    s.state.originalBackup ??= "factory";
    s.state.lastKnownGood ??= "factory";
    await tx.query("UPDATE dd84_link_sessions SET state=$2 WHERE id=$1", [
      s.id,
      JSON.stringify(s.state),
    ]);
    await event(tx, s.device_serial, "original_backup_simulated", {}, s.id);
    return { state: s.state, writeStrategy: WRITE_STRATEGY };
  });
}
export async function release(sessionId: string, actor: Actor) {
  if (!actor.admin || !actor.userId)
    throw new LinkError(403, "Admin release required");
  return withTransaction(async (tx) => {
    const s = await session(tx, sessionId, actor);
    const [{ revision }] = await tx.query(
      "SELECT COALESCE(max(revision),0)+1 AS revision FROM dd84_link_packages WHERE session_id=$1",
      [s.id],
    );
    const calibrationId = randomUUID();
    const envelope = createCalibrationPackage({
      calibrationId,
      revision,
      deviceSerial: s.device_serial,
      vinHash: s.vin_hash,
      controllerId: s.controller_id,
      hwRev: s.hw_rev,
      fwVersion: s.fw_version,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(),
      calibrationBlobDigest: sha256("DD84-PROTOTYPE-CAL"),
      writeStrategy: WRITE_STRATEGY,
    });
    await tx.query(
      "INSERT INTO dd84_link_packages(id,session_id,revision,envelope,released_by) VALUES($1,$2,$3,$4,$5)",
      [calibrationId, s.id, revision, JSON.stringify(envelope), actor.userId],
    );
    await event(
      tx,
      s.device_serial,
      "calibration_released",
      { calibrationId, revision, actor: actor.userId },
      s.id,
    );
    return envelope;
  });
}
export async function install(sessionId: string, body: any, actor: Actor) {
  return withTransaction(async (tx) => {
    const s = await session(tx, sessionId, actor);
    const [record] = await tx.query(
      "SELECT envelope FROM dd84_link_packages WHERE id=$1 AND session_id=$2",
      [id(body.packageId), s.id],
    );
    if (!record) throw new LinkError(404, "Calibration not found");
    const pkg = body.envelope ?? record.envelope;
    const result = evaluatePreflash(body.state, pkg?.payload ?? {}, s);
    const checks = {
      ...result.checks,
      signature: verifyCalibrationPackage(pkg),
      releasedPackage: pkg?.digest === record.envelope.digest,
    };
    const ok = Object.values(checks).every(Boolean);
    if (ok) {
      s.state.lastKnownGood = s.state[`slot${s.state.activeSlot}`];
      const inactive = s.state.activeSlot === "A" ? "B" : "A";
      s.state[`slot${inactive}`] = pkg.digest;
      s.state.activeSlot = inactive;
      await tx.query("UPDATE dd84_link_sessions SET state=$2 WHERE id=$1", [
        s.id,
        JSON.stringify(s.state),
      ]);
    }
    await event(
      tx,
      s.device_serial,
      ok ? "flash_simulated" : "flash_blocked",
      { calibrationId: body.packageId, checks },
      s.id,
    );
    return {
      installed: ok,
      checks,
      state: s.state,
      writeStrategy: WRITE_STRATEGY,
    };
  });
}
export async function recover(sessionId: string, actor: Actor) {
  return withTransaction(async (tx) => {
    const s = await session(tx, sessionId, actor);
    if (!s.state.originalBackup || !s.state.lastKnownGood)
      throw new LinkError(409, "Original backup and known-good state required");
    const inactive = s.state.activeSlot === "A" ? "B" : "A";
    s.state[`slot${inactive}`] = s.state.lastKnownGood;
    s.state.activeSlot = inactive;
    await tx.query("UPDATE dd84_link_sessions SET state=$2 WHERE id=$1", [
      s.id,
      JSON.stringify(s.state),
    ]);
    await event(tx, s.device_serial, "recovery_simulated", {}, s.id);
    return { recovered: true, state: s.state, writeStrategy: WRITE_STRATEGY };
  });
}
export async function overview(actor: Actor) {
  const devices = await query(
    `SELECT d.serial,d.hw_rev,d.fw_version,o.user_id FROM dd84_link_devices d JOIN dd84_link_ownership o ON o.device_serial=d.serial WHERE ($1::boolean OR o.user_id=$2::uuid) ORDER BY d.serial`,
    [!!actor.admin, actor.userId ?? null],
  );
  const serials = devices.map((d) => d.serial);
  const sessions = await query(
    `SELECT s.*,v.vin_hash,v.controller_id FROM dd84_link_sessions s JOIN dd84_link_vehicles v ON v.id=s.vehicle_id WHERE s.device_serial=ANY($1::text[]) ORDER BY s.created_at DESC`,
    [serials],
  );
  const ids = sessions.map((s) => s.id);
  const logs = await query(
    "SELECT id,session_id,sequence,jsonb_array_length(samples) AS sample_count,created_at FROM dd84_link_logs WHERE session_id=ANY($1::uuid[]) ORDER BY created_at DESC",
    [ids],
  );
  // Metadata only: normal customer UI never receives raw tuning files or secrets.
  const packages = await query(
    `SELECT id,session_id,revision,envelope->'payload' AS payload,created_at FROM dd84_link_packages WHERE session_id=ANY($1::uuid[]) ORDER BY created_at DESC`,
    [ids],
  );
  const events = await query(
    "SELECT * FROM dd84_link_events WHERE device_serial=ANY($1::text[]) ORDER BY id DESC LIMIT 100",
    [serials],
  );
  return {
    devices,
    sessions,
    logs,
    packages,
    events,
    admin: !!actor.admin,
    writeStrategy: WRITE_STRATEGY,
  };
}
