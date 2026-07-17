import { execSync } from "node:child_process";
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

/**
 * Scheduling Runtime — integration suite (Sprint 08 · §29). Real PostgreSQL on
 * the non-owner NOBYPASSRLS app role. Covers assignment CRUD, transactional
 * audit, RBAC deny-by-default, tenant isolation, deterministic resolution and
 * the effective plan (base hash from a published version).
 */

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
  const userId = await signUp(`${key}@sched.dev`);
  await seedDb
    .insert(schema.memberships)
    .values({ id: uuidv7(), organizationId: tenantId, userId, role, status: "active" });
  await signIn(`${key}@sched.dev`, key);
};

const seedTrack = async (tenantId: string, artist: string): Promise<string> => {
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
      durationMs: 180_000,
    });
    await tx.insert(schema.tracks).values({ assetId: id, tenantId, artist });
  });
  return id;
};

let unitId: string;
let programId: string;
let publishedVersionId: string;
let publishedPlanHash: string;

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

  await seedUser("ownerA", tenantA, "owner"); // manages programs
  await seedUser("managerA", tenantA, "manager"); // scheduling:* — manages schedules
  await seedUser("analystA", tenantA, "analyst"); // read-only
  await seedUser("ownerB", tenantB, "owner"); // other tenant

  // A real unit in tenant A.
  const brandId = uuidv7();
  unitId = uuidv7();
  await withTenantContext(seedDb, tenantA, async (tx) => {
    await tx.insert(schema.brands).values({
      id: brandId,
      tenantId: tenantA,
      name: "Brand S8",
      slug: `s8-${brandId.slice(0, 8)}`,
    });
    await tx.insert(schema.units).values({
      id: unitId,
      tenantId: tenantA,
      brandId,
      countryCode: "BR",
      name: "Loja S8",
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
    });
  });

  // A program with ready tracks, published → gives us a base plan hash.
  const create = await req("POST", "/v1/programs", "ownerA", {
    name: "S8 Programa",
    type: "manual",
  });
  programId = create.json.id as string;
  const trackIds = [await seedTrack(tenantA, "Alpha"), await seedTrack(tenantA, "Bravo")];
  await req("PUT", `/v1/programs/${programId}/items`, "ownerA", { assetIds: trackIds });
  const pub = await req("POST", `/v1/programs/${programId}/versions`, "ownerA");
  publishedVersionId = pub.json.id as string;
  publishedPlanHash = pub.json.planHash as string;
}, 180_000);

afterAll(async () => {
  await appPool?.end();
  await app?.close();
});

const assignment = (over: Record<string, unknown> = {}) => ({
  programId,
  targetType: "unit",
  targetId: unitId,
  priority: 0,
  daysOfWeek: [],
  startTimeLocal: "08:00",
  endTimeLocal: "18:00",
  active: true,
  ...over,
});

const resolveBody = (over: Record<string, unknown> = {}) => ({
  unitId,
  syncGroupId: null,
  groupIds: [],
  timezone: "America/Sao_Paulo",
  localDate: "2026-06-15", // Monday
  localTime: "10:00",
  ...over,
});

