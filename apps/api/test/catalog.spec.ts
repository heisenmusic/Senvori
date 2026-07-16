import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { uuidv7 } from "uuidv7";
import { Test } from "@nestjs/testing";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../dist/app.module.js";
import { withTenantContext } from "../dist/database/tenant-context.js";
import * as schema from "../dist/database/schema/index.js";
import { registerStorageBodyParser } from "../dist/modules/catalog/storage/fastify-binary.js";

/**
 * Catalog & Media Asset Foundation — integration suite (§4 PART 28). Real
 * PostgreSQL (app on a non-owner NOBYPASSRLS role) + the local storage driver
 * (real filesystem round-trip, not a mock). Covers RLS/authz, the upload →
 * confirm → process state machine, the API, transactional audit and concurrency.
 */

const HOST = process.env.TEST_PG_HOST ?? "localhost:5432";
const ADMIN_URL = process.env.TEST_ADMIN_URL ?? `postgres://senvori:senvori@${HOST}/senvori`;
const OWNER_TEST = `postgres://senvori:senvori@${HOST}/senvori_test`;
const APP_TEST = `postgres://senvori_app_test:apppw@${HOST}/senvori_test`;
const PW = "password-1234";
const STORAGE_DIR = process.env.STORAGE_LOCAL_DIR ?? "";

interface App {
  inject: (opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: string | Buffer;
  }) => Promise<{ statusCode: number; payload: string; headers: Record<string, unknown> }>;
  getHttpAdapter: () => { getInstance: () => { ready: () => Promise<void> } };
  init: () => Promise<void>;
  close: () => Promise<void>;
  setGlobalPrefix: (p: string) => void;
  get: <T>(token: unknown, options?: { strict?: boolean }) => T;
}

let app: App;
let seedDb: ReturnType<typeof drizzle>;
let appPool: Pool;

const tenantA = uuidv7();
const tenantB = uuidv7();
const cookies: Record<string, string> = {};

/** Minimal valid PCM WAV — music-metadata reads duration/sampleRate/channels. */
const makeWav = (seconds = 1, sampleRate = 44100, channels = 1): Buffer => {
  const bytesPerSample = 2;
  const dataSize = seconds * sampleRate * channels * bytesPerSample;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buf.writeUInt16LE(channels * bytesPerSample, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
};

const sha256 = (b: Buffer): string => createHash("sha256").update(b).digest("hex");

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Poll an item until it reaches a terminal state (processing is async). */
const waitFor = async (
  assetId: string,
  who: string,
  statuses: string[] = ["ready", "failed"],
  timeoutMs = 20_000,
): Promise<string> => {
  const start = Date.now();
  for (;;) {
    const item = await req("GET", `/v1/catalog/items/${assetId}`, who);
    const status = item.json?.status as string | undefined;
    if (item.status === 200 && status && statuses.includes(status)) return status;
    if (Date.now() - start > timeoutMs) throw new Error(`waitFor timed out at status=${status}`);
    await sleep(50);
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const req = async (
  method: string,
  url: string,
  who: string | null,
  body?: unknown,
): Promise<{ status: number; json: any }> => {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (who) headers.cookie = cookies[who] ?? "";
  const res = await app.inject({
    method,
    url,
    headers,
    payload: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: unknown = null;
  try {
    json = res.payload ? JSON.parse(res.payload) : null;
  } catch {
    json = res.payload;
  }
  return { status: res.statusCode, json };
};

const signUp = async (email: string): Promise<string> => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/sign-up/email",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email, password: PW, name: email }),
  });
  const body = JSON.parse(res.payload) as { user?: { id: string } };
  if (!body.user) throw new Error(`sign-up failed: ${res.payload}`);
  return body.user.id;
};

const signIn = async (email: string, key: string): Promise<void> => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/sign-in/email",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email, password: PW }),
  });
  const raw = res.headers["set-cookie"] as string | string[] | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  cookies[key] = list.map((c) => c.split(";")[0]).join("; ");
};

const seedUser = async (
  key: string,
  tenantId: string,
  role: string,
  status: "active" | "suspended" = "active",
): Promise<void> => {
  const userId = await signUp(`${key}@cat.dev`);
  await seedDb
    .insert(schema.memberships)
    .values({ id: uuidv7(), organizationId: tenantId, userId, role, status });
  await signIn(`${key}@cat.dev`, key);
};

