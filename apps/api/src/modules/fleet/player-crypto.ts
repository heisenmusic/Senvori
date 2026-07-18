import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Device credential + activation cryptography (Sprint 10A).
 *
 * - Raw tokens/secrets are high-entropy and returned to the device exactly once.
 * - Only the sha256 HASH of a token is ever persisted (`device_tokens.token_hash`),
 *   so a database leak never yields a usable credential.
 * - Activation codes use an unambiguous alphabet (no 0/O/1/I) since a human reads
 *   them off a screen and types them into the Dashboard.
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** sha256 hex of a raw token/secret — the persisted, non-reversible form. */
export const sha256Hex = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

/** A raw device bearer token (returned once; only its hash is stored). */
export const mintDeviceToken = (): string => `pdt_${randomBytes(32).toString("base64url")}`;

/** A human-typed activation code, e.g. `K7P2QW9F` (8 chars, unambiguous). */
export const generateActivationCode = (length = 8): string => {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[(bytes[i] ?? 0) % CODE_ALPHABET.length];
  }
  return code;
};

/** Constant-time comparison of two sha256 hex digests (proof-of-possession). */
export const hashesEqual = (a: string, b: string): boolean => {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
};
