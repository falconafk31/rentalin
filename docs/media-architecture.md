# Rentalin Media Architecture

**Status:** Architecture Proposal  
**Scope:** Fleet Images, BAST Photos, Thumbnails, Future Attachments  
**Storage:** Cloudflare R2  
**API Layer:** Cloudflare Workers  
**Application:** Next.js 16 + TypeScript  
**Database:** Supabase PostgreSQL  
**Authentication:** Supabase Auth  
**Primary Repository:** `falconafk31/rentalin`

> **Catatan Revisi (audit repo, September 2026):**
> Draft sebelumnya mengasumsikan sudah ada foto BAST di production (`handovers.photoUrls`) sehingga migrasi ini dianggap "backward-compatible migration". Setelah audit terhadap `schema.sql` dan README repo, asumsi ini **tidak akurat**: tabel `handovers` saat ini hanya menyimpan status boolean (`engine`, `hydraulics`, `tracks`) dan `notes` — tidak ada kolom atau storage foto sama sekali, baik untuk BAST maupun Fleet. Attachment/object storage secara eksplisit masih tercatat sebagai item "next iteration" yang belum dikerjakan.
>
> Implikasinya: dokumen ini bukan rencana migrasi dari sistem lama, melainkan **rencana implementasi fitur foto yang sama sekali baru**. Bagian-bagian yang tadinya membahas "jangan hapus field lama", "migrasi bertahap dari Supabase Storage", atau "hindari merusak fitur foto yang sudah jalan" sudah disesuaikan di bawah supaya tidak menyesatkan siapa pun (termasuk AI coding agent) yang mengerjakan implementasinya nanti.
>
> ⚠️ **Perbaikan penting — lihat §52 (audit 12 September 2026):** audit yang mendasari catatan revisi ini ternyata **salah** (hanya memeriksa `schema.sql` — snapshot legacy yang secara eksplisit dilarang dipakai sebagai sumber kebenaran — dan README yang saat itu belum diperbarui). Foto BAST **memang sudah ada** di codebase (migration `0012_bast_photos.sql`, endpoint `/api/bast-photos`, komponen `PhotoUploader`, penyematan di PDF BAST). Seluruh keputusan implementasi final dicatat di **§52**; bagian §52 adalah acuan tertinggi bila bertentangan dengan bagian lain dokumen ini.

## 1. Tujuan

Dokumen ini mendefinisikan arsitektur media Rentalin untuk fitur foto yang belum ada sebelumnya, dengan Cloudflare R2 sebagai object storage sejak awal — bukan Supabase Storage — agar biaya dan kuota Supabase project tidak terbebani oleh binary file.

Media meliputi:
- foto unit alat berat / fleet;
- foto dokumentasi BAST;
- thumbnail dan preview;
- attachment dokumen pada fase berikutnya.

Prinsip utama:

> **Supabase PostgreSQL menyimpan metadata dan relasi bisnis. Cloudflare R2 menyimpan file fisik. Cloudflare Worker menjadi Media API / gateway.**

Target:
1. upload tidak membebani storage Supabase;
2. gambar dikompresi di browser sebelum upload;
3. WebP menjadi format utama;
4. BAST tetap private;
5. thumbnail fleet cepat;
6. credential R2 tidak pernah dikirim ke browser;
7. authorization mengikuti user dan role Rentalin;
8. media menjadi infrastructure layer terpisah.

## 2. Kondisi Repository Saat Ini

Repository Rentalin menggunakan Next.js 16 App Router, TypeScript, Supabase Auth, Supabase PostgreSQL, dan Drizzle ORM (`nextjs-postgresql-template`, `drizzle-orm@0.45.2`).

**Belum ada fitur foto sama sekali** untuk BAST maupun Fleet. Tabel `handovers` (lihat `schema.sql` / `src/db/schema.ts`) hanya memiliki kolom boolean `engine`, `hydraulics`, `tracks`, plus `notes` — tidak ada kolom `photoUrls` atau referensi file apa pun. README repo juga secara eksplisit mencatat: BAST saat ini "captures inspection booleans and notes, not photos", dan "attachments/object storage" masih berstatus item roadmap yang belum diimplementasikan.

