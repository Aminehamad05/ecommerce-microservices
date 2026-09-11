import type { NextFunction, Request, Response } from "express";
import { HttpError } from "@ecommerce/shared";

/**
 * Downstream of the gateway: JWT verification already happened there, so this
 * service trusts the forwarded x-user-id / x-user-role headers.
 */

/** Every order route needs to know *whose* order it is. */
export function requireUserId(req: Request): string {
  const userId = req.header("x-user-id");
  if (!userId) {
    throw new HttpError(401, "Missing user identity");
  }
  return userId;
}

/** Extract the :id route param, rejecting requests without one. */
export function requireId(req: Request): string {
  const id = req.params.id;
  if (!id) {
    throw new HttpError(400, "Missing id parameter");
  }
  return id;
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.header("x-user-role") !== "admin") {
    next(new HttpError(403, "Admin access required"));
    return;
  }
  next();
}
