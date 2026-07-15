import { execSync } from "node:child_process";
import { and, eq } from "drizzle-orm";
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
let unitAId = "";
let brandAId = "";
const cookies: Record<string, string> = {};

const req = async (
  method: string,
  url: string,
  who: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> => {
  const res = await app.inject({
    method,
    url,
    headers: { cookie: cookies[who] ?? "", "content-type": "application/json" },
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

beforeAll(async () => {
  // 1. provision the test database + a non-owner, no-BYPASSRLS application role
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

  // 2. migrate as the owner
  execSync("pnpm exec drizzle-kit migrate", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: OWNER_TEST },
    stdio: "ignore",
  });

  // 3. grant the app role runtime privileges (no ownership)
  const owner = new Client({ connectionString: OWNER_TEST });
  await owner.connect();
  await owner.query("GRANT USAGE ON SCHEMA public TO senvori_app_test");
  await owner.query(
    "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO senvori_app_test",
  );
  await owner.query("GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO senvori_app_test");
  await owner.end();

  // 4. boot the app as the application role
  process.env.DATABASE_URL = APP_TEST;
  process.env.BETTER_AUTH_SECRET = "0123456789abcdef0123456789abcdef";
  process.env.BETTER_AUTH_URL = "http://localhost:3001";
  process.env.DASHBOARD_URL = "http://localhost:3000";

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication(new FastifyAdapter()) as unknown as App;
  app.setGlobalPrefix("v1");
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  // 5. seed data (app role → RLS applies; use tenant context for scoped tables)
  appPool = new Pool({ connectionString: APP_TEST });
  seedDb = drizzle(appPool, { schema });

  await seedDb
    .insert(schema.countries)
    .values({ code: "BR", nameEn: "Brazil", currencies: ["BRL"] })
    .onConflictDoNothing();

  const founderId = await signUp("founder@a.com");
  const managerId = await signUp("manager@a.com");
  const analystId = await signUp("analyst@a.com");
  const ownerBId = await signUp("owner@b.com");

  await seedDb.insert(schema.tenants).values([
    {
      id: tenantA,
      name: "Tenant A",
      slug: `a-${tenantA.slice(0, 8)}`,
      defaultTimezone: "America/Sao_Paulo",
    },
    {
      id: tenantB,
      name: "Tenant B",
      slug: `b-${tenantB.slice(0, 8)}`,
      defaultTimezone: "America/Sao_Paulo",
    },
  ]);
  await seedDb.insert(schema.memberships).values([
    { id: uuidv7(), organizationId: tenantA, userId: founderId, role: "owner", status: "active" },
    { id: uuidv7(), organizationId: tenantA, userId: managerId, role: "manager", status: "active" },
    { id: uuidv7(), organizationId: tenantA, userId: analystId, role: "analyst", status: "active" },
    { id: uuidv7(), organizationId: tenantB, userId: ownerBId, role: "owner", status: "active" },
  ]);

  brandAId = uuidv7();
  await withTenantContext(seedDb, tenantA, async (tx) => {
    await tx
      .insert(schema.brands)
      .values({ id: brandAId, tenantId: tenantA, name: "Brand A", slug: "brand-a" });
    unitAId = uuidv7();
    await tx.insert(schema.units).values({
      id: unitAId,
      tenantId: tenantA,
      brandId: brandAId,
      countryCode: "BR",
      name: "A-Unit",
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
    });
  });
  await withTenantContext(seedDb, tenantB, async (tx) => {
    const brandBId = uuidv7();
    await tx
      .insert(schema.brands)
      .values({ id: brandBId, tenantId: tenantB, name: "Brand B", slug: "brand-b" });
    await tx.insert(schema.units).values({
      id: uuidv7(),
      tenantId: tenantB,
      brandId: brandBId,
      countryCode: "BR",
      name: "B-Unit",
      timezone: "America/Sao_Paulo",
      locale: "pt-BR",
    });
  });

  await signIn("founder@a.com", "founderA");
  await signIn("manager@a.com", "managerA");
  await signIn("analyst@a.com", "analystA");
  await signIn("owner@b.com", "ownerB");
}, 180_000);

afterAll(async () => {
  await appPool?.end();
  await app?.close();
});

describe("Identity + Tenancy runtime foundation", () => {
  it("1. Tenant A user cannot see Tenant B data (multi-tenant + RLS)", async () => {
    const a = await req("GET", "/v1/units", "founderA");
    const b = await req("GET", "/v1/units", "ownerB");
    expect(a.status).toBe(200);
    const aNames = (a.json as { items: { name: string }[] }).items.map((u) => u.name);
    const bNames = (b.json as { items: { name: string }[] }).items.map((u) => u.name);
    expect(aNames).toContain("A-Unit");
    expect(aNames).not.toContain("B-Unit");
    expect(bNames).toContain("B-Unit");
    expect(bNames).not.toContain("A-Unit");
  });

  it("2. Viewer role (analyst) cannot execute a Manager action", async () => {
    const res = await req("PATCH", `/v1/units/${unitAId}`, "analystA", { name: "hacked" });
    expect(res.status).toBe(403);
  });

  it("3. Manager role executes the permitted action", async () => {
    const res = await req("PATCH", `/v1/units/${unitAId}`, "managerA", { name: "Manager Renamed" });
    expect(res.status).toBe(200);
    expect((res.json as { name: string }).name).toBe("Manager Renamed");
  });

  it("4. Audit log entry is created for the mutation", async () => {
    const res = await req("GET", "/v1/audit-logs?limit=50", "founderA");
    expect(res.status).toBe(200);
    const actions = (res.json as { action: string; resourceId: string | null }[]).filter(
      (e) => e.action === "tenancy.unit.updated" && e.resourceId === unitAId,
    );
    expect(actions.length).toBeGreaterThan(0);
  });

  it("5. Tenant context is applied (only the tenant's rows are visible)", async () => {
    const rowsA = await withTenantContext(seedDb, tenantA, (tx) => tx.select().from(schema.units));
    expect(rowsA.length).toBeGreaterThan(0);
    expect(rowsA.every((u: { tenantId: string }) => u.tenantId === tenantA)).toBe(true);
    // the A-tenant unit is present (asserted by stable id — its name may have
    // been changed by the manager-rename test earlier in the sequence)
    expect(rowsA.some((u: { id: string }) => u.id === unitAId)).toBe(true);
    expect(rowsA.some((u: { name: string }) => u.name === "B-Unit")).toBe(false);
  });

  it("6. RLS blocks access without a tenant context", async () => {
    // reads return nothing when app.tenant_id is unset
    const read = await appPool.query("SELECT count(*)::int AS c FROM units");
    expect(read.rows[0].c).toBe(0);
    // writes are rejected by the policy WITH CHECK
    await expect(
      appPool.query("INSERT INTO brands (id, tenant_id, name, slug) VALUES ($1, $2, 'x', 'x')", [
        uuidv7(),
        tenantA,
      ]),
    ).rejects.toThrow();
  });
});

// silence unused import in some TS configs
void and;
void eq;
