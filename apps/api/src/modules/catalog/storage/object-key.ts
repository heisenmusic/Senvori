import { AUDIO_CONTENT_TYPES } from "@senvori/contracts";

/**
 * Object-key policy (§4 PART 6). Keys are built from system-generated IDs only —
 * never from user input — so they cannot collide, be guessed, traverse paths or
 * mix tenants. The original filename is preserved as metadata, never in the key.
 */

/** First registered extension for a content type (e.g. audio/mpeg → .mp3). */
export const extensionForContentType = (contentType: string): string => {
  const exts = AUDIO_CONTENT_TYPES[contentType];
  return exts && exts[0] ? exts[0] : "";
};

/** tenants/{tenantId}/catalog/uploads/{uploadId}/original.{ext} */
export const uploadObjectKey = (tenantId: string, uploadId: string, contentType: string): string =>
  `tenants/${tenantId}/catalog/uploads/${uploadId}/original${extensionForContentType(contentType)}`;

/** Characters that are unsafe in a filename across filesystems / display. */
const UNSAFE_FILENAME = /["*/:<>?\\|]/g;

/** Sanitize a user-supplied filename for safe storage as metadata / display. */
export const sanitizeFileName = (name: string): string => {
  const base = name.split(/[\\/]/).pop() ?? name;
  const cleaned = base
    .replace(UNSAFE_FILENAME, "_")
    .replace(/\.{2,}/g, ".")
    .trim()
    .slice(0, 255);
  return cleaned || "audio";
};
