import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../generated/client/index.js";
import { HttpError } from "@ecommerce/shared";
import { prisma } from "../models/db.js";
import {
  CATEGORIES_LIST_KEY,
  CATEGORY_KEY,
  LIST_TTL,
  PRODUCT_KEY,
  PRODUCT_TTL,
  bumpListVersion,
  cacheDel,
  cacheDelPattern,
  cacheGet,
  cacheSet,
  getListVersion,
  listKey,
  markCache,
} from "../models/cache.js";
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from "../schemas/catalog.js";
import { parseBody, requireId, toHttpError } from "./helpers.js";

const productInclude = {
  category: true,
  images: { orderBy: { position: "asc" as const } },
};

/** Invalidate everything a product write can stale: detail, listings, category views. */
async function invalidateProduct(id: string): Promise<void> {
  await cacheDel(PRODUCT_KEY(id), CATEGORIES_LIST_KEY);
  await cacheDelPattern(`${CATEGORY_KEY("")}*`);
  await bumpListVersion();
}

export async function listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = parseBody(listProductsQuerySchema, req.query);
    const { page, limit, categoryId, status, featured, search } = query;

    const version = await getListVersion();
    const key = listKey(query as Record<string, unknown>, version);
    const cached = await cacheGet<unknown>(key);
    if (cached !== null) {
      markCache(res, true);
      res.json(cached);
      return;
    }

    const where: Prisma.ProductWhereInput = {
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(featured !== undefined ? { isFeatured: featured } : {}),
      ...(search !== undefined
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { sku: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [total, data] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const body = { data, page, limit, total };
    await cacheSet(key, body, LIST_TTL);
    markCache(res, false);
    res.json(body);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = requireId(req);
    const key = PRODUCT_KEY(id);
    const cached = await cacheGet<unknown>(key);
    if (cached !== null) {
      markCache(res, true);
      res.json(cached);
      return;
    }

    const product = await prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) {
      throw new HttpError(404, "Product not found");
    }
    await cacheSet(key, product, PRODUCT_TTL);
    markCache(res, false);
    res.json(product);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function createProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseBody(createProductSchema, req.body);
    const { images, attributes, ...rest } = input;

    const product = await prisma.product.create({
      data: {
        ...rest,
        attributes: attributes as Prisma.InputJsonValue | undefined,
        images: { create: images },
      },
      include: productInclude,
    });

    await invalidateProduct(product.id);
    res.status(201).json(product);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function updateProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseBody(updateProductSchema, req.body);
    const { images, attributes, ...rest } = input;

    const data: Prisma.ProductUpdateInput = {
      ...rest,
      ...(attributes !== undefined ? { attributes: attributes as Prisma.InputJsonValue } : {}),
      // Full replacement when provided; untouched when omitted.
      ...(images !== undefined ? { images: { deleteMany: {}, create: images } } : {}),
    };

    const product = await prisma.product.update({
      where: { id: requireId(req) },
      data,
      include: productInclude,
    });

    await invalidateProduct(product.id);
    res.json(product);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = requireId(req);
    await prisma.product.delete({ where: { id } });
    await invalidateProduct(id);
    res.sendStatus(204);
  } catch (err) {
    next(toHttpError(err));
  }
}