Dependency di `package.json` juga belum menyertakan AWS S3 SDK/`aws4fetch` (untuk presigned URL R2) maupun library image processing — keduanya perlu ditambahkan sebagai bagian dari implementasi ini, bukan diasumsikan sudah ada.

Karena tidak ada data foto lama, **tidak perlu strategi backward-compatibility atau dual-write ke sistem lama.** Yang perlu dijaga adalah fitur BAST yang sudah ada saat ini (checklist boolean engine/hydraulics/tracks, generate PDF) agar tidak rusak saat kolom/relasi foto ditambahkan di atasnya.

> **§52 koreksi:** paragraf di atas — selain bagian "Fleet" — tidak akurat; fakta lengkap dan konsekuensinya ada di §52.

## 3. Arsitektur Target

```text
                         RENTALIN
                            |
                     Next.js Application
                            |
                     Supabase Auth
                            |
                     Media Authorization
                            |
                            v
                 +-----------------------+
                 |   Cloudflare Worker   |
                 |       Media API       |
                 +-----------+-----------+
                             |
                 +-----------+-----------+
                 |                       |
          Presigned Upload         Protected Read
                 |                       |
                 +-----------+-----------+
                             |
                             v
                    +------------------+
                    |  Cloudflare R2   |
                    |  Private Bucket  |
                    +------------------+
                             |
             +---------------+---------------+
             |               |               |
             v               v               v
           Fleet            BAST          Documents
         Images            Photos          Future
```

Database:

```text
                    Supabase PostgreSQL
                            |
                     media_files
                            |
             +--------------+--------------+
             |              |              |
           Fleet           BAST          Other
```

## 4. Responsibility Boundary

### Next.js

Bertanggung jawab atas:
- authentication/session;
- application authorization;
- business rules;
- menentukan entity yang boleh memiliki media;
- meminta upload authorization;
- menyimpan metadata;
- UI upload;
- client-side image compression.

Next.js tidak menyimpan credential R2 di client.

### Cloudflare Worker

Bertindak sebagai **Rentalin Media API**:
- authorization;
- validation;
- presigned URL;
- R2 access;
- object key;
- protected read;
- delete/replace;
- mencegah credential R2 masuk browser.

Worker bukan database dan bukan sumber kebenaran relasi bisnis.

### Cloudflare R2

R2 menjadi object storage private untuk binary file.

## 5. Client-Side Image Compression

Foto dikompresi sebelum upload:

```text
Camera / File Picker
        |
        v
Browser
        |
        v
Resize
        |
        v
Convert to WebP
        |
        v
Quality compression
        |
        v
Media API
        |
        v
R2
```

Contoh target:

```text
Original:
JPEG
4000 × 3000
5–8 MB

        ↓

Client compression

1600 × 1200
WebP
quality ~80

        ↓

Target:
~200–800 KB
```

Angka tersebut adalah target/estimasi, bukan jaminan.

Client-side validation bukan security boundary. Worker tetap melakukan validasi.

## 6. Server-Side Validation

Worker harus memvalidasi:
- file size;
- MIME type;
- magic bytes;
- allowed format;
- object key;
- authorization;
- entity relationship;
- upload intent.

Format yang diperbolehkan:

```text
image/jpeg
image/png
image/webp
```

Format final yang disarankan:

```text
image/webp
```

Jangan percaya extension, filename atau Content-Type saja.

## 7. Security

Credential berikut tidak boleh berada di browser:

```text
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_ACCOUNT_ID
```

Jangan menggunakan:

```text
NEXT_PUBLIC_R2_SECRET
```

R2 bucket harus private.

BAST evidence tidak boleh public secara default.

## 8. Media Metadata

Disarankan membuat tabel:

```text
media_files
------------------------------
id
entity_type
entity_id
category
object_key
mime_type
size_bytes
width
height
original_name
status
created_by
created_at
updated_at
```

Contoh:

```text
entity_type = fleet
entity_id   = fleet UUID
category    = cover
object_key  = fleet/{fleetId}/cover/{mediaId}.webp
mime_type   = image/webp
```

Supabase menyimpan metadata; R2 menyimpan binary.

## 9. Entity Type

Untuk MVP:

```text
fleet
bast
```

Future:

```text
document
client
contract
```

Jangan membuat abstraksi berlebihan sebelum dibutuhkan.

## 10. Media Category

Fleet:

```text
cover
gallery
```

