import type { Readable } from "node:stream";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { DownloadTarget, ObjectStat, StorageProvider, UploadTarget } from "./storage.provider";

export interface R2Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/**
 * Cloudflare R2 storage driver (production) via the S3-compatible API. Buckets
 * are PRIVATE; clients only ever touch objects through short-lived presigned
 * URLs. Credentials come from the environment and are never persisted or logged.
 */
export class R2StorageProvider implements StorageProvider {
  readonly driver = "r2" as const;
  private readonly s3: S3Client;

  constructor(private readonly cfg: R2Config) {
    this.s3 = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      forcePathStyle: true,
    });
  }

  async createUploadTarget(
    key: string,
    opts: { contentType: string; maxBytes: number; expiresInSeconds: number },
  ): Promise<UploadTarget> {
    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, ContentType: opts.contentType }),
      { expiresIn: opts.expiresInSeconds },
    );
    return {
      url,
      method: "PUT",
      headers: { "content-type": opts.contentType },
      expiresAt: new Date(Date.now() + opts.expiresInSeconds * 1000),
    };
  }

  async headObject(key: string): Promise<ObjectStat> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
      return { exists: true, sizeBytes: r.ContentLength ?? null };
    } catch {
      return { exists: false, sizeBytes: null };
    }
  }

  async createReadStream(key: string): Promise<Readable> {
    const r = await this.s3.send(new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
    return r.Body as Readable;
  }

  async createDownloadTarget(
    key: string,
    opts: { expiresInSeconds: number; fileName?: string; contentType?: string },
  ): Promise<DownloadTarget> {
    const url = await getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        ResponseContentType: opts.contentType,
        ResponseContentDisposition: opts.fileName
          ? `attachment; filename="${opts.fileName.replace(/"/g, "")}"`
          : undefined,
      }),
      { expiresIn: opts.expiresInSeconds },
    );
    return { url, expiresAt: new Date(Date.now() + opts.expiresInSeconds * 1000) };
  }

  async deleteObject(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }
}
