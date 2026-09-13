# Langkah 3: Set Environment Variables & Secrets

## Secrets yang Diperlukan

| Secret Name | Value | Cara Dapatkan |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key Supabase | Supabase Dashboard → Settings → API → Service Role |
| `R2_ACCESS_KEY_ID` | R2 S3 Access Key | Cloudflare Dashboard → R2 → Settings → API Keys |
| `R2_SECRET_ACCESS_KEY` | R2 S3 Secret Key | Cloudflare Dashboard → R2 → Settings → API Keys |

## Cara Set Secrets

### Via Wrangler CLI (Recommended)
```bash
cd media-worker

# Set setiap secret
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
# Masukkan nilai, lalu Enter

wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
```

### Via Cloudflare Dashboard
1. Workers → Variables → Secrets
2. Klik **Add New**
3. Name: `SUPABASE_SERVICE_ROLE_KEY`
4. Value: `[paste service role key]`
5. Ulangi untuk seninanya

## Environment Variables (Vars)

| Variable | Development | Staging | Production |
|---|---|---|---|
| `SUPABASE_URL` | `https://xxx.supabase.co` | `https://xxx.supabase.co` | `https://xxx.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | anon/public key | anon/public key | anon/public key |
| `BUCKET_NAME` | `rentalin-local-media` | `rentalin-staging-media` | `rentalin-production-media` |
| `ENVIRONMENT` | `development` | `staging` | `production` |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | `https://staging.rentalin.com` | `https://app.rentalin.com` |
| `UPLOAD_TTL_SECONDS` | `900` (15 menit) | `900` | `900` |
| `READ_TTL_SECONDS` | `300` (5 menit) | `300` | `300` |
| `MAX_UPLOAD_BYTES` | `2097152` (2MB) | `2097152` | `2097152` |

## Verifikasi Environment

```bash
# Lihat environment yang aktif
wrangler variables

# Lihat secrets (tidak bisa - aman)
wrangler variables --binding-name MEDIA_BUCKET
```

## Frontend Environment (NEXT_PUBLIC)

Di file `.env.local` project utama:

```bash
NEXT_PUBLIC_MEDIA_API_URL=https://media.rentalin.com
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```