import { All, Controller, Inject, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Public } from "../../common/auth/public.decorator";
import { AUTH, type Auth } from "./auth.config";

/**
 * Bridges /v1/auth/* to the Better Auth web handler (§1.6).
 * Fastify request → web Request → auth.handler → web Response → Fastify reply.
 */
@Public()
@Controller("auth")
export class AuthController {
  constructor(@Inject(AUTH) private readonly auth: Auth) {}

  @All("*")
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const url = new URL(req.url, `${req.protocol}://${req.headers.host ?? "localhost"}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      else headers.set(key, value);
    }

    const body =
      req.method === "GET" || req.method === "HEAD"
        ? undefined
        : req.body !== undefined && req.body !== null
          ? JSON.stringify(req.body)
          : undefined;

    const response = await this.auth.handler(
      new Request(url, { method: req.method, headers, body }),
    );

    reply.status(response.status);
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") reply.header(key, value);
    });
    const cookies = response.headers.getSetCookie();
    if (cookies.length > 0) reply.header("set-cookie", cookies);

    const text = await response.text();
    await reply.send(text.length > 0 ? text : undefined);
  }
}
