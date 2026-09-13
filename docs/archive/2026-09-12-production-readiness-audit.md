# Rentalin — Production Readiness Audit (TASK 3)

> Audit baca-saja terhadap kode aktual. Basis: branch `feat/dashboard-compact-redesign`
> (4 commit di atas `main` f721a0e), working tree bersih kecuali `.zcode/` untracked.
> CATATAN: branch kerja saat ini BUKAN `main` — PR #16 belum di-merge. Temuan di bawah
> mencakup kode fitur branch ini (BAST memo, dashboard compact, revenueByDay).
> Tanggal: 12 Sep 2026.

## 1. Ringkasan eksekutif

Aplikasi secara umum **siap produksi dengan syarat** (CONDITIONAL GO): inti bisnis
benar — PPN snapshot, ledger anti-overpayment, BAST dibatasi DB, foto privat
magic-bytes, otorisasi per-aksi konsisten. Satu temuan mendekati P0 tetap terbuka:
**error `column "city" does not exist` tidak dapat direproduksi dari kode saat ini**
— seluruh rantai `schema.ts` → migrasi 0018 → `getSettingsRow` konsisten. Dugaan
kuat: database produksi/lokal yang error belum menjalankan migrasi 0018/0019.
Tidak ada bukti drift skema lain.

## 2. Status sistem

- Branch: `feat/dashboard-compact-redesign` (bukan `main` sesuai asumsi tugas).
- PR #16 terbuka, belum merge: BAST memo (2.21), dashboard compact + revenueByDay (2.22), entri roadmap/audit/ui-audit.
- `git status`: bersih kecuali `.zcode/` untracked.
- Validasi terakhir di branch: lint 0/0, typecheck 0 error, build sukses.
- `package.json`: dep produksi ramping; `playwright` sudah di devDependencies;
  `postcss` 8.5.28 pinned; tidak ada dep mencurigakan.

## 3. Audit database / skema

### 3.1 Pemicu: `column "city" does not exist`

Hasil: **tidak ada mismatch di kode**. Rantai kolom settings lengkap dan konsisten:

| Kolom | `schema.ts` | Migrasi | UI settings |
|---|---|---|---|
| `city`, `timezone` | ✅ L28–32 | ✅ 0018 | ✅ form + PDF |
| `npwp`, `signer_ktp`, bank_* | ✅ L34–35 | ✅ 0019 | ✅ form + PDF |
| `ppn_rate`, `expiry_warning_days` | ✅ L29 | ✅ 0009 | ✅ form + invoice |

`getSettingsRow()` memakai `select()` penuh + fallback `fallbackSettings`, sehingga
baris kosong tidak melempar — tapi kolom hilang di DB tetap melempar (sesuai
error yang dilaporkan). Dugaan: DB target belum menjalankan 0018/0019.
Rekomendasi: verifikasi read-only `SELECT city, timezone, npwp ... FROM
company_settings LIMIT 1` di DB tersebut; JANGAN buat migrasi baru — migrasi
yang benar sudah ada, tinggal dijalankan berurutan.

### 3.2 Migrasi 0009–0016: semua PASS

| Migrasi | Tujuan | Status |
|---|---|---|
| 0009 | `ppn_rate`, `expiry_warning_days` | PASS — cocok `schema.ts` L29 |
| 0010 | tabel `payments` + RLS | PASS — cocok `schema.ts` L37–39 |
| 0011 | tabel `audit_log` append-only | PASS — cocok L43–45 |
| 0012 | `photo_urls` + bucket privat `bast-photos` | PASS — cocok L26, RLS storage benar |
| 0013 | trigger profil anti-eskalasi | PASS — invited-only role, default operator |
| 0014 | snapshot `subtotal_amount`, `tax_rate` + backfill | PASS — pola backfill-then-NOT NULL benar |
| 0015 | `payments.notes` | PASS |
| 0016 | guard konsistensi snapshot (gagal eksplisit, tanpa repair) | PASS — prinsip benar |

Migrasi lanjutan 0017–0021 juga konsisten dengan `schema.ts` (indeks, locale,
identitas, templates, uniqueness BAST). Tidak ada DUPLICATE/UNUSED/UNKNOWN.

## 4. Audit alur bisnis

