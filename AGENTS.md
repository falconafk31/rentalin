# AGENTS.md — Panduan untuk AI Coding Agent

> File ini ditujukan bagi **agent AI** (Arena Agent Mode, GitHub Copilot coding agent, Claude Code, Cursor, dll.)
> yang melanjutkan pengembangan repository ini. **Baca dulu, kerjakan belakangan.**
> Panduan manusia ada di [`README.md`](README.md); file ini khusus onboarding agent.

---

## 1. Konteks proyek

**HeavyOps** — ERP internal perusahaan rental alat berat, antarmuka 100% Bahasa Indonesia.
Stack: Next.js 16 (App Router, Turbopack) · TypeScript · Drizzle ORM · PostgreSQL · Supabase Auth · Tailwind CSS 4 · `@react-pdf/renderer` · Recharts.

Siklus bisnis: **armada → kontrak → timesheet → persetujuan → invoice → PDF (SPH/BAST/Invoice) + QR verifikasi publik**.

## 2. Dokumen wajib baca (urutan ini)

| # | Dokumen | Isi untukmu |
|---|---|---|
| 1 | [`README.md`](README.md) | Fitur terimplementasi + model keamanan |
| 2 | [`roadmap.md`](roadmap.md) | Analisa arsitektur, alur kerja, matriks hak akses per role, roadmap 4 fase (sebagian item sudah ditandai ✅) |
| 3 | [`audit.md`](audit.md) | Temuan audit **terverifikasi tool** (lint/build/audit) + status perbaikan; kode item `A*` (tambah), `K*` (kurangi), `O*` (optimize) dipakai sebagai referensi lintas dokumen & issue |
| 4 | [`supabase/README.md`](supabase/README.md) | Struktur & alur migrasi Supabase 6 tahap, aturan change management skema, troubleshooting |
| 5 | [`docs/media-architecture.md`](docs/media-architecture.md) | Arsitektur media R2/Worker; baca bila task menyangkut foto fleet/BAST |
| 6 | [`docs/icon-map.md`](docs/icon-map.md) | Peta ikon lucide-react per konsep; cek sebelum import ikon baru |

## 3. Antrian kerja

- **Lihat GitHub Issues** — satu isu = satu tugas, body-nya merujuk kode item di `audit.md`/`roadmap.md`:
  `#2` CI pipeline · `#3` cache() fetch ganda · `#4` deps mati · `#5` route redundan · `#6` .env.example · `#7` security headers · `#8` test finansial · `#9` unify skema · `#10` pagination server-side.
- Urutan prioritas & alasan ada di `audit.md` §5. **Jangan mulai Fase 1 (produksi Supabase) sebelum sisa Fase 0 tuntas.**
- Isu lain (audit log, payment ledger, dst.) terdaftar di `roadmap.md` Fase 2 — buat isunya saat mulai dikerjakan.

## 4. Perintah

```sh
npm ci                          # install
npx drizzle-kit push            # sinkron skema ke DB lokal (butuh Postgres lokal sesuai drizzle.config.json)
npm run dev -- --turbopack      # dev server (mode pratinjau demo aktif tanpa env Supabase)
npm run lint                    # eslint — HARIS bersih (0 error, 0 warning)
npx tsc --noEmit                # typecheck — HARIS lolos
npm run build                   # SUDAH lolos tanpa DATABASE_URL (lazy-init) — verifikasi tetap dengan env -u DATABASE_URL
npm audit                       # tidak boleh ada severity HIGH
node scripts/finance-check.ts   # regresi finansial & M1.3 — HARUS lolos (0 FAIL)
node scripts/bast-check.ts      # regresi siklus hidup & snapshot BAST (M4.1) — HARUS lolos (0 FAIL)
```

## 5. Aturan main (WAJIB — pelanggaran = PR ditolak)

