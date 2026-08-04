import { Request, Response, NextFunction } from "express";
import { query } from "../db.js";
import { sha256 } from "../services/auth/crypto.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
    }
  }
}

const COOKIE_NAME = "dd84_session";
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 14);

export async function loadUserFromSession(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = (req as any).cookies?.[COOKIE_NAME];
    if (!token) return next();

    const sessionHash = sha256(token);

    const rows = await query<{ user_id: string; email: string }>(
      `
      SELECT s.user_id, u.email
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.session_hash = $1
        AND s.expires_at > now()
      LIMIT 1
      `,
      [sessionHash]
    );

    if (rows.length === 0) return next();
    req.user = { id: rows[0].user_id, email: rows[0].email };
    return next();
  } catch {
    return next();
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Login required." });
  }
  return next();
}

export function setSessionCookie(res: Response, rawSessionToken: string) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(COOKIE_NAME, rawSessionToken, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(COOKIE_NAME, { path: "/" });
}
