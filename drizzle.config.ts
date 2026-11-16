import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Migrations usam a conexão DIRETA do Neon (sem pooler). Consultas da aplicação usam DATABASE_URL (pooled).
export default defineConfig({
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
});
