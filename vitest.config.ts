import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./", import.meta.url)),
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  esbuild: {
    // Only options present on esbuild's TsconfigRaw.compilerOptions.
    tsconfigRaw: {
      compilerOptions: {
        target: "ES2022",
        strict: true,
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    reporters: ["default"],
  },
});
