import type { NextFunction, Request, Response } from "express";
import { prisma } from "../models/db.js";
import {
  CATEGORIES_LIST_KEY,
  CATEGORY_KEY,
  PRODUCT_KEY,
  bumpListVersion,
  cacheDel,
  cacheDelPattern,
} from "../models/cache.js";
import { parseBody, requireId, toHttpError } from "./helpers.js";
import { reserveBatchSchema, reserveStockSchema } from "../schemas/stock.js";
import { releaseStock, reserveStock } from "../services/stockService.js";

/** Same invalidation as catalog writes: a stock change stales detail + listings. */
async function invalidateStock(id: string): Promise<void> {
  await cacheDel(PRODUCT_KEY(id), CATEGORIES_LIST_KEY);
  await cacheDelPattern(`${CATEGORY_KEY("")}*`);
  await bumpListVersion();
}

/**
 * Service-to-service stock endpoints (called by orders/payments over direct
 * HTTP, never via shared DB). The gateway still requires a JWT on
 * /api/products/*, so these are never anonymous.
 */
export async function reserveOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = requireId(req);
    const { quantity } = parseBody(reserveStockSchema, req.body);
    const product = await reserveStock(id, quantity);
    await invalidateStock(id);
    res.json(product);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function releaseOne(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = requireId(req);
    const { quantity } = parseBody(reserveStockSchema, req.body);
    const product = await releaseStock(id, quantity);
    await invalidateStock(id);
    res.json(product);
  } catch (err) {
    next(toHttpError(err));
  }
}

/**
 * All-or-nothing batch reservation for multi-item checkouts: reserve each
 * line sequentially and release the ones already taken if any line fails,
 * so a 3-item order never partially holds stock.
 */
export async function reserveBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { items } = parseBody(reserveBatchSchema, req.body);
    const reserved: { productId: string; quantity: number }[] = [];
    try {
      for (const item of items) {
        await reserveStock(item.productId, item.quantity);
        reserved.push(item);
      }
    } catch (err) {
      await Promise.allSettled(
        reserved.map((item) => releaseStock(item.productId, item.quantity)),
      );
      throw err;
    }
    await Promise.all(items.map((item) => invalidateStock(item.productId)));
    const products = await prisma.product.findMany({
      where: { id: { in: items.map((item) => item.productId) } },
    });
    res.json({ data: products });
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function releaseBatch(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { items } = parseBody(reserveBatchSchema, req.body);
    await Promise.all(items.map((item) => releaseStock(item.productId, item.quantity)));
    await Promise.all(items.map((item) => invalidateStock(item.productId)));
    res.json({ released: items.length });
  } catch (err) {
    next(toHttpError(err));
  }
}
