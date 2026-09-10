import type { NextFunction, Request, Response } from "express";
import { HttpError } from "@ecommerce/shared";

/**
 * Downstream of the gateway: JWT verification already happened there, so this
 * service trusts the forwarded x-user-role header ("admin" | "customer").
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.header("x-user-role") !== "admin") {
    next(new HttpError(403, "Admin access required"));
    return;
  }
  next();
}
