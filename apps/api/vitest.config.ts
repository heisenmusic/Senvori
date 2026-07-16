import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "vitest/config";

const storageDir = join(tmpdir(), "senvori-catalog-test-storage");

/**
 * Integration tests run against a real PostgreSQL, serially (single DB), and
 * import the COMPILED app from dist so NestJS decorator metadata is present
 * (the `test` script builds first). See test/integration.spec.ts.
 *
 * The env below is applied before the test module is evaluated. `AppModule`
 * validates the environment eagerly at import time (ConfigModule.forRoot), so
 * these must be present up front. The DATABASE_URL points at the non-owner,
 * NOBYPASSRLS application role — proving RLS is enforced at runtime. The
 * database itself is (re)created inside the test's beforeAll hook.
 */
export default defineConfig({
  test: {
    include: ["test/**/*.spec.ts"],
    testTimeout: 60_000,
    hookTimeout: 180_000,
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    env: {
      NODE_ENV: "test",
      DATABASE_URL:
        process.env.TEST_APP_URL ?? "postgres://senvori_app_test:apppw@localhost:5432/senvori_test",
      BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
      BETTER_AUTH_URL: "http://localhost:3001",
      DASHBOARD_URL: "http://localhost:3000",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: storageDir,
    },
  },
});
