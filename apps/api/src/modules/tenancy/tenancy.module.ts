import { Module } from "@nestjs/common";
import { BrandsController } from "./brands.controller";
import { GroupsController } from "./groups.controller";
import { UnitsController } from "./units.controller";
import { TenancyService } from "./tenancy.service";

/**
 * Tenancy domain — SENVORI_CORE_DOMAINS.md §2.
 * CRUD for brands, groups, units and zones with pagination/search/filters,
 * soft delete, audit and hierarchical permissions.
 */
@Module({
  controllers: [BrandsController, GroupsController, UnitsController],
  providers: [TenancyService],
})
export class TenancyModule {}
