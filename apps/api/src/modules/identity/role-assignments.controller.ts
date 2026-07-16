import { Body, Controller, Delete, HttpCode, Param, Post } from "@nestjs/common";
import { type AssignRoleInput, assignRoleSchema, type RoleAssignmentDto } from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { RequirePermission } from "../../common/rbac/require-permission.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { IdentityService } from "./identity.service";

/** /v1/role-assignments — hierarchical RBAC grants (§1.6). */
@Controller("role-assignments")
export class RoleAssignmentsController {
  constructor(private readonly identity: IdentityService) {}

  @Post()
  @RequirePermission("identity:role:assign")
  assign(
    @CurrentContext() ctx: RequestContext,
    @Body(new ZodValidationPipe(assignRoleSchema)) input: AssignRoleInput,
  ): Promise<RoleAssignmentDto> {
    return this.identity.assignRole(ctx, input);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("identity:role:assign")
  async revoke(@CurrentContext() ctx: RequestContext, @Param("id") id: string): Promise<void> {
    await this.identity.revokeRoleAssignment(ctx, id);
  }
}