BAST:

```text
engine
hydraulics
tracks
general
```

Category harus divalidasi server-side.

## 11. Fleet Image Architecture

Cover:

```text
fleet/{fleetId}/cover/{mediaId}.webp
```

Gallery:

```text
fleet/{fleetId}/gallery/{mediaId}.webp
```

Fleet list harus menggunakan optimized image/thumbnail, bukan original multi-MB.

## 12. BAST Photo Architecture

Contoh:

```text
bast/{handoverId}/engine/{mediaId}.webp
bast/{handoverId}/hydraulics/{mediaId}.webp
bast/{handoverId}/tracks/{mediaId}.webp
bast/{handoverId}/general/{mediaId}.webp
```

Foto BAST adalah evidence kondisi unit dan harus private.

## 13. Thumbnail Strategy

MVP tidak perlu menyimpan banyak variant secara otomatis.

Target awal:
- Fleet: optimized WebP, max dimension sekitar 1600px;
- BAST: optimized WebP dengan resolusi cukup untuk evidence;
- thumbnail dapat dihasilkan melalui image delivery/resize jika tersedia.

Jangan membuat banyak variant sebelum kebutuhan terbukti.

## 14. Upload Flow

```text
1. User memilih file
        |
        v
2. Client resize/compress
        |
        v
3. Client menghasilkan WebP
        |
        v
4. Next.js meminta upload authorization
        |
        v
5. Worker memvalidasi user/entity/category
        |
        v
6. Worker membuat presigned PUT
        |
        v
7. Browser upload langsung ke R2
        |
        v
8. Browser melakukan completion
        |
        v
9. Metadata disimpan ke Supabase
        |
        v
10. UI memperbarui media list
```

## 15. Hindari Proxy Upload Melalui Next.js

Hindari:

```text
Browser → Next.js → Worker → R2
```

Untuk image biasa lebih baik:

```text
Browser → Worker → presigned URL → Browser → R2
```

Dengan demikian file tidak perlu melewati server Vercel.

## 16. Presigned Upload

Endpoint awal:

```text
POST /media/upload-url
```

Request konseptual:

```json
{
  "entityType": "fleet",
  "entityId": "uuid",
  "category": "cover",
  "mimeType": "image/webp",
  "size": 384221
}
```

Response:

```json
{
  "uploadUrl": "...",
  "objectKey": "fleet/uuid/cover/random.webp",
  "mediaId": "uuid"
}
```

Browser melakukan PUT langsung ke R2.

## 17. Completion

Endpoint:

```text
POST /media/complete
```

Worker memastikan:
1. object exists;
2. object key sesuai;
3. size sesuai;
4. media masih authorized;
5. metadata dapat diregistrasikan;
6. audit event bila diperlukan.

## 18. Orphan Handling

Kemungkinan:

```text
R2 upload berhasil
        ↓
Supabase metadata gagal
```

Gunakan status:

```text
pending
active
failed
deleted
```

Flow normal:

```text
pending → upload → complete → active
```

Object pending/failed dapat dibersihkan melalui reconciliation/cleanup.

## 19. Delete Flow

```text
User Delete
    |
    v
Authorization
    |
    v
Delete R2 Object
    |
    v
Delete / mark metadata
    |
    v
Audit
```

Jangan menghapus metadata saja dan meninggalkan object tanpa strategy cleanup.

## 20. Replace Fleet Cover

Jangan hapus foto lama terlebih dahulu.

```text
Upload new cover
    ↓
Validate
    ↓
Metadata update
    ↓
New cover active
    ↓
Old cover cleanup
```

## 21. Private Read

Gunakan:

```text
GET /media/{mediaId}
```

Worker:

```text
authenticate
    ↓
load metadata
    ↓
authorize
    ↓
signed GET / stream
    ↓
R2
```

Browser tidak membutuhkan credential R2.

## 22. Authorization

Authorization harus mempertimbangkan:
- user;
- role;
- entity;
- hubungan user dengan entity;
- category;
- operation (read/upload/delete).

Contoh baseline:

```text
admin      read/upload/delete
operations read/upload/delete
operator   read/restricted upload/no delete
finance    restricted read/no upload/no delete
```

Policy final harus mengikuti authorization model Rentalin yang sudah ada.

## 23. Audit

Operation penting:

