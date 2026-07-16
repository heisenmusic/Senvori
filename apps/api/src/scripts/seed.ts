import "reflect-metadata";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { uuidv7 } from "uuidv7";
import * as schema from "../database/schema";
import { withTenantContext } from "../database/tenant-context";
import { createAuth } from "../modules/identity/auth.config";

/**
 * Local demo seed: a country, a tenant, an owner user (email + password), a
 * brand and a few units. Idempotent by tenant slug. Not for production.
 *
 *   DATABASE_URL=... BETTER_AUTH_SECRET=... BETTER_AUTH_URL=... \
 *     node dist/scripts/seed.js
 */
const FOUNDER = { email: "founder@senvori.dev", password: "senvori-demo-1234", name: "Founder" };
const TENANT_SLUG = "acme-retail";

const main = async (): Promise<void> => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const auth = createAuth(db, {
    baseUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:3001",
    secret: process.env.BETTER_AUTH_SECRET ?? "0123456789abcdef0123456789abcdef",
  });

  const existing = await db
    .select()
    .from(schema.tenants)
    .where(eq(schema.tenants.slug, TENANT_SLUG));
  if (existing[0]) {
    console.log(
      `Tenant '${TENANT_SLUG}' already seeded. Login: ${FOUNDER.email} / ${FOUNDER.password}`,
    );
    await pool.end();
    return;
  }

  // reference country (platform scope, no RLS)
  await db
    .insert(schema.countries)
    .values({ code: "BR", nameEn: "Brazil", currencies: ["BRL"] })
    .onConflictDoNothing();

  // owner user via Better Auth (proper password hashing)
  let userId: string;
  const signUp = await auth.api
    .signUpEmail({ body: { email: FOUNDER.email, password: FOUNDER.password, name: FOUNDER.name } })
    .catch(() => null);
  if (signUp?.user) {
    userId = signUp.user.id;
  } else {
    const [u] = await db.select().from(schema.users).where(eq(schema.users.email, FOUNDER.email));
    if (!u) throw new Error("could not create or find founder user");
    userId = u.id;
  }

  // tenant (organization) + owner membership
  const tenantId = uuidv7();
  await db.insert(schema.tenants).values({
    id: tenantId,
    name: "ACME Retail",
    slug: TENANT_SLUG,
    defaultLocale: "pt-BR",
    defaultTimezone: "America/Sao_Paulo",
    defaultCurrency: "BRL",
  });
  await db.insert(schema.memberships).values({
    id: uuidv7(),
    organizationId: tenantId,
    userId,
    role: "owner",
    status: "active",
  });
  await db
    .insert(schema.tenantCountries)
    .values({
      id: uuidv7(),
      tenantId,
      countryCode: "BR",
      defaultLocale: "pt-BR",
      billingCurrency: "BRL",
    })
    .onConflictDoNothing();

  // brand + units (tenant-scoped → RLS context)
  const brandId = uuidv7();
  await withTenantContext(db, tenantId, async (tx) => {
    await tx.insert(schema.brands).values({ id: brandId, tenantId, name: "ACME", slug: "acme" });
    const cities = [
      { name: "ACME Paulista", tz: "America/Sao_Paulo" },
      { name: "ACME Copacabana", tz: "America/Sao_Paulo" },
      { name: "ACME Madrid Gran Vía", tz: "Europe/Madrid" },
    ];
    for (const c of cities) {
      const unitId = uuidv7();
      await tx.insert(schema.units).values({
        id: unitId,
        tenantId,
        brandId,
        countryCode: "BR",
        name: c.name,
        timezone: c.tz,
        locale: "pt-BR",
      });
      await tx.insert(schema.zones).values({
        id: uuidv7(),
        tenantId,
        unitId,
        name: "Default",
        kind: "audio",
        isDefault: true,
      });
    }
  });

  console.log(`Seeded tenant '${TENANT_SLUG}'. Login: ${FOUNDER.email} / ${FOUNDER.password}`);
  await pool.end();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
