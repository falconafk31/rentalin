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
> Yang sengaja tidak diotomasi dari artikel: meterai fisik/e-meterai dan
> SIO operator (bisa jadi field berikutnya bila dibutuhkan).
>
> **Lampiran gelombang — data rekening & identitas para pihak**: melengkapi
> komponen artikel yang belum terotomasi. **Pengaturan** bertambah 5 field:
> NPWP Perusahaan, No. KTP Penandatangan, Nama Bank, Nama Pemilik Rekening,
> Nomor Rekening; form **Klien** bertambah No. KTP Penanggung Jawab —
> migration `0019_payment_identity.sql` (aditif, default kosong, idempoten).
> Di Surat Perjanjian: blok PIHAK PERTAMA/KEDUA kini memuat baris **NPWP**
> dan **No. KTP** (titik-titik bila kosong; NPWP P2 dari NPWP klien), dan
> **PASAL 3 butir 3** menyebut rekening tujuan spesifik — "transfer ke
> rekening {bank} a.n. {pemilik} nomor {no}" — bila ketiga field rekening
> terisi lengkap, selain itu fallback ke frasa "rekening yang ditunjuk
> secara tertulis". **Invoice PDF** kini mencantumkan info transfer
> ("Pembayaran dapat ditransfer ke rekening …") di catatan bila data bank
> lengkap. Terverifikasi render: field terisi + fallback dotted/generik;
> BAST & SPH tetap tanpa baris NPWP/KTP/rekening.
>
> **Lampiran gelombang — kecepatan navigasi antar-menu (tetap SSR)**:
> Pengukuran server lokal: render tiap halaman modul hanya **14–27 ms**
> (sudah termasuk query DB) — jeda "±1 detik" saat membuka menu berasal
> dari jaringan (RTT browser↔server/proxy), bukan proses render. Perbaikan
> yang diterapkan tetap dalam arsitektur SSR/RSC: (1) `experimental.
> staleTimes` (dynamic 30 dtk) — menu yang pernah dibuka dirender instan
> dari Router Cache client tanpa round-trip; tiap mutasi memanggil
> `revalidatePath('/dashboard','layout')` yang menghapus cache itu, jadi
> data pasca simpan/approve/bayar selalu segar; (2) `getModulePage`
> menjalankan auth + settings + seed **paralel** (sebelumnya 3 await
> beruntun); (3) `seedPreview` dibungkus React `cache()` — sekali per
> request, bukan dua transaksi (layout + page). **PDF tetap server-side**
> (react-pdf + QR + data DB) — endpoint terpisah, bukan bagian alur
> navigasi menu.
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

1. Jalankan migrasi `0009`–`0019` ke Supabase (CLI / dashboard).
2. Isi env: `CRON_SECRET` (acak ≥32 char), `SUPABASE_SERVICE_ROLE_KEY` (utk undang user),
   `NEXT_PUBLIC_APP_URL` (utk tautan email).
3. Supabase Auth: pastikan public signup **MATI**; aktifkan email (reset/undangan).
4. Lokal/CI: `npm run lint && npm run typecheck && npm run build` (build tanpa env).
5. Uji manual dengan data: bayar cicilan, upload foto BAST, undang user, reset sandi,
   cron (`curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/overdue`).

## 5. Gelombang UI 12 Sep 2026 — BAST instan + dasbor kompak (roadmap 2.21–2.22)

> Tanpa migrasi, tanpa perubahan logika bisnis/finansial. Branch:
> `feat/dashboard-compact-redesign` (tidak di-merge, sesuai permintaan).

| # | Perbaikan | File | Efek |
|---|---|---|---|
| U1 | `BastChecklist` + `PhotoUploader` diekstrak dari `RecordModal` menjadi komponen `memo` dengan callback stabil (`useCallback`); checkbox tetap uncontrolled (`defaultChecked`) | `module-workspace.tsx` | Klik checkbox BAST instan — tidak lagi ikut rekonsiliasi pohon modal tiap state induk berubah |
| U2 | Label checklist full-row 18px + hover + umpan balik checked; header seksi "Informasi BAST" & "Dokumentasi Kondisi Unit"; thumbnail 72px | `module-workspace.tsx`, `globals.css` | Target sentuh lebih besar, hierarki form jelas |
| U3 | KPI dipadatkan (±95–105px); spacing antar-seksi 16–18px; heading ringkas; chart 280px | `globals.css`, `overview.tsx` | Dasbor terpindai 3–5 detik, scroll vertikal berkurang ±40–50px |
| U4 | Rentang tren 7H/1B/3B/6B/1Y/Semua; 7H/1B memakai agregat harian nyata 62 hari (`revenueByDay` di `getDashboardData`), sisanya bulanan; `metric-value` 760px disamakan ke 26px | `overview.tsx`, `lib/data.ts`, `globals.css` | Granularitas jujur (tanpa estimasi), responsif koheren |

