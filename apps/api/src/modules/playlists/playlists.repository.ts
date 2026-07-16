import { Injectable } from "@nestjs/common";
import type { ProgramListQuery } from "@senvori/contracts";
import { and, asc, desc, eq, gt, ilike, inArray, isNull, max, type SQL } from "drizzle-orm";
import type { TenantTx } from "../../database/tenant-context";
import {
  assets,
  playlistItems,
  playlistVersions,
  playlists,
  rotationPolicies,
  scheduleEntries,
  schedules,
  tracks,
} from "../../database/schema";

export type ProgramRow = typeof playlists.$inferSelect;
export type ProgramVersionRow = typeof playlistVersions.$inferSelect;
export type RotationPolicyRow = typeof rotationPolicies.$inferSelect;

/** A program content item joined with its Library metadata (for display). */
export interface ProgramItemRow {
  position: number;
  assetId: string;
  title: string;
  artist: string | null;
  durationMs: number | null;
  type: string;
  status: string;
}

/** A track eligible to be compiled (already status-filtered by the query). */
export interface CandidateRow {
  assetId: string;
  title: string;
  durationMs: number | null;
  artist: string | null;
}

/**
 * Programming data access (Sprint 06 · F4). Reuses the playlists/scheduling
 * schema. Every method takes a tenant-scoped transaction (`TenantTx`), so RLS is
 * always in force — this repository never reaches the pool directly.
 */
@Injectable()
export class PlaylistsRepository {
  /* ------------------------------------------------------------ programs -- */

  async insertProgram(tx: TenantTx, values: typeof playlists.$inferInsert): Promise<ProgramRow> {
    const [row] = await tx.insert(playlists).values(values).returning();
    return row as ProgramRow;
  }

  async findProgram(tx: TenantTx, id: string): Promise<ProgramRow | undefined> {
    const [row] = await tx.select().from(playlists).where(eq(playlists.id, id));
    return row;
  }

  async updateProgram(
    tx: TenantTx,
    id: string,
    patch: Partial<typeof playlists.$inferInsert>,
  ): Promise<ProgramRow | undefined> {
    const [row] = await tx.update(playlists).set(patch).where(eq(playlists.id, id)).returning();
    return row;
  }

  async listPrograms(
    tx: TenantTx,
    query: ProgramListQuery,
  ): Promise<{ rows: ProgramRow[]; hasMore: boolean }> {
    const conditions: SQL[] = [];
    if (query.status) conditions.push(eq(playlists.status, query.status));
    else conditions.push(isNull(playlists.archivedAt));
    if (query.q) conditions.push(ilike(playlists.name, `%${query.q}%`));
    if (query.cursor) conditions.push(gt(playlists.id, query.cursor));

    const rows = await tx
      .select()
      .from(playlists)
      .where(and(...conditions))
      .orderBy(asc(playlists.id))
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    return { rows: hasMore ? rows.slice(0, query.limit) : rows, hasMore };
  }

  /* --------------------------------------------------------------- items -- */

  async setItems(tx: TenantTx, program: ProgramRow, assetIds: string[]): Promise<void> {
    await tx.delete(playlistItems).where(eq(playlistItems.playlistId, program.id));
    if (assetIds.length === 0) return;
    await tx.insert(playlistItems).values(
      assetIds.map((assetId, position) => ({
        tenantId: program.tenantId,
        playlistId: program.id,
        assetId,
        position,
      })),
    );
  }

  async countItems(tx: TenantTx, playlistId: string): Promise<number> {
    const rows = await tx
      .select({ id: playlistItems.id })
      .from(playlistItems)
      .where(eq(playlistItems.playlistId, playlistId));
    return rows.length;
  }

  /** Ordered content items with their Library metadata (title/artist/status). */
  async listItems(tx: TenantTx, playlistId: string): Promise<ProgramItemRow[]> {
    const rows = await tx
      .select({
        position: playlistItems.position,
        assetId: assets.id,
        title: assets.title,
        artist: tracks.artist,
        durationMs: assets.durationMs,
        type: assets.type,
        status: assets.status,
      })
      .from(playlistItems)
      .innerJoin(assets, eq(assets.id, playlistItems.assetId))
      .leftJoin(tracks, eq(tracks.assetId, assets.id))
      .where(eq(playlistItems.playlistId, playlistId))
      .orderBy(asc(playlistItems.position));
    return rows.map((r) => ({
      position: r.position,
      assetId: r.assetId,
      title: r.title,
      artist: r.artist,
      durationMs: r.durationMs,
      type: r.type,
      status: r.status,
    }));
  }

