import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { uuidv7 } from "uuidv7";
import type { DrizzleDb } from "../../database/database.module";
import * as schema from "../../database/schema";

/**
 * Better Auth (D11): self-hosted, organization plugin as the tenancy backbone.
 * organization → tenants, member → memberships, invitation → invitations.
 * Devices NEVER authenticate here — device tokens belong to the Fleet domain.
 */
export const createAuth = (
  db: DrizzleDb,
  env: { baseUrl: string; secret: string; trustedOrigins?: string[] },
) =>
  betterAuth({
    baseURL: env.baseUrl,
    basePath: "/v1/auth",
    secret: env.secret,
    trustedOrigins: env.trustedOrigins ?? [],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
        organization: schema.tenants,
        member: schema.memberships,
        invitation: schema.invitations,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        locale: { type: "string", required: false },
        status: { type: "string", required: false, defaultValue: "active", input: false },
      },
    },
    advanced: {
      database: {
        // UUIDv7 everywhere (Core Domains §0.1)
        generateId: () => uuidv7(),
      },
    },
    plugins: [
      organization({
        // Invitations expire in 7 days (Core Domains §1.9)
        invitationExpiresIn: 60 * 60 * 24 * 7,
      }),
    ],
  });

export type Auth = ReturnType<typeof createAuth>;
export const AUTH = Symbol("AUTH");
