# TASK-1 — UI/UX Performance & Fitur Operasional

> Implementasi spesifikasi TASK-1 (§1–§21) di atas fondasi gelombang 1+2.
> PR: #12 (`arena/01a0905b-rentalin` → `main`). Status: menunggu review PM — **jangan merge**.

## 1. 🎯 Tujuan

Menuntaskan seluruh gap spesifikasi TASK-1: snapshot pajak invoice (§7),
kalkulasi finansial terpusat (§8), catatan pembayaran (A-2), manajemen
status pengguna + edit profil (A-4), audit auth & upload foto (A-5/§11),
dan Content Security Policy (O-E) — dengan regresi finansial §19 yang
wajib lolos sebelum merge.

## 2. 📋 Status Implementasi

| ID spez | Fitur | Status | Bukti |
|---|---|---|---|
| A-1 | PPN configurable | ✅ Sudah ada | `company_settings.ppn_rate`, migrasi 0009 |
| A-2 | Payment ledger + **notes** | ✅ Selesai | Migrasi 0015, `recordPayment`, modal, PDF |
| A-3 | Invite + role + guard terakhir | ✅ Sudah ada | `inviteUser`, `updateUserRole` |
| A-4 | **Disable/enable + edit profil** | ✅ Selesai | `setUserBanned`, `updateUserProfile`, halaman Pengguna |
| A-5 | **Audit login/logout/upload** | ✅ Selesai | Aksi `login`/`logout`/`upload`, route foto |
| A-6 | BAST foto + checklist | ✅ Sudah ada | Bucket privat, migrasi 0012 |
| A-7 | Payment history di PDF | ✅ Sudah ada | `api/documents`, `pdf-document` |
| O-B | Logout + reset password | ✅ Sudah ada | `/forgot-password`, `/reset-password`, callback |
| O-C | Overdue cron | ✅ Sudah ada | `api/cron/overdue`, `vercel.json` |
| O-D | TZ-safe dates | ✅ Sudah ada | `lib/format` dayNumber, ISO compare |
| O-E | **CSP production** | ✅ Selesai | `next.config.ts` |
| D-1..D-4 | Dokumen unduhan+laci | ✅ Sudah ada | PDF invoice/contract/BAST, CSV |
| §7 | **Snapshot subtotal+tarif** | ✅ Selesai | Migrasi 0014, PDF pakai tersimpan |
| §8 | **Util finansial terpusat** | ✅ Selesai | `src/lib/finance.ts` |
| §19 | **Regresi finansial** | ✅ 13/13 lolos | `scripts/finance-check.ts` + CI |
| O-A | Paginasi server-side | ⏸️ Ditunda | Volume <500/baris; lihat §6 |

## 3. 🗄️ Perubahan Database

- **0014_invoice_tax_snapshot.sql** — `invoices.subtotal_amount DECIMAL(15,2)`
  + `invoices.tax_rate DECIMAL(5,2)`, keduanya NOT NULL + CHECK 0–100.
  Backfill: `subtotal = total − pajak`, `tarif = pajak/subtotal×100`
  (COALESCE 0 bila subtotal 0). Idempotent (`IF NOT EXISTS` + guard constraint).
- **0015_payment_notes.sql** — `payments.notes TEXT` (nullable).
- **Seed** (`src/db/seed.ts`) — insert invoice wajib mengisi kedua kolom
  snapshot (tarif `'11'`); **seed lama tanpa kolom ini akan gagal NOT NULL**.
- Tidak ada perubahan RLS; tidak ada CHECK baru pada `audit_log.action`
  (aksi `login`/`logout`/`upload`/`ban` bebas ditambah).

## 4. 💻 Perubahan Kode per File

| File | Perubahan |
|---|---|
| `src/lib/finance.ts` | **BARU** — `calcInvoiceTotals`, `remainingBalance`, `resolveInvoiceStatus` (pure, server+client) |
| `scripts/finance-check.ts` | **BARU** — regresi §19, impor util asli, exit 1 bila gagal |
| `src/app/actions.ts` | Refactor kalkulasi → util; simpan snapshot; `notes`; `updateUserProfile`; `setUserBanned`; audit login/logout; pesan akun banned |
| `src/components/module-workspace.tsx` | Pratinjau invoice → util; label tarif tersimpan; field + riwayat notes |
| `src/app/api/documents/[kind]/[id]/route.ts` | PDF pakai subtotal/tarif tersimpan; notes di riwayat |
| `src/lib/audit.ts` | Aksi `login`/`logout`/`upload`/`ban` |
| `src/app/api/bast-photos/route.ts` | Audit upload (nama berkas + ukuran) |
| `src/lib/data.ts` | `getBannedMap()` via service-role, `{}` bila tak dikonfigurasi |
| `src/app/dashboard/users/page.tsx` | Teruskan banned map |
| `src/components/admin-workspace.tsx` | Kolom Status, ubah nama inline, Nonaktifkan/Aktifkan, label audit |
| `src/db/schema.ts` | `subtotalAmount`, `taxRate`, `notes` |
| `src/lib/format.ts` | Label `Nonaktif` |
| `src/app/globals.css` | `.status-banned` (merah) |
| `next.config.ts` | CSP khusus production |
| `.github/workflows/ci.yml` | Langkah `node scripts/finance-check.ts` |
| `tsconfig.json` | `allowImportingTsExtensions` (script TS type-safe) |
| `supabase/templates/provision_user.sql` | SQL ban/unban manual |

## 5. ✅ Hasil Pengujian

