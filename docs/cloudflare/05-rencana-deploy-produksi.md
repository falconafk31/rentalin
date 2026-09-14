# Langkah 5: Rencana Koneksi Cloudflare R2 (Media Layer)

> Status: **revisi 2 (14 Sep 2026) - hasil verifikasi silang 2 agent independen (fact-check + tinjauan risiko)**. Media layer (kode) sudah selesai di repo; yang tersisa adalah **deploy infrastruktur** + aktivasi. Tanpa langkah di dokumen ini, fitur foto fleet otomatis nonaktif dan aplikasi tetap jalan normal selama `MEDIA_API_URL` kosong (media-architecture seksi 41/52).
>
> Dokumen ini mengikuti **kode aktual** (`media-worker/`, `src/lib/media.ts`, `supabase/migrations/0023_media_files.sql`). Bila bertentangan dengan `01`-`04` di folder ini, dokumen ini yang berlaku - lihat bagian "Temuan penting - jangan ikut dokumen lama".

## Ringkasan

Arsitektur: **Supabase PostgreSQL** = metadata + relasi bisnis, **Cloudflare R2** (bucket privat) = file fisik, **Cloudflare Worker** = Media API (authorization, validasi, presigned URL, protected read). Next.js hanya tahu URL publik Worker (`MEDIA_API_URL`); kredensial R2 tidak pernah ada di Next.js/browser.

Alur upload: Server Action Next.js membuat baris `media_files` (status `pending`) -> minta presigned PUT ke Worker -> browser PUT langsung ke R2 -> Worker `/media/complete` verifikasi object + magic bytes -> Next.js tandai `active`. Baca: browser ambil signed GET ber-TTL pendek dari Worker.

Yang **sudah ada** (tidak perlu dikerjakan lagi):
- Worker source lengkap (`media-worker/src/*`): upload-url, complete, GET, DELETE, health.
- Integrasi Next.js (`src/lib/media.ts`, Server Action fleet, UI `FleetPhotoSection`).
- Skema + migrasi `media_files` (`0023`), drizzle schema, RLS, constraint pair.
- CSP siap di `next.config.ts` (`connect-src` mengizinkan `https://*.r2.cloudflarestorage.com` untuk presigned PUT dari browser).

Yang **belum** (inti rencana ini):
1. Buat bucket R2 (private + CORS) per environment.
2. Buat R2 API token + ambil Account ID.
3. Pastikan migrasi DB (sampai `0023`) teraplikasi di Supabase target.
4. Tetapkan konvensi deploy (blok `env.*` + `--env`, ATAU tanpa `--env`) + isi vars + secrets.
5. `wrangler deploy` Worker.
6. Uji RUNTIME Worker (`wrangler dev` + PUT nyata) - bukan hanya `deploy --dry-run`.
7. Isi `MEDIA_API_URL` di Vercel + `.env.local`.
8. Uji end-to-end + uji role.

## Temuan penting - jangan ikut dokumen lama (WAJIB dibaca sebelum eksekusi)

Docs `01`-`04` ditulis lebih awal dan **sistematis usang** terhadap kode final. Verifikasi silang 14 Sep 2026: 6/6 klaim utama CONFIRMED + 15+ temuan tambahan (laporan: `.cluster/rentalin-r2-findings/subagent_01.md`, `subagent_02.md`).

| Item | Dok lama (01/02/03/04) | Kode aktual (benar) | Bukti (file:line) |
|---|---|---|---|
| Secret Worker | `SUPABASE_SERVICE_ROLE_KEY` (02:54; 03:7/18/28) | **Tidak perlu.** Var non-rahasia `SUPABASE_PUBLISHABLE_KEY` + token user via Data API | media-worker/src/supabase.ts:24,59,86,95 |
| Secret R2 | `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` | Sama, **plus** `R2_ACCOUNT_ID` (endpoint S3) | supabase.ts:31; r2.ts:20 |
| Env Next.js | `NEXT_PUBLIC_MEDIA_API_URL` (03:60) | **`MEDIA_API_URL`** (server-only, tanpa `NEXT_PUBLIC_`) | src/lib/media.ts:1,11,40; .env.example |
| Nama bucket dev | `rentalin-local-media` (01:13; 03:38) | **`rentalin-dev-media`** | wrangler.jsonc:27; media-worker/README.md |
| /health | `{"status":"ok","timestamp":...}` (02:79; 04:9) | **`{"ok":true,"env":"..."}`** | index.ts:203 |
| Body upload-url | snake_case, tanpa `mediaId`/`size`/`objectKey` (04:20-33) | camelCase wajib 7 field: `mediaId, entityType, entityId, category, mimeType, size, objectKey`; respons `{uploadUrl, objectKey, mediaId, expiresAt}` | index.ts:69-119; validate.ts:78-85 |
| R2 binding | (implisit) | **Tanpa `r2_buckets`** - akses S3 API + secret | wrangler.jsonc:14-31; r2.ts:4-32 |