```text
MEDIA_UPLOAD
MEDIA_DELETE
MEDIA_REPLACE
MEDIA_ACCESS
```

Minimal:

```text
actor
action
entity
entityId
mediaId
timestamp
```

Jangan menyimpan binary di audit.

## 24. Existing `handovers.photoUrls`

Current implementation memiliki:

```text
handovers.photoUrls
```

Jangan langsung menghapusnya.

Tahapan:
1. buat `media_files`;
2. implement Media API;
3. migrasikan PhotoUploader;
4. verifikasi BAST existing;
5. migrasikan data lama bila diperlukan;
6. baru evaluasi penghapusan field legacy.

> **§52 koreksi:** bagian ini ternyata yang benar; catatan revisi di atas (§ prolog) yang keliru. Lihat §52.

## 25. Migration Strategy

### Phase 1 — Infrastructure

- R2 bucket;
- Worker;
- secrets.

### Phase 2 — Database

Tambahkan `media_files`.

Index minimal:

```text
entity_type + entity_id
```

### Phase 3 — Media API

Implement:

```text
upload-url
complete
read
delete
```

### Phase 4 — Fleet

Implement:
- cover;
- thumbnail;
- gallery.

### Phase 5 — BAST

Migrasikan PhotoUploader dari Supabase Storage ke Media API.

**BAST performance optimization yang sudah PASS tidak boleh mengalami regression.**

### Phase 6 — Legacy Cleanup

Hentikan Supabase Storage hanya setelah migrasi dan verifikasi selesai.

## 26. Environment Variables

Next.js server-only:

```env
R2_ACCOUNT_ID=
R2_BUCKET_NAME=
R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
```

Jangan menggunakan `NEXT_PUBLIC_` untuk secret.

Worker secrets sebaiknya dikelola melalui Cloudflare Worker Secrets.

Jika native R2 binding digunakan, prefer binding internal Worker → R2 untuk operasi internal.

> **§52 koreksi:** desain final justru membuat Next.js TIDAK butuh variabel R2 sama sekali (hanya `MEDIA_API_URL`) — semua credential R2 adalah Worker Secrets. Lebih aman daripada listing di atas.

## 27. CORS

Production origin harus dibatasi ke domain Rentalin.

Development origin hanya ditambahkan jika diperlukan.

Jangan menggunakan wildcard `*` permanen untuk production upload.

## 28. Object Key

Jangan menggunakan filename sebagai object key.

Gunakan random media ID:

```text
fleet/{fleetId}/cover/{mediaId}.webp
```

Original filename hanya metadata.

## 29. File Size

Recommended initial client input limit:

```text
10 MB
```

Recommended optimized upload target:

```text
<= 2 MB
```

Worker tetap memiliki hard limit.

## 30. Image Quality

Default awal:

```text
WebP
quality ≈ 80
max dimension ≈ 1600px
```

Untuk BAST, evidence quality lebih penting daripada sekadar ukuran file.

## 31. Image Processing

Jangan menjadikan Workers Free sebagai CPU-heavy image processor.

Browser:

```text
resize
WebP conversion
compression
```

Worker:

```text
auth
authorization
validation
presigned URL
R2 access
```

Server-side processing hanya ditambahkan jika kebutuhan nyata muncul.

## 32. UI Upload

Fleet:

```text
Foto Utama Unit
[ Thumbnail ]

[ Ganti Foto ]
```

BAST:

```text
Dokumentasi Kondisi Unit

Engine
[ + Tambah Foto ]

Hydraulics
[ + Tambah Foto ]

Tracks
[ + Tambah Foto ]

Dokumentasi Umum
[ + Tambah Foto ]
```

Upload harus memberikan:
- preview;
- progress;
- success/error;
- retry/remove.

## 33. Mobile UX

Target:

```text
360px
390px
430px
```

Prioritas:
- camera capture;
- gallery selection;
- preview;
- compression progress;
- retry;
- remove.

## 34. Error Handling

Error codes:

```text
FILE_TOO_LARGE
INVALID_FILE_TYPE
INVALID_IMAGE_SIGNATURE
UNAUTHORIZED
FORBIDDEN
UPLOAD_FAILED
STORAGE_UNAVAILABLE
METADATA_SAVE_FAILED
```

User-facing message harus Bahasa Indonesia.

