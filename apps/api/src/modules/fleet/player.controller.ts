import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import {
  type PlayerActivationCompleteRequest,
  playerActivationCompleteRequestSchema,
  type PlayerActivationStartRequest,
  playerActivationStartRequestSchema,
  type PlayerCredentialResponse,
  type PlayerExecutionPlanResponse,
  type PlayerHeartbeatRequest,
  type PlayerHeartbeatResponse,
  playerHeartbeatRequestSchema,
  type PlayerTelemetryBatchRequest,
  playerTelemetryBatchRequestSchema,
  type PlayerTelemetryBatchResponse,
} from "@senvori/contracts";
import { Public } from "../../common/auth/public.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { CurrentDevice, type DeviceContext } from "./device-context";
import { DeviceAuthGuard } from "./device-auth.guard";
import { ExecutionPlanService } from "./execution-plan.service";
import { PlayerActivationService } from "./player-activation.service";
import { PlayerRuntimeService } from "./player-runtime.service";

/**
 * Device-facing Player API (Sprint 10A). Every route is `@Public()` (the human
 * session guard does not apply); the authenticated ones use `DeviceAuthGuard`,
 * which resolves the device credential and attaches a DeviceContext. The device
 * never sends its tenant/unit — scope is always server-derived (§5).
 */
@Controller("player")
export class PlayerController {
  constructor(
    private readonly activation: PlayerActivationService,
    private readonly runtime: PlayerRuntimeService,
    private readonly plan: ExecutionPlanService,
  ) {}

  /* --------------------------------------------------------- activation -- */

  @Post("activation/start")
  @Public()
  @HttpCode(201)
  start(
    @Body(new ZodValidationPipe(playerActivationStartRequestSchema))
    input: PlayerActivationStartRequest,
  ) {
    return this.activation.start(input);
  }

  @Get("activation/:code")
  @Public()
  status(@Param("code") code: string) {
    return this.activation.status(code);
  }

  @Post("activation/complete")
  @Public()
  @HttpCode(200)
  complete(
    @Body(new ZodValidationPipe(playerActivationCompleteRequestSchema))
    input: PlayerActivationCompleteRequest,
  ): Promise<PlayerCredentialResponse> {
    return this.activation.complete(input);
  }

  /* ------------------------------------------------- session lifecycle -- */

  @Post("session/refresh")
  @Public()
  @UseGuards(DeviceAuthGuard)
  @HttpCode(200)
  refresh(@CurrentDevice() device: DeviceContext): Promise<PlayerCredentialResponse> {
    return this.activation.refresh(device);
  }

  @Post("deactivate")
  @Public()
  @UseGuards(DeviceAuthGuard)
  @HttpCode(204)
  async deactivate(@CurrentDevice() device: DeviceContext): Promise<void> {
    await this.activation.deactivate(device);
  }

  /* --------------------------------------------------------- operations -- */

  @Post("heartbeat")
  @Public()
  @UseGuards(DeviceAuthGuard)
  @HttpCode(200)
  heartbeat(
    @CurrentDevice() device: DeviceContext,
    @Body(new ZodValidationPipe(playerHeartbeatRequestSchema)) input: PlayerHeartbeatRequest,
  ): Promise<PlayerHeartbeatResponse> {
    return this.runtime.heartbeat(device, input);
  }

  @Get("execution-plan")
  @Public()
  @UseGuards(DeviceAuthGuard)
  executionPlan(@CurrentDevice() device: DeviceContext): Promise<PlayerExecutionPlanResponse> {
    return this.plan.build(device);
  }

  @Post("telemetry")
  @Public()
  @UseGuards(DeviceAuthGuard)
  @HttpCode(200)
  telemetry(
    @CurrentDevice() device: DeviceContext,
    @Body(new ZodValidationPipe(playerTelemetryBatchRequestSchema))
    input: PlayerTelemetryBatchRequest,
  ): Promise<PlayerTelemetryBatchResponse> {
    return this.runtime.ingest(device, input);
  }
}
