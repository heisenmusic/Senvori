# Environment Reference (§8)

> Every variable the platform reads, with a description — none undocumented. The
> API validates its variables at boot with Zod (`apps/api/src/config/env.ts`); an
> invalid or missing required value **fails startup loudly** rather than running
> half-configured.

## Files & precedence

We keep **one committed template** (`.env.example`) and do **not** commit
environment-specific secret files. Real values live where each environment can
inject them safely:

| File / source      | Committed?         | Purpose                                                   |
| ------------------ | ------------------ | --------------------------------------------------------- |
| `.env.example`     | ✅ yes             | The template + documentation of every var.                |
| `.env.local`       | ❌ no (gitignored) | Your local development overrides.                         |
| `.env.development` | ❌ no              | Shared dev/preview values (non-secret) via the platform.  |
| `.env.staging`     | ❌ no — **vault**  | Staging secrets injected by the host/CD, never in git.    |
| `.env.production`  | ❌ no — **vault**  | Production secrets injected by the host/CD, never in git. |

Rationale (matches `env.ts`): _secrets come from the provider vault, never from
committed env files._ Committing `.env.staging`/`.env.production` with real values
would leak credentials into history. Instead, the matrix below is the contract; the
CD system materializes it per environment.

## Variable reference

### API — core (required)

| Var                  | Required | Default                 | Description                                                                             |
| -------------------- | -------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`           | no       | `development`           | `development` \| `test` \| `production`.                                                |
| `PORT`               | no       | `3001`                  | API listen port.                                                                        |
| `DATABASE_URL`       | **yes**  | —                       | Postgres URL. In prod this is the **non-owner, NOBYPASSRLS** app role, never the owner. |
| `REDIS_URL`          | no       | —                       | Redis URL (rate-limit store / future queues). Optional today.                           |
| `BETTER_AUTH_SECRET` | **yes**  | —                       | ≥32-char secret for Better Auth sessions. Rotate via vault.                             |
| `BETTER_AUTH_URL`    | **yes**  | —                       | Public base URL of the API/auth.                                                        |
| `DASHBOARD_URL`      | no       | `http://localhost:3000` | Allowed CORS origin(s), comma-separated; Better Auth trusted origin.                    |

### API — production readiness (§9)

| Var                 | Default    | Description                                                       |
| ------------------- | ---------- | ----------------------------------------------------------------- |
| `LOG_LEVEL`         | `info`     | pino level: `fatal\|error\|warn\|info\|debug\|trace\|silent`.     |
| `TRUST_PROXY`       | `false`    | Honour `X-Forwarded-*` — enable **only** behind a known proxy/LB. |
| `RATE_LIMIT_MAX`    | `300`      | Per-IP request ceiling per window. Health probes exempt.          |
| `RATE_LIMIT_WINDOW` | `1 minute` | Rate-limit window (`@fastify/rate-limit` time string).            |
| `SHUTDOWN_GRACE_MS` | `5000`     | Drain grace before `close()` on SIGTERM/SIGINT.                   |

### API — catalog storage (§4)

| Var                                         | Default      | Description                                                                          |
| ------------------------------------------- | ------------ | ------------------------------------------------------------------------------------ |
| `STORAGE_DRIVER`                            | `local`      | `local` (filesystem) or `r2` (Cloudflare R2 / S3-compatible).                        |
| `STORAGE_LOCAL_DIR`                         | `./.storage` | Root dir for the local driver.                                                       |
| `CATALOG_MAX_UPLOAD_BYTES`                  | `524288000`  | Hard upload ceiling (500 MB).                                                        |
| `CATALOG_UPLOAD_TTL_SECONDS`                | `3600`       | Upload ticket lifetime.                                                              |
| `CATALOG_DOWNLOAD_TTL_SECONDS`              | `300`        | Signed download URL lifetime.                                                        |
| `R2_ENDPOINT`                               | —            | R2 S3 endpoint (`https://<acct>.r2.cloudflarestorage.com`). Required when driver=r2. |
| `R2_BUCKET`                                 | —            | Private bucket name.                                                                 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | —            | R2 S3 API token. **Vault only.**                                                     |
| `R2_REGION`                                 | `auto`       | R2 region.                                                                           |

### Dashboard

| Var                   | Default                 | Description                        |
| --------------------- | ----------------------- | ---------------------------------- |
| `NODE_ENV`            | `development`           | Standard Next.js env.              |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | Public API base the browser calls. |

## Per-environment matrix

| Var                  | local                    | staging              | production                |
| -------------------- | ------------------------ | -------------------- | ------------------------- |
| `NODE_ENV`           | development              | production           | production                |
| `DATABASE_URL`       | local Postgres, owner ok | app-role, managed PG | app-role, managed PG (HA) |
| `STORAGE_DRIVER`     | local                    | r2                   | r2                        |
| `LOG_LEVEL`          | debug                    | info                 | info                      |
| `TRUST_PROXY`        | false                    | true                 | true                      |
| `BETTER_AUTH_SECRET` | dev value                | vault                | vault (rotated)           |
| `R2_*`               | empty                    | vault                | vault                     |
| `REDIS_URL`          | local redis              | managed              | managed (HA)              |

## Validation

`apps/api` runs `validateEnv` at import time (`ConfigModule.forRoot({ validate })`).
Missing/invalid required vars throw `Invalid environment: <issues>` and the process
exits — no silent misconfiguration. Add new vars to `env.ts` **and** this file in the
same change.
