import { createHash, randomBytes } from "node:crypto";
import { execSync } from "node:child_process";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { uuidv7 } from "uuidv7";
import { Test } from "@nestjs/testing";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../dist/app.module.js";
import { withTenantContext } from "../dist/database/tenant-context.js";
import * as schema from "../dist/database/schema/index.js";

const HOST = process.env.TEST_PG_HOST ?? "localhost:5432";
const ADMIN_URL = process.env.TEST_ADMIN_URL ?? `postgres://senvori:senvori@${HOST}/senvori`;
const OWNER_TEST = `postgres://senvori:senvori@${HOST}/senvori_test`;
const APP_TEST = `postgres://senvori_app_test:apppw@${HOST}/senvori_test`;
const PW = "password-1234";

interface App {
  inject: (opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: string;
  }) => Promise<{ statusCode: number; payload: string }>;
  getHttpAdapter: () => { getInstance: () => { ready: () => Promise<void> } };
  init: () => Promise<void>;
  close: () => Promise<void>;
  setGlobalPrefix: (p: string) => void;
}

let app: App;
let seedDb: ReturnType<typeof drizzle>;
let appPool: Pool;

const tenantA = uuidv7();
const tenantB = uuidv7();
let zoneAId = "";
let unitAId = "";
let assetAId = "";
const cookies: Record<string, string> = {};

const sha256 = (v: string): string => createHash("sha256").update(v).digest("hex");

const req = async (
  method: string,
  url: string,
  who: string | null,
  body?: unknown,
  bearer?: string,
): Promise<{ status: number; json: any }> => {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (who) headers.cookie = cookies[who] ?? "";
  if (bearer) headers.authorization = `Bearer ${bearer}`;
  const res = await app.inject({
    method,
    url,
    headers,
    payload: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
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
  if (!body.user) throw new Error(`sign-up failed for ${email}: ${res.payload}`);
  return body.user.id;
};

const signIn = async (email: string, key: string): Promise<void> => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/sign-in/email",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email, password: PW }),
  });
  const raw = (res as unknown as { headers: Record<string, unknown> }).headers["set-cookie"] as
    string | string[] | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  cookies[key] = list.map((c) => c.split(";")[0]).join("; ");
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

  process.env.DATABASE_URL = APP_TEST;
  process.env.BETTER_AUTH_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.BETTER_AUTH_URL = "http://localhost:3001";
  process.env.DASHBOARD_URL = "http://localhost:3000";
  process.env.STORAGE_DRIVER = "local";

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication(new FastifyAdapter()) as unknown as App;
  app.setGlobalPrefix("v1");
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  appPool = new Pool({ connectionString: APP_TEST });
  seedDb = drizzle(appPool, { schema });

  await seedDb
    .insert(schema.countries)
    .values({ code: "BR", nameEn: "Brazil", currencies: ["BRL"] })
    .onConflictDoNothing();

  const managerA = await signUp("manager@a.com");
  const analystA = await signUp("analyst@a.com");
  const ownerB = await signUp("owner@b.com");

  await seedDb.insert(schema.tenants).values([
    { id: tenantA, name: "Tenant A", slug: `a-${tenantA.slice(0, 8)}` },
    { id: tenantB, name: "Tenant B", slug: `b-${tenantB.slice(0, 8)}` },
  ]);
  await seedDb.insert(schema.memberships).values([
    { id: uuidv7(), organizationId: tenantA, userId: managerA, role: "manager", status: "active" },
    { id: uuidv7(), organizationId: tenantA, userId: analystA, role: "analyst", status: "active" },
    { id: uuidv7(), organizationId: tenantB, userId: ownerB, role: "owner", status: "active" },
  ]);

  // Tenant A: brand → unit → default zone, and a published program assigned to the unit.
  await withTenantContext(seedDb, tenantA, async (tx) => {
    const brandA = uuidv7();
    await tx
      .insert(schema.brands)
      .values({ id: brandA, tenantId: tenantA, name: "Brand A", slug: "a" });
    unitAId = uuidv7();
    await tx.insert(schema.units).values({
      id: unitAId,
      tenantId: tenantA,
      brandId: brandA,
      countryCode: "BR",
      name: "A-Unit",
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
    });
    zoneAId = uuidv7();
    await tx.insert(schema.zones).values({
      id: zoneAId,
      tenantId: tenantA,
      unitId: unitAId,
      name: "Main",
      kind: "audio",
      isDefault: true,
    });

    // Playable asset (ready) with an "original" rendition + source upload.
    assetAId = uuidv7();
    await tx.insert(schema.assets).values({
      id: assetAId,
      tenantId: tenantA,
      type: "track",
      status: "ready",
      origin: "tenant_upload",
      originCountry: "BR",
      language: "pt-BR",
      title: "Test Track",
      durationMs: 180_000,
    });
    await tx
      .insert(schema.tracks)
      .values({ assetId: assetAId, tenantId: tenantA, artist: "Tester" });
    await tx.insert(schema.uploads).values({
      id: uuidv7(),
      tenantId: tenantA,
      assetId: assetAId,
      status: "completed",
      storageKey: `assets/${assetAId}/original`,
      contentType: "audio/mpeg",
      sizeBytes: 4096,
      checksumSha256: "b".repeat(64),
      expiresAt: new Date(Date.now() + 3_600_000),
      createdBy: managerA,
    });
    await tx.insert(schema.renditions).values({
      id: uuidv7(),
      tenantId: tenantA,
      assetId: assetAId,
      profile: "original",
      storageKey: `assets/${assetAId}/original`,
      bytes: 4096,
      hash: "b".repeat(64),
    });

    const programA = uuidv7();
    await tx.insert(schema.playlists).values({
      id: programA,
      tenantId: tenantA,
      type: "manual",
      name: "Program A",
      status: "published",
    });
    await tx.insert(schema.playlistVersions).values({
      id: uuidv7(),
      tenantId: tenantA,
      playlistId: programA,
      version: 1,
      resolvedItems: [assetAId],
      planHash: "base-hash-a",
      compilerVersion: "test",
    });
    await tx.insert(schema.scheduleAssignments).values({
      id: uuidv7(),
      tenantId: tenantA,
      programId: programA,
      targetType: "unit",
      targetId: unitAId,
      priority: 0,
      daysOfWeek: [],
      startTimeLocal: "00:00",
      endTimeLocal: "23:59",
      active: true,
    });
  });

  await signIn("manager@a.com", "managerA");
  await signIn("analyst@a.com", "analystA");
  await signIn("owner@b.com", "ownerB");
}, 180_000);

