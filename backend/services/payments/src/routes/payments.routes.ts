import { Router } from "express";
import { createIntent, getPaymentByOrder } from "../controllers/paymentsController.js";

export const paymentsRouter = Router();

paymentsRouter.post("/create-intent", createIntent);
paymentsRouter.get("/order/:orderId", getPaymentByOrder);
