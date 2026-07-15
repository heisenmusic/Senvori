import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";

const bootstrap = async (): Promise<void> => {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());

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
