import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "@ecommerce/shared";

const JWT_SECRET = (() => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return secret;
})();

/**
 * Verifies the JWT at the gateway; downstream services trust the
 * forwarded x-user-id / x-user-role headers.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] });
    if (typeof decoded === "string") {
      res.status(401).json({ error: "Invalid token" });
      return;
    }
    req.user = decoded as JwtPayload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}
