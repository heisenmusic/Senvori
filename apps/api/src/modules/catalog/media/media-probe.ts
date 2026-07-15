import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import type { MediaInfo } from "@senvori/contracts";

/**
 * Media inspection (§4 PART 10). Pure-JS: no ffmpeg, no shell — the object bytes
 * are parsed with `music-metadata`, so there is no command-injection surface and
 * nothing user-supplied is ever executed. This sprint extracts container, codec,
 * duration, sample rate, channels and bitrate; waveform/loudness are future work.
 */

export class MediaTooLargeError extends Error {}

/** Read a stream fully into a buffer, refusing anything over `maxBytes`. */
export const collectStream = (stream: Readable, maxBytes: number): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    stream.on("data", (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) {
        stream.destroy();
        reject(new MediaTooLargeError(`object exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(c);
    });
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });

export const sha256 = (buffer: Buffer): string => createHash("sha256").update(buffer).digest("hex");

/**
 * Verify the file's leading bytes match an accepted audio container — the
 * browser-declared MIME is never trusted on its own (§4 PART 8/24).
 */
export const sniffAudioSignature = (buffer: Buffer): boolean => {
  if (buffer.length < 12) return false;
  const ascii = (start: number, len: number) => buffer.toString("latin1", start, start + len);
  // WAV: "RIFF"…"WAVE"
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE") return true;
  // FLAC: "fLaC"
  if (ascii(0, 4) === "fLaC") return true;
  // MP4/M4A/AAC container: box "ftyp" at offset 4
  if (ascii(4, 4) === "ftyp") return true;
  // MP3: ID3v2 tag
  if (ascii(0, 3) === "ID3") return true;
  // MP3 / AAC-ADTS frame sync (0xFFEx / 0xFFFx)
  if (buffer[0] === 0xff && buffer[1] !== undefined && (buffer[1] & 0xe0) === 0xe0) return true;
  return false;
};

/** Extract technical metadata with music-metadata (ESM, dynamically imported). */
export const probeAudio = async (buffer: Buffer): Promise<MediaInfo> => {
  const mm = await import("music-metadata");
  const { format } = await mm.parseBuffer(new Uint8Array(buffer));
  return {
    container: format.container ?? undefined,
    codec: format.codec ?? undefined,
    durationMs:
      typeof format.duration === "number" ? Math.round(format.duration * 1000) : undefined,
    sampleRate: format.sampleRate ?? undefined,
    channels: format.numberOfChannels ?? undefined,
    bitrate: typeof format.bitrate === "number" ? Math.round(format.bitrate) : undefined,
    lossless: format.lossless ?? undefined,
    probedAt: new Date().toISOString(),
  };
};
