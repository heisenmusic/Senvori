import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateAssignmentInput,
  CreateProgramInput,
  CreateRotationPairInput,
  ExecutionPlanDto,
  PreviewRequestInput,
  ProgramDto,
  ProgramItemDto,
  ProgramListQuery,
  ProgramVersionDto,
  RotationPairDto,
  RotationPolicyDto,
  SetProgramItemsInput,
  UpdateProgramInput,
  UpdateRotationPairInput,
  UpsertRotationPolicyInput,
} from "@senvori/contracts";
import { uuidv7 } from "uuidv7";
import { AuditLogService } from "../../common/audit/audit-log.service";
import type { RequestContext } from "../../common/context/request-context";
import { TenantContextService } from "../../common/context/tenant-context.service";
import type { TenantTx } from "../../database/tenant-context";
import {
  COMPILER_VERSION,
  CompileError,
  type AvoidPair,
  type CandidateTrack,
  type CarryOverItem,
  type CompilationContext,
  type FallbackPolicy,
  type RotationRules,
  compile,
} from "./compiler";
import { hashPlan } from "./compiler/seed";
import { buildPlannedHistory } from "./history/programming-history";
import {
  PlaylistsRepository,
  type ActivePair,
  type CandidateRow,
  type ProgramRow,
  type ProgramVersionRow,
  type RotationPairRow,
  type RotationPairView,
  type RotationPolicyRow,
} from "./playlists.repository";

const iso = (d: Date | null | undefined): string => (d ?? new Date()).toISOString();
const isoOrNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Postgres unique-violation SQLSTATE (23505) — surfaced as a 409 Conflict. */
const isUniqueViolation = (e: unknown): boolean =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";

const DEFAULT_TRACK_GAP = 180;
const DEFAULT_ARTIST_GAP = 45;
/** Historical Programming Runtime defaults (Sprint 07B · §14). */
const DEFAULT_LOOKBACK_DAYS = 7;
const DEFAULT_CROSS_DAY_CONTINUITY = true;
/** Trailing items of the previous day carried across the seam. */
const HISTORY_TAIL_SIZE = 8;

/**
 * Programming domain service (Sprint 06 · F4). Thin controllers delegate here;
 * every mutation runs in a single tenant transaction (RLS + atomic audit). The
 * pure compiler is integrated for preview (ephemeral) and publish (immutable
 * version) — domain rules live here and in the compiler, never duplicated.
 */
