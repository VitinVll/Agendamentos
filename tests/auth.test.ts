import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers";
import { createAuth } from "@/lib/auth";
import * as s from "@/db/schema";

let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let auth: ReturnType<typeof createAuth>;

beforeAll(async () => {
  ({ db } = await createTestDb());
  auth = createAuth(db, { secret: "test-secret-test-secret-test-secret-123", baseURL: "http://localhost:3000" });
});

describe("autenticação", () => {
  it("cadastra, grava hash (não a senha) e loga", async () => {
    await auth.api.signUpEmail({ body: { name: "Maria", email: "maria@x.com", password: "senha-forte-123" } });
    const [acc] = await db.select().from(s.accounts);
    expect(acc.password).toBeTruthy();
    expect(acc.password).not.toContain("senha-forte-123");
    const res = await auth.api.signInEmail({ body: { email: "maria@x.com", password: "senha-forte-123" } });
    expect(res.user.email).toBe("maria@x.com");
  });

  it("rejeita senha errada", async () => {
    await expect(auth.api.signInEmail({ body: { email: "maria@x.com", password: "errada-errada" } })).rejects.toThrow();
  });

  it("cliente NÃO consegue se cadastrar como admin", async () => {
    try {
      await auth.api.signUpEmail({ body: { name: "Hacker", email: "h@x.com", password: "senha-forte-123", role: "admin" } as never });
    } catch {
      /* rejeitar também é aceitável */
    }
    const [u] = await db.select().from(s.users).where(eq(s.users.email, "h@x.com"));
    expect(u?.role ?? "customer").toBe("customer");
  });
});
