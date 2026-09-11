import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlDb?: NodePgDatabase;
};

// Pool dibuat LAZY (saat kueri pertama), bukan saat modul diimpor — sehingga
// `next build` tidak lagi menuntut DATABASE_URL pada waktu build (CI/preview).
function createPool(): Pool {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return new Pool({
    connectionString: databaseUrl,
    // Ukuran pool kecil: aman untuk Supavisor session pooler pada
    // deployment Vercel serverless (lihat supabase/README.md §Tahap 4).
    max: 5,
  });
}

export function getPool(): Pool {
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    globalForDb.__arenaNextJsPostgresqlPool = createPool();
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

function getDb(): NodePgDatabase {
  if (!globalForDb.__arenaNextJsPostgresqlDb) {
    globalForDb.__arenaNextJsPostgresqlDb = drizzle(getPool());
  }
  return globalForDb.__arenaNextJsPostgresqlDb;
}

// Proxy lazy: seluruh kode aplikasi tetap memakai `db` / `pool` seperti
// sebelumnya (tanpa perubahan call-site), tetapi koneksi fisik baru
// terbentuk pada pemakaian pertama. Method di-bind ke instance nyata
// agar `this` internal Drizzle/pg tetap benar.
export const pool = new Proxy({} as Pool, {
  get(_target, property) {
    const value = Reflect.get(getPool(), property);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(getPool())
      : value;
  },
});

export const db = new Proxy({} as NodePgDatabase, {
  get(_target, property) {
    const value = Reflect.get(getDb(), property);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(getDb())
      : value;
  },
});
