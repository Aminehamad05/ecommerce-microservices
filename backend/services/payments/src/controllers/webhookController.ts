import type { Request, Response } from "express";
import { getStripe, webhookSecret } from "../lib/stripe.js";
import {
  applyPaymentFailed,
  applyPaymentSucceeded,
  claimWebhookEvent,
} from "../services/paymentService.js";

/**
 * POST /webhooks/stripe — PUBLIC (Stripe calls it directly, not via the
 * gateway; trust comes from the Stripe signature, not a JWT). Must receive
 * the RAW body: the route is mounted with express.raw() before any JSON
 * parser, otherwise verification always fails.
 */
export async function stripeWebhook(req: Request, res: Response): Promise<void> {
  const signature = req.header("stripe-signature");
  if (!signature) {
    res.status(400).json({ error: "Missing Stripe signature" });
    return;
  }
  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    const rawBody = req.body as Buffer;
    event = getStripe().webhooks.constructEvent(
      rawBody,
      signature,
      webhookSecret(),
    ) as unknown as typeof event;
  } catch {
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  const firstSeen = await claimWebhookEvent(event.id, event.type).catch((err: unknown) => {
    console.error("[payments] webhook dedup write failed:", err);
    return true;
  });
  if (!firstSeen) {
    res.json({ received: true, duplicate: true });
    return;
  }

  try {
    const object = event.data.object;
    const intentId = typeof object.id === "string" ? object.id : null;
    if (intentId) {
      if (event.type === "payment_intent.succeeded") {
        await applyPaymentSucceeded(intentId);
      } else if (event.type === "payment_intent.payment_failed") {
        const reason =
          typeof object.last_payment_error === "object" &&
          object.last_payment_error !== null &&
          "message" in object.last_payment_error &&
          typeof (object.last_payment_error as { message?: unknown }).message === "string"
            ? ((object.last_payment_error as { message: string }).message)
            : "Payment failed";
        // Never log card data — only the intent id and our reason string.
        console.log(`[payments] intent ${intentId} failed: ${reason}`);
        await applyPaymentFailed(intentId, reason);
      }
    }
  } catch (err) {
    // The event is already claimed, so a retry would be a no-op: log loudly
    // and still ack 200 rather than letting Stripe retry a poison event.
    console.error(`[payments] webhook ${event.id} handling failed:`, err);
  }
  res.json({ received: true });
}
