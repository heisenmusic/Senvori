import { Body, Controller, Get, Patch } from "@nestjs/common";
import { type CurrentUserDto, type UpdateMeInput, updateMeSchema } from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { IdentityService } from "./identity.service";

/** GET/PATCH /v1/me — current session identity (§1.6). Authenticated, no extra permission. */
@Controller()
export class MeController {
  constructor(private readonly identity: IdentityService) {}

  @Get("me")
  me(@CurrentContext() ctx: RequestContext): CurrentUserDto {
    return this.identity.me(ctx);
  }

  @Patch("me")
  async update(
    @CurrentContext() ctx: RequestContext,
    @Body(new ZodValidationPipe(updateMeSchema)) input: UpdateMeInput,
  ): Promise<{ ok: true }> {
    await this.identity.updateMe(ctx, input);
    return { ok: true };
  }
}
