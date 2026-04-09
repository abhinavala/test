import "dotenv/config";
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: false,
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname),
    },
  },
});
