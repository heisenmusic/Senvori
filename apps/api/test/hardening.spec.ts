import { execSync } from "node:child_process";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client, Pool } from "pg";
import { uuidv7 } from "uuidv7";
import { Test } from "@nestjs/testing";
import { FastifyAdapter } from "@nestjs/platform-fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Compiled app (nest build runs first via the `test` script) so NestJS
// decorator metadata is present for the DI container.
import { AppModule } from "../dist/app.module.js";
import { withTenantContext } from "../dist/database/tenant-context.js";
import * as schema from "../dist/database/schema/index.js";

/**
 * ETAPA 9 — deep hardening suite. Runs against a REAL PostgreSQL with the app
 * connected as a non-owner, NOBYPASSRLS role, proving at runtime: multi-tenant
 * isolation under RLS, concurrent request isolation (AsyncLocalStorage),
 * hierarchical RBAC (tenant/country/brand/group/unit), transactional audit
 * atomicity, auth edges and API contract behavior. No mocks — RLS and authz are
 * exercised through the HTTP layer.
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
const brandX = uuidv7();
const brandY = uuidv7();
const brandB = uuidv7();
const groupG = uuidv7();
const uX_BR = uuidv7();
const uX_US = uuidv7();
const uY_BR = uuidv7();
const uB = uuidv7();

const cookies: Record<string, string> = {};

const req = async (
  method: string,
  url: string,
  who: string | null,
  body?: unknown,
): Promise<{ status: number; json: any }> => {
  const headers: Record<string, string> = {};
  // Only advertise a JSON body when there actually is one — Fastify rejects an
  // empty body sent with content-type: application/json (bodyless POST /archive).
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
  if (!body.user) throw new Error(`sign-up failed for ${email}: ${res.payload}`);
  return body.user.id;
};

const signIn = async (email: string, key: string): Promise<string> => {
  const res = await app.inject({
    method: "POST",
    url: "/v1/auth/sign-in/email",
    headers: { "content-type": "application/json" },
    payload: JSON.stringify({ email, password: PW }),
  });
  const raw = res.headers["set-cookie"] as string | string[] | undefined;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const cookie = list.map((c) => c.split(";")[0]).join("; ");
  cookies[key] = cookie;
  return cookie;
};

interface Assignment {
  role: string;
  scopeType: "tenant" | "country" | "brand" | "group" | "unit";
  scopeId: string;
}

/** Sign up a user, give them a membership, optional hierarchical grants, and sign in. */
const seedUser = async (
  key: string,
  tenantId: string,
  membershipRole: string,
  status: "active" | "suspended",
  assignments: Assignment[] = [],
): Promise<void> => {
  const email = `${key}@test.dev`;
  const userId = await signUp(email);
  const membershipId = uuidv7();
  await seedDb
    .insert(schema.memberships)
    .values({ id: membershipId, organizationId: tenantId, userId, role: membershipRole, status });
  if (assignments.length) {
    await withTenantContext(seedDb, tenantId, async (tx) => {
      for (const a of assignments) {
        await tx.insert(schema.roleAssignments).values({
          id: uuidv7(),
          tenantId,
          membershipId,
          role: a.role,
          scopeType: a.scopeType,
          scopeId: a.scopeId,
        });
      }
    });
  }
  await signIn(email, key);
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

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication(new FastifyAdapter()) as unknown as App;
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

  const unit = (id: string, brandId: string, country: string, name: string) => ({
    id,
    tenantId: tenantA,
    brandId,
    countryCode: country,
    name,
    timezone: "America/Sao_Paulo",
    locale: "pt-BR",
  });

  await withTenantContext(seedDb, tenantA, async (tx) => {
    await tx.insert(schema.brands).values([
      { id: brandX, tenantId: tenantA, name: "Brand X", slug: "brand-x" },
      { id: brandY, tenantId: tenantA, name: "Brand Y", slug: "brand-y" },
    ]);
    await tx
      .insert(schema.units)
      .values([
        unit(uX_BR, brandX, "BR", "X-BR"),
        unit(uX_US, brandX, "US", "X-US"),
        unit(uY_BR, brandY, "BR", "Y-BR"),
      ]);
    await tx.insert(schema.groups).values({ id: groupG, tenantId: tenantA, name: "Group G" });
    // uY_BR belongs to Group G — group-scoped grants cover it, others don't.
    await tx
      .insert(schema.groupMemberships)
      .values({ id: uuidv7(), tenantId: tenantA, groupId: groupG, unitId: uY_BR });
  });

  await withTenantContext(seedDb, tenantB, async (tx) => {
    await tx
      .insert(schema.brands)
      .values({ id: brandB, tenantId: tenantB, name: "Brand B", slug: "brand-b" });
    await tx.insert(schema.units).values({
      id: uB,
      tenantId: tenantB,
      brandId: brandB,
      countryCode: "BR",
      name: "B-Unit",
      timezone: "UTC",
      locale: "pt-BR",
    });
  });

  // Users: base membership + hierarchical grants. "analyst" membership grants
  // read-only at the tenant, so a scoped grant is the ONLY thing that can
  // authorize a write on a covered resource — isolating scope coverage.
  await seedUser("ownerA", tenantA, "owner", "active");
  await seedUser("mgrA", tenantA, "manager", "active");
  await seedUser("analystA", tenantA, "analyst", "active");
  await seedUser("countryMgr", tenantA, "analyst", "active", [
    { role: "manager", scopeType: "country", scopeId: "BR" },
  ]);
  await seedUser("brandMgr", tenantA, "analyst", "active", [
    { role: "manager", scopeType: "brand", scopeId: brandX },
  ]);
  await seedUser("groupMgr", tenantA, "analyst", "active", [
    { role: "manager", scopeType: "group", scopeId: groupG },
  ]);
  await seedUser("unitMgr", tenantA, "analyst", "active", [
    { role: "manager", scopeType: "unit", scopeId: uX_BR },
  ]);
  await seedUser("invalidMgr", tenantA, "analyst", "active", [
    { role: "not_a_real_role", scopeType: "tenant", scopeId: tenantA },
  ]);
  await seedUser("suspended", tenantA, "manager", "suspended");
  await seedUser("ownerB", tenantB, "owner", "active");

  // A user with a valid session but NO membership anywhere.
  await signUp("nomember@test.dev");
  await signIn("nomember@test.dev", "nomember");
}, 180_000);

