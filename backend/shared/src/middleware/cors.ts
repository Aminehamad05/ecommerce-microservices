import type { NextFunction, Request, Response } from "express";

/**
 * Permissive CORS for local development and browser-based manual testing
 * (e.g. opening test HTML pages via file:// or another origin).
 *
 * Allows any origin and answers preflight OPTIONS requests. Do not use
 * this in production — replace with a strict allow-list there.
 */
export function corsDev(req: Request, res: Response, next: NextFunction): void {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}
