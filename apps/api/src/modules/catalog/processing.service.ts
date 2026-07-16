import { Inject, Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DRIZZLE, type DrizzleDb } from "../../database/database.module";
import { withTenantContext, type TenantTx } from "../../database/tenant-context";
import { auditLogEntries } from "../../database/schema";
import { CatalogRepository, type TranscodeJobRow } from "./catalog.repository";
import { collectStream, probeAudio, sha256, sniffAudioSignature } from "./media/media-probe";
import { STORAGE, type StorageProvider } from "./storage/storage.provider";

/** A deterministic failure that must NOT be retried (bad file, not a transient glitch). */
class PermanentError extends Error {}

/**
 * Media processing worker (§4 PART 10/11). Processing is TRIGGER-DRIVEN and
 * tenant-scoped: each run carries a known tenantId, so it works under the
 * NOBYPASSRLS application role without a cross-tenant scan. The transcode_jobs
 * table is the durable queue/outbox; heavy work (read + hash + probe) happens
 * OUTSIDE any DB transaction, so the confirm request stays fast. Jobs are
 * idempotent (claim guard + unique original rendition) and retried on transient
 * errors up to a bounded attempt count.
 */
@Injectable()
export class ProcessingService implements OnModuleDestroy {
  private readonly logger = new Logger(ProcessingService.name);
  private readonly maxBytes: number;
  private readonly maxAttempts = 3;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @Inject(STORAGE) private readonly storage: StorageProvider,
    private readonly repo: CatalogRepository,
    config: ConfigService,
  ) {
    this.maxBytes = config.getOrThrow<number>("CATALOG_MAX_UPLOAD_BYTES");
  }

  onModuleDestroy(): void {
    /* no background timer to clear — processing is trigger-driven */
  }

  /** Fire-and-forget trigger after confirm/reprocess — drains the tenant's queue. */
  trigger(tenantId: string): void {
    setImmediate(() => {
      this.drainTenant(tenantId).catch((err) => this.logger.error(`drain failed: ${err}`));
    });
  }

  /** Process all queued jobs for one tenant. Returns how many were handled. */
  async drainTenant(tenantId: string): Promise<number> {
    const jobs = await withTenantContext(this.db, tenantId, (tx) =>
      this.repo.findQueuedJobs(tx, 25),
    );
    let handled = 0;
    for (const job of jobs) {
      if (await this.processJob(tenantId, job)) handled++;
    }
    return handled;
  }

  private async processJob(tenantId: string, job: TranscodeJobRow): Promise<boolean> {
    const claimed = await withTenantContext(this.db, tenantId, (tx) =>
      this.repo.claimJob(tx, job.id, job.attempts),
    );
    if (!claimed) return false;
    const attempts = job.attempts + 1;

    const loaded = await withTenantContext(this.db, tenantId, async (tx) => {
      const asset = await this.repo.findAsset(tx, job.assetId);
      const upload = await this.repo.findUploadByAsset(tx, job.assetId);
      return { asset, upload };
    });

    try {
      const key = loaded.upload?.storageKey;
      if (!loaded.asset || !key) throw new PermanentError("OBJECT_NOT_FOUND");

      // Heavy work outside any transaction.
      const stream = await this.storage.createReadStream(key);
      const buffer = await collectStream(stream, this.maxBytes);
      const hash = sha256(buffer);
      if (loaded.upload?.checksumSha256 && hash !== loaded.upload.checksumSha256) {
        throw new PermanentError("CHECKSUM_MISMATCH");
      }
      if (!sniffAudioSignature(buffer)) throw new PermanentError("INVALID_SIGNATURE");
      const mediaInfo = await probeAudio(buffer);

      await withTenantContext(this.db, tenantId, async (tx) => {
        await this.repo.updateAsset(tx, job.assetId, {
          status: "ready",
          durationMs: mediaInfo.durationMs ?? null,
          mediaInfo,
          sourceHash: hash,
        });
        await this.repo.upsertOriginalRendition(tx, {
          tenantId,
          assetId: job.assetId,
          profile: "original",
          storageKey: key,
          bytes: buffer.length,
          hash,
        });
        await this.repo.updateJob(tx, job.id, { status: "completed", error: null });
        await this.systemAudit(tx, tenantId, "catalog.asset.ready", job.assetId, {
          durationMs: mediaInfo.durationMs ?? null,
        });
      });
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const retry = !(err instanceof PermanentError) && attempts < this.maxAttempts;
      await withTenantContext(this.db, tenantId, async (tx) => {
        await this.repo.updateJob(tx, job.id, {
          status: retry ? "queued" : "failed",
          error: message,
        });
        if (!retry) {
          await this.repo.updateAsset(tx, job.assetId, { status: "failed" });
          await this.systemAudit(tx, tenantId, "catalog.asset.failed", job.assetId, {
            reason: message,
          });
        }
      });
      return true;
    }
  }

  /** System-actor audit row, written in the same transaction as the state change. */
  private async systemAudit(
    tx: TenantTx,
    tenantId: string,
    action: string,
    assetId: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(auditLogEntries).values({
      tenantId,
      actorType: "system",
      actorId: null,
      action,
      resourceType: "asset",
      resourceId: assetId,
      changes: { after: meta },
    });
  }
}