@Injectable()
export class PlaylistsService {
  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly repo: PlaylistsRepository,
    private readonly audit: AuditLogService,
  ) {}

  /* -------------------------------------------------------------- programs -- */

  async createProgram(ctx: RequestContext, input: CreateProgramInput): Promise<ProgramDto> {
    const id = uuidv7();
    await this.tenantContext.withTenant(async (tx) => {
      await this.repo.insertProgram(tx, {
        id,
        tenantId: ctx.tenantId,
        type: input.type,
        name: input.name,
        description: input.description ?? null,
        status: "draft",
        ownerId: ctx.userId,
      });
      await this.audit.recordInTx(tx, {
        action: "programming.program.created",
        resourceType: "program",
        resourceId: id,
        after: { name: input.name, type: input.type },
      });
    });
    return this.getProgram(id);
  }

  async listPrograms(
    query: ProgramListQuery,
  ): Promise<{ items: ProgramDto[]; nextCursor: string | null }> {
    return this.tenantContext.withTenant(async (tx) => {
      const { rows, hasMore } = await this.repo.listPrograms(tx, query);
      const items = await Promise.all(
        rows.map(async (r) =>
          this.toDto(
            r,
            await this.repo.countItems(tx, r.id),
            await this.resolvePublishedVersion(tx, r),
          ),
        ),
      );
      return { items, nextCursor: hasMore ? (rows[rows.length - 1]?.id ?? null) : null };
    });
  }

  async getProgram(id: string): Promise<ProgramDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const program = await this.requireProgram(tx, id);
      return this.toDto(
        program,
        await this.repo.countItems(tx, id),
        await this.resolvePublishedVersion(tx, program),
      );
    });
  }

  /** Ordered content of a program, with the Library metadata to display it. */
  async getItems(id: string): Promise<ProgramItemDto[]> {
    return this.tenantContext.withTenant(async (tx) => {
      await this.requireProgram(tx, id);
      return this.repo.listItems(tx, id);
    });
  }

  async updateProgram(id: string, input: UpdateProgramInput): Promise<ProgramDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const program = await this.requireProgram(tx, id);
      this.assertMutable(program);
      const patch: Partial<ProgramRow> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.description !== undefined) patch.description = input.description;
      const updated = (await this.repo.updateProgram(tx, id, patch)) ?? program;
      await this.audit.recordInTx(tx, {
        action: "programming.program.updated",
        resourceType: "program",
        resourceId: id,
        before: { name: program.name, description: program.description },
        after: { name: updated.name, description: updated.description },
      });
      return this.toDto(
        updated,
        await this.repo.countItems(tx, id),
        await this.resolvePublishedVersion(tx, updated),
      );
    });
  }

  async setItems(id: string, input: SetProgramItemsInput): Promise<ProgramDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const program = await this.requireProgram(tx, id);
      this.assertMutable(program);
      await this.repo.setItems(tx, program, input.assetIds);
      await this.audit.recordInTx(tx, {
        action: "programming.program.items_set",
        resourceType: "program",
        resourceId: id,
        after: { count: input.assetIds.length },
      });
      return this.toDto(
        program,
        input.assetIds.length,
        await this.resolvePublishedVersion(tx, program),
      );
    });
  }

  async archiveProgram(id: string): Promise<void> {
    await this.tenantContext.withTenant(async (tx) => {
      const program = await this.requireProgram(tx, id);
      if (program.archivedAt) return; // idempotent
      await this.repo.updateProgram(tx, id, { status: "archived", archivedAt: new Date() });
      await this.audit.recordInTx(tx, {
        action: "programming.program.archived",
        resourceType: "program",
        resourceId: id,
        before: { status: program.status },
        after: { status: "archived" },
      });
    });
  }

  /* ------------------------------------------------------- rotation policy -- */

  async getRotationPolicy(ctx: RequestContext): Promise<RotationPolicyDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const policy = await this.repo.getRotationPolicy(tx, ctx.tenantId);
      return this.policyToDto(policy);
    });
  }

  async upsertRotationPolicy(
    ctx: RequestContext,
    input: UpsertRotationPolicyInput,
  ): Promise<RotationPolicyDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const before = await this.repo.getRotationPolicy(tx, ctx.tenantId);
      const row = await this.repo.upsertRotationPolicy(tx, {
        id: before?.id ?? uuidv7(),
        tenantId: ctx.tenantId,
        minTrackGapMinutes: input.minTrackGapMinutes,
        minArtistGapMinutes: input.minArtistGapMinutes,
        maxPlaysPerDay: input.maxPlaysPerDay ?? null,
        minCategoryGapMinutes: input.minCategoryGapMinutes ?? null,
        fatigueWeightPenalty: input.fatigueWeightPenalty ?? null,
        affinityStrength: input.affinityStrength ?? null,
        historyLookbackDays: input.historyLookbackDays ?? null,
        crossDayContinuity: input.crossDayContinuity ?? null,
      });
      await this.audit.recordInTx(tx, {
        action: "programming.rotation_policy.updated",
        resourceType: "rotation_policy",
        resourceId: row.id,
        before: before ? this.policyToDto(before) : null,
        after: this.policyToDto(row),
      });
      return this.policyToDto(row);
    });
  }

  /* ------------------------------------------------------- rotation pairs -- */

  async listRotationPairs(
    ctx: RequestContext,
  ): Promise<{ items: RotationPairDto[]; nextCursor: null }> {
    return this.tenantContext.withTenant(async (tx) => {
      const rows = await this.repo.listRotationPairs(tx, ctx.tenantId);
      return { items: rows.map((r) => this.pairToDto(r)), nextCursor: null };
    });
  }

  async createRotationPair(
    ctx: RequestContext,
    input: CreateRotationPairInput,
  ): Promise<RotationPairDto> {
    // Order-normalise so (A,B) and (B,A) collapse to one row (unique index).
    if (input.assetA === input.assetB) {
      throw new BadRequestException({ code: "INVALID_PAIR", title: "A pair needs two tracks" });
    }
    const assetA = input.assetA < input.assetB ? input.assetA : input.assetB;
    const assetB = input.assetA < input.assetB ? input.assetB : input.assetA;
    return this.tenantContext.withTenant(async (tx) => {
      const found = await this.repo.loadCandidatesByIds(tx, [assetA, assetB]);
      if (found.length !== 2) {
        throw new BadRequestException({
          code: "INVALID_PAIR",
          title: "Both tracks must be ready library tracks",
        });
      }
      let row: RotationPairRow;
      try {
        row = await this.repo.insertRotationPair(tx, {
          id: uuidv7(),
          tenantId: ctx.tenantId,
          assetA,
          assetB,
          minGapMinutes: input.minGapMinutes,
          active: input.active,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        });
      } catch (e) {
        if (isUniqueViolation(e)) {
          throw new ConflictException({ code: "PAIR_EXISTS", title: "This pair already exists" });
        }
        throw e;
      }
      await this.audit.recordInTx(tx, {
        action: "programming.rotation_pair.created",
        resourceType: "rotation_pair",
        resourceId: row.id,
        after: this.pairToDto(row),
      });
      return this.pairToDto(row);
    });
  }

  async updateRotationPair(
    ctx: RequestContext,
    id: string,
    input: UpdateRotationPairInput,
  ): Promise<RotationPairDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const before = await this.repo.findRotationPair(tx, id);
      if (!before) throw new NotFoundException({ code: "PAIR_NOT_FOUND", title: "Pair not found" });
      const row = await this.repo.updateRotationPair(tx, id, {
        ...(input.minGapMinutes !== undefined ? { minGapMinutes: input.minGapMinutes } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        updatedBy: ctx.userId,
      });
      if (!row) throw new NotFoundException({ code: "PAIR_NOT_FOUND", title: "Pair not found" });
      await this.audit.recordInTx(tx, {
        action: "programming.rotation_pair.updated",
        resourceType: "rotation_pair",
        resourceId: id,
        before: this.pairToDto(before),
        after: this.pairToDto(row),
      });
      return this.pairToDto(row);
    });
  }

  async deleteRotationPair(ctx: RequestContext, id: string): Promise<void> {
    return this.tenantContext.withTenant(async (tx) => {
      const before = await this.repo.findRotationPair(tx, id);
      if (!before) throw new NotFoundException({ code: "PAIR_NOT_FOUND", title: "Pair not found" });
      await this.repo.deleteRotationPair(tx, id);
      await this.audit.recordInTx(tx, {
        action: "programming.rotation_pair.deleted",
        resourceType: "rotation_pair",
        resourceId: id,
        before: this.pairToDto(before),
      });
    });
  }

  /* --------------------------------------------------------------- preview -- */

  /** Deterministic, ephemeral preview (ADR-06-02/06). Never persisted. */
  async preview(id: string, input: PreviewRequestInput): Promise<ExecutionPlanDto> {
    const prep = await this.tenantContext.withTenant(async (tx) => {
      const program = await this.requireProgram(tx, id);
      let rows: CandidateRow[];
      let pv: string;
      if (input.versionId) {
        const version = await this.repo.findVersion(tx, id, input.versionId);
        if (!version) {
          throw new NotFoundException({ code: "VERSION_NOT_FOUND", title: "Version not found" });
        }
        rows = await this.repo.loadCandidatesByIds(tx, version.resolvedItems as string[]);
        pv = version.id;
      } else {
        rows = await this.repo.loadCandidates(tx, id);
        pv = `draft:${program.id}`;
      }
      const policy = await this.repo.getRotationPolicy(tx, program.tenantId ?? "");
      const pairs = await this.repo.loadActivePairs(tx, program.tenantId ?? "");
      return {
        candidates: this.toCandidates(rows, program.name),
        rules: this.toRules(policy, pairs),
        programVersion: pv,
        lookbackDays: policy?.historyLookbackDays ?? DEFAULT_LOOKBACK_DAYS,
        continuity: policy?.crossDayContinuity ?? DEFAULT_CROSS_DAY_CONTINUITY,
      };
    });

    const ctx = this.tenantContext.get();
    const fallback: FallbackPolicy = { safety: [], allowSilence: true };
    const base = {
      tenantId: ctx.tenantId,
      programVersion: prep.programVersion,
      syncGroup: input.unitId ?? "default",
      unitId: input.unitId ?? "default",
      timezone: input.timezone,
      windowStartLocal: input.windowStartLocal,
      windowEndLocal: input.windowEndLocal,
      compilerVersion: COMPILER_VERSION,
    };

    try {
      // Historical Programming Runtime (Sprint 07B): derive recentPlays and the
      // cross-day seam from planned history, then compile with that memory. All
      // deterministic — no clock, no DB inside the compiler.
      const { candidates, carryOver } = this.applyHistory(base, input.localDate, prep, fallback);
      const plan = compile(
        { ...base, localDate: input.localDate, ...(carryOver ? { carryOver } : {}) },
        candidates,
        prep.rules,
        fallback,
      );
      return this.planToDto(plan);
    } catch (e) {
      if (e instanceof CompileError) {
        throw new BadRequestException({ code: e.code.toUpperCase(), title: e.message });
      }
      throw e;
    }
  }

  /**
   * Assemble the historical compile inputs (Sprint 07B · §8/§9). Pure given
   * `prep`: builds planned history (re-compiling prior local dates with fatigue
   * OFF — no recursion), stamps `recentPlays` on the candidates, and returns the
   * previous-day tail as `carryOver` when cross-day continuity is on.
   */
  private applyHistory(
    base: Omit<CompilationContext, "localDate" | "carryOver">,
    localDate: string,
    prep: {
      candidates: CandidateTrack[];
      rules: RotationRules;
      lookbackDays: number;
      continuity: boolean;
    },
    fallback: FallbackPolicy,
  ): { candidates: CandidateTrack[]; carryOver?: CarryOverItem[] } {
    if (prep.lookbackDays <= 0) return { candidates: prep.candidates };
    // Fatigue must be OFF for the historical re-compiles to stay recursion-free.
    const historyRules: RotationRules = { ...prep.rules, fatigue: undefined };
    const history = buildPlannedHistory({
      base,
      targetLocalDate: localDate,
      lookbackDays: prep.lookbackDays,
      candidates: prep.candidates,
      historyRules,
      fallback,
      tailSize: HISTORY_TAIL_SIZE,
    });
    const candidates = prep.candidates.map((c) => ({
      ...c,
      recentPlays: history.recentTrackPlays[c.assetId] ?? 0,
    }));
    return {
      candidates,
      carryOver: prep.continuity ? history.previousWindowTail : undefined,
    };
  }

  /* --------------------------------------------------------------- publish -- */

  /** Publish an immutable version snapshot (§9.3, ADR-06-03/06). */
  async publish(ctx: RequestContext, id: string): Promise<ProgramVersionDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const program = await this.requireProgram(tx, id);
      if (program.archivedAt) {
        throw new BadRequestException({
          code: "INVALID_STATE_TRANSITION",
          title: "Archived programs cannot be published",
        });
      }
      const rows = await this.repo.loadCandidates(tx, id);
      if (rows.length === 0) {
        throw new BadRequestException({
          code: "INSUFFICIENT_CATALOG",
          title: "Add ready content before publishing",
        });
      }
      const policy = await this.repo.getRotationPolicy(tx, program.tenantId ?? "");
      const pairs = await this.repo.loadActivePairs(tx, program.tenantId ?? "");
      const resolvedItems = rows.map((r) => r.assetId);
      const rulesDto = this.policyToDto(policy);
      // Records WHICH history runtime was in effect at publish; per-date plans
      // (with history) are produced deterministically at preview/runtime.
      const historySummary = {
        source: "planned_history" as const,
        lookbackDays: policy?.historyLookbackDays ?? DEFAULT_LOOKBACK_DAYS,
        crossDayContinuity: policy?.crossDayContinuity ?? DEFAULT_CROSS_DAY_CONTINUITY,
        avoidPairCount: pairs.length,
      };
      const context = {
        rules: rulesDto,
        itemCount: resolvedItems.length,
        source: "manual",
        history: historySummary,
        avoidPairs: pairs,
      };
      const version = (await this.repo.maxVersion(tx, id)) + 1;
      // Config fingerprint — same full config ⇒ same hash (determinism proof).
      const planHash = hashPlan({ resolvedItems, rules: rulesDto, version, pairs, historySummary });
      const row = await this.repo.insertVersion(tx, {
        id: uuidv7(),
        tenantId: program.tenantId,
        playlistId: id,
        version,
        resolvedItems,
        context,
        planHash,
        compilerVersion: COMPILER_VERSION,
        publishedBy: ctx.userId,
      });
      if (program.status !== "published") {
        await this.repo.updateProgram(tx, id, { status: "published" });
      }
      await this.audit.recordInTx(tx, {
        action: "programming.version.published",
        resourceType: "program_version",
        resourceId: row.id,
        after: { programId: id, version, itemCount: resolvedItems.length, planHash },
      });
      return this.versionToDto(row);
    });
  }

  async listVersions(id: string): Promise<{ items: ProgramVersionDto[]; nextCursor: null }> {
    return this.tenantContext.withTenant(async (tx) => {
      await this.requireProgram(tx, id);
      const rows = await this.repo.listVersions(tx, id);
      return { items: rows.map((r) => this.versionToDto(r)), nextCursor: null };
    });
  }

  async getVersion(id: string, versionId: string): Promise<ProgramVersionDto> {
    return this.tenantContext.withTenant(async (tx) => {
      await this.requireProgram(tx, id);
      const row = await this.repo.findVersion(tx, id, versionId);
      if (!row)
        throw new NotFoundException({ code: "VERSION_NOT_FOUND", title: "Version not found" });
      return this.versionToDto(row);
    });
  }

  /* ------------------------------------------------------------ assignment -- */

  async createAssignment(
    ctx: RequestContext,
    id: string,
    input: CreateAssignmentInput,
  ): Promise<{ id: string; targetType: string; targetId: string }> {
    return this.tenantContext.withTenant(async (tx) => {
      const program = await this.requireProgram(tx, id);
      const scheduleId = uuidv7();
      await this.repo.insertSchedule(tx, {
        id: scheduleId,
        tenantId: ctx.tenantId,
        name: program.name,
        targetType: input.targetType,
        targetId: input.targetId,
        status: "draft",
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validUntil: input.validUntil ? new Date(input.validUntil) : null,
      });
      await this.repo.insertScheduleEntry(tx, {
        id: uuidv7(),
        tenantId: ctx.tenantId,
        scheduleId,
        contentType: "playlist",
        contentId: id,
        rrule: "FREQ=DAILY",
        startTimeLocal: "00:00",
        endTimeLocal: "24:00",
        layer: "base_music",
        priority: 0,
      });
      await this.audit.recordInTx(tx, {
        action: "programming.assignment.created",
        resourceType: "schedule",
        resourceId: scheduleId,
        scopeType: input.targetType,
        scopeId: input.targetId,
        after: { programId: id, targetType: input.targetType, targetId: input.targetId },
      });
      return { id: scheduleId, targetType: input.targetType, targetId: input.targetId };
    });
  }

  /* ---------------------------------------------------------------- shared -- */

  private async requireProgram(tx: TenantTx, id: string): Promise<ProgramRow> {
    const program = await this.repo.findProgram(tx, id);
    if (!program)
      throw new NotFoundException({ code: "PROGRAM_NOT_FOUND", title: "Program not found" });
    return program;
  }

  private assertMutable(program: ProgramRow): void {
    if (program.archivedAt) {
      throw new BadRequestException({
        code: "INVALID_STATE_TRANSITION",
        title: "Archived programs cannot be edited",
      });
    }
  }

  private toCandidates(rows: CandidateRow[], source: string): CandidateTrack[] {
    return rows
      .filter((r) => r.durationMs !== null && r.durationMs > 0)
      .map((r) => ({
        assetId: r.assetId,
        title: r.title,
        durationMs: r.durationMs as number,
        artist: r.artist,
        source,
        weight: 1,
        // Rotation categories from the Library's genre tags (Sprint 07 — wired).
        // Play history (recentPlays) and affinity scores are NOT wired yet: they
        // require a signals pipeline (Sprint 07B) and stay undefined here, so
        // fatigue and affinity weighting are inert in production for now even
        // though the engine and their policy knobs already exist.
        categories: r.genres.length > 0 ? r.genres : undefined,
      }));
  }

  private toRules(policy: RotationPolicyRow | undefined, pairs: ActivePair[] = []): RotationRules {
    const categoryGap = policy?.minCategoryGapMinutes ?? null;
    const fatigue = policy?.fatigueWeightPenalty ?? null;
    const affinity = policy?.affinityStrength ?? null;
    const avoidPairs: AvoidPair[] = pairs.map((p) => ({
      a: p.a,
      b: p.b,
      minGapMinutes: p.minGapMinutes,
    }));
    return {
      minTrackGapMinutes: policy?.minTrackGapMinutes ?? DEFAULT_TRACK_GAP,
      minArtistGapMinutes: policy?.minArtistGapMinutes ?? DEFAULT_ARTIST_GAP,
      maxPlaysPerTrack: policy?.maxPlaysPerDay ?? null,
      ...(categoryGap !== null && categoryGap > 0 ? { minCategoryGapMinutes: categoryGap } : {}),
      ...(fatigue !== null && fatigue > 0 ? { fatigue: { weightPenalty: fatigue } } : {}),
      ...(affinity !== null && affinity > 0 ? { affinityWeighting: { strength: affinity } } : {}),
      ...(avoidPairs.length > 0 ? { avoidPairs } : {}),
      relaxable: { trackGap: true, artistGap: true, categoryGap: true },
    };
  }

  /** Drafts never have a published version; otherwise it is the highest one. */
  private async resolvePublishedVersion(tx: TenantTx, program: ProgramRow): Promise<number | null> {
    if (program.status === "draft") return null;
    const v = await this.repo.maxVersion(tx, program.id);
    return v > 0 ? v : null;
  }

  private toDto(
    program: ProgramRow,
    itemCount: number,
    publishedVersion: number | null,
  ): ProgramDto {
    const type = program.type === "smart" ? "smart" : "manual";
    return {
      id: program.id,
      tenantId: program.tenantId,
      type,
      name: program.name,
      description: program.description,
      status: program.status,
      publishedVersion,
      itemCount,
      createdAt: iso(program.createdAt),
      updatedAt: iso(program.updatedAt),
      archivedAt: isoOrNull(program.archivedAt),
    };
  }

  private versionToDto(row: ProgramVersionRow): ProgramVersionDto {
    return {
      id: row.id,
      programId: row.playlistId,
      version: row.version,
      resolvedItems: (row.resolvedItems as string[]) ?? [],
      planHash: row.planHash,
      compilerVersion: row.compilerVersion,
      publishedBy: row.publishedBy,
      resolvedAt: iso(row.resolvedAt),
    };
  }

  private policyToDto(policy: RotationPolicyRow | undefined): RotationPolicyDto {
    return {
      minTrackGapMinutes: policy?.minTrackGapMinutes ?? DEFAULT_TRACK_GAP,
      minArtistGapMinutes: policy?.minArtistGapMinutes ?? DEFAULT_ARTIST_GAP,
      maxPlaysPerDay: policy?.maxPlaysPerDay ?? null,
      minCategoryGapMinutes: policy?.minCategoryGapMinutes ?? null,
      fatigueWeightPenalty: policy?.fatigueWeightPenalty ?? null,
      affinityStrength: policy?.affinityStrength ?? null,
      historyLookbackDays: policy?.historyLookbackDays ?? null,
      crossDayContinuity: policy?.crossDayContinuity ?? null,
    };
  }

  private pairToDto(row: RotationPairView | RotationPairRow): RotationPairDto {
    const view = row as Partial<RotationPairView>;
    return {
      id: row.id,
      assetA: row.assetA,
      assetB: row.assetB,
      assetATitle: view.assetATitle ?? null,
      assetBTitle: view.assetBTitle ?? null,
      minGapMinutes: row.minGapMinutes,
      active: row.active,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  private planToDto(plan: ReturnType<typeof compile>): ExecutionPlanDto {
    return {
      compilerVersion: plan.compilerVersion,
      timezone: plan.timezone,
      localDate: plan.localDate,
      windowStartUtc: plan.windowStartUtc,
      windowEndUtc: plan.windowEndUtc,
      totalDurationMs: plan.totalDurationMs,
      items: plan.items,
      warnings: plan.warnings,
      planHash: plan.planHash,
      stats: plan.stats,
    };
  }
}
