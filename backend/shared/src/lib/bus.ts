import amqp from "amqplib";
import { createEvent, type EventPayloads } from "../events/index.js";
import type { DomainEvent } from "../types.js";

/**
 * Typed RabbitMQ transport over a single durable topic exchange.
 *
 * - Routing key = event name (e.g. "order.confirmed").
 * - Each consumer owns a durable queue bound with the routing keys it cares
 *   about, so one event can fan out to many services (payments, notifications,
 *   analytics…) without the publisher knowing any of them.
 * - Queue names are consumer-scoped ("orders.payment.succeeded"), never the
 *   bare event name: two services sharing one queue would round-robin
 *   messages instead of each receiving a copy.
 */

export const EVENTS_EXCHANGE = "ecommerce.events";

const DEFAULT_URL = "amqp://localhost:5672";

let channel: amqp.Channel | null = null;

async function getChannel(url: string): Promise<amqp.Channel> {
  if (channel) return channel;
  const connection = await amqp.connect(url);
  connection.on("close", () => {
    channel = null;
  });
  connection.on("error", () => {
    channel = null;
  });
  channel = await connection.createChannel();
  return channel;
}

function rabbitUrl(): string {
  return process.env.RABBITMQ_URL ?? DEFAULT_URL;
}

async function assertExchange(ch: amqp.Channel): Promise<void> {
  await ch.assertExchange(EVENTS_EXCHANGE, "topic", { durable: true });
}

/** Publish a typed domain event. Fire-and-forget from the caller's view. */
export async function publishEvent<T extends keyof EventPayloads>(
  type: T,
  payload: EventPayloads[T],
  correlationId: string,
): Promise<void> {
  const ch = await getChannel(rabbitUrl());
  await assertExchange(ch);
  const event = createEvent(type, payload, correlationId);
  ch.publish(EVENTS_EXCHANGE, type, Buffer.from(JSON.stringify(event)), {
    persistent: true,
  });
}

export interface ConsumeOptions {
  /**
   * Consumer-owned queue name, e.g. "orders.payment.succeeded".
   * Defaults to the event name (single-consumer behavior).
   */
  queue?: string;
}

/**
 * Consume a typed event via an owned queue bound to the exchange. The handler
 * must be idempotent — RabbitMQ redelivers on crash, so the same event may
 * arrive twice. Messages that throw are dropped (logged) rather than requeued
 * to avoid poison loops; errors that deserve a retry should be handled inside
 * the handler.
 */
export async function consumeEvents<T extends keyof EventPayloads>(
  type: T,
  onEvent: (event: DomainEvent<T, EventPayloads[T]>) => Promise<void>,
  options: ConsumeOptions = {},
): Promise<void> {
  const queue = options.queue ?? type;
  const ch = await getChannel(rabbitUrl());
  await assertExchange(ch);
  await ch.assertQueue(queue, { durable: true });
  await ch.bindQueue(queue, EVENTS_EXCHANGE, type);
  await ch.consume(queue, (msg: amqp.ConsumeMessage | null) => {
    if (!msg) return;
    void (async () => {
      try {
        const event = JSON.parse(msg.content.toString()) as DomainEvent<T, EventPayloads[T]>;
        await onEvent(event);
        ch.ack(msg);
      } catch (err) {
        console.error(`Failed handling ${type}, dropping message:`, err);
        ch.nack(msg, false, false);
      }
    })();
  });
}
