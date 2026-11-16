import { check, index, integer, pgEnum, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";
import { barbers, services } from "./catalog";

export const appointmentStatus = pgEnum("appointment_status", [
  "pending", "confirmed", "in_progress", "completed", "cancelled", "no_show",
]);

/** Status que ocupam a agenda. Deve espelhar o WHERE da exclusion constraint (ver migration custom). */
export const BLOCKING_STATUSES = ["pending", "confirmed", "in_progress", "completed"] as const;

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: text("customer_id").references(() => users.id, { onDelete: "restrict" }), // nulo = cliente de balcão
    guestName: text("guest_name"),
    guestPhone: text("guest_phone"),
    barberId: uuid("barber_id").notNull().references(() => barbers.id, { onDelete: "restrict" }),
    status: appointmentStatus("status").notNull().default("pending"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    subscriptionCreditId: uuid("subscription_credit_id"), // FK adicionada em billing (evita import circular)
    couponId: uuid("coupon_id"),
    rescheduleCount: smallint("reschedule_count").notNull().default(0),
    source: text("source").notNull().default("web"), // web | admin | whatsapp
    notes: text("notes"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("appt_time_order", sql`${t.endsAt} > ${t.startsAt}`),
    check("appt_money", sql`${t.subtotalCents} >= 0 and ${t.discountCents} >= 0 and ${t.totalCents} = ${t.subtotalCents} - ${t.discountCents} and ${t.totalCents} >= 0`),
    check("appt_who", sql`${t.customerId} is not null or ${t.guestName} is not null`),
    index("appt_barber_start_idx").on(t.barberId, t.startsAt),
    index("appt_customer_start_idx").on(t.customerId, t.startsAt),
    index("appt_status_start_idx").on(t.status, t.startsAt),
  ],
);

// Snapshot de nome/preço/duração: alterar o serviço depois não reescreve o histórico.
export const appointmentServices = pgTable(
  "appointment_services",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id").notNull().references(() => services.id, { onDelete: "restrict" }),
    nameSnapshot: text("name_snapshot").notNull(),
    priceCentsSnapshot: integer("price_cents_snapshot").notNull(),
    durationMinSnapshot: integer("duration_min_snapshot").notNull(),
  },
  (t) => [index("appt_services_appt_idx").on(t.appointmentId)],
);

export const appointmentStatusHistory = pgTable(
  "appointment_status_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    fromStatus: appointmentStatus("from_status"),
    toStatus: appointmentStatus("to_status").notNull(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ash_appt_idx").on(t.appointmentId)],
);