Nomor baris kira-kira (file bisa bergeser); yang penting itemnya. **Temuan tambahan** (detail di banner koreksi masing-masing dokumen):

- doc 02: struktur file Worker salah (digambarkan `src/routes/*` + `src/lib/*`) - aktual rata: `src/index.ts`, `src/supabase.ts`, `src/r2.ts`, `src/validate.ts`, `src/errors.ts`; heading menulis `wrangler.toml` - aktual **`wrangler.jsonc`**.
- doc 02/03/04: host contoh `media-rentalin.workers.dev` / `media.rentalin.com` - nama Worker aktual `rentalin-media`; URL final ditentukan hasil deploy.
- doc 04: `GET /media/:id` ditulis mengembalikan `{url, key, ...}` - aktual `{url, expiresAt}`; object key ber-ekstensi sesuai MIME aktual (`.jpg`/`.png`/`.webp`, validate.ts:24-28), bukan selalu `.webp`.
- doc 04: status DB ditulis `completed` - aktual lifecycle `pending -> active` (+ `failed`/`deleted`); oversize ditulis 413 - aktual **400** `FILE_TOO_LARGE`.
- doc 04: ekspektasi uji "fleet milik orang lain -> 403" **salah** - Worker hanya cek entity ada + role, TIDAK cek kepemilikan (supabase.ts:123-131).
- doc 03: `NEXT_PUBLIC_SUPABASE_ANON_KEY` - aktual `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; binding `MEDIA_BUCKET` tidak ada (bucket = var `BUCKET_NAME`).
- doc 01: CORS ditulis wildcard + method `DELETE` + header `Authorization`/`Content-Length` - kebutuhan aktual: origin aplikasi (tanpa `*` di produksi), methods `PUT, GET, HEAD`, header `Content-Type`.
- doc 04: contoh JS memakai `supabase.auth.session()` (deprecated) - pakai `auth.getSession()`.

Nuansa: service role key memang dipakai aplikasi Next.js, tapi khusus fitur "Undang Pengguna" (src/lib/data.ts:732) - bukan bagian media layer, bukan secret Worker.

Konsekuensi penting: **baris `media_files` (status `pending`) harus dibuat lebih dulu** sebelum `/media/upload-url` dipanggil (index.ts:106-119 menolak bila tidak ada/bukan `pending`) - jadi migrasi DB wajib sudah teraplikasi sebelum smoke test.

## Step 0 - Prasyarat

- Akun Cloudflare dengan **R2 diaktifkan** (free tier cukup: 10 GB storage; egress gratis).
- Akses ke Supabase project target (URL + publishable key) dan cara apply migrasi (`supabase/README.md`).
- Origin produksi aplikasi (URL Vercel), mis. `https://app.<domain>`.
- `wrangler` sudah ada: root `node_modules` sudah punya `wrangler@4.131.1` (perubahan `package.json` yang belum di-commit). **Commit dulu** perubahan `package.json` + `package-lock.json` itu.
- Node 22 (terpasang), npm 10.

## Step 1 - Buat bucket R2 (private + CORS)

Cloudflare Dashboard > R2 > Create bucket. Buat per environment (seksi 43 media-architecture):

| Environment | Bucket |
|---|---|
| development | `rentalin-dev-media` |
| staging | `rentalin-staging-media` |
| production | `rentalin-production-media` |

Untuk **setiap** bucket:
1. Public access: **OFF** (privat).
2. **CORS** (dibutuhkan presigned PUT langsung dari browser):
   - Allowed Origins: origin aplikasi. Dev: `http://localhost:3000`. Prod: `https://app.<domain>` (JANGAN `*` di produksi).
   - Allowed Methods: `PUT, GET, HEAD`
   - Allowed Headers: `Content-Type`
   - Max Age: `600`

Catatan origin preview: deployment preview Vercel (`https://rentalin-*.vercel.app`) tidak otomatis diizinkan; tambahkan origin itu sementara saat pratinjau, hapus setelahnya.

