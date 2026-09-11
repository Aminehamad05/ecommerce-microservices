import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { requireAdmin } from "./requireAdmin.js";

function makeReq(role: string | undefined): Request {
  return { header: () => role } as unknown as Request;
}

describe("requireAdmin", () => {
  it("passes admin requests through", () => {
    const next = vi.fn() as unknown as NextFunction;

    requireAdmin(makeReq("admin"), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it.each([["customer"], [undefined]])("rejects role %s with 403", (role) => {
    const next = vi.fn() as unknown as NextFunction;

    requireAdmin(makeReq(role), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as {
      status: number;
    };
    expect(err.status).toBe(403);
  });
});