afterAll(async () => {
  await appPool?.end();
  await app?.close();
});

/** A fresh audio zone in unit A — the schema allows one live device per zone. */
const freshZone = async (): Promise<string> => {
  const id = uuidv7();
  await withTenantContext(seedDb, tenantA, (tx) =>
    tx.insert(schema.zones).values({
      id,
      tenantId: tenantA,
      unitId: unitAId,
      name: `zone-${id}`,
      kind: "audio",
    }),
  );
  return id;
};

/** Runs the full pairing flow, returning the device credential. */
const activate = async (): Promise<{
  code: string;
  secret: string;
  zoneId: string;
  credential: any;
}> => {
  const zoneId = await freshZone();
  const secret = randomBytes(32).toString("hex");
  const start = await req("POST", "/v1/player/activation/start", null, {
    deviceId: `dev-local-${uuidv7()}`,
    platform: "android",
    appVersion: "1.0.0",
    activationSecretHash: sha256(secret),
  });
  expect(start.status).toBe(201);
  const code = start.json.code as string;
  const claim = await req("POST", `/v1/fleet/activations/${code}/claim`, "managerA", { zoneId });
  if (claim.status !== 201) console.error("CLAIM FAIL", claim.status, JSON.stringify(claim.json));
  expect(claim.status).toBe(201);
  const complete = await req("POST", "/v1/player/activation/complete", null, {
    code,
    activationSecret: secret,
  });
  expect(complete.status).toBe(200);
  return { code, secret, zoneId, credential: complete.json };
};

