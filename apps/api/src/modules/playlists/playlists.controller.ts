import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import {
  type CreateAssignmentInput,
  createAssignmentSchema,
  type CreateProgramInput,
  createProgramSchema,
  type CreateRotationPairInput,
  createRotationPairSchema,
  type ExecutionPlanDto,
  type PreviewRequestInput,
  previewRequestSchema,
  type ProgramDto,
  type ProgramItemDto,
  type ProgramListQuery,
  programListQuerySchema,
  type ProgramVersionDto,
  type RotationPairDto,
  type RotationPolicyDto,
  type SetProgramItemsInput,
  setProgramItemsSchema,
  type UpdateProgramInput,
  updateProgramSchema,
  type UpdateRotationPairInput,
  updateRotationPairSchema,
  type UpsertRotationPolicyInput,
  upsertRotationPolicySchema,
} from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { RequirePermission } from "../../common/rbac/require-permission.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { PlaylistsService } from "./playlists.service";

/**
 * Programming REST surface (Sprint 06 · §18). Product-language "programs" over
 * the playlists schema. Thin controller: validation via ZodValidationPipe,
 * authorization via @RequirePermission, all logic in PlaylistsService. The
 * tenant is always derived from the authenticated context, never the client.
 */
@Controller("programs")
export class PlaylistsController {
  constructor(private readonly service: PlaylistsService) {}

  @Post()
  @RequirePermission("playlists:program:create")
  create(
    @CurrentContext() ctx: RequestContext,
    @Body(new ZodValidationPipe(createProgramSchema)) input: CreateProgramInput,
  ): Promise<ProgramDto> {
    return this.service.createProgram(ctx, input);
  }

  @Get()
  @RequirePermission("playlists:program:read")
  list(
    @Query(new ZodValidationPipe(programListQuerySchema)) query: ProgramListQuery,
  ): Promise<{ items: ProgramDto[]; nextCursor: string | null }> {
    return this.service.listPrograms(query);
  }

  /* Static routes before ":id" (find-my-way prioritizes static). */
  @Get("rotation-policy")
  @RequirePermission("playlists:program:read")
  getRotationPolicy(@CurrentContext() ctx: RequestContext): Promise<RotationPolicyDto> {
    return this.service.getRotationPolicy(ctx);
  }

  @Put("rotation-policy")
  @RequirePermission("playlists:program:update")
  upsertRotationPolicy(
    @CurrentContext() ctx: RequestContext,
    @Body(new ZodValidationPipe(upsertRotationPolicySchema)) input: UpsertRotationPolicyInput,
  ): Promise<RotationPolicyDto> {
    return this.service.upsertRotationPolicy(ctx, input);
  }

  /* ----------------------------------------------------- rotation pairs -- */

  @Get("rotation-pairs")
  @RequirePermission("playlists:rotation_pair:read")
  listRotationPairs(
    @CurrentContext() ctx: RequestContext,
  ): Promise<{ items: RotationPairDto[]; nextCursor: string | null }> {
    return this.service.listRotationPairs(ctx);
  }

  @Post("rotation-pairs")
  @RequirePermission("playlists:rotation_pair:manage")
  createRotationPair(
    @CurrentContext() ctx: RequestContext,
    @Body(new ZodValidationPipe(createRotationPairSchema)) input: CreateRotationPairInput,
  ): Promise<RotationPairDto> {
    return this.service.createRotationPair(ctx, input);
  }

  @Patch("rotation-pairs/:pairId")
  @RequirePermission("playlists:rotation_pair:manage")
  updateRotationPair(
    @CurrentContext() ctx: RequestContext,
    @Param("pairId") pairId: string,
    @Body(new ZodValidationPipe(updateRotationPairSchema)) input: UpdateRotationPairInput,
  ): Promise<RotationPairDto> {
    return this.service.updateRotationPair(ctx, pairId, input);
  }

  @Delete("rotation-pairs/:pairId")
  @RequirePermission("playlists:rotation_pair:manage")
  @HttpCode(204)
  async deleteRotationPair(
    @CurrentContext() ctx: RequestContext,
    @Param("pairId") pairId: string,
  ): Promise<void> {
    await this.service.deleteRotationPair(ctx, pairId);
  }

  @Get(":id")
  @RequirePermission("playlists:program:read")
  get(@Param("id") id: string): Promise<ProgramDto> {
    return this.service.getProgram(id);
  }

  @Patch(":id")
  @RequirePermission("playlists:program:update")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProgramSchema)) input: UpdateProgramInput,
  ): Promise<ProgramDto> {
    return this.service.updateProgram(id, input);
  }

  @Get(":id/items")
  @RequirePermission("playlists:program:read")
  getItems(@Param("id") id: string): Promise<ProgramItemDto[]> {
    return this.service.getItems(id);
  }

  @Put(":id/items")
  @RequirePermission("playlists:program:update")
  setItems(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setProgramItemsSchema)) input: SetProgramItemsInput,
  ): Promise<ProgramDto> {
    return this.service.setItems(id, input);
  }

  @Post(":id/archive")
  @HttpCode(204)
  @RequirePermission("playlists:program:archive")
  async archive(@Param("id") id: string): Promise<void> {
    await this.service.archiveProgram(id);
  }

  @Post(":id/preview")
  @HttpCode(200)
  @RequirePermission("playlists:program:preview")
  preview(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(previewRequestSchema)) input: PreviewRequestInput,
  ): Promise<ExecutionPlanDto> {
    return this.service.preview(id, input);
  }

  @Post(":id/versions")
  @RequirePermission("playlists:program:publish")
  publish(
    @CurrentContext() ctx: RequestContext,
    @Param("id") id: string,
  ): Promise<ProgramVersionDto> {
    return this.service.publish(ctx, id);
  }

  @Get(":id/versions")
  @RequirePermission("playlists:program:read")
  listVersions(@Param("id") id: string): Promise<{ items: ProgramVersionDto[]; nextCursor: null }> {
    return this.service.listVersions(id);
  }

  @Get(":id/versions/:versionId")
  @RequirePermission("playlists:program:read")
  getVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ): Promise<ProgramVersionDto> {
    return this.service.getVersion(id, versionId);
  }

  @Post(":id/assignments")
  @RequirePermission("scheduling:program:assign")
  assign(
    @CurrentContext() ctx: RequestContext,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createAssignmentSchema)) input: CreateAssignmentInput,
  ): Promise<{ id: string; targetType: string; targetId: string }> {
    return this.service.createAssignment(ctx, id, input);
  }
}
