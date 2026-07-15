import { Injectable, NotFoundException } from "@nestjs/common";
import type {
  BrandDto,
  CreateBrandInput,
  CreateGroupInput,
  CreateUnitInput,
  CreateZoneInput,
  GroupDto,
  UnitDto,
  UnitListQuery,
  UpdateBrandInput,
  UpdateGroupInput,
  UpdateUnitInput,
  ZoneDto,
} from "@senvori/contracts";
import { and, asc, eq, gt, ilike, isNull, type SQL } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { brands, groups, units, zones } from "../../database/schema";
import { AuditLogService } from "../../common/audit/audit-log.service";
import type { RequestContext } from "../../common/context/request-context";
import { TenantContextService } from "../../common/context/tenant-context.service";

const iso = (d: Date | null | undefined): string => (d ?? new Date()).toISOString();

type BrandRow = typeof brands.$inferSelect;
type GroupRow = typeof groups.$inferSelect;
type UnitRow = typeof units.$inferSelect;
type ZoneRow = typeof zones.$inferSelect;

/**
 * Tenancy domain service — SENVORI_CORE_DOMAINS.md §2. Every query runs inside
 * the tenant RLS context (TenantContextService.withTenant). Lists exclude
 * soft-deleted rows (archived_at). Administrative mutations are audited.
 */