Detail teknis masuk log server.

## 35. Retry

Network failure dapat di-retry maksimal 2–3 kali.

Jangan retry tanpa batas.

## 36. Cache

Fleet images relatif stabil dan cocok untuk cache lebih panjang.

BAST evidence lebih konservatif.

Private media tetap menggunakan authorization dan short-lived signed access.

## 37. R2 Layout

```text
rentalin/
│
├── fleet/
│   └── {fleetId}/
│       ├── cover/
│       │   └── {mediaId}.webp
│       └── gallery/
│           └── {mediaId}.webp
│
├── bast/
│   └── {handoverId}/
│       ├── engine/
│       │   └── {mediaId}.webp
│       ├── hydraulics/
│       │   └── {mediaId}.webp
│       ├── tracks/
│       │   └── {mediaId}.webp
│       └── general/
│           └── {mediaId}.webp
│
└── documents/
    └── {entityId}/
        └── {mediaId}.pdf
```

## 38. API Awal

```text
POST /media/upload-url
POST /media/complete
GET  /media/:id
DELETE /media/:id
```

Future:

```text
POST /media/:id/replace
GET  /media/:id/download
GET  /media/:id/thumbnail
```

Jangan implement endpoint yang belum diperlukan.

## 39. Testing

### Unit
- image validation;
- MIME validation;
- magic bytes;
- size limits;
- object key;
- category;
- authorization.

### Integration
- upload URL;
- R2 upload;
- completion;
- metadata;
- read;
- delete.

### BAST regression

```text
create BAST
upload photo
save BAST
refresh
open BAST
view photo
delete photo
upload replacement
```

### Fleet regression

```text
create fleet
upload cover
replace cover
open fleet list
open fleet detail
thumbnail loading
```

## 40. Failure Scenarios

Test:

```text
invalid file
oversized file
fake WebP
network failure
R2 failure
database failure
expired upload URL
expired read URL
unauthorized user
forbidden role
deleted entity
duplicate completion
```

## 41. Rollback

Jika Media API gagal:

```text
New media upload
        ↓
temporarily disabled
        ↓
existing media remains available
```

Tidak ada legacy storage yang perlu dipertahankan sebagai fallback (lihat Section 2) — rollback cukup dengan menonaktifkan endpoint upload baru; fitur BAST/Fleet non-foto yang sudah ada tetap jalan seperti biasa karena tidak bergantung pada media layer ini.

> **§52 koreksi:** rollback final = hapus/kosongkan `MEDIA_API_URL`; seluruh UI foto fleet bersembunyi otomatis, semua fitur non-fleet (termasuk foto BAST di Supabase Storage) tidak terpengaruh.

## 42. Deployment Sequence

```text
1. Create R2 bucket
2. Configure Worker
3. Configure secrets
4. Deploy Worker
5. Add media_files migration
6. Deploy Next.js media client
7. Test Fleet
8. Test BAST
9. Test mobile
10. Verify production logs
```

Tidak ada langkah "migrate existing media" atau "remove legacy Storage dependency" karena belum ada foto lama yang tersimpan di mana pun (lihat Section 2).

> **§52 koreksi:** langkah 8 (Test BAST) = uji regresi BAST existing (pastikan tidak rusak oleh perubahan di sekitarnya), BUKAN migrasi BAST.

## 43. Environment Separation

Gunakan resource terpisah:

```text
rentalin-dev-media
rentalin-staging-media
rentalin-production-media
```

Local development tidak boleh menulis production media secara tidak sengaja.

## 44. Security Checklist

```text
[ ] R2 bucket private
[ ] R2 credentials server-only
[ ] Worker secrets configured
[ ] CORS restricted
[ ] MIME validation
[ ] Magic-byte validation
[ ] File size validation
[ ] Object key randomized
[ ] Authorization enforced
[ ] Delete authorization enforced
[ ] BAST media private
[ ] Presigned URL expiry limited
[ ] No NEXT_PUBLIC R2 secrets
[ ] No credentials in Git
[ ] Audit events implemented where required
[ ] Orphan cleanup strategy defined
```

## 45. Compatibility With Existing BAST Optimization