Layout object (seksi 37): `fleet/{fleetId}/cover/{mediaId}{ext}`, `fleet/{fleetId}/gallery/{mediaId}{ext}`, `bast/{handoverId}/{kategori}/{mediaId}{ext}` - ekstensi mengikuti MIME aktual (`.jpg`/`.png`/`.webp`), bukan selalu `.webp`.

## Step 2 - R2 API token + Account ID

1. Cloudflare Dashboard > **R2 > Manage R2 API Tokens > Create API Token**.
2. Permission: **Object Read & Write**. Scope: bucket spesifik per env (lebih aman: satu token per environment).
3. Simpan `Access Key ID` dan `Secret Access Key` (hanya tampil sekali).
4. Catat **Account ID** (Dashboard kanan atas / R2 > Overview) - dipakai endpoint S3 dan secret `R2_ACCOUNT_ID`.

## Step 3 - Terapkan migrasi database

Pastikan tabel `media_files` + policy RLS + constraint ada di DB target (migrasi sampai `0023`; `0023` ber-dependensi `0001/0003/0004`).

- Dev lokal: `npx drizzle-kit push` (sesuai cara kerja repo).
- Produksi/Supabase: ikuti `supabase/README.md`; migrasi teraplikasi berurutan (jangan mengubah migrasi yang sudah dijalankan).

Verifikasi di Supabase SQL editor:
- `SELECT * FROM media_files LIMIT 1;` (struktur benar).
- Policy `media_files_read/insert/update/delete` ada.
- Constraint `media_files_category_valid` + `object_key UNIQUE` aktif.

## Step 4 - Tetapkan konvensi deploy + isi vars Worker (`media-worker/wrangler.jsonc`)

Pilih SATU konvensi dan konsisten di Step 5-7 + cheat sheet (perbaiki juga `media-worker/README.md` bila perlu):

**Opsi A (disarankan): blok `env` per environment.**

```jsonc
"env": {
  "production": {
    "vars": {
      "SUPABASE_URL": "https://<ref>.supabase.co",
      "SUPABASE_PUBLISHABLE_KEY": "<publishable-key>",
      "BUCKET_NAME": "rentalin-production-media",
      "ENVIRONMENT": "production",
      "ALLOWED_ORIGINS": "https://app.<domain>",
      "UPLOAD_TTL_SECONDS": "900",
      "READ_TTL_SECONDS": "300",
      "MAX_UPLOAD_BYTES": "2097152"
    }
  }
}
```

**PERINGATAN (blocker - temuan tinjauan risiko):** `vars` Wrangler **tidak diwarisi** dari top-level ke `env.*`. Blok `env.production` tanpa mengulang semua vars => Worker produksi jalan tanpa `SUPABASE_URL`/`BUCKET_NAME` dan semua request gagal diam-diam. Bila memakai Opsi A, deploy dan `secret put` wajib menyertakan `--env production`.

**Opsi B: tanpa `--env`** - satu Worker `rentalin-media`, `vars` top-level diisi sesuai fase deploy. Jangan dicampur: `wrangler deploy --env production` tanpa blok `env.production` akan gagal (environment tak dikenal).

Daftar var (top-level dan/atau per env):
- `SUPABASE_URL` = `https://<ref>.supabase.co`
- `SUPABASE_PUBLISHABLE_KEY` = publishable/anon key Supabase
- `BUCKET_NAME` = bucket sesuai env (`rentalin-dev-media` dsb)
- `ENVIRONMENT` = `development` / `production`
- `ALLOWED_ORIGINS` = origin app dipisah koma (prod: `https://app.<domain>`; localhost hanya dev)
- `UPLOAD_TTL_SECONDS` = `900`
- `READ_TTL_SECONDS` = `300`
- `MAX_UPLOAD_BYTES` = `2097152` (2 MB)

## Step 5 - Install + login + dry-run

```sh
cd media-worker
npm ci
npx wrangler login
npx wrangler whoami            # pastikan akun = pemilik bucket; cocokkan dengan R2_ACCOUNT_ID
npx wrangler deploy --dry-run  # cek bundling (nodejs_compat + @aws-sdk)
```

`media-worker/node_modules` belum ada, jadi `npm ci` wajib. Catatan: `--dry-run` hanya membuktikan bundle lolos, TIDAK menguji runtime (lihat Step 8).

## Step 6 - Set Worker Secrets

