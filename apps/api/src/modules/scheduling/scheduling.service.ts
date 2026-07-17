import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateLocalEventInput,
  CreateScheduleAssignmentInput,
  EffectivePlanDto,
  LocalEventDto,
  ScheduleAssignmentDto,
  ScheduleResolutionDto,
  ScheduleResolveRequestInput,
  UpdateLocalEventInput,
  UpdateScheduleAssignmentInput,
} from "@senvori/contracts";
import { uuidv7 } from "uuidv7";
import { AuditLogService } from "../../common/audit/audit-log.service";
import type { RequestContext } from "../../common/context/request-context";
import { TenantContextService } from "../../common/context/tenant-context.service";
import {
  type LocalEventRow,
  SchedulingRepository,
  type ScheduleAssignmentRow,
} from "./scheduling.repository";
import {
  assembleEffectivePlan,
  resolveSchedule,
  type ResolverAssignment,
  type ScheduleResolutionInput,
} from "./resolver/resolver";
import {
  type LocalEventContext,
  type ResolverLocalEvent,
  selectLocalEventOverlays,
} from "./resolver/local-events";

const iso = (d: Date | null | undefined): string => (d ?? new Date()).toISOString();

/**
 * Scheduling Runtime service (Sprint 08). Thin controllers delegate here; every
 * mutation runs in one tenant transaction (RLS + atomic audit). Resolution and
 * the effective plan are computed by the pure resolver — this layer only loads
 * data and maps it, never re-implements the decision logic.
 */
