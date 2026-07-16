import { Injectable } from "@nestjs/common";
import type { CatalogItemListQuery } from "@senvori/contracts";
import { and, asc, eq, gt, ilike, isNull, or, type SQL } from "drizzle-orm";
import type { TenantTx } from "../../database/tenant-context";
import {
  announcements,
  assets,
  renditions,
  tracks,
  transcodeJobs,
  uploads,
} from "../../database/schema";

export type AssetRow = typeof assets.$inferSelect;
export type TrackRow = typeof tracks.$inferSelect;
export type AnnouncementRow = typeof announcements.$inferSelect;
export type UploadRow = typeof uploads.$inferSelect;
export type TranscodeJobRow = typeof transcodeJobs.$inferSelect;

/**
 * Catalog data access (§4 PART 16). Every method takes a tenant-scoped
 * transaction (`TenantTx`), so RLS is always in force — this repository never
 * reaches the pool directly. Business rules and auditing live in the service.
 */
@Injectable()
export class CatalogRepository {
  /* ------------------------------------------------------------- assets -- */

  async insertAsset(tx: TenantTx, values: typeof assets.$inferInsert): Promise<AssetRow> {
    const [row] = await tx.insert(assets).values(values).returning();
    return row as AssetRow;
  }

  async findAsset(tx: TenantTx, id: string): Promise<AssetRow | undefined> {
    const [row] = await tx.select().from(assets).where(eq(assets.id, id));
    return row;
  }

  async updateAsset(
    tx: TenantTx,
    id: string,
    patch: Partial<typeof assets.$inferInsert>,
  ): Promise<AssetRow | undefined> {
    const [row] = await tx.update(assets).set(patch).where(eq(assets.id, id)).returning();
    return row;
  }

  async listAssets(
    tx: TenantTx,
    query: CatalogItemListQuery,
  ): Promise<{ rows: AssetRow[]; hasMore: boolean }> {
    const conditions: SQL[] = [];
    // Archived rows are hidden unless explicitly requested.
    if (query.status) conditions.push(eq(assets.status, query.status));
    else conditions.push(isNull(assets.archivedAt));
    if (query.type) conditions.push(eq(assets.type, query.type));
    if (query.origin) conditions.push(eq(assets.origin, query.origin));
    if (query.language) conditions.push(eq(assets.language, query.language));
    if (query.explicit !== undefined) conditions.push(eq(assets.explicit, query.explicit));
    if (query.q) conditions.push(ilike(assets.title, `%${query.q}%`));
    if (query.cursor) conditions.push(gt(assets.id, query.cursor));

    const rows = await tx
      .select()
      .from(assets)
      .where(and(...conditions))
      .orderBy(asc(assets.id))
      .limit(query.limit + 1);
    const hasMore = rows.length > query.limit;
    return { rows: hasMore ? rows.slice(0, query.limit) : rows, hasMore };
  }

  /* ------------------------------------------------------- extensions -- */

  async insertTrack(tx: TenantTx, values: typeof tracks.$inferInsert): Promise<void> {
    await tx.insert(tracks).values(values);
  }

  async findTrack(tx: TenantTx, assetId: string): Promise<TrackRow | undefined> {
    const [row] = await tx.select().from(tracks).where(eq(tracks.assetId, assetId));
    return row;
  }

  async updateTrack(
    tx: TenantTx,
    assetId: string,
    patch: Partial<typeof tracks.$inferInsert>,
  ): Promise<void> {
    await tx.update(tracks).set(patch).where(eq(tracks.assetId, assetId));
  }

  async insertAnnouncement(tx: TenantTx, values: typeof announcements.$inferInsert): Promise<void> {
    await tx.insert(announcements).values(values);
  }

  async findAnnouncement(tx: TenantTx, assetId: string): Promise<AnnouncementRow | undefined> {
    const [row] = await tx.select().from(announcements).where(eq(announcements.assetId, assetId));
    return row;
  }

  async updateAnnouncement(
    tx: TenantTx,
    assetId: string,
    patch: Partial<typeof announcements.$inferInsert>,
  ): Promise<void> {
    await tx.update(announcements).set(patch).where(eq(announcements.assetId, assetId));
  }

