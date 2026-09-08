import type { NextFunction, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@ecommerce/shared";
import { prisma } from "../models/db.js";
import { login, register } from "./authController.js";

vi.mock("../models/db.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(() => "test-jwt"),
  },
}));

const findUnique = vi.mocked(prisma.user.findUnique);
const create = vi.mocked(prisma.user.create);
const bcryptHash = vi.mocked(bcrypt.hash);
const bcryptCompare = vi.mocked(bcrypt.compare);
const jwtSign = vi.mocked(jwt.sign);

function makeReq(body: unknown): Request {
  return { body } as Request;
}

interface CapturedRes {
  res: Response;
  statusCode: number | undefined;
  payload: unknown;
}

function makeRes(): CapturedRes {
  const captured = {} as CapturedRes;
  captured.statusCode = undefined;
  captured.payload = undefined;
  captured.res = {} as Response;
  captured.res.status = ((code: number) => {
    captured.statusCode = code;
    return captured.res;
  }) as unknown as Response["status"];
  captured.res.json = ((payload: unknown) => {
    captured.payload = payload;
    return captured.res;
  }) as unknown as Response["json"];
  return captured;
}

type MockNext = NextFunction & { calls: unknown[][] };

function makeNext(): MockNext {
  const fn = vi.fn();
  return Object.assign(fn, { calls: fn.mock.calls }) as MockNext;
}

/** Assert next() was called exactly once and return the forwarded error. */
function nextError(next: MockNext): unknown {
  expect(next).toHaveBeenCalledTimes(1);
  return next.calls[0]?.[0];
}

const dbUser = {
  id: "fb8f22ee-7086-4548-966a-28fae2847278",
  email: "test@example.com",
  passwordHash: "hashed-password",
  role: "CUSTOMER" as const,
  createdAt: new Date("2026-09-08T20:10:21.025Z"),
};

const credentials = { email: "test@example.com", password: "password123" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("register", () => {
  it("creates the user and returns 201 with user + token", async () => {
    findUnique.mockResolvedValue(null);
    bcryptHash.mockResolvedValue("hashed-password" as never);
    create.mockResolvedValue(dbUser);

    const cap = makeRes();
    const next = makeNext();

    await register(makeReq(credentials), cap.res, next);

    expect(findUnique).toHaveBeenCalledWith({ where: { email: credentials.email } });
    expect(bcryptHash).toHaveBeenCalledWith(credentials.password, 10);
    expect(jwtSign).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(cap.statusCode).toBe(201);
    expect(cap.payload).toEqual({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        createdAt: dbUser.createdAt,
      },
      token: "test-jwt",
    });
  });

  it("forwards a 409 HttpError when the email is already registered", async () => {
    findUnique.mockResolvedValue(dbUser);

    const cap = makeRes();
    const next = makeNext();

    await register(makeReq(credentials), cap.res, next);

    expect(create).not.toHaveBeenCalled();
    const err = nextError(next);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(409);
  });

  it("forwards a 400 HttpError for an invalid email", async () => {
    const cap = makeRes();
    const next = makeNext();

    await register(makeReq({ email: "not-an-email", password: "password123" }), cap.res, next);

    expect(findUnique).not.toHaveBeenCalled();
    const err = nextError(next);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  });

  it("forwards a 400 HttpError for a short password", async () => {
    const cap = makeRes();
    const next = makeNext();

    await register(makeReq({ email: "test@example.com", password: "short" }), cap.res, next);

    expect(findUnique).not.toHaveBeenCalled();
    const err = nextError(next);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(400);
  });

  it("forwards database failures to next", async () => {
    findUnique.mockResolvedValue(null);
    bcryptHash.mockResolvedValue("hashed-password" as never);
    const failure = new Error("db is down");
    create.mockRejectedValue(failure);

    const cap = makeRes();
    const next = makeNext();

    await register(makeReq(credentials), cap.res, next);

    expect(next).toHaveBeenCalledWith(failure);
  });
});

describe("login", () => {
  it("returns the user + token when credentials are valid", async () => {
    findUnique.mockResolvedValue(dbUser);
    bcryptCompare.mockResolvedValue(true as never);

    const cap = makeRes();
    const next = makeNext();

    await login(makeReq(credentials), cap.res, next);

    expect(bcryptCompare).toHaveBeenCalledWith(credentials.password, "hashed-password");
    expect(jwtSign).toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(cap.statusCode).toBeUndefined();
    expect(cap.payload).toEqual({
      user: {
        id: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        createdAt: dbUser.createdAt,
      },
      token: "test-jwt",
    });
  });

  it("forwards a 401 HttpError for an unknown email", async () => {
    findUnique.mockResolvedValue(null);

    const cap = makeRes();
    const next = makeNext();

    await login(makeReq({ email: "nobody@example.com", password: "password123" }), cap.res, next);

    expect(bcryptCompare).not.toHaveBeenCalled();
    const err = nextError(next);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(401);
  });

  it("forwards a 401 HttpError for a wrong password", async () => {
    findUnique.mockResolvedValue(dbUser);
    bcryptCompare.mockResolvedValue(false as never);

    const cap = makeRes();
    const next = makeNext();

    await login(makeReq({ email: "test@example.com", password: "wrong-password" }), cap.res, next);

    expect(jwtSign).not.toHaveBeenCalled();
    const err = nextError(next);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(401);
  });
});
