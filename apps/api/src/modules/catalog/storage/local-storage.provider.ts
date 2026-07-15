import type { Readable } from "node:stream";
import type { LocalFs } from "./local-fs";
import { signStorageToken } from "./storage-signer";
import type { DownloadTarget, ObjectStat, StorageProvider, UploadTarget } from "./storage.provider";

/**
 * Local filesystem storage driver (dev/test). Upload/download "URLs" point back
 * at the API's own signed blob endpoint (/v1/catalog/_storage/:token), mirroring
 * the presigned-URL contract so the rest of the system is driver-agnostic.
 */
export class LocalStorageProvider implements StorageProvider {
  readonly driver = "local" as const;

  constructor(
    private readonly fs: LocalFs,
    private readonly apiBaseUrl: string,
    private readonly secret: string,
  ) {}

  private url(token: string): string {
    return `${this.apiBaseUrl.replace(/\/$/, "")}/v1/catalog/_storage/${token}`;
  }

  async createUploadTarget(
    key: string,
    opts: { contentType: string; maxBytes: number; expiresInSeconds: number },
  ): Promise<UploadTarget> {
    const exp = Math.floor(Date.now() / 1000) + opts.expiresInSeconds;
    const token = signStorageToken(this.secret, {
      key,
      op: "put",
      contentType: opts.contentType,
      maxBytes: opts.maxBytes,
      exp,
    });
    return {
      url: this.url(token),
      method: "PUT",
      headers: { "content-type": opts.contentType },
      expiresAt: new Date(exp * 1000),
    };
  }

  headObject(key: string): Promise<ObjectStat> {
    return this.fs.stat(key);
  }

  async createReadStream(key: string): Promise<Readable> {
    return this.fs.readStream(key);
  }

  async createDownloadTarget(
    key: string,
    opts: { expiresInSeconds: number; fileName?: string; contentType?: string },
  ): Promise<DownloadTarget> {
    const exp = Math.floor(Date.now() / 1000) + opts.expiresInSeconds;
    const token = signStorageToken(this.secret, {
      key,
      op: "get",
      fileName: opts.fileName,
      contentType: opts.contentType,
      exp,
    });
    return { url: this.url(token), expiresAt: new Date(exp * 1000) };
  }

  deleteObject(key: string): Promise<void> {
    return this.fs.remove(key);
  }
}
