# HeavyOps — Audit UI/UX & Performa Input

> Fokus: kenapa semua kolom input terasa laggy + apa yang dioptimasi, ditambah, dan dihapus.
> Audit: 11 September 2026 · Branch kerja: `arena/01a0905b-rentalin` (perubahan **tidak** di-merge/push — sesuai permintaan, hanya di working tree).
> Dokumen terkait: [`audit.md`](audit.md) (audit kode) · [`roadmap.md`](roadmap.md).

---

## 1. Kenapa kolom input laggy? (penyebab, terurut dari paling berat)

Seluruh temuan di bawah diverifikasi langsung dari source, bukan tebakan.

| # | Penyebab | Bukti | Dampak |
|---|---|---|---|
| L1 | **Satu komponen raksasa me-render ulang total tiap ketikan.** `ModuleWorkspace` (±40 KB, 1 file) menampung kolom pencarian + tabel + modal form dalam satu scope state. `onChange` → `setQuery` → seluruh fungsi komponen jalan ulang: membangun JSX untuk **semua record** (bukan cuma 8 yang tampil), lengkap dengan lookup & format tanggal/uang per baris. | `src/components/module-workspace.tsx` (sebelum refactor) | Tiap karakter = ratusan elemen React dibangun ulang → jank di semua kolom: pencarian tabel, HM timesheet, prefix/jumlah bulk, frasa reset |
| L2 | **`new Intl.NumberFormat` di tiap panggilan `money()`.** Konstruksi formatter Intl mahal; dipanggil puluhan–ratusan kali per render (tiap sel tarif/total/tanggal). | `src/lib/format.ts` (sebelumnya) | Ratusan konstruksi formatter per ketikan → main-thread jank, parah di HP kentang |
| L3 | **State ketikan modal tinggal di parent.** `meter`, `bPrefix/bStart/bCount`, `catCustom`, `contractId`, `resetPhrase` adalah `useState` di `ModuleWorkspace` — mengetik di dalam modal ikut membangun ulang tabel di belakangnya. | `module-workspace.tsx` (state di top-level) | Form terasa berat walau tabelnya tidak terlihat |
| L4 | **Tanpa debounce/defer/transition.** Filter + sort + render berjalan sinkron tiap `onChange`, memblokir update kolom input itu sendiri. | `onChange={e=>{setQuery(...);setPage(1);}}` | Kursor tertinggal dari ketikan |
| L5 | **Pencarian global di `Shell` membangun mega-array per ketikan** (`fleet+clients+contracts+handovers+invoices`) dan me-render ulang seluruh sidebar + topbar. | `src/components/shell.tsx` (`results=[...]`) | Sama: ketikan di header search ikut berat |
| L6 | **Lookup O(n) per baris.** `getUnit/getClient/getContract` = `.find()` di atas koleksi penuh, dipanggil berkali-kali per baris (kontrak: 4–6× find per baris). Total O(n²) per render. | `module-workspace.tsx`, `shell.tsx` | Makin banyak data, makin parah (degradasi kuadratik) |
| L7 | **Server: 7 tabel penuh di-fetch 2× per request** (layout + page), lalu `router.refresh()` sesudah tiap simpan mengulang semuanya + mengirim payload RSC besar ke browser. | `src/lib/data.ts`, `dashboard/layout.tsx` + `page.tsx` | Jank sesudah simpan; memori browser membengkak seiring data |
| L8 | **recharts ikut bundle awal dasbor** (paket JS client terbesar) + **font via `@import` CSS** (render-blocking). | `overview.tsx`, `globals.css` | First paint & TTI lambat (bukan lag ketikan, tapi persepsi "aplikasi berat") |

---

## 2. Yang sudah diperbaiki (gelombang ini, di working tree)

Perilaku & tampilan dipertahankan identik — murni refactor performa + bersih-bersih. Tidak ada perubahan skema/API/kontrak data.

