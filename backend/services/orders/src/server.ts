import "dotenv/config";
import express from "express";
import { errorHandler } from "@ecommerce/shared";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "orders" });
});
// TODO: routes

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3003);
app.listen(PORT, () => {
  console.log(`Orders service listening on :${PORT}`);
});
