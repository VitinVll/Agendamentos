import { boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { services } from "./catalog";
import { appointments } from "./scheduling";

const ts = (n: string) => timestamp(n, { withTimezone: true }).notNull().defaultNow();

export const subscriptionStatus = pgEnum("subscription_status", ["active", "awaiting_payment", "past_due", "cancelled", "suspended"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "approved", "rejected", "refunded", "cancelled"]);

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    priceCents: integer("price_cents").notNull(),
    cycleDays: integer("cycle_days").notNull().default(30),
    benefits: text("benefits").array().notNull().default(sql`'{}'::text[]`),
    discountPercent: integer("discount_percent").notNull().default(0),
    priorityBooking: boolean("priority_booking").notNull().default(false),
    highlighted: boolean("highlighted").notNull().default(false),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    check("plan_price", sql`${t.priceCents} >= 0`),
    check("plan_discount", sql`${t.discountPercent} between 0 and 100`),
    check("plan_cycle", sql`${t.cycleDays} > 0`),
  ],
);

// Quantos créditos de cada serviço o plano concede por ciclo.
export const planCreditRules = pgTable(
  "plan_credit_rules",
  {
    planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
  },
  (t) => [uniqueIndex("pcr_uq").on(t.planId, t.serviceId), check("pcr_qty", sql`${t.quantity} > 0`)],
);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
    status: subscriptionStatus("status").notNull().default("awaiting_payment"),
    priceCentsContracted: integer("price_cents_contracted").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    externalId: text("external_id"), // id da assinatura no Mercado Pago
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    // No máximo uma assinatura "viva" por cliente.
    uniqueIndex("subs_one_live_per_user").on(t.userId).where(sql`${t.status} in ('active','awaiting_payment','past_due','suspended')`),
    index("subs_status_idx").on(t.status),
  ],
);

export const subscriptionCredits = pgTable(
  "subscription_credits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    subscriptionId: uuid("subscription_id").notNull().references(() => subscriptions.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
    cycleStart: timestamp("cycle_start", { withTimezone: true }).notNull(),
    cycleEnd: timestamp("cycle_end", { withTimezone: true }).notNull(),
    granted: integer("granted").notNull(),
    used: integer("used").notNull().default(0),
  },
  (t) => [
    uniqueIndex("sc_cycle_uq").on(t.subscriptionId, t.serviceId, t.cycleStart),
    // O banco recusa usar mais crédito do que existe, mesmo sob concorrência.
    check("sc_bounds", sql`${t.used} >= 0 and ${t.used} <= ${t.granted}`),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "restrict" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "restrict" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "restrict" }),
    amountCents: integer("amount_cents").notNull(),
    refundedCents: integer("refunded_cents").notNull().default(0),
    status: paymentStatus("status").notNull().default("pending"),
    method: text("method"), // pix | card | cash | ...
    provider: text("provider").notNull().default("manual"), // mercadopago | manual
    providerPaymentId: text("provider_payment_id"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("pay_provider_uq").on(t.provider, t.providerPaymentId),
    check("pay_amount", sql`${t.amountCents} >= 0 and ${t.refundedCents} >= 0 and ${t.refundedCents} <= ${t.amountCents}`),
    index("pay_status_paid_idx").on(t.status, t.paidAt),
  ],
);

// Idempotência de webhooks: o mesmo evento nunca é processado duas vezes.
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    eventId: text("event_id").notNull(),
    payload: jsonb("payload").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex("we_uq").on(t.provider, t.eventId)],
);
