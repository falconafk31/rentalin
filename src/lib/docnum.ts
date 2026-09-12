import { sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';

// B2 (audit.md) / 2.10 (roadmap.md) — penomoran dokumen berurutan:
// PREFIX/TAHUN/001, direset per tahun. Menggantikan format
// `PREFIX/TAHUN/<timestamp8>-<random4>` yang unik tapi tak berurutan
// (tidak estetis untuk dokumen formal invoice/kontrak/BAST).
//
// Keamanan konkurensi: `pg_advisory_xact_lock` menserialisasi penerbitan
// nomor per prefix+tahun — WAJIB dipanggil di dalam transaksi (lock
// dilepas otomatis saat commit/rollback), sehingga tidak perlu retry 23505:
// dua request bersamaan pasti mendapat nomor berbeda.
//
// Nomor lama berformat timestamp-random tetap aman: regex hanya
// menangkap ekor numerik murni, baris lain diabaikan oleh MAX().
export async function nextDocNumber(
  exec: { execute: (query: SQL) => Promise<unknown> },
  prefix: string,
  column: AnyPgColumn,
  table: PgTable,
  year: string,
): Promise<string> {
  await exec.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`docnum:${prefix}:${year}`}))`);
  const pattern = `^${prefix}/${year}/([0-9]{1,6})$`;
  const res = (await exec.execute(
    sql`SELECT COALESCE(MAX((substring(${column} FROM ${pattern}))::int), 0) AS n FROM ${table}`,
  )) as { rows?: { n?: string | number }[] };
  const last = Number(res.rows?.[0]?.n ?? 0);
  return `${prefix}/${year}/${String(last + 1).padStart(3, '0')}`;
}
