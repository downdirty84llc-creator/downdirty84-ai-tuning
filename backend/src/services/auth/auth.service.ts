import { query } from "../../db.js";
import { randomToken, sha256 } from "./crypto.js";
import { notify, signInEmail } from "../notify/notifications.js";

const TOKEN_TTL_MIN = Number(process.env.MAGICLINK_TOKEN_TTL_MIN || 15);
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 14);

/**
 * Mint a single-use sign-in link without sending it.
 *
 * Separate from startMagicLink because a link is needed in two places that
 * want to say very different things: the sign-in flow, and the payment
 * confirmation that has to get a paying customer into the app without making
 * them go and request a login first.
 *
 * Returns null for an unusable address so the caller cannot accidentally build
 * a link for one.
 */
export async function mintMagicLink(
  emailRaw: string
): Promise<{ url: string; ttlMinutes: number } | null> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes("@")) return null;

  const token = randomToken("mlk");
  await query(
    `
    INSERT INTO auth_tokens (email, token_hash, expires_at)
    VALUES ($1, $2, now() + ($3 || ' minutes')::interval)
    `,
    [email, sha256(token), TOKEN_TTL_MIN]
  );

  const appBase = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  return {
    url: `${appBase}/auth/callback?token=${encodeURIComponent(token)}`,
    ttlMinutes: TOKEN_TTL_MIN
  };
}

export async function startMagicLink(emailRaw: string): Promise<{ ok: true }> {
  const email = emailRaw.trim().toLowerCase();

  // Always return ok=true (prevent enumeration)
  const minted = await mintMagicLink(email);
  if (!minted) return { ok: true };
  const { url } = minted;

  // Awaited, not fire-and-forget: on serverless and on a SIGTERM during deploy
  // a detached promise is simply lost, and the customer waits for a link that
  // was never sent. The response is still ok=true either way — see below.
  const sent = await notify(signInEmail(email, url, TOKEN_TTL_MIN));
  if (!sent.ok) {
    // Deliberately not surfaced to the caller. Reporting "we could not email
    // that address" tells an attacker which addresses exist, which is the
    // enumeration leak the ok=true contract exists to prevent. It is logged
    // loudly by sendEmail, and /ready fails when no transport is configured,
    // so this cannot go unnoticed operationally.
    console.error("[DD84] a customer could not be sent a sign-in link");
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
