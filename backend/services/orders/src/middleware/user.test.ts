import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { HttpError } from "@ecommerce/shared";
import { requireId, requireUserId } from "./user.js";

function makeReq(headers: Record<string, string> = {}, params: Record<string, string> = {}): Request {
  return {
    header: (name: string) => headers[name],
    params,
  } as unknown as Request;
}

describe("requireUserId", () => {
  it("returns the forwarded user id", () => {
    expect(requireUserId(makeReq({ "x-user-id": "user-1" }))).toBe("user-1");
  });

  it("throws 401 when the gateway header is missing", () => {
    try {
      requireUserId(makeReq());
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(HttpError);
      expect((err as HttpError).status).toBe(401);
    }
  });
});

describe("requireId", () => {
  it("returns the id param", () => {
    expect(requireId(makeReq({}, { id: "order-1" }))).toBe("order-1");
  });

  it("throws 400 when missing", () => {
    try {
      requireId(makeReq());
      expect.unreachable("should have thrown");
    } catch (err) {
      expect((err as HttpError).status).toBe(400);
    }
  });
});