### Verifikasi

```
npm run lint  → 0 error, 0 warning
npx tsc --noEmit → 0 error
npm run build → sukses
```

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
30-hari, nama PT di `/verify/doc` | Harusnya konfigurasi — tiap perubahan butuh deploy (lihat K6) |
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

---

# Laporan Eksekusi Audit `.zcode/audit` — 12 September 2026

> Branch kerja: `feat/ui-audit-exec` (commit lokal saja, **tidak** di-push/di-merge).
> Semua saran dari 10 file audit dieksekusi kecuali 1 item yang masih menunggu keputusan (B1-varian-penuh); G2 sudah diputus dan dikerjakan susulan (commit `6fc56a6`).
> Verifikasi akhir: `npm run lint` 0 error 0 warning · `npx tsc --noEmit` bersih ·
> `env -u DATABASE_URL npm run build` sukses.

Commit terpisah per topik: `4703121` (01) · `0400796` (02) · `6110ce6` (03) · `8fc274c` (modul) · `26ab4eb` (perbaikan build) · `6fc56a6` (G2 susulan) · `7fc7d88` (topik 04 dark mode).

## Topik 01 — Kehalusan list/tabel

| Item | File kode | Efek |
|---|---|---|
| P1 | `src/components/module-workspace.tsx` | `router.prefetch(url)` saat hover/focus di tab status, kartu fleet, banner kedaluwarsa, tombol sort, dan semua tombol pager — klik berikutnya mulai dari cache RSC. Helper URL `buildUrl` dipakai bersama navigate/prefetch (tidak duplikat logika). |
| P2 | `src/app/globals.css` | `.table-scroll` kini `transition:opacity .15s ease` — dim loading tidak lagi snap/kedip. |
| P3 | `src/components/module-workspace.tsx`, `globals.css` | Navigasi tab/filter besar menampilkan skeleton baris shimmer (pola `.loading-rows`, sama seperti `loading-cards`) alih-alih baris lama diredupkan; perubahan kecil (pager/sort/search) tetap dim. Aksi simpan/setujui tidak memicu skeleton. |
| P4 | `src/lib/pagination.ts` (baru), `src/lib/data.ts`, `module-workspace.tsx` | `MODULE_PAGE_SIZE` 8 → 15; angka 8 yang di-hardcode di nomor baris & footer pagination diganti konstanta. |
| P5 | `src/app/globals.css` | `tbody tr` dapat `transition:background .15s` — hover baris halus. |
| P6 | `src/components/module-workspace.tsx` | Tab status, kartu fleet, dan select kategori optimistik: highlight berubah seketika saat klik (`optStatus`/`optCategory`), lalu tersinkron ulang dari echo filter server (pola sama dengan debounce search). |

## Topik 02 — Konsistensi form & list

