import type {
  AssignRoleInput,
  AuditLogEntryDto,
  BrandDto,
  CatalogItemDto,
  CatalogItemListQuery,
  CreateBrandInput,
  CreateUnitInput,
  CreateUploadInput,
  CreateZoneInput,
  CurrentUserDto,
  DownloadTicket,
  GroupDto,
  InviteMemberInput,
  MembershipWithUserDto,
  ProblemDetails,
  RoleAssignmentDto,
  UnitDto,
  UnitListQuery,
  UpdateCatalogItemInput,
  UpdateUnitInput,
  UploadTicket,
  ZoneDto,
} from "@senvori/contracts";

/**
 * @senvori/sdk — typed client for the Senvori API (§0.3 conventions).
 * Sessions are cookie-based (Better Auth), so requests include credentials.
 * Domain resources are grouped under `auth`, `identity` and `tenancy`.
 */

export interface SenvoriClientOptions {
  /** API base URL, e.g. https://api.senvori.com (no trailing /v1). */
  baseUrl: string;
  /** Optional bearer token (server-to-server); browsers use the session cookie. */
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

  readonly auth: AuthClient;
  readonly identity: IdentityClient;
  readonly tenancy: TenancyClient;
  readonly catalog: CatalogClient;

  constructor(options: SenvoriClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
    this.auth = new AuthClient(this);
    this.identity = new IdentityClient(this);
    this.tenancy = new TenancyClient(this);
    this.catalog = new CatalogClient(this);
  }

  /** Low-level fetch (used by the storage direct-upload step). */
  get rawFetch(): typeof globalThis.fetch {
    return this.fetchImpl;
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: `/v1/${string}`,
    init?: {
      body?: unknown;
      query?: Record<string, unknown>;
      idempotencyKey?: string;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    if (init?.body !== undefined) headers["content-type"] = "application/json";
    if (init?.idempotencyKey) headers["idempotency-key"] = init.idempotencyKey;

    const url = new URL(`${this.baseUrl}${path}`);
    if (init?.query) {
      for (const [k, v] of Object.entries(init.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }

    const response = await this.fetchImpl(url.toString(), {
      method,
      headers,
      credentials: "include",
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

/** Better Auth flows (§1.6). Cookie sessions are set/cleared by the API. */
class AuthClient {
  constructor(private readonly c: SenvoriClient) {}

  signInEmail(email: string, password: string): Promise<{ token: string; user: { id: string } }> {
    return this.c.request("POST", "/v1/auth/sign-in/email", { body: { email, password } });
  }

  signUpEmail(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<{ token: string; user: { id: string } }> {
    return this.c.request("POST", "/v1/auth/sign-up/email", { body: input });
  }

  signOut(): Promise<{ success: boolean }> {
    return this.c.request("POST", "/v1/auth/sign-out", { body: {} });
  }
}

/** Identity domain (§1.6). */
class IdentityClient {
  constructor(private readonly c: SenvoriClient) {}

  me(): Promise<CurrentUserDto> {
    return this.c.request("GET", "/v1/me");
  }
  members(): Promise<MembershipWithUserDto[]> {
    return this.c.request("GET", "/v1/members");
  }
  invite(input: InviteMemberInput): Promise<{ id: string }> {
    return this.c.request("POST", "/v1/invitations", { body: input });
  }
  assignRole(input: AssignRoleInput): Promise<RoleAssignmentDto> {
    return this.c.request("POST", "/v1/role-assignments", { body: input });
  }
  auditLogs(limit = 50): Promise<AuditLogEntryDto[]> {
    return this.c.request("GET", "/v1/audit-logs", { query: { limit } });
  }
}

/** Tenancy domain (§2.6). */
class TenancyClient {
  constructor(private readonly c: SenvoriClient) {}

  brands(): Promise<BrandDto[]> {
    return this.c.request("GET", "/v1/brands");
  }
  createBrand(input: CreateBrandInput): Promise<BrandDto> {
    return this.c.request("POST", "/v1/brands", { body: input });
  }
  groups(): Promise<GroupDto[]> {
    return this.c.request("GET", "/v1/groups");
  }
  units(
    query: Partial<UnitListQuery> = {},
  ): Promise<{ items: UnitDto[]; nextCursor: string | null }> {
    return this.c.request("GET", "/v1/units", { query });
  }
  unit(id: string): Promise<UnitDto> {
    return this.c.request("GET", `/v1/units/${id}`);
  }
  createUnit(input: CreateUnitInput): Promise<UnitDto> {
    return this.c.request("POST", "/v1/units", { body: input });
  }
  updateUnit(id: string, input: UpdateUnitInput): Promise<UnitDto> {
    return this.c.request("PATCH", `/v1/units/${id}`, { body: input });
  }
  archiveUnit(id: string): Promise<void> {
    return this.c.request("POST", `/v1/units/${id}/archive`);
  }
  zones(unitId: string): Promise<ZoneDto[]> {
    return this.c.request("GET", `/v1/units/${unitId}/zones`);
  }
  createZone(unitId: string, input: CreateZoneInput): Promise<ZoneDto> {
    return this.c.request("POST", `/v1/units/${unitId}/zones`, { body: input });
  }
}

/**
 * Catalog domain (§4). Product-level operations only — storage details (object
 * keys, presigned URLs) never leak into the API surface.
 */
class CatalogClient {
  constructor(private readonly c: SenvoriClient) {}

  createUpload(input: CreateUploadInput, idempotencyKey?: string): Promise<UploadTicket> {
    return this.c.request("POST", "/v1/catalog/uploads", { body: input, idempotencyKey });
  }
  confirmUpload(uploadId: string): Promise<CatalogItemDto> {
    return this.c.request("POST", `/v1/catalog/uploads/${uploadId}/confirm`);
  }
  /** Full upload: reserve a session, send the bytes to storage, then confirm. */
  async uploadFile(
    input: CreateUploadInput,
    body: BodyInit,
    idempotencyKey?: string,
  ): Promise<CatalogItemDto> {
    const ticket = await this.createUpload(input, idempotencyKey);
    const res = await this.c.rawFetch(ticket.url, {
      method: ticket.method,
      headers: ticket.headers,
      body,
    });
    if (!res.ok) {
      throw new SenvoriApiError(
        { type: "about:blank", title: "Upload failed", status: res.status, code: "UPLOAD_FAILED" },
        res.status,
      );
    }
    return this.confirmUpload(ticket.uploadId);
  }
  listCatalogItems(
    query: Partial<CatalogItemListQuery> = {},
  ): Promise<{ items: CatalogItemDto[]; nextCursor: string | null }> {
    return this.c.request("GET", "/v1/catalog/items", { query });
  }
  getCatalogItem(id: string): Promise<CatalogItemDto> {
    return this.c.request("GET", `/v1/catalog/items/${id}`);
  }
  updateCatalogItem(id: string, input: UpdateCatalogItemInput): Promise<CatalogItemDto> {
    return this.c.request("PATCH", `/v1/catalog/items/${id}`, { body: input });
  }
  archiveCatalogItem(id: string): Promise<void> {
    return this.c.request("POST", `/v1/catalog/items/${id}/archive`);
  }
  reprocessCatalogItem(id: string): Promise<CatalogItemDto> {
    return this.c.request("POST", `/v1/catalog/items/${id}/reprocess`);
  }
  downloadUrl(id: string): Promise<DownloadTicket> {
    return this.c.request("GET", `/v1/catalog/items/${id}/download`);
  }
}
