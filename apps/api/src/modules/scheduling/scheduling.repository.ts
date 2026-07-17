import { Injectable } from "@nestjs/common";
import { and, asc, desc, eq, isNull, max } from "drizzle-orm";
import type { TenantTx } from "../../database/tenant-context";
import {
  assets,
  localEvents,
  playlists,
  playlistVersions,
  scheduleAssignments,
} from "../../database/schema";

export type ScheduleAssignmentRow = typeof scheduleAssignments.$inferSelect;
export type LocalEventRow = typeof localEvents.$inferSelect;

/**
 * Scheduling Runtime data access (Sprint 08). Every method takes a tenant-scoped
 * transaction (`TenantTx`) so RLS is always in force. Queries that feed the
 * resolver or a hash are ordered deterministically (§8/§18).
 */
@Injectable()
export class SchedulingRepository {
  async listAssignments(tx: TenantTx, tenantId: string): Promise<ScheduleAssignmentRow[]> {
    return tx
      .select()
      .from(scheduleAssignments)
      .where(
        and(eq(scheduleAssignments.tenantId, tenantId), isNull(scheduleAssignments.archivedAt)),
      )
      .orderBy(desc(scheduleAssignments.priority), asc(scheduleAssignments.id));
  }

  /** Active, non-archived assignments — the resolver input (stable order). */
  async loadActiveAssignments(tx: TenantTx, tenantId: string): Promise<ScheduleAssignmentRow[]> {
    return tx
      .select()
      .from(scheduleAssignments)
      .where(
        and(
          eq(scheduleAssignments.tenantId, tenantId),
          eq(scheduleAssignments.active, true),
          isNull(scheduleAssignments.archivedAt),
        ),
      )
      .orderBy(asc(scheduleAssignments.id));
  }

  async findAssignment(tx: TenantTx, id: string): Promise<ScheduleAssignmentRow | undefined> {
    const [row] = await tx.select().from(scheduleAssignments).where(eq(scheduleAssignments.id, id));
    return row;
  }

  async insertAssignment(
    tx: TenantTx,
    values: typeof scheduleAssignments.$inferInsert,
  ): Promise<ScheduleAssignmentRow> {
    const [row] = await tx.insert(scheduleAssignments).values(values).returning();
    return row as ScheduleAssignmentRow;
  }

  async updateAssignment(
    tx: TenantTx,
    id: string,
    patch: Partial<typeof scheduleAssignments.$inferInsert>,
  ): Promise<ScheduleAssignmentRow | undefined> {
    const [row] = await tx
      .update(scheduleAssignments)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(scheduleAssignments.id, id))
      .returning();
    return row;
  }

  async archiveAssignment(tx: TenantTx, id: string): Promise<void> {
    await tx
      .update(scheduleAssignments)
      .set({ archivedAt: new Date(), active: false, updatedAt: new Date() })
      .where(eq(scheduleAssignments.id, id));
  }

  /** RLS-scoped existence check — prevents referencing another tenant's program. */
  async programExists(tx: TenantTx, programId: string): Promise<boolean> {
    const [row] = await tx
      .select({ id: playlists.id })
      .from(playlists)
      .where(eq(playlists.id, programId));
    return row !== undefined;
  }

  /* ------------------------------------------------------- local events -- */

  async listLocalEvents(tx: TenantTx, tenantId: string): Promise<LocalEventRow[]> {
    return tx
      .select()
      .from(localEvents)
      .where(and(eq(localEvents.tenantId, tenantId), isNull(localEvents.archivedAt)))
      .orderBy(desc(localEvents.priority), asc(localEvents.id));
  }

  /** Active, non-archived local events — overlay input (stable order). */
  async loadActiveLocalEvents(tx: TenantTx, tenantId: string): Promise<LocalEventRow[]> {
    return tx
      .select()
      .from(localEvents)
      .where(
        and(
          eq(localEvents.tenantId, tenantId),
          eq(localEvents.active, true),
          isNull(localEvents.archivedAt),
        ),
      )
      .orderBy(asc(localEvents.id));
  }

  async findLocalEvent(tx: TenantTx, id: string): Promise<LocalEventRow | undefined> {
    const [row] = await tx.select().from(localEvents).where(eq(localEvents.id, id));
    return row;
  }

  async insertLocalEvent(
    tx: TenantTx,
    values: typeof localEvents.$inferInsert,
  ): Promise<LocalEventRow> {
    const [row] = await tx.insert(localEvents).values(values).returning();
    return row as LocalEventRow;
  }

  async updateLocalEvent(
    tx: TenantTx,
    id: string,
    patch: Partial<typeof localEvents.$inferInsert>,
  ): Promise<LocalEventRow | undefined> {
    const [row] = await tx
      .update(localEvents)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(localEvents.id, id))
      .returning();
    return row;
  }

  async archiveLocalEvent(tx: TenantTx, id: string): Promise<void> {
    await tx
      .update(localEvents)
      .set({ archivedAt: new Date(), active: false, updatedAt: new Date() })
      .where(eq(localEvents.id, id));
  }

  /** RLS-scoped asset existence check (prevents referencing a foreign asset). */
  async assetExists(tx: TenantTx, assetId: string): Promise<boolean> {
    const [row] = await tx.select({ id: assets.id }).from(assets).where(eq(assets.id, assetId));
    return row !== undefined;
  }

  /* --------------------------------------------------------- base plan -- */

  /** The plan hash of a specific published version (the shared base identity). */
  async versionPlanHash(tx: TenantTx, versionId: string): Promise<string | null> {
    const [row] = await tx
      .select({ planHash: playlistVersions.planHash })
      .from(playlistVersions)
      .where(eq(playlistVersions.id, versionId));
    return row?.planHash ?? null;
  }

  /** The plan hash of a program's highest (current) published version, if any. */
  async currentPlanHash(tx: TenantTx, programId: string): Promise<string | null> {
    const [maxRow] = await tx
      .select({ v: max(playlistVersions.version) })
      .from(playlistVersions)
      .where(eq(playlistVersions.playlistId, programId));
    const version = maxRow?.v ?? null;
    if (version === null) return null;
    const [row] = await tx
      .select({ planHash: playlistVersions.planHash })
      .from(playlistVersions)
      .where(
        and(eq(playlistVersions.playlistId, programId), eq(playlistVersions.version, version)),
      );
    return row?.planHash ?? null;
  }
}
