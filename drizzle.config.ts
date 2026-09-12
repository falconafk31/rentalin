import type { Config } from "drizzle-kit";

// 0.8 (audit.md K-proses / roadmap 0.8): kredensial DB dibaca dari env —
// bukan plaintext di repo. Tanpa DATABASE_URL, drizzle-kit memakai URL
// lokal pratinjau bawaan (container/sandbox development).
export default {
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db",
  },
} satisfies Config;