describe("player activation", () => {
  it("completes the proof-of-possession pairing and issues a device token", async () => {
    const { credential, zoneId } = await activate();
    expect(credential.token).toMatch(/^pdt_/);
    expect(credential.tenantId).toBe(tenantA);
    expect(credential.unitId).toBe(unitAId);
    expect(credential.zoneId).toBe(zoneId);
    expect(credential.timezone).toBe("America/Sao_Paulo");
  });

  it("rejects a completed code on replay (single-use)", async () => {
    const { code, secret } = await activate();
    const replay = await req("POST", "/v1/player/activation/complete", null, {
      code,
      activationSecret: secret,
    });
    expect(replay.status).toBe(409);
  });

  it("rejects completion with the wrong secret (proof-of-possession)", async () => {
    const secret = randomBytes(32).toString("hex");
    const start = await req("POST", "/v1/player/activation/start", null, {
      deviceId: `dev-local-${uuidv7()}`,
      platform: "android",
      appVersion: "1.0.0",
      activationSecretHash: sha256(secret),
    });
    const code = start.json.code as string;
    await req("POST", `/v1/fleet/activations/${code}/claim`, "managerA", { zoneId: zoneAId });
    const bad = await req("POST", "/v1/player/activation/complete", null, {
      code,
      activationSecret: randomBytes(32).toString("hex"),
    });
    expect(bad.status).toBe(403);
  });

  it("cannot complete before an operator claims the code", async () => {
    const secret = randomBytes(32).toString("hex");
    const start = await req("POST", "/v1/player/activation/start", null, {
      deviceId: `dev-local-${uuidv7()}`,
      platform: "android",
      appVersion: "1.0.0",
      activationSecretHash: sha256(secret),
    });
    const early = await req("POST", "/v1/player/activation/complete", null, {
      code: start.json.code,
      activationSecret: secret,
    });
    expect(early.status).toBe(403);
  });

  it("denies claim to a read-only operator (RBAC) and to another tenant", async () => {
    const secret = randomBytes(32).toString("hex");
    const start = await req("POST", "/v1/player/activation/start", null, {
      deviceId: `dev-local-${uuidv7()}`,
      platform: "android",
      appVersion: "1.0.0",
      activationSecretHash: sha256(secret),
    });
    const analyst = await req(
      "POST",
      `/v1/fleet/activations/${start.json.code}/claim`,
      "analystA",
      {
        zoneId: zoneAId,
      },
    );
    expect(analyst.status).toBe(403);
    // Tenant B operator cannot claim into tenant A's zone.
    const crossTenant = await req(
      "POST",
      `/v1/fleet/activations/${start.json.code}/claim`,
      "ownerB",
      { zoneId: zoneAId },
    );
    expect([400, 403, 404]).toContain(crossTenant.status);
  });
});

describe("device authentication", () => {
  it("accepts a valid token and rejects invalid / missing ones", async () => {
    const { credential } = await activate();
    const ok = await req("GET", "/v1/player/execution-plan", null, undefined, credential.token);
    expect(ok.status).toBe(200);

    const forged = await req("GET", "/v1/player/execution-plan", null, undefined, "pdt_forged");
    expect(forged.status).toBe(401);

    const missing = await req("GET", "/v1/player/execution-plan", null);
    expect(missing.status).toBe(401);
  });

  it("rejects a revoked token after deactivation", async () => {
    const { credential } = await activate();
    const off = await req("POST", "/v1/player/deactivate", null, {}, credential.token);
    expect(off.status).toBe(204);
    const after = await req(
      "POST",
      "/v1/player/heartbeat",
      null,
      heartbeatBody(),
      credential.token,
    );
    expect(after.status).toBe(401);
  });
});

const heartbeatBody = (planHash: string | null = null) => ({
  appVersion: "1.0.0",
  contractVersion: "1.0.0",
  platform: "android",
  runtimeState: "healthy",
  connectivity: "apiReachable",
  activePlanHash: planHash,
  effectivePlanHash: planHash,
  currentItemId: null,
  positionMs: null,
  storage: { totalBytes: 1000, freeBytes: 500, cacheBytes: 100 },
  assetCount: 1,
  outboxSize: 0,
  lastSyncAt: null,
  lastError: null,
  reportedAt: new Date().toISOString(),
});

