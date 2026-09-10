import type { NextFunction, Request, Response } from "express";
import { HttpError } from "@ecommerce/shared";
import { prisma } from "../models/db.js";
import {
  CATEGORIES_LIST_KEY,
  CATEGORY_KEY,
  PRODUCT_TTL,
  bumpListVersion,
  cacheDel,
  cacheGet,
  cacheSet,
  markCache,
} from "../models/cache.js";
import { createCategorySchema, updateCategorySchema } from "../schemas/catalog.js";
import { parseBody, requireId, toHttpError } from "./helpers.js";

/** Category writes change product listings (embedded category) and counts. */
async function invalidateCategory(id: string): Promise<void> {
  await cacheDel(CATEGORY_KEY(id), CATEGORIES_LIST_KEY);
  await bumpListVersion();
}

export async function listCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const cached = await cacheGet<unknown>(CATEGORIES_LIST_KEY);
    if (cached !== null) {
      markCache(res, true);
      res.json(cached);
      return;
    }

    const categories = await prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    });
    await cacheSet(CATEGORIES_LIST_KEY, categories, PRODUCT_TTL);
    markCache(res, false);
    res.json(categories);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function getCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = requireId(req);
    const key = CATEGORY_KEY(id);
    const cached = await cacheGet<unknown>(key);
    if (cached !== null) {
      markCache(res, true);
      res.json(cached);
      return;
    }

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        products: {
          where: { status: "ACTIVE" },
          select: { id: true, name: true, slug: true, price: true },
        },
      },
    });
    if (!category) {
      throw new HttpError(404, "Category not found");
    }
    await cacheSet(key, category, PRODUCT_TTL);
    markCache(res, false);
    res.json(category);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseBody(createCategorySchema, req.body);
    const category = await prisma.category.create({ data: input });
    await invalidateCategory(category.id);
    res.status(201).json(category);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseBody(updateCategorySchema, req.body);
    const category = await prisma.category.update({
      where: { id: requireId(req) },
      data: input,
    });
    await invalidateCategory(category.id);
    res.json(category);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = requireId(req);
    await prisma.category.delete({ where: { id } });
    await invalidateCategory(id);
    res.sendStatus(204);
  } catch (err) {
    next(toHttpError(err));
  }
}
