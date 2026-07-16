import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * Dashboard tests: pure presentation helpers (lib/programs) plus focused
 * component behavior tests, run under jsdom. The `@/` alias mirrors the Next
 * tsconfig path so imports resolve identically to the app.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.{ts,tsx}"],
    environment: "jsdom",
    globals: true,
  },
});
