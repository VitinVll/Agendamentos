import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./auth";

// Linha única (id = 1). Tudo que o dono pode configurar sem mexer no código.
export const businessSettings = pgTable(
  "business_settings",
  {
    id: integer("id").primaryKey().default(1),
    name: text("name").notNull().default("VS Barbearia"),
    logoUrl: text("logo_url"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    phone: text("phone"),
    whatsapp: text("whatsapp"), // somente dígitos com DDI, ex.: 5531999999999
    instagram: text("instagram"),
    mapsUrl: text("maps_url"),
    about: text("about"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    slotIntervalMin: integer("slot_interval_min").notNull().default(15),
    minAdvanceMinutes: integer("min_advance_minutes").notNull().default(60),
    maxAdvanceDays: integer("max_advance_days").notNull().default(30),
    cancelMinHours: integer("cancel_min_hours").notNull().default(2),
    rescheduleMinHours: integer("reschedule_min_hours").notNull().default(2),
    maxReschedules: integer("max_reschedules").notNull().default(2),
    noShowPolicy: text("no_show_policy"),
    pointsPerReal: integer("points_per_real").notNull().default(1),
    unusedCreditsPolicy: text("unused_credits_policy"), // texto exibido ao cliente
    notificationPrefs: jsonb("notification_prefs").notNull().default(sql`'{}'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("bs_singleton", sql`${t.id} = 1`)],
);

export const galleryImages = pgTable("gallery_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  published: boolean("published").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // ex.: service.update
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId), index("audit_created_idx").on(t.createdAt)],
);
