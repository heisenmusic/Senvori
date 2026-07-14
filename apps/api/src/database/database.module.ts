import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const DRIZZLE = Symbol("DRIZZLE");
export type DrizzleDb = NodePgDatabase<typeof schema>;

/**
 * PostgreSQL as the single source of truth (D3): one pool, Drizzle on top,
 * schema-per-domain. Tenant isolation is enforced by RLS — see tenant-context.ts.
 */
@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DrizzleDb => {
        const pool = new Pool({ connectionString: config.getOrThrow<string>("DATABASE_URL") });
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
