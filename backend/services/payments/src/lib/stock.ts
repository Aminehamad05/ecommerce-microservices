import { HttpError } from "@ecommerce/shared";

export interface StockItem {
  productId: string;
  quantity: number;
}

function productsBaseUrl(): string {
  return (process.env.PRODUCTS_SERVICE_URL ?? "http://localhost:3002").replace(/\/+$/, "");
}

async function postStock(path: string, items: StockItem[]): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${productsBaseUrl()}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
  } catch {
    throw new HttpError(503, "Products service is unavailable");
  }
  if (res.status === 409) {
    throw new HttpError(409, "Insufficient stock for one or more items");
  }
  if (res.status === 404) {
    throw new HttpError(404, "Product not found");
  }
  if (!res.ok) {
    throw new HttpError(502, "Products service returned an error");
  }
}

/**
 * Reserve every line of the order BEFORE touching Stripe. The products
 * service decrements atomically (`stock >= quantity` in a single UPDATE),
 * so two concurrent payments racing for the last unit cannot both succeed.
 * All-or-nothing: any failure releases the lines already held.
 */
export async function reserveStockForOrder(items: StockItem[]): Promise<void> {
  await postStock("/products/stock/reserve", items);
}

/** Best-effort compensation: called when Stripe fails or the payment fails. */
export async function releaseStockForOrder(items: StockItem[]): Promise<void> {
  await postStock("/products/stock/release", items);
}
