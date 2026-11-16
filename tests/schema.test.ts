import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "./helpers";
import * as s from "@/db/schema";

let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let barberId: string, serviceId: string;
const T = (h: number, m = 0) => new Date(Date.UTC(2030, 0, 7, h, m)); // data futura fixa

async function book(startsAt: Date, endsAt: Date, status: "pending" | "cancelled" = "pending") {
  return db.insert(s.appointments).values({
    guestName: "Cliente", barberId, startsAt, endsAt, status, subtotalCents: 5000, totalCents: 5000,
  });
}

beforeAll(async () => {
  ({ db } = await createTestDb());
  [{ id: barberId }] = await db.insert(s.barbers).values({ slug: "joao", name: "João" }).returning({ id: s.barbers.id });
  [{ id: serviceId }] = await db.insert(s.services).values({ slug: "corte", name: "Corte", priceCents: 5000, durationMin: 30 }).returning({ id: s.services.id });
});

describe("anti-conflito de agenda (no banco)", () => {
  it("recusa horário sobreposto para o mesmo barbeiro", async () => {
    await book(T(10), T(10, 30));
    await expect(book(T(10, 15), T(10, 45))).rejects.toThrow();
  });

  it("aceita horário encostado (fim 10:30 = início 10:30)", async () => {
    await expect(book(T(10, 30), T(11))).resolves.toBeDefined();
  });

  it("libera o horário quando o agendamento anterior é cancelado", async () => {
    await book(T(14), T(14, 30), "cancelled");
    await expect(book(T(14), T(14, 30))).resolves.toBeDefined();
  });

  it("sob 10 tentativas simultâneas no mesmo horário, só 1 vence", async () => {
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => book(T(16), T(16, 30))));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
});

describe("integridade de créditos", () => {
  it("o banco recusa usar mais créditos do que foram concedidos", async () => {
    const [u] = await db.insert(s.users).values({ id: "u1", name: "A", email: "a@a.com" }).returning();
    const [p] = await db.insert(s.plans).values({ slug: "p", name: "P", priceCents: 9000 }).returning();
    const [sub] = await db.insert(s.subscriptions).values({ userId: u.id, planId: p.id, priceCentsContracted: 9000, status: "active" }).returning();
    const [c] = await db.insert(s.subscriptionCredits).values({ subscriptionId: sub.id, serviceId, cycleStart: T(0), cycleEnd: T(23), granted: 1 }).returning();
    const use = () => db.execute(sql`update subscription_credits set used = used + 1 where id = ${c.id}`);
    await use();
    await expect(use()).rejects.toThrow();
  });
});

describe("a recusa vem da trava certa", () => {
  it("o erro cita a constraint appt_no_overlap", async () => {
    await book(T(18), T(18, 30));
    const err = await book(T(18), T(18, 30)).catch((e) => e);
    expect(JSON.stringify([err.message, err.cause?.message, err.constraint, err.cause?.constraint])).toContain("appt_no_overlap");
  });
});
