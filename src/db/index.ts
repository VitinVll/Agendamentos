import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// Pool (WebSocket) em vez de neon-http: precisamos de transações interativas
// (reservar horário + consumir crédito + aplicar cupom de forma atômica).
// DATABASE_URL = conexão POOLED do Neon (host com "-pooler").
let _db: ReturnType<typeof create> | undefined;
function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada. Veja .env.example.");
  return drizzle(new Pool({ connectionString: url }), { schema });
}
export function getDb() {
  return (_db ??= create());
}
export { schema };
