import type { NextFunction, Request, Response } from "express";
import { HttpError } from "@ecommerce/shared";
import { prisma } from "../models/db.js";
import { createCategorySchema, updateCategorySchema } from "../schemas/catalog.js";
import { parseBody, toHttpError } from "./helpers.js";

export async function listCategories(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const categories = await prisma.category.findMany({
      include: { _count: { select: { products: true } } },
      orderBy: { name: "asc" },
    });
    res.json(categories);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function getCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const category = await prisma.category.findUnique({
      where: { id: req.params.id },
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
    res.json(category);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function createCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseBody(createCategorySchema, req.body);
    const category = await prisma.category.create({ data: input });
    res.status(201).json(category);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function updateCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = parseBody(updateCategorySchema, req.body);
    const category = await prisma.category.update({
      where: { id: req.params.id },
      data: input,
    });
    res.json(category);
  } catch (err) {
    next(toHttpError(err));
  }
}

export async function deleteCategory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.sendStatus(204);
  } catch (err) {
    next(toHttpError(err));
  }
}
