import { z } from "zod";

export const createIntentSchema = z.object({
  orderId: z.uuid("orderId must be a valid UUID"),
});

export type CreateIntentInput = z.infer<typeof createIntentSchema>;
