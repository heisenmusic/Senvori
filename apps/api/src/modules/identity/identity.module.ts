import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DRIZZLE, type DrizzleDb } from "../../database/database.module";
import { AUTH, createAuth } from "./auth.config";
import { AuthController } from "./auth.controller";

/**
 * Identity domain — SENVORI_CORE_DOMAINS.md §1.
 * Foundation phase: authentication (Better Auth) wired; RBAC with hierarchical
 * scopes and audit log arrive with the domain build-out.
 */
@Module({
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH,
      inject: [DRIZZLE, ConfigService],
      useFactory: (db: DrizzleDb, config: ConfigService) =>
        createAuth(db, {
          baseUrl: config.getOrThrow<string>("BETTER_AUTH_URL"),
          secret: config.getOrThrow<string>("BETTER_AUTH_SECRET"),
        }),
    },
  ],
  exports: [AUTH],
})
export class IdentityModule {}
