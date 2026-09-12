import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Events, HttpError, publishEvent } from "@ecommerce/shared";
import { prisma } from "../models/db.js";
import { fetchPriceSnapshot } from "../lib/products.js";
import { checkout, getOrder, listMyOrders } from "./ordersController.js";

vi.mock("../models/db.js", () => ({
  prisma: {
    order: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("../lib/products.js", () => ({
  fetchPriceSnapshot: vi.fn(),
}));

vi.mock("@ecommerce/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ecommerce/shared")>();
  return { ...actual, publishEvent: vi.fn() };
});

const findMany = vi.mocked(prisma.order.findMany);
const findFirst = vi.mocked(prisma.order.findFirst);
const create = vi.mocked(prisma.order.create);
const snapshotMock = vi.mocked(fetchPriceSnapshot);
const publishEventMock = vi.mocked(publishEvent);

const createdAt = new Date("2026-09-11T15:20:43.687Z");
const USER_ID = "3dc71024-33fb-4aae-9f26-d37d733cfaa1";

const storedOrder = {
  id: "916b2aef-ac3a-442f-b0ed-1b7bf53a7056",
  userId: USER_ID,
  status: "PENDING" as const,
  totalCents: 2500,
  currency: "USD",
  correlationId: "corr-1",
  createdAt,
  updatedAt: createdAt,
  items: [
    {
      id: "item-1",
      orderId: "916b2aef-ac3a-442f-b0ed-1b7bf53a7056",
      productId: "p1",
      name: "Phone",
      unitPriceCents: 1000,
      quantity: 2,
      createdAt,
    },
  ],
};

interface ReqOpts {
  headers?: Record<string, string | undefined>;
  params?: Record<string, string>;
  body?: unknown;
}

function makeReq(opts: ReqOpts = {}): Request {
  return {
    header: (name: string) => opts.headers?.[name],
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: {},
  } as unknown as Request;
}

function authedReq(opts: Omit<ReqOpts, "headers"> = {}, userId: string = USER_ID): Request {
  return makeReq({ ...opts, headers: { "x-user-id": userId } });
}

interface Captured {
  res: Response;
  statusCode: number | undefined;
  payload: unknown;
}

function makeRes(): Captured {
  const captured = {} as Captured;
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

function errorStatus(next: MockNext): number {
  expect(next).toHaveBeenCalledTimes(1);
  return (next.calls[0]?.[0] as HttpError).status;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkout", () => {
  const P1 = "c2dd16f4-1498-4b7c-b5dc-624f545e4f61";
  const P2 = "a09cd577-b570-4c81-94e9-52e707a87335";
  const P9 = "11111111-2222-4333-8444-555555555555";
  const body = {
    items: [
      { productId: P1, quantity: 2 },
      { productId: P2, quantity: 1 },
    ],
  };

  it("snapshots prices, stores a PENDING order and publishes order.placed", async () => {
    snapshotMock
      .mockResolvedValueOnce({ productId: P1, name: "Phone", unitPriceCents: 1000 })
      .mockResolvedValueOnce({ productId: P2, name: "Case", unitPriceCents: 500 });
    create.mockResolvedValue(storedOrder);

    const cap = makeRes();
    const next = makeNext();
    await checkout(authedReq({ body }), cap.res, next);

    expect(next).not.toHaveBeenCalled();
    expect(cap.statusCode).toBe(201);
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0]?.[0]?.data as { totalCents: number; status?: string };
    expect(data.totalCents).toBe(2500); // 1000*2 + 500*1
    expect(publishEventMock).toHaveBeenCalledTimes(1);
    expect(publishEventMock).toHaveBeenCalledWith(
      Events.OrderPlaced,
      { orderId: storedOrder.id, userId: USER_ID, totalCents: 2500 },
      expect.any(String),
    );
    expect(cap.payload).toEqual(storedOrder);
  });

  it("rejects missing identity with 401 before touching anything", async () => {
    const cap = makeRes();
    const next = makeNext();
    await checkout(makeReq({ body }), cap.res, next);

    expect(errorStatus(next)).toBe(401);
    expect(snapshotMock).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid items", async () => {
    const cap = makeRes();
    const next = makeNext();
    await checkout(authedReq({ body: { items: [] } }), cap.res, next);

    expect(errorStatus(next)).toBe(400);
    expect(create).not.toHaveBeenCalled();
    expect(publishEventMock).not.toHaveBeenCalled();
  });

  it("propagates catalog failures without storing or publishing", async () => {
    snapshotMock.mockRejectedValue(new HttpError(404, "Product p9 not found"));

    const cap = makeRes();
    const next = makeNext();
    await checkout(
      authedReq({ body: { items: [{ productId: P9, quantity: 1 }] } }),
      cap.res,
      next,
    );

    expect(errorStatus(next)).toBe(404);
    expect(create).not.toHaveBeenCalled();
    expect(publishEventMock).not.toHaveBeenCalled();
  });
});

describe("listMyOrders / getOrder", () => {
  it("lists only the caller's orders", async () => {
    findMany.mockResolvedValue([storedOrder]);

    const cap = makeRes();
    await listMyOrders(authedReq(), cap.res, makeNext());

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID } }),
    );
    expect(cap.payload).toEqual([storedOrder]);
  });

  it("scopes single-order reads to the caller", async () => {
    findFirst.mockResolvedValue(storedOrder);

    const cap = makeRes();
    await getOrder(authedReq({ params: { id: storedOrder.id } }), cap.res, makeNext());

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: storedOrder.id, userId: USER_ID } }),
    );
    expect(cap.payload).toEqual(storedOrder);
  });

  it("returns 404 for foreign or missing orders", async () => {
    findFirst.mockResolvedValue(null);

    const cap = makeRes();
    const next = makeNext();
    await getOrder(authedReq({ params: { id: "other" } }), cap.res, next);

    expect(errorStatus(next)).toBe(404);
  });
});