| # | Perbaikan | File | Efek |
|---|---|---|---|
| F1 | Tabel di-`useMemo`; filter pencarian memakai `useDeferredValue` — ketikan hanya update input, daftar menyusul saat browser idle | `module-workspace.tsx` | Kolom pencarian tabel: ketikan → render trivial (memo skip), tidak ada lagi rebuild baris |
| F2 | Modal form dipisah ke `RecordModal` + `ResetModal` dengan state ketikan lokal, hanya di-mount saat terbuka | `module-workspace.tsx` | Mengetik HM/prefix/frasa reset **tidak** me-render ulang tabel sama sekali (parent tidak re-render) |
| F3 | Formatter `Intl` di-cache level modul (`money`, `dateLabel`, `timeLabel`, `dateTimeLabel`, `todayISO`, `shortMoney`) + satu `Intl.Collator('id')` untuk sort | `lib/format.ts`, `module-workspace.tsx` | Ratusan konstruksi formatter per render → 0 |
| F4 | Lookup O(1) via `Map` (`useLookups`: unit/klien/kontrak + hitung kontrak per klien) | `module-workspace.tsx` | Render tabel O(n²) → O(n); sort A–Z/Z–A juga diperbaiki (sebelumnya klik ke-2 tidak melakukan apa-apa — bug O5 di `audit.md`) |
| F5 | Pencarian global dipisah ke `GlobalSearch` (state lokal + `useDeferredValue` + korpus di-memo); badge/notifikasi di-memo | `shell.tsx` | Ketikan di header search hanya me-render kotak search |
| F6 | `getWorkspaceData()` dibungkus React `cache()` | `lib/data.ts` | 7 query × 2 → × 1 per request (−50% query, tutup temuan K3) |
| F7 | recharts dipisah ke `overview-charts.tsx`, dimuat `next/dynamic` (`ssr:false` + skeleton shimmer); agregasi pendapatan O(n²)→O(n) via agregasi per bulan | `overview.tsx`, `overview-charts.tsx` (baru) | Bundle awal dasbor jauh lebih kecil; TTI turun (tutup O7) |
| F8 | Font DM Sans: `@import` CSS → `<link>` + `preconnect` di layout; `<html lang="en">` → `"id"` | `app/layout.tsx`, `globals.css` | First paint lebih cepat; bahasa dokumen benar (a11y/SEO) |
| R1 | **Dihapus:** route duplikat `/dashboard/timesheets/new` (0 referensi di `src/`, perilaku identik dengan `?new=1`) | file dihapus | Satu cara kerja, tutup K2 |
| R2 | **Dihapus:** `dotenv` dari dependencies (Next memuat `.env` native); `playwright` dipindah ke `devDependencies` (belum dipakai; siap untuk e2e test nanti) | `package.json` + lock | Install produksi lebih ringan, tutup K1 |
| R3 | **Dihapus:** import mati (`Link`, `CalendarDays`, `FileText`, `Check`), state mati (`fleetMenu`) | 3 komponen | Bundle sedikit lebih kecil, kode lebih jujur |

### Verifikasi (semua hijau, tanpa push)

```
npm run lint        → 0 error, 0 warning
npm run typecheck   → 0 error
env -u DATABASE_URL npm run build → sukses (9 route; /dashboard/timesheets/new hilang)
smoke test prod     → /login 200 + lang="id" + font <link> OK; /dashboard 500 murni
                      "DATABASE_URL is required" (wajar: sandbox tanpa Postgres)
```

> Catatan: uji ketikan manual di dashboard butuh `DATABASE_URL` + data seed — lakukan di
> mesin dev (`npm run dev`) dan coba: (1) ketik cepat di pencarian tiap modul,
> (2) ketik HM di form timesheet, (3) ketik prefix di Tambah Banyak, (4) ⌘K + ketik
> di pencarian global. Lake/lag sebelum–sesudah paling terasa di data >100 baris.

---

## 3. Gelombang fitur (11 Sep 2026 — SEMUA dikerjakan, kecuali O-A)

