import type { Request } from "express";
import { HttpError } from "@ecommerce/shared";

/**
 * Downstream of the gateway: JWT verification already happened there, so this
 * service trusts the forwarded x-user-id header.
 */
export function requireUserId(req: Request): string {
  const userId = req.header("x-user-id");
  if (!userId) {
    throw new HttpError(401, "Missing user identity");
  }
  return userId;
}