describe("heartbeat + execution plan", () => {
  it("records a heartbeat and surfaces it in the admin device detail", async () => {
    const { credential } = await activate();
    const hb = await req(
      "POST",
      "/v1/player/heartbeat",
      null,
      heartbeatBody("h1"),
      credential.token,
    );
    expect(hb.status).toBe(200);
    expect(hb.json.nextHeartbeatSeconds).toBeGreaterThan(0);

    const detail = await req("GET", `/v1/fleet/devices/${credential.deviceId}`, "managerA");
    expect(detail.status).toBe(200);
    expect(detail.json.runtimeState).toBe("healthy");
    expect(detail.json.effectivePlanHash).toBe("h1");
    expect(detail.json.hasActiveCredential).toBe(true);
  });

  it("serves an effective plan with ordered items and signed asset descriptors", async () => {
    const { credential } = await activate();
    const plan = await req("GET", "/v1/player/execution-plan", null, undefined, credential.token);
    expect(plan.status).toBe(200);
    expect(plan.json.unitId).toBe(unitAId);
    expect(plan.json.items.length).toBe(1);
    expect(plan.json.items[0].assetId).toBe(assetAId);
    expect(plan.json.assets.length).toBe(1);
    expect(plan.json.assets[0].url).toBeTruthy();
    expect(plan.json.assets[0].checksumSha256).toBe("b".repeat(64));
    expect(plan.json.basePlanHash).toBe("base-hash-a");
  });
});

describe("telemetry ingestion", () => {
  const playbackEvent = (planHash: string) => ({
    eventId: uuidv7(),
    type: "playback_completed",
    planVersion: "1",
    effectivePlanHash: planHash,
    itemId: "item-0",
    assetId: assetAId,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    positionMs: 180_000,
    durationMs: 180_000,
    completionPct: 100,
    source: "program",
    reason: null,
    appVersion: "1.0.0",
  });

  it("ingests a batch, dedups on replay, and denies cross-tenant reads", async () => {
    const { credential } = await activate();
    const ev = playbackEvent("h1");
    const first = await req(
      "POST",
      "/v1/player/telemetry",
      null,
      { batchId: uuidv7(), playbackEvents: [ev] },
      credential.token,
    );
    expect(first.status).toBe(200);
    expect(first.json.acceptedIds).toContain(ev.eventId);

    // Replay the same event id → duplicate, not double-counted.
    const second = await req(
      "POST",
      "/v1/player/telemetry",
      null,
      { batchId: uuidv7(), playbackEvents: [ev] },
      credential.token,
    );
    expect(second.json.duplicateIds).toContain(ev.eventId);
    expect(second.json.acceptedIds).not.toContain(ev.eventId);

    // Owner of tenant A sees the event; tenant B operator sees nothing.
    const listA = await req(
      "GET",
      `/v1/fleet/devices/${credential.deviceId}/playback-events`,
      "managerA",
    );
    expect(listA.status).toBe(200);
    expect(listA.json.items.length).toBeGreaterThanOrEqual(1);

    const listB = await req("GET", `/v1/fleet/devices/${credential.deviceId}`, "ownerB");
    expect(listB.status).toBe(404);
  });

  it("rejects an oversized batch at the contract boundary", async () => {
    const { credential } = await activate();
    const events = Array.from({ length: 201 }, () => playbackEvent("h1"));
    const res = await req(
      "POST",
      "/v1/player/telemetry",
      null,
      { batchId: uuidv7(), playbackEvents: events },
      credential.token,
    );
    expect(res.status).toBe(400);
  });
});

describe("session refresh", () => {
  it("rotates the token and invalidates the old one", async () => {
    const { credential } = await activate();
    const refreshed = await req("POST", "/v1/player/session/refresh", null, {}, credential.token);
    expect(refreshed.status).toBe(200);
    expect(refreshed.json.token).not.toBe(credential.token);

    // New token works…
    const withNew = await req(
      "POST",
      "/v1/player/heartbeat",
      null,
      heartbeatBody(),
      refreshed.json.token,
    );
    expect(withNew.status).toBe(200);
    // …old token is revoked.
    const withOld = await req(
      "POST",
      "/v1/player/heartbeat",
      null,
      heartbeatBody(),
      credential.token,
    );
    expect(withOld.status).toBe(401);
  });
});

describe("fleet admin", () => {
  it("lists devices for the tenant", async () => {
    await activate();
    const list = await req("GET", "/v1/fleet/devices", "managerA");
    expect(list.status).toBe(200);
    expect(Array.isArray(list.json.items)).toBe(true);
    expect(list.json.items.length).toBeGreaterThanOrEqual(1);
  });
});
