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
9. **Sebelum `import` ikon baru dari `lucide-react`, cek `docs/icon-map.md`** — satu konsep = satu ikon, jangan pakai ulang ikon yang sudah dipetakan ke konsep lain.h).

## 6. Status terakhir (per 12 September 2026)

- ✅ Audit penuh selesai (`audit.md`) — 4 Quick Wins Utama **sudah dikerjakan**: role check route finansial (+ RLS invoices di migration 0004), lint bersih, lazy-init DB (build lolos tanpa env), postcss 8.5.28 (HIGH tertutup).
- ✅ **Audit UI/UX (`.zcode/audit/`)** — seluruh topik 01–04 + file modul sudah dieksekusi (night mode login-only, ikon, konsistensi form, kehalusan list); status detail kini di `.zcode/audit/README.md`. Sisa: 1 keputusan produk (`audit.md` O14); follow-up shell (scroll nav + sticky header) selesai 14 Sep 2026.
- ✅ Dokumentasi handoff lengkap: `roadmap.md`, `audit.md`, `supabase/README.md` (+ migrations 0001–0005, seed, template provisioning user).
- ✅ **Media layer foto fleet (R2)** — `media_files` (migrasi 0023) + Cloudflare Worker Media API (`media-worker/`, belum deploy) + kompresi WebP di browser + UI foto fleet (cover/galeri + thumbnail). Foto BAST **tidak disentuh** (Supabase Storage 0012). Arsitektur & keputusan: `docs/media-architecture.md` (§52 = acuan tertinggi; catat: Catatan Revisi lama di dokumen itu keliru — foto BAST memang sudah ada sejak A13). Tanpa `MEDIA_API_URL` fitur ini nonaktif; aplikasi tetap normal.
- ⏭️ Berikutnya: deploy bucket R2 + Worker (operator, `media-worker/README.md`) + isi `MEDIA_API_URL`; isi `#2`–`#7` (sisa Fase 0 cepat), lalu `#8`–`#9` — setelah itu Fase 1 mengikuti `supabase/README.md`. (Isu `#10` pagination server-side sudah dikerjakan; saat deploy jalankan juga migrasi `0017_pagination_indexes.sql` dan `0023_media_files.sql`.)
