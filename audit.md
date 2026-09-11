# HeavyOps — Laporan Audit Kode Penuh

> Dokumen ini adalah hasil **audit keseluruhan kode** repository HeavyOps: apa yang perlu **ditambahkan**, **dikurangi/dihapus**, dan **dioptimasi** — lengkap dengan bukti verifikasi objektif dari tool (typecheck, lint, build, npm audit).
>
> Audit: 11 September 2026 · Basis: `3ea31a1` (branch `arena/01a08e34-rentalin`) · Metode: review manual seluruh file `src/` + eksekusi `tsc`, `eslint`, `next build`, `npm audit`, dan analisa dependency tree.
>
> Dokumen terkait: [`roadmap.md`](roadmap.md) (roadmap & analisa arsitektur) · [`supabase/README.md`](supabase/README.md) (alur migrasi Supabase) · [`README.md`](README.md) (README utama).

---

## Daftar Isi

1. [Ringkasan Hasil Verifikasi Objektif](#1-ringkasan-hasil-verifikasi-objektif)
2. [➕ Yang Perlu DITAMBAHKAN](#2--yang-perlu-ditambahkan)
3. [➖ Yang Perlu DIKURANGI / DIHAPUS](#3--yang-perlu-dikurangi--dihapus)
4. [⚡ Yang Perlu DIOPTIMASI](#4-️-yang-perlu-dioptimasi)
5. [Urutan Eksekusi yang Disarankan](#5-urutan-eksekusi-yang-disarankan)
6. [Bukti Audit Lengkap](#6-bukti-audit-lengkap)

---

## 1. Ringkasan Hasil Verifikasi Objektif

Seluruh temuan di bawah sudah diverifikasi dengan menjalankan tool langsung terhadap kode:

| Pemeriksaan | Hasil | Bukti |
|---|---|---|
| `tsc --noEmit` (type safety) | ✅ Bersih | 0 error |
| `npm run lint` (eslint 9) | ❌ **Gagal** | 1 error (`react-hooks/set-state-in-effect`) + 1 warning (`jsx-a11y/alt-text`) |
| `next build` **tanpa** `DATABASE_URL` | ❌ **Gagal** | `Error: DATABASE_URL is required` saat collecting page data → memblokir CI bersih |
| `next build` **dengan** env | ✅ Sukses | 10 route, compiled OK |
| `npm audit` | ❌ **5 kerentanan** | 1 HIGH (`postcss ≤8.5.22` — 4 advisory XSS/path-traversal), 4 moderate (`esbuild` via `@esbuild-kit`/drizzle-kit) |
| Dead code / dependency mati | ⚠️ Ada | `playwright` (1.63.0, heavy) & `dotenv` tidak pernah diimpor di `src/` |
| Security headers (`next.config.ts`) | ⚠️ Kosong | Tidak ada `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`; `poweredByHeader` aktif default |

**Kesimpulan satu kalimat:** fondasi bisnis (transaksi, constraint, otorisasi Server Action) sudah solid, tetapi ada **4 temuan merah** yang semuanya bisa ditutup dalam kurang dari satu hari kerja: role check route finansial, lint error, fail-build CI, dan override postcss.

---

## 2. ➕ Yang Perlu DITAMBAHKAN

### Prioritas tinggi (sebelum produksi)

| # | Item | Lokasi | Detail | Effort |
|---|---|---|---|---|
| A1 | **Role check di route finansial** | `src/app/api/report/route.ts`, `src/app/api/documents/[kind]/[id]/route.ts` | Saat ini cukup login saja → **operator dapat mengunduh CSV laporan & PDF invoice berisi nilai keuangan**. Tambah `requireUser(['admin','finance','operations'])`. Perbaikan keamanan dengan rasio effort/dampak terbesar. | ~15 mnt |
| A2 | **Lazy-init koneksi DB** | `src/db/index.ts` | Modul melempar `throw` saat *import time* → `next build` gagal di environment tanpa `DATABASE_URL` (CI, preview build). Pindah validasi ke request-time (lazy proxy). Sekalian set pool `max: 5` untuk Supavisor. | ~30 mnt |
| A3 | **Security headers** | `next.config.ts` | Tambah `headers()`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` minimal, dan `poweredByHeader: false`. | ~30 mnt |
| A4 | **CI pipeline** | `.github/workflows/ci.yml` (baru) | GitHub Actions: `lint → typecheck → build` (build pakai env dummy). Tanpa CI, lint yang sekarang merah tidak akan pernah terdeteksi sampai lama. | ~1 jam |
| A5 | **`.env.example`** | root (baru) | Daftar semua variabel (lihat §9 `supabase/README.md`) + validasi env saat startup agar gagal cepat dengan pesan jelas. | ~30 mnt |
| A6 | **Test logika finansial** | `tests/` (baru) | Idempotensi penagihan invoice (timesheet tidak boleh tertagih 2×), validasi HM timesheet, penugasan kontrak (1 unit = 1 kontrak aktif). Ini area berisiko **uang** — wajib ada jaring pengaman sebelum refactor. Playwright sudah ada di dependencies; tinggal dipakai (lihat juga K1). | 1–2 hari |
| A7 | **Audit log** | skema + `actions.ts` | Tabel `audit_log(actor, action, entity, entity_id, before jsonb, after jsonb, at)` diisi dari setiap Server Action; tampilan riwayat untuk admin. Wajib untuk ERP keuangan (bukti sengketa). | 1–2 hari |
| A8 | **Password reset / undangan user** | `/login`, auth config | Flow "lupa sandi" + undangan user via email. Saat ini pembuatan user hanya lewat provisioning manual (see `supabase/templates/provision_user.sql`). | 0.5–1 hari |

### Prioritas menengah (Fase 2 roadmap)

| # | Item | Detail |
|---|---|---|
| A9 | **Payment ledger** | Tabel `payments(invoice_id, amount, method, reference, paid_at)`; status invoice (`unpaid/partial/paid`) dihitung dari akumulasi pembayaran — menggantikan toggle manual semua-atau-tidak-sama-sekali. `partial` sudah ada di skema tapi belum terpakai. |
| A10 | **Penugasan operator per kontrak** | Tabel `contract_operators(contract_id, operator_id)`; operator hanya lihat/isir kontraknya; admin bisa submit atas nama operator (saat ini `operator_id` selalu = user yang login). |
| A11 | **PPN configurable** | Pindahkan angka 11% ke `company_settings.ppn_rate`; invoice + dokumen PDF membaca setting. Saat ini hardcoded di `actions.ts` dan teks PDF. |
| A12 | **Cron `overdue`** | Invoice lewat `due_date` otomatis jadi `overdue` (pg_cron / Edge Function harian) + notifikasi. Saat ini harus manual. |
| A13 | **Lampiran foto BAST** | Supabase Storage bucket privat + upload dari form BAST + tampil di PDF. |
| A14 | **UI manajemen user** | Admin kelola user & role dari aplikasi (`/dashboard/users`) — mengurangi ketergantungan SQL manual. |

---

## 3. ➖ Yang Perlu DIKURANGI / DIHAPUS

| # | Item | Lokasi | Detail | Dampak penghapusan |
|---|---|---|---|---|
| K1 | **`playwright` & `dotenv` dari dependencies** | `package.json` | Tidak pernah diimpor di `src/` (diverifikasi grep). `playwright` sangat berat (bundel browser ratusan MB). `dotenv` redundan — Next.js memuat `.env` native. | Install lebih cepat, permukaan audit lebih kecil. **Catatan:** jika e2e test (A6) akan ditulis, pindahkan `playwright` ke `devDependencies` — jangan biarkan nganggur di dependencies. |
| K2 | **Route `/dashboard/timesheets/new`** | `src/app/dashboard/timesheets/new/page.tsx` | Redundan total — `[module]/page.tsx` sudah menangani `?new=1` dengan perilaku identik. Dua route untuk satu perilaku = dua tempat dirawat. | Satu cara kerja yang benar. |
| K3 | **Fetch ganda `getWorkspaceData()`** | `dashboard/layout.tsx` + setiap `page.tsx` | Dipanggil 2× per request (layout DAN page). Bungkus dengan React `cache()` → -50% query per halaman, tanpa mengubah perilaku. | Query DB turun separuh. |
| K4 | **Dua jalur skema** | `schema.sql` vs `migrations/` | `schema.sql` cukup jadi snapshot legacy (jangan dijalankan lagi); jalur kanonik = `supabase/migrations/` + `src/db/schema.ts` untuk lokal. | Menghilangkan risiko drift. |
| K5 | **Kerentanan npm** | `package-lock.json` | `postcss ≤8.5.22` (HIGH): override ke `8.5.28` via `overrides` di package.json. `esbuild` lama via `@esbuild-kit/*` di dalam drizzle-kit (moderate, dev-only, risiko rendah): naikkan drizzle-kit saat rilis perbaikan; tidak bisa dihapus sekarang. | Audit hijau. |
| K6 | **Hardcoded values** | beberapa | PPN 11% (2 tempat), nama perusahaan di `/verify/doc` (hardcoded padahal ada `company_settings`), window 30-hari SIKO/asuransi. Jadikan konfigurasi/setting. | Perubahan tanpa deploy ulang. |
| K7 | **Pekerjaan di client yang seharusnya di server** | `module-workspace.tsx` (70+ baris JSX per baris, filter/sort/pagination client atas data penuh) | Pindah ke query SQL per modul (lihat O1). Ukuran bundel client turun, memori browser lega. | Skala & performa. |

---

## 4. ⚡ Yang Perlu DIOPTIMASI

| # | Item | Lokasi | Detail | Dampak |
|---|---|---|---|---|
| O1 | **Query per-modul + pagination server-side** | `src/lib/data.ts` | Ganti `SELECT *` 7 tabel penuh dengan query per halaman + `WHERE/LIMIT/OFFSET` + agregasi dashboard (`SUM … GROUP BY bulan`) di SQL. Saat ini seluruh tabel dikirim ke browser. | 🔴 Skala utama |
| O2 | **Indeks kolom FK & status** | `supabase/migrations/0005_performance_indexes.sql` | Sudah disiapkan — tinggal dijalankan. PostgreSQL tidak mengindeks FK otomatis. | 🔴 Query lambat |
| O3 | **Fix lint error `set-state-in-effect`** | `module-workspace.tsx:19` | Sinkronisasi props→state via `useEffect` adalah anti-pattern React 19 (deteksi baru eslint-plugin-react-hooks v6). Solusi idiomatik: reset state via `key` komponen saat props berubah, atau derived-state-with-prev pattern. | 🔴 Lint merah |
| O4 | **Warning a11y `alt-text`** | `pdf-document.tsx` | Gambar QR di PDF tanpa atribut alt. Tambah alt deskriptif. | 🟢 |
| O5 | **Bug arah sort** | `module-workspace.tsx` | Komparator `sort ? a.search.localeCompare(b.search) : 0` tidak pernah menghasilkan descending — toggle kedua tidak melakukan apa-apa (violasi kontrak `Array.compareFn`, sort jadi tidak deterministik). Buat tiga state: naik/turun/netral. | 🟢 UX |
| O6 | **Parsing tanggal TZ-aman** | beberapa tempat | `new Date('2026-01-31')` diparse sebagai UTC → perhitungan "kedaluwarsa 30 hari" bisa geser ±1 hari di WIB (UTC+7). Parse manual (y-m-d) atau Date lokal. | 🟢 Akurasi |
| O7 | **`recharts` lazy-load** | `overview.tsx` | Chart adalah paket JS terbesar tapi tidak terlihat saat first paint. `next/dynamic` dengan skeleton → TTI turun. | 🟡 TTI |
| O8 | **Status jadi `pgEnum` / union type Drizzle** | skema | `text` + CHECK bekerja, tapi enum memberi type-safety di Drizzle dan pesan error lebih jelas. Lakukan bersama migration berikutnya (bukan sekarang). | 🟡 Maintainability |
| O9 | **Validasi terpusat (Zod)** | `actions.ts` | Parser FormData manual sudah benar tapi duplikatif; satu schema Zod per modul bisa dipakai server-side dan memberi pesan error per-field untuk client. | 🟡 Maintainability |
| O10 | **Monitoring & health diperluas** | `api/health/route.ts` | Sekarang hanya `select 1`. Tambah: cek auth Supabase reachable, versi, uptime; plus error reporting terstruktur (Sentry atau APM Vercel). | 🟡 Operasional |

---

## 5. Urutan Eksekusi yang Disarankan

Mengikuti Fase 0 di `roadmap.md` — empat item pertama menutup semua temuan **merah** di tabel §1, total kurang dari satu hari kerja:

```
1. A1  Role check /api/report & /api/documents   ← 15 menit, dampak keamanan terbesar
2. O3  Fix lint error + O4 (alt-text)             ← lint hijau kembali
3. A2  Lazy-init DB → build lolos tanpa env       ← blokir CI hilang
4. K5  Override postcss 8.5.28                    ← HIGH vulnerability tertutup
5. A4  CI pipeline (lint+typecheck+build)         ← mencegah regresi
6. K1  Buang playwright/dotenv (atau pindah devDeps bila A6 jalan)
7. K3  cache() getWorkspaceData + O2 indeks       ← quick win performa
8. K2  Hapus route timesheets/new
─── sprint berikutnya ───
9.  A6 test finansial → O1 query per-modul → A7 audit log → A9 payment ledger
10. Sisanya sesuai prioritas di atas
```

---

## 6. Bukti Audit Lengkap

### 6.1 Lint (eslint 9, config `eslint-config-next` 16)

```text
src/components/module-workspace.tsx:19:17
  19 |  useEffect(()=>{setQuery(initialQuery);setStatus(initialStatus);...
     |                 ^^^^^^^^ Avoid calling setState() directly within an effect
  → react-hooks/set-state-in-effect  (ERROR)

src/components/pdf-document.tsx
  4:2984  warning  Image elements must have an alt prop  jsx-a11y/alt-text

✖ 2 problems (1 error, 1 warning)
```

### 6.2 Build produksi

```text
$ npm run build            # TANPA DATABASE_URL
✓ Compiled successfully in 14.1s
Error: Failed to collect configuration for /api/report
  [cause]: Error: DATABASE_URL is required
  >  7 |   throw new Error("DATABASE_URL is required");
Error: Failed to collect page data for /api/report

$ DATABASE_URL=... npm run build    # DENGAN env
✓ Compiled successfully — 10 route (2 static ○, 8 dynamic ƒ) + Proxy/Middleware
```

Artinya: kompilasi kode sehat; kegagalannya murni **init koneksi DB saat import** (A2).

### 6.3 `npm audit`

```text
postcss  <=8.5.22   Severity: HIGH
  - XSS via unescaped </style> in stringify output      (GHSA-qx2v-qp2m-jg93)
  - Arbitrary file read via sourceMappingURL in CSS     (GHSA-6g55-p6wh-862q)
  - Incomplete fix of GHSA-6g55-p6wh-862q               (GHSA-fxqj-rqcc-2cmp)
  - Path traversal in previous source map auto-loading  (GHSA-r28c-9q8g-f849)
  → fix: override postcss@8.5.28 (patch-level, aman)

esbuild  <=0.24.2   Severity: moderate (dev-only)
  - dev server request forgery (GHSA-67mh-4wv8-2f99)
  → via @esbuild-kit/* di dalam drizzle-kit; naikkan drizzle-kit saat rilis fix

5 vulnerabilities (4 moderate, 1 high)
```

### 6.4 Dependency tidak terpakai

```text
$ grep -rn "playwright\|dotenv" src/ --include='*.ts*'
(no results)   ← keduanya tidak pernah diimpor
```

### 6.5 Karakteristik build

```text
Route (app)                      Kind
/                                ○ static (redirect /dashboard)
/dashboard, /dashboard/[module], /dashboard/timesheets/new, /login, /verify/doc
/api/documents/[kind]/[id], /api/health, /api/report   ƒ dynamic
Proxy (Middleware)               — refresh sesi Supabase
```

Semua halaman dashboard dynamic (benar, karena `force-dynamic` + auth) — tidak ada masalah prerender.

---

*Dokumen ini bersifat snapshot audit per tanggal di atas. Jalankan ulang verifikasi §1 setelah setiap gelombang perbaikan; bila semua baris ✅, naikkan fokus ke Fase 1 (`roadmap.md`) — produksi Supabase.*
