import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@ecommerce/shared";
import { prisma } from "../models/db.js";
import { releaseStock, reserveStock } from "./stockService.js";

vi.mock("../models/db.js", () => ({
  prisma: {
    product: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const updateMany = vi.mocked(prisma.product.updateMany);
const findUnique = vi.mocked(prisma.product.findUnique);
const update = vi.mocked(prisma.product.update);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reserveStock", () => {
  it("decrements atomically when enough stock exists", async () => {
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({ id: "p1", stock: 0 } as never);

    await reserveStock("p1", 2);

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "p1", stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
  });

  it("throws 409 when the atomic update matches zero rows (race loser)", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue({ id: "p1", name: "Phone", stock: 0 } as never);

    await expect(reserveStock("p1", 1)).rejects.toMatchObject({ status: 409 });
  });

  it("throws 404 when the product does not exist", async () => {
    updateMany.mockResolvedValue({ count: 0 });
    findUnique.mockResolvedValue(null);

    await expect(reserveStock("missing", 1)).rejects.toMatchObject({ status: 404 });
  });

  it("rejects non-positive quantities without touching the DB", async () => {
    await expect(reserveStock("p1", 0)).rejects.toBeInstanceOf(HttpError);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("releaseStock", () => {
  it("increments stock back", async () => {
    update.mockResolvedValue({ id: "p1", stock: 5 } as never);

    await releaseStock("p1", 1);

    expect(update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { stock: { increment: 1 } },
    });
  });
});
