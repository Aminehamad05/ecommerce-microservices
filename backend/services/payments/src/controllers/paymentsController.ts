import type { NextFunction, Request, Response } from "express";
import { HttpError } from "@ecommerce/shared";
import { ZodError } from "zod";
import { requireUserId } from "../middleware/user.js";
import { createIntentSchema } from "../schemas/payments.js";
import { createPaymentIntent } from "../services/paymentService.js";
import { prisma } from "../models/db.js";

/**
 * POST /payments/create-intent — authenticated (via gateway). Body is only
 * `{ orderId }`: the amount is re-read from the orders service so a client
 * can never set its own price.
 */
export async function createIntent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = requireUserId(req);
    let orderId: string;
    try {
      orderId = createIntentSchema.parse(req.body).orderId;
    } catch (err) {
      if (err instanceof ZodError) {
        throw new HttpError(400, `Invalid input: ${err.issues.map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`).join("; ")}`);
      }
      throw err;
    }
    const { payment, clientSecret } = await createPaymentIntent(orderId, userId);
    res.status(201).json({
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      clientSecret,
    });
  } catch (err) {
    next(err);
  }
}

/** GET /payments/order/:orderId — fetch our payment state for an order (polling for the frontend). */
export async function getPaymentByOrder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const orderId = req.params.orderId;
    if (!orderId) {
      throw new HttpError(400, "Missing orderId parameter");
    }
    const payment = await prisma.payment.findUnique({ where: { orderId } });
    if (!payment || payment.userId !== userId) {
      throw new HttpError(404, "Payment not found");
    }
    res.json({
      paymentId: payment.id,
      orderId: payment.orderId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
    });
  } catch (err) {
    next(err);
  }
}