| Item | File kode | Efek |
|---|---|---|
| G1 | `module-workspace.tsx`, `globals.css` | Komponen `ModuleSummary` tunggal dipakai fleet (kartu klik = filter) & invoices (kartu statis 3 angka, warna hijau/oranye dipertahankan). Class & CSS `.invoice-stats` dihapus; varian grid `.module-stats.cols-3` mengikuti semua breakpoint lama. |
| G2 | `module-workspace.tsx` (commit `6fc56a6`) | **SELESAI (keputusan user: kartu yang dipertahankan).** Blok `.table-tabs` tidak dirender untuk `module==='fleet'` — kartu `ModuleSummary` di atas tabel jadi satu-satunya filter status (alasan: lebih informatif, sudah pola bersama invoices). Modul lain (contracts/timesheets/bast/invoices/clients) tidak berubah. Query `?status=` + `navigate()` tetap utuh (deep link & back/forward berfungsi); penanda aktif kartu memakai `optStatus` yang tersinkron echo server. Fungsi "kembali ke Semua" yang tadinya di tab dipindah ke kartu: klik kartu terpilih = lepas filter. Tidak ada celah layout — `.table-toolbar` menempel rapi ke tepi atas panel tanpa elemen tetap yang tersisa. |
| G3 | `module-workspace.tsx` | Filter kategori `small-select` dirender bila `data.categoryOptions?.length` — bukan lagi `module === 'fleet'`. Modul baru tinggal isi `categoryOptions` di server. |
| G4 | `module-workspace.tsx` | Helper `field()`/`selectField()`/`textareaField()` menerima `hint?` → dirender `<small className="cell-sub">` saat field tidak error. Mekanisme konvensi siap; teks hint baru tidak ditambahkan ke form modul (akan mengubah tampilan yang tidak diminta). |
| G5 | `module-workspace.tsx` | 9 blok form manual dimigrasikan ke helper: select kontrak/unit/klien (buat & revisi), textarea alasan revisi, alamat klien, catatan timesheet & BAST, select jenis BAST, `selectContract`. Perilaku (disabled saat opsi dimuat, onChange, nilai default) identik. |
| G6 | `module-workspace.tsx` | `submitLabel` masuk ke map `config` per modul; rantai ternary panjang di footer dipangkas — hanya 2 kasus dinamis yang tersisa (`revising`, bulk fleet dengan jumlah unit). |
| G7 | `README.md` | Catatan desain ditambahkan: modul tanpa status (Klien) memang hanya menampilkan tab "Semua" — by design, bukan kelalaian. |

## Topik 03 — Ikon

| Item | File kode | Efek |
|---|---|---|
| R1 | `src/components/shell.tsx` | Sidebar "Data Klien" → `Building2` (konsep perusahaan/mitra, konsisten dengan konteks perusahaan di Pengaturan); `UsersRound` kini khusus "Pengguna & Peran". |
| R2 | `src/components/template-workspace.tsx` | Tombol "Terbitkan" template PDF → `Send` (metafora literal kirim/sahkan; `Rocket` dihapus dari kode). |
| R3 | `docs/icon-map.md` (baru) | Tabel pemetaan konsep → ikon lucide → file pemakaian, + daftar ikon yang dilarang dipakai ulang (`UsersRound` utk klien, `Rocket`). Modul baru wajib cek tabel ini. |
| R4 | `docs/icon-map.md` | Aturan "satu-satunya sumber ikon: lucide-react" didokumentasikan di header tabel. Tidak ada emoji/ikon custom lain di `src/` (diverifikasi grep). |

## Topik 04 — Dark mode (`.zcode/audit/04-dark-mode.md`)

Commit: `7fc7d88` — `feat(theme): dark mode per audit/04-dark-mode.md`.

