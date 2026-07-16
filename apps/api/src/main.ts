import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { registerStorageBodyParser } from "./modules/catalog/storage/fastify-binary";

const bootstrap = async (): Promise<void> => {
  const maxBytes = Number(process.env.CATALOG_MAX_UPLOAD_BYTES ?? 524_288_000);
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // maxParamLength: the local storage blob endpoint carries a signed token in
    // the path; the default (100) is far too small for it.
    new FastifyAdapter({ bodyLimit: maxBytes, maxParamLength: 4096 }),
  );

  // Raw-binary parsing for the local storage blob endpoint (media uploads).
  registerStorageBodyParser(app.getHttpAdapter().getInstance());

  // All routes live under /v1 (Core Domains §0.3)
  app.setGlobalPrefix("v1");

  // CORS for the dashboard (cookie sessions require credentials).
  app.enableCors({
    origin: (process.env.DASHBOARD_URL ?? "http://localhost:3000").split(","),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
};

void bootstrap();