@Injectable()
export class TenancyService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditLogService,
  ) {}

  /* ------------------------------------------------------------- brands -- */

  async listBrands(): Promise<BrandDto[]> {
    const rows = await this.tenantContext.withTenant((tx) =>
      tx.select().from(brands).where(isNull(brands.archivedAt)).orderBy(asc(brands.id)),
    );
    return rows.map(this.toBrand);
  }

  async createBrand(ctx: RequestContext, input: CreateBrandInput): Promise<BrandDto> {
    const id = uuidv7();
    const [row] = await this.tenantContext.withTenant((tx) =>
      tx
        .insert(brands)
        .values({
          id,
          tenantId: ctx.tenantId,
          name: input.name,
          slug: input.slug,
          defaultLocale: input.defaultLocale ?? null,
        })
        .returning(),
    );
    await this.audit.record({
      action: "tenancy.brand.created",
      resourceType: "brand",
      resourceId: id,
      scopeType: "brand",
      scopeId: id,
      after: input,
    });
    return this.toBrand(row);
  }

  async updateBrand(id: string, input: UpdateBrandInput): Promise<BrandDto> {
    const before = await this.requireBrand(id);
    const [row] = await this.tenantContext.withTenant((tx) =>
      tx
        .update(brands)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.slug !== undefined ? { slug: input.slug } : {}),
          ...(input.defaultLocale !== undefined ? { defaultLocale: input.defaultLocale } : {}),
          updatedAt: new Date(),
        })
        .where(eq(brands.id, id))
        .returning(),
    );
    await this.audit.record({
      action: "tenancy.brand.updated",
      resourceType: "brand",
      resourceId: id,
      scopeType: "brand",
      scopeId: id,
      before: this.toBrand(before),
      after: this.toBrand(row),
    });
    return this.toBrand(row);
  }

  /* ------------------------------------------------------------- groups -- */

  async listGroups(): Promise<GroupDto[]> {
    const rows = await this.tenantContext.withTenant((tx) =>
      tx.select().from(groups).where(isNull(groups.archivedAt)).orderBy(asc(groups.id)),
    );
    return rows.map(this.toGroup);
  }

  async createGroup(ctx: RequestContext, input: CreateGroupInput): Promise<GroupDto> {
    const id = uuidv7();
    const [row] = await this.tenantContext.withTenant((tx) =>
      tx
        .insert(groups)
        .values({
          id,
          tenantId: ctx.tenantId,
          name: input.name,
          kind: input.kind ?? null,
          description: input.description ?? null,
        })
        .returning(),
    );
    await this.audit.record({
      action: "tenancy.group.created",
      resourceType: "group",
      resourceId: id,
      scopeType: "group",
      scopeId: id,
      after: input,
    });
    return this.toGroup(row);
  }

  async updateGroup(id: string, input: UpdateGroupInput): Promise<GroupDto> {
    await this.requireGroup(id);
    const [row] = await this.tenantContext.withTenant((tx) =>
      tx
        .update(groups)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.kind !== undefined ? { kind: input.kind } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          updatedAt: new Date(),
        })
        .where(eq(groups.id, id))
        .returning(),
    );
    await this.audit.record({
      action: "tenancy.group.updated",
      resourceType: "group",
      resourceId: id,
      scopeType: "group",
      scopeId: id,
      after: this.toGroup(row),
    });
    return this.toGroup(row);
  }

  async archiveGroup(id: string): Promise<void> {
    await this.requireGroup(id);
    await this.tenantContext.withTenant((tx) =>
      tx.update(groups).set({ archivedAt: new Date() }).where(eq(groups.id, id)),
    );
    await this.audit.record({
      action: "tenancy.group.archived",
      resourceType: "group",
      resourceId: id,
    });
  }

  /* -------------------------------------------------------------- units -- */

  async listUnits(query: UnitListQuery): Promise<{ items: UnitDto[]; nextCursor: string | null }> {
    const conditions: SQL[] = [isNull(units.archivedAt)];
    if (query.brandId) conditions.push(eq(units.brandId, query.brandId));
    if (query.countryCode) conditions.push(eq(units.countryCode, query.countryCode));
    if (query.status) conditions.push(eq(units.status, query.status));
    if (query.q) conditions.push(ilike(units.name, `%${query.q}%`));
    if (query.cursor) conditions.push(gt(units.id, query.cursor));

    const rows = await this.tenantContext.withTenant((tx) =>
      tx
        .select()
        .from(units)
        .where(and(...conditions))
        .orderBy(asc(units.id))
        .limit(query.limit + 1),
    );

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return {
      items: page.map(this.toUnit),
      nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
    };
  }

  async getUnit(id: string): Promise<UnitDto> {
    return this.toUnit(await this.requireUnit(id));
  }

  async createUnit(ctx: RequestContext, input: CreateUnitInput): Promise<UnitDto> {
    const id = uuidv7();
    const unit = await this.tenantContext.withTenant(async (tx) => {
      const [created] = await tx
        .insert(units)
        .values({
          id,
          tenantId: ctx.tenantId,
          brandId: input.brandId,
          countryCode: input.countryCode,
          name: input.name,
          externalCode: input.externalCode ?? null,
          timezone: input.timezone,
          locale: input.locale,
          address: input.address ?? null,
          latitude: input.latitude ?? null,
          longitude: input.longitude ?? null,
        })
        .returning();
      // §2.4 case 4: every unit is born with a default zone.
      await tx.insert(zones).values({
        id: uuidv7(),
        tenantId: ctx.tenantId,
        unitId: id,
        name: "Default",
        kind: "audio",
        isDefault: true,
      });
      return created;
    });
    await this.audit.record({
      action: "tenancy.unit.created",
      resourceType: "unit",
      resourceId: id,
      scopeType: "unit",
      scopeId: id,
      after: input,
    });
    return this.toUnit(unit);
  }

  async updateUnit(id: string, input: UpdateUnitInput): Promise<UnitDto> {
    const before = await this.requireUnit(id);
    const [row] = await this.tenantContext.withTenant((tx) =>
      tx
        .update(units)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.externalCode !== undefined ? { externalCode: input.externalCode } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.locale !== undefined ? { locale: input.locale } : {}),
          ...(input.address !== undefined ? { address: input.address } : {}),
          ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
          ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(units.id, id))
        .returning(),
    );
    await this.audit.record({
      action: "tenancy.unit.updated",
      resourceType: "unit",
      resourceId: id,
      scopeType: "unit",
      scopeId: id,
      before: this.toUnit(before),
      after: this.toUnit(row),
    });
    return this.toUnit(row);
  }

  async archiveUnit(id: string): Promise<void> {
    const before = await this.requireUnit(id);
    await this.tenantContext.withTenant((tx) =>
      tx.update(units).set({ status: "archived", archivedAt: new Date() }).where(eq(units.id, id)),
    );
    await this.audit.record({
      action: "tenancy.unit.archived",
      resourceType: "unit",
      resourceId: id,
      scopeType: "unit",
      scopeId: id,
      before: { status: before.status },
      after: { status: "archived" },
    });
  }

  /* -------------------------------------------------------------- zones -- */

  async listZones(unitId: string): Promise<ZoneDto[]> {
    await this.requireUnit(unitId);
    const rows = await this.tenantContext.withTenant((tx) =>
      tx
        .select()
        .from(zones)
        .where(and(eq(zones.unitId, unitId), isNull(zones.archivedAt)))
        .orderBy(asc(zones.id)),
    );
    return rows.map(this.toZone);
  }

  async createZone(ctx: RequestContext, unitId: string, input: CreateZoneInput): Promise<ZoneDto> {
    await this.requireUnit(unitId);
    const id = uuidv7();
    const [row] = await this.tenantContext.withTenant((tx) =>
      tx
        .insert(zones)
        .values({ id, tenantId: ctx.tenantId, unitId, name: input.name, kind: input.kind })
        .returning(),
    );
    await this.audit.record({
      action: "tenancy.zone.created",
      resourceType: "zone",
      resourceId: id,
      scopeType: "unit",
      scopeId: unitId,
      after: input,
    });
    return this.toZone(row);
  }

  /* --------------------------------------------------------- internals -- */

  private async requireBrand(id: string): Promise<BrandRow> {
    const [row] = await this.tenantContext.withTenant((tx) =>
      tx
        .select()
        .from(brands)
        .where(and(eq(brands.id, id), isNull(brands.archivedAt))),
    );
    if (!row) throw new NotFoundException({ code: "BRAND_NOT_FOUND", title: "Brand not found" });
    return row;
  }

  private async requireGroup(id: string): Promise<GroupRow> {
    const [row] = await this.tenantContext.withTenant((tx) =>
      tx
        .select()
        .from(groups)
        .where(and(eq(groups.id, id), isNull(groups.archivedAt))),
    );
    if (!row) throw new NotFoundException({ code: "GROUP_NOT_FOUND", title: "Group not found" });
    return row;
  }

  private async requireUnit(id: string): Promise<UnitRow> {
    const [row] = await this.tenantContext.withTenant((tx) =>
      tx
        .select()
        .from(units)
        .where(and(eq(units.id, id), isNull(units.archivedAt))),
    );
    if (!row) throw new NotFoundException({ code: "UNIT_NOT_FOUND", title: "Unit not found" });
    return row;
  }

  private toBrand = (r: BrandRow | undefined): BrandDto => {
    if (!r) throw new NotFoundException({ code: "BRAND_NOT_FOUND", title: "Brand not found" });
    return {
      id: r.id,
      tenantId: r.tenantId,
      name: r.name,
      slug: r.slug,
      defaultLocale: r.defaultLocale,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  };

  private toGroup = (r: GroupRow | undefined): GroupDto => {
    if (!r) throw new NotFoundException({ code: "GROUP_NOT_FOUND", title: "Group not found" });
    return {
      id: r.id,
      tenantId: r.tenantId,
      name: r.name,
      kind: r.kind,
      description: r.description,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  };

  private toUnit = (r: UnitRow | undefined): UnitDto => {
    if (!r) throw new NotFoundException({ code: "UNIT_NOT_FOUND", title: "Unit not found" });
    return {
      id: r.id,
      tenantId: r.tenantId,
      brandId: r.brandId,
      countryCode: r.countryCode,
      name: r.name,
      externalCode: r.externalCode,
      timezone: r.timezone,
      locale: r.locale,
      address: (r.address as UnitDto["address"]) ?? null,
      latitude: r.latitude,
      longitude: r.longitude,
      status: r.status,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  };

  private toZone = (r: ZoneRow | undefined): ZoneDto => {
    if (!r) throw new NotFoundException({ code: "ZONE_NOT_FOUND", title: "Zone not found" });
    return {
      id: r.id,
      tenantId: r.tenantId,
      unitId: r.unitId,
      name: r.name,
      kind: r.kind,
      isDefault: r.isDefault,
      createdAt: iso(r.createdAt),
      updatedAt: iso(r.updatedAt),
    };
  };
}
