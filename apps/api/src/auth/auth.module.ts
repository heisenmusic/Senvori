import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DRIZZLE, type DrizzleDb } from "../database/database.module";
import { AUTH, createAuth } from "../modules/identity/auth.config";

/**
 * Global provider for the Better Auth instance (D11). Kept separate from
 * IdentityModule so the request pipeline (context guard) can resolve sessions
 * without a circular module dependency.
 */
@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [DRIZZLE, ConfigService],
      useFactory: (db: DrizzleDb, config: ConfigService) =>
        createAuth(db, {
          baseUrl: config.getOrThrow<string>("BETTER_AUTH_URL"),
          secret: config.getOrThrow<string>("BETTER_AUTH_SECRET"),
          trustedOrigins: [config.getOrThrow<string>("DASHBOARD_URL")],
        }),
    },
  ],
  exports: [AUTH],
})
export class AuthModule {}
