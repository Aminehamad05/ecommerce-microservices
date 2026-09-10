import { Prisma } from "../generated/client/index.js";
import { HttpError } from "@ecommerce/shared";
import type { Request } from "express";
import type { ZodType } from "zod";

/** Extract the :id route param, rejecting requests without one. */
export function requireId(req: Request): string {
  const id = req.params.id;
  if (!id) {
    throw new HttpError(400, "Missing id parameter");
  }
  return id;
}

/** Validate unknown input, converting failures to a 400 HttpError. */export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new HttpError(400, `Invalid input: ${details}`);
  }
  return result.data;
}

/** Map common Prisma errors to typed HTTP errors; anything else passes through. */
export function toHttpError(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return new HttpError(409, "Resource already exists");
    }
    if (err.code === "P2025") {
      return new HttpError(404, "Resource not found");
    }
    if (err.code === "P2003") {
      return new HttpError(409, "Cannot delete: still referenced by other records");
    }
  }
  return err;
}
