import { Controller, Get } from "@nestjs/common";
import { Public } from "../../common/auth/public.decorator";

@Public()
@Controller("health")
export class HealthController {
  @Get()
  health(): { status: "ok"; version: string } {
    return { status: "ok", version: process.env.npm_package_version ?? "0.1.0" };
  }
}