Sesuaikan konvensi Step 4 (Opsi A: tambahkan `--env production` di tiap perintah):

```sh
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
# (tanpa SUPABASE_SERVICE_ROLE_KEY - lihat bagian Temuan penting)
```

Pastikan `R2_ACCOUNT_ID` = akun pemilik bucket, dan `BUCKET_NAME` pada env yang sama = bucket yang di-scope token R2 - mismatch => S3 AccessDenied => semua operasi 503.

## Step 7 - Deploy Worker

```sh
npx wrangler deploy                    # Opsi B (tanpa env)
npx wrangler deploy --env production   # Opsi A
```

Catat URL hasil deploy, mis. `https://rentalin-media.<subdomain>.workers.dev`.
Opsional: custom domain `media.<domain>` (Workers > Routes / Domains). Ingat: origin bucket CORS tetap origin aplikasi (bukan domain media).

## Step 8 - Verifikasi Worker (RUNTIME, bukan hanya bundling)

```sh
curl https://<worker-url>/health
# harapan: {"ok":true,"env":"..."}
```

**Uji runtime WAJIB sebelum produksi:** jalankan `npx wrangler dev` lalu smoke test PUT nyata + `/media/complete`. Alasan (temuan risiko): `media-worker/src/r2.ts` membaca `GetObjectCommand.Body` sebagai Web `ReadableStream` (`.getReader()`); bila AWS SDK memilih handler Node di workerd (`nodejs_compat`), `/media/complete` bisa gagal untuk SEMUA upload - kegagalan seperti ini tidak terdeteksi `deploy --dry-run`. Bila terjadi, set request handler berbasis fetch (mis. `@smithy/fetch-http-handler`) pada `S3Client`.

Smoke test ber-jalur (butuh JWT user + satu baris `media_files` `pending`):
0. Buat baris `pending`: (a) jalankan app dev + mulai upload foto fleet (Server Action membuat baris, src/app/actions.ts), atau (b) INSERT manual ke `media_files` dengan `status='pending'` dan `object_key` sesuai pola.
1. `POST /media/upload-url` (Bearer token; body camelCase 7 field lengkap) -> dapat `uploadUrl`, `objectKey`, `mediaId`.
2. `PUT` byte ke `uploadUrl`: header `Content-Type` harus == `mime_type` baris; ukuran byte harus == `size_bytes` (deviasi => PUT gagal / `complete` 422). Di dev, periksa parameter `X-Amz-SignedHeaders` pada uploadUrl.
3. `POST /media/complete` `{ "mediaId": "..." }` -> `{ "ok": true }`.
4. `GET /media/<mediaId>` -> `{url, expiresAt}`; buka signed URL -> gambar tampil.
5. `DELETE /media/<mediaId>` -> `{ "ok": true }`.

Uji error: tanpa token -> 401; role tak berizin -> 403; file > max -> 400 `FILE_TOO_LARGE`; byte bukan gambar -> `INVALID_IMAGE_SIGNATURE`. Catatan: "entity milik orang lain" TIDAK menghasilkan 403 (Worker tidak cek kepemilikan).

## Step 9 - Isi `MEDIA_API_URL` di Next.js

