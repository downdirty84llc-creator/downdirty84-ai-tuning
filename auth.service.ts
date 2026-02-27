import { query } from "./db.js";
import { randomToken, sha256 } from "./crypto.js";
import nodemailer from "nodemailer";

const TOKEN_TTL_MIN = Number(process.env.MAGICLINK_TOKEN_TTL_MIN || 15);
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 14);
const DEV_DEBUG_AUTH_START_TOKEN = String(process.env.DEV_DEBUG_AUTH_START_TOKEN || "false").toLowerCase() === "true";
const MAIL_FROM = process.env.MAGICLINK_FROM_EMAIL || "";
const SMTP_URL = process.env.SMTP_URL || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

let transport: nodemailer.Transporter | null = null;

export function hasMagicLinkEmailConfig(): boolean {
  if (!MAIL_FROM) return false;
  if (SMTP_URL) return true;
  return Boolean(SMTP_HOST) && Number.isFinite(SMTP_PORT) && SMTP_PORT > 0;
}

function getTransporter(): nodemailer.Transporter {
  if (transport) return transport;

  if (SMTP_URL) {
    transport = nodemailer.createTransport(SMTP_URL);
    return transport;
  }

  transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
  return transport;
}

async function deliverMagicLink(email: string, url: string, isDev: boolean): Promise<void> {
  if (!hasMagicLinkEmailConfig()) {
    if (isDev) {
      console.log(`[DD84] Magic link for ${email}: ${url}`);
      return;
    }
    console.warn("[DD84][auth-warning] Magic link email config is missing. Set SMTP_* and MAGICLINK_FROM_EMAIL.");
    return;
  }

  const transporter = getTransporter();
  await transporter.sendMail({
    from: MAIL_FROM,
    to: email,
    subject: "Your Down Dirty 84 sign-in link",
    text: `Use this secure sign-in link: ${url}`,
    html: `<p>Use this secure sign-in link:</p><p><a href=\"${url}\">${url}</a></p>`
  });

  if (isDev) {
    console.log(`[DD84] Sent magic link email to ${email}.`);
  }
}

export async function startMagicLink(emailRaw: string): Promise<{ ok: true; debugToken?: string }> {
  const email = emailRaw.trim().toLowerCase();

  // Always return ok=true (prevent enumeration)
  if (!email || !email.includes("@")) return { ok: true };

  const token = randomToken("mlk");
  const tokenHash = sha256(token);

  await query(
    `
    INSERT INTO auth_tokens (email, token_hash, expires_at)
    VALUES ($1, $2, now() + ($3 || ' minutes')::interval)
    `,
    [email, tokenHash, TOKEN_TTL_MIN]
  );

  const appBase = process.env.APP_BASE_URL || "http://localhost:3000";
  const url = `${appBase}/auth/callback?token=${encodeURIComponent(token)}`;

  const isDev = process.env.NODE_ENV !== "production";

  try {
    await deliverMagicLink(email, url, isDev);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    console.warn(`[DD84][auth-warning] Failed to send magic link email: ${message}`);
  }

  const exposeDebugToken = isDev && DEV_DEBUG_AUTH_START_TOKEN;
  return exposeDebugToken ? { ok: true, debugToken: token } : { ok: true };
}

export async function verifyMagicLink(token: string): Promise<{ user: { id: string; email: string }; sessionToken: string }> {
  const tokenHash = sha256(token);

  const rows = await query<{ id: string; email: string; used_at: string | null }>(
    `
    SELECT id, email, used_at
    FROM auth_tokens
    WHERE token_hash = $1
      AND expires_at > now()
    LIMIT 1
    `,
    [tokenHash]
  );

  if (rows.length === 0) throw new Error("INVALID_OR_EXPIRED");
  if (rows[0].used_at) throw new Error("TOKEN_ALREADY_USED");

  await query(`UPDATE auth_tokens SET used_at = now() WHERE id = $1`, [rows[0].id]);

  const email = rows[0].email;
  const userRows = await query<{ id: string; email: string }>(
    `
    INSERT INTO users (email)
    VALUES ($1)
    ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
    RETURNING id, email
    `,
    [email]
  );
  const user = userRows[0];

  const sessionToken = randomToken("ses");
  const sessionHash = sha256(sessionToken);

  await query(
    `
    INSERT INTO sessions (user_id, session_hash, expires_at)
    VALUES ($1, $2, now() + ($3 || ' days')::interval)
    `,
    [user.id, sessionHash, SESSION_DAYS]
  );

  return { user, sessionToken };
}

export async function logoutSession(rawSessionToken: string | undefined): Promise<void> {
  if (!rawSessionToken) return;
  const sessionHash = sha256(rawSessionToken);
  await query(`DELETE FROM sessions WHERE session_hash = $1`, [sessionHash]);
}
