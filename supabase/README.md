# Supabase — Struktur & Alur Migrasi Lengkap

> **README khusus folder `supabase/`.** Ini BUKAN README utama aplikasi — README utama tetap di [`README.md`](../README.md) di root, dan analisa/roadmap umum di [`roadmap.md`](../roadmap.md).
>
> Dokumen ini membahas satu hal: **bagaimana struktur dan alur migrasi database + auth aplikasi HeavyOps ke Supabase**, dari nol sampai go-live, plus alur perubahan skema yang berjalan setelahnya.

---

## Daftar Isi

1. [Status Saat Ini](#1-status-saat-ini)
2. [Struktur Folder Lengkap](#2-struktur-folder-lengkap)
3. [Tiga Artefak Skema & Perannya](#3-tiga-artefak-skema--perannya)
4. [Alur Migrasi End-to-End (Gambar Besar)](#4-alur-migrasi-end-to-end-gambar-besar)
5. [Tahapan Migrasi Detail (Tahap 0–6)](#5-tahapan-migrasi-detail)
6. [Urutan & Dependensi File Migration](#6-urutan--dependensi-file-migration)
7. [Alur Perubahan Skema Berjalan (Change Management)](#7-alur-perubahan-skema-berjalan-change-management)
8. [Matriks RLS Ringkas](#8-matriks-rls-ringkas)
9. [Variabel Environment](#9-variabel-environment)
10. [Verifikasi Pasca-Migrasi](#10-verifikasi-pasca-migrasi)
11. [Rollback & Backup](#11-rollback--backup)
12. [Troubleshooting Umum](#12-troubleshooting-umum)

---

## 1. Status Saat Ini

| Komponen | Kondisi di branch ini |
|---|---|
| Integrasi Supabase Auth di aplikasi | ✅ Sudah ada (`src/lib/auth.ts`, `src/proxy.ts`, `src/app/actions.ts`) |
| Skema produksi satu file | ✅ Ada di root: `schema.sql` (legacy, lihat §3) |
| Skema Drizzle untuk lokal/pratinjau | ✅ Ada di `src/db/schema.ts` |
| **Folder `supabase/migrations/`** | ✅ **Baru dibuat di branch ini** — skema dipecah jadi migration berurutan (jalur kanonik baru) |
| Project Supabase produksi | ⬜ Belum dibuat — mulai dari [Tahap 0](#tahap-0--persiapan) |

---

## 2. Struktur Folder Lengkap

```
supabase/
├── README.md                            ← Anda di sini (panduan alur migrasi)
│
├── migrations/                          ★ JALUR KANONIK SKEMA PRODUKSI
│   │                                      Dijalankan BERURUTAN ke database
│   │                                      Supabase yang FRESH, satu kali per file.
│   ├── 0001_core_tables.sql             profiles · clients · fleet · contracts
│   │                                    + partial unique index (1 kontrak aktif/unit)
│   ├── 0002_operations_tables.sql       timesheets (generated columns) · invoices
│   │                                    · ALTER timesheets.invoice_id · handovers
│   │                                    · company_settings
│   ├── 0003_functions.sql               current_app_role() — pembaca role utk RLS
│   ├── 0004_rls_policies.sql            ENABLE RLS + semua kebijakan per role
│   ├── 0005_performance_indexes.sql     indeks kolom FK & status (roadmap Fase 0.6)
│   ├── 0006_bast_checklist.sql            9 kolom boolean BAST (migrasi 0006, tabel handovers)
│   ├── 0007_contract_revisions.sql        tabel contract_revisions + RLS (dependen 0001/0003/0004)
│   ├── 0008_signer_fields.sql             kolom signer_name + signer_title di company_settings (dependen 0002)
│   ├── 0009_company_config.sql            tarif PPN + ambang peringatan dokumen (dependen 0002)
│   ├── 0010_payments.sql                  tabel payments (ledger pembayaran) + RLS (dependen 0001)
│   ├── 0011_audit_log.sql                 tabel audit_log (append-only) + RLS (dependen 0001)
│   ├── 0012_bast_photos.sql               kolom photo_urls di handovers + bucket Storage (dependen 0002/0003)
│   ├── 0013_user_invite_trigger.sql       trigger profil otomatis user undangan (dependen 0001)
│   ├── 0014_invoice_tax_snapshot.sql      kolom subtotal_amount + tax_rate di invoices (dependen 0002)
│   ├── 0015_payment_notes.sql             kolom notes di payments (dependen 0010)
│   ├── 0016_invoice_snapshot_guard.sql    validasi + CHECK snapshot pajak historis (dependen 0014)
│   ├── 0017_pagination_indexes.sql        indeks paginasi server-side (dependen 0002)
│   ├── 0018_company_locale.sql            kota penandatanganan + zona waktu (dependen 0002)
│   ├── 0019_payment_identity.sql          rekening bank, NPWP, KTP penandatangan (dependen 0002)
│   ├── 0020_document_templates.sql        tabel document_templates + RLS + seed 4 template (dependen 0003/0004)
│   ├── 0021_handover_uniqueness.sql       unique constraint BAST (contract_id, type) (dependen 0002/0006)
│   ├── 0022_handover_uniqueness_idempotent.sql  guard idempoten 0021 (dependen 0021)
│   ├── 0023_media_files.sql               tabel media_files + RLS (dependen 0001/0003/0004)
│   ├── 0024_operators.sql                 tabel operators + contract_operators + RLS (dependen 0001/0003)
│   ├── 0025_invoice_operator_amount.sql   kolom operator_amount di invoices (dependen 0002)
│   ├── 0026_timesheet_billing_snapshots.sql kolom snapshot tarif pada timesheets (dependen 0002/0024)
│   └── 0027_bast_lifecycle_snapshots.sql status draft/final + snapshot historis BAST (dependen 0002/0006/0021)
│
├── seed/
│   └── bootstrap_settings.sql           baris awal company_settings (kop surat);
│                                         setelah go-live diedit via modul Pengaturan
│
└── templates/
    └── provision_user.sql               template provisioning 1 pengguna:
                                          auth.users + profiles + role + verifikasi
```

> Kenapa `supabase/`, bukan `src/db/`? `src/db/` adalah kode aplikasi Drizzle (koneksi & definisi ORM). Memisahkan artefak migrasi Supabase ke folder sendiri mencegah kecampuran tanggung jawab — dan `supabase/migrations/` adalah direktori konvensi bawaan Supabase CLI, sehingga kompatibel dengan tooling resminya.

---

## 3. Tiga Artefak Skema & Perannya

Repo ini punya tiga file yang menyangkut skema. **Perannya berbeda dan harus dipahami supaya tidak drift:**

```
┌─────────────────────────┐
│ src/db/schema.ts        │  DEFINISI DRIZZLE (satu bahasa dengan aplikasi)
│ (TypeScript)            │  → dipakai di LOKAL:  npx drizzle-kit push
└───────────┬─────────────┘    → pratinjau dev + seed demo otomatis
            │
            │ "diterjemahkan" (lihat §7) saat ada perubahan skema
            ▼
┌─────────────────────────┐
│ supabase/migrations/*.sql│  SQL BERURUTAN → STAGING & PRODUKSI Supabase
│ (jalur kanonik BARU)    │  → termasuk bagian Supabase-specific:
└───────────┬─────────────┘    FK auth.users, RLS, fungsi role
            │
            │ diekstrak/snapshot dari
            ▼
┌─────────────────────────┐
│ schema.sql (root)       │  SNAPSHOT LEGACY satu file — DIPERTAHANKAN
│                         │  sebagai referensi histori SAJA.
└─────────────────────────┘  ⚠️ JANGAN dijalankan lagi ke database mana pun
                                yang sudah pakai migrations/ (berisiko dobel).
```

**Aturan main:**

1. Database **lokal/pratinjau** → hanya `drizzle-kit push` dari `src/db/schema.ts`.
2. Database **Supabase staging/produksi** → hanya `supabase/migrations/` berurutan.
3. **Jangan pernah** menjalankan `schema.sql` DAN `drizzle-kit push` (atau migrations) ke database yang sama — peringatan yang sama ada di README utama.
4. Setiap perubahan skema lahir di `schema.ts`, lalu diangkat jadi file `000N_*.sql` baru (lihat §7).

---

## 4. Alur Migrasi End-to-End (Gambar Besar)

```
 TAHPAP 0            TAHPAP 1             TAHPAP 2            TAHPAP 3
 Persiapan           Skema DB             Auth & User         Data Awal
┌───────────┐      ┌───────────┐       ┌─────────────┐      ┌─────────────┐
│ Buat       │      │ Jalankan  │       │ Signup OFF, │      │ seed/       │
│ project    │─────▶│ migrations│──────▶│ URL config, │─────▶│ bootstrap + │
│ Supabase   │      │ 0001→0005 │       │ SMTP        │      │ (opsional)  │
│ (SG region)│      │ berurutan │       │             │      │ impor data  │
└───────────┘      └───────────┘       └──────┬──────┘      └──────┬──────┘
                                              │ provision_user.sql │
                                              ▼ (per pengguna)     │
                                       ┌─────────────┐             │
                                       │ auth.users + │            │
                                       │ profiles     │            │
                                       └─────────────┘             │
                                                                    │
   TAHPAP 5            TAHPAP 4                                     │
   Validasi &          Cutover Aplikasi                             │
  ┌────────────┐      ┌────────────┐                                 │
  │ Smoke test │      │ Env Vercel │    ◀────────────────────────────┘
  │ semua modul│◀─────│ + pooler   │
  │ + QR verify│      │ + deploy   │
  └──────┬─────┘      └────────────┘
         │
         ▼
   ┌──────────┐      lalu berjalan terus:
   │ GO-LIVE  │────▶ §7 change management (schema.ts → migrations baru)
   └──────────┘
```

Prinsip yang mengikat seluruh alur:

- **Fresh database.** Migrasi dijalankan sekali pada database kosong; jangan menumpuk jalur.
- **Urutan sakral.** `0001 → 0005` tidak boleh dilompati/dibalik (FK & fungsi punya dependensi).
- **Dua lapis keamanan.** RLS (migrations 0004) mengamankan jalur Data API Supabase; otorisasi aplikasi (`requireUser` di Server Actions) mengamankan jalur Drizzle. Keduanya aktif bersamaan — tidak ada yang menggantikan yang lain.
- **Fail-closed.** Tanpa env Supabase di Vercel, login menolak akses (tidak ada mode demo di produksi).

---

## 5. Tahapan Migrasi Detail

### Tahap 0 · Persiapan

- [ ] Buat project Supabase (region terdekat: **Singapore**), catat `project ref` & region.
- [ ] Catat kredensial: Project URL, publishable/anon key, connection string **session pooler**.
- [ ] Pastikan siapa saja (orang/role) berhak jadi `admin` awal aplikasi.
- [ ] Tentukan domain produksi (untuk `NEXT_PUBLIC_APP_URL` dan redirect auth).

### Tahap 1 · Skema Database

Jalankan migration **berurutan** ke database Supabase yang masih kosong:

```sh
# Opsi A — psql (paling eksplisit; berhenti saat ada error)
export SUPABASE_DB_URL="postgresql://postgres.<ref>:<pwd>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require"
for f in supabase/migrations/*.sql; do
  echo "== $f"; psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f" || break
done

# Opsi B — Supabase CLI (mencatat histori di tabel supabase_migrations)
supabase link --project-ref <ref>
supabase db push            # membaca supabase/migrations/ secara berurutan
```

> File bernomor urut (`0001_…`) kompatibel dengan `supabase db push`. Bila versi CLI Anda menuntut format timestamp, cukup rename: `0001_core_tables.sql` → `20260911000001_core_tables.sql`, dst.

Verifikasi cepat setelah Tahap 1:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;   -- harapkan 15 tabel
```

### Tahap 2 · Auth & Provisioning User

- [ ] **Authentication → Sign In/Up**: matikan **"Enable Signup"** (aplikasi internal; satu-satunya jalan masuk = provisioning admin).
- [ ] **Authentication → URL Configuration**: Site URL = domain produksi; tambahkan `<domain>/login` dan `<domain>/dashboard` ke Redirect URLs.
- [ ] (Disarankan) Custom SMTP + template email untuk reset password.
- [ ] Buat user + profile memakai [`templates/provision_user.sql`](templates/provision_user.sql) — **satu file per pengguna**, urutannya: buat `auth.users` dulu, baru INSERT `profiles`.

```text
alur provisioning per pengguna:
  Dashboard/Auth → Add user (auto-confirm) ──► salin UUID
        │
        ▼
  INSERT profiles (id=UUID, nama, role)  ──► user bisa login ke /dashboard
```

Tanpa baris `profiles`, login akan gagal dengan pesan *"Profil pengguna belum terdaftar"* — perilaku ini memang by design (fail-closed).

### Tahap 3 · Data Awal & Data Historis

- [ ] Jalankan [`seed/bootstrap_settings.sql`](seed/bootstrap_settings.sql) (kop surat perusahaan).
- [ ] *(Opsional, bila ada sistem lama)* impor data nyata dengan urutan yang sama seperti FK: `clients → fleet → contracts → timesheets → invoices → handovers`. Validasi dulu di staging: jumlah baris per tabel, kontrak aktif ≤ 1 per unit, timesheet approved yang belum tertagih.

### Tahap 4 · Cutover Aplikasi

Set env di Vercel lalu deploy:

| Variabel | Nilai |
|---|---|
| `DATABASE_URL` | Session pooler Supabase, port **5432**, `sslmode=require` |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` *(atau `ANON_KEY`)* | Kunci publik — **bukan service role** |
| `NEXT_PUBLIC_APP_URL` | `https://<domain>` (dipakai tautan QR di PDF) |

```sh
curl -s https://<domain>/api/health     # harapkan {"ok":true}
```

> **Pooler itu wajib**, bukan opsional: Vercel serverless membuka banyak koneksi pendek; tanpa Supavisor, kuota koneksi Postgres habis. Pakai session pooler (5432); transaksi Drizzle multi-statement (`FOR UPDATE`) butuh sesi stabil, jadi hindari transaction pooler (6543) untuk `DATABASE_URL` aplikasi.

### Tahap 5 · Validasi & Go-Live

Smoke test end-to-end (pakai akun per role):

```text
□ admin    : login → lengkapi Pengaturan → buat unit, klien, kontrak
□ operator : login → input timesheet (harus gagal bila mengedit invoice)
□ operations: approve/reject timesheet → selesaikan kontrak → unit kembali 'available'
□ finance  : buat invoice dari jam disetujui → PDF terbit → tandai lunas
□ semua    : unduh PDF invoice/SPH/BAST → pindai QR → /verify/doc tampil "Terverifikasi"
□ negatif  : user tanpa profiles menolak; operator tak bisa akses /api/report & PDF invoice
□ /api/health ok; tidak ada error di log Vercel
```

- [ ] Aktifkan backup/PITR harian di dashboard Supabase.
- [ ] Simpan `project ref`, region, dan daftar admin awal di vault tim.

### Tahap 6 · Operasi Berjalan

Lanjut ke §7 (change management) — alur ini yang dipakai selamanya setelah go-live.

---

## 6. Urutan & Dependensi File Migration

| # | File | Isi | Dependensi |
|---|---|---|---|
| 1 | `0001_core_tables.sql` | `profiles` (FK `auth.users`), `clients`, `fleet`, `contracts` + partial unique index | Skema `auth` bawaan Supabase |
| 2 | `0002_operations_tables.sql` | `timesheets` (generated columns + CHECK + unique harian), `invoices`, `ALTER timesheets ADD invoice_id`, `handovers`, `company_settings` | #1 (contracts, fleet, profiles) |
| 3 | `0003_functions.sql` | `current_app_role()` — `SECURITY DEFINER`, baca role dari `profiles` | #1 (profiles) |
| 4 | `0004_rls_policies.sql` | ENABLE RLS + policy: `staff_read` (tabel non-invoice), `invoice_read` (admin/operations/finance — **operator tidak dapat membaca invoice**), `operations_write`, `timesheet_submit`, `timesheet_review`, `invoice_write`, `settings_admin`, `profile_*` | #2 (semua tabel) + #3 (fungsi) |
| 5 | `0005_performance_indexes.sql` | Indeks FK (`contracts.client_id`, `invoices.contract_id`, `handovers.contract_id`, `timesheets.operator_id/invoice_id`) + `fleet.status` | #2 (idempotent, `IF NOT EXISTS`) |
| 6 | `0006_bast_checklist.sql` | 9 kolom boolean BAST (`oil`…`documents`, NOT NULL DEFAULT TRUE) | #2 (tabel `handovers`) |
| 7 | `0007_contract_revisions.sql` | Tabel `contract_revisions` + indeks + RLS (`staff_read` semua role, `operations_write` admin/operations) | #1 (`contracts`, `fleet`, `profiles`) + #3/#4 (fungsi & pola RLS) |
| 8 | `0008_signer_fields.sql` | Kolom `signer_name` + `signer_title` di `company_settings` untuk blok TTD PDF | #2 (tabel `company_settings`) |
| 9 | `0009_company_config.sql` | Tarif PPN + ambang peringatan dokumen di `company_settings` (sebelumnya hardcode 11%) | #2 (company_settings) |
| 10 | `0010_payments.sql` | Tabel `payments` (ledger pembayaran per transaksi, cicilan/penuh) + RLS + indeks | #1 (invoices, profiles) |
| 11 | `0011_audit_log.sql` | Tabel `audit_log` (append-only, tanpa FK profiles) + RLS | #1 (profiles) |
| 12 | `0012_bast_photos.sql` | Kolom `photo_urls` di `handovers` + bucket Storage privat `bast-photos` | #2 (handovers) + #3 |
| 13 | `0013_user_invite_trigger.sql` | Trigger profil otomatis untuk user undangan (auth → profiles, anti eskalasi role) | #1 (profiles) |
| 14 | `0014_invoice_tax_snapshot.sql` | Kolom `subtotal_amount` + `tax_rate` di `invoices` (snapshot pajak historis) + backfill | #2 (invoices) |
| 15 | `0015_payment_notes.sql` | Kolom `notes` di `payments` | #10 (payments) |
| 16 | `0016_invoice_snapshot_guard.sql` | Validasi + CHECK constraint snapshot pajak historis (gagal eksplisit, tanpa repair otomatis) | #14 (kolom subtotal/tax_rate) |
| 17 | `0017_pagination_indexes.sql` | Indeks paginasi server-side (ORDER BY + filter status) untuk semua tabel utama | #2 (idempotent) |
| 18 | `0018_company_locale.sql` | Kolom kota penandatanganan + zona waktu di `company_settings` | #2 (company_settings) |
| 19 | `0019_payment_identity.sql` | Rekening bank, NPWP, No. KTP penandatangan di `company_settings` + `clients` | #2 (company_settings, clients) |
| 20 | `0020_document_templates.sql` | Tabel `document_templates` + RLS + seed 4 template PDF | #3/#4 (fungsi & pola RLS) |
| 21 | `0021_handover_uniqueness.sql` | Bersihkan duplikat BAST + unique constraint `(contract_id, type)` | #2 (handovers) + #6 |
| 22 | `0022_handover_uniqueness_idempotent.sql` | Guard idempoten `handovers_contract_type_unique` (pola 0016) — aman di-rerun bila 0021 terputus parsial (error 42P07) | #21 |
| 23 | `0023_media_files.sql` | Tabel `media_files` (metadata media layer; binary di Cloudflare R2) + indeks entity/status + RLS (baca semua role internal; tulis admin/operations/operator; hapus admin/operations). Lihat `docs/media-architecture.md` | #1 (profiles, fleet) + #3 (fungsi) + #4 (pola RLS) |
| 24 | `0024_operators.sql` | Tabel `operators` (registri personel: SIO/SIM/tarif) + `contract_operators` (assignment M:N) + RLS + indeks | #1 (contracts, fleet, profiles) + #3 |
| 25 | `0025_invoice_operator_amount.sql` | Kolom `operator_amount` di `invoices` (pecahan biaya operator dari total tagihan) | #2 (invoices) |
| 26 | `0026_timesheet_billing_snapshots.sql` | Kolom snapshot tarif pada `timesheets` (`billing_rate_snapshot`, `operator_rate_snapshot`, `operator_rate_type_snapshot`) + backfill konservatif | #2 (timesheets) + #24 (operator fields) |
| 27 | `0027_bast_lifecycle_snapshots.sql` | Kolom `status` (`draft`/`final`, CHECK) + snapshot historis BAST (`client_name_snapshot`, `unit_code_snapshot`, `unit_model_snapshot`, `rate_at_handover`, CHECK tarif > 0) + indeks status. **Tanpa backfill** (fail-closed pola 0026: baris lama tetap `draft` & snapshot NULL) | #2 (handovers) + #6 (checklist) + #21 (unique) |

```
0001 ──► 0002 ──► 0004       0009, 0014 ──► 0016
  │        ▲       ▲           │        0018, 0019
  │        │       │           ▼
  └─► 0003 ┘       │         0010 ──► 0015
                   │         0011, 0012, 0013
       0005 (setelah 0002)   0017 (setelah 0002)
       0006 ──► 0021 ──► 0022
       0008 (setelah 0002)
       0020 (setelah 0003/0004)
       0023 (setelah 0001/0003/0004)
       0024 (setelah 0001/0003)
       0025 (setelah 0002)
       0026 (setelah 0002/0024)
       0027 (setelah 0002/0006/0021)
```

Perbandingan dengan `schema.sql` lama: **isi SQL identik**, hanya dipecah berurutan + diberi header dependensi + file indeks tambahan. `schema.sql` di root kini berstatus *snapshot legacy* (§3).

---

## 7. Alur Perubahan Skema Berjalan (Change Management)

Setelah go-live, setiap perubahan skema mengikuti satu jalur:

```
 1. UBAH                2. UJI LOKAL              3. ANGKAT KE MIGRATION
┌──────────────┐      ┌───────────────┐        ┌─────────────────────────────┐
│ edit          │      │ npx            │        │ buat file BARU:              │
│ src/db/       │─────▶│ drizzle-kit    │───────▶│ supabase/migrations/         │
│ schema.ts     │      │ push           │        │ 000N_<deskripsi>.sql         │
│ (Drizzle)     │      │ (DB lokal dev) │        │ (salin SQL hasil generate,   │
└──────────────┘      └───────────────┘        │  tulis ulang bagian yang      │
                                               │  Supabase-specific bila perlu)│
                                               └──────────────┬───────────────┘
                                                              │ 4. REVIEW & TERAPKAN
                                              ┌───────────────┴───────────────┐
                                              ▼                               ▼
                                     STAGING Supabase                 PRODUKSI Supabase
                                     (db push + uji app)              (db push; SETELAH
                                                                       PR disetujui & backup)
```

Aturan change management:

1. **Tambah file baru, jangan edit file lama.** Migration yang sudah jalan di produksi bersifat immutable; koreksi = migration berikutnya.
2. Selalu uji di **staging** (bisa clone project Supabase atau project kedua gratis tier) sebelum produksi.
3. Sinkronkan `src/db/schema.ts` di commit yang sama, agar pratinjau lokal & produksi tidak drift (temuan §4.4 roadmap.md).
4. Bila perubahan menyentuh RLS/fungsi role, uji dengan **ketiga role** (admin, operations/operator, finance) sebelum merge.

---

## 8. Matriks RLS Ringkas

Kebijakan di `0004_rls_policies.sql` dan migrasi lanjutan (`0007`, `0010`, `0011`, `0020`, `0023`, `0024`) — berlaku untuk akses via Supabase Data API; aplikasi Drizzle berotorisasi sendiri di Server Actions:

| Tabel | SELECT | INSERT | UPDATE | DELETE | Ketentuan khusus |
|---|---|---|---|---|---|
| `profiles` | diri sendiri / admin | admin | admin | admin | — |
| `clients` | semua role internal | admin, operations | admin, operations | admin, operations | — |
| `fleet` | semua role internal | admin, operations | admin, operations | admin, operations | — |
| `contracts` | semua role internal | admin, operations | admin, operations | admin, operations | — |
| `timesheets` | semua role internal | admin, operations, **operator** | admin, operations | — | operator: hanya `operator_id = auth.uid()`, `status='pending'`, `invoice_id IS NULL` |
| `invoices` | admin, operations, finance | admin, finance | admin, finance | admin, finance | operator sengaja tidak diberi akses baca — selaras pembatasan route PDF invoice & CSV laporan |
| `handovers` | semua role internal | admin, operations | admin, operations | admin, operations | — |
| `contract_revisions` | semua role internal | admin, operations | admin, operations | admin, operations | Revisi = amandemen bernomor + alasan; tarif baru hanya untuk jam belum tertagih |
| `company_settings` | semua role internal | admin | admin | admin | — |
| `payments` | admin, operations, finance | admin, finance | admin, finance | admin, finance | Selaras invoices; operator tidak dapat melihat pembayaran |
| `audit_log` | admin | semua role internal (INSERT only) | — | — | Append-only: tidak ada policy UPDATE/DELETE; immutable |
| `document_templates` | semua role internal | admin | admin | admin | Template PDF dinamis; publish/rollback admin-only via Server Actions |
| `media_files` | semua role internal | admin, operations, operator | admin, operations, operator | admin, operations | Metadata foto fleet (binary di R2, bukan DB); Worker Media API membaca via Data API (SELECT-only) — tulis hanya oleh Server Action aplikasi |
| `operators` | semua role internal | admin, operations | admin, operations | admin, operations | Registri personel (SIO/SIM/tarif); cermin policy fleet |
| `contract_operators` | semua role internal | admin, operations | admin, operations | admin, operations | Assignment operator ke kontrak (M:N) |

---

## 9. Variabel Environment

| Variabel | Dipakai di | Fungsi |
|---|---|---|
| `DATABASE_URL` | Server (Drizzle) | Session pooler Supabase `:5432` + `sslmode=require` |
| `NEXT_PUBLIC_SUPABASE_URL` | Server + Client | URL project (auth) |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Server + Client | Kunci publik auth |
| `NEXT_PUBLIC_APP_URL` | Server (PDF) | Origin kanonik untuk tautan QR `/verify/doc` |
| `VERCEL` | Otomatis | Menonaktifkan mode pratinjau demo |
| `MEDIA_API_URL` | Server (lib/media.ts) | URL publik Cloudflare Worker Media API — tanpa ini fitur foto fleet nonaktif (aplikasi tetap normal). Kredensial R2 TIDAK pernah di aplikasi (hanya Worker Secrets) |

> `SUPABASE_SERVICE_ROLE_KEY` **tidak dipakai dan tidak boleh** ditambahkan ke aplikasi ini — semua akses DB sudah lewat `DATABASE_URL` trusted di server.
>
> Demikian pula **jangan** menambahkan variabel `NEXT_PUBLIC_*` maupun `R2_*` rahasia ke environment Next.js/Vercel — seluruh kredensial R2 hidup sebagai Worker Secrets (lihat `media-worker/README.md`, doc media §7/§26).

---

## 10. Verifikasi Pasca-Migrasi

Jalankan di SQL Editor Supabase setelah Tahap 1–2:

```sql
-- 1. Lima belas tabel publik ada
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- 2. RLS aktif di SEMUA tabel (relrowsecurity = true)
SELECT c.relname, c.relrowsecurity
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r';

-- 3. Kebijakan terpasang (harapkan ≥ 12 baris)
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname = 'public' ORDER BY tablename, policyname;

-- 4. Fungsi role terpasang
SELECT pg_get_functiondef('public.current_app_role()'::regprocedure);

-- 5. (Setelah provisioning) setiap auth.users punya profiles
SELECT u.email, p.role
FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY u.email;   -- baris dengan role NULL = BELUM provisioned → login akan gagal

-- 6. Kontrak aktif tidak ganda per unit (harus 0 baris)
SELECT unit_id, count(*) FROM contracts
WHERE status = 'active' GROUP BY unit_id HAVING count(*) > 1;
```

Checklist smoke test aplikasi ada di [Tahap 5](#tahap-5--validasi--go-live).

---

## 11. Rollback & Backup

| Skenario | Tindakan |
|---|---|
| Migration gagal di tengah file | Jalankan per file dengan `-v ON_ERROR_STOP=1` dalam transaksi (`BEGIN; … COMMIT;`) — DDL PostgreSQL transaksional, file yang gagal tidak meninggalkan sisa. File yang SUDAH sukses tidak diulang. |
| Produksi bermasalah setelah migration baru | Restore dari snapshot/backup Supabase (PITR) ke titik sebelum migration. Maka **backup otomatis sebelum setiap push produksi bersifat wajib**. |
| Aplikasi error setelah cutover (bukan data) | Rollback deploy Vercel ke versi sebelumnya (env tetap); database tidak disentuh. |
| Perubahan skema salah isi data | Perbaikan lewat migration baru (data-fix SQL), bukan edit history. |

---

## 12. Troubleshooting Umum

| Gejala | Penyebab | Solusi |
|---|---|---|
| `password authentication failed` | Connection string salah format | Pakai `postgres.<project-ref>` pada host pooler; reset password DB di dashboard bila perlu |
| `prepared statement … already exists` / error prepared statements | Terkoneksi ke **transaction pooler** (port 6543) | Gunakan **session pooler** (5432) untuk `DATABASE_URL` aplikasi |
| `relation "auth.users" does not exist` | Migrasi dijalankan ke Postgres biasa (bukan Supabase) | Jalankan hanya di project Supabase; untuk dev lokal pakai `drizzle-kit push` (skema Drizzle tanpa `auth.users`) |
| Login gagal: *"Profil pengguna belum terdaftar"* | User auth ada, `profiles` belum dibuat | Jalankan `templates/provision_user.sql` untuk user tersebut |
| `42501` (permission denied) via Data API | RLS menolak: role di `profiles` tidak sesuai policy | Cek baris `profiles` user; ingat role **tidak** dibaca dari metadata auth |
| `23505` duplicate saat migration | File dijalankan dua kali / `schema.sql` pernah dijalankan di DB yang sama | Jangan tumpuk jalur (§3); mulai dari database fresh atau lanjutkan dengan file berikutnya |
| Sesi user sering kedaluwarsa / redirect loop | Refresh token tidak ter-render | Pastikan `src/proxy.ts` aktif dan Redirect URLs di Supabase memuat domain deploy |
| QR di PDF mengarah ke URL salah | `NEXT_PUBLIC_APP_URL` belum diset / beda domain | Set env ke origin kanonik produksi, redeploy |

---

## Ringkasan Satu Paragraf

Jalankan `supabase/migrations/0001→0005` berurutan ke database Supabase fresh → matikan signup & atur redirect → provision user via `templates/` → seed `company_settings` → pasang env pooler di Vercel → smoke test per role → go-live dengan backup aktif. Setelah itu, semua perubahan skema lahir dari `src/db/schema.ts`, diuji lokal, diangkat jadi file `000N_*.sql` baru, lalu di-push ke staging sebelum produksi. `schema.sql` di root cukup disimpan sebagai snapshot historis — jangan dijalankan lagi.
