import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from "@nestjs/common";
import {
  type CreateGroupInput,
  createGroupSchema,
  type GroupDto,
  type UpdateGroupInput,
  updateGroupSchema,
} from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { RequirePermission } from "../../common/rbac/require-permission.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { TenancyService } from "./tenancy.service";

/** /v1/groups (§2.6). */
@Controller("groups")
export class GroupsController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get()
  @RequirePermission("tenancy:group:manage")
  list(): Promise<GroupDto[]> {
    return this.tenancy.listGroups();
  }

  @Post()
  @RequirePermission("tenancy:group:manage")
  create(
    @CurrentContext() ctx: RequestContext,
    @Body(new ZodValidationPipe(createGroupSchema)) input: CreateGroupInput,
  ): Promise<GroupDto> {
    return this.tenancy.createGroup(ctx, input);
  }

  @Patch(":id")
  @RequirePermission("tenancy:group:manage", { groupParam: "id" })
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateGroupSchema)) input: UpdateGroupInput,
  ): Promise<GroupDto> {
    return this.tenancy.updateGroup(id, input);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("tenancy:group:manage", { groupParam: "id" })
  async archive(@Param("id") id: string): Promise<void> {
    await this.tenancy.archiveGroup(id);
  }
}
