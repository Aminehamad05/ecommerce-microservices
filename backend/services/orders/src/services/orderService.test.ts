import { beforeEach, describe, expect, it, vi } from "vitest";
import { Events, HttpError, publishEvent } from "@ecommerce/shared";
import { prisma } from "../models/db.js";
import { confirmOrderById } from "./orderService.js";

vi.mock("../models/db.js", () => ({
  prisma: {
    order: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@ecommerce/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@ecommerce/shared")>();
  return { ...actual, publishEvent: vi.fn() };
});

const findUnique = vi.mocked(prisma.order.findUnique);
const update = vi.mocked(prisma.order.update);
const publishEventMock = vi.mocked(publishEvent);

const createdAt = new Date("2026-09-11T15:20:43.687Z");

const pendingOrder = {
  id: "916b2aef-ac3a-442f-b0ed-1b7bf53a7056",
  userId: "3dc71024-33fb-4aae-9f26-d37d733cfaa1",
  status: "PENDING" as const,
  totalCents: 259874,
  currency: "USD",
  correlationId: "b56deb51-0b15-43e1-b150-8a3206ebdcf5",
  createdAt,
  updatedAt: createdAt,
  items: [],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("confirmOrderById", () => {
  it("confirms a PENDING order and publishes order.confirmed with its correlationId", async () => {
    findUnique.mockResolvedValue(pendingOrder);
    update.mockResolvedValue({ ...pendingOrder, status: "CONFIRMED" as const });

    const confirmed = await confirmOrderById(pendingOrder.id);

    expect(confirmed.status).toBe("CONFIRMED");
    expect(update).toHaveBeenCalledWith({
      where: { id: pendingOrder.id },
      data: { status: "CONFIRMED" },
      include: { items: true },
    });
    expect(publishEventMock).toHaveBeenCalledTimes(1);
    expect(publishEventMock).toHaveBeenCalledWith(
      Events.OrderConfirmed,
      { orderId: pendingOrder.id, userId: pendingOrder.userId },
      pendingOrder.correlationId,
    );
  });

  it("is a no-op success for already-CONFIRMED orders (no duplicate publish)", async () => {
    findUnique.mockResolvedValue({ ...pendingOrder, status: "CONFIRMED" as const });

    const result = await confirmOrderById(pendingOrder.id);

    expect(result.status).toBe("CONFIRMED");
    expect(update).not.toHaveBeenCalled();
    expect(publishEventMock).not.toHaveBeenCalled();
  });

  it("throws 404 for unknown orders", async () => {
    findUnique.mockResolvedValue(null);

    await expect(confirmOrderById("missing")).rejects.toMatchObject({ status: 404 });
    expect(update).not.toHaveBeenCalled();
    expect(publishEventMock).not.toHaveBeenCalled();
  });

  it("throws 409 for non-PENDING orders", async () => {
    findUnique.mockResolvedValue({ ...pendingOrder, status: "CANCELLED" as const });

    const err = await confirmOrderById(pendingOrder.id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(409);
    expect(update).not.toHaveBeenCalled();
    expect(publishEventMock).not.toHaveBeenCalled();
  });
});
