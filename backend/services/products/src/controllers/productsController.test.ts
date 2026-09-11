import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@ecommerce/shared";
import { Prisma } from "../generated/client/index.js";
import { prisma } from "../models/db.js";
import {
  bumpListVersion,
  cacheDel,
  cacheGet,
  cacheSet,
  markCache,
} from "../models/cache.js";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "./productsController.js";

vi.mock("../models/db.js", () => ({
  prisma: {
    product: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock("../models/cache.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../models/cache.js")>();
  return {
    ...actual,
    cacheGet: vi.fn(),
    cacheSet: vi.fn(),
    cacheDel: vi.fn(),
    cacheDelPattern: vi.fn(),
    getListVersion: vi.fn(async () => "1"),
    bumpListVersion: vi.fn(),
    markCache: vi.fn(),
  };
});

const findMany = vi.mocked(prisma.product.findMany);
const findUnique = vi.mocked(prisma.product.findUnique);
const create = vi.mocked(prisma.product.create);
const update = vi.mocked(prisma.product.update);
const remove = vi.mocked(prisma.product.delete);
const count = vi.mocked(prisma.product.count);
const cacheGetMock = vi.mocked(cacheGet);
const cacheSetMock = vi.mocked(cacheSet);
const cacheDelMock = vi.mocked(cacheDel);
const bumpVersionMock = vi.mocked(bumpListVersion);
const markCacheMock = vi.mocked(markCache);

const createdAt = new Date("2026-09-11T11:37:07.575Z");

const dbCategory = {
  id: "6fc70c5b-dc85-44eb-801f-2419fe941f38",
  name: "Phones",
  slug: "phones",
  description: "Smartphones",
  imageUrl: null,
  parentId: null,
  createdAt,
  updatedAt: createdAt,
};

const dbProduct = {
  id: "e4631d08-03a8-4a96-8cad-ed3d7579cb47",
  sku: "PH-001",
  name: "Phone X",
  slug: "phone-x",
  description: null,
  brand: "Novaphone",
  price: new Prisma.Decimal("699.99"),
  compareAtPrice: null,
  currency: "USD",
  stock: 5,
  status: "ACTIVE" as const,
  isFeatured: false,
  tags: ["5g"],
  attributes: null,
  ratingAvg: new Prisma.Decimal("4.50"),
  reviewCount: 10,
  categoryId: dbCategory.id,
  createdAt,
  updatedAt: createdAt,
  category: dbCategory,
  images: [
    {
      id: "bbe3c364-6d15-4b79-baf5-bc02b143efd4",
      url: "https://example.com/p.jpg",
      altText: null,
      position: 0,
      productId: "e4631d08-03a8-4a96-8cad-ed3d7579cb47",
      createdAt,
    },
  ],
};

const validInput = {
  sku: "PH-001",
  name: "Phone X",
  slug: "phone-x",
  price: 699.99,
  categoryId: dbCategory.id,
};

interface Captured {
  res: Response;
  statusCode: number | undefined;
  payload: unknown;
}

function makeReq(params: Record<string, string> = {}, body: unknown = {}, query: unknown = {}): Request {
  return { params, body, query } as unknown as Request;
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
  captured.res.sendStatus = ((code: number) => {
    captured.statusCode = code;
    return captured.res;
  }) as unknown as Response["sendStatus"];
  return captured;
}

type MockNext = NextFunction & { calls: unknown[][] };

function makeNext(): MockNext {
  const fn = vi.fn();
  return Object.assign(fn, { calls: fn.mock.calls }) as MockNext;
}

function prismaKnownError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("db error", { code, clientVersion: "test" });
}

beforeEach(() => {
  vi.clearAllMocks();
  cacheGetMock.mockResolvedValue(null);
});

describe("listProducts", () => {
  it("serves from the database and caches on MISS", async () => {
    count.mockResolvedValue(1);
    findMany.mockResolvedValue([dbProduct]);

    const cap = makeRes();
    await listProducts(makeReq(), cap.res, makeNext());

    expect(count).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(cacheSetMock).toHaveBeenCalledTimes(1);
    expect(markCacheMock).toHaveBeenCalledWith(cap.res, false);
    expect(cap.payload).toEqual({ data: [dbProduct], page: 1, limit: 20, total: 1 });
  });

  it("serves from cache on HIT without touching the database", async () => {
    const cached = { data: [dbProduct], page: 1, limit: 20, total: 1 };
    cacheGetMock.mockResolvedValue(cached);

    const cap = makeRes();
    await listProducts(makeReq(), cap.res, makeNext());

    expect(count).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
    expect(markCacheMock).toHaveBeenCalledWith(cap.res, true);
    expect(cap.payload).toEqual(cached);
  });

  it("returns 400 for invalid query params", async () => {
    const cap = makeRes();
    const next = makeNext();

    await listProducts(makeReq({}, {}, { limit: "500" }), cap.res, next);

    expect(findMany).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect((next.calls[0]?.[0] as HttpError).status).toBe(400);
  });
});

describe("getProduct", () => {
  it("serves from cache on HIT", async () => {
    cacheGetMock.mockResolvedValue(dbProduct);

    const cap = makeRes();
    await getProduct(makeReq({ id: dbProduct.id }), cap.res, makeNext());

    expect(findUnique).not.toHaveBeenCalled();
    expect(cap.payload).toEqual(dbProduct);
  });

  it("reads through and caches on MISS", async () => {
    findUnique.mockResolvedValue(dbProduct);

    const cap = makeRes();
    await getProduct(makeReq({ id: dbProduct.id }), cap.res, makeNext());

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: dbProduct.id },
      include: expect.anything(),
    });
    expect(cacheSetMock).toHaveBeenCalledTimes(1);
    expect(cap.payload).toEqual(dbProduct);
  });

  it("returns 404 for unknown id without caching", async () => {
    findUnique.mockResolvedValue(null);

    const cap = makeRes();
    const next = makeNext();
    await getProduct(makeReq({ id: dbProduct.id }), cap.res, next);

    expect(cacheSetMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect((next.calls[0]?.[0] as HttpError).status).toBe(404);
  });
});