afterAll(async () => {
  await appPool?.end();
  await app?.close();
});

const patchName = (unitId: string, who: string, name: string) =>
  req("PATCH", `/v1/units/${unitId}`, who, { name });

/* ------------------------------------------------ RLS & tenant isolation -- */

describe("RLS & concurrent tenant isolation", () => {
  it("6+7. the application role is non-owner and NOBYPASSRLS", async () => {
    const bypass = await appPool.query(
      "SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user",
    );
    expect(bypass.rows[0].rolbypassrls).toBe(false);
    const owner = await appPool.query("SELECT tableowner FROM pg_tables WHERE tablename = 'units'");
    expect(owner.rows[0].tableowner).not.toBe("senvori_app_test");
  });

  it("1. Tenant A cannot see Tenant B data (and vice versa)", async () => {
    const a = await req("GET", "/v1/units", "mgrA");
    const b = await req("GET", "/v1/units", "ownerB");
    expect(a.status).toBe(200);
    const aNames = a.json.items.map((u: { name: string }) => u.name);
    const bNames = b.json.items.map((u: { name: string }) => u.name);
    expect(aNames).toContain("X-BR");
    expect(aNames).not.toContain("B-Unit");
    expect(bNames).toEqual(["B-Unit"]);
  });

  it("4. concurrent A/B requests never leak context (AsyncLocalStorage)", async () => {
    const calls: Promise<{ who: string; names: string[] }>[] = [];
    for (let i = 0; i < 24; i++) {
      const who = i % 2 === 0 ? "mgrA" : "ownerB";
      calls.push(
        req("GET", "/v1/units", who).then((r) => ({
          who,
          names: r.json.items.map((u: { name: string }) => u.name),
        })),
      );
    }
    const results = await Promise.all(calls);
    for (const r of results) {
      if (r.who === "mgrA") {
        expect(r.names).toContain("X-BR");
        expect(r.names).not.toContain("B-Unit");
      } else {
        expect(r.names).toEqual(["B-Unit"]);
      }
    }
  });

  it("5. an errored request does not contaminate the next", async () => {
    const bad = await req("GET", `/v1/units/${uuidv7()}`, "ownerA"); // 404
    expect(bad.status).toBe(404);
    const good = await req("GET", "/v1/units", "ownerB");
    expect(good.json.items.map((u: { name: string }) => u.name)).toEqual(["B-Unit"]);
  });

  it("2. RLS blocks access without a tenant context", async () => {
    const read = await appPool.query("SELECT count(*)::int AS c FROM units");
    expect(read.rows[0].c).toBe(0);
    await expect(
      appPool.query("INSERT INTO brands (id, tenant_id, name, slug) VALUES ($1, $2, 'x', 'x')", [
        uuidv7(),
        tenantA,
      ]),
    ).rejects.toThrow();
  });
});