> Status: seluruh item §3a/§3b/§3c di bawah **sudah diimplementasi di working tree**
> (belum merge/push). Satu-satunya yang TIDAK dikerjakan: **O-A (paginasi server-side)** —
> alasannya di bawah. Verifikasi: `lint` 0/0, `typecheck` 0 error,
> `env -u DATABASE_URL npm run build` sukses (15 route), smoke test prod lolos
> (headers, /forgot-password, /reset-password, /auth/callback, guard cron 401,
> guard bast-photos 503 saat pratinjau).

### 3.0. Jawaban: hardcode PPN 11% bagaimana?

PPN **tidak lagi hardcode**. Sekarang jadi konfigurasi perusahaan:

- Kolom baru `company_settings.ppn_rate` (NUMERIC, default 11) + `expiry_warning_days`
  (default 30) — migrasi `0009_company_config.sql`, bisa diubah admin di modul
  **Pengaturan → Tarif PPN (%)** tanpa deploy ulang.
- Dipakai saat **penerbitan invoice** (`saveRecord` membaca settings per transaksi),
  **pratinjau tagihan** di modal, **PDF invoice/SPH** (label + nominal dinamis),
  dan **label UI** ("Termasuk PPN x%").
- **Jaminan korektansi:** tarif baru hanya berlaku untuk invoice yang diterbitkan
  *setelah* perubahan — invoice lama menyimpan `tax_amount`-nya sendiri dan tidak berubah.
- Hardcode lain yang ikut dibersihkan (D-2): window 30-hari → `expiry_warning_days`
  (dipakai banner fleet, badge unit, dasbor, notifikasi), dan nama PT di `/verify/doc`
  kini dibaca dari `company_settings`.

### 3a. Optimasi lanjutan — hasil

| # | Status | Implementasi |
|---|---|---|
| O-A | ✅ **SELESAI** (eksekusi desain follow-up yang tadinya ditunda) | Tepat sesuai rancangan: **(1)** `getShellData()` ramping untuk layout — user + settings + 4 count SQL (pending/unpaid/overdue/expiring), shell tak lagi menerima 7 tabel; **(2)** `getModulePage(module,{q,status,category,expiringOnly,page,sort})` — query per modul dengan `WHERE/ORDER BY/LIMIT/OFFSET`, JOIN label (klien/unit/kontrak) langsung di baris, subquery agregat (kontrak per klien, dibayar per invoice), CASE `overdue` dievaluasi di SQL, tab status dari `GROUP BY` (hitungan dataset = kunci `all`); **(3)** selects async — opsi modal via server action `getFormOptions` (+`getBillableHours`/`getRevisionHistory`/`getInvoicePayments` saat dibutuhkan), pencarian global pindah ke `/api/search` (ILIKE, debounce 250 ms); **(4)** dasbor via `getDashboardData()` (SUM/GROUP BY bulan + daftar terbaru LIMIT 5), PDF via `getDocumentBundle()` (query titik), CSV via `getReportData()`; **(5)** filter modul kini state URL (`?q/?status/?category/?sort/?page/?filter`) dengan input debounced 300 ms + transisi (tidak ada lag ketikan — state input tetap lokal), pager berjendela untuk ratusan halaman, optimistic UI dipertahankan; **(6)** `getWorkspaceData()` dihapus, `requireUser` di-`cache()` (verifikasi auth 1× per request), indeks pendukung `0017_pagination_indexes.sql` (aditif). |
| O-B | ✅ | Optimistic UI via `useOptimistic` untuk approve/reject timesheet, selesai kontrak, pelunasan; `act()` selalu `router.refresh()` agar optimis tersinkron ulang. |
| O-C | ✅ | Validasi per-field tanpa dep baru: `FieldError` di actions (pesan per kolom + mapping 23505 → kolom), UI menampilkan `.field-error` di bawah isian (modal + settings + pembayaran). |
| O-D | ✅ | `daysUntil`/`isPastDue`/`isExpiringSoon` di `format.ts` (aritmetika kalender, TZ-aman); semua badge overdue/expiring memakai ini. |
| O-E | ✅ | Security headers di `next.config.ts` + CI `.github/workflows/ci.yml` (lint→typecheck→build tanpa env→`npm audit --omit=dev`). |

