import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import { DRIZZLE, type DrizzleDb } from "../../database/database.module";

/**
 * Liveness vs. readiness (§9):
 *  - liveness  = "the process is up and the event loop responds" (never touches
 *    dependencies; a failing liveness means restart the container).
 *  - readiness = "safe to route traffic here" = not draining AND the database
 *    answers. A load balancer polls readiness and stops sending traffic when it
 *    flips, which is what makes rolling deploys / graceful shutdown seamless.
 */
@Injectable()
export class HealthService {
  private draining = false;

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Flip readiness to "not ready" so the LB drains this instance before it closes. */
  beginDraining(): void {
    this.draining = true;
  }

  isDraining(): boolean {
    return this.draining;
  }

  /** Cheap DB round-trip; runs as the RLS app role and touches no tables. */
  async pingDatabase(): Promise<boolean> {
    try {
      await this.db.execute(sql`select 1`);
      return true;
    } catch {
      return false;
    }
  }

  async readiness(): Promise<{ ready: boolean; database: "up" | "down"; draining: boolean }> {
    const database = (await this.pingDatabase()) ? "up" : "down";
    return { ready: !this.draining && database === "up", database, draining: this.draining };
  }
}
