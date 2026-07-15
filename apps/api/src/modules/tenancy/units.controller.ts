import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  type CreateUnitInput,
  createUnitSchema,
  type CreateZoneInput,
  createZoneSchema,
  type UnitDto,
  type UnitListQuery,
  unitListQuerySchema,
  type UpdateUnitInput,
  updateUnitSchema,
  type ZoneDto,
} from "@senvori/contracts";
import { CurrentContext } from "../../common/auth/current-context.decorator";
import type { RequestContext } from "../../common/context/request-context";
import { RequirePermission } from "../../common/rbac/require-permission.decorator";
import { ZodValidationPipe } from "../../common/validation/zod-validation.pipe";
import { TenancyService } from "./tenancy.service";

/** /v1/units (§2.6) — list with pagination/search/filters, CRUD, soft delete, zones. */
@Controller("units")
export class UnitsController {
  constructor(private readonly tenancy: TenancyService) {}

  @Get()
  @RequirePermission("tenancy:unit:read")
  list(
    @Query(new ZodValidationPipe(unitListQuerySchema)) query: UnitListQuery,
  ): Promise<{ items: UnitDto[]; nextCursor: string | null }> {
    return this.tenancy.listUnits(query);
  }

  @Post()
  @RequirePermission("tenancy:unit:create")
  create(
    @CurrentContext() ctx: RequestContext,
    @Body(new ZodValidationPipe(createUnitSchema)) input: CreateUnitInput,
  ): Promise<UnitDto> {
    return this.tenancy.createUnit(ctx, input);
  }

  @Get(":id")
  @RequirePermission("tenancy:unit:read", { unitParam: "id" })
  get(@Param("id") id: string): Promise<UnitDto> {
    return this.tenancy.getUnit(id);
  }

  @Patch(":id")
  @RequirePermission("tenancy:unit:update", { unitParam: "id" })
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateUnitSchema)) input: UpdateUnitInput,
  ): Promise<UnitDto> {
    return this.tenancy.updateUnit(id, input);
  }

  @Post(":id/archive")
  @HttpCode(204)
  @RequirePermission("tenancy:unit:manage", { unitParam: "id" })
  async archive(@Param("id") id: string): Promise<void> {
    await this.tenancy.archiveUnit(id);
  }

  @Get(":unitId/zones")
  @RequirePermission("tenancy:unit:read", { unitParam: "unitId" })
  listZones(@Param("unitId") unitId: string): Promise<ZoneDto[]> {
    return this.tenancy.listZones(unitId);
  }

  @Post(":unitId/zones")
  @RequirePermission("tenancy:unit:update", { unitParam: "unitId" })
  createZone(
    @CurrentContext() ctx: RequestContext,
    @Param("unitId") unitId: string,
    @Body(new ZodValidationPipe(createZoneSchema)) input: CreateZoneInput,
  ): Promise<ZoneDto> {
    return this.tenancy.createZone(ctx, unitId, input);
  }
}