### 3b. Fitur baru — hasil

| # | Status | Implementasi |
|---|---|---|
| A-1 | ✅ | Pencarian global tampil di HP (kompak ≤540px, dropdown full-width). |
| A-2 | ✅ | **Payment ledger**: tabel `payments` (0010) + `recordPayment` (penuh/cicilan, validasi sisa, lock baris) + modal Bayar/Riwayat + status `partial` aktif + PDF/laporan/CSV ikut (dibayar & sisa). "Tandai Lunas" diganti "Bayar"; pelunasan manual lama tetap konsisten (dibuatkan baris ledger). |
| A-3 | ✅ | **Foto BAST**: kolom `photo_urls` + bucket privat `bast-photos` + RLS (0012) + `POST /api/bast-photos` (role + validasi gambar ≤5MB) + uploader di form + hitung foto di tabel + maks 4 foto tervalidasi di PDF (signed URL; graceful tanpa foto saat pratinjau). |
| A-4 | ✅ | **Pengguna & peran** (`/dashboard/users`, admin): daftar profiles, ubah role (lindung: tidak bisa cabut admin diri sendiri / terakhir), undang via email bila `SUPABASE_SERVICE_ROLE_KEY` ada (fallback template SQL). |
| A-5 | ✅ | **Audit log**: tabel append-only (0011) + `logAudit()` di semua aksi tulis + `/dashboard/audit` (admin, cari + 200 terbaru). |
| A-6 | ✅ | **Lupa/reset sandi**: link di login + `/forgot-password` (kirim tautan) + `/auth/callback` (tukar code) + `/reset-password` (sandi baru, klien browser). Trigger `handle_new_user` (0013, anti-eskalasi role) untuk undangan. |
| A-7 | ✅ | **Cron overdue**: `GET /api/cron/overdue` (bearer `CRON_SECRET`, tandai unpaid/partial lewat tempo + audit) + `vercel.json` (tiap 01:00 WIB) + notifikasi overdue di lonceng header. Alternatif pg_cron: `SELECT cron.schedule('overdue','0 18 * * *',$$SELECT net.http_get(...)$$)` — butuh ekstensi pg_cron+pg_net (opsional, tidak dibundel). |

