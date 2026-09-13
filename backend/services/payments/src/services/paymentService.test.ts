import { beforeEach, describe, expect, it, vi } from "vitest";
import { Events, publishEvent } from "@ecommerce/shared";
import { prisma } from "../models/db.js";
import { fetchOrder } from "../lib/orders.js";
import { releaseStockForOrder, reserveStockForOrder } from "../lib/stock.js";
import { getStripe } from "../lib/stripe.js";
import {
  applyPaymentFailed,
  applyPaymentSucceeded,
  claimWebhookEvent,
  createPaymentIntent,
} from "./paymentService.js";

vi.mock("../models/db.js", () => ({
  prisma: {
    payment: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    webhookEvent: { create: vi.fn() },
  },
}));

vi.mock("@ecommerce/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ecommerce/shared")>();
  return { ...actual, publishEvent: vi.fn() };
});

vi.mock("../lib/orders.js", () => ({ fetchOrder: vi.fn() }));
vi.mock("../lib/stock.js", () => ({
  reserveStockForOrder: vi.fn(),
  releaseStockForOrder: vi.fn(),
}));
vi.mock("../lib/stripe.js", () => ({
  getStripe: vi.fn(),
  webhookSecret: vi.fn(),
}));

const findUnique = vi.mocked(prisma.payment.findUnique);
const create = vi.mocked(prisma.payment.create);
const update = vi.mocked(prisma.payment.update);
const webhookCreate = vi.mocked(prisma.webhookEvent.create);
const publishEventMock = vi.mocked(publishEvent);
const fetchOrderMock = vi.mocked(fetchOrder);
const reserveMock = vi.mocked(reserveStockForOrder);
const releaseMock = vi.mocked(releaseStockForOrder);
const stripeCreate = vi.fn();
const stripeRetrieve = vi.fn();
vi.mocked(getStripe).mockReturnValue({
  paymentIntents: { create: stripeCreate, retrieve: stripeRetrieve },
} as never);

const order = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  status: "PENDING",
  totalCents: 4999,
  currency: "USD",
  correlationId: "33333333-3333-4333-8333-333333333333",
  items: [{ productId: "44444444-4444-4444-8444-444444444444", quantity: 1 }],
};

const paymentRow = {
  id: "55555555-5555-4555-8555-555555555555",
  orderId: order.id,
  userId: order.userId,
  stripePaymentIntentId: "pi_test_123",
  amount: 4999,
  currency: "USD",
  status: "requires_payment_method",
  correlationId: order.correlationId,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getStripe).mockReturnValue({
    paymentIntents: { create: stripeCreate, retrieve: stripeRetrieve },
  } as never);
});

