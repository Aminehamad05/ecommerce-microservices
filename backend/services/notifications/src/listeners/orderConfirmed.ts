import { Events, type DomainEvent, type EventPayloads } from "@ecommerce/shared";

type OrderConfirmedEvent = DomainEvent<
  typeof Events.OrderConfirmed,
  EventPayloads[typeof Events.OrderConfirmed]
>;

interface UserContact {
  userId: string;
  email: string;
}

/**
 * Resolve who to notify. The notification service must never read the auth
 * database directly — either:
 *   1. maintain a local user-contact read model by consuming user.created, or
 *   2. call the auth service over REST.
 * Option 1 keeps this consumer fully decoupled; stubbed until wired.
 */
async function getUserContact(userId: string): Promise<UserContact | null> {
  console.log(`[notifications] resolving contact for user ${userId} (stub)`);
  return null;
}

/**
 * In-app notification for order.confirmed — no email involved. The client app
 * will fetch its inbox from this service (GET /notifications); delivery push
 * (websocket/SSE) is a later step.
 */
export async function handleOrderConfirmed(event: OrderConfirmedEvent): Promise<void> {
  const { orderId, userId } = event.payload;
  const contact = await getUserContact(userId);

  // TODO: persist to notifications_db (own database per service rules) so the
  // app inbox survives restarts, then mark delivery.
  console.log(
    `[notifications] order ${orderId} confirmed for user ${userId} ` +
      `(${contact?.email ?? "contact unknown"}) [correlation ${event.correlationId}]`,
  );
}