> **Lampiran gelombang — format PDF BAST resmi**: PDF BAST kini mengikuti pola berita
> acara serah terima umum (rujukan: contoh dokumen BAST alat berat rental + artikel
> "Contoh Surat Perjanjian Sewa Alat Berat" Mekari Sign) — pembuka
> formal "Pada hari ini, [hari-long-date], …", blok identitas **1. PIHAK PERTAMA**
> (penyedia; wakil = penandatangan di Pengaturan) & **2. PIHAK KEDUA** (penyewa;
> wakil = PIC klien), pernyataan serah/kembali sesuai jenis (mobilisasi/demobilisasi),
> klausul penerimaan kondisi setelah checklist 12 titik, klausul penutup **rangkap 2
> bermeterai cukup**, baris **"Kota, tanggal"** di atas tanda tangan, dan **3 blok
> tanda tangan: Yang menyerahkan · Yang menerima · Mengetahui** (kosong untuk pihak
> ketiga bila perlu). Kolom isian yang belum ada di data ditampilkan titik-titik
> (diisi manual). Tetap 1 halaman A4 + QR verifikasi; invoice/SPH tak berubah
> (kecuali baris kota/tanggal di atas ttd).
>
> **Lampiran gelombang — Surat Perjanjian Sewa otomatis (PDF)**: dokumen
> **Surat Perjanjian Sewa Menyewa Alat Berat** kini terbit otomatis dari data
> kontrak — tombol **Perjanjian** di baris tabel Kontrak (`/api/documents/
> perjanjian/[id]`, nomor `PJS/...` dari nomor kontrak). Struktur mengikuti
> template "Contoh Surat Perjanjian Sewa Alat Berat" (Mekari Sign): pembuka
> formal, identitas PIHAK PERTAMA/KEDUA ("Nama Perusahaan / Yang diwakili
> oleh / Jabatan"), **PASAL 1 OBJEK SEWA** (merk/tipe, kategori, tahun, kode
> unit, kondisi + rujukan nomor BAST mobilisasi bila ada), **PASAL 2 JANGKA
> WAKTU** (durasi hari + terbilang), **PASAL 3 HARGA SEWA DAN PEMBAYARAN**
> (tarif/jam + terbilang, PPN, penagihan berbasis timesheet disetujui,
> breakdown tidak ditagih), **PASAL 4 HAK DAN KEWAJIBAN**, **PASAL 5
> KERUSAKAN DAN KEHILANGAN**, **PASAL 6 PENYELESAIAN PERSELISIHAN** (Pengadilan
> Negeri kota perusahaan), penutup rangkap 2 bermeterai cukup, baris
> "Kota, tanggal", dan tanda tangan PIHAK PERTAMA/KEDUA. Helper `terbilang.ts`
> (angka → kata, terverifikasi) + halaman verifikasi mengenali `?kind=
> perjanjian`. Dokumen ±2 halaman A4 dengan QR verifikasi tiap halaman.
> Yang sengaja tidak diotomasi dari artikel: nomor KTP para pihak, nomor
> rekening bank (belum ada datanya di sistem — klausul memakai frasa
> "rekening yang ditunjuk secara tertulis"), meterai fisik/e-meterai, dan
> SIO operator (bisa jadi field berikutnya bila dibutuhkan).
>
> **Lampiran gelombang — lokalisasi dokumen (kota & zona waktu)**: `company_settings`
> bertambah kolom `city` (default `Jakarta`) dan `timezone` (`WIB`/`WITA`/`WIT`,
> default `WIB`) — migration `0018_company_locale.sql` (aditif + CHECK). Diubah
> admin di **Pengaturan** tanpa deploy ulang. Seluruh "hari ini" (badge jatuh tempo,
> validasi form, cron overdue, status overdue invoice di SQL) dan label waktu UI/PDF
> kini mengikuti zona terpilih — perusahaan di Indonesia tengah/timur memakai
> kalender WITA/WIT, bukan selalu WIB. Formatter Intl tetap ber-cache per zona
> (optimasi F3 tidak hilang).

### 3c. Hapus/sederhanakan — hasil

| # | Status | Implementasi |
|---|---|---|
| D-1 | ✅ | `schema.sql` diberi banner ARSIP LEGACY (tidak dihapus agar tooling lama tak patah; kanonik = `migrations/` + Drizzle). |
| D-2 | ✅ | Lihat §3.0 — PPN, window 30-hari, nama PT verify semua jadi konfigurasi/data. |
| D-3 | ✅ | Kartu "Butuh bantuan?" di sidebar dihapus → diganti item nav "Pusat Bantuan" (modal sama). Sidebar juga dapat seksi LAINNYA: Pengaturan, Pengguna & Peran, Log Audit (2 terakhir khusus admin). |
| D-4 | ✅ | Aksi baris tabel di HP jadi ikon saja (≤540px). |

### Deploy checklist (wajib sebelum production)

1. Jalankan migrasi `0009`–`0013` ke Supabase (CLI / dashboard).
2. Isi env: `CRON_SECRET` (acak ≥32 char), `SUPABASE_SERVICE_ROLE_KEY` (utk undang user),
   `NEXT_PUBLIC_APP_URL` (utk tautan email).
