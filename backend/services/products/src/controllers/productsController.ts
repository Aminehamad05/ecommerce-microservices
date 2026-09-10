import type { NextFunction, Request, Response } from "express";
import { Prisma } from "../generated/client/index.js";
import { HttpError } from "@ecommerce/shared";
import { prisma } from "../models/db.js";
import {
  createProductSchema,
  listProductsQuerySchema,
  updateProductSchema,
} from "../schemas/catalog.js";
import { parseBody, toHttpError } from "./helpers.js";

const productInclude = {
  category: true,
  images: { orderBy: { position: "asc" as const } },
};

export async function listProducts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const query = parseBody(listProductsQuerySchema, req.query);
    const { page, limit, categoryId, status, featured, search } = query;

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

    res.json({ data, page, limit, total });
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function getProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const product = await prisma.product.findUnique({
      where: { id: req.params.id },
      include: productInclude,
    });
    if (!product) {
      throw new HttpError(404, "Product not found");
    }
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
      where: { id: req.params.id },
      data,
      include: productInclude,
    });

    res.json(product);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function deleteProduct(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.sendStatus(204);
  } catch (err) {
    next(toHttpError(err));
  }
}
