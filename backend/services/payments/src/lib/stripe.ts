import Stripe from "stripe";
import { HttpError } from "@ecommerce/shared";

let stripe: Stripe | null = null;

/** Lazy singleton so importing this module never throws when keys are unset (tests, typecheck). */
export function getStripe(): Stripe {
  if (stripe) return stripe;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new HttpError(503, "Payments are not configured");
  }
  stripe = new Stripe(secretKey);
  return stripe;
}

/** Test seam: swap the client for a mock. */
export function setStripeClient(client: Stripe | null): void {
  stripe = client;
}

export function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new HttpError(503, "Payments are not configured");
  }
  return secret;
}
