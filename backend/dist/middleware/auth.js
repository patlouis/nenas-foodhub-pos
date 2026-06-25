import jwt from "jsonwebtoken";
// Rejects any request that doesn't carry a valid "Authorization: Bearer <token>".
export function requireAuth(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: "Authentication required" });
    }
    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    }
    catch {
        return res.status(401).json({ error: "Invalid or expired session" });
    }
}
// Rejects requests from non-admin users. Must be used after requireAuth.
export function requireAdmin(req, res, next) {
    if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
}
