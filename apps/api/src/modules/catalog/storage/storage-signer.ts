import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed, expiring tokens for the local storage driver — the local equivalent of
 * a presigned URL. The client uploads/downloads through /v1/catalog/_storage/:token
 * without a session; authorization is the HMAC signature + expiry, scoped to a
 * single object key and operation. R2 uses real presigned URLs instead.
 */
export interface StorageToken {
  key: string;
  op: "put" | "get";
  contentType?: string;
  maxBytes?: number;
  fileName?: string;
  /** Expiry, epoch seconds. */
  exp: number;
}

export const signStorageToken = (secret: string, token: StorageToken): string => {
  const payload = Buffer.from(JSON.stringify(token)).toString("base64url");
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
};

export const verifyStorageToken = (secret: string, raw: string): StorageToken | null => {
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const token = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as StorageToken;
    if (typeof token.exp !== "number" || token.exp * 1000 < Date.now()) return null;
    return token;
  } catch {
    return null;
  }
};
