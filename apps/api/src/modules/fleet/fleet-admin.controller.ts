import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import {
  type PlayerActivationAdmin,
  type PlayerActivationClaimRequest,
  playerActivationClaimRequestSchema,
  type PlayerDeviceDetail,
  type PlayerDeviceSummary,
  type PlayerPlaybackEventRecord,
} from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { RequirePermission } from "../../common/rbac/require-permission.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { FleetAdminService } from "./fleet-admin.service";
import { PlayerActivationService } from "./player-activation.service";

/**
 * Fleet administration REST surface (Sprint 10A · §8). Thin controller: Zod
 * validation, `@RequirePermission` authorization, tenant from the authenticated
 * context. Not a full Fleet console — just device activation + detail.
 */
@Controller("fleet")
export class FleetAdminController {
  constructor(
    private readonly admin: FleetAdminService,
    private readonly activation: PlayerActivationService,
  ) {}

  @Get("devices")
  @RequirePermission("fleet:device:read")
  listDevices(@CurrentContext() ctx: RequestContext): Promise<{ items: PlayerDeviceSummary[] }> {
    return this.admin.listDevices(ctx);
  }

  @Get("devices/:id")
  @RequirePermission("fleet:device:read")
  getDevice(@Param("id") id: string): Promise<PlayerDeviceDetail> {
    return this.admin.getDevice(id);
  }

  @Post("devices/:id/revoke")
  @RequirePermission("fleet:device:manage")
  revokeDevice(
    @CurrentContext() ctx: RequestContext,
    @Param("id") id: string,
  ): Promise<PlayerDeviceDetail> {
    return this.admin.revokeDevice(ctx, id);
  }

  @Get("devices/:id/playback-events")
  @RequirePermission("fleet:device:read")
  listPlaybackEvents(@Param("id") id: string): Promise<{ items: PlayerPlaybackEventRecord[] }> {
    return this.admin.listPlaybackEvents(id);
  }

  /* --------------------------------------------------------- activation -- */

  @Get("activations/:code")
  @RequirePermission("fleet:device:pair")
  getActivation(@Param("code") code: string): Promise<PlayerActivationAdmin> {
    return this.admin.getActivation(code);
  }

  /** Operator binds a pending device (by its on-screen code) to a zone. */
  @Post("activations/:code/claim")
  @RequirePermission("fleet:device:pair")
  claim(
    @CurrentContext() ctx: RequestContext,
    @Param("code") code: string,
    @Body(new ZodValidationPipe(playerActivationClaimRequestSchema))
    input: PlayerActivationClaimRequest,
  ): Promise<PlayerDeviceSummary> {
    return this.activation.claim(ctx, code, input);
  }
}
