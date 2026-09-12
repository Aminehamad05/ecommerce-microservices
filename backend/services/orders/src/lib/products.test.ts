import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@ecommerce/shared";
import { fetchPriceSnapshot } from "./products.js";

function mockFetchOnce(json: unknown, status = 200): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => json })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPriceSnapshot", () => {
  it("converts a dollar string price to cents", async () => {
    mockFetchOnce({ id: "p1", name: "Phone", price: "699.99", status: "ACTIVE" });

    await expect(fetchPriceSnapshot("p1")).resolves.toEqual({
      productId: "p1",
      name: "Phone",
      unitPriceCents: 69999,
    });
  });

  it("accepts numeric prices", async () => {
    mockFetchOnce({ id: "p1", name: "Phone", price: 10.5, status: "ACTIVE" });

    await expect(fetchPriceSnapshot("p1")).resolves.toMatchObject({ unitPriceCents: 1050 });
  });

  it("maps 404 to a 404 HttpError without calling the snapshot logic", async () => {
    mockFetchOnce({ error: "nope" }, 404);

    const err = await fetchPriceSnapshot("missing").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(404);
  });

  it("rejects non-sellable products with 400", async () => {
    mockFetchOnce({ id: "p1", name: "Old", price: "10.00", status: "DRAFT" });

    const err = await fetchPriceSnapshot("p1").catch((e: unknown) => e);
    expect((err as HttpError).status).toBe(400);
  });

  it("maps network failure to 503 and unexpected shapes to 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    expect(((await fetchPriceSnapshot("p1").catch((e: unknown) => e)) as HttpError).status).toBe(
      503,
    );

    mockFetchOnce({ totally: "different" });
    expect(((await fetchPriceSnapshot("p1").catch((e: unknown) => e)) as HttpError).status).toBe(
      502,
    );

    mockFetchOnce({ id: "p1", name: "Free", price: "0.00", status: "ACTIVE" });
    expect(((await fetchPriceSnapshot("p1").catch((e: unknown) => e)) as HttpError).status).toBe(
      502,
    );
  });
});
