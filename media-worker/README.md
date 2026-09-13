# Rentalin Media API — Cloudflare Worker

Media API untuk Rentalin (lihat [`docs/media-architecture.md`](../docs/media-architecture.md)).
Worker menjadi gateway: **authorization → validasi → presigned URL R2 → protected read**.
Kredensial R2 hanya hidup di sini (Worker Secrets) — tidak di repo, tidak di browser,
tidak di environment Next.js.

## Endpoint

| Method | Path | Fungsi |
|---|---|---|
| POST | `/media/upload-url` | Presigned PUT (validasi user/role/entity/category/MIME/ukuran/object key) |
| POST | `/media/complete` | Verifikasi object: exists, size, content-type, **magic bytes** |
| GET | `/media/:id` | Signed GET ber-TTL pendek (private read) |
| DELETE | `/media/:id` | Hapus object R2 (idempoten) |
| GET | `/health` | Liveness |

Otorisasi (baseline doc §22): read = seluruh role internal; upload = admin/operations/operator;
delete = admin/operations. Role dibaca dari tabel `profiles` via Supabase Data API
(RLS-terlindungi); token divalidasi via GoTrue. Worker tidak pernah menulis ke PostgreSQL —
penulisan metadata `media_files` dilakukan Server Action Next.js.

## Deployment

```sh
cd media-worker
npm ci

# 1. Var non-rahasia — sesuaikan per environment (lihat wrangler.jsonc):
#    SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, BUCKET_NAME, ENVIRONMENT,
#    ALLOWED_ORIGINS (origin produksi, dipisah koma; localhost hanya saat dev)
npx wrangler secret put R2_ACCOUNT_ID
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY

npx wrangler deploy            # production
npx wrangler deploy --env staging   # bila memakai environments di wrangler.jsonc
```

Verifikasi: `curl https://<worker>/health` → `{"ok":true,"env":"production"}`.
Isi `MEDIA_API_URL` pada environment Vercel dengan URL Worker yang terdeploy.

## Bucket R2 (per environment — doc §43)

| Environment | Bucket |
|---|---|
| development | `rentalin-dev-media` |
| staging | `rentalin-staging-media` |
| production | `rentalin-production-media` |

Syarat bucket:

1. **Private** (public access = mati).
2. **CORS** untuk origin aplikasi — dibutuhkan presigned PUT langsung dari browser:
   - Allowed Origins: `https://<domain-rentalin>` (tambahkan origin dev hanya bila perlu)
   - Methods: `PUT`, `GET`, `HEAD`
   - Headers: `Content-Type`
   - Max Age: `600`
3. Layout object (doc §37): `fleet/{fleetId}/cover/{mediaId}.webp`,
   `fleet/{fleetId}/gallery/{mediaId}.webp`, `bast/{handoverId}/{kategori}/{mediaId}.webp`.

Tidak perlu lifecycle rules khusus untuk MVP — baris `pending`/`failed` di
`media_files` (index `idx_media_files_status`) adalah input reconciler/cleanup
orphan yang akan menyusul (doc §18).

## Pengembangan lokal

```sh
npx wrangler dev        # localhost:8787 (butuh var & secrets terisi;
                        # supabase.ts butuh SUPABASE_URL yang reachable)
```

Typecheck: `npm run typecheck`.
