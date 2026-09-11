import { Events, type DomainEvent, type EventPayloads } from "@ecommerce/shared";
import { confirmOrderById } from "../services/orderService.js";

type PaymentSucceededEvent = DomainEvent<
  typeof Events.PaymentSucceeded,
  EventPayloads[typeof Events.PaymentSucceeded]
>;

/**
 * payment.succeeded → confirm the order → order.confirmed.
 * ACK semantics live in the shared bus (manual ack after this resolves);
 * replay safety comes from confirmOrderById being idempotent.
 */
export async function handlePaymentSucceeded(event: PaymentSucceededEvent): Promise<void> {
  const { orderId, paymentId } = event.payload;
  console.log(
    `[orders] payment.succeeded for order ${orderId} (payment ${paymentId}) ` +
      `[correlation ${event.correlationId}]`,
  );

  const order = await confirmOrderById(orderId);

  console.log(`[orders] order ${order.id} is ${order.status} [correlation ${order.correlationId}]`);
}
