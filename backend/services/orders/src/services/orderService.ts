import { Events, HttpError, publishEvent } from "@ecommerce/shared";
import type { Order, OrderItem } from "../generated/client/index.js";
import { prisma } from "../models/db.js";

export type OrderWithItems = Order & { items: OrderItem[] };

/**
 * Internal-only order confirmation. Called solely by the payment.succeeded
 * consumer — there is deliberately no HTTP route for this; an order must
 * only ever be confirmed as a reaction to a real payment event.
 *
 * Idempotent: replaying an event for an already-CONFIRMED order is a
 * no-op success (no duplicate order.confirmed), so RabbitMQ redelivery
 * is always safe.
 */
export async function confirmOrderById(orderId: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) {
    throw new HttpError(404, "Order not found");
  }
  if (order.status === "CONFIRMED") {
    return order;
  }
  if (order.status !== "PENDING") {
    throw new HttpError(409, `Only PENDING orders can be confirmed (current: ${order.status})`);
  }

  const confirmed = await prisma.order.update({
    where: { id: order.id },
    data: { status: "CONFIRMED" },
    include: { items: true },
  });

  await publishEvent(
    Events.OrderConfirmed,
    { orderId: confirmed.id, userId: confirmed.userId },
    confirmed.correlationId,
  );

  return confirmed;
}

/**
 * Internal-only failure marking. Called solely by the payment.failed
 * consumer — the payments service already released the held stock before
 * publishing, so this only moves order state.
 *
 * Idempotent: already-FAILED is a no-op success; already-CONFIRMED stays
 * confirmed (a late failure can never un-confirm a paid order).
 */
export async function failOrderById(orderId: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });
  if (!order) {
    throw new HttpError(404, "Order not found");
  }
  if (order.status === "FAILED" || order.status === "CONFIRMED") {
    return order;
  }
  if (order.status !== "PENDING") {
    throw new HttpError(409, `Only PENDING orders can fail (current: ${order.status})`);
  }

  return prisma.order.update({
    where: { id: order.id },
    data: { status: "FAILED" },
    include: { items: true },
  });
}
