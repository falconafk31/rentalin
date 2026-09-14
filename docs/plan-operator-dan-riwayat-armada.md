# Rencana Fitur: Modul Operator/Driver + Riwayat & Utilisasi Armada

> Status: **revisi 2 (14 Sep 2026)** - menambah keputusan desain "operator di
> kontrak (wet/dry hire)", tarif dua mode (per jam / per hari), dan integrasi
> dokumen PDF. Referensi internet dicantumkan di seksi 6 (hanya sumber yang
> benar-benar ditelusuri). Analisis optimasi di seksi 2 tetap berlaku.

## 1. Ringkasan

| Fitur | Inti | Fase |
|---|---|---|
| A. Modul Operator/Driver | Registri operator (SIO/SIM, tarif per jam / per hari) + pemilihan operator di KONTRAK (include operator) + biaya terhitung otomatis + tabel operator di PDF | A1 registri, A2 kontrak+timesheet, A3 invoice, A4 PDF |
| B. Riwayat & Utilisasi Armada | Drawer "Lihat Detail" di modul fleet: jumlah pemakaian/jam, riwayat operator, kontrak/invoice, utilization rate | B1 query+drawer, B2 KPI dasbor |

Kondisi saat ini (terverifikasi): `timesheets.operator_id` merujuk `profiles.id`
(akun login), BUKAN registri personel - tidak ada tempat menyimpan SIO/SIM,
tarif per jam/per hari, atau masa berlaku lisensi operator. Riwayat per unit
belum ada UI-nya; data timesheet/invoice/handover sudah tersedia untuk
diagregasi.

## 2. Apa yang perlu dioptimasi (verifikasi 14 Sep 2026)

Sudah BERES (jangan dikerjakan ulang):
- A1 role check route finansial: `requireUser(['admin','finance','operations'])` ada di `src/app/api/report/route.ts:7`.
- A2 lazy-init DB: `src/db/index.ts` Proxy lazy + pool `max: 5`.
- A3 security headers + A4 CI: `.github/workflows/ci.yml` (lint, typecheck, finance-check, build, npm audit).
- A7 audit log, A13 foto BAST, A14 UI users, A15 media layer fleet: selesai.
- A9 payment ledger + status `partial`: `src/lib/finance.ts:44,60`.
- A11 PPN configurable: `company_settings.ppn_rate` dipakai `actions.ts:160`.
- A12 cron overdue: `vercel.json` -> `/api/cron/overdue` harian.
- K2 route duplikat timesheets/new: sudah tidak ada. K3 cache(): `data.ts:211,529,628,638`. O1 query per-modul + pagination server-side: selesai.
- O3/O5 lint `set-state-in-effect` & komparator sort: lint bersih (exit 0). O7 recharts lazy: `overview.tsx:4` `next/dynamic`. O6 parsing tanggal: helper y-m-d `format.ts`/`data.ts:59-62`.
- Lint (eslint 9) dan typecheck (tsc --noEmit): **keduanya bersih**.

Yang perlu dioptimasi / dikerjakan (prioritas):
1. **Bug 405 `GET /api/bast-photos`** - hanya ada `POST` (`route.ts:11`); thumbnail foto BAST lama di form edit gagal dimuat. PR kecil, dampak UX nyata.
2. **Defect orphan media saat role operator ganti cover fleet** - 403 dari Worker DELETE ditelan best-effort (`docs/cloudflare/05` Risiko 2).
3. **Reconciler orphan media** - cron pembersih `media_files` `pending`/`failed` + object tanpa referensi.
4. **Rate limiting + kuota media** - batasi media `active` per entity + Cloudflare Rate Limiting `/media/upload-url`.
5. **`playwright` masih di `dependencies`** - pindahkan ke `devDependencies` (atau tulis test e2e A6; `tests/` belum ada).
6. **Test logika finansial (A6)** - idempotensi penagihan, validasi HM, 1 unit = 1 kontrak aktif. Makin kritis saat biaya operator menambah komponen uang.
7. **Index `timesheets.unit_id`** - belum ada; dibutuhkan Fitur B.
8. **Monitoring** - 5xx Worker media + metrik R2 (Class A/B).
9. **Migrasi foto BAST ke media layer R2** (fase lanjutan `docs/media-architecture.md` 52.4).
10. **Ownership entity di Worker media** - hanya cek keberadaan entity.