/** Full happy-path upload: create → PUT bytes → confirm → drain. Returns assetId. */
const uploadWav = async (
  who: string,
  tenantId: string,
  opts: { title?: string; fileName?: string; bytes?: Buffer; declaredChecksum?: string } = {},
): Promise<string> => {
  const bytes = opts.bytes ?? makeWav();
  const checksum = opts.declaredChecksum ?? sha256(bytes);
  const created = await req("POST", "/v1/catalog/uploads", who, {
    fileName: opts.fileName ?? "song.wav",
    contentType: "audio/wav",
    sizeBytes: bytes.length,
    checksumSha256: checksum,
    type: "track",
    title: opts.title,
    language: "pt-BR",
    originCountry: "BR",
  });
  if (created.status !== 201) throw new Error(`create failed: ${JSON.stringify(created.json)}`);
  const ticket = created.json as { uploadId: string; assetId: string; url: string };
  const path = new URL(ticket.url).pathname;
  const put = await app.inject({
    method: "PUT",
    url: path,
    headers: { "content-type": "audio/wav" },
    payload: bytes,
  });
  if (put.statusCode !== 200) throw new Error(`blob PUT failed: ${put.payload}`);
  const confirm = await req("POST", `/v1/catalog/uploads/${ticket.uploadId}/confirm`, who);
  if (confirm.status !== 200 && confirm.status !== 201)
    throw new Error(`confirm failed: ${JSON.stringify(confirm.json)}`);
  await waitFor(ticket.assetId, who);
  void tenantId;
  return ticket.assetId;
};

