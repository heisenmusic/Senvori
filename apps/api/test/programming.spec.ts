import { execSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { uuidv7 } from "uuidv7";
import { Test } from "@nestjs/testing";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "../dist/app.module.js";
import { withTenantContext } from "../dist/database/tenant-context.js";
import * as schema from "../dist/database/schema/index.js";

/**
 * Programming foundation — integration suite (Sprint 06 · F4, §25). Real
 * PostgreSQL on the non-owner NOBYPASSRLS app role. Covers tenant isolation,
 * RBAC deny-by-default, transactional audit, deterministic preview, timezone,
 * immutable publish, assignment and insufficient-catalog handling.
 */

const HOST = process.env.TEST_PG_HOST ?? "localhost:5432";
const ADMIN_URL = process.env.TEST_ADMIN_URL ?? `postgres://senvori:senvori@${HOST}/senvori`;
// Shared test DB name (serial suites each recreate it in beforeAll) so the app's
// Better Auth pool and this suite's seed pool point at the same database.
const OWNER_TEST = `postgres://senvori:senvori@${HOST}/senvori_test`;
const APP_TEST = `postgres://senvori_app_test:apppw@${HOST}/senvori_test`;
const PW = "password-1234";

interface App {
  inject: (opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: string;
  }) => Promise<{ statusCode: number; payload: string; headers: Record<string, unknown> }>;
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
const cookies: Record<string, string> = {};

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

const seedUser = async (key: string, tenantId: string, role: string): Promise<void> => {
  const userId = await signUp(`${key}@prog.dev`);
  await seedDb
    .insert(schema.memberships)
    .values({ id: uuidv7(), organizationId: tenantId, userId, role, status: "active" });
  await signIn(`${key}@prog.dev`, key);
};

const seedTrack = async (tenantId: string, artist: string, durationMs: number): Promise<string> => {
  const id = uuidv7();
  await withTenantContext(seedDb, tenantId, async (tx) => {
    await tx.insert(schema.assets).values({
      id,
      tenantId,
      type: "track",
      status: "ready",
      origin: "tenant_upload",
      language: "pt-BR",
      originCountry: "BR",
      title: `Song ${id.slice(0, 6)}`,
      durationMs,
    });
    await tx.insert(schema.tracks).values({ assetId: id, tenantId, artist });
  });
  return id;
};

let trackIds: string[] = [];

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

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication(
    new FastifyAdapter({ maxParamLength: 4096 }),
  ) as unknown as App;
  app.setGlobalPrefix("v1");
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  appPool = new Pool({ connectionString: APP_TEST });
  seedDb = drizzle(appPool, { schema });

  await seedDb
    .insert(schema.countries)
    .values([{ code: "BR", nameEn: "Brazil", currencies: ["BRL"] }])
    .onConflictDoNothing();
  await seedDb.insert(schema.tenants).values([
    { id: tenantA, name: "Tenant A", slug: `a-${tenantA.slice(0, 8)}`, defaultTimezone: "UTC" },
    { id: tenantB, name: "Tenant B", slug: `b-${tenantB.slice(0, 8)}`, defaultTimezone: "UTC" },
  ]);

  await seedUser("ownerA", tenantA, "owner");
  await seedUser("curatorA", tenantA, "curator");
  await seedUser("analystA", tenantA, "analyst");
  await seedUser("ownerB", tenantB, "owner");

  trackIds = [];
  const artists = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"];
  for (const a of artists) trackIds.push(await seedTrack(tenantA, a, 180_000));
}, 180_000);

afterAll(async () => {
  await appPool?.end();
  await app?.close();
});

/* --------------------------------------------------------------- helpers -- */

const createProgram = async (who: string, name = "Ambiente"): Promise<string> => {
  const r = await req("POST", "/v1/programs", who, { name, type: "manual" });
  if (r.status !== 201) throw new Error(`create failed: ${JSON.stringify(r.json)}`);
  return r.json.id as string;
};

const previewBody = {
  timezone: "America/Sao_Paulo",
  localDate: "2026-06-15",
  windowStartLocal: "08:00",
  windowEndLocal: "10:00",
};

/* ----------------------------------------------------------------- tests -- */

describe("Programming — RBAC deny-by-default", () => {
  it("a read-only analyst cannot create a program", async () => {
    const r = await req("POST", "/v1/programs", "analystA", { name: "X", type: "manual" });
    expect(r.status).toBe(403);
  });

  it("a curator can create and manage programs", async () => {
    const r = await req("POST", "/v1/programs", "curatorA", { name: "Curated", type: "manual" });
    expect(r.status).toBe(201);
  });

  it("an unauthenticated request is rejected", async () => {
    const r = await req("GET", "/v1/programs", null);
    expect(r.status).toBe(401);
  });
});

