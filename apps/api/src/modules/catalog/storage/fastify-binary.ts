import type { FastifyInstance } from "fastify";
import { AUDIO_CONTENT_TYPES } from "@senvori/contracts";

/**
 * Raw-binary body parsing for the local storage blob endpoint (§4). Audio types
 * and application/octet-stream are buffered (bounded by the server bodyLimit) so
 * the local driver's signed PUT can persist the object. Only the local driver
 * uses this — R2 uploads go straight to Cloudflare and never reach the API.
 */
export const registerStorageBodyParser = (fastify: FastifyInstance): void => {
  const types = [...Object.keys(AUDIO_CONTENT_TYPES), "application/octet-stream"];
  for (const type of types) {
    if (fastify.hasContentTypeParser(type)) continue;
    fastify.addContentTypeParser(type, { parseAs: "buffer" }, (_req, body, done) =>
      done(null, body),
    );
  }
};
