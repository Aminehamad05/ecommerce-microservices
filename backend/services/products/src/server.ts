import "dotenv/config";
import express from "express";
import { corsDev, errorHandler } from "@ecommerce/shared";
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
app.listen(PORT, () => {
  console.log(`Products service listening on :${PORT}`);
});
