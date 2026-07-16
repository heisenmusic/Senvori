import { defineConfig } from "vitest/config";

/**
 * SDK unit tests are pure: they inject a fake `fetch` into the client and assert
 * on the request the SDK builds (verb, path, query, body, headers) and on how it
 * maps responses and error bodies. No network, no DB.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
