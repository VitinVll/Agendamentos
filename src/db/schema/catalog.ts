import {
  boolean, check, index, integer, pgTable, primaryKey, smallint, text, time, timestamp, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";

const ts = (n: string) => timestamp(n, { withTimezone: true }).notNull().defaultNow();

export const customerProfiles = pgTable(
  "customer_profiles",
  {
    userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    birthDate: text("birth_date"), // YYYY-MM-DD (para campanhas de aniversário)
    internalNotes: text("internal_notes"), // visível só para staff
    referralCode: text("referral_code").notNull().unique(),
    referredByUserId: text("referred_by_user_id").references(() => users.id, { onDelete: "set null" }),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
    privacyAcceptedAt: timestamp("privacy_accepted_at", { withTimezone: true }).notNull(),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    deletionRequestedAt: timestamp("deletion_requested_at", { withTimezone: true }), // LGPD
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [check("referral_not_self", sql`${t.referredByUserId} is distinct from ${t.userId}`)],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
    photoUrl: text("photo_url"),
    priceCents: integer("price_cents").notNull(),
    durationMin: integer("duration_min").notNull(),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }), // "excluir" = arquivar; preserva histórico
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    check("service_price_nonneg", sql`${t.priceCents} >= 0`),
    check("service_duration_pos", sql`${t.durationMin} > 0`),
  ],
);

export const barbers = pgTable("barbers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").unique().references(() => users.id, { onDelete: "set null" }), // login do barbeiro
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  photoUrl: text("photo_url"),
  bio: text("bio"),
  specialties: text("specialties").array().notNull().default(sql`'{}'::text[]`),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const barberServices = pgTable(
  "barber_services",
  {
    barberId: uuid("barber_id").notNull().references(() => barbers.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.barberId, t.serviceId] }), index("barber_services_service_idx").on(t.serviceId)],
);

// weekday: 0 = domingo … 6 = sábado. Horários no fuso da barbearia.
export const businessHours = pgTable(
  "business_hours",
  {
    weekday: smallint("weekday").primaryKey(),
    isOpen: boolean("is_open").notNull().default(true),
    opensAt: time("opens_at").notNull(),
    closesAt: time("closes_at").notNull(),
  },
  (t) => [check("bh_weekday", sql`${t.weekday} between 0 and 6`), check("bh_order", sql`${t.closesAt} > ${t.opensAt}`)],
);

export const barberWorkingHours = pgTable(
  "barber_working_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    barberId: uuid("barber_id").notNull().references(() => barbers.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    breakStart: time("break_start"),
    breakEnd: time("break_end"),
  },
  (t) => [
    uniqueIndex("bwh_barber_weekday_uq").on(t.barberId, t.weekday),
    check("bwh_weekday", sql`${t.weekday} between 0 and 6`),
    check("bwh_order", sql`${t.endTime} > ${t.startTime}`),
    check("bwh_break", sql`(${t.breakStart} is null) = (${t.breakEnd} is null) and (${t.breakStart} is null or ${t.breakEnd} > ${t.breakStart})`),
  ],
);

// barberId nulo = bloqueio da barbearia inteira (feriado, evento).
export const blockedTimes = pgTable(
  "blocked_times",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    barberId: uuid("barber_id").references(() => barbers.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    kind: text("kind").notNull().default("block"), // block | day_off | vacation
    reason: text("reason"),
    createdAt: ts("created_at"),
  },
  (t) => [check("blocked_order", sql`${t.endsAt} > ${t.startsAt}`), index("blocked_barber_time_idx").on(t.barberId, t.startsAt)],
);
