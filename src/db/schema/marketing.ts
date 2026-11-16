import { boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { services } from "./catalog";
import { plans } from "./billing";
import { appointments } from "./scheduling";

const ts = (n: string) => timestamp(n, { withTimezone: true }).notNull().defaultNow();

export const couponKind = pgEnum("coupon_kind", ["percent", "fixed"]);
export const loyaltyKind = pgEnum("loyalty_kind", ["earn", "redeem", "adjust", "referral", "expire"]);
export const referralStatus = pgEnum("referral_status", ["pending", "rewarded", "rejected"]);
export const reviewStatus = pgEnum("review_status", ["pending", "approved", "hidden"]);

export const coupons = pgTable(
  "coupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(), // sempre guardado em MAIÚSCULAS
    description: text("description"),
    kind: couponKind("kind").notNull(),
    value: integer("value").notNull(), // % (1-100) ou centavos
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    maxUses: integer("max_uses"),
    maxUsesPerUser: integer("max_uses_per_user").notNull().default(1),
    minAmountCents: integer("min_amount_cents").notNull().default(0),
    firstPurchaseOnly: boolean("first_purchase_only").notNull().default(false),
    subscribersOnly: boolean("subscribers_only").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("coupon_code_uq").on(t.code),
    check("coupon_code_upper", sql`${t.code} = upper(${t.code})`),
    check("coupon_value", sql`${t.value} > 0 and (${t.kind} <> 'percent' or ${t.value} <= 100)`),
  ],
);

export const couponServices = pgTable(
  "coupon_services",
  { couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }), serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }) },
  (t) => [primaryKey({ columns: [t.couponId, t.serviceId] })],
);
export const couponPlans = pgTable(
  "coupon_plans",
  { couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }), planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }) },
  (t) => [primaryKey({ columns: [t.couponId, t.planId] })],
);

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "restrict" }),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "restrict" }),
    discountCents: integer("discount_cents").notNull(),
    createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex("cr_appt_uq").on(t.couponId, t.appointmentId), index("cr_user_idx").on(t.couponId, t.userId)],
);

// Livro-razão de pontos: saldo = SUM(points). Nunca se edita, só se lança.
export const loyaltyTransactions = pgTable(
  "loyalty_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    kind: loyaltyKind("kind").notNull(),
    points: integer("points").notNull(), // positivo ganha, negativo gasta
    idempotencyKey: text("idempotency_key").notNull(), // ex.: earn:appointment:<id> — impede crédito duplicado
    appointmentId: uuid("appointment_id").references(() => appointments.id, { onDelete: "restrict" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex("lt_idem_uq").on(t.idempotencyKey), check("lt_nonzero", sql`${t.points} <> 0`), index("lt_user_idx").on(t.userId)],
);

export const referrals = pgTable(
  "referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referrerId: text("referrer_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    referredId: text("referred_id").notNull().references(() => users.id, { onDelete: "restrict" }),
    status: referralStatus("status").notNull().default("pending"),
    rewardedAt: timestamp("rewarded_at", { withTimezone: true }),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("ref_referred_uq").on(t.referredId), // cada pessoa só pode ser indicada uma vez
    check("ref_not_self", sql`${t.referrerId} <> ${t.referredId}`),
  ],
);

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    appointmentId: uuid("appointment_id").unique().references(() => appointments.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull(),
    rating: integer("rating").notNull(),
    comment: text("comment"),
    source: text("source").notNull().default("site"), // site | google (futuro)
    status: reviewStatus("status").notNull().default("pending"), // só "approved" aparece no site
    createdAt: ts("created_at"),
  },
  (t) => [check("review_rating", sql`${t.rating} between 1 and 5`)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    channel: text("channel").notNull().default("email"),
    template: text("template").notNull(),
    toAddress: text("to_address").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    dedupeKey: text("dedupe_key").notNull(), // ex.: reminder:<appointmentId> — impede disparo duplicado
    status: text("status").notNull().default("queued"), // queued | sent | failed
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: ts("created_at"),
  },
  (t) => [uniqueIndex("notif_dedupe_uq").on(t.dedupeKey), index("notif_queue_idx").on(t.status, t.scheduledFor)],
);
