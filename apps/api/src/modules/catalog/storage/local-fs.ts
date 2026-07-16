import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Readable } from "node:stream";

/**
 * Filesystem backing for the local storage driver. Every key is resolved under
 * a fixed root and checked for traversal, so a crafted key can never escape the
 * storage directory. Shared by LocalStorageProvider and the blob endpoint.
 */
export class LocalFs {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  /** Absolute path for a key, guarded against path traversal. */
  private pathFor(key: string): string {
    const abs = resolve(this.root, key);
    if (abs !== this.root && !abs.startsWith(this.root + sep)) {
      throw new Error("invalid storage key");
    }
    return abs;
  }

  async write(key: string, data: Buffer): Promise<void> {
    const abs = this.pathFor(key);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, data);
  }

  async stat(key: string): Promise<{ exists: boolean; sizeBytes: number | null }> {
    try {
      const s = await stat(this.pathFor(key));
      return { exists: true, sizeBytes: s.size };
    } catch {
      return { exists: false, sizeBytes: null };
    }
  }

  readStream(key: string): Readable {
    return createReadStream(this.pathFor(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
