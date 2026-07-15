import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Put,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply } from "fastify";
import { Public } from "../../common/auth/public.decorator";
import { LocalFs } from "./storage/local-fs";
import { verifyStorageToken } from "./storage/storage-signer";

/**
 * Signed blob transport for the LOCAL storage driver (§4 PART 5). Public but
 * authorized per-request by an HMAC-signed, expiring token scoped to a single
 * object key and operation — the local equivalent of an R2 presigned URL. With
 * the R2 driver this endpoint is unused (clients talk to Cloudflare directly).
 */
@Public()
@Controller("catalog/_storage")
export class StorageBlobController {
  private readonly secret: string;

  constructor(
    private readonly fs: LocalFs,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>("BETTER_AUTH_SECRET");
  }

  @Put(":token")
  async put(@Param("token") token: string, @Body() body: Buffer): Promise<{ ok: true }> {
    const t = verifyStorageToken(this.secret, token);
    if (!t || t.op !== "put") {
      throw new BadRequestException({
        code: "INVALID_UPLOAD_URL",
        title: "Invalid or expired URL",
      });
    }
    if (!Buffer.isBuffer(body)) {
      throw new BadRequestException({ code: "INVALID_BODY", title: "Expected a binary body" });
    }
    if (t.maxBytes && body.length > t.maxBytes) {
      throw new BadRequestException({ code: "FILE_TOO_LARGE", title: "File exceeds the limit" });
    }
    await this.fs.write(t.key, body);
    return { ok: true };
  }

  @Get(":token")
  async get(@Param("token") token: string, @Res() reply: FastifyReply): Promise<void> {
    const t = verifyStorageToken(this.secret, token);
    if (!t || t.op !== "get") {
      throw new BadRequestException({
        code: "INVALID_DOWNLOAD_URL",
        title: "Invalid or expired URL",
      });
    }
    const stat = await this.fs.stat(t.key);
    if (!stat.exists) {
      throw new NotFoundException({ code: "OBJECT_NOT_FOUND", title: "Object not found" });
    }
    reply.header("content-type", t.contentType ?? "application/octet-stream");
    if (t.fileName) {
      reply.header("content-disposition", `attachment; filename="${t.fileName.replace(/"/g, "")}"`);
    }
    return reply.send(this.fs.readStream(t.key));
  }
}
