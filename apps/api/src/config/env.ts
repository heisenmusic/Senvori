import { z } from "zod";

/**
 * Environment contract. Secrets come from the provider vault, never from
 * committed env files (ARQUITETURA_E_STACK.md §8).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(3001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  /** Dashboard origin allowed for CORS + Better Auth trusted origins. */
  DASHBOARD_URL: z.string().url().default("http://localhost:3000"),

  /* --- Catalog media storage (§4, D7) --- */
  /** `local` = filesystem (dev/test); `r2` = Cloudflare R2 (S3-compatible). */
  STORAGE_DRIVER: z.enum(["local", "r2"]).default("local"),
  /** Root directory for the local storage driver. */
  STORAGE_LOCAL_DIR: z.string().default("./.storage"),
  /** Hard upload ceiling in bytes (default 500 MB). */
  CATALOG_MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(524_288_000),
  /** Upload ticket / download URL lifetimes (seconds). */
  CATALOG_UPLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  CATALOG_DOWNLOAD_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  /** Cloudflare R2 (only required when STORAGE_DRIVER=r2) — never commit real keys. */
  R2_ENDPOINT: z.string().url().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_REGION: z.string().default("auto"),
});

export type Env = z.infer<typeof envSchema>;

export const validateEnv = (config: Record<string, unknown>): Env => {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
};
