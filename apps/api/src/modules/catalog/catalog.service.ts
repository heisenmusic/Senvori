import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CatalogItemDto,
  CatalogItemListQuery,
  CreateUploadInput,
  DeclaredRights,
  DownloadTicket,
  MediaInfo,
  UpdateCatalogItemInput,
  UploadTicket,
} from "@senvori/contracts";
import { uuidv7 } from "uuidv7";
import { AuditLogService } from "../../common/audit/audit-log.service";
import type { RequestContext } from "../../common/context/request-context";
import { TenantContextService } from "../../common/context/tenant-context.service";
import {
  CatalogRepository,
  type AnnouncementRow,
  type AssetRow,
  type TrackRow,
} from "./catalog.repository";
import { ProcessingService } from "./processing.service";
import { sanitizeFileName, uploadObjectKey } from "./storage/object-key";
import { STORAGE, type StorageProvider } from "./storage/storage.provider";

const iso = (d: Date | null | undefined): string => (d ?? new Date()).toISOString();
const isoOrNull = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const deriveTitle = (fileName: string): string =>
  sanitizeFileName(fileName).replace(/\.[a-z0-9]+$/i, "") || "Untitled";

/**
 * Catalog domain service (§4 PART 16). Thin controllers delegate here; every
 * unit of work runs in a single tenant transaction (RLS + atomic audit). The
 * upload → confirm → process state machine keeps heavy media work out of the
 * request path.
 */
