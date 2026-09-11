import type { DomainEvent } from "../types.js";

/** Shared event names so publishers and listeners never drift apart. */
export const Events = {
  UserCreated: "user.created",
  OrderPlaced: "order.placed",
  OrderConfirmed: "order.confirmed",
  PaymentSucceeded: "payment.succeeded",
  PaymentFailed: "payment.failed",
} as const;

export type EventType = (typeof Events)[keyof typeof Events];

/** Type-safe event payload registry: map event name → payload type. */
export interface EventPayloads {
  [Events.UserCreated]: { userId: string; email: string };
  [Events.OrderPlaced]: { orderId: string; userId: string; totalCents: number };
  [Events.OrderConfirmed]: { orderId: string; userId: string };
  [Events.PaymentSucceeded]: { orderId: string; paymentId: string };
  [Events.PaymentFailed]: { orderId: string; reason: string };
}

/** Helper for publishers. */
export const createEvent = <T extends keyof EventPayloads>(
  type: T,
  payload: EventPayloads[T],
  correlationId: string,
): DomainEvent<T, EventPayloads[T]> => ({
  type,
  payload,
  occurredAt: new Date().toISOString(),
  correlationId,
});