  /* ------------------------------------------------------------ uploads -- */

  async insertUpload(tx: TenantTx, values: typeof uploads.$inferInsert): Promise<UploadRow> {
    const [row] = await tx.insert(uploads).values(values).returning();
    return row as UploadRow;
  }

  async findUpload(tx: TenantTx, id: string): Promise<UploadRow | undefined> {
    const [row] = await tx.select().from(uploads).where(eq(uploads.id, id));
    return row;
  }

  async findUploadByIdempotency(
    tx: TenantTx,
    tenantId: string,
    key: string,
  ): Promise<UploadRow | undefined> {
    const [row] = await tx
      .select()
      .from(uploads)
      .where(and(eq(uploads.tenantId, tenantId), eq(uploads.idempotencyKey, key)));
    return row;
  }

  async findUploadByAsset(tx: TenantTx, assetId: string): Promise<UploadRow | undefined> {
    const [row] = await tx.select().from(uploads).where(eq(uploads.assetId, assetId));
    return row;
  }

  async updateUpload(
    tx: TenantTx,
    id: string,
    patch: Partial<typeof uploads.$inferInsert>,
  ): Promise<void> {
    await tx.update(uploads).set(patch).where(eq(uploads.id, id));
  }

  /**
   * Atomically move an upload pending → completed. Exactly one concurrent
   * confirm wins (row lock + status guard); the losers see 0 rows and treat the
   * confirm as already done — no duplicate assets or jobs (§4 PART 12).
   */
  async claimUploadForConfirm(tx: TenantTx, id: string): Promise<boolean> {
    const rows = await tx
      .update(uploads)
      .set({ status: "completed" })
      .where(and(eq(uploads.id, id), eq(uploads.status, "pending")))
      .returning({ id: uploads.id });
    return rows.length > 0;
  }

  /* ---------------------------------------------------- transcode jobs -- */

  async insertJob(
    tx: TenantTx,
    values: typeof transcodeJobs.$inferInsert,
  ): Promise<TranscodeJobRow> {
    const [row] = await tx.insert(transcodeJobs).values(values).returning();
    return row as TranscodeJobRow;
  }

  async findQueuedJobs(tx: TenantTx, limit: number): Promise<TranscodeJobRow[]> {
    return tx
      .select()
      .from(transcodeJobs)
      .where(eq(transcodeJobs.status, "queued"))
      .orderBy(asc(transcodeJobs.createdAt))
      .limit(limit);
  }

  async findActiveJobForAsset(tx: TenantTx, assetId: string): Promise<TranscodeJobRow | undefined> {
    const [row] = await tx
      .select()
      .from(transcodeJobs)
      .where(
        and(
          eq(transcodeJobs.assetId, assetId),
          or(eq(transcodeJobs.status, "queued"), eq(transcodeJobs.status, "running")) as SQL,
        ),
      );
    return row;
  }

  /** Atomically claim a queued job (only one worker wins). Returns true if claimed. */
  async claimJob(tx: TenantTx, id: string, attempts: number): Promise<boolean> {
    const claimed = await tx
      .update(transcodeJobs)
      .set({ status: "running", attempts: attempts + 1 })
      .where(and(eq(transcodeJobs.id, id), eq(transcodeJobs.status, "queued")))
      .returning({ id: transcodeJobs.id });
    return claimed.length > 0;
  }

  async updateJob(
    tx: TenantTx,
    id: string,
    patch: Partial<typeof transcodeJobs.$inferInsert>,
  ): Promise<void> {
    await tx.update(transcodeJobs).set(patch).where(eq(transcodeJobs.id, id));
  }

  /* --------------------------------------------------------- renditions -- */

  async upsertOriginalRendition(
    tx: TenantTx,
    values: typeof renditions.$inferInsert,
  ): Promise<void> {
    await tx.insert(renditions).values(values).onConflictDoNothing();
  }

  async findRendition(
    tx: TenantTx,
    assetId: string,
    profile: string,
  ): Promise<typeof renditions.$inferSelect | undefined> {
    const [row] = await tx
      .select()
      .from(renditions)
      .where(and(eq(renditions.assetId, assetId), eq(renditions.profile, profile)));
    return row;
  }
}