Penambahan fitur foto tidak boleh merusak fitur BAST yang sudah berjalan hari ini:
- checkbox responsiveness (engine/hydraulics/tracks);
- memoized BAST checklist;
- generate PDF BAST;
- tidak ada React warnings;
- tidak ada hydration errors;
- tidak ada console errors.

Photo uploader adalah komponen baru — pastikan renderingnya tidak memblokir/reflow komponen checklist yang sudah ada, dan jangan menjadikan penambahan ini alasan untuk menulis ulang BAST modal menjadi monolithic.

## 46. Compatibility With Dashboard

Fleet thumbnails:
- optimized;
- lazy-loaded bila sesuai;
- tidak menggunakan original besar;
- tidak menyebabkan unnecessary rerender;
- tidak memblokir KPI rendering.

Dashboard data dan media loading harus independen.

## 47. Database Integrity

`media_files.entity_id` tidak menggantikan relasi bisnis.

Business source of truth tetap:

```text
fleet.id
handovers.id
contracts.id
```

Media hanya mereferensikan entity.

## 48. Non-Goals

Arsitektur ini tidak bertujuan:
- mengganti Supabase PostgreSQL;
- mengganti Supabase Auth;
- memindahkan business data ke Cloudflare;
- memindahkan seluruh API ke Workers;
- memindahkan Next.js dari Vercel;
- mengubah accounting;
- mengubah invoice/PPN;
- mengubah BAST checklist.

Yang dipisahkan hanya **media layer**.

## 49. Final Architecture

```text
                         USER
                          |
                          v
                    Next.js UI
                          |
          +---------------+---------------+
          |                               |
          v                               v
    Supabase Auth                    Media API
          |                         Cloudflare Worker
          |                               |
          v                               v
    PostgreSQL                         R2 Bucket
          |                               |
          |                       +-------+-------+
          |                       |       |       |
          v                       v       v       v
    Business Data              Fleet    BAST   Documents
                              Images    Photos
```

Photo workflow:

```text
Camera / File
      |
      v
Browser
      |
      | Resize
      | Compress
      | WebP
      v
Media API
Cloudflare Worker
      |
      | Authorization
      | Validation
      | Presigned URL
      v
Browser
      |
      | Direct upload
      v
Cloudflare R2
      |
      v
media_files
Supabase PostgreSQL
```

Read:

```text
Browser
   |
   v
Media Worker
   |
   | authenticate
   | authorize
   | signed GET
   v
R2
   |
   v
Optimized Image
```

## 50. Architectural Principle

> **PostgreSQL knows what the file represents. R2 stores the file. Worker controls access. Browser optimizes the image before upload.**

Separation:

```text
Business Data
Supabase PostgreSQL

Authentication
Supabase Auth

Application
Next.js

Media API
Cloudflare Worker

Object Storage
Cloudflare R2
```

## 51. Implementation Rule

Before implementation:

1. Read current repository code, khususnya `src/db/schema.ts` dan `supabase/migrations/` (bukan `schema.sql`, yang berstatus arsip legacy).
2. Confirm tidak ada Supabase Storage usage untuk BAST/Fleet saat ini (per audit Section 2) — jangan asumsikan ada yang perlu dimigrasikan.
3. Confirm tidak ada kode foto BAST yang sudah ada; ini komponen baru.
4. Identify Fleet image requirements dari komponen fleet yang sudah ada.
5. Identify authorization helpers (`current_app_role()`, role checks di Server Action).
6. Identify audit helpers bila ada.
7. Identify migration numbering terbaru di `supabase/migrations/` agar file baru urut dengan benar.
8. Do not modify executed migrations.
9. Do not change unrelated business logic.
10. Preserve existing BAST performance optimization (checklist memoization, dsb).
11. Run tests before and after implementasi.

**Read-only audit must happen before implementation.**

No production database changes should be performed until the migration plan has been reviewed and approved.

## 52. Audit Repositori & Keputusan Implementasi (12 September 2026)

> **Bagian ini adalah acuan tertinggi** bila bertentangan dengan bagian lain dokumen
> ini. Ditulis setelah audit read-only menyeluruh terhadap kode yang sebenarnya
> (bukan hanya `schema.sql`/README) dan menjadi dasar implementasi di branch ini.

### 52.1 Temuan: Catatan Revisi prolog KELIRU

Catatan Revisi di prolog dokumen ini menyimpulkan "tidak ada kolom atau storage foto
sama sekali" berdasarkan audit terhadap `schema.sql` + README. Kesimpulan itu salah:

