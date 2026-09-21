import {
  createHash,
  createHmac,
  randomBytes,
  sign,
  verify,
  timingSafeEqual,
  createPrivateKey,
  createPublicKey,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

export const PROTOCOL_VERSION = "DD84-LINK/0.1";
export const WRITE_STRATEGY = "SIMULATION_ONLY";
export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const nonce = () => randomBytes(32).toString("hex");
export function canonicalize(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function deviceProof(
  secret: string,
  serial: string,
  challenge: { nonce: string; issuedAt: string },
) {
  return createHmac("sha256", secret)
    .update(
      `${PROTOCOL_VERSION}|${serial}|${challenge.nonce}|${challenge.issuedAt}`,
    )
    .digest("hex");
}
export function equalProof(a: string, b: unknown) {
  return (
    typeof b === "string" &&
    /^[a-f0-9]{64}$/i.test(b) &&
    timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
  );
}
export function signingKeys() {
  const pem = process.env.DD84_LINK_SIGNING_PRIVATE_KEY;
  if (!pem) throw new Error("DD84 LINK signing key is not configured");
  const privateKey = createPrivateKey(pem.replace(/\\n/g, "\n"));
  if (privateKey.asymmetricKeyType !== "ed25519")
    throw new Error("Ed25519 key required");
  return { privateKey, publicKey: createPublicKey(privateKey) };
}
function encryptionKey() {
  const key = process.env.DD84_LINK_DEVICE_KEY;
  if (!key || !/^[a-f0-9]{64}$/i.test(key))
    throw new Error("DD84 LINK device encryption key is not configured");
  return Buffer.from(key, "hex");
}
export function encryptSecret(secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    data: data.toString("hex"),
  };
}
export function decryptSecret(value: {
  iv: string;
  tag: string;
  data: string;
}) {
  const cipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(value.iv, "hex"),
  );
  cipher.setAuthTag(Buffer.from(value.tag, "hex"));
  return Buffer.concat([
    cipher.update(Buffer.from(value.data, "hex")),
    cipher.final(),
  ]).toString("utf8");
}
export function createCalibrationPackage(
  payload: any,
  privateKey = signingKeys().privateKey,
) {
  const body = canonicalize(payload);
  return {
    protocol: PROTOCOL_VERSION,
    payload,
    signature: sign(null, Buffer.from(body), privateKey).toString("base64"),
    digest: sha256(body),
  };
}
export function verifyCalibrationPackage(
  pkg: any,
  publicKey = signingKeys().publicKey,
) {
  try {
    if (pkg?.protocol !== PROTOCOL_VERSION || typeof pkg.signature !== "string")
      return false;
    const body = canonicalize(pkg.payload);
    return (
      sha256(body) === pkg.digest &&
      verify(
        null,
        Buffer.from(body),
        publicKey,
        Buffer.from(pkg.signature, "base64"),
      )
    );
  } catch {
    return false;
  }
}
export function evaluatePreflash(state: any, expected: any, binding: any) {
  state = state ?? {};
  const checks = {
    simulationOnly: expected.writeStrategy === WRITE_STRATEGY,
    voltage:
      typeof state.batteryVoltage === "number" &&
      Number.isFinite(state.batteryVoltage) &&
      state.batteryVoltage >= 12.2,
    engineOff: state.engineRunning === false,
    stationary:
      typeof state.vehicleSpeedKph === "number" && state.vehicleSpeedKph === 0,
    deviceMatch: expected.deviceSerial === binding.device_serial,
    controllerMatch:
      state.controllerId === binding.controller_id &&
      expected.controllerId === binding.controller_id,
    vinMatch:
      typeof state.vin === "string" &&
      sha256(state.vin.toUpperCase()) === binding.vin_hash &&
      expected.vinHash === binding.vin_hash,
    backupCreated:
      state.backupCreated === true &&
      typeof binding.state.originalBackup === "string",
    transportStable: state.transportStable === true,
    hardwareCompatible:
      state.hwRev === binding.hw_rev &&
      expected.hwRev === binding.hw_rev &&
      binding.hw_rev === "A0",
    softwareCompatible:
      state.fwVersion === binding.fw_version &&
      expected.fwVersion === binding.fw_version &&
      binding.fw_version === "0.1.0-dev",
    notExpired:
      Number.isFinite(Date.parse(expected.expiresAt)) &&
      Date.parse(expected.expiresAt) > Date.now(),
  };
  return { ok: Object.values(checks).every(Boolean), checks };
}
