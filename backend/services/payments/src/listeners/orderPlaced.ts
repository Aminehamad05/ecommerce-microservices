import { Events, type DomainEvent, type EventPayloads } from "@ecommerce/shared";

type OrderPlacedEvent = DomainEvent<
  typeof Events.OrderPlaced,
  EventPayloads[typeof Events.OrderPlaced]
>;

/**
 * order.placed → log receipt. The authoritative work (stock reservation +
 * Stripe PaymentIntent) happens synchronously in POST /payments/create-intent
 * so the frontend gets an immediate 409 when stock is gone and the charge
 * can never precede the reservation. This consumer keeps the queue/binding
 * alive for observability and future auto-processing.
 */
export async function handleOrderPlaced(event: OrderPlacedEvent): Promise<void> {
  console.log(
    `[payments] order.placed for order ${event.payload.orderId} ` +
      `(total ${event.payload.totalCents}) [correlation ${event.correlationId}]`,
  );
}