Relasi Client → Kontrak → Unit → Timesheet → BAST → Invoice → Payment dijaga
di server: kontrak hanya dari unit `available` (transaksi), timesheet approve
bersyarat (`status=pending` + belum ditagih), BAST unik per `(contract_id, type)`
di level DB (0021), invoice mengunci kontrak + timesheet approved-bel
um-ditagih dalam satu transaksi dan menautkan `invoiceId`.

## 5. Audit finansial

- **PPN snapshot BENAR**: `calcInvoiceTotals` terpusat di `finance.ts`;
  `saveRecord` invoice membaca `currentPpnRate()` saat terbit dan menyimpan
  `subtotal_amount`/`tax_amount`/`tax_rate` per invoice. Invoice lama kebal
  perubahan setting. Skenario 11%→12% lolos by construction.
- **Ledger BENAR**: `recordPayment` dalam transaksi + `FOR UPDATE`, tolak
  overpayment di luar toleransi 0,005, normalisasi di dalamnya, `remaining`
  tak pernah negatif, status via `resolveInvoiceStatus`. Pelunasan manual ikut
  tercatat sebagai baris payment (`method='other'`), bukan update status liar.
- **Overdue BENAR**: `resolveInvoiceStatus` memprioritaskan `paid` di atas
  `overdue`; cron hanya menyentuh `unpaid/partial` lewat jatuh tempo.
- Script `finance-check.ts` + `task1b-check.ts` sudah berjalan di CI.

## 6. Audit BAST

- Checklist: `BastChecklist` memo + uncontrolled — instan, tanpa warning
  (validasi manual pemilik produk). Tidak ada PDF regeneration saat klik.
- Stale-state AMAN by design: `defaultChecked` dibaca dari prop `editing`
  per buka modal; tidak ada state checklist global yang terbawa antar record.
- Edit + save + refresh persisten via UPDATE + unique constraint.
- Foto: magic-bytes server-side (JPEG/PNG/WebP saja), 5 MB, nama disanitasi,
  path acak, bucket privat, upload butuh role, preview via route privat.
- PDF hanya saat diminta.

## 7. Audit keamanan

- `requireUser([roles])` di semua Server Action tulis; invoice/payment/finance
  terkunci admin/finance; settings/template/user admin-only.
- Route finansial (`/api/report`, PDF invoice) ber-role; SPH/BAST operasional
  terbuka untuk role internal — by design.
- Cron 401 tanpa bearer; `SERVICE_ROLE_KEY` hanya di server (`inviteUser`,
  `setUserBanned`) dan tidak ber-prefix `NEXT_PUBLIC_`.
- Security headers sudah di `next.config.ts` (O-E). `.env.example` mencakup
  semua secret server-side; `.env.local` tidak terlacak.

## 8. Audit UX / performa / mobile

- Dashboard compact + revenue harian nyata terverifikasi di branch (lint/tsc/build hijau).
- Tidak ada `router.refresh()` hammer di jalur interaksi (refresh hanya pasca-save).
- Chart lazy-load; agregat di SQL; granularitas adaptif mencegah ratusan titik SVG.
- Responsif: breakpoint 540/760/1000/1200 koheren; `metric-value` 760px sudah
  disamakan ke 26px. Klaim "mobile tervalidasi manual" BELUM dilakukan —
  butuh uji viewport nyata (P2).

## 9. Temuan P0/P1/P2/P3

- **P0**: tidak ada blocker Terbukti di kode. Satu kandidat (`city` hilang)
  diklasifikasi sebagai *lingkungan* (migrasi belum dijalankan), bukan bug kode.
- **P1**: tidak ada. Semua jalur finansial/otorisasi/bukti foto tertutup.
- **P2**: (a) uji mobile manual nyata belum ada; (b) verifikasi DB produksi
  read-only untuk 0018/0019 belum dilakukan.
- **P3**: tooltip chart harian, e2e Playwright, observability lanjutan.

## 10. Perbaikan yang dilakukan

Tidak ada perubahan kode — tidak ada P0/P1 yang aman dan perlu diperbaiki.
Satu-satunya file baru adalah laporan ini.

## 11. Keputusan produksi

**CONDITIONAL GO**: boleh rilis setelah (1) jalankan migrasi 0018/0019 (dan
seluruh antrian) berurutan di DB target lalu verifikasi `SELECT` settings
lolos; (2) merge PR #16 setelah review; (3) uji mobile manual minimal
360/390/430px pada Dashboard, BAST, Timesheet, Invoice.