describe("Programming — CRUD + items", () => {
  it("creates a draft, sets items and reports the item count", async () => {
    const id = await createProgram("ownerA");
    const set = await req("PUT", `/v1/programs/${id}/items`, "ownerA", {
      assetIds: trackIds.slice(0, 4),
    });
    expect(set.status).toBe(200);
    expect(set.json.itemCount).toBe(4);
    const got = await req("GET", `/v1/programs/${id}`, "ownerA");
    expect(got.json.status).toBe("draft");
    expect(got.json.itemCount).toBe(4);
  });
});

describe("Programming — tenant isolation", () => {
  it("a tenant cannot read another tenant's program", async () => {
    const id = await createProgram("ownerA", "Private A");
    const cross = await req("GET", `/v1/programs/${id}`, "ownerB");
    expect(cross.status).toBe(404);
  });
});

describe("Programming — deterministic preview", () => {
  it("the same request produces the same plan hash", async () => {
    const id = await createProgram("ownerA");
    await req("PUT", `/v1/programs/${id}/items`, "ownerA", { assetIds: trackIds });
    const p1 = await req("POST", `/v1/programs/${id}/preview`, "ownerA", previewBody);
    const p2 = await req("POST", `/v1/programs/${id}/preview`, "ownerA", previewBody);
    expect(p1.status).toBe(200);
    expect(p1.json.planHash).toBe(p2.json.planHash);
    expect(p1.json.items.map((i: { assetId: string }) => i.assetId)).toEqual(
      p2.json.items.map((i: { assetId: string }) => i.assetId),
    );
    expect(p1.json.items.length).toBeGreaterThan(0);
  });

  it("resolves the unit's local window to the correct UTC instant", async () => {
    const id = await createProgram("ownerA");
    await req("PUT", `/v1/programs/${id}/items`, "ownerA", { assetIds: trackIds });
    const p = await req("POST", `/v1/programs/${id}/preview`, "ownerA", previewBody);
    expect(p.json.windowStartUtc).toBe("2026-06-15T11:00:00.000Z");
  });

  it("rejects an invalid timezone", async () => {
    const id = await createProgram("ownerA");
    await req("PUT", `/v1/programs/${id}/items`, "ownerA", { assetIds: trackIds });
    const p = await req("POST", `/v1/programs/${id}/preview`, "ownerA", {
      ...previewBody,
      timezone: "Mars/Phobos",
    });
    expect(p.status).toBe(400);
  });
});

describe("Programming — immutable publish (ADR-06-03)", () => {
  it("publishes a version and re-publishing creates a new one without changing the old", async () => {
    const id = await createProgram("ownerA");
    await req("PUT", `/v1/programs/${id}/items`, "ownerA", { assetIds: trackIds.slice(0, 4) });
    const v1 = await req("POST", `/v1/programs/${id}/versions`, "ownerA");
    expect(v1.status).toBe(201);
    expect(v1.json.version).toBe(1);
    expect(v1.json.planHash).toBeTruthy();
    expect(v1.json.compilerVersion).toBeTruthy();
    expect(v1.json.publishedBy).toBeTruthy();

    // The program flips to published.
    const prog = await req("GET", `/v1/programs/${id}`, "ownerA");
    expect(prog.json.status).toBe("published");

    // Change config, publish again → version 2.
    await req("PUT", `/v1/programs/${id}/items`, "ownerA", { assetIds: trackIds });
    const v2 = await req("POST", `/v1/programs/${id}/versions`, "ownerA");
    expect(v2.json.version).toBe(2);

    // Version 1 is unchanged (immutable).
    const v1again = await req("GET", `/v1/programs/${id}/versions/${v1.json.id}`, "ownerA");
    expect(v1again.json.planHash).toBe(v1.json.planHash);
    expect(v1again.json.resolvedItems).toEqual(v1.json.resolvedItems);
  });

  it("refuses to publish a program with no ready content", async () => {
    const id = await createProgram("ownerA", "Empty");
    const r = await req("POST", `/v1/programs/${id}/versions`, "ownerA");
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("INSUFFICIENT_CATALOG");
  });
});

