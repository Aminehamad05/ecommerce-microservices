import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // No external services needed: Prisma, the products HTTP API and the
    // RabbitMQ bus are mocked in every test file, so these tests run
    // anywhere (dev machine, CI) as-is.
  },
});
