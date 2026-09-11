import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // No external services needed: Prisma and Redis are mocked in every
    // test file, so these tests run anywhere (dev machine, CI) as-is.
  },
});