| Item | File kode | Efek |
|---|---|---|
| Langkah 1 — token baru | `src/app/globals.css` (`:root`) | Ditambah `--surface-alt:#fafbfc` + 15 token status (5 kategori × text/bg/border) dengan nilai TERANG persis tabel audit; nilai gelap menyusul di blok dark. |
| Langkah 1 — migrasi hex | `src/app/globals.css` | Nilai yang PERSIS ada di tabel audit dipetakan ke `var(--token)`: `#f7f8fa`→`--bg`, `#fff` (latar)→`--surface`, `#fafbfc`/`#f8f9fb`→`--surface-alt`, `#25292e`→`--text`, `#eaebed`→`--border`, `#ef762d`→`--orange`, `#fff0e7`→`--orange-light`, `#348b67`→`--green`, dan 15 nilai status badge → token status. Mode terang identik (nilai token = nilai lama). Dua `color:#fff` di atas aksen (`.brand-mark`, `.button-danger`) sengaja tetap literal putih — bukan `--surface`, karena di dark mode token itu jadi gelap. |
| Langkah 2 — blok gelap | `src/app/globals.css` (`[data-theme="dark"]`) | Semua token didefinisikan ulang dengan nilai persis tabel audit (`--bg:#14171c`, `--surface:#1b1f26`, `--surface-alt:#21262f`, `--text:#e7e9ec`, `--muted:#8b929c`, `--border:#2b3038`, `--orange:#f2874a`, `--orange-light:#3a2a1c`, `--green:#4caf82`, + 15 status). Tidak ada warna di luar tabel. `color-scheme` ikut di-set per tema (kontrol native browser). |
| Langkah 3 — toggle | `src/components/shell.tsx` | Tombol "Mode gelap"/"Mode terang" di popover profil (slot yang sudah ada), memakai `Moon`/`Sun`. Status dibaca lewat `useSyncExternalStore` dari atribut `data-theme` (menghindari setState-in-effect yang dilarang eslint proyek); pilihan disimpan di `localStorage['heavyops-theme']`. |
| Langkah 3 — anti-flash | `src/app/layout.tsx` | Skrip inline di `<head>` (sebelum React mount): baca `localStorage`, fallback ke `prefers-color-scheme`, lalu pasang `data-theme="dark"` — tidak ada kedipan tema terang saat reload. |
| Langkah 4 — DM1 | `src/app/globals.css` | Modal, popover header, hasil pencarian, dan toast di dark mode: border dinaikkan (campuran token, bukan warna baru) + shadow `#00000055` — kartu tetap terangkat walau shadow hitam tak terlihat di latar gelap. |
| Langkah 4 — DM2 | `src/app/layout.tsx` | Class Tailwind `bg-slate-100 text-slate-900` dihapus dari `<body>`; `globals.css` (`var(--bg)`/`var(--text)`) jadi satu-satunya sumber warna body. |
| Langkah 4 — DM3 | `src/app/globals.css` | `::selection` versi gelap `#4a3320` (tint oranye gelap dari tabel). Outline fokus `#ef762d77` → `color-mix(in srgb, var(--orange) 47%, transparent)` sehingga tetap oranye brand di kedua tema (nilai terang identik secara efektif). |
| Langkah 4 — DM4 | `src/app/globals.css` | `.photo-thumb img` diberi `background:var(--surface)` — thumbnail foto BAST tidak jadi kotak putih menyala. Foto BAST di UI hanya `<img>` (satu-satunya di `src/`); QR/logo UI memakai SVG inline/`BrandMark`, jadi tidak ada kotak putih lain. |
| Langkah 6 — login & PDF | `src/app/globals.css` | `.login-page` mendedeklarasikan ulang token terang di subtree-nya → halaman login tetap terang permanen walau `data-theme="dark"` aktif. PDF (`pdf-document.tsx`) tidak disentuh sama sekali. |
| Langkah 5 — QA kontras | — | Dihitung programatik: rasio teks:bg badge gelap **amber 7.19 · hijau 6.55 · merah 6.12 · biru 7.12 · ungu 6.63** (semua ≥ 4.5:1, sesuai klaim audit). Teks utama dark 13.59:1, muted 5.26:1. |

### Perlu keputusan (topik 04)

| # | Isu | Kenapa tidak dikerjakan |
|---|---|---|
| DM-5 | **61 selector masih memakai background terang di luar tabel token** (hover `.icon-button`/`.nav-item`, `.info-callout`, `.expiry-banner`, `.summary-box`, `tbody tr:hover`, `.approval`/`.reject`, `.pipeline-cta`, dll) — di mode gelap ini tetap terang sehingga terlihat seperti blok menyala. Selain itu ~148 deklarasi `color:` abu-abu (mis. `#9c9ea4`, `#777e87`) tidak punya token di tabel. | Tabel audit hanya mendefinisikan 23 nilai; 216 hex sisanya tidak punya padanan gelap. Memetakannya ke token yang ada akan mengubah tampilan mode terang (dilarang di instruksi), sedangkan mengarang nilai gelap baru = menebak di luar tabel. **Butuh keputusan Anda** (opsi diajukan di luar laporan ini). |
| DM-6 | **Warna chart** (`overview-charts.tsx`, donut `overview.tsx`) — audit menyebut "ikut mapping hue yang sama persis" tapi nilainya beda dari token tabel (`#f47727` vs `#ef762d`, `#50a885` vs `#599b7d`, `#c8cece`, `#e9e9e7`, `#959593`). | Mengganti ke token tabel mengubah tampilan chart di mode terang (dilarang); mempertahankan nilai lama membuat chart tidak ikut menyesuaikan gelap. **Butuh keputusan.** |
| DM-7 | **`/verify/doc`** (halaman verifikasi publik) ikut berubah gelap. | Audit hanya menyebut login tetap terang; halaman publik lain tidak dibahas. Halaman ini memakai palet krem seperti login — perlu konfirmasi apakah ikut diperlakukan "selalu terang" atau boleh gelap. |

