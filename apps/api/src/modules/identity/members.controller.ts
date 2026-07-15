import { Controller, Delete, Get, HttpCode, Param } from "@nestjs/common";
import type { MembershipWithUserDto } from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { RequirePermission } from "../../common/rbac/require-permission.decorator";
import { IdentityService } from "./identity.service";

/** /v1/members — tenant membership management (§1.6). */
@Controller("members")
export class MembersController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  @RequirePermission("identity:member:read")
  list(@CurrentContext() ctx: RequestContext): Promise<MembershipWithUserDto[]> {
    return this.identity.listMembers(ctx);
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("identity:member:manage")
  async suspend(@CurrentContext() ctx: RequestContext, @Param("id") id: string): Promise<void> {
    await this.identity.suspendMember(ctx, id);
  }
}