describe("createProduct", () => {
  it("creates with 201 and invalidates catalog caches", async () => {
    create.mockResolvedValue(dbProduct);

    const cap = makeRes();
    const next = makeNext();
    await createProduct(makeReq({}, validInput), cap.res, next);

    expect(next).not.toHaveBeenCalled();
    expect(cap.statusCode).toBe(201);
    expect(cap.payload).toEqual(dbProduct);
    expect(cacheDelMock).toHaveBeenCalled();
    expect(bumpVersionMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 without touching the database", async () => {
    const cap = makeRes();
    const next = makeNext();
    await createProduct(makeReq({}, { name: "x" }), cap.res, next);

    expect(create).not.toHaveBeenCalled();
    expect((next.calls[0]?.[0] as HttpError).status).toBe(400);
  });

  it("maps duplicate sku/slug to 409", async () => {
    create.mockRejectedValue(prismaKnownError("P2002"));

    const cap = makeRes();
    const next = makeNext();
    await createProduct(makeReq({}, validInput), cap.res, next);

    expect((next.calls[0]?.[0] as HttpError).status).toBe(409);
  });
});

describe("updateProduct", () => {
  it("updates and invalidates", async () => {
    update.mockResolvedValue({ ...dbProduct, stock: 50 });

    const cap = makeRes();
    await updateProduct(makeReq({ id: dbProduct.id }, { stock: 50 }), cap.res, makeNext());

    expect(update).toHaveBeenCalledTimes(1);
    expect((cap.payload as typeof dbProduct).stock).toBe(50);
    expect(cacheDelMock).toHaveBeenCalled();
    expect(bumpVersionMock).toHaveBeenCalledTimes(1);
  });

  it("maps unknown id to 404", async () => {
    update.mockRejectedValue(prismaKnownError("P2025"));

    const cap = makeRes();
    const next = makeNext();
    await updateProduct(makeReq({ id: dbProduct.id }, { stock: 1 }), cap.res, next);

    expect((next.calls[0]?.[0] as HttpError).status).toBe(404);
  });
});

describe("deleteProduct", () => {
  it("deletes with 204 and invalidates", async () => {
    remove.mockResolvedValue(dbProduct);

    const cap = makeRes();
    await deleteProduct(makeReq({ id: dbProduct.id }), cap.res, makeNext());

    expect(remove).toHaveBeenCalledWith({ where: { id: dbProduct.id } });
    expect(cap.statusCode).toBe(204);
    expect(cacheDelMock).toHaveBeenCalled();
    expect(bumpVersionMock).toHaveBeenCalledTimes(1);
  });

  it("maps unknown id to 404", async () => {
    remove.mockRejectedValue(prismaKnownError("P2025"));

    const cap = makeRes();
    const next = makeNext();
    await deleteProduct(makeReq({ id: dbProduct.id }), cap.res, next);

    expect((next.calls[0]?.[0] as HttpError).status).toBe(404);
  });
});