describe("Programming — assignment + audit", () => {
  it("a curator cannot assign to a scope but the owner can, and it is audited", async () => {
    const id = await createProgram("ownerA");
    await req("PUT", `/v1/programs/${id}/items`, "ownerA", { assetIds: trackIds.slice(0, 3) });

    const denied = await req("POST", `/v1/programs/${id}/assignments`, "curatorA", {
      targetType: "tenant",
      targetId: tenantA,
    });
    expect(denied.status).toBe(403);

    const ok = await req("POST", `/v1/programs/${id}/assignments`, "ownerA", {
      targetType: "tenant",
      targetId: tenantA,
    });
    expect(ok.status).toBe(201);
    expect(ok.json.targetType).toBe("tenant");

    // Publish → audited transactionally.
    await req("POST", `/v1/programs/${id}/versions`, "ownerA");
    const published = await withTenantContext(seedDb, tenantA, (tx) =>
      tx
        .select()
        .from(schema.auditLogEntries)
        .where(
          and(
            eq(schema.auditLogEntries.tenantId, tenantA),
            eq(schema.auditLogEntries.action, "programming.version.published"),
          ),
        ),
    );
    expect(published.length).toBeGreaterThan(0);
  });
});

describe("Programming — insufficient catalog preview (ADR-06-07)", () => {
  it("an empty program previews with a silence marker and warnings", async () => {
    const id = await createProgram("ownerA", "Silent");
    const p = await req("POST", `/v1/programs/${id}/preview`, "ownerA", previewBody);
    expect(p.status).toBe(200);
    expect(p.json.warnings.map((w: { code: string }) => w.code)).toContain("empty_program");
    expect(p.json.items.some((i: { source: string }) => i.source === "silence")).toBe(true);
  });
});

describe("Programming — content listing (GET items)", () => {
  it("returns ordered content with library metadata and is tenant-scoped", async () => {
    const id = await createProgram("ownerA");
    await req("PUT", `/v1/programs/${id}/items`, "ownerA", { assetIds: trackIds.slice(0, 3) });
    const items = await req("GET", `/v1/programs/${id}/items`, "ownerA");
    expect(items.status).toBe(200);
    expect(items.json).toHaveLength(3);
    expect(items.json.map((i: { assetId: string }) => i.assetId)).toEqual(trackIds.slice(0, 3));
    expect(items.json[0].position).toBe(0);
    expect(items.json[0].status).toBe("ready");
    expect(items.json[0].title).toBeTruthy();

    // Another tenant cannot read this program's items (no IDOR).
    const cross = await req("GET", `/v1/programs/${id}/items`, "ownerB");
    expect(cross.status).toBe(404);
  });
});

describe("Programming — published version surfacing", () => {
  it("is null while draft and the version number once published", async () => {
    const id = await createProgram("ownerA");
    await req("PUT", `/v1/programs/${id}/items`, "ownerA", { assetIds: trackIds.slice(0, 3) });
    const before = await req("GET", `/v1/programs/${id}`, "ownerA");
    expect(before.json.publishedVersion).toBeNull();
    await req("POST", `/v1/programs/${id}/versions`, "ownerA");
    const after = await req("GET", `/v1/programs/${id}`, "ownerA");
    expect(after.json.publishedVersion).toBe(1);
    expect(after.json.status).toBe("published");
  });
});

describe("Programming — intelligent engine policy (Sprint 07)", () => {
  it("round-trips the engine knobs and keeps preview deterministic + engine-aware", async () => {
    const put = await req("PUT", "/v1/programs/rotation-policy", "ownerA", {
      minTrackGapMinutes: 15,
      minArtistGapMinutes: 8,
      maxPlaysPerDay: 5,
      minCategoryGapMinutes: 25,
      fatigueWeightPenalty: 0.5,
      personalizationStrength: 0.4,
    });
    expect(put.status).toBe(200);
    expect(put.json.minCategoryGapMinutes).toBe(25);
    expect(put.json.fatigueWeightPenalty).toBe(0.5);
    expect(put.json.personalizationStrength).toBe(0.4);

    const got = await req("GET", "/v1/programs/rotation-policy", "ownerA");
    expect(got.status).toBe(200);
    expect(got.json.minCategoryGapMinutes).toBe(25);
    expect(got.json.fatigueWeightPenalty).toBe(0.5);
    expect(got.json.personalizationStrength).toBe(0.4);

    // Preview with the engine active: the plan carries the engine stats block
    // and stays deterministic (same input ⇒ same hash) — v2.0.0 compiler.
    const id = await createProgram("ownerA", "Engine Programa");
    await req("PUT", `/v1/programs/${id}/items`, "ownerA", { assetIds: trackIds });
    const body = {
      timezone: "America/Sao_Paulo",
      localDate: "2026-06-15",
      windowStartLocal: "08:00",
      windowEndLocal: "10:00",
    };
    const a = await req("POST", `/v1/programs/${id}/preview`, "ownerA", body);
    expect(a.status).toBe(200);
    expect(a.json.compilerVersion).toBe("2.0.0");
    expect(a.json.stats.engine).toEqual({
      fatigueApplied: false,
      personalizationApplied: false,
      categoriesApplied: false,
      avoidPairBlocks: 0,
    });
    const b = await req("POST", `/v1/programs/${id}/preview`, "ownerA", body);
    expect(b.json.planHash).toBe(a.json.planHash);
  });
});

