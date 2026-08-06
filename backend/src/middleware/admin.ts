import { Request, Response, NextFunction } from "express";

/**
 * Admin identity comes from the ADMIN_EMAILS env var (comma-separated).
 * Kept out of the database deliberately: admin rights should not be
 * grantable by anything the application itself can write to.
 */
function adminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS || "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return adminEmails().has(email.trim().toLowerCase());
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: "UNAUTHORIZED", message: "Login required." });
  }
  if (!isAdminEmail(req.user.email)) {
    return res.status(403).json({ error: "FORBIDDEN", message: "Admin access required." });
  }
  return next();
}
