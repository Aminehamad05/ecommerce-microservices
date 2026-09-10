import { Prisma } from "../generated/client/index.js";
import { HttpError } from "@ecommerce/shared";
import type { ZodType } from "zod";

/** Validate unknown input, converting failures to a 400 HttpError. */
export function parseBody<T>(schema: ZodType<T>, body: unknown): T {
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
