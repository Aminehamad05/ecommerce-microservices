import "dotenv/config";
import express from "express";
import { corsDev, errorHandler } from "@ecommerce/shared";
import { ordersRouter } from "./routes/orders.routes.js";

const app = express();
app.use(corsDev);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "orders" });
});
app.use("/orders", ordersRouter);

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3003);
app.listen(PORT, () => {
  console.log(`Orders service listening on :${PORT}`);
});
