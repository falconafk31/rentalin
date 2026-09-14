# Langkah 2: Setup Cloudflare Worker

> **USANG (Sep 2026) - JANGAN DIKUTI APA ADANYA.** Rujukan tunggal: [05-rencana-deploy-produksi.md](05-rencana-deploy-produksi.md).
> - Konfigurasi = **`wrangler.jsonc`** (bukan `wrangler.toml`); struktur file aktual: `src/{index,supabase,r2,validate,errors}.ts` (tidak ada `src/routes/`).
> - Secrets HANYA: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` - **`SUPABASE_SERVICE_ROLE_KEY` tidak dipakai** (Worker memakai var non-rahasia `SUPABASE_PUBLISHABLE_KEY` + token user).
> - Endpoint `/health` mengembalikan {"ok":true,"env":"..."}; nama Worker `rentalin-media` (URL: `rentalin-media.<subdomain>.workers.dev`).
> - Bila memakai `--env`, WAJIB ada blok `env.<nama>{ vars{...} }` lengkap - `vars` Wrangler tidak diwarisi (lihat Step 4 doc 05).

## 1. Install Wrangler

```bash
npm install -g wrangler
# atau sebagai dev dependency
npm install --save-dev wrangler
```

## 2. Login ke Cloudflare

```bash
wrangler login
# Browser akan buka untuk autentikasi
```

## 3. Initialize Worker (Jika belum ada)

```bash
cd media-worker
wrangler deploy --dry-run
```

## 4. Configure wrangler.toml

File konfigurasi utama: `media-worker/wrangler.jsonc`

```json
{
  "name": "rentalin-media",
  "main": "src/index.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "vars": {
    "SUPABASE_URL": "https://your-project.supabase.co",
    "SUPABASE_PUBLISHABLE_KEY": "your-publishable-key",
    "BUCKET_NAME": "rentalin-dev-media",
    "ENVIRONMENT": "development",
    "ALLOWED_ORIGINS": "http://localhost:3000,https://app.rentalin.id",
    "UPLOAD_TTL_SECONDS": "900",
    "READ_TTL_SECONDS": "300",
    "MAX_UPLOAD_BYTES": "2097152"
  }
}
```

## 5. Set Secrets (PENTING!)

Secrets tidak boleh di file - set via CLI atau Dashboard:

```bash
# Via CLI
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY

# Via Dashboard
Workers → Variables → Secrets → Add New
```

## 6. Deploy Worker

```bash
# Development (wrangler dev)
wrangler dev

# Production
wrangler deploy
```

## 7. Verify Deployment

```bash
# Health check
curl https://media-rentalin.workers.dev/health

# Expected response:
# {"status":"ok","timestamp":1234567890}
```

## 8. Setup Custom Domain (Opsional)

Jika ingin gunakan domain sendiri:

1. Workers → Routes → Add Route
2. Route Pattern: `https://media.rentalin.com/*`
3. Worker: `rentalin-media`

---

## File Structure Worker

```
media-worker/
├── src/
│   ├── index.ts          # Entry point & routing
│   ├── routes/
│   │   ├── upload-url.ts   # GET/POST /media/upload-url
│   │   ├── complete.ts     # POST /media/complete
│   │   ├── get-media.ts    # GET /media/:id
│   │   └── delete-media.ts # DELETE /media/:id
│   ├── lib/
│   │   ├── auth.ts       # JWT verification
│   │   ├── r2.ts         # R2 operations
│   │   └── validate.ts   # File validation
│   └── types.ts          # TypeScript definitions
├── wrangler.jsonc        # Configuration
├── package.json
└── README.md
```