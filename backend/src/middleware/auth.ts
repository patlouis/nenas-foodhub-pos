import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

export interface AuthUser {
  sub: string;
  name: string;
  role: "admin" | "cashier";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

// Rejects any request that doesn't carry a valid "Authorization: Bearer <token>".
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET as string) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

// Rejects requests from non-admin users. Must be used after requireAuth.
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
