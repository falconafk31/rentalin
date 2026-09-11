# TASK-1B — Perbaikan Temuan Review PM atas PR #12

> PR #12 (`arena/01a0905b-rentalin` → `main`): **belum di-merge, menunggu review ulang.**
> Cakupan: hanya 4 temuan PM + uji pendukung. 0014/0015 tak disentuh.

## 1. Finding 1 — Integritas overpayment

- `src/lib/finance.ts`: `normalizePaymentAmount(amount, sisa)` + `PAYMENT_TOLERANCE = 0,005`.
  - `amount − sisa > 0,005 (+eps 1e-9 untuk debu float)` → **ditolak**.
  - Di dalam toleransi → **dinormalisasi tepat sebesar sisa** (`Math.min`, invarian by construction).
- `recordPayment()` (`src/app/actions.ts`): `FOR UPDATE` + hitung dalam satu transaksi (tetap);
  menyimpan **nominal ternormalisasi**; status dari nominal ternormalisasi; pesan/audit
  menandai penyesuaian ("disesuaikan ke sisa tagihan").
- `changeStatus` pelunasan manual: **diverifikasi tanpa perubahan** — sudah menyetor tepat
  sebesar sisa sebagai baris ledger (`remaining.toFixed(2)` terkuantisasi 2 dp).
- Uji: 9 skenario baru di `scripts/finance-check.ts` (22/22 lolos), termasuk
  `100.000,004 → 100.000`, `100.000,006 → ditolak`, `40+30+30 → lunas`,
  `40+30+30.000,006 → baris ketiga ditolak`, sisa-0 menolak segalanya.

## 2. Finding 2 — Validasi magic bytes gambar BAST

- `src/lib/images.ts` (baru, tanpa dependensi): `detectImageKind()` memeriksa signature
  biner — JPEG (`FF D8 FF`), PNG (8-byte penuh), WebP (`RIFF....WEBP`, 12 byte).
  GIF/SVG/HTML/biner acak → null → ditolak.
- `src/app/api/bast-photos/route.ts`: gerbang `file.type` **dihapus**; buffer dibaca sekali,
  divalidasi via `validateImageUpload()` (maks 5 MB + magic bytes); Storage memakai
  **Content-Type hasil deteksi**, bukan klaim client. Model bucket privat, RBAC
  (`admin`/`operations`/`operator`), sanitasi nama berkas, dan audit upload **tetap**.
- Uji: 12 kasus di `scripts/task1b-check.ts` (JPEG/PNG/WebP valid; exe/HTML/SVG/GIF
  samaran, PNG palsu, header terpotong, >5 MB — semuanya ditolak).

## 3. Finding 3 — Audit login best-effort

- Fakta: `db` adalah Proxy lazy yang melempar **sinkron** saat `DATABASE_URL` hilang —
  inilah yang bisa membatalkan login sukses.
- `src/lib/resilient.ts` (baru): `withFallback(thunk, fallback, tag)` menahan gagal
  sync maupun async, mencatat ke log server, **tak pernah throw**.
- `src/lib/audit.ts`: `getProfileNameBestEffort()` memakai helper itu; `signIn()`:
  auth gagal → login gagal (tetap); auth sukses → audit best-effort → redirect
  `/dashboard` selalu tercapai. `logAudit()` sendiri memang tak pernah throw.
- `src/app/auth/callback/route.ts`: **diverifikasi tanpa perubahan** — murni
  `exchangeCodeForSession` + redirect aman, tanpa operasi DB/audit.
- Uji: 3 kasus mekanisme di `scripts/task1b-check.ts` (sukses, gagal async, gagal sync).
  E2E Supabase+DB nyata wajib di staging (tidak tersedia di sandbox).

## 4. Finding 4 — Pengaman snapshot historis (migrasi 0016)

- Keputusan: **0014 diperlakukan immutable** (aturan repo: jangan ubah migrasi yang
  sudah dianggap tereksekusi) → perbaikan di migrasi baru
  `supabase/migrations/0016_invoice_snapshot_guard.sql` (setelah 0015).
- Isi 0016:
  1. **Gagal eksplisit** (`RAISE EXCEPTION` + daftar nomor invoice) bila ada
     `total/pajak null, negatif, atau pajak > total`.
  2. **Gagal eksplisit** bila snapshot tak konsisten (`subtotal ≠ total−pajak` eksak,
     `tax_rate` null/di luar 0–100). Cek balik tarif→pajak disengaja tidak ada
     (tak terdefinisi baik akibat pembulatan dua arah — didokumentasikan di SQL).
  3. **Kunci going-forward** (idempotent): `invoices_amounts_sane` +
     `invoices_snapshot_consistent`. **Tanpa repair otomatis** — baris korup harus
     ditelaah manual.
- Perilaku snapshot PPN tak berubah (diuji §19): invoice lama terkunci di tarif
  penerbitan; setting baru hanya untuk invoice baru.
- Uji: 10 kasus simulasi predikat SQL di `scripts/task1b-check.ts` (11% normal,
  pajak-nol, 6 pola korup terdeteksi, 2 verifikasi formula backfill 0014).
  Sandbox tanpa Postgres — migrasi wajib diuji di staging sebelum merge.

## 5. Verifikasi sandbox

| Uji | Hasil |
|---|---|
| `npm run lint` | 0 error, 0 warning |
| `npm run typecheck` | 0 error |
| `npm run build` | sukses |
| `node scripts/finance-check.ts` | 22/22 PASS |
| `node scripts/task1b-check.ts` | 24/24 PASS |
| CI | kedua script dijalankan otomatis |

## 6. Checklist staging (wajib sebelum merge)

1. Jalankan migrasi 0014→0015→0016 di database staging berisi data historis.
2. E2E Finding 1: bayar `100.000,004` (ternormalisasi) dan `100.000,006` (ditolak).
3. E2E Finding 2: unggah JPEG/PNG/WebP asli + exe-samaran (ditolak).
4. E2E Finding 3: login sukses saat DB/audit normal; simulasikan DB mati setelah auth sukses → login tetap berhasil + redirect /dashboard.
5. E2E Finding 4: sisipkan 1 invoice korup di staging → 0016 raise menyebut nomornya;
   perbaiki manual → migrasi hijau.
6. Cek header `Content-Security-Policy` + 4 tangkapan layar TASK-1 §8.