## 3. Fitur A - Modul Operator/Driver

### 3.0 KEPUTUSAN: operator dipilih di level KONTRAK (jawaban pertanyaan)

**Ya - operator ditugaskan di kontrak, bukan hanya di timesheet.** Form kontrak
mendapat toggle **"Sertakan operator (wet hire)"**:

- **Include operator** -> muncul pemilih operator (dari registri `operators`
  status aktif) + snapshot tarif & mode tarif ke kontrak. Multi-operator
  diperbolehkan (shift/rotasi) lewat tabel `contract_operators`.
- **Tidak include (dry hire)** -> tidak wajib pilih apa pun; dokumen PDF tetap
  menampilkan baris/tabel operator dengan keterangan
  **"TIDAK TERMASUK JASA OPERATOR (DRY HIRE)"** (sesuai permintaan: tabel tetap
  ada).

Dasar keputusan (referensi seksi 6): pasar rental alat berat membedakan
**wet hire (unit + operator) vs dry hire (unit saja)** sebagai keputusan
KONTRAK, bukan keputusan harian (almarwan, United Rentals, Diggermate); di
Indonesia banyak ditawarkan sebagai paket "All in (termasuk BBM dan operator)"
vs tarif polos per jam (jayabetonreadymix, arthamix). timesheet TETAP bisa
mengganti/menunjuk operator lapangan (rotasi, sakit) - kontrak hanya menentukan
siapa yang disewakan dan tarifnya.

### 3.1 Masalah
Operator/driver hanya hidup sebagai `profiles` (akun login). Tidak ada data
personel: kelas SIO (Surat Izin Operator Kemnaker - wajib K3 operator alat
berat di Indonesia), nomor & masa berlaku SIO, SIM kelas berat, KTP, kontak,
tarif per jam/per hari, status aktif.

### 3.2 Skema data baru

```sql
CREATE TABLE operators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  employee_no TEXT UNIQUE,
  ktp_no TEXT,
  phone TEXT,
  sio_class TEXT,          -- kelas alat yang disertifikasi (excavator, crane, ...)
  sio_number TEXT,
  sio_expiry DATE,         -- warning 30 hari (pola SIKO fleet)
  license_class TEXT,      -- SIM kelas berat (B2 umum, dsb.)
  license_expiry DATE,
  rate_per_hour NUMERIC(12,2) NOT NULL DEFAULT 0,  -- tarif per jam
  rate_per_day NUMERIC(12,2) NOT NULL DEFAULT 0,   -- tarif per hari
  default_rate_type TEXT NOT NULL DEFAULT 'hourly' CHECK (default_rate_type IN ('hourly','daily')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  notes TEXT,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL, -- opsional: akun login terkait
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX operators_status_idx ON operators(status);
CREATE INDEX operators_name_idx ON operators(full_name);
```

`operators` = registri personel, terpisah dari `profiles` (akun) - tidak semua
driver punya akun; data SIO/SIM/tarif bukan data akun.

Kontrak (migrasi terpisah):

```sql
ALTER TABLE contracts
  ADD COLUMN include_operator BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN operator_rate NUMERIC(12,2),         -- snapshot tarif saat kontrak
  ADD COLUMN operator_rate_type TEXT CHECK (operator_rate_type IN ('hourly','daily'));

CREATE TABLE contract_operators (
  contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
  operator_id UUID REFERENCES operators(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (contract_id, operator_id)
);
```

Snapshot di kontrak = tarif historis aman saat master tarif berubah (pola yang
sama dengan `contracts.rate_per_hour` yang tidak mengikuti `fleet.hourly_rate`).

Timesheet (migrasi terpisah):

```sql
ALTER TABLE timesheets
  ADD COLUMN operator_driver_id UUID REFERENCES operators(id) ON DELETE SET NULL;
CREATE INDEX timesheets_operator_driver_id_idx ON timesheets(operator_driver_id);
CREATE INDEX timesheets_unit_id_idx ON timesheets(unit_id);
```

- `operator_driver_id` = siapa yang mengemudikan hari itu (default dari
  `contract_operators`, boleh diganti lapangan). `operator_id` lama (profiles)
  dipertahankan sebagai "siapa mencatat" (menutup audit A10).