- Dev: `.env.local` -> `MEDIA_API_URL="https://<worker-url>"` (server-only, TANPA `NEXT_PUBLIC_`). `.env.local` juga wajib sudah punya `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - `isMediaConfigured()` mengecek semuanya (src/lib/media.ts:11).
- Produksi: env Vercel -> `MEDIA_API_URL` = URL Worker produksi. Lalu redeploy Vercel.

Selama variabel ini kosong (atau Supabase belum terkonfigurasi), `isMediaConfigured()` = false dan seluruh UI foto fleet tersembunyi (fail-soft).

## Step 10 - Uji end-to-end di aplikasi

- Login `admin`/`operations` -> menu Fleet -> form unit -> seksi "Foto Unit": upload cover + beberapa foto galeri; ganti cover; hapus foto.
- Cek thumbnail muncul di daftar fleet.
- Cek tabel `media_files`: baris `pending -> active`; `object_key` sesuai pola.
- Uji role: `operator` boleh upload; `finance` tidak boleh upload/delete.
- Diketahui: **ganti cover oleh operator** menimbulkan orphan object (lihat Risiko 2) - jadikan bagian pengujian saat perbaikannya dikerjakan.
- Uji mobile (360/390/430 px): kamera/galeri, preview, progress, retry, remove.

## Step 11 - Rollback

Hapus/kosongkan `MEDIA_API_URL` lalu redeploy -> fitur foto fleet nonaktif otomatis (UI tersembunyi), semua fitur non-media tetap normal. Tidak ada migrasi data yang perlu dibalik untuk fase ini.

## Checklist go-live (seksi 44 media-architecture)

```text
[ ] R2 bucket private (public = OFF)                x3 env
[ ] CORS bucket = origin aplikasi (tanpa * di prod) + origin preview bila dipakai
[ ] Konvensi deploy dipilih (blok env.* + --env, ATAU tanpa --env) - konsisten
[ ] wrangler whoami: akun & R2_ACCOUNT_ID cocok; BUCKET_NAME cocok scope token
[ ] Worker Secrets: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
[ ] vars Worker lengkap (tidak ada vars hilang karena non-inheritable)
[ ] Migrasi sampai 0023 (media_files + RLS) teraplikasi
[ ] /health OK
[ ] Uji RUNTIME: wrangler dev + PUT nyata + /media/complete sukses
[ ] Smoke test upload/complete/GET/DELETE lulus
[ ] MEDIA_API_URL terisi di .env.local + Vercel (Supabase vars lengkap) + redeploy
[ ] Uji fleet upload/ganti/hapus + thumbnail
[ ] Uji role (operator upload, finance tidak)
[ ] Uji mobile
[ ] Auditor: tidak ada kredensial R2 di env Next.js / repo
```

## Risiko & tindak lanjut (bukan bagian deploy ini)

1. **Reconciler orphan** - baris `media_files` status `pending`/`failed` yang menua perlu cron pembersih (index `idx_media_files_status` sudah siap). Object hasil PUT yang gagal `complete` juga tertinggal di R2 (baris `failed` tidak menghapus object, actions.ts:690/748).
2. **Defect orphan saat ganti cover oleh operator** (temuan risiko) - `completeFleetPhotoUpload` mengizinkan operator (actions.ts:607) tetapi pembersihan object lama memanggil Worker DELETE yang hanya mengizinkan admin/operations (supabase.ts `ROLES.delete`) -> 403 ditelan best-effort (actions.ts:738) -> object lama tertinggal di R2 dengan metadata `deleted`. Perbaikan: batasi ganti cover ke admin/operations, atau sediakan jalur pembersihan lain.
3. **Fase BAST (Phase 5)** - foto BAST existing tetap di Supabase Storage `bast-photos` (migration `0012`); migrasi ke Media API = PR terpisah + uji regresi.
4. **Bug 405** `GET /api/bast-photos` (thumbnail BAST lama) - PR terpisah.
5. **Ownership entity** - Worker hanya cek entity ada (supabase.ts:123-131); semua role internal bisa membaca semua baris media via Data API (RLS read semua role). Risiko rendah (UUID acak) tapi catat; bila perlu, tambahkan cek kepemilikan di Worker.
6. **Rate limiting / kuota** - belum ada; tambahkan Cloudflare Rate Limiting pada `/media/upload-url` + batasi jumlah media `active` per entity di Server Action.
7. **Monitoring** - metrik 5xx Worker + pemakaian R2 (Class A/B) belum dipantau.
8. **Presign Content-Length** - verifikasi di dev apakah `content-length` masuk `X-Amz-SignedHeaders` pada versi SDK terpasang; dokumentasikan "byte PUT harus == size".
9. **Drift dokumen** - `media-worker/README.md` menulis deploy produksi tanpa `--env`; selaraskan dengan konvensi yang dipilih di Step 4.

## Perintah ringkas (cheat sheet - asumsi Opsi A)

```sh
# 0) commit perubahan pending
git add package.json package-lock.json && git commit -m "chore: tambah wrangler devDependency"

# 1) Worker (setelah blok env.production + vars lengkap ada di wrangler.jsonc)
cd media-worker
npm ci
npx wrangler login
npx wrangler whoami
npx wrangler deploy --dry-run
npx wrangler secret put R2_ACCOUNT_ID --env production
npx wrangler secret put R2_ACCESS_KEY_ID --env production
npx wrangler secret put R2_SECRET_ACCESS_KEY --env production
npx wrangler deploy --env production

# 2) uji runtime + verifikasi
npx wrangler dev          # smoke test PUT nyata + /media/complete
curl https://<worker-url>/health

# 3) Next.js: isi MEDIA_API_URL di .env.local & Vercel (Supabase vars lengkap), redeploy
```