@Injectable()
export class CatalogService {
  private readonly maxBytes: number;
  private readonly uploadTtl: number;
  private readonly downloadTtl: number;

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly repo: CatalogRepository,
    private readonly audit: AuditLogService,
    private readonly processing: ProcessingService,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    config: ConfigService,
  ) {
    this.maxBytes = config.getOrThrow<number>("CATALOG_MAX_UPLOAD_BYTES");
    this.uploadTtl = config.getOrThrow<number>("CATALOG_UPLOAD_TTL_SECONDS");
    this.downloadTtl = config.getOrThrow<number>("CATALOG_DOWNLOAD_TTL_SECONDS");
  }

  /* -------------------------------------------------------------- upload -- */

  async createUpload(
    ctx: RequestContext,
    input: CreateUploadInput,
    idempotencyKey: string | null,
  ): Promise<UploadTicket> {
    if (input.sizeBytes > this.maxBytes) {
      throw new BadRequestException({
        code: "FILE_TOO_LARGE",
        title: `File exceeds the ${this.maxBytes}-byte limit`,
      });
    }

    // Idempotent creation: the same key returns the same upload session.
    if (idempotencyKey) {
      const existing = await this.tenantContext.withTenant((tx) =>
        this.repo.findUploadByIdempotency(tx, ctx.tenantId, idempotencyKey),
      );
      if (existing && existing.assetId && existing.storageKey) {
        return this.buildTicket(
          existing.id,
          existing.assetId,
          existing.storageKey,
          input.contentType,
        );
      }
    }

    const uploadId = uuidv7();
    const assetId = uuidv7();
    const storageKey = uploadObjectKey(ctx.tenantId, uploadId, input.contentType);
    const title = input.title ?? deriveTitle(input.fileName);
    const expiresAt = new Date(Date.now() + this.uploadTtl * 1000);

    await this.tenantContext.withTenant(async (tx) => {
      await this.repo.insertAsset(tx, {
        id: assetId,
        tenantId: ctx.tenantId,
        type: input.type,
        status: "uploading",
        origin: "tenant_upload",
        language: input.language,
        originCountry: input.originCountry,
        title,
        sourceHash: input.checksumSha256,
        createdBy: ctx.userId,
      });
      if (input.type === "track") {
        await this.repo.insertTrack(tx, { assetId, tenantId: ctx.tenantId, artist: "" });
      } else if (input.type === "announcement") {
        await this.repo.insertAnnouncement(tx, {
          assetId,
          tenantId: ctx.tenantId,
          category: "institutional",
        });
      }
      await this.repo.insertUpload(tx, {
        id: uploadId,
        tenantId: ctx.tenantId,
        assetId,
        status: "pending",
        storageKey,
        fileName: sanitizeFileName(input.fileName),
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        checksumSha256: input.checksumSha256,
        idempotencyKey,
        expiresAt,
        createdBy: ctx.userId,
      });
      await this.audit.recordInTx(tx, {
        action: "catalog.upload.created",
        resourceType: "upload",
        resourceId: uploadId,
        after: {
          assetId,
          fileName: sanitizeFileName(input.fileName),
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
        },
      });
    });

    return this.buildTicket(uploadId, assetId, storageKey, input.contentType);
  }

  private async buildTicket(
    uploadId: string,
    assetId: string,
    storageKey: string,
    contentType: string,
  ): Promise<UploadTicket> {
    const target = await this.storage.createUploadTarget(storageKey, {
      contentType,
      maxBytes: this.maxBytes,
      expiresInSeconds: this.uploadTtl,
    });
    return {
      uploadId,
      assetId,
      url: target.url,
      method: target.method,
      headers: target.headers,
      expiresAt: target.expiresAt.toISOString(),
    };
  }

  async confirmUpload(ctx: RequestContext, uploadId: string): Promise<CatalogItemDto> {
    const upload = await this.tenantContext.withTenant((tx) => this.repo.findUpload(tx, uploadId));
    if (!upload) {
      throw new NotFoundException({ code: "UPLOAD_NOT_FOUND", title: "Upload not found" });
    }
    // Idempotent: a re-confirmed upload returns its asset.
    if (upload.status === "completed" && upload.assetId) {
      return this.getItem(upload.assetId);
    }
    if (upload.status !== "pending") {
      throw new BadRequestException({
        code: "INVALID_STATE_TRANSITION",
        title: `Upload is ${upload.status}`,
      });
    }
    if (!upload.storageKey || !upload.assetId) {
      throw new BadRequestException({ code: "UPLOAD_NOT_FOUND", title: "Upload is incomplete" });
    }

    const stat = await this.storage.headObject(upload.storageKey);
    if (!stat.exists) {
      throw new BadRequestException({
        code: "OBJECT_NOT_FOUND",
        title: "No uploaded object found",
      });
    }
    if (
      stat.sizeBytes !== null &&
      upload.sizeBytes !== null &&
      stat.sizeBytes !== upload.sizeBytes
    ) {
      throw new BadRequestException({
        code: "CHECKSUM_MISMATCH",
        title: "Uploaded size does not match the declared size",
      });
    }

    const assetId = upload.assetId;
    const claimed = await this.tenantContext.withTenant(async (tx) => {
      // Atomic pending → completed: only one concurrent confirm proceeds.
      const won = await this.repo.claimUploadForConfirm(tx, uploadId);
      if (!won) return false;
      await this.repo.updateAsset(tx, assetId, { status: "processing" });
      await this.repo.insertJob(tx, {
        id: uuidv7(),
        tenantId: ctx.tenantId,
        assetId,
        profile: "probe",
        status: "queued",
      });
      await this.audit.recordInTx(tx, {
        action: "catalog.upload.confirmed",
        resourceType: "asset",
        resourceId: assetId,
        after: { uploadId },
      });
      return true;
    });

    if (claimed) this.processing.trigger(ctx.tenantId);
    return this.getItem(assetId);
  }

  /* ---------------------------------------------------------------- items -- */

  async listItems(
    query: CatalogItemListQuery,
  ): Promise<{ items: CatalogItemDto[]; nextCursor: string | null }> {
    const { rows, hasMore } = await this.tenantContext.withTenant((tx) =>
      this.repo.listAssets(tx, query),
    );
    return {
      items: rows.map((r) => this.toDto(r)),
      nextCursor: hasMore ? (rows[rows.length - 1]?.id ?? null) : null,
    };
  }

  async getItem(id: string): Promise<CatalogItemDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const asset = await this.repo.findAsset(tx, id);
      if (!asset) throw new NotFoundException({ code: "ITEM_NOT_FOUND", title: "Item not found" });
      const track = asset.type === "track" ? await this.repo.findTrack(tx, id) : undefined;
      const announcement =
        asset.type === "announcement" ? await this.repo.findAnnouncement(tx, id) : undefined;
      return this.toDto(asset, track, announcement);
    });
  }

  async updateItem(id: string, input: UpdateCatalogItemInput): Promise<CatalogItemDto> {
    return this.tenantContext.withTenant(async (tx) => {
      const asset = await this.repo.findAsset(tx, id);
      if (!asset) throw new NotFoundException({ code: "ITEM_NOT_FOUND", title: "Item not found" });
      if (asset.archivedAt) {
        throw new BadRequestException({
          code: "INVALID_STATE_TRANSITION",
          title: "Archived items cannot be edited",
        });
      }
      const beforeTrack = asset.type === "track" ? await this.repo.findTrack(tx, id) : undefined;
      const beforeAnn =
        asset.type === "announcement" ? await this.repo.findAnnouncement(tx, id) : undefined;
      const before = this.toDto(asset, beforeTrack, beforeAnn);

      const assetPatch: Partial<AssetRow> = {};
      if (input.title !== undefined) assetPatch.title = input.title;
      if (input.language !== undefined) assetPatch.language = input.language;
      if (input.explicit !== undefined) assetPatch.explicit = input.explicit;
      if (input.declaredRights !== undefined) assetPatch.declaredRights = input.declaredRights;
      const updatedAsset =
        Object.keys(assetPatch).length > 0
          ? ((await this.repo.updateAsset(tx, id, assetPatch)) ?? asset)
          : asset;

      if (input.track && asset.type === "track") {
        const t = input.track;
        const patch: Partial<TrackRow> = {};
        if (t.isrc !== undefined) patch.isrc = t.isrc;
        if (t.artist !== undefined) patch.artist = t.artist;
        if (t.album !== undefined) patch.album = t.album;
        if (t.genres !== undefined) patch.genres = t.genres;
        if (t.bpm !== undefined) patch.bpm = t.bpm;
        if (t.energy !== undefined) patch.energy = t.energy;
        if (t.releaseYear !== undefined) patch.releaseYear = t.releaseYear;
        if (Object.keys(patch).length > 0) await this.repo.updateTrack(tx, id, patch);
      }
      if (input.announcement && asset.type === "announcement") {
        const a = input.announcement;
        const patch: Partial<AnnouncementRow> = {};
        if (a.category !== undefined) patch.category = a.category;
        if (a.sourceText !== undefined) patch.sourceText = a.sourceText;
        if (Object.keys(patch).length > 0) await this.repo.updateAnnouncement(tx, id, patch);
      }

      const afterTrack = asset.type === "track" ? await this.repo.findTrack(tx, id) : undefined;
      const afterAnn =
        asset.type === "announcement" ? await this.repo.findAnnouncement(tx, id) : undefined;
      const after = this.toDto(updatedAsset, afterTrack, afterAnn);
      await this.audit.recordInTx(tx, {
        action: "catalog.item.updated",
        resourceType: "asset",
        resourceId: id,
        before,
        after,
      });
      return after;
    });
  }

  async archiveItem(id: string): Promise<void> {
    await this.tenantContext.withTenant(async (tx) => {
      const asset = await this.repo.findAsset(tx, id);
      if (!asset) throw new NotFoundException({ code: "ITEM_NOT_FOUND", title: "Item not found" });
      if (asset.archivedAt) return; // idempotent
      await this.repo.updateAsset(tx, id, { status: "archived", archivedAt: new Date() });
      await this.audit.recordInTx(tx, {
        action: "catalog.item.archived",
        resourceType: "asset",
        resourceId: id,
        before: { status: asset.status },
        after: { status: "archived" },
      });
    });
  }

  async reprocessItem(ctx: RequestContext, id: string): Promise<CatalogItemDto> {
    await this.tenantContext.withTenant(async (tx) => {
      const asset = await this.repo.findAsset(tx, id);
      if (!asset) throw new NotFoundException({ code: "ITEM_NOT_FOUND", title: "Item not found" });
      if (asset.archivedAt || asset.status === "uploading") {
        throw new BadRequestException({
          code: "INVALID_STATE_TRANSITION",
          title: `Cannot reprocess a ${asset.status} item`,
        });
      }
      const active = await this.repo.findActiveJobForAsset(tx, id);
      if (active) return; // already queued/running — idempotent
      await this.repo.updateAsset(tx, id, { status: "processing" });
      await this.repo.insertJob(tx, {
        id: uuidv7(),
        tenantId: ctx.tenantId,
        assetId: id,
        profile: "probe",
        status: "queued",
      });
      await this.audit.recordInTx(tx, {
        action: "catalog.asset.reprocess",
        resourceType: "asset",
        resourceId: id,
        after: { status: "processing" },
      });
    });
    this.processing.trigger(ctx.tenantId);
    return this.getItem(id);
  }

  async downloadItem(id: string): Promise<DownloadTicket> {
    const info = await this.tenantContext.withTenant(async (tx) => {
      const asset = await this.repo.findAsset(tx, id);
      if (!asset) throw new NotFoundException({ code: "ITEM_NOT_FOUND", title: "Item not found" });
      if (asset.status !== "ready") {
        throw new BadRequestException({
          code: "ASSET_NOT_READY",
          title: "The asset is not ready for download",
        });
      }
      const rendition = await this.repo.findRendition(tx, id, "original");
      if (!rendition) {
        throw new NotFoundException({ code: "OBJECT_NOT_FOUND", title: "No downloadable object" });
      }
      const upload = await this.repo.findUploadByAsset(tx, id);
      // Sensitive administrative download — audited (never persist the URL).
      await this.audit.recordInTx(tx, {
        action: "catalog.asset.download",
        resourceType: "asset",
        resourceId: id,
        after: { profile: "original" },
      });
      return {
        storageKey: rendition.storageKey,
        fileName: upload?.fileName ?? undefined,
        contentType: upload?.contentType ?? undefined,
      };
    });

    const target = await this.storage.createDownloadTarget(info.storageKey, {
      expiresInSeconds: this.downloadTtl,
      fileName: info.fileName,
      contentType: info.contentType,
    });
    return { url: target.url, expiresAt: target.expiresAt.toISOString() };
  }

  /* --------------------------------------------------------------- mapper -- */

  private toDto(asset: AssetRow, track?: TrackRow, announcement?: AnnouncementRow): CatalogItemDto {
    return {
      id: asset.id,
      tenantId: asset.tenantId,
      type: asset.type,
      status: asset.status,
      origin: asset.origin,
      title: asset.title,
      language: asset.language,
      originCountry: asset.originCountry,
      durationMs: asset.durationMs,
      explicit: asset.explicit,
      sourceHash: asset.sourceHash,
      createdBy: asset.createdBy,
      mediaInfo: (asset.mediaInfo as MediaInfo | null) ?? null,
      declaredRights: (asset.declaredRights as DeclaredRights | null) ?? null,
      track: track
        ? {
            isrc: track.isrc,
            artist: track.artist,
            album: track.album,
            genres: track.genres,
            bpm: track.bpm,
            energy: track.energy,
            releaseYear: track.releaseYear,
          }
        : undefined,
      announcement: announcement
        ? { category: announcement.category, sourceText: announcement.sourceText }
        : undefined,
      createdAt: iso(asset.createdAt),
      updatedAt: iso(asset.updatedAt),
      archivedAt: isoOrNull(asset.archivedAt),
    };
  }
}