- TIDAK ada kolom biaya per timesheet: biaya operator dihitung saat agregasi
  (invoice/laporan) dari mode tarif kontrak - lihat 3.5. Alasan: mode "per
  hari" tidak bisa dihitung per baris (butuh COUNT DISTINCT hari).

### 3.3 Menu & UI operators
- Menu baru section DATA POKOK: `/dashboard/operators` - "Operator & Driver".
- Tambah `'operators'` ke `MODULE_SLUGS` (`data.ts:46`) + kolom/form di
  `actions.ts` + ikon `shell.tsx` (`HardHat`/`PersonStanding` lucide) +
  `docs/icon-map.md`.
- Kolom list: nama, no. pegawai, kelas SIO + kedaluwarsa (badge warning 30
  hari), SIM + kedaluwarsa, tarif /jam & /hari, status, jumlah log (subquery).
- Form: field skema; `rate_per_hour` atau `rate_per_day` minimal salah satu > 0.

### 3.4 Form kontrak & timesheet
- Form kontrak: toggle "Sertakan operator"; bila aktif -> multi-select operator
  aktif + pilih mode tarif (default `default_rate_type` operator pertama) +
  isi tarif (pra-isi dari master, boleh dioverride per kontrak). Validasi:
  include_operator=true WAJIB minimal 1 operator + tarif > 0; tarif mode yang
  dipilih harus > 0.
