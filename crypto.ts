import crypto from "crypto";

export function randomToken(prefix = "mlk"): string {
  const raw = crypto.randomBytes(32).toString("base64url");
  return `${prefix}_${raw}`;
}

export function sha256(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}
