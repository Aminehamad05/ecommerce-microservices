import { z } from "zod";

export const reserveStockSchema = z.object({
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(99),
});

export const reserveBatchSchema = z.object({
  items: z
    .array(
      z.object({
        productId: z.uuid("productId must be a valid UUID"),
        quantity: z.number().int().min(1, "Quantity must be at least 1").max(99),
      }),
    )
    .min(1, "At least one item is required")
    .max(50, "Too many items in one reservation"),
});

export type ReserveStockInput = z.infer<typeof reserveStockSchema>;
export type ReserveBatchInput = z.infer<typeof reserveBatchSchema>;