/* ---------------------------------------------------- RBAC hierarchical -- */

describe("RBAC hierarchical scopes (deny by default)", () => {
  it("13. owner grant covers every entity in the tenant", async () => {
    for (const u of [uX_BR, uX_US, uY_BR]) {
      expect((await patchName(u, "ownerA", "owner-edit")).status).toBe(200);
    }
  });

  it("8. tenant-scoped manager (membership) covers all tenant units", async () => {
    expect((await patchName(uX_US, "mgrA", "mgr-edit")).status).toBe(200);
  });

  it("9. country grant covers only that country", async () => {
    expect((await patchName(uX_BR, "countryMgr", "c1")).status).toBe(200); // BR
    expect((await patchName(uY_BR, "countryMgr", "c2")).status).toBe(200); // BR
    expect((await patchName(uX_US, "countryMgr", "c3")).status).toBe(403); // US
  });

  it("10. brand grant does not cover another brand", async () => {
    expect((await patchName(uX_BR, "brandMgr", "b1")).status).toBe(200); // brand X
    expect((await patchName(uX_US, "brandMgr", "b2")).status).toBe(200); // brand X
    expect((await patchName(uY_BR, "brandMgr", "b3")).status).toBe(403); // brand Y
  });

  it("11. group grant covers only descendant units", async () => {
    expect((await patchName(uY_BR, "groupMgr", "g1")).status).toBe(200); // in Group G
    expect((await patchName(uX_BR, "groupMgr", "g2")).status).toBe(403); // not in Group G
  });

  it("12+14. unit grant covers only that unit; action wildcard does not widen scope", async () => {
    expect((await patchName(uX_BR, "unitMgr", "u1")).status).toBe(200);
    expect((await patchName(uX_US, "unitMgr", "u2")).status).toBe(403);
  });

  it("15. analyst (viewer) cannot write anywhere", async () => {
    expect((await patchName(uX_BR, "analystA", "hack")).status).toBe(403);
  });

  it("8b. an invalid/unknown role grants nothing", async () => {
    expect((await patchName(uX_BR, "invalidMgr", "hack")).status).toBe(403);
  });

  it("7. suspended membership is not authorized", async () => {
    const r = await patchName(uX_BR, "suspended", "hack");
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("NO_ACTIVE_MEMBERSHIP");
  });

  it("6. Tenant A manager can never reach a Tenant B unit", async () => {
    const before = await req("GET", `/v1/units/${uB}`, "ownerB");
    expect(before.status).toBe(200);
    const cross = await patchName(uB, "mgrA", "cross-tenant"); // A acting on B's unit
    expect(cross.status).toBe(404); // RLS hides it — never a silent write
    const after = await req("GET", `/v1/units/${uB}`, "ownerB");
    expect(after.json.name).toBe(before.json.name);
  });
});

/* ------------------------------------------------------ transactional audit -- */

describe("Transactional audit", () => {
  it("16+18. a mutation writes an atomic audit entry with real before/after", async () => {
    const cur = await req("GET", `/v1/units/${uY_BR}`, "ownerA");
    const prev = cur.json.name;
    const upd = await patchName(uY_BR, "ownerA", "audited-name");
    expect(upd.status).toBe(200);

    const logs = await req("GET", "/v1/audit-logs?limit=100", "ownerA");
    const entry = logs.json.find(
      (e: { action: string; resourceId: string }) =>
        e.action === "tenancy.unit.updated" && e.resourceId === uY_BR,
    );
    expect(entry).toBeTruthy();
    expect(entry.changes.after.name).toBe("audited-name");
    expect(entry.changes.before.name).toBe(prev);
    expect(entry.changes.before.name).not.toBe(entry.changes.after.name);
  });

  it("17. an audit failure rolls the mutation back (atomicity)", async () => {
    const cur = await req("GET", `/v1/units/${uX_BR}`, "ownerA");
    const stableName = cur.json.name;

    const owner = new Client({ connectionString: OWNER_TEST });
    await owner.connect();
    await owner.query("REVOKE INSERT ON audit_log_entries FROM senvori_app_test");
    try {
      const res = await patchName(uX_BR, "ownerA", "should-not-persist");
      expect(res.status).toBeGreaterThanOrEqual(500); // audit insert denied → tx aborts
      const after = await req("GET", `/v1/units/${uX_BR}`, "ownerA");
      expect(after.json.name).toBe(stableName); // mutation rolled back, no orphan
    } finally {
      await owner.query("GRANT INSERT ON audit_log_entries TO senvori_app_test");
      await owner.end();
    }
  });

  it("19. audit entries never persist sensitive fields (no passwords/secrets)", async () => {
    const logs = await req("GET", "/v1/audit-logs?limit=200", "ownerA");
    const blob = JSON.stringify(logs.json).toLowerCase();
    expect(blob).not.toContain("password");
    expect(blob).not.toContain("secret");
  });
});

