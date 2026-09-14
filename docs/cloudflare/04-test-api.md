# Langkah 4: Testing API Worker

> **USANG (Sep 2026) - CONTOH DI DOKUMEN INI AKAN GAGAL BILA DIJALANKAN.** Rujukan tunggal: [05-rencana-deploy-produksi.md](05-rencana-deploy-produksi.md) (Step 8).
> - Body `/media/upload-url` = camelCase 7 field wajib: `mediaId, entityType, entityId, category, mimeType, size, objectKey`; respons {uploadUrl, objectKey, mediaId, expiresAt}; `GET /media/:id` -> {url, expiresAt}.
> - Baris `media_files` status `pending` HARUS dibuat lebih dulu; oversize = **400** `FILE_TOO_LARGE` (bukan 413); status DB `pending -> active` (bukan `completed`).
> - Klaim "fleet milik orang lain -> 403" SALAH sebagai ekspektasi uji (Worker tidak cek kepemilikan). Ganti `supabase.auth.session()` -> `auth.getSession()`; host contoh -> URL Worker nyata.

## 1. Health Check

```bash
curl https://media.rentalin.com/health

# Expected:
# {"status":"ok","timestamp":1234567890}
```

## 2. Test Upload URL Generation

### Dapatkan JWT Token (dari Supabase)
```javascript
// Di browser console
const { data: { user } } = await supabase.auth.getUser();
const jwt = user?.access_token;
```

### Request Upload URL
```bash
curl -X POST https://media.rentalin.com/media/upload-url \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "entity_type": "fleet",
    "entity_id": "00000000-0000-0000-0000-000000000000",
    "category": "cover"
  }'

# Expected response:
# {
#   "url": "https://rentalin-local-media.r2.cloudflarestorage.com/...",
#   "key": "fleet/00000000-0000-0000-0000-000000000000/cover/1234567890",
#   "expires_at": "2026-09-13T12:30:00.000Z"
# }
```

### Upload File ke R2
```bash
curl -X PUT \
  "$(cat response.json | jq -r '.url')" \
  -H "Content-Type: image/jpeg" \
  --data-binary "@path/to/photo.jpg"

# Expected status: 200 OK
```

## 3. Test Media Retrieval

```bash
curl -X GET https://media.rentalin.com/media/<media_id> \
  -H "Authorization: Bearer <JWT_TOKEN>"

# Expected response:
# {
#   "url": "https://rentalin-local-media.r2.cloudflarestorage.com/...",
#   "key": "...",
#   "entity_type": "fleet",
#   "entity_id": "...",
#   "category": "cover",
#   "status": "completed",
#   "created_at": "2026-09-13T12:00:00Z"
# }
```

## 4. Test File Upload di Frontend

### Buka Dev Tools Console di Browser
```javascript
// Test manual upload
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const res = await fetch('http://localhost:8787/media/upload-url', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${supabase.auth.session()?.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    entity_type: 'fleet',
    entity_id: 'fleet-uuid-here',
    category: 'cover'
  })
});

const { url, key } = await res.json();

// PUT langsung ke R2
await fetch(url, {
  method: 'PUT',
  body: formData.get('file')
});

console.log('Upload complete:', key);
```

## 5. Test Error Handling

### Unauthorized Request
```bash
curl https://media.rentalin.com/media/upload-url

# Expected: 401 Unauthorized
```

### Insufficient Permissions
```bash
# Login sebagai operator, lalu request untuk fleet milik orang lain
# Expected: 403 Forbidden
```

### File Terlalu Besar
```bash
# Upload file > 2MB
# Expected: 413 Payload Too Large
```

## 6. Verify Data Consistency

1. **Cek database**: Di Supabase Dashboard, lihat tabel `media_files`
   - Status harus `completed` setelah upload selesai
   - Entity type/id/category harus benar

2. **Cek R2**: Di Cloudflare Dashboard → R2 → Objects
   - Object harus tersedia
   - Dapat diakses via signed URL

3. **Cek frontend**: Refresh halaman fleet detail
   - Thumbnail harus muncul
   - Gallery photos harus tampil

## 7. Smoke Test Summary

| Test | Result |
|---|---|
| `/health` returns 200 | ✅ |
| Upload URL generation | ✅ |
| File upload ke R2 | ✅ |
| Get media signed URL | ✅ |
| Database sync | ✅ |
| CORS headers | ✅ |
| Auth JWT verification | ✅ |