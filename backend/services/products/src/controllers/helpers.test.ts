import type { Request } from "express";
import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@ecommerce/shared";
import { z } from "zod";
import { Prisma } from "../generated/client/index.js";
import { parseBody, requireId, toHttpError } from "./helpers.js";

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("db error", {
    code,
    clientVersion: "test",
  });
}

describe("parseBody", () => {
  const schema = z.object({ name: z.string().min(1) });

  it("returns validated data", () => {
    expect(parseBody(schema, { name: "Phones" })).toEqual({ name: "Phones" });
  });

  it("throws a 400 HttpError with field details", () => {
    try {
      parseBody(schema, { name: "" });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(400);
      expect((err as HttpError).message).toContain("name");
    }
  });
});

describe("toHttpError", () => {
  it("maps P2002 to 409", () => {
    const err = toHttpError(prismaError("P2002"));
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(409);
  });

  it("maps P2025 to 404", () => {
    expect((toHttpError(prismaError("P2025")) as HttpError).status).toBe(404);
  });

  it("maps P2003 to 409", () => {
    expect((toHttpError(prismaError("P2003")) as HttpError).status).toBe(409);
  });

  it("passes unknown errors through untouched", () => {
    const failure = new Error("boom");
    expect(toHttpError(failure)).toBe(failure);
  });
});

describe("requireId", () => {
  it("returns the id param", () => {
    expect(requireId({ params: { id: "abc" } } as unknown as Request)).toBe("abc");
  });

  it("throws 400 when missing", () => {
    const next = vi.fn();
    try {
      requireId({ params: {} } as unknown as Request);
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as HttpError).status).toBe(400);
    }
    expect(next).not.toHaveBeenCalled();
  });
});
