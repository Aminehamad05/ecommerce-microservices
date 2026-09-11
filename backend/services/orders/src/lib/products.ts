import { z } from "zod";
import { HttpError } from "@ecommerce/shared";

/** Minimal shape we rely on from the products service catalog. */
const catalogProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  price: z.union([z.string(), z.number()]),
  status: z.string(),
});

export interface PriceSnapshot {
  productId: string;
  name: string;
  unitPriceCents: number;
}

function productsBaseUrl(): string {
  return (process.env.PRODUCTS_SERVICE_URL ?? "http://localhost:3002").replace(/\/+$/, "");
}

/**
 * Service-to-service REST: the orders service never touches the products
 * database — it fetches a price snapshot over HTTP at checkout time.
 */
export async function fetchPriceSnapshot(productId: string): Promise<PriceSnapshot> {
  let res: Response;
  try {
    res = await fetch(`${productsBaseUrl()}/products/${productId}`);
  } catch {
    throw new HttpError(503, "Products service is unavailable");
  }
  if (res.status === 404) {
    throw new HttpError(404, `Product ${productId} not found`);
  }
  if (!res.ok) {
    throw new HttpError(502, "Products service returned an error");
  }

  const parsed = catalogProductSchema.safeParse(await res.json());
  if (!parsed.success) {
    throw new HttpError(502, "Products service returned an unexpected shape");
  }
  const product = parsed.data;
  if (product.status !== "ACTIVE") {
    throw new HttpError(400, `Product ${product.name} is not sellable`);
  }

  const unitPriceCents = Math.round(Number(product.price) * 100);
  if (!Number.isFinite(unitPriceCents) || unitPriceCents <= 0) {
    throw new HttpError(502, "Products service returned an invalid price");
  }
  return { productId: product.id, name: product.name, unitPriceCents };
}
