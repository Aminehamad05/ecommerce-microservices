import { Events, type DomainEvent, type EventPayloads } from "@ecommerce/shared";
import { failOrderById } from "../services/orderService.js";

type PaymentFailedEvent = DomainEvent<
  typeof Events.PaymentFailed,
  EventPayloads[typeof Events.PaymentFailed]
>;

/**
 * payment.failed → mark the order FAILED so the customer can retry.
 * Replay-safe via failOrderById being idempotent; a late failure for an
 * already-CONFIRMED order is ignored, never un-confirming a paid order.
 */
export async function handlePaymentFailed(event: PaymentFailedEvent): Promise<void> {
  const { orderId, reason } = event.payload;
  console.log(
    `[orders] payment.failed for order ${orderId} (reason: ${reason}) ` +
      `[correlation ${event.correlationId}]`,
  );

  const order = await failOrderById(orderId);

  console.log(`[orders] order ${order.id} is ${order.status} [correlation ${order.correlationId}]`);
}
