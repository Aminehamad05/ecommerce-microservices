import "dotenv/config";
import express from "express";
import { corsDev, errorHandler } from "@ecommerce/shared";
import { connectCache, disconnectCache } from "./models/cache.js";
import { categoriesRouter, productsRouter } from "./routes/products.routes.js";

const app = express();
app.use(corsDev);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "products" });
});
// More specific mount first: otherwise "/products/:id" would swallow "/products/categories".
app.use("/products/categories", categoriesRouter);
app.use("/products", productsRouter);

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3002);

// Cache connects fail-open: the service still serves from Postgres if Redis is down.
await connectCache();

const server = app.listen(PORT, () => {
  console.log(`Products service listening on :${PORT}`);
});

process.on("SIGTERM", () => {
  server.close(() => {
    void disconnectCache().finally(() => process.exit(0));
  });
});
