import "dotenv/config";
import express from "express";
import { errorHandler } from "@ecommerce/shared";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "products" });
});
// TODO: routes

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3002);
app.listen(PORT, () => {
  console.log(`Products service listening on :${PORT}`);
});
