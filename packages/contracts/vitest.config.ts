import { defineConfig } from "vitest/config";

/** Pure schema unit tests — no environment, no I/O. */
export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
  },
});
