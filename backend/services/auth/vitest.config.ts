import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // The controller throws at import time if JWT_SECRET is unset;
    // provide a dummy value so tests never depend on a real .env file.
    env: {
      JWT_SECRET: "test-secret",
    },
  },
});
