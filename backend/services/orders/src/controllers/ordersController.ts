import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { Events, HttpError, publishEvent } from "@ecommerce/shared";
import { ZodError } from "zod";
import { prisma } from "../models/db.js";
import { fetchPriceSnapshot } from "../lib/products.js";
import { requireId, requireUserId } from "../middleware/user.js";
import { checkoutSchema } from "../schemas/orders.js";

function parseCheckout(body: unknown): { productId: string; quantity: number }[] {
  try {
    return checkoutSchema.parse(body).items;
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      throw new HttpError(400, `Invalid input: ${details}`);
    }
    throw err;
  }
}

const orderInclude = { items: true };

/**
 * POST /orders/checkout — snapshot prices, store a PENDING order, emit
 * order.placed so payments (and later flows) can react asynchronously.
 */
export async function checkout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUserId(req);
    const items = parseCheckout(req.body);

    const snapshots = await Promise.all(
      items.map(async (item) => ({
        ...(await fetchPriceSnapshot(item.productId)),
        quantity: item.quantity,
      })),
    );
    const totalCents = snapshots.reduce(
      (sum, snapshot) => sum + snapshot.unitPriceCents * snapshot.quantity,
      0,
    );
    if (totalCents <= 0) {
      throw new HttpError(400, "Order total must be positive");
    }

    const correlationId = randomUUID();
    const order = await prisma.order.create({
      data: {
        userId,
        totalCents,
        correlationId,
        items: {
          create: snapshots.map((snapshot) => ({
            productId: snapshot.productId,
            name: snapshot.name,
            unitPriceCents: snapshot.unitPriceCents,
            quantity: snapshot.quantity,
          })),
        },
      },
      include: orderInclude,
    });

    await publishEvent(Events.OrderPlaced, { orderId: order.id, userId, totalCents }, correlationId);

    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

export async function listMyOrders(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUserId(req);
    const orders = await prisma.order.findMany({
      where: { userId },
      include: orderInclude,
      orderBy: { createdAt: "desc" },
    });
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

export async function getOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUserId(req);
    const order = await prisma.order.findFirst({
      where: { id: requireId(req), userId },
      include: orderInclude,
    });
    if (!order) {
      throw new HttpError(404, "Order not found");
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /orders/:id/confirm (admin for now) — mark CONFIRMED and emit
 * order.confirmed. This is the seam the payments service will call when it
 * consumes payment.succeeded; the notification service listens downstream.
 */
export async function confirmOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: requireId(req) },
      include: orderInclude,
    });
    if (!order) {
      throw new HttpError(404, "Order not found");
    }
    if (order.status !== "PENDING") {
      throw new HttpError(409, `Only PENDING orders can be confirmed (current: ${order.status})`);
    }

    const confirmed = await prisma.order.update({
      where: { id: order.id },
      data: { status: "CONFIRMED" },
      include: orderInclude,
    });

    await publishEvent(
      Events.OrderConfirmed,
      { orderId: confirmed.id, userId: confirmed.userId },
      confirmed.correlationId,
    );

    res.json(confirmed);
  } catch (err) {
    next(err);
  }
}