describe("Scheduling — assignment CRUD + audit", () => {
  it("a manager creates, lists, updates and archives an assignment; all audited", async () => {
    const create = await req("POST", "/v1/scheduling/assignments", "managerA", assignment());
    expect(create.status).toBe(201);
    const id = create.json.id as string;

    const list = await req("GET", "/v1/scheduling/assignments", "managerA");
    expect(list.json.items.map((a: { id: string }) => a.id)).toContain(id);

    const patch = await req("PATCH", `/v1/scheduling/assignments/${id}`, "managerA", {
      priority: 7,
    });
    expect(patch.status).toBe(200);
    expect(patch.json.priority).toBe(7);

    const del = await req("DELETE", `/v1/scheduling/assignments/${id}`, "managerA");
    expect(del.status).toBe(204);

    const audits = await withTenantContext(seedDb, tenantA, (tx) =>
      tx.select().from(schema.auditLogEntries).where(eq(schema.auditLogEntries.tenantId, tenantA)),
    );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("scheduling.assignment.created");
    expect(actions).toContain("scheduling.assignment.updated");
    expect(actions).toContain("scheduling.assignment.archived");
  });

  it("rejects an assignment for an unknown/foreign program (400)", async () => {
    const res = await req(
      "POST",
      "/v1/scheduling/assignments",
      "managerA",
      assignment({ programId: uuidv7() }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects a cross-midnight window at validation (400)", async () => {
    const res = await req(
      "POST",
      "/v1/scheduling/assignments",
      "managerA",
      assignment({ startTimeLocal: "22:00", endTimeLocal: "02:00" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("Scheduling — RBAC & tenant isolation", () => {
  it("a read-only analyst cannot manage assignments (403)", async () => {
    const res = await req("POST", "/v1/scheduling/assignments", "analystA", assignment());
    expect(res.status).toBe(403);
  });

  it("another tenant never sees this tenant's assignments", async () => {
    const create = await req("POST", "/v1/scheduling/assignments", "managerA", assignment());
    expect(create.status).toBe(201);
    const listB = await req("GET", "/v1/scheduling/assignments", "ownerB");
    expect(listB.json.items).toHaveLength(0);
    await req("DELETE", `/v1/scheduling/assignments/${create.json.id}`, "managerA");
  });
});

describe("Scheduling — resolution & effective plan", () => {
  it("resolves the unit assignment and is deterministic", async () => {
    const create = await req("POST", "/v1/scheduling/assignments", "managerA", assignment());
    const a = await req("POST", "/v1/scheduling/resolve", "managerA", resolveBody());
    expect(a.status).toBe(200);
    expect(a.json.selectedProgramId).toBe(programId);
    expect(a.json.reasonCode).toBe("unit_assignment_selected");
    const b = await req("POST", "/v1/scheduling/resolve", "managerA", resolveBody());
    expect(b.json).toEqual(a.json);
    await req("DELETE", `/v1/scheduling/assignments/${create.json.id}`, "managerA");
  });

  it("returns no_assignment outside the time window", async () => {
    const create = await req("POST", "/v1/scheduling/assignments", "managerA", assignment());
    const res = await req(
      "POST",
      "/v1/scheduling/resolve",
      "managerA",
      resolveBody({ localTime: "20:00" }),
    );
    expect(res.json.selectedProgramId).toBeNull();
    expect(res.json.reasonCode).toBe("no_assignment");
    await req("DELETE", `/v1/scheduling/assignments/${create.json.id}`, "managerA");
  });

  it("the effective plan carries the published version's base hash + effective hash", async () => {
    const create = await req(
      "POST",
      "/v1/scheduling/assignments",
      "managerA",
      assignment({ programVersionId: publishedVersionId }),
    );
    const plan = await req("POST", "/v1/scheduling/effective-plan", "managerA", resolveBody());
    expect(plan.status).toBe(200);
    expect(plan.json.basePlanHash).toBe(publishedPlanHash);
    expect(plan.json.effectivePlanHash).toBeTruthy();
    expect(plan.json.overlays).toEqual([]);
    // A second call is byte-identical (determinism).
    const again = await req("POST", "/v1/scheduling/effective-plan", "managerA", resolveBody());
    expect(again.json.effectivePlanHash).toBe(plan.json.effectivePlanHash);
    await req("DELETE", `/v1/scheduling/assignments/${create.json.id}`, "managerA");
  });
});

const localEvent = (over: Record<string, unknown> = {}) => ({
  assetId: null,
  targetType: "unit",
  targetId: unitId,
  kind: "insert",
  category: "local_event",
  priority: 0,
  daysOfWeek: [],
  startTimeLocal: "08:00",
  endTimeLocal: "18:00",
  startOffsetMs: 60_000,
  durationMs: 30_000,
  active: true,
  ...over,
});

describe("Scheduling — local events", () => {
  it("a manager creates, lists, updates and archives a local event; all audited", async () => {
    const create = await req("POST", "/v1/scheduling/local-events", "managerA", localEvent());
    expect(create.status).toBe(201);
    const id = create.json.id as string;

    const list = await req("GET", "/v1/scheduling/local-events", "managerA");
    expect(list.json.items.map((e: { id: string }) => e.id)).toContain(id);

    const patch = await req("PATCH", `/v1/scheduling/local-events/${id}`, "managerA", {
      priority: 5,
    });
    expect(patch.status).toBe(200);
    expect(patch.json.priority).toBe(5);

    const del = await req("DELETE", `/v1/scheduling/local-events/${id}`, "managerA");
    expect(del.status).toBe(204);

    const audits = await withTenantContext(seedDb, tenantA, (tx) =>
      tx.select().from(schema.auditLogEntries).where(eq(schema.auditLogEntries.tenantId, tenantA)),
    );
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("scheduling.local_event.created");
    expect(actions).toContain("scheduling.local_event.updated");
    expect(actions).toContain("scheduling.local_event.archived");
  });

  it("rejects a local event referencing an unknown/foreign asset (400)", async () => {
    const res = await req(
      "POST",
      "/v1/scheduling/local-events",
      "managerA",
      localEvent({ assetId: uuidv7() }),
    );
    expect(res.status).toBe(400);
  });

  it("a read-only analyst cannot manage local events (403)", async () => {
    const res = await req("POST", "/v1/scheduling/local-events", "analystA", localEvent());
    expect(res.status).toBe(403);
  });

  it("an in-effect local event overlays the effective plan and shifts the hash", async () => {
    const asn = await req(
      "POST",
      "/v1/scheduling/assignments",
      "managerA",
      assignment({ programVersionId: publishedVersionId }),
    );
    const bare = await req("POST", "/v1/scheduling/effective-plan", "managerA", resolveBody());
    expect(bare.json.overlays).toHaveLength(0);

    const ev = await req("POST", "/v1/scheduling/local-events", "managerA", localEvent());
    const withEvent = await req("POST", "/v1/scheduling/effective-plan", "managerA", resolveBody());
    expect(withEvent.json.overlays).toHaveLength(1);
    expect(withEvent.json.overlays[0].sourceReference).toBe(`local_event:${ev.json.id}`);
    // Same base plan, but the overlay changes the effective hash.
    expect(withEvent.json.basePlanHash).toBe(bare.json.basePlanHash);
    expect(withEvent.json.effectivePlanHash).not.toBe(bare.json.effectivePlanHash);
    // Deterministic across calls.
    const again = await req("POST", "/v1/scheduling/effective-plan", "managerA", resolveBody());
    expect(again.json.effectivePlanHash).toBe(withEvent.json.effectivePlanHash);

    await req("DELETE", `/v1/scheduling/local-events/${ev.json.id}`, "managerA");
    await req("DELETE", `/v1/scheduling/assignments/${asn.json.id}`, "managerA");
  });

  it("an emergency event marks the effective plan emergencyActive", async () => {
    const asn = await req(
      "POST",
      "/v1/scheduling/assignments",
      "managerA",
      assignment({ programVersionId: publishedVersionId }),
    );
    const ev = await req(
      "POST",
      "/v1/scheduling/local-events",
      "managerA",
      localEvent({ category: "emergency", kind: "interrupt", durationMs: 120_000 }),
    );
    const plan = await req("POST", "/v1/scheduling/effective-plan", "managerA", resolveBody());
    expect(plan.json.emergencyActive).toBe(true);
    expect(plan.json.overlays[0].reasonCode).toBe("emergency_override");

    await req("DELETE", `/v1/scheduling/local-events/${ev.json.id}`, "managerA");
    await req("DELETE", `/v1/scheduling/assignments/${asn.json.id}`, "managerA");
  });

  it("does not leak local events across tenants", async () => {
    const create = await req("POST", "/v1/scheduling/local-events", "managerA", localEvent());
    const listB = await req("GET", "/v1/scheduling/local-events", "ownerB");
    expect(listB.json.items).toHaveLength(0);
    await req("DELETE", `/v1/scheduling/local-events/${create.json.id}`, "managerA");
  });
});
