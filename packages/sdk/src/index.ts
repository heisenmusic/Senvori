import type { ProblemDetails } from "@senvori/contracts";

/**
 * @senvori/sdk — typed client for the Senvori API (§0.3 conventions).
 *
 * Foundation phase: transport layer + health only. Domain resources are added
 * as their APIs land, always typed by @senvori/contracts.
 */

export interface SenvoriClientOptions {
  /** API base URL, e.g. https://api.senvori.com */
  baseUrl: string;
  /** Bearer token (user session) or API key. */
  token?: string;
  fetch?: typeof globalThis.fetch;
}

export class SenvoriApiError extends Error {
  constructor(
    readonly problem: ProblemDetails,
    readonly status: number,
  ) {
    super(`${problem.code}: ${problem.title}`);
    this.name = "SenvoriApiError";
  }
}

export class SenvoriClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(options: SenvoriClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: `/v1/${string}`,
    init?: { body?: unknown; idempotencyKey?: string; signal?: AbortSignal },
  ): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (init?.body !== undefined) headers["content-type"] = "application/json";
    if (init?.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: init?.signal,
    });

    if (!response.ok) {
      const problem = (await response.json().catch(() => ({
        type: "about:blank",
        title: response.statusText,
        status: response.status,
        code: "UNKNOWN_ERROR",
      }))) as ProblemDetails;
      throw new SenvoriApiError(problem, response.status);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  /** GET /v1/health — control-plane liveness. */
  health(): Promise<{ status: "ok"; version: string }> {
    return this.request("GET", "/v1/health");
  }
}
