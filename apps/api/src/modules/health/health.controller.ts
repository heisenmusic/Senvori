import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { Public } from "../../common/auth/public.decorator";
import { HealthService } from "./health.service";

const version = (): string => process.env.npm_package_version ?? "0.1.0";

@Public()
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** Overall snapshot (kept for backward compatibility). */
  @Get()
  health(): { status: "ok"; version: string } {
    return { status: "ok", version: version() };
  }

  /** Liveness — the process responds. Never checks dependencies. */
  @Get("live")
  live(): { status: "ok"; version: string } {
    return { status: "ok", version: version() };
  }

  /** Readiness — safe to receive traffic (not draining and DB reachable). 503 otherwise. */
  @Get("ready")
  async ready(): Promise<{ status: "ready"; database: "up"; version: string }> {
    const result = await this.healthService.readiness();
    if (!result.ready) {
      throw new ServiceUnavailableException({
        status: result.draining ? "draining" : "not-ready",
        database: result.database,
        version: version(),
      });
    }
    return { status: "ready", database: "up", version: version() };
  }
}
