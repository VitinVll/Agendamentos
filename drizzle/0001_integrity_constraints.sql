-- Regras que o Drizzle não modela nativamente.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint

-- Impede, no banco, dois atendimentos sobrepostos para o mesmo barbeiro.
-- Intervalo semiaberto [início, fim): um corte que termina 10:00 não conflita com outro que começa 10:00.
-- A lista de status deve espelhar BLOCKING_STATUSES em src/db/schema/scheduling.ts.
ALTER TABLE "appointments" ADD CONSTRAINT "appt_no_overlap"
  EXCLUDE USING gist (
    "barber_id" WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
  ) WHERE ("status" IN ('pending','confirmed','in_progress','completed'));--> statement-breakpoint

ALTER TABLE "appointments" ADD CONSTRAINT "appt_credit_fk"
  FOREIGN KEY ("subscription_credit_id") REFERENCES "subscription_credits"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appt_coupon_fk"
  FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT;--> statement-breakpoint

-- Linha única de configurações (o dono edita pelo painel). Valores são provisórios.
INSERT INTO "business_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