  /** Eligible candidates = ready music tracks referenced by the program, in order. */
  async loadCandidates(tx: TenantTx, playlistId: string): Promise<CandidateRow[]> {
    const rows = await tx
      .select({
        assetId: assets.id,
        title: assets.title,
        durationMs: assets.durationMs,
        artist: tracks.artist,
        status: assets.status,
        type: assets.type,
        position: playlistItems.position,
      })
      .from(playlistItems)
      .innerJoin(assets, eq(assets.id, playlistItems.assetId))
      .leftJoin(tracks, eq(tracks.assetId, assets.id))
      .where(eq(playlistItems.playlistId, playlistId))
      .orderBy(asc(playlistItems.position));
    return rows
      .filter((r) => r.status === "ready" && r.type === "track")
      .map((r) => ({
        assetId: r.assetId,
        title: r.title,
        durationMs: r.durationMs,
        artist: r.artist,
      }));
  }

  /** Candidates for a frozen version's resolved asset ids, preserving that order. */
  async loadCandidatesByIds(tx: TenantTx, assetIds: string[]): Promise<CandidateRow[]> {
    if (assetIds.length === 0) return [];
    const rows = await tx
      .select({
        assetId: assets.id,
        title: assets.title,
        durationMs: assets.durationMs,
        artist: tracks.artist,
        status: assets.status,
        type: assets.type,
      })
      .from(assets)
      .leftJoin(tracks, eq(tracks.assetId, assets.id))
      .where(inArray(assets.id, assetIds));
    const byId = new Map(rows.map((r) => [r.assetId, r]));
    const ordered: CandidateRow[] = [];
    for (const aid of assetIds) {
      const r = byId.get(aid);
      if (r && r.status === "ready" && r.type === "track") {
        ordered.push({
          assetId: r.assetId,
          title: r.title,
          durationMs: r.durationMs,
          artist: r.artist,
        });
      }
    }
    return ordered;
  }

  /* ---------------------------------------------------- rotation policy -- */

  async getRotationPolicy(tx: TenantTx, tenantId: string): Promise<RotationPolicyRow | undefined> {
    const [row] = await tx
      .select()
      .from(rotationPolicies)
      .where(eq(rotationPolicies.tenantId, tenantId));
    return row;
  }

  async upsertRotationPolicy(
    tx: TenantTx,
    values: typeof rotationPolicies.$inferInsert,
  ): Promise<RotationPolicyRow> {
    const [row] = await tx
      .insert(rotationPolicies)
      .values(values)
      .onConflictDoUpdate({
        target: rotationPolicies.tenantId,
        set: {
          minTrackGapMinutes: values.minTrackGapMinutes,
          minArtistGapMinutes: values.minArtistGapMinutes,
          maxPlaysPerDay: values.maxPlaysPerDay ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row as RotationPolicyRow;
  }

  /* ------------------------------------------------------------ versions -- */

  async maxVersion(tx: TenantTx, playlistId: string): Promise<number> {
    const [row] = await tx
      .select({ v: max(playlistVersions.version) })
      .from(playlistVersions)
      .where(eq(playlistVersions.playlistId, playlistId));
    return row?.v ?? 0;
  }

  async insertVersion(
    tx: TenantTx,
    values: typeof playlistVersions.$inferInsert,
  ): Promise<ProgramVersionRow> {
    const [row] = await tx.insert(playlistVersions).values(values).returning();
    return row as ProgramVersionRow;
  }

  async listVersions(tx: TenantTx, playlistId: string): Promise<ProgramVersionRow[]> {
    return tx
      .select()
      .from(playlistVersions)
      .where(eq(playlistVersions.playlistId, playlistId))
      .orderBy(desc(playlistVersions.version));
  }

  async findVersion(
    tx: TenantTx,
    playlistId: string,
    versionId: string,
  ): Promise<ProgramVersionRow | undefined> {
    const [row] = await tx
      .select()
      .from(playlistVersions)
      .where(and(eq(playlistVersions.playlistId, playlistId), eq(playlistVersions.id, versionId)));
    return row;
  }

  /* --------------------------------------------------------- assignment -- */

  async insertSchedule(
    tx: TenantTx,
    values: typeof schedules.$inferInsert,
  ): Promise<typeof schedules.$inferSelect> {
    const [row] = await tx.insert(schedules).values(values).returning();
    return row as typeof schedules.$inferSelect;
  }

  async insertScheduleEntry(
    tx: TenantTx,
    values: typeof scheduleEntries.$inferInsert,
  ): Promise<void> {
    await tx.insert(scheduleEntries).values(values);
  }
}
