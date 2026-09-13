import { HttpError } from "@ecommerce/shared";
import { prisma } from "../models/db.js";

/**
 * Atomic stock reservation. The decrement and the availability check happen
 * in a SINGLE UPDATE statement (`stock >= quantity`), so two concurrent
 * checkouts racing for the last unit cannot both succeed: the loser's
 * update matches zero rows and gets a 409. This is what prevents oversell
 * when stock contains only 1 element and 2 clients order at once.
 */
export async function reserveStock(productId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new HttpError(400, "Quantity must be a positive integer");
  }
  const result = await prisma.product.updateMany({
    where: { id: productId, stock: { gte: quantity } },
    data: { stock: { decrement: quantity } },
  });
  if (result.count === 1) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    return product;
  }
  const existing = await prisma.product.findUnique({ where: { id: productId } });
  if (!existing) {
    throw new HttpError(404, "Product not found");
  }
  throw new HttpError(409, `Insufficient stock for product ${existing.name}`);
}

/** Compensating action: give previously-reserved units back. Always succeeds when the product exists. */
export async function releaseStock(productId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new HttpError(400, "Quantity must be a positive integer");
  }
  try {
    return await prisma.product.update({
      where: { id: productId },
      data: { stock: { increment: quantity } },
    });
  } catch {
    throw new HttpError(404, "Product not found");
  }
}
