import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));
const serverOnlyShim = fileURLToPath(new URL("./src/test/server-only-shim.ts", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": sourceRoot,
      "server-only": serverOnlyShim,
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
});