3. Supabase Auth: pastikan public signup **MATI**; aktifkan email (reset/undangan).
4. Lokal/CI: `npm run lint && npm run typecheck && npm run build` (build tanpa env).
5. Uji manual dengan data: bayar cicilan, upload foto BAST, undang user, reset sandi,
   cron (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/overdue`).

## 4. Cara mereview perubahan ini (tanpa merge/push)

### 3a. Optimasi lanjutan (disarankan, belum dikerjakan)

| # | Item | Kenapa | Effort |
|---|---|---|---|
| O-A | ~~**Paginasi + filter server-side per modul** (ganti `SELECT *` 7 tabel)~~ ✅ **dikerjakan** — lihat §3a | Satu-satunya obat permanen untuk L7; saat ini seluruh DB dikirim ke browser tiap navigasi | 1–2 hari (lihat O1 di `audit.md`) |
| O-B | **Optimistic UI + sempitkan `router.refresh()`** | Sesudah simpan/approve, seluruh halaman refetch → kedip & jank sesaat | 0.5 hari |
| O-C | **Validasi inline per-field** (ganti toast generik) | Form gagal simpan hanya bilang "periksa isian" — user menebak kolom mana | 0.5–1 hari (lihat O9/Zod) |
| O-D | **Tanggal TZ-aman** (`new Date('YYYY-MM-DD')` = UTC → badge kadaluarsa bisa geser ±1 hari di WIB) | Akurasi badge "30 hari" & filter overdue | 1–2 jam (lihat O6) |
| O-E | **Security headers + CI pipeline** | Belum ada proteksi clickjacking/MIME + tidak ada penjaga regresi otomatis | ±1.5 jam (lihat A3, A4) |

### 3b. Usulan TAMBAH fitur (pilih sesuai kebutuhan)

| # | Fitur | Alasan UX |
|---|---|---|
| A-1 | **Pencarian global di mobile** (saat ini `display:none` ≤540px) | Pengguna HP kehilangan cara tercepat menemukan dokumen |
| A-2 | **Payment ledger** (bayar sebagian, bukan toggle lunas Yah/Tidak) | Status `partial` sudah ada di skema tapi tak terpakai; realita pembayaran sering cicilan |
| A-3 | **Foto lampiran BAST** (Supabase Storage) | BAST tanpa bukti foto lemah saat sengketa kondisi unit |
| A-4 | **Manajemen user & role di UI** (`/dashboard/users`) | Saat ini via SQL manual — admin non-teknis tidak bisa |
| A-5 | **Audit log** (siapa mengubah apa, kapan) | Wajib untuk ERP keuangan; bukti sengketa |
| A-6 | **Lupa sandi / undangan user via email** | Onboarding user baru masih manual |
| A-7 | **Notifikasi jatuh tempo invoice** (cron `overdue`) | Saat ini status overdue dihitung di client, tidak ada pengingat proaktif |

### 3c. Usulan HAPUS / sederhanakan (minta persetujuan sebelum eksekusi)

| # | Kandidat | Alasan |
|---|---|---|
| D-1 | **`schema.sql` sebagai jalur aktif** → jadikan arsip read-only | Dua sumber kebenaran skema (vs `migrations/`) = risiko drift (lihat K4) |
| D-2 | **Angka hardcode**: PPN 11% (2 tempat), window 30-hari, nama PT di `/verify/doc` | Harusnya konfigurasi — tiap perubahan butuh deploy (lihat K6) |
| D-3 | **Kartu "Butuh bantuan?" di sidebar** (atau pindah ke modal help saja) | Memakan ruang vertikal permanen untuk info yang jarang dipakai |
| D-4 | **Kolom "Tindakan" berlabel teks di mobile** → ikon saja | Tabel sempit di HP; label Ubah/Hapus/Unduh memaksa scroll horizontal |

---

## 4. Cara mereview perubahan ini (tanpa merge/push)

```bash
git status --short          # lihat file berubah
git diff --stat             # ringkasan
git diff src/lib/format.ts  # contoh: bedah per file
npm run dev                 # uji manual dengan DATABASE_URL lokal
```

Beri tahu saya item mana dari §3 yang mau dieksekusi (mis. "kerjakan O-A + A-2, hapus D-3"),
atau minta saya push + buka PR bila sudah puas — **saya tidak akan merge/push tanpa perintah eksplisit.**