/* ------------------------------------------------------------------ auth -- */

describe("Auth edges", () => {
  it("20. a protected route without a session is 401", async () => {
    expect((await req("GET", "/v1/units", null)).status).toBe(401);
  });

  it("21. an invalid session cookie is 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/units",
      headers: { cookie: "better-auth.session_token=deadbeef.garbage" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("22. after logout the session no longer authorizes", async () => {
    const email = "logout-me@test.dev";
    await signUp(email);
    const cookie = await signIn(email, "logoutUser");
    await app.inject({
      method: "POST",
      url: "/v1/auth/sign-out",
      headers: { cookie, "content-type": "application/json" },
      payload: "{}",
    });
    const after = await app.inject({ method: "GET", url: "/v1/units", headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it("24. a valid session with no membership is denied (403)", async () => {
    const r = await req("GET", "/v1/units", "nomember");
    expect(r.status).toBe(403);
    expect(r.json.code).toBe("NO_ACTIVE_MEMBERSHIP");
  });
});

/* ------------------------------------------------------------------- API -- */

describe("API contract", () => {
  it("25. an invalid payload is rejected with a standardized 400", async () => {
    const r = await req("POST", "/v1/units", "ownerA", { name: "no-brand" });
    expect(r.status).toBe(400);
    expect(r.json.code).toBe("VALIDATION_FAILED");
    expect(Array.isArray(r.json.issues)).toBe(true);
  });

  it("26. list pagination returns a cursor and advances", async () => {
    // seed enough units to page through
    for (let i = 0; i < 3; i++) {
      const r = await req("POST", "/v1/units", "ownerA", {
        brandId: brandX,
        countryCode: "BR",
        name: `Pag ${i}`,
        timezone: "America/Sao_Paulo",
        locale: "pt-BR",
      });
      expect(r.status).toBe(201);
    }
    const page1 = await req("GET", "/v1/units?limit=2", "ownerA");
    expect(page1.json.items).toHaveLength(2);
    expect(page1.json.nextCursor).toBeTruthy();
    const page2 = await req("GET", `/v1/units?limit=2&cursor=${page1.json.nextCursor}`, "ownerA");
    expect(page2.json.items.length).toBeGreaterThan(0);
    const firstIds = page1.json.items.map((u: { id: string }) => u.id);
    const secondIds = page2.json.items.map((u: { id: string }) => u.id);
    expect(secondIds.some((id: string) => firstIds.includes(id))).toBe(false);
  });

  it("27. filters narrow the result set", async () => {
    const us = await req("GET", "/v1/units?countryCode=US", "ownerA");
    expect(us.json.items.every((u: { countryCode: string }) => u.countryCode === "US")).toBe(true);
    const byBrand = await req("GET", `/v1/units?brandId=${brandY}`, "ownerA");
    expect(byBrand.json.items.every((u: { brandId: string }) => u.brandId === brandY)).toBe(true);
  });

  it("28+29. soft delete hides the unit from lists and returns 404 on direct access", async () => {
    const created = await req("POST", "/v1/units", "ownerA", {
      brandId: brandX,
      countryCode: "BR",
      name: "To Archive",
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
    });
    const id = created.json.id;
    expect((await req("POST", `/v1/units/${id}/archive`, "ownerA")).status).toBe(204);
    const list = await req("GET", "/v1/units?limit=100", "ownerA");
    expect(list.json.items.some((u: { id: string }) => u.id === id)).toBe(false);
    expect((await req("GET", `/v1/units/${id}`, "ownerA")).status).toBe(404);
  });

  it("30. errors use a standardized shape with a code", async () => {
    const r = await req("GET", `/v1/units/${uuidv7()}`, "ownerA");
    expect(r.status).toBe(404);
    expect(r.json.code).toBe("UNIT_NOT_FOUND");
  });
});
