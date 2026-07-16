import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import {
  type BrandDto,
  type CreateBrandInput,
  createBrandSchema,
  type UpdateBrandInput,
  updateBrandSchema,
} from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { RequirePermission } from "../../common/rbac/require-permission.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { TenancyService } from "./tenancy.service";

/** /v1/brands (§2.6). */
@Controller("brands")
export class BrandsController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get()
  @RequirePermission("tenancy:brand:manage")
  list(): Promise<BrandDto[]> {
    return this.tenancy.listBrands();
  }

  @Post()
  @RequirePermission("tenancy:brand:manage")
  create(
    @CurrentContext() ctx: RequestContext,
    @Body(new ZodValidationPipe(createBrandSchema)) input: CreateBrandInput,
  ): Promise<BrandDto> {
    return this.tenancy.createBrand(ctx, input);
  }

  @Patch(":id")
  @RequirePermission("tenancy:brand:manage", { brandParam: "id" })
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateBrandSchema)) input: UpdateBrandInput,
  ): Promise<BrandDto> {
    return this.tenancy.updateBrand(id, input);
  }
}
