import { Global, Injectable, Module, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export const DRIZZLE = Symbol("DRIZZLE");
export type DrizzleDb = NodePgDatabase<typeof schema>;

/**
 * Owns the single PostgreSQL connection pool and drains it on shutdown, so no
 * connections leak when the app closes (graceful shutdown; also lets tests tear
 * the app down cleanly between runs).
 */
@Injectable()
export class DatabaseConnection implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: DrizzleDb;

  constructor(config: ConfigService) {
    this.pool = new Pool({ connectionString: config.getOrThrow<string>("DATABASE_URL") });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * PostgreSQL as the single source of truth (D3): one pool, Drizzle on top,
 * schema-per-domain. Tenant isolation is enforced by RLS — see tenant-context.ts.
 */
@Global()
@Module({
  providers: [
    DatabaseConnection,
    {
      provide: DRIZZLE,
      inject: [DatabaseConnection],
      useFactory: (connection: DatabaseConnection): DrizzleDb => connection.db,
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}
