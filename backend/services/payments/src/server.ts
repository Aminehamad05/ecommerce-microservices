import "dotenv/config";
import express from "express";
import { Events, consumeEvents, corsDev, errorHandler } from "@ecommerce/shared";
import { stripeWebhook } from "./controllers/webhookController.js";
import { handleOrderPlaced } from "./listeners/orderPlaced.js";
import { paymentsRouter } from "./routes/payments.routes.js";

const app = express();
app.use(corsDev);

// Webhook FIRST with a raw parser: signature verification needs the exact
// bytes Stripe signed, so this route must never see express.json().
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhook);

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "payments" });
});
app.use("/payments", paymentsRouter);

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3004);

// Subscribe before listening so no order.placed slips through.
await consumeEvents(Events.OrderPlaced, handleOrderPlaced, {
  queue: "payments.order.placed",
});

app.listen(PORT, () => {
  console.log(`Payments service listening on :${PORT}`);
});
