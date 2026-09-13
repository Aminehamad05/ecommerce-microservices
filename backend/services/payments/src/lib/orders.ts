import { z } from "zod";
import { HttpError } from "@ecommerce/shared";

const orderItemSchema = z.object({
  productId: z.string(),
  quantity: z.number(),
});

const orderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  status: z.string(),
  totalCents: z.number(),
  currency: z.string(),
  correlationId: z.string(),
  items: z.array(orderItemSchema),
});

export type OrderSnapshot = z.infer<typeof orderSchema>;

function ordersBaseUrl(): string {
  return (process.env.ORDERS_SERVICE_URL ?? "http://localhost:3003").replace(/\/+$/, "");
}

/**
 * Service-to-service REST: payments never reads the orders DB — it fetches
 * the order over HTTP to validate ownership, status and the amount
 * server-side. The client-sent amount is never trusted.
 */
export async function fetchOrder(orderId: string, userId: string): Promise<OrderSnapshot> {
  let res: Response;
  try {
    res = await fetch(`${ordersBaseUrl()}/orders/${orderId}`, {
      headers: { "x-user-id": userId },
    });
  } catch {
    throw new HttpError(503, "Orders service is unavailable");
  }
  if (res.status === 404) {
    throw new HttpError(404, "Order not found");
  }
  if (!res.ok) {
    throw new HttpError(502, "Orders service returned an error");
  }
  const parsed = orderSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new HttpError(502, "Orders service returned an unexpected shape");
  }
  return parsed.data;
}
