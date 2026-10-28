import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Tests run against core's source, so `npm test` does not need a prior build.
    alias: {
      "@clearance-gateway/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["packages/*/src/**/*.test.ts", "apps/api/src/**/*.test.ts", "eval/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