@Injectable()
export class SchedulingService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly repo: SchedulingRepository,
    private readonly audit: AuditLogService,
  ) {}

  /* --------------------------------------------------------- assignments -- */

  async listAssignments(
    ctx: RequestContext,
  ): Promise<{ items: ScheduleAssignmentDto[]; nextCursor: null }> {
    return this.tenantContext.withTenant(async (tx) => {
      const rows = await this.repo.listAssignments(tx, ctx.tenantId);
      return { items: rows.map((r) => this.toDto(r)), nextCursor: null };
    });
  }

  async createAssignment(
    ctx: RequestContext,
    input: CreateScheduleAssignmentInput,
  ): Promise<ScheduleAssignmentDto> {
    return this.tenantContext.withTenant(async (tx) => {
      if (!(await this.repo.programExists(tx, input.programId))) {
        throw new BadRequestException({ code: "PROGRAM_NOT_FOUND", title: "Unknown program" });
      }
      const row = await this.repo.insertAssignment(tx, {
        id: uuidv7(),
        tenantId: ctx.tenantId,
        programId: input.programId,
        programVersionId: input.programVersionId ?? null,
        targetType: input.targetType,
        targetId: input.targetId,
        priority: input.priority,
        daysOfWeek: input.daysOfWeek,
        startTimeLocal: input.startTimeLocal,
        endTimeLocal: input.endTimeLocal,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        active: input.active,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      });
      await this.audit.recordInTx(tx, {
        action: "scheduling.assignment.created",
        resourceType: "schedule_assignment",
        resourceId: row.id,
        after: this.toDto(row),
      });
      return this.toDto(row);
    });
  }

  async updateAssignment(
    ctx: RequestContext,
    id: string,
    input: UpdateScheduleAssignmentInput,
  ): Promise<ScheduleAssignmentDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const before = await this.repo.findAssignment(tx, id);
      if (!before) {
        throw new NotFoundException({
          code: "ASSIGNMENT_NOT_FOUND",
          title: "Assignment not found",
        });
      }
      const start = input.startTimeLocal ?? before.startTimeLocal;
      const end = input.endTimeLocal ?? before.endTimeLocal;
      if (start >= end) {
        throw new BadRequestException({
          code: "INVALID_WINDOW",
          title: "startTimeLocal must be before endTimeLocal",
        });
      }
      const row = await this.repo.updateAssignment(tx, id, {
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.daysOfWeek !== undefined ? { daysOfWeek: input.daysOfWeek } : {}),
        ...(input.startTimeLocal !== undefined ? { startTimeLocal: input.startTimeLocal } : {}),
        ...(input.endTimeLocal !== undefined ? { endTimeLocal: input.endTimeLocal } : {}),
        ...(input.validFrom !== undefined ? { validFrom: input.validFrom } : {}),
        ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        updatedBy: ctx.userId,
      });
      if (!row) {
        throw new NotFoundException({
          code: "ASSIGNMENT_NOT_FOUND",
          title: "Assignment not found",
        });
      }
      await this.audit.recordInTx(tx, {
        action: "scheduling.assignment.updated",
        resourceType: "schedule_assignment",
        resourceId: id,
        before: this.toDto(before),
        after: this.toDto(row),
      });
      return this.toDto(row);
    });
  }

  async deleteAssignment(ctx: RequestContext, id: string): Promise<void> {
    return this.tenantContext.withTenant(async (tx) => {
      const before = await this.repo.findAssignment(tx, id);
      if (!before) {
        throw new NotFoundException({
          code: "ASSIGNMENT_NOT_FOUND",
          title: "Assignment not found",
        });
      }
      await this.repo.archiveAssignment(tx, id);
      await this.audit.recordInTx(tx, {
        action: "scheduling.assignment.archived",
        resourceType: "schedule_assignment",
        resourceId: id,
        before: this.toDto(before),
      });
    });
  }

  /* -------------------------------------------------------- local events -- */

  async listLocalEvents(
    ctx: RequestContext,
  ): Promise<{ items: LocalEventDto[]; nextCursor: null }> {
    return this.tenantContext.withTenant(async (tx) => {
      const rows = await this.repo.listLocalEvents(tx, ctx.tenantId);
      return { items: rows.map((r) => this.toEventDto(r)), nextCursor: null };
    });
  }

  async createLocalEvent(
    ctx: RequestContext,
    input: CreateLocalEventInput,
  ): Promise<LocalEventDto> {
    return this.tenantContext.withTenant(async (tx) => {
      if (input.assetId && !(await this.repo.assetExists(tx, input.assetId))) {
        throw new BadRequestException({ code: "ASSET_NOT_FOUND", title: "Unknown asset" });
      }
      const row = await this.repo.insertLocalEvent(tx, {
        id: uuidv7(),
        tenantId: ctx.tenantId,
        assetId: input.assetId ?? null,
        targetType: input.targetType,
        targetId: input.targetId,
        kind: input.kind,
        category: input.category,
        priority: input.priority,
        daysOfWeek: input.daysOfWeek,
        startTimeLocal: input.startTimeLocal,
        endTimeLocal: input.endTimeLocal,
        startOffsetMs: input.startOffsetMs,
        durationMs: input.durationMs,
        duckingDb: input.duckingDb ?? null,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        active: input.active,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      });
      await this.audit.recordInTx(tx, {
        action: "scheduling.local_event.created",
        resourceType: "local_event",
        resourceId: row.id,
        after: this.toEventDto(row),
      });
      return this.toEventDto(row);
    });
  }

  async updateLocalEvent(
    ctx: RequestContext,
    id: string,
    input: UpdateLocalEventInput,
  ): Promise<LocalEventDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const before = await this.repo.findLocalEvent(tx, id);
      if (!before) {
        throw new NotFoundException({ code: "EVENT_NOT_FOUND", title: "Local event not found" });
      }
      const start = input.startTimeLocal ?? before.startTimeLocal;
      const end = input.endTimeLocal ?? before.endTimeLocal;
      if (start >= end) {
        throw new BadRequestException({
          code: "INVALID_WINDOW",
          title: "startTimeLocal must be before endTimeLocal",
        });
      }
      const row = await this.repo.updateLocalEvent(tx, id, {
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.daysOfWeek !== undefined ? { daysOfWeek: input.daysOfWeek } : {}),
        ...(input.startTimeLocal !== undefined ? { startTimeLocal: input.startTimeLocal } : {}),
        ...(input.endTimeLocal !== undefined ? { endTimeLocal: input.endTimeLocal } : {}),
        ...(input.startOffsetMs !== undefined ? { startOffsetMs: input.startOffsetMs } : {}),
        ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
        ...(input.duckingDb !== undefined ? { duckingDb: input.duckingDb } : {}),
        ...(input.validFrom !== undefined ? { validFrom: input.validFrom } : {}),
        ...(input.validUntil !== undefined ? { validUntil: input.validUntil } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        updatedBy: ctx.userId,
      });
      if (!row) {
        throw new NotFoundException({ code: "EVENT_NOT_FOUND", title: "Local event not found" });
      }
      await this.audit.recordInTx(tx, {
        action: "scheduling.local_event.updated",
        resourceType: "local_event",
        resourceId: id,
        before: this.toEventDto(before),
        after: this.toEventDto(row),
      });
      return this.toEventDto(row);
    });
  }

  async deleteLocalEvent(ctx: RequestContext, id: string): Promise<void> {
    return this.tenantContext.withTenant(async (tx) => {
      const before = await this.repo.findLocalEvent(tx, id);
      if (!before) {
        throw new NotFoundException({ code: "EVENT_NOT_FOUND", title: "Local event not found" });
      }
      await this.repo.archiveLocalEvent(tx, id);
      await this.audit.recordInTx(tx, {
        action: "scheduling.local_event.archived",
        resourceType: "local_event",
        resourceId: id,
        before: this.toEventDto(before),
      });
    });
  }

  /* ----------------------------------------------------------- resolve -- */

  async resolve(input: ScheduleResolveRequestInput): Promise<ScheduleResolutionDto> {
    const resolution = await this.tenantContext.withTenant(async (tx) => {
      const ctx = this.tenantContext.get();
      const rows = await this.repo.loadActiveAssignments(tx, ctx.tenantId);
      return resolveSchedule(this.resolverInput(ctx.tenantId, input, rows));
    });
    return resolution;
  }

  async previewEffectivePlan(input: ScheduleResolveRequestInput): Promise<EffectivePlanDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const ctx = this.tenantContext.get();
      const rows = await this.repo.loadActiveAssignments(tx, ctx.tenantId);
      const resolution = resolveSchedule(this.resolverInput(ctx.tenantId, input, rows));

      // Base plan hash: the shared identity for a sync group (§15). Pinned
      // version wins; otherwise the program's current published version.
      let basePlanHash: string | null = null;
      if (resolution.selectedProgramVersionId) {
        basePlanHash = await this.repo.versionPlanHash(tx, resolution.selectedProgramVersionId);
      } else if (resolution.selectedProgramId) {
        basePlanHash = await this.repo.currentPlanHash(tx, resolution.selectedProgramId);
      }

      // Local events (editorial / campaign / emergency) become ordered overlays
      // on top of the base plan — the effective plan hash changes iff any apply.
      const eventRows = await this.repo.loadActiveLocalEvents(tx, ctx.tenantId);
      const selection = selectLocalEventOverlays(eventRows.map(toResolverEvent), {
        tenantId: ctx.tenantId,
        unitId: input.unitId,
        syncGroupId: input.syncGroupId ?? null,
        groupIds: input.groupIds,
        localDate: input.localDate,
        localTime: input.localTime,
      } satisfies LocalEventContext);

      return assembleEffectivePlan({
        unitId: input.unitId,
        localDate: input.localDate,
        timezone: input.timezone,
        resolution,
        basePlanHash,
        overlays: selection.overlays,
        emergencyActive: selection.emergencyActive,
        overlayWarnings: selection.warnings,
      });
    });
  }

  /* ------------------------------------------------------------ helpers -- */

  private resolverInput(
    tenantId: string,
    input: ScheduleResolveRequestInput,
    rows: ScheduleAssignmentRow[],
  ): ScheduleResolutionInput {
    const assignments: ResolverAssignment[] = rows.map((r) => ({
      id: r.id,
      programId: r.programId,
      programVersionId: r.programVersionId,
      targetType: r.targetType,
      targetId: r.targetId,
      priority: r.priority,
      daysOfWeek: r.daysOfWeek,
      startTimeLocal: r.startTimeLocal,
      endTimeLocal: r.endTimeLocal,
      validFrom: r.validFrom,
      validUntil: r.validUntil,
      active: r.active,
    }));
    return {
      tenantId,
      unitId: input.unitId,
      syncGroupId: input.syncGroupId ?? null,
      groupIds: input.groupIds,
      timezone: input.timezone,
      localDate: input.localDate,
      localTime: input.localTime,
      assignments,
    };
  }

  private toDto(row: ScheduleAssignmentRow): ScheduleAssignmentDto {
    return {
      id: row.id,
      programId: row.programId,
      programVersionId: row.programVersionId,
      targetType: row.targetType,
      targetId: row.targetId,
      priority: row.priority,
      daysOfWeek: row.daysOfWeek,
      startTimeLocal: row.startTimeLocal,
      endTimeLocal: row.endTimeLocal,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      active: row.active,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private toEventDto(row: LocalEventRow): LocalEventDto {
    return {
      id: row.id,
      assetId: row.assetId,
      targetType: row.targetType,
      targetId: row.targetId,
      kind: row.kind,
      category: row.category,
      priority: row.priority,
      daysOfWeek: row.daysOfWeek,
      startTimeLocal: row.startTimeLocal,
      endTimeLocal: row.endTimeLocal,
      startOffsetMs: row.startOffsetMs,
      durationMs: row.durationMs,
      duckingDb: row.duckingDb,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      active: row.active,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }
}

/** Map a persisted local-event row to the pure resolver's view. */
const toResolverEvent = (row: LocalEventRow): ResolverLocalEvent => ({
  id: row.id,
  assetId: row.assetId,
  targetType: row.targetType,
  targetId: row.targetId,
  kind: row.kind,
  category: row.category,
  priority: row.priority,
  daysOfWeek: row.daysOfWeek,
  startTimeLocal: row.startTimeLocal,
  endTimeLocal: row.endTimeLocal,
  startOffsetMs: row.startOffsetMs,
  durationMs: row.durationMs,
  duckingDb: row.duckingDb,
  validFrom: row.validFrom,
  validUntil: row.validUntil,
  active: row.active,
});
