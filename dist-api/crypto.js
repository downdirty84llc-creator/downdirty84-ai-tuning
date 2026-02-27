import crypto from "crypto";
export function randomToken(prefix = "mlk") {
    const raw = crypto.randomBytes(32).toString("base64url");
    return `${prefix}_${raw}`;
}
export function sha256(text) {
    return crypto.createHash("sha256").update(text).digest("hex");
}
