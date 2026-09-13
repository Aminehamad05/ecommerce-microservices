import { Events, HttpError, publishEvent } from "@ecommerce/shared";
import type { Payment } from "../generated/client/index.js";
import { fetchOrder } from "../lib/orders.js";
import { releaseStockForOrder, reserveStockForOrder } from "../lib/stock.js";
import { getStripe } from "../lib/stripe.js";
import { prisma } from "../models/db.js";

export interface IntentResult {
  payment: Payment;
  clientSecret: string;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/** Return the client_secret for an already-created intent (idempotent retry path). */
async function clientSecretOf(stripePaymentIntentId: string): Promise<string> {
  const intent = await getStripe().paymentIntents.retrieve(stripePaymentIntentId);
  if (!intent.client_secret) {
    throw new HttpError(502, "Payment provider returned an unexpected response");
  }
  return intent.client_secret;
}

/**
 * Create (or idempotently return) the Stripe PaymentIntent for an order.
 *
 * Ordering is the whole point: stock is reserved BEFORE the Stripe call, so
 * when two clients race for the last unit, the loser gets a 409 here and no
 * PaymentIntent — never a charge for something we cannot ship. The products
 * service performs the decrement atomically (`stock >= quantity` in a single
 * UPDATE), so concurrent reserves cannot both succeed.
 *
 * Amount and currency always come from the orders service, never the client.
 */
export async function createPaymentIntent(orderId: string, userId: string): Promise<IntentResult> {
  const existing = await prisma.payment.findUnique({ where: { orderId } });
  if (existing) {
    if (existing.userId !== userId) {
      throw new HttpError(404, "Order not found");
    }
    if (existing.status === "succeeded") {
      throw new HttpError(409, "Order is already paid");
    }
    return { payment: existing, clientSecret: await clientSecretOf(existing.stripePaymentIntentId) };
  }

  const order = await fetchOrder(orderId, userId);
  if (order.status !== "PENDING") {
    throw new HttpError(409, `Only PENDING orders can be paid (current: ${order.status})`);
  }
  if (!Number.isInteger(order.totalCents) || order.totalCents <= 0) {
    throw new HttpError(502, "Orders service returned an invalid total");
  }

  await reserveStockForOrder(order.items);

  let stripeIntentId: string;
  let clientSecret: string;
  try {
    const intent = await getStripe().paymentIntents.create(
      {
        amount: order.totalCents,
        currency: order.currency.toLowerCase(),
        metadata: { orderId: order.id, userId, correlationId: order.correlationId },
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
      },
      { idempotencyKey: `create-intent-${order.id}` },
    );
    if (!intent.client_secret) {
      throw new HttpError(502, "Payment provider returned an unexpected response");
    }
    stripeIntentId = intent.id;
    clientSecret = intent.client_secret;
  } catch (err) {
    if (err instanceof HttpError) throw err;
    await releaseStockForOrder(order.items).catch((releaseErr: unknown) => {
      console.error(`[payments] failed to release stock for order ${order.id}:`, releaseErr);
    });
    console.error(`[payments] stripe create failed for order ${order.id}`);
    throw new HttpError(502, "Payment provider returned an error");
  }

  try {
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        userId,
        stripePaymentIntentId: stripeIntentId,
        amount: order.totalCents,
        currency: order.currency,
        status: "requires_payment_method",
        correlationId: order.correlationId,
      },
    });
    return { payment, clientSecret };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    // Lost a create-intent race for the same order: undo our reservation and
    // fall back to the winner's intent (Stripe's idempotency key already
    // deduplicated the charge side).
    await releaseStockForOrder(order.items).catch((releaseErr: unknown) => {
      console.error(`[payments] failed to release stock for order ${order.id}:`, releaseErr);
    });
    const winner = await prisma.payment.findUnique({ where: { orderId } });
    if (!winner) throw new HttpError(502, "Payment provider returned an error");
    return { payment: winner, clientSecret: await clientSecretOf(winner.stripePaymentIntentId) };
  }
}

/**
 * Claim a webhook event id. Returns true the first time an event is seen,
 * false for redeliveries (Stripe retries until it gets a 2xx).
 */
export async function claimWebhookEvent(id: string, type: string): Promise<boolean> {
  try {
    await prisma.webhookEvent.create({ data: { id, type } });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) return false;
    throw err;
  }
}

/** payment_intent.succeeded → mark succeeded, publish payment.succeeded. Idempotent. */
export async function applyPaymentSucceeded(stripePaymentIntentId: string): Promise<Payment | null> {
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId },
  });
  if (!payment) {
    console.error(`[payments] webhook for unknown intent ${stripePaymentIntentId}`);
    return null;
  }
  if (payment.status === "succeeded") {
    return payment;
  }
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "succeeded" },
  });
  await publishEvent(
    Events.PaymentSucceeded,
    { orderId: updated.orderId, paymentId: updated.id },
    updated.correlationId,
  );
  return updated;
}

/**
 * payment_intent.payment_failed → mark failed, give the held stock back,
 * publish payment.failed so orders can move PENDING → FAILED.
 */
export async function applyPaymentFailed(
  stripePaymentIntentId: string,
  reason: string,
): Promise<Payment | null> {
  const payment = await prisma.payment.findUnique({
    where: { stripePaymentIntentId },
  });
  if (!payment) {
    console.error(`[payments] webhook for unknown intent ${stripePaymentIntentId}`);
    return null;
  }
  if (payment.status === "failed") {
    return payment;
  }
  if (payment.status === "succeeded") {
    return payment;
  }
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "failed" },
  });
  try {
    const order = await fetchOrder(updated.orderId, updated.userId);
    await releaseStockForOrder(order.items);
  } catch (err) {
    console.error(
      `[payments] failed to release stock for order ${updated.orderId}, needs reconciliation:`,
      err,
    );
  }
  await publishEvent(
    Events.PaymentFailed,
    { orderId: updated.orderId, reason },
    updated.correlationId,
  );
  return updated;
}
