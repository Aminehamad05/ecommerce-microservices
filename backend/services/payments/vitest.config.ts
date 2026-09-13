import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // No external services needed: Prisma, Stripe, fetch and RabbitMQ are
    // mocked in every test file, so these tests run anywhere (CI) as-is.
  },
});
