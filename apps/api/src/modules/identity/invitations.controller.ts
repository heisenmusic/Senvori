import { Body, Controller, Get, Post } from "@nestjs/common";
import { type InviteMemberInput, inviteMemberSchema } from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { RequirePermission } from "../../common/rbac/require-permission.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { IdentityService } from "./identity.service";

/** /v1/invitations — tenant invitations (§1.6). */
@Controller("invitations")
export class InvitationsController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  @RequirePermission("identity:member:read")
  list(@CurrentContext() ctx: RequestContext) {
    return this.identity.listInvitations(ctx);
  }

  @Post()
  @RequirePermission("identity:member:invite")
  create(
    @CurrentContext() ctx: RequestContext,
    @Body(new ZodValidationPipe(inviteMemberSchema)) input: InviteMemberInput,
  ): Promise<{ id: string }> {
    return this.identity.createInvitation(ctx, input);
  }
}