| Bukti di repo | Lokasi |
|---|---|
| `handovers.photo_urls TEXT[]` (kolom foto BAST) | `src/db/schema.ts`, `supabase/migrations/0012_bast_photos.sql` |
| Bucket Supabase Storage **privat** `bast-photos` + 3 policy RLS | `0012_bast_photos.sql` |
| `POST /api/bast-photos` — upload ke Storage, validasi magic bytes 5 MB, role check, audit log | `src/app/api/bast-photos/route.ts` |
| `PhotoUploader` (memoized, maks 6 foto, thumbnail, hidden input JSON) di form BAST | `src/components/module-workspace.tsx` |
| Penyematan ≤4 foto BAST ke PDF via `createSignedUrls` (fallback graceful) | `src/app/api/documents/[kind]/[id]/route.ts` |
| Fitur tercatat sebagai item audit **A13** (selesai) | `audit.md` |

Akar masalah: `schema.sql` di root adalah **snapshot legacy** yang secara eksplisit
dilarang dipakai sebagai sumber kebenaran (AGENTS.md §3; §51 poin 1 dokumen ini
sendiri), dan README memang belum diperbarui saat fitur A13 dikerjakan. Penulisan
note hanya memeriksa dua artefak stale tersebut — tidak memeriksa
`supabase/migrations/` dan kode aplikasi.

**Konsekuensi:** draft ASLI dokumen ini (Section 24: `handovers.photoUrls` ada,
jangan dihapus langsung; Phase 5: migrasikan PhotoUploader) adalah yang akurat,
dan "revisi" yang membaliknya justru menyesatkan.

### 52.2 Keputusan implementasi branch ini

Keputusan yang diambil bersama pemilik repo (12 September 2026):

1. **Media layer dibangun sesuai arsitektur ini** — `media_files` + Cloudflare
   Worker Media API + R2 privat + presigned PUT + client compression — sebagai
   infrastruktur baru yang generik (entity_type `fleet` **dan** `bast` sudah
   tersedia di skema).
2. **Integrasi UI hanya untuk FLEET di branch ini** (Phase 4). Cover + galeri
   unit fleet adalah fitur baru yang memang tidak ada sebelumnya.
3. **Foto BAST existing TIDAK dimigrasikan dan TIDAK disentuh** — sengaja
   dibiarkan di Supabase Storage `bast-photos` (migration 0012) agar fitur BAST
   yang sudah PASS tidak berisiko regresi (doc §45). Migrasi BAST ke Media API
   adalah **fase lanjutan terpisah** (Phase 5) dengan uji regresi §39.
   Dampaknya: selama fase ini, dua sistem foto BAST tidak berjalan paralel —
   yang ada hanyalah satu sistem BAST (Supabase Storage) yang utuh, dan satu
   sistem media baru yang baru dipakai fleet. `media_files` tidak akan berisi
   baris `entity_type='bast'` sampai fase lanjutan.
