import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  type CreateScheduleAssignmentInput,
  createScheduleAssignmentSchema,
  type EffectivePlanDto,
  type ScheduleAssignmentDto,
  type ScheduleResolutionDto,
  type ScheduleResolveRequestInput,
  scheduleResolveRequestSchema,
  type UpdateScheduleAssignmentInput,
  updateScheduleAssignmentSchema,
} from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { RequirePermission } from "../../common/rbac/require-permission.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { SchedulingService } from "./scheduling.service";

/**
 * Scheduling Runtime REST surface (Sprint 08 · §23). Thin controller: validation
 * via ZodValidationPipe, authorization via @RequirePermission, tenant always from
 * the authenticated context. No audio, no device manifest here (§35).
 */
@Controller("scheduling")
export class SchedulingController {
  constructor(private readonly service: SchedulingService) {}

  @Get("assignments")
  @RequirePermission("scheduling:assignment:read")
  listAssignments(
    @CurrentContext() ctx: RequestContext,
  ): Promise<{ items: ScheduleAssignmentDto[]; nextCursor: string | null }> {
    return this.service.listAssignments(ctx);
  }

  @Post("assignments")
  @RequirePermission("scheduling:assignment:manage")
  createAssignment(
    @CurrentContext() ctx: RequestContext,
    @Body(new ZodValidationPipe(createScheduleAssignmentSchema))
    input: CreateScheduleAssignmentInput,
  ): Promise<ScheduleAssignmentDto> {
    return this.service.createAssignment(ctx, input);
  }

  @Patch("assignments/:id")
  @RequirePermission("scheduling:assignment:manage")
  updateAssignment(
    @CurrentContext() ctx: RequestContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateScheduleAssignmentSchema))
    input: UpdateScheduleAssignmentInput,
  ): Promise<ScheduleAssignmentDto> {
    return this.service.updateAssignment(ctx, id, input);
  }

  @Delete("assignments/:id")
  @RequirePermission("scheduling:assignment:manage")
  @HttpCode(204)
  async deleteAssignment(
    @CurrentContext() ctx: RequestContext,
    @Param("id") id: string,
  ): Promise<void> {
    await this.service.deleteAssignment(ctx, id);
  }

  /** Resolve the active program for a unit at a local date/time. */
  @Post("resolve")
  @HttpCode(200)
  @RequirePermission("scheduling:plan:read")
  resolve(
    @CurrentContext() _ctx: RequestContext,
    @Body(new ZodValidationPipe(scheduleResolveRequestSchema)) input: ScheduleResolveRequestInput,
  ): Promise<ScheduleResolutionDto> {
    return this.service.resolve(input);
  }

  /** Preview the effective plan (base hash + overlays) for a unit + local date. */
  @Post("effective-plan")
  @HttpCode(200)
  @RequirePermission("scheduling:plan:read")
  effectivePlan(
    @CurrentContext() _ctx: RequestContext,
    @Body(new ZodValidationPipe(scheduleResolveRequestSchema)) input: ScheduleResolveRequestInput,
  ): Promise<EffectivePlanDto> {
    return this.service.previewEffectivePlan(input);
  }
}
