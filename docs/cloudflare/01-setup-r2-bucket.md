# Langkah 1: Buat R2 Bucket

> **USANG (Sep 2026) - JANGAN DIKUTI APA ADANYA.** Rujukan tunggal: [05-rencana-deploy-produksi.md](05-rencana-deploy-produksi.md) + `media-worker/README.md` + `docs/media-architecture.md` (seksi 43/44).
> - Nama bucket dev = **`rentalin-dev-media`** (BUKAN `rentalin-local-media`).
> - CORS: Origins = origin aplikasi saja (JANGAN `*` di produksi); Methods `PUT, GET, HEAD` (tanpa `DELETE`); Headers hanya `Content-Type`; Max Age `600`.
> - Menu konfigurasi bucket = **Settings** (bukan "Environment variables"); catat **Account ID** untuk secret `R2_ACCOUNT_ID`.

## Prerequisites
- Akun Cloudflare
- Access ke project dengan Workers & R2 yang sudah diaktifkan

## 1. Buat Bucket Baru

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Pilih project Anda → **Workers** → **R2**
3. Klik **Create bucket**
4. Isi nama bucket:
   - Development: `rentalin-local-media`
   - Staging: `rentalin-staging-media`
   - Production: `rentalin-production-media`

## 2. Konfigurasi Security

Setelah bucket dibuat, centang **Environment variables** → **Security**:

- ✅ **Private bucket** (Public access: OFF)
- **CORS Configuration**:
  - Allowed Origins: `*` (untuk development) atau `https://app.rentalin.id, https://localhost:3000` (production)
  - Allowed Methods: `PUT, GET, HEAD, DELETE`
  - Allowed Headers: `Content-Type, Authorization, Content-Length`
  - Max Age: `600`

## 3. Dapatkan Access Keys

Di **Settings** → **R2 API Tokens**:

1. Klik **Create API Token**
2. Scope: **R2 Bucket** → `Read and Write`
3. Copy:
   - `Access Key ID`
   - `Secret Access Key`

> ⚠️ **PENTING**: Simpan dengan aman. Jangan pernah commit ke repository!

## 4. Verification

Test bucket dapat diakses melalui R2 Dashboard → **Objects** → **Browse**.

Jika kosong, koneksi berhasil.