import { describe, expect, it } from "vitest";
import { checkoutSchema } from "./orders.js";

describe("checkoutSchema", () => {
  it("accepts items with valid product ids and quantities", () => {
    const result = checkoutSchema.safeParse({
      items: [
        { productId: "c2dd16f4-1498-4b7c-b5dc-624f545e4f61", quantity: 2 },
        { productId: "a09cd577-b570-4c81-94e9-52e707a87335", quantity: 1 },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty items, bad uuids and out-of-range quantities", () => {
    const goodId = "c2dd16f4-1498-4b7c-b5dc-624f545e4f61";
    for (const body of [
      { items: [] },
      {},
      { items: [{ productId: "not-a-uuid", quantity: 1 }] },
      { items: [{ productId: goodId, quantity: 0 }] },
      { items: [{ productId: goodId, quantity: 100 }] },
      { items: Array.from({ length: 51 }, () => ({ productId: goodId, quantity: 1 })) },
    ]) {
      expect(checkoutSchema.safeParse(body).success).toBe(false);
    }
  });
});