4. **Deviasi env (lebih aman dari §26):** Next.js/Vercel hanya mendapat
   `MEDIA_API_URL` (URL publik Worker). **Tidak ada** variabel `R2_*` di
   environment Next.js — seluruh kredensial R2 adalah Worker Secrets
   (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
5. **Worker hanya membaca PostgreSQL (via Supabase Data API, RLS-terlindungi)**
   untuk auth/role/entity/metadata; penulisan `media_files` dilakukan Server
   Action Next.js — konsisten "Worker bukan database" (§4).
6. **CSP:** `connect-src` production ditambahkan `https://*.r2.cloudflarestorage.com`
   (host spesifik R2, untuk presigned PUT langsung dari browser — `next.config.ts`).
7. **Fakta tambahan yang ditemukan audit:** `GET /api/bast-photos` tidak ada —
   hanya `POST` (37 baris) — padahal `PhotoUploader` merender thumbnail BAST
   lama lewat `GET /api/bast-photos?path=...` sehingga mengembalikan 405.
   **Tidak diperbaiki di branch ini** (out of scope, risiko regresi BAST);
   dicatat sebagai temuan terpisah. Private-read Media API (`GET /media/:id`)
   adalah pengganti yang benar untuk pola ini di fase BAST.

### 52.3 Artefak implementasi branch ini

| Artefak | Status |
|---|---|
| `supabase/migrations/0023_media_files.sql` | ✅ tabel + constraint pair entity/category + index + RLS |
| `src/db/schema.ts` → `mediaFiles` | ✅ (lokal/pratinjau via `drizzle-kit push`) |
| `media-worker/` (Worker + `wrangler.jsonc` + README deploy) | ✅ source; deploy = tugas operator (butuh akses Cloudflare) |
| `src/lib/media.ts` | ✅ klien Worker server-only (fail-soft, timeout 10 dtk) |
| `src/lib/image-compress.ts` | ✅ resize ≤1600px + WebP q80→0.45, fallback JPEG, hard cap 2 MB, PUT XHR ber-progress |
| Server Action: `requestFleetPhotoUpload` / `completeFleetPhotoUpload` / `deleteFleetPhoto` / `getFleetMedia` | ✅ otorisasi `requireUser` per operasi (doc §22) |
| UI: seksi "Foto Unit" (cover + galeri) di form fleet, thumbnail list fleet | ✅ `FleetPhotoSection` (memoized), fail-soft |
| `data.ts` | ✅ `media.enabled` + cover URL per baris halaman (independen dari KPI, doc §46) |
| Audit log | ✅ aksi `upload`/`delete` entity `media` (label "Media (Foto)") |
| `.env.example`, `supabase/README.md` (§6/§8/§9), `README.md`, `roadmap.md`, `audit.md` | ✅ |

### 52.4 Yang BELUM dikerjakan (tugas menyusul)

1. **Deploy** R2 bucket (3 env, §43) + Worker + secrets (`media-worker/README.md`);
   isi `MEDIA_API_URL` di Vercel. Tanpa ini fitur foto fleet nonaktif —
   aplikasi tetap normal (rollout & rollback gratis, §41).
2. **Reconciler/cleanup orphan** untuk baris `pending`/`failed` yang menua
   (index `idx_media_files_status` sudah disiapkan) — cron future.
3. **Fase BAST** (Phase 5 dokumen ini): migrasikan `PhotoUploader` dari
   Supabase Storage ke Media API + hapus `bast-photos` setelah verifikasi
   (Phase 6) — PR terpisah, wajib uji regresi §39.
4. **Bug 405** `GET /api/bast-photos` (temuan 52.2 poin 7) — PR terpisah.
5. Endpoint future §38 (`/replace`, `/download`, `/thumbnail`) — hanya bila
   kebutuhan nyata muncul.

### 52.5 Checklist keamanan (status implementasi)

```text
[x] R2 bucket private                      (syarat deploy — dokumentasi media-worker/README.md)
[x] R2 credentials server-only             (Worker Secrets; TIDAK ada R2_* di env Next.js)
[x] CORS restricted                         (Worker: ALLOWED_ORIGINS; R2 bucket: origin aplikasi)
[x] MIME validation                         (upload-url + completion)
[x] Magic-byte validation                   (completion: prefix 64 byte object aktual)
[x] File size validation                    (input 10 MB klien; hard cap 2 MB Worker)
[x] Object key randomized                   (media ID UUID; enforced persis di Worker)
[x] Authorization enforced                  (JWT GoTrue + role profiles via Data API, per operasi)
[x] Delete authorization enforced           (admin/operations)
[x] BAST media private                      (BAST tak tersentuh; R2 bucket private)
[x] Presigned URL expiry limited            (default 900 dtk; signed GET 300 dtk)
[x] No NEXT_PUBLIC R2 secrets               (tidak ada; hanya MEDIA_API_URL publik)
[x] No credentials in Git                   (wrangler.jsonc hanya berisi var non-rahasia)
[x] Audit events                            (upload/delete; MEDIA_ACCESS belum — read via signed URL tak di-audit per akses)
[ ] Orphan cleanup strategy                 (didefinisikan skemanya; cron menyusul — 52.4)
```

## Status

This document defines the **target architecture**, not an instruction to immediately deploy it.

Implementation should be performed as a separate task/PR after repository audit.

> Update 12 Sep 2026: implementasi fleet sudah dikerjakan di branch
> `arena/01a09672-rentalin` sesuai §52; sisa = deploy infrastruktur + fase
> lanjutan (52.4).
