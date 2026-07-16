import type { Readable } from "node:stream";

/**
 * Storage abstraction (§4 PART 5). Controllers/services depend on this interface,
 * never on a concrete SDK, so the backend is testable with the local driver and
 * production runs on Cloudflare R2 (S3-compatible). Buckets are private; clients
 * upload/download only through short-lived, single-object URLs.
 */

/** Instruction for the client to send the object directly to storage. */
export interface UploadTarget {
  url: string;
  method: "PUT" | "POST";
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ObjectStat {
  exists: boolean;
  sizeBytes: number | null;
}

export interface DownloadTarget {
  url: string;
  expiresAt: Date;
}

export interface StorageProvider {
  readonly driver: "local" | "r2";
  /** A short-lived, single-object upload URL. */
  createUploadTarget(
    key: string,
    opts: { contentType: string; maxBytes: number; expiresInSeconds: number },
  ): Promise<UploadTarget>;
  headObject(key: string): Promise<ObjectStat>;
  /** Streamed read for processing (probe + checksum) — never buffers whole objects. */
  createReadStream(key: string): Promise<Readable>;
  createDownloadTarget(
    key: string,
    opts: { expiresInSeconds: number; fileName?: string; contentType?: string },
  ): Promise<DownloadTarget>;
  deleteObject(key: string): Promise<void>;
}

/** DI token for the active storage provider. */
export const STORAGE = Symbol("STORAGE");
