import "reflect-metadata";
import compress from "@fastify/compress";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { FastifyRequest } from "fastify";
import { uuidv7 } from "uuidv7";
import { AppModule } from "./app.module";
import { HealthService } from "./modules/health/health.service";
import { registerStorageBodyParser } from "./modules/catalog/storage/fastify-binary";

const env = (key: string, fallback: string): string => process.env[key] ?? fallback;

/**
 * Correlation across the request path (§9): honour an inbound `x-request-id` /
 * `x-correlation-id` (set by an upstream gateway) so logs stitch together, and
 * mint a uuidv7 when absent. The id is echoed back on the response and appears
 * on every structured log line for that request.
 */
const genReqId = (req: FastifyRequest["raw"]): string => {
  const headers = req.headers;
  const incoming = headers["x-request-id"] ?? headers["x-correlation-id"];
  return (Array.isArray(incoming) ? incoming[0] : incoming) ?? uuidv7();
};

const bootstrap = async (): Promise<void> => {
  const maxBytes = Number(process.env.CATALOG_MAX_UPLOAD_BYTES ?? 524_288_000);
  const isTest = process.env.NODE_ENV === "test";

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      // maxParamLength: the local storage blob endpoint carries a signed token
      // in the path; the default (100) is far too small for it.
      bodyLimit: maxBytes,
      maxParamLength: 4096,
      // Correct client IPs (and rate-limit keys) when behind a known proxy/LB.
      trustProxy: env("TRUST_PROXY", "false") === "true",
      genReqId,
      // Structured JSON logs with the request id on every line.
      logger: isTest ? false : { level: env("LOG_LEVEL", "info") },
    }),
  );

  const instance = app.getHttpAdapter().getInstance();

  // Raw-binary parsing for the local storage blob endpoint (media uploads).
  registerStorageBodyParser(instance);

  // Security headers. CSP is intentionally off here: this process serves only a
  // JSON API (no HTML), and the dashboard owns its own CSP.
  await app.register(helmet, { contentSecurityPolicy: false });

  // Response compression (gzip/deflate/br) above a small threshold.
  await app.register(compress, { global: true, encodings: ["br", "gzip", "deflate"] });

  // Per-IP rate limiting; health probes are always exempt so orchestrators can poll.
  await app.register(rateLimit, {
    max: Number(env("RATE_LIMIT_MAX", "300")),
    timeWindow: env("RATE_LIMIT_WINDOW", "1 minute"),
    allowList: (req) => req.url.startsWith("/v1/health"),
  });

  // Echo the correlation id back to the caller.
  instance.addHook("onRequest", async (req, reply) => {
    void reply.header("x-request-id", req.id);
  });

  // All routes live under /v1 (Core Domains §0.3)
  app.setGlobalPrefix("v1");

  // CORS for the dashboard (cookie sessions require credentials).
  app.enableCors({
    origin: env("DASHBOARD_URL", "http://localhost:3000").split(","),
    credentials: true,
  });

  // Graceful shutdown (§9): flip readiness to draining so the LB stops routing
  // here, give it a grace window to notice, then close (Nest lifecycle drains
  // the DB pool via onModuleDestroy). enableShutdownHooks is intentionally not
  // used, so this handler is the single, deterministic path to close().
  const health = app.get(HealthService);
  const graceMs = Number(env("SHUTDOWN_GRACE_MS", "5000"));
  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) return;
    closing = true;
    health.beginDraining();
    instance.log.info({ signal, graceMs }, "shutdown: draining before close");
    setTimeout(() => {
      void app
        .close()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
    }, graceMs);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
};

void bootstrap();