describe("createPaymentIntent", () => {
  it("reserves stock BEFORE calling Stripe and persists the payment", async () => {
    findUnique.mockResolvedValue(null);
    fetchOrderMock.mockResolvedValue(order);
    reserveMock.mockResolvedValue(undefined);
    stripeCreate.mockResolvedValue({ id: "pi_test_123", client_secret: "secret_abc" });
    create.mockResolvedValue(paymentRow as never);

    const result = await createPaymentIntent(order.id, order.userId);

    expect(result.clientSecret).toBe("secret_abc");
    // Stock first, Stripe second: the race loser never reaches Stripe.
    expect(reserveMock.mock.invocationCallOrder[0]).toBeLessThan(
      stripeCreate.mock.invocationCallOrder[0] as number,
    );
    expect(stripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4999, currency: "usd" }),
      { idempotencyKey: `create-intent-${order.id}` },
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderId: order.id, amount: 4999 }),
      }),
    );
  });

  it("uses the server-side order total, never a client-sent amount", async () => {
    findUnique.mockResolvedValue(null);
    fetchOrderMock.mockResolvedValue({ ...order, totalCents: 7500 });
    reserveMock.mockResolvedValue(undefined);
    stripeCreate.mockResolvedValue({ id: "pi_x", client_secret: "s" });
    create.mockResolvedValue({ ...paymentRow, amount: 7500 } as never);

    await createPaymentIntent(order.id, order.userId);

    expect(stripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 7500 }),
      expect.anything(),
    );
  });

  it("returns the existing intent on retry without re-reserving or re-charging", async () => {
    findUnique.mockResolvedValue(paymentRow as never);
    stripeRetrieve.mockResolvedValue({
      id: "pi_test_123",
      client_secret: "secret_abc",
    });

    const result = await createPaymentIntent(order.id, order.userId);

    expect(result.clientSecret).toBe("secret_abc");
    expect(reserveMock).not.toHaveBeenCalled();
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it("throws 409 without touching Stripe when stock is gone (race loser)", async () => {
    findUnique.mockResolvedValue(null);
    fetchOrderMock.mockResolvedValue(order);
    reserveMock.mockRejectedValue(Object.assign(new Error("Insufficient"), { status: 409 }));

    await expect(createPaymentIntent(order.id, order.userId)).rejects.toMatchObject({
      status: 409,
    });
    expect(stripeCreate).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("releases the reservation when Stripe fails", async () => {
    findUnique.mockResolvedValue(null);
    fetchOrderMock.mockResolvedValue(order);
    reserveMock.mockResolvedValue(undefined);
    stripeCreate.mockRejectedValue(new Error("stripe down"));
    releaseMock.mockResolvedValue(undefined);

    await expect(createPaymentIntent(order.id, order.userId)).rejects.toMatchObject({
      status: 502,
    });
    expect(releaseMock).toHaveBeenCalledWith(order.items);
  });

  it("rejects non-PENDING orders", async () => {
    findUnique.mockResolvedValue(null);
    fetchOrderMock.mockResolvedValue({ ...order, status: "CONFIRMED" });

    await expect(createPaymentIntent(order.id, order.userId)).rejects.toMatchObject({
      status: 409,
    });
    expect(reserveMock).not.toHaveBeenCalled();
  });
});

describe("claimWebhookEvent", () => {
  it("returns true on first sight, false for redeliveries", async () => {
    webhookCreate.mockResolvedValueOnce({ id: "evt_1", type: "payment_intent.succeeded" } as never);
    await expect(claimWebhookEvent("evt_1", "payment_intent.succeeded")).resolves.toBe(true);

    webhookCreate.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }));
    await expect(claimWebhookEvent("evt_1", "payment_intent.succeeded")).resolves.toBe(false);
  });
});

describe("applyPaymentSucceeded", () => {
  it("marks succeeded and publishes payment.succeeded once", async () => {
    findUnique.mockResolvedValue(paymentRow as never);
    update.mockResolvedValue({ ...paymentRow, status: "succeeded" } as never);

    await applyPaymentSucceeded("pi_test_123");

    expect(update).toHaveBeenCalledWith({
      where: { id: paymentRow.id },
      data: { status: "succeeded" },
    });
    expect(publishEventMock).toHaveBeenCalledWith(
      Events.PaymentSucceeded,
      { orderId: order.id, paymentId: paymentRow.id },
      order.correlationId,
    );
  });

  it("is a no-op success for replays (no duplicate publish)", async () => {
    findUnique.mockResolvedValue({ ...paymentRow, status: "succeeded" } as never);

    await applyPaymentSucceeded("pi_test_123");

    expect(update).not.toHaveBeenCalled();
    expect(publishEventMock).not.toHaveBeenCalled();
  });
});

describe("applyPaymentFailed", () => {
  it("marks failed, releases stock and publishes payment.failed", async () => {
    findUnique.mockResolvedValue(paymentRow as never);
    update.mockResolvedValue({ ...paymentRow, status: "failed" } as never);
    fetchOrderMock.mockResolvedValue(order);
    releaseMock.mockResolvedValue(undefined);

    await applyPaymentFailed("pi_test_123", "card declined");

    expect(releaseMock).toHaveBeenCalledWith(order.items);
    expect(publishEventMock).toHaveBeenCalledWith(
      Events.PaymentFailed,
      { orderId: order.id, reason: "card declined" },
      order.correlationId,
    );
  });
});
