import { Router } from "express";
import { startMagicLink, verifyMagicLink, logoutSession } from "../services/auth/auth.service.js";
import { setSessionCookie, clearSessionCookie } from "../middleware/session.js";

export const authRouter = Router();

authRouter.post("/start", async (req, res) => {
  const email = String(req.body?.email ?? "");
  await startMagicLink(email);
  return res.json({ ok: true });
});

authRouter.post("/verify", async (req, res) => {
  const token = String(req.body?.token ?? "");
  if (!token) return res.status(400).json({ error: "BAD_REQUEST", message: "token is required" });

  try {
    const { user, sessionToken } = await verifyMagicLink(token);
    setSessionCookie(res, sessionToken);
    return res.json({ user });
  } catch {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Invalid or expired token." });
  }
});

authRouter.post("/logout", async (req, res) => {
  const raw = (req as any).cookies?.dd84_session;
  await logoutSession(raw);
  clearSessionCookie(res);
  return res.json({ ok: true });
});
