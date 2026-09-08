import "dotenv/config";
import express from "express";
import { errorHandler } from "@ecommerce/shared";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "payments" });
});
// TODO: routes

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3004);
app.listen(PORT, () => {
  console.log(`Payments service listening on :${PORT}`);
});
