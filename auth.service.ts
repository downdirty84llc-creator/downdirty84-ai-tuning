import { query } from "../../db.js";
import { randomToken, sha256 } from "./crypto.js";

const TOKEN_TTL_MIN = Number(process.env.MAGICLINK_TOKEN_TTL_MIN || 15);
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 14);

export async function startMagicLink(emailRaw: string): Promise<{ ok: true }> {
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

  // TODO: replace with Resend/SendGrid in production
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DD84] Magic link for ${email}: ${url}`);
  }

  return { ok: true };
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
