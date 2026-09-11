import { Router } from "express";
import { requireAdmin } from "../middleware/user.js";
import { checkout, confirmOrder, getOrder, listMyOrders } from "../controllers/ordersController.js";

export const ordersRouter = Router();

ordersRouter.post("/checkout", checkout);
ordersRouter.get("/", listMyOrders);
ordersRouter.get("/:id", getOrder);
ordersRouter.post("/:id/confirm", requireAdmin, confirmOrder);