| Uji | Hasil |
|---|---|
| `npm run lint` | 0 error, 0 warning |
| `npm run typecheck` | 0 error |
| `node scripts/finance-check.ts` | **13/13 PASS** (lihat bawah) |
| `env -u DATABASE_URL npm run build` | Sukses, 15 routes |
| Smoke prod `:3102` | CSP terkirim; `/login` 200; cron-tanpa-secret 401; dokumen-id-acak 404; `/dashboard` 500 tanpa DB (pre-existing, bukan regresi) |

Output regresi finansial (§19 — subtotal 100jt, PPN 11% → pajak 11jt,
total 111jt; invoice lama terkunci 11% saat setting jadi 12%):

```
PASS  subtotal = 100.000.000
PASS  pajak 11% = 11.000.000
PASS  total = 111.000.000
PASS  invoice lama tetap 11%
PASS  invoice baru 12% → 12.000.000 / 112.000.000
PASS  sisa = total − bayar
PASS  sisa tak pernah negatif
PASS  status unpaid
PASS  status partial
PASS  status paid
PASS  lunas tak pernah overdue
PASS  lewat tempo → overdue
PASS  batas toleransi 0,005 → paid
Semua uji finansial lolos.
```

## 6. ⚠️ Batasan Diketahui

- **O-A paginasi server-side DITUNDA** (keputusan tercatat): volume nyata
  <500 baris/modul; paginasi client + `useDeferredValue` sudah cukup
  (input lag <50ms terverifikasi gelombang 1). Calon TASK tindak lanjut
  bila data >2.000 baris.
- **Sesi aktif akun banned**: ban memblokir login baru di level Supabase
  Auth; sesi yang sudah masuk baru berakhir saat token kedaluwarsa
  (tidak ada pencabutan paksa — membutuhkan Admin API per request).
- **`getBannedMap` maks 100 pengguna** (`perPage: 100`) — cukup untuk
  akun internal; naikkan bila organisasi membesar.
- **CSP hanya production**: development (`next dev`/HMR) sengaja tanpa
  CSP karena butuh `'unsafe-eval'`.

## 7. 🔐 Catatan Keamanan

- `setUserBanned`/`updateUserProfile`: `requireUser(['admin'])` di server;
  tombol UI hanya affordance. Larang nonaktifkan diri sendiri + admin
  aktif terakhir (cek `listUsers` + tabel profiles).
- Service-role key hanya dipakai server (`actions.ts`, `data.ts`
  ber-`server-only`); bila absen, fitur degradasi elegan (error message
  + template SQL, bukan crash).
- Ban 100 tahun (`ban_duration: '876000h'`) ≈ permanen; unban via
  `'none'`. Login banned mengembalikan pesan eksplisit, bukan "surel
  atau sandi salah".
- CSP: `frame-ancestors 'none'` + `object-src 'none'` + `form-action
  'self'`; tidak ada `unsafe-eval`; `connect-src` dibatasi ke Supabase.
- Audit append-only: kegagalan tulis audit tidak menggagalkan transaksi
  bisnis (log server sebagai fallback).

## 8. 📸 Tangkapan Layar

> Belum diambil (sandbox headless). Wajib dilampirkan PM/reviewer saat
> verifikasi di preview deployment:

1. `docs/tasks/screenshots/task-1-users-status.png` — tabel Pengguna
   dengan badge Aktif/Nonaktif + tombol Nonaktifkan/Aktifkan.
2. `docs/tasks/screenshots/task-1-payment-notes.png` — modal pembayaran
   dengan field Catatan + riwayat.
3. `docs/tasks/screenshots/task-1-audit-auth.png` — log audit
   menampilkan Masuk/Keluar/Mengunggah foto.
4. `docs/tasks/screenshots/task-1-invoice-pdf.png` — PDF invoice dengan
   tarif tersimpan + riwayat pembayaran ber-catatan.

## 9. 🚀 Langkah Deploy

1. Merge PR #12 ke `main` (setelah review PM).
2. Jalankan migrasi Supabase **0014 lalu 0015** (berurutan; idempotent).
3. Pastikan env produksi: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `*_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`.
4. Verifikasi: uji §19 di CI hijau; buka invoice lama → tarif tetap;
   uji ban akun staging; cek header `Content-Security-Policy` di respons.
5. Lampirkan 4 tangkapan layar §8 ke PR.

## 10. 📝 Keputusan & Trade-off

- **Ban vs kolom `is_disabled`**: memakai `banned_until` bawaan Auth
  agar penegakan login terjadi di level Supabase (tak bisa di-bypass
  client), tanpa kolom/migrasi tambahan.
- **`ban_duration` 100 tahun**: API tidak menyediakan ban permanen;
  ini idiom yang didokumentasikan komunitas.
- **Util finance tanpa dependency**: murni TS agar bisa diimpor Node
  langsung (uji tanpa build) dan client (bundle kecil).
- **CSP prod-only**: kompromi disengaja; alternatif nonce-per-request
  butuh middleware dan berisiko merusak PDF/route API dalam scope task ini.

## 11. ⏭️ Tindak Lanjut (di luar scope)

- O-A: paginasi + pencarian server-side bila data >2.000 baris.
- Pencabutan sesi paksa untuk akun banned (Admin API `signOut` per user).
- Pagination/arsip log audit (saat ini 200 terbaru).
- Tangkapan layar §8 oleh reviewer.

## 12. 🔗 Referensi

- PR #12: `https://github.com/falconafk31/rentalin/pull/12`
- Spesifikasi: TASK-1 §1–§21 (dokumen terlampir sesi ini)
- Util: `src/lib/finance.ts` · Uji: `scripts/finance-check.ts`
- Migrasi: `supabase/migrations/0014_invoice_tax_snapshot.sql`,
  `supabase/migrations/0015_payment_notes.sql`
- Audit fondasi: `ui-audit.md` (§3 + checklist deploy)