beforeAll(async () => {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query("DROP DATABASE IF EXISTS senvori_test WITH (FORCE)");
  await admin.query("CREATE DATABASE senvori_test");
  await admin.query(
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='senvori_app_test') THEN
       CREATE ROLE senvori_app_test LOGIN PASSWORD 'apppw' NOSUPERUSER NOCREATEDB NOBYPASSRLS;
     END IF; END $$;`,
  );
  await admin.end();

  execSync("pnpm exec drizzle-kit migrate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: OWNER_TEST },
    stdio: "ignore",
  });

  const owner = new Client({ connectionString: OWNER_TEST });
  await owner.connect();
  await owner.query("GRANT USAGE ON SCHEMA public TO senvori_app_test");
  await owner.query(
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO senvori_app_test",
  );
  await owner.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO senvori_app_test");
  await owner.end();

  if (STORAGE_DIR) await rm(STORAGE_DIR, { recursive: true, force: true });

  process.env.DATABASE_URL = APP_TEST;
  process.env.BETTER_AUTH_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.BETTER_AUTH_URL = "http://localhost:3001";
  process.env.DASHBOARD_URL = "http://localhost:3000";

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication(
    new FastifyAdapter({ bodyLimit: 64 * 1024 * 1024, maxParamLength: 4096 }),
  ) as unknown as App;
  registerStorageBodyParser(app.getHttpAdapter().getInstance() as never);
  app.setGlobalPrefix("v1");
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  appPool = new Pool({ connectionString: APP_TEST });
  seedDb = drizzle(appPool, { schema });

  await seedDb
    .insert(schema.countries)
    .values([
      { code: "BR", nameEn: "Brazil", currencies: ["BRL"] },
      { code: "US", nameEn: "United States", currencies: ["USD"] },
    ])
    .onConflictDoNothing();
  await seedDb.insert(schema.tenants).values([
    { id: tenantA, name: "Tenant A", slug: `a-${tenantA.slice(0, 8)}`, defaultTimezone: "UTC" },
    { id: tenantB, name: "Tenant B", slug: `b-${tenantB.slice(0, 8)}`, defaultTimezone: "UTC" },
  ]);

  await seedUser("ownerA", tenantA, "owner"); // full access incl. identity:audit:read
  await seedUser("curatorA", tenantA, "curator");
  await seedUser("analystA", tenantA, "analyst");
  await seedUser("suspendedA", tenantA, "curator", "suspended");
  await seedUser("ownerB", tenantB, "owner");
}, 180_000);

afterAll(async () => {
  await appPool?.end();
  await app?.close();
  if (STORAGE_DIR) await rm(STORAGE_DIR, { recursive: true, force: true });
});

/* ----------------------------------------------- RLS, tenancy & authz -- */

describe("Catalog — RLS & authorization", () => {
  it("6+7. application role is non-owner and NOBYPASSRLS", async () => {
    const bypass = await appPool.query(
      "SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    expect(bypass.rows[0].rolbypassrls).toBe(false);
    const owner = await appPool.query(
      "SELECT tableowner FROM pg_tables WHERE tablename = 'assets'",
    );
    expect(owner.rows[0].tableowner).not.toBe("senvori_app_test");
  });

  it("5. without a tenant context, RLS returns nothing", async () => {
    const r = await appPool.query("SELECT count(*)::int AS c FROM assets");
    expect(r.rows[0].c).toBe(0);
  });

  it("1-4. a tenant cannot see, read, edit or download another tenant's item", async () => {
    const aId = await uploadWav("curatorA", tenantA, { title: "A Song" });
    // seed a ready asset directly in tenant B
    const bId = uuidv7();
    await withTenantContext(seedDb, tenantB, (tx) =>
      tx.insert(schema.assets).values({
        id: bId,
        tenantId: tenantB,
        type: "track",
        status: "ready",
        origin: "tenant_upload",
        language: "pt-BR",
        originCountry: "BR",
        title: "B Song",
      }),
    );

    const listA = await req("GET", "/v1/catalog/items?limit=100", "curatorA");
    const titles = listA.json.items.map((i: { title: string }) => i.title);
    expect(titles).toContain("A Song");
    expect(titles).not.toContain("B Song");

    expect((await req("GET", `/v1/catalog/items/${bId}`, "curatorA")).status).toBe(404);
    expect(
      (await req("PATCH", `/v1/catalog/items/${bId}`, "curatorA", { title: "x" })).status,
    ).toBe(404);
    expect((await req("GET", `/v1/catalog/items/${bId}/download`, "curatorA")).status).toBe(404);
    // and B can still act on it
    expect((await req("GET", `/v1/catalog/items/${bId}`, "ownerB")).status).toBe(200);
    void aId;
  });

  it("6. a user without upload permission cannot create an upload", async () => {
    const r = await req("POST", "/v1/catalog/uploads", "analystA", {
      fileName: "x.wav",
      contentType: "audio/wav",
      sizeBytes: 100,
      checksumSha256: "a".repeat(64),
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    expect(r.status).toBe(403);
  });

  it("7. a read-only user cannot edit an item", async () => {
    const id = await uploadWav("curatorA", tenantA, { title: "ReadOnly Target" });
    expect(
      (await req("PATCH", `/v1/catalog/items/${id}`, "analystA", { title: "hax" })).status,
    ).toBe(403);
  });

  it("8. an authorized user can create an upload", async () => {
    const r = await req("POST", "/v1/catalog/uploads", "curatorA", {
      fileName: "ok.wav",
      contentType: "audio/wav",
      sizeBytes: 100,
      checksumSha256: "b".repeat(64),
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    expect(r.status).toBe(201);
    expect(r.json.uploadId).toBeTruthy();
  });

  it("9. a suspended membership is denied", async () => {
    const r = await req("GET", "/v1/catalog/items", "suspendedA");
    expect(r.status).toBe(403);
  });
});

/* --------------------------------------------------- upload & validation -- */

describe("Catalog — upload workflow", () => {
  it("11. an unaccepted content type is rejected", async () => {
    const r = await req("POST", "/v1/catalog/uploads", "curatorA", {
      fileName: "bad.txt",
      contentType: "text/plain",
      sizeBytes: 10,
      checksumSha256: "c".repeat(64),
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("VALIDATION_FAILED");
  });

  it("12. a file over the size limit is rejected", async () => {
    const r = await req("POST", "/v1/catalog/uploads", "curatorA", {
      fileName: "huge.wav",
      contentType: "audio/wav",
      sizeBytes: 999_999_999_999,
      checksumSha256: "d".repeat(64),
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("FILE_TOO_LARGE");
  });

  it("13+14. a malicious filename is sanitized and never reaches the object key", async () => {
    const created = await req("POST", "/v1/catalog/uploads", "curatorA", {
      fileName: "../../../etc/passwd.wav",
      contentType: "audio/wav",
      sizeBytes: 100,
      checksumSha256: "e".repeat(64),
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    expect(created.status).toBe(201);
    // the signed URL's key is id-based, not filename-based
    expect(created.json.url).not.toContain("passwd");
    expect(created.json.url).not.toContain("..");
  });

  it("15. confirming without an uploaded object fails", async () => {
    const created = await req("POST", "/v1/catalog/uploads", "curatorA", {
      fileName: "missing.wav",
      contentType: "audio/wav",
      sizeBytes: 100,
      checksumSha256: "f".repeat(64),
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    const confirm = await req(
      "POST",
      `/v1/catalog/uploads/${created.json.uploadId}/confirm`,
      "curatorA",
    );
    expect(confirm.status).toBe(400);
    expect(confirm.json.code).toBe("OBJECT_NOT_FOUND");
  });

  it("18. an upload cannot be confirmed by another tenant", async () => {
    const created = await req("POST", "/v1/catalog/uploads", "curatorA", {
      fileName: "mine.wav",
      contentType: "audio/wav",
      sizeBytes: 100,
      checksumSha256: "1".repeat(64),
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    const confirm = await req(
      "POST",
      `/v1/catalog/uploads/${created.json.uploadId}/confirm`,
      "ownerB",
    );
    expect(confirm.status).toBe(404);
  });

  it("17. duplicate confirmation is idempotent (one asset, one rendition)", async () => {
    const bytes = makeWav();
    const created = await req("POST", "/v1/catalog/uploads", "curatorA", {
      fileName: "idem.wav",
      contentType: "audio/wav",
      sizeBytes: bytes.length,
      checksumSha256: sha256(bytes),
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    const path = new URL(created.json.url).pathname;
    await app.inject({
      method: "PUT",
      url: path,
      headers: { "content-type": "audio/wav" },
      payload: bytes,
    });
    const c1 = await req(
      "POST",
      `/v1/catalog/uploads/${created.json.uploadId}/confirm`,
      "curatorA",
    );
    const c2 = await req(
      "POST",
      `/v1/catalog/uploads/${created.json.uploadId}/confirm`,
      "curatorA",
    );
    expect(c1.status).toBe(200);
    expect(c2.status).toBe(200);
    expect(c2.json.id).toBe(c1.json.id);
    await waitFor(created.json.assetId, "curatorA");
    const rows = await withTenantContext(seedDb, tenantA, (tx) =>
      tx
        .select()
        .from(schema.renditions)
        .where(eq(schema.renditions.assetId, created.json.assetId)),
    );
    expect(rows.length).toBe(1);
  });
});

/* ------------------------------------------------------------- processing -- */

describe("Catalog — processing", () => {
  it("19+23+24. upload becomes ready with extracted metadata", async () => {
    const id = await uploadWav("curatorA", tenantA, { title: "Metadata Song" });
    const item = await req("GET", `/v1/catalog/items/${id}`, "curatorA");
    expect(item.status).toBe(200);
    expect(item.json.status).toBe("ready");
    expect(item.json.durationMs).toBeGreaterThan(0);
    expect(item.json.mediaInfo.sampleRate).toBe(44100);
    expect(item.json.mediaInfo.channels).toBe(1);
  });

  it("20. an invalid (non-audio) file ends in failed", async () => {
    const junk = Buffer.from("this is definitely not audio content at all, nope");
    const created = await req("POST", "/v1/catalog/uploads", "curatorA", {
      fileName: "fake.wav",
      contentType: "audio/wav",
      sizeBytes: junk.length,
      checksumSha256: sha256(junk),
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    const path = new URL(created.json.url).pathname;
    await app.inject({
      method: "PUT",
      url: path,
      headers: { "content-type": "audio/wav" },
      payload: junk,
    });
    await req("POST", `/v1/catalog/uploads/${created.json.uploadId}/confirm`, "curatorA");
    await waitFor(created.json.assetId, "curatorA", ["failed"]);
    const item = await req("GET", `/v1/catalog/items/${created.json.assetId}`, "curatorA");
    expect(item.json.status).toBe("failed");
  });

  it("16. a checksum mismatch fails processing (integrity)", async () => {
    const bytes = makeWav();
    const created = await req("POST", "/v1/catalog/uploads", "curatorA", {
      fileName: "tampered.wav",
      contentType: "audio/wav",
      sizeBytes: bytes.length,
      checksumSha256: "0".repeat(64), // wrong on purpose
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    const path = new URL(created.json.url).pathname;
    await app.inject({
      method: "PUT",
      url: path,
      headers: { "content-type": "audio/wav" },
      payload: bytes,
    });
    await req("POST", `/v1/catalog/uploads/${created.json.uploadId}/confirm`, "curatorA");
    await waitFor(created.json.assetId, "curatorA", ["failed"]);
    const item = await req("GET", `/v1/catalog/items/${created.json.assetId}`, "curatorA");
    expect(item.json.status).toBe("failed");
  });

  it("25. a non-ready asset cannot be downloaded; a ready one can", async () => {
    const id = await uploadWav("curatorA", tenantA, { title: "Downloadable" });
    const dl = await req("GET", `/v1/catalog/items/${id}/download`, "curatorA");
    expect(dl.status).toBe(200);
    expect(dl.json.url).toBeTruthy();

    // a fresh, unconfirmed asset is not ready
    const created = await req("POST", "/v1/catalog/uploads", "curatorA", {
      fileName: "pending.wav",
      contentType: "audio/wav",
      sizeBytes: 100,
      checksumSha256: "2".repeat(64),
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    const notReady = await req(
      "GET",
      `/v1/catalog/items/${created.json.assetId}/download`,
      "curatorA",
    );
    expect(notReady.status).toBe(400);
    expect(notReady.json.code).toBe("ASSET_NOT_READY");
  });

  it("22. reprocessing a ready item does not duplicate renditions", async () => {
    const id = await uploadWav("curatorA", tenantA, { title: "Reprocess Me" });
    const re = await req("POST", `/v1/catalog/items/${id}/reprocess`, "curatorA");
    expect(re.status).toBe(200);
    await waitFor(id, "curatorA");
    const item = await req("GET", `/v1/catalog/items/${id}`, "curatorA");
    expect(item.json.status).toBe("ready");
    const rows = await withTenantContext(seedDb, tenantA, (tx) =>
      tx.select().from(schema.renditions).where(eq(schema.renditions.assetId, id)),
    );
    expect(rows.length).toBe(1);
  });
});

/* -------------------------------------------------------------------- API -- */

describe("Catalog — API contract", () => {
  it("26. list pagination returns a cursor and advances", async () => {
    await uploadWav("curatorA", tenantA, { title: "Page A" });
    await uploadWav("curatorA", tenantA, { title: "Page B" });
    await uploadWav("curatorA", tenantA, { title: "Page C" });
    const p1 = await req("GET", "/v1/catalog/items?limit=2", "curatorA");
    expect(p1.json.items).toHaveLength(2);
    expect(p1.json.nextCursor).toBeTruthy();
    const p2 = await req(
      "GET",
      `/v1/catalog/items?limit=2&cursor=${p1.json.nextCursor}`,
      "curatorA",
    );
    const first = p1.json.items.map((i: { id: string }) => i.id);
    const second = p2.json.items.map((i: { id: string }) => i.id);
    expect(second.some((id: string) => first.includes(id))).toBe(false);
  });

  it("27+28. search and filters narrow the result set", async () => {
    await uploadWav("curatorA", tenantA, { title: "Unique Jazz Ballad" });
    const q = await req("GET", "/v1/catalog/items?q=Jazz%20Ballad", "curatorA");
    expect(q.json.items.every((i: { title: string }) => i.title.includes("Jazz Ballad"))).toBe(
      true,
    );
    const byType = await req("GET", "/v1/catalog/items?type=track&status=ready", "curatorA");
    expect(
      byType.json.items.every(
        (i: { type: string; status: string }) => i.type === "track" && i.status === "ready",
      ),
    ).toBe(true);
  });

  it("30+31. archiving hides an item and archived access is 404/400", async () => {
    const id = await uploadWav("curatorA", tenantA, { title: "To Archive" });
    expect((await req("POST", `/v1/catalog/items/${id}/archive`, "curatorA")).status).toBe(204);
    const list = await req("GET", "/v1/catalog/items?limit=100", "curatorA");
    expect(list.json.items.some((i: { id: string }) => i.id === id)).toBe(false);
    // archived item is still directly readable but not editable / downloadable
    expect((await req("GET", `/v1/catalog/items/${id}`, "curatorA")).json.status).toBe("archived");
    expect((await req("PATCH", `/v1/catalog/items/${id}`, "curatorA", { title: "x" })).status).toBe(
      400,
    );
    expect((await req("GET", `/v1/catalog/items/${id}/download`, "curatorA")).status).toBe(400);
  });

  it("32. an invalid update payload is rejected", async () => {
    const id = await uploadWav("curatorA", tenantA, { title: "Bad Update" });
    const r = await req("PATCH", `/v1/catalog/items/${id}`, "curatorA", {
      language: "not-a-locale!",
    });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("VALIDATION_FAILED");
  });

  it("33. errors use a standardized shape with a code", async () => {
    const r = await req("GET", `/v1/catalog/items/${uuidv7()}`, "curatorA");
    expect(r.status).toBe(404);
    expect(r.json.code).toBe("ITEM_NOT_FOUND");
  });
});

/* ----------------------------------------------------------------- audit -- */

describe("Catalog — transactional audit", () => {
  it("34+35+36+38. mutations write audit with real before/after and no secrets", async () => {
    const id = await uploadWav("curatorA", tenantA, { title: "Audited" });
    await req("PATCH", `/v1/catalog/items/${id}`, "curatorA", { title: "Audited v2" });
    await req("POST", `/v1/catalog/items/${id}/archive`, "curatorA");

    const logs = await req("GET", "/v1/audit-logs?limit=200", "ownerA");
    const actions = logs.json.map((e: { action: string }) => e.action);
    expect(actions).toContain("catalog.upload.created");
    expect(actions).toContain("catalog.item.updated");
    expect(actions).toContain("catalog.item.archived");
    const upd = logs.json.find(
      (e: { action: string; resourceId: string }) =>
        e.action === "catalog.item.updated" && e.resourceId === id,
    );
    expect(upd.changes.before.title).toBe("Audited");
    expect(upd.changes.after.title).toBe("Audited v2");
    const blob = JSON.stringify(logs.json).toLowerCase();
    expect(blob).not.toContain("_storage");
    expect(blob).not.toContain("password");
  });

  it("37. an audit failure rolls the mutation back", async () => {
    const owner = new Client({ connectionString: OWNER_TEST });
    await owner.connect();
    await owner.query("REVOKE INSERT ON audit_log_entries FROM senvori_app_test");
    try {
      const r = await req("POST", "/v1/catalog/uploads", "curatorA", {
        fileName: "atomic.wav",
        contentType: "audio/wav",
        sizeBytes: 100,
        checksumSha256: "3".repeat(64),
        type: "track",
        language: "pt-BR",
        originCountry: "BR",
      });
      expect(r.status).toBeGreaterThanOrEqual(500);
      const count = await withTenantContext(seedDb, tenantA, (tx) =>
        tx.select().from(schema.uploads),
      ).then(
        (rows) =>
          rows.filter((u: { fileName: string | null }) => u.fileName === "atomic.wav").length,
      );
      expect(count).toBe(0); // upload row rolled back with the failed audit
    } finally {
      await owner.query("GRANT INSERT ON audit_log_entries TO senvori_app_test");
      await owner.end();
    }
  });
});

/* ----------------------------------------------------------- concurrency -- */

describe("Catalog — concurrency", () => {
  it("39. concurrent confirmations do not duplicate the asset", async () => {
    const bytes = makeWav();
    const created = await req("POST", "/v1/catalog/uploads", "curatorA", {
      fileName: "race.wav",
      contentType: "audio/wav",
      sizeBytes: bytes.length,
      checksumSha256: sha256(bytes),
      type: "track",
      language: "pt-BR",
      originCountry: "BR",
    });
    const path = new URL(created.json.url).pathname;
    await app.inject({
      method: "PUT",
      url: path,
      headers: { "content-type": "audio/wav" },
      payload: bytes,
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        req("POST", `/v1/catalog/uploads/${created.json.uploadId}/confirm`, "curatorA"),
      ),
    );
    for (const r of results) expect([200, 201]).toContain(r.status);
    await waitFor(created.json.assetId, "curatorA");
    const jobs = await withTenantContext(seedDb, tenantA, (tx) =>
      tx
        .select()
        .from(schema.transcodeJobs)
        .where(eq(schema.transcodeJobs.assetId, created.json.assetId)),
    );
    expect(jobs.length).toBe(1);
  });

  it("40. concurrent A/B reads never leak tenant", async () => {
    const calls = Array.from({ length: 16 }, (_, i) =>
      req("GET", "/v1/catalog/items?limit=100", i % 2 === 0 ? "curatorA" : "ownerB"),
    );
    const results = await Promise.all(calls);
    for (let i = 0; i < results.length; i++) {
      const items = results[i]!.json.items as { tenantId: string | null }[];
      const expected = i % 2 === 0 ? tenantA : tenantB;
      expect(items.every((it) => it.tenantId === expected)).toBe(true);
    }
  });
});