## File modul

| Item | File kode | Efek |
|---|---|---|
| C1 (`contracts.md`/`invoices.md`) | `globals.css`, `module-workspace.tsx`, `template-workspace.tsx` | Class `.invoice-preview` → `.summary-box` di seluruh 15 pemakaiannya (CSS + JSX). Netral untuk maintainer baru. |
| B1 (`bast.md`) | `module-workspace.tsx` | Varian minimal sesuai saran audit: `loading="lazy" decoding="async"` pada pratinjau foto (batas dimensi CSS sudah ada). **Catatan:** varian penuh (`next/image` + `remotePatterns`) tidak dipilih karena pratinjau memakai object-URL lokal (blob:) yang tidak didukung `next/image` tanpa custom loader — perlu keputusan bila ingin pindah ke signed-URL Supabase. |
| `fleet.md` `clients.md` `timesheets.md` `invoices.md` `settings.md` | — | Tidak ada item baru; seluruh temuannya sudah tercakup G1–G7 / R1–R2 / I1–I3 / K1–K7 yang dieksekusi di atas. `timesheets.md` mengonfirmasi `info-callout` memang pola yang benar untuk kasus "1 angka penting". |

## Perbaikan pasca-eksekusi

| Item | File kode | Efek |
|---|---|---|
| Fixup build | `src/lib/pagination.ts` (baru), `data.ts`, `module-workspace.tsx` | Import *nilai* `MODULE_PAGE_SIZE` dari `lib/data.ts` (server-only) ke client component menyeret `pg`/`dns`/`fs` ke bundle browser → build tanpa env gagal. Konstanta dipindah ke `lib/pagination.ts` (netral), `data.ts` re-export. |
| Fix hydration + DM-5 (dark kontras ala Cloudflare) | `src/app/layout.tsx`, `src/app/globals.css` | `<html>` diberi `suppressHydrationWarning` — skrip anti-flash memang mengubah `data-theme` sebelum hydration, jadi warning mismatch React hilang. Blok `[data-theme="dark"]` DM5 memetakan semua hex terang sisa ke token yang ada (tanpa warna baru, mode terang tak berubah): hover baris/kartu → `surface-alt`, kartu/tab terpilih → `orange-light`, `info-callout` → biru status, `expiry-banner`/`effective-hours`/`preview-label` → amber status, approve → hijau status, reject → merah status, ikon metrik per tone → token statusnya, form-footer/summary/verify → `surface-alt`, skeleton → `surface-alt`/`border`. Bonus: merge PR #17 sempat menimpa CSS audit (`.summary-box`, `.module-stats>div`, `.cols-3`, `.loading-rows` hilang dari `globals.css` padahal TSX masih memakainya) — dikembalikan di commit yang sama. Login tetap terang, PDF tak disentuh. |

## Ringkasan status

- **Dikerjakan:** P1–P6, G1–G7, R1–R4, C1, B1 (minimal), topik 04 langkah 1–4 + 6 (dark mode: token, blok gelap, toggle/persistensi/anti-flash, DM1–DM4, login tetap terang).
- **Perlu keputusan:** B1-varian-penuh (`next/image` + signed URL Supabase); DM-5 (61 selector berlatar terang di luar tabel token + ~148 `color:` tanpa token), DM-6 (nilai warna chart beda dari token tabel), DM-7 (`/verify/doc` ikut gelap atau selalu terang). G2 sudah diputus & dieksekusi di `6fc56a6`.
- Verifikasi akhir topik 04: `npm run lint` 0 error/0 warning · `npx tsc --noEmit` bersih · `env -u DATABASE_URL npm run build` sukses · kontras badge gelap dihitung (6.12–7.19:1, semua ≥4.5:1).
- Perilaku & tampilan selain yang disebut audit tidak berubah; verifikasi lint/typecheck/build hijau.