- Form timesheet: dropdown "Operator/Driver" berisi operator kontrak itu (bila
  include); bila kontrak dry hire -> dropdown kosong/tersembunyi (tetap boleh
  diisi bila admin mengizinkan - keputusan terbuka #2). Operator harus
  `active`; SIO/SIM kedaluwarsa -> peringatan non-blokir.

### 3.5 Perhitungan biaya operator (2 mode tarif)
Fungsi baru di `src/lib/finance.ts` (murni, ikut `finance-check.ts`):

```ts
calcOperatorCost(logs, { rate, type }):
  type='hourly' -> SUM(effective_hours) * rate
  type='daily'  -> COUNT(DISTINCT date) * rate
```

- `hourly`: tarif per jam x total jam efektif (konsisten penagihan unit yang
  berbasis jam efektif, PASAL 3 ayat 2 sekarang).
- `daily`: tarif per hari x jumlah hari kerja (distinct tanggal dengan
  timesheet disetujui) - pola umum sewa harian di pasar Indonesia.
- Jam breakdown tidak menambah biaya (operator dibayar jam efektif/hari
  kerja). Laporan internal tetap menghitung biaya operator walau kontrak dry
  hire? Tidak - dry hire tidak ada biaya operator tercatat; bila operator
  internal tetap mengerjakan, catat via timesheet untuk laporan payroll.

### 3.6 Integrasi invoice (Fase A3)
Bila `include_operator = true`: invoice menambah komponen **`operator_amount`**
(`subtotal_amount` = sewa unit saja; `total = subtotal + operator_amount + tax`).
Wajib update: `calcInvoiceTotals`, agregasi `actions.ts:159-163` (kini juga
mengagregasi biaya operator dari logs+kontrak), PDF invoice (baris "Jasa
operator"), idempotensi linking, dan `scripts/finance-check.ts`. Jangan
sampai timesheet yang sama tertagih 2x untuk komponen operator (lock yang sama
dengan penagihan unit).

### 3.7 Integrasi dokumen PDF (permintaan: "perbarui file pdf dengan tabel nama operator")

Struktur PDF saat ini (`src/components/pdf-document.tsx`): SPH/invoice memakai
tabel `URAIAN | KETERANGAN/NILAI` (`styles.table`, `colDescription` 58%);
perjanjian memakai PASAL 1 (objek) + PASAL 3 (harga) + blok totals.

Perubahan (semua dokumen kontrak):

1. **Tabel Jasa Operator** (section baru, selalu dirender untuk dokumen yang
   terkait kontrak):
   - Include: baris per operator - NO | NAMA OPERATOR | SIO / KELAS | MASA
     BERLAKU SIO | TARIF (Rp x/jam atau Rp x/hari). Multi-operator = banyak
     baris.
   - Dry hire: tabel tetap ada, 1 baris keterangan:
     **"TIDAK TERMASUK JASA OPERATOR (DRY HIRE) - pengoperasian unit menjadi
     tanggung jawab PIHAK KEDUA"**.
2. **SPH** (penawaran harga): tambah baris di tabel URAIAN -
   "Jasa operator: Termasuk - <nama, kelas SIO> (Rp x/jam)" atau
   "Jasa operator: Tidak termasuk (dry hire)". Data dari `getDocumentBundle`.
3. **Perjanjian**:
   - PASAL 1 (objek): tambah baris spesifikasi "- Jasa operator: Termasuk
     (lihat Tabel Jasa Operator)" / "- Jasa operator: Tidak termasuk (dry hire)".
   - PASAL 3 (harga): ayat baru setelah ayat 1 - bila include:
     "Jasa operator disediakan PIHAK PERTAMA dengan tarif Rp x/jam (atau
     Rp x/hari), ditagihkan berdasarkan jam efektif / hari kerja operator yang
     tercatat pada timesheet harian yang disetujui." Bila dry hire:
     "Jasa operator tidak termasuk dalam perjanjian ini (dry hire);
     pengoperasian unit menjadi tanggung jawab PIHAK KEDUA."
   - Wajib menghormati override template: blok PASAL 3 saat ini punya jalur
     `data.pasalText?.pasal_3` - operator clause disisipkan sebagai ayat
     terpisah yang tetap tampil meski pasal dikustomisasi (atau diberi slot
     template `pasal_3_operator`); jangan hilangkan keterangan dry hire.
   - `PdfAgreement` diperluas: `operators?: { name; sioClass; sioNumber;
     sioExpiry; rate; rateType }[]; includeOperator: boolean`.
4. **BAST mobilisasi**: tambah baris info "Operator yang ditugaskan: <nama>"
   (atau "Tanpa operator (dry hire)") di tabel informasi unit.
5. **Invoice**: blok totals menambah baris "Jasa operator (n jam x Rp x)" atau
   "(n hari x Rp x)" sebelum PPN; tabel riwayat operator kecil (nama + jam/hari)
   bila include.
6. **/verify/doc**: tidak menampilkan data operator (PII) - hanya nomor & jenis
   dokumen (sesuai kebijakan verifikasi publik yang ada).

### 3.8 Otorisasi, RLS, audit
- CRUD operators: admin + operations; operator read-only.
- RLS `operators` & `contract_operators`: SELECT semua role internal;
  INSERT/UPDATE/DELETE admin+operations (cermin policy fleet/media_files).
- Audit log: create/update/delete entity `operators`; perubahan include
  operator/tarif kontrak tercatat di before/after kontrak.

### 3.9 Migrasi data awal
- Backfill opsional (data demo): `INSERT INTO operators (full_name, profile_id)`
  dari distinct `timesheets.operator_id` yang punya `profiles`.

## 4. Fitur B - Riwayat & Utilisasi Armada (drawer detail)

### 4.1 UX
Di list fleet, aksi baris "Lihat Detail" membuka **drawer kanan** (slide-over,
pola modal yang sudah ada) - list tetap terlihat. Isi:

1. **Kartu identitas unit** - kode, kategori, merek/model, tahun, status,
   tarif/jam, lokasi, foto cover (bila media aktif).
2. **Ringkasan pemakaian**: jumlah kontrak (total & selesai), jumlah log
   timesheet, total hari kerja (COUNT DISTINCT date), **total jam operasi**
   (SUM effective_hours), total jam breakdown, total HM terpakai
   (MAX end_hm - MIN start_hm), **utilization rate** (4.2), pendapatan unit
   (SUM invoice total via kontrak - hanya admin/finance/operations yang
   melihat nilai), biaya operator tercatat (bila ada).
3. **Riwayat operator** - agregat per operator: nama, jumlah log, jam efektif,
   jam breakdown, periode awal-akhir (dari `operator_driver_id`, fallback
   `operator_id` -> profiles untuk data lama).
4. **Riwayat sewa** - daftar kontrak unit (nomor, klien, periode, status,
   rate, include operator?) + status invoice.
5. **Riwayat serah terima** - BAST mobilisasi/demobilisasi.
6. **Timesheet terbaru** - 5-10 log terakhir (tanggal, operator, HM, jam).

### 4.2 Metrik & formula (referensi)
- **Utilization rate** = utilized / available x 100. Contoh autosist: 10 unit
  x 22 hari x 10 jam = 2.200 jam tersedia; 1.650 terpakai -> 75%. Skybitz:
  total hours billed / total billing hours available.
- "Jam tersedia" = hari aktif (periode kontrak atau hari kalender yang dipilih)
  x `available_hours_per_day` - simpan sebagai **setting baru di
  `company_settings`** (default 8; jangan hardcode - pelajaran audit K6).
- **Downtime ratio** = breakdown_hours / total_hours (Geotab/Fleetio:
  downtime adalah KPI utama fleet).
- MVP: angka + tooltip formula; chart menyusul (recharts sudah lazy).

### 4.3 Implementasi query
- Server Action `getFleetUnitHistory(unitId)`: timesheets `WHERE unit_id = $1`
  (butuh index baru `timesheets_unit_id_idx`), agregat operator GROUP BY,
  kontrak+invoice LEFT JOIN, utilization dari setting.
- Pagination riwayat panjang (pola `MODULE_PAGE_SIZE`); agregasi di SQL (pola
  O1), drawer render dengan skeleton - tidak memblok list.

### 4.4 Otorisasi
- Drawer: semua role internal; **nilai pendapatan/invoice** hanya
  admin/finance/operations (konsisten A1).

## 5. Rencana PR (urutan)

| PR | Isi | Risiko |
|---|---|---|
| PR-1 | Migrasi: `operators`, `contract_operators`, kolom `contracts` (include_operator + snapshot tarif), kolom `timesheets` (operator_driver_id), index `timesheets_unit_id_idx`, RLS | rendah (kolom baru, jalur lama utuh) |
| PR-2 | Modul UI `/dashboard/operators` (CRUD + menu + ikon + audit) | rendah |
| PR-3 | Form kontrak: toggle include operator + pilih operator + mode/tarif; form timesheet: dropdown operator | sedang |
| PR-4 | `calcOperatorCost` di finance.ts + integrasi invoice `operator_amount` + idempotensi + finance-check | tinggi (uang) |
| PR-5 | PDF: Tabel Jasa Operator (SPH/perjanjian/BAST/invoice) + PASAL 1/3 + keterangan dry hire + slot template | sedang |
| PR-6 | Drawer riwayat armada (query agregat + UI + utilization) | sedang |
| PR-7 | Laporan biaya operator (internal) | rendah |

Setiap PR: lint + typecheck + build + `node scripts/finance-check.ts` hijau
(CI sudah menjalankan).

## 6. Referensi (ditelusuri 14 Sep 2026)

Utilization & KPI fleet:
- Autosist - Fleet Utilization Rate: Calculate, Benchmark & Improve (contoh 165/220 jam = 75%) - https://autosist.com/blog/fleet-utilization-rate-track-improve/
- Skybitz - How To Calculate & Improve Fleet Utilization (total hours billed / total billing hours available) - https://www.skybitz.com/Resources/Articles/fleet-utilization
- Opsima - Fleet Utilization: Definition, Formula + How to Improve - https://opsima.com/blog/kpis/fleet-utilization/
- Geotab - Fleet Management KPIs (produktivitas vs downtime) - https://www.geotab.com/blog/fleet-management-kpis/
- Fleetio - Fleet Management KPIs: 6 Metrics - https://www.fleetio.com/blog/fleet-management-kpis

Wet hire vs dry hire (operator include/tidak - keputusan kontrak):
- Al Marwan - Dry Hire, Wet Hire, and Lease-to-Own Heavy Equipment - https://almarwan.com/news/4446/dry-hire-wet-hire-and-lease-to-own-heavy-equipment
- United Rentals - Dry Hire vs Wet Hire: what each covers - https://www.unitedrentals.com/en-au/project-uptime/equipment/dry-hire-vs-wet-hire-what-does-orange-hire-offer
- Diggermate - Dry Hire vs Wet Hire (dry = tanpa operator, lebih murah) - https://diggermate.com/dry-hire-vs-wet-hire/
- DESI Machines - Wet Lease vs Dry Lease Equipment: Which Earns More? (premium harga wet vs dry) - https://desimachines.com/blog/wet-lease-vs-dry-lease-equipment/
- CoJo Asphalt - Rent a Machine or Hire an Operator (biaya all-in wet hire) - https://www.cojoasphalt.com/blog/rent-excavator-vs-hire-operator-oregon

Tarif per jam / per hari & praktik Indonesia:
- Jayabeton Readymix - Harga Sewa Excavator Perjam (ada paket "All in: termasuk BBM dan operator") - https://jayabetonreadymix.com/harga-sewa-excavator-perjam/
- Arthamix - Harga Sewa Alat Berat Terbaru (daftar tarif per jam per tipe) - https://www.arthamix.com/product/harga-sewa-alat-berat/
- Ciptahydropower - Harga Sewa Alat Berat Per Hari (tarif harian per tipe) - https://www.ciptahydropower.com/harga-sewa-alat-berat-per-hari/
- Hukumindo - Contoh Perjanjian Sewa Alat Berat (tabel "Harga Sewa Alat Per Jam" di lampiran perjanjian) - https://www.hukumindo.com/2021/08/contoh-perjanjian-sewa-alat-berat.html
- Mekari Sign - 3 Contoh Surat Perjanjian Sewa Alat Berat (rincian biaya per jam/per hari/borongan di PASAL harga) - https://mekarisign.com/id/blog/contoh-surat-perjanjian-sewa-alat-berat/
- Scribd - DRAFT Perjanjian Sewa Excavator (struktur biaya: tarif/jam, minimum jam, komponen) - https://id.scribd.com/document/631441893/DRAFT-PERJANJIAN-SEWA-EXCAVATOR-ALLTRIKASIH-200-JAM-RCM

SIO operator alat berat (Kemnaker RI):
- pjk3jabar.com/kenapa-operator-harus-memiliki-sio/ ; ciptahydropower.com/cara-mendapatkan-sio-operator/ ; katigaku.com/faq/bagaimana-cara-mengurus-sio-alat-berat-di-depnaker ; sio.co.id ; hse.co.id/surat-ijin-operator-sio/excavator

Perangkat lunak rental (fitur pembanding):
- MCS Rental Software - Best Heavy Equipment Rental Software 2026 - https://www.mcsrentalsoftware.com/us/resources/best-heavy-equipment-rental-software-in-2026/
- Construction Today - Heavy equipment rental software comparison (telematics, billing, job-cost) - https://construction-today.com/news/streamline-jobs-with-the-best-heavy-equipment-rental-software/
- Staedean - Equipment rental invoicing & per-hour registration - https://staedean.com/rental/blog/equipment-rental-invoicing-rental-software-dynamics-365

## 7. Risiko & keputusan terbuka

1. Definisi "jam tersedia" utilization (hari kerja? periode kontrak?) + nilai
   default `available_hours_per_day` - keputusan bisnis, simpan sebagai setting.
2. Dry hire: bolehkah timesheet tetap mencatat operator (untuk laporan internal)
   tanpa menagih? Default usulan: boleh dicatat, komponen invoice tidak muncul.
3. Mode tarif `daily`: hitung hari kerja (distinct tanggal timesheet) atau hari
   kalender kontrak? Default usulan: hari kerja tercatat (lebih adil, terverifikasi).
4. Operator diganti di tengah kontrak (rotasi): `contract_operators` multi-row
   sudah menampung; PDF menampilkan semua operator yang ditugaskan.
5. `include_operator` + tarif operator = komponen uang baru - kerjakan PR-4/5
   SETELAH test finansial A6 ada; PPN atas jasa operator: konsultasikan
   perlakuan pajak (jasa tenaga kerja bisa beda perlakuan).
6. Data SIO/SIM/KTP operator = PII - akses terbatas, tidak diekspos di
   endpoint publik (konsisten kebijakan /verify).
7. BBM: referensi pasar ada paket "all in termasuk BBM dan operator" - desain
   ini hanya mengurus operator; BBM tetap di luar (PASAL 4 ayat 2b saat ini
   sudah menetapkan BBM tanggungan PIHAK KEDUA). Jika kelak perlu, jadi setting
   kontrak terpisah.