describe("Programming — end-to-end flow (§26)", () => {
  it("create → content → rules → assign(unit) → preview → publish → immutability → history → audit → re-preview(same hash)", async () => {
    // A real scope: a brand + unit in tenant A (RLS-scoped seed).
    const brandId = uuidv7();
    const unitId = uuidv7();
    await withTenantContext(seedDb, tenantA, async (tx) => {
      await tx.insert(schema.brands).values({
        id: brandId,
        tenantId: tenantA,
        name: "Brand E2E",
        slug: `e2e-${brandId.slice(0, 8)}`,
      });
      await tx.insert(schema.units).values({
        id: unitId,
        tenantId: tenantA,
        brandId,
        countryCode: "BR",
        name: "Loja Centro",
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
      });
    });

    // Create the program and add content.
    const id = await createProgram("ownerA", "E2E Programa");
    await req("PUT", `/v1/programs/${id}/items`, "ownerA", { assetIds: trackIds });

    // Configure rotation rules (account-wide).
    const rules = await req("PUT", "/v1/programs/rotation-policy", "ownerA", {
      minTrackGapMinutes: 20,
      minArtistGapMinutes: 10,
    });
    expect(rules.status).toBe(200);

    // Assign to the unit scope.
    const assign = await req("POST", `/v1/programs/${id}/assignments`, "ownerA", {
      targetType: "unit",
      targetId: unitId,
    });
    expect(assign.status).toBe(201);

    // Preview for a local date; validate timezone resolution + a non-empty sequence.
    const body = {
      unitId,
      timezone: "America/Sao_Paulo",
      localDate: "2026-06-15",
      windowStartLocal: "08:00",
      windowEndLocal: "12:00",
    };
    const p1 = await req("POST", `/v1/programs/${id}/preview`, "ownerA", body);
    expect(p1.status).toBe(200);
    expect(p1.json.windowStartUtc).toBe("2026-06-15T11:00:00.000Z"); // SP is UTC−3
    expect(p1.json.items.length).toBeGreaterThan(0);
    expect(p1.json.totalDurationMs).toBeLessThanOrEqual(4 * 3_600_000);

    // Determinism: the same input yields the same hash and the same sequence.
    const p1b = await req("POST", `/v1/programs/${id}/preview`, "ownerA", body);
    expect(p1b.json.planHash).toBe(p1.json.planHash);
    expect(p1b.json.items.map((i: { assetId: string }) => i.assetId)).toEqual(
      p1.json.items.map((i: { assetId: string }) => i.assetId),
    );

    // Publish an immutable version.
    const v1 = await req("POST", `/v1/programs/${id}/versions`, "ownerA");
    expect(v1.status).toBe(201);
    expect(v1.json.version).toBe(1);
    const versionId = v1.json.id as string;
    const publishedHash = v1.json.planHash as string;

    // Immutability: change the draft and republish → v2, without altering v1.
    await req("PUT", `/v1/programs/${id}/items`, "ownerA", { assetIds: trackIds.slice(0, 3) });
    const v2 = await req("POST", `/v1/programs/${id}/versions`, "ownerA");
    expect(v2.json.version).toBe(2);
    const v1again = await req("GET", `/v1/programs/${id}/versions/${versionId}`, "ownerA");
    expect(v1again.json.planHash).toBe(publishedHash);
    expect(v1again.json.resolvedItems).toEqual(v1.json.resolvedItems);

    // History lists newest-first.
    const history = await req("GET", `/v1/programs/${id}/versions`, "ownerA");
    expect(history.json.items.map((v: { version: number }) => v.version)).toEqual([2, 1]);

    // Audit: assignment and both publishes recorded transactionally for this program.
    const audits = await withTenantContext(seedDb, tenantA, (tx) =>
      tx.select().from(schema.auditLogEntries).where(eq(schema.auditLogEntries.tenantId, tenantA)),
    );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("programming.assignment.created");
    expect(actions).toContain("programming.version.published");
  });
});
