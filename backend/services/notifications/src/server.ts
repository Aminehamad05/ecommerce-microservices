import "dotenv/config";
import express from "express";
import { Events, consumeEvents, corsDev, errorHandler } from "@ecommerce/shared";
import { handleOrderConfirmed } from "./listeners/orderConfirmed.js";

const app = express();
app.use(corsDev);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "notifications" });
});

// TODO: GET /notifications — app inbox for the x-user-id caller, backed by
// notifications_db (own database; add postgres + Prisma schema when starting
// this service for real).

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3005);

// Start consuming before listening so no order.confirmed slips through.
await consumeEvents(Events.OrderConfirmed, handleOrderConfirmed);

app.listen(PORT, () => {
  console.log(`Notifications service listening on :${PORT}`);
});
