import "dotenv/config";
import express from "express";
import { errorHandler } from "@ecommerce/shared";
import { authRouter } from "./routes/auth.routes.js";

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "auth" });
});
app.use("/auth", authRouter);

app.use(errorHandler);

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`Auth service listening on :${PORT}`);
});