1. **Jangan merge ke `main` dan jangan push ke branch lain.** Agent bekerja di branch tugasnya masing-masing; **merge hanya oleh manusia via PR.**
2. **Mutasi data hanya lewat Server Actions** (`src/app/actions.ts`) dengan `requireUser([roles])` di awal setiap aksi. Jangan pernah percaya input/kondisi dari client.
3. **Dua dunia skema — jangan dicampur:**
   - Lokal/pratinjau: `src/db/schema.ts` via `drizzle-kit push`.
   - Produksi Supabase: `supabase/migrations/000N_*.sql` dijalankan berurutan.
   - `schema.sql` di root = snapshot legacy, **jangan dijalankan ke database mana pun**.
4. **Perubahan skema:** ubah `schema.ts` → uji lokal → buat **file migration BARU** (file lama immutable) → bila menyentuh RLS/role, uji dengan ketiga role → perbarui tabel dependensi & matriks di `supabase/README.md`.
5. **Otorisasi:** role dibaca dari tabel `profiles` (bukan metadata auth yang bisa diedit user). Route finansial (`/api/report`, PDF invoice) membutuhkan `admin/finance/operations`.
6. **UI & pesan error Bahasa Indonesia**; format uang/tanggal lewat `src/lib/format.ts`; jangan membuat landing page (`/` redirect ke dashboard, by design).
7. **Definition of done:** lint + typecheck + build (tanpa env) + `npm audit` tanpa HIGH semuanya hijau, **lalu** perbarui status item terkait di `audit.md`/`roadmap.md` pada commit yang sama.
8. **Gaya commit:** satu topik per commit, subjek ringkas Bahasa Indonesia (lihat `git log` untuk contoh).
9. **Sebelum `import` ikon baru dari `lucide-react`, cek `docs/icon-map.md`** — satu konsep = satu ikon, jangan pakai ulang ikon yang sudah dipetakan ke konsep lain.
10. **BAST (`handovers`) — siklus hidup & snapshot historis (M4.1, migrasi 0027). Jangan dilanggar fitur berikutnya:**
    - Status **satu arah `draft` → `final`**. Finalisasi hanya `admin`/`operations`, via `changeStatus('bast', id, 'final')` (transaksi + `SELECT … FOR UPDATE`, audit before/after). Jangan membuat setter status bebas.
    - BAST `final` **beku**: seluruh isi & snapshot immutable. Hanya `draft` yang boleh diubah melalui `saveRecord('bast', …)`.
    - `contractId`, `type`, `documentNumber` **immutable sejak pembuatan**, dijaga runtime `assertBastContentKeys()` (`src/lib/bast.ts`) — input UI yang di-disable bukan jaminan.
    - BAST baru **WAJIB menulis snapshot historis** dari baris DB yang sudah divalidasi: `client_name_snapshot`, `unit_code_snapshot`, `unit_model_snapshot`, `rate_at_handover`. Snapshot **tidak pernah** berasal dari input klien; baris warisan NULL **tidak pernah** di-backfill dari nilai live.
    - **PDF BAST memakai snapshot.** Snapshot NULL → tampilkan `Data historis tidak tersedia` / `Data tarif historis tidak tersedia` (fail-closed, pola M1.3). **Dilarang** menambahkan fallback ke kontrak/klien/unit/tarif yang berlaku sekarang, termasuk lewat variabel template (`{{nama_klien}}`, `{{tarif_per_jam}}`, `{{nama_pic_klien}}`).
    - Validasi tanggal: BAST wajib berada di dalam periode kontrak, dan `mobilisasi ≤ demobilisasi` (divalidasi server-side di dalam transaksi; pembuatan BAST mengunci baris kontrak `FOR UPDATE`).
    - **Penyuntingan BAST `draft` WAJIB mengunci baris KONTRAK `FOR UPDATE` sebelum validasi tanggal** — urutan lock `handovers → contracts` (selaras `resetDatabase()`: DELETE handovers sebelum contracts) supaya serialisasi dengan `reviseContract()`. Tanpa lock itu, revisi kontrak bisa commit di antara validasi dan `UPDATE` BAST sehingga tanggal divalidasi terhadap periode kontrak yang sudah usang. **Jangan melemahkan lock ini** tanpa meninjau ulang urutan lock & risiko deadlock (create BAST & `reviseContract` mengunci kontrak lebih dulu; finalisasi BAST hanya mengunci baris BAST; tidak ada jalur yang memegang lock kontrak lalu menunggu lock baris BAST).
    - **BAST = bukti operasional saja.** BAST tidak boleh mengubah total invoice, snapshot tarif timesheet, atau tarif kontrak, dan tidak boleh menjadi sumber tagihan tersembunyi — sumber finansial tetap M1.3 (Contract → Approved Timesheet Snapshot → Invoice → PDF).
    - Foto BAST tetap di Supabase Storage bucket `bast-photos` (migrasi 0012); jangan pindahkan ke R2 tanpa migrasi baru.
    - Uji wajib: `node scripts/bast-check.ts` (dijalankan CI bersama `finance-check.ts`).

