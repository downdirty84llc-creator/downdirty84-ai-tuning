export function requireAdmin(req, res, next) {
    const email = (req.user?.email || "").toLowerCase();
    const allowlist = String(process.env.ADMIN_EMAILS || "")
        .split(",")
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean);
    if (!email || allowlist.length === 0 || !allowlist.includes(email)) {
        return res.status(403).json({ error: "FORBIDDEN", message: "Admin access required." });
    }
    return next();
}
