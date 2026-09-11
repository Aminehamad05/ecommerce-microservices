import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@ecommerce/shared";
import { Prisma } from "../generated/client/index.js";
import { prisma } from "../models/db.js";
import { bumpListVersion, cacheDel, cacheGet, cacheSet, markCache } from "../models/cache.js";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "./categoriesController.js";

vi.mock("../models/db.js", () => ({
  prisma: {
    category: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
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

const findMany = vi.mocked(prisma.category.findMany);
const findUnique = vi.mocked(prisma.category.findUnique);
const create = vi.mocked(prisma.category.create);
const update = vi.mocked(prisma.category.update);
const remove = vi.mocked(prisma.category.delete);
const cacheGetMock = vi.mocked(cacheGet);
const cacheSetMock = vi.mocked(cacheSet);
const cacheDelMock = vi.mocked(cacheDel);
const bumpVersionMock = vi.mocked(bumpListVersion);
const markCacheMock = vi.mocked(markCache);

const createdAt = new Date("2026-09-11T11:37:07.549Z");

const dbCategory = {
  id: "e44cf38a-b905-496c-9c95-c1a91cabdca6",
  name: "Electronics",
  slug: "electronics",
  description: "Gadgets",
  imageUrl: null,
  parentId: null,
  createdAt,
  updatedAt: createdAt,
};

interface Captured {
  res: Response;
  statusCode: number | undefined;
  payload: unknown;
}

function makeReq(params: Record<string, string> = {}, body: unknown = {}): Request {
  return { params, body } as unknown as Request;
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

function errorStatus(next: MockNext): number {
  expect(next).toHaveBeenCalledTimes(1);
  return (next.calls[0]?.[0] as HttpError).status;
}

beforeEach(() => {
  vi.clearAllMocks();
  cacheGetMock.mockResolvedValue(null);
});

describe("listCategories", () => {
  it("caches on MISS and serves from cache on HIT", async () => {
    findMany.mockResolvedValue([dbCategory]);

    const miss = makeRes();
    await listCategories(makeReq(), miss.res, makeNext());
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(cacheSetMock).toHaveBeenCalledTimes(1);
    expect(markCacheMock).toHaveBeenCalledWith(miss.res, false);
    expect(miss.payload).toEqual([dbCategory]);

    cacheGetMock.mockResolvedValue([dbCategory]);
    const hit = makeRes();
    await listCategories(makeReq(), hit.res, makeNext());
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(markCacheMock).toHaveBeenCalledWith(hit.res, true);
    expect(hit.payload).toEqual([dbCategory]);
  });
});

describe("getCategory", () => {
  it("returns 404 for unknown id without caching", async () => {
    findUnique.mockResolvedValue(null);

    const cap = makeRes();
    const next = makeNext();
    await getCategory(makeReq({ id: dbCategory.id }), cap.res, next);

    expect(cacheSetMock).not.toHaveBeenCalled();
    expect(errorStatus(next)).toBe(404);
  });
});

describe("createCategory", () => {
  it("creates with 201 and invalidates", async () => {
    create.mockResolvedValue(dbCategory);

    const cap = makeRes();
    const next = makeNext();
    await createCategory(makeReq({}, { name: "Electronics", slug: "electronics" }), cap.res, next);

    expect(next).not.toHaveBeenCalled();
    expect(cap.statusCode).toBe(201);
    expect(cacheDelMock).toHaveBeenCalled();
    expect(bumpVersionMock).toHaveBeenCalledTimes(1);
  });

  it("returns 400 for invalid input and maps duplicates to 409", async () => {
    const bad = makeRes();
    const badNext = makeNext();
    await createCategory(makeReq({}, { name: "", slug: "Bad Slug" }), bad.res, badNext);
    expect(create).not.toHaveBeenCalled();
    expect(errorStatus(badNext)).toBe(400);

    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" }),
    );
    const dup = makeRes();
    const dupNext = makeNext();
    await createCategory(makeReq({}, { name: "E", slug: "e" }), dup.res, dupNext);
    expect(errorStatus(dupNext)).toBe(409);
  });
});

describe("updateCategory / deleteCategory", () => {
  it("updates and deletes with invalidation", async () => {
    update.mockResolvedValue({ ...dbCategory, name: "Electro" });
    remove.mockResolvedValue(dbCategory);

    const up = makeRes();
    await updateCategory(makeReq({ id: dbCategory.id }, { name: "Electro" }), up.res, makeNext());
    expect((up.payload as typeof dbCategory).name).toBe("Electro");

    const del = makeRes();
    await deleteCategory(makeReq({ id: dbCategory.id }), del.res, makeNext());
    expect(del.statusCode).toBe(204);

    expect(cacheDelMock).toHaveBeenCalled();
    expect(bumpVersionMock).toHaveBeenCalledTimes(2);
  });

  it("maps unknown id to 404", async () => {
    update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("nf", { code: "P2025", clientVersion: "test" }),
    );
    const cap = makeRes();
    const next = makeNext();
    await updateCategory(makeReq({ id: dbCategory.id }, { name: "x" }), cap.res, next);
    expect(errorStatus(next)).toBe(404);
  });
});
