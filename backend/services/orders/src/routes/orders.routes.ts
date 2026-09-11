import { Router } from "express";
import { checkout, getOrder, listMyOrders } from "../controllers/ordersController.js";

export const ordersRouter = Router();

ordersRouter.post("/checkout", checkout);
ordersRouter.get("/", listMyOrders);
ordersRouter.get("/:id", getOrder);
