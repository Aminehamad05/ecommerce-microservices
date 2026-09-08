import "dotenv/config";
import express from "express";
import httpProxy from "express-http-proxy";
import type { Request } from "express";
import { requireAuth } from "./middleware/auth.js";

const app = express();

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? "http://localhost:3001";
const PRODUCTS_SERVICE_URL = process.env.PRODUCTS_SERVICE_URL ?? "http://localhost:3002";
const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL ?? "http://localhost:3003";
const PAYMENTS_SERVICE_URL = process.env.PAYMENTS_SERVICE_URL ?? "http://localhost:3004";

const proxy = (serviceUrl: string) =>
  httpProxy(serviceUrl, {
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      const user = (srcReq as Request).user;
      if (user && proxyReqOpts.headers) {
        proxyReqOpts.headers["x-user-id"] = user.id;
        proxyReqOpts.headers["x-user-role"] = user.role;
      }
      return proxyReqOpts;
    },
  });

// health check for the gateway itself
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "gateway" });
});

// public
app.use("/api/auth", proxy(AUTH_SERVICE_URL));

// protected
app.use("/api/products", requireAuth, proxy(PRODUCTS_SERVICE_URL));
app.use("/api/orders", requireAuth, proxy(ORDERS_SERVICE_URL));
app.use("/api/payments", requireAuth, proxy(PAYMENTS_SERVICE_URL));

const PORT = Number(process.env.PORT ?? 3000);
app.listen(PORT, () => {
  console.log(`Gateway listening on :${PORT}`);
});