## 6. Status terakhir (per 15 September 2026)

- ✅ **Audit & Fondasi Awal Selesai (`audit.md`)** — 4 Quick Wins Utama, audit UI/UX (`.zcode/audit/`), lazy-init DB (build tanpa env), shell follow-up (scroll nav + sticky header), serta dokumentasi handoff awal.
- ✅ **Media Layer Foto Fleet (R2)** — `media_files` (migrasi 0023) + Cloudflare Worker Media API (`media-worker/`, belum deploy) + kompresi WebP di browser + UI foto fleet (cover/galeri + thumbnail). Foto BAST tetap di Supabase Storage (migrasi 0012).
- ✅ **M0 · Perbaikan Bug Tagihan Wet-Hire (PR #27)** — `subtotal = equipment + operator` konsisten di `finance.ts`, validasi jam efektif $> 0$, dan invariant database `subtotal = total - tax` terpenuhi.
- ✅ **M1 / M1.3 · Snapshot Tarif Penagihan Timesheet (PR #28)** —
  - Tarif sewa alat dan jasa operator dibekukan saat persetujuan catatan kerja (`pending` $\rightarrow$ `approved`) ke kolom snapshot: `billing_rate_snapshot`, `operator_rate_snapshot`, `operator_rate_type_snapshot`.
  - Revisi kontrak tidak lagi merusak/mengubah tarif penagihan historis catatan kerja yang sudah disetujui.
  - Perhitungan invoice (pratinjau UI maupun penyimpanan nyata) menggunakan fungsi terpusat `calcInvoiceTotalsFromSnapshots()`.
  - PDF faktur invoice menampilkan tarif historis snapshot, breakdown multi-tarif, atau pesan aman `"Data tarif historis tidak tersedia"` / `"Data tarif historis tidak lengkap"` (tidak pernah fallback ke tarif kontrak aktif).
  - Anti-flash boot script dark mode ditempatkan di root layout `src/app/layout.tsx` via `next/script` (`beforeInteractive`) dan konstanta tema bersama diekstrak ke `src/lib/dashboard-theme.ts`.
  - Migrasi `0026_timesheet_billing_snapshots.sql` dibuat dan diaplikasikan ke database produksi (backfill konservatif: unbilled approved saja; invoice lama tetap NULL agar tidak memalsukan data historis).
- ✅ **M2 / M2.1 · Integritas Skema Pembayaran & Ledger Seed (PR #29)** —
  - Serialisasi transaksi pembayaran via `SELECT ... FROM invoices FOR UPDATE` diverifikasi aman dari overpayment dan race conditions.
  - Check constraint tabel `payments` di `src/db/schema.ts` disinkronkan dengan migrasi produksi `0010_payments.sql` (`amount > 0` dan `method IN ('transfer', 'cash', 'giro', 'other')`).
  - `src/db/seed.ts` otomatis menerbitkan baris ledger pembayaran untuk invoice demo berstatus `paid`.
- ✅ **M3 / M3.1 · Penguatan Skema & Validasi Kontrak/Timesheet (PR #30)** —
  - Check constraint Drizzle di `src/db/schema.ts` disinkronkan penuh untuk `contracts` (`rate_per_hour > 0`, `operator_rate_type IN ('hourly', 'daily')`), `timesheets` (`timesheets_operator_snapshot_consistent`), dan `operators` (`rate_per_hour >= 0`, `rate_per_day >= 0`, `default_rate_type IN ('hourly', 'daily')`, `status IN ('active', 'inactive')`).
  - Uji regresi finansial & batas operasional di `scripts/finance-check.ts` diperluas menjadi **87/87 assertions PASS** across 16 skenario (hitungan diverifikasi ulang saat M4.1; sebelumnya tertulis 86 — file uji tidak diubah pada M4.1).
- ✅ **M4 / M4.1 · Siklus Hidup & Snapshot Historis BAST (migrasi 0027, PR #31)** —
  - Audit read-only M4 (tanpa perubahan kode) menemukan F1 (BAST dapat diubah setelah dibuat) & F2 (PDF BAST membaca kontrak/klien/unit live) sebagai P1.
  - `handovers.status` (`draft`/`final`, CHECK) + snapshot historis `client_name_snapshot`, `unit_code_snapshot`, `unit_model_snapshot`, `rate_at_handover` (nullable, CHECK tarif > 0).
  - `contractId`/`type`/`documentNumber` immutable sejak pembuatan (guard runtime `assertBastContentKeys`); BAST `final` beku seluruhnya.
  - Validasi tanggal: BAST wajib di dalam periode kontrak (`mobilisasi ≤ demobilisasi`), divalidasi di dalam transaksi yang mengunci baris kontrak `FOR UPDATE`.
  - Finalisasi eksplisit `draft → final` lewat `changeStatus('bast', …)`: transaksi, `SELECT … FOR UPDATE`, audit before/after, finalisasi ulang ditolak, bukan setter status generik.
  - PDF BAST (termasuk variabel template) memakai snapshot historis dengan fail-closed "Data historis tidak tersedia" / "Data tarif historis tidak tersedia" — tidak pernah jatuh ke data live.
  - Regresi baru `scripts/bast-check.ts` (**53 assertion** = 45 baseline + 8 uji invarian urutan lock M4.1 follow-up, dijalankan CI) di samping `finance-check.ts` yang tetap 0 FAIL.
  - Follow-up PR #31 (concurrency): penyuntingan BAST draf kini **mengunci baris kontrak `FOR UPDATE` sebelum validasi tanggal** sehingga serialisasi dengan `reviseContract()`; urutan lock `handovers → contracts` didokumentasikan di `src/app/actions.ts` dan dijaga uji invarian statis (bukan uji konkurensi PostgreSQL).
  - Migrasi 0027 **belum dijalankan di produksi** (review terpisah). Baris lama tetap `draft` dengan snapshot NULL dan difinalkan secara eksplisit oleh admin/operations.
- ⏭️ **Berikutnya**:
  - **Terapkan migrasi `0027_bast_lifecycle_snapshots.sql`** ke produksi (review terpisah setelah PR #31) — sebelum itu baris lama tetap `draft` dan PDF BAST menampilkan pesan aman untuk nilai historis yang belum terbukti.
  - Deploy bucket R2 + Cloudflare Worker Media API (operator, panduan di `media-worker/README.md`) + set `MEDIA_API_URL`.
  - Lanjutkan isu Fase 0 & Fase 2 sesuai prioritas di `roadmap.md` (mis. audit log viewer per-record, notifikasi jatuh tempo otomatis).
