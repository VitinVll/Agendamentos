import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

/**
 * Fábrica recebe o `db` para poder ser testada com PGlite.
 * `role` NUNCA é aceito do cliente (input: false): promoção a admin só via `npm run seed:admin`.
 */
export function createAuth(db: PgDatabase<PgQueryResultHKT, typeof schema>, opts: { secret: string; baseURL: string }) {
  return betterAuth({
    secret: opts.secret,
    baseURL: opts.baseURL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.users, session: schema.sessions, account: schema.accounts, verification: schema.verifications },
    }),
    emailAndPassword: { enabled: true, minPasswordLength: 8, maxPasswordLength: 128 },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "customer", input: false },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  });
}
