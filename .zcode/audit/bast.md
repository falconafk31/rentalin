# Modul: BAST Serah Terima (`/dashboard/bast`)
n> ✅ Dieksekusi — lihat "Status eksekusi" di README.md

## Spesifik modul ini
- Checklist 12 titik + `PhotoUploader` adalah komponen paling unik (tidak ada modul lain
  yang seberat ini) — struktur sudah rapi, tidak ada temuan performa baru.
- `<img src={p.url}>` mentah untuk pratinjau foto (bukan `next/image`) — sudah pernah
  disebut di audit performa sebelumnya (belum masuk file topik karena bukan soal
  smoothness list, melainkan payload gambar). Dicatat ulang di sini sebagai temuan modul:

| # | Temuan | Saran |
|---|---|---|
| B1 | Foto BAST pratinjau pakai `<img>` polos, bukan `next/image` (tidak ada resize/lazy-load otomatis). Sumber: Supabase Storage, bisa berukuran besar dari kamera HP. | Ganti ke `next/image` dengan `remotePatterns` domain Supabase Storage, atau minimal tambahkan `loading="lazy"` + batas dimensi CSS (sudah ada, cek `max-width`) di sisi upload. |

## Tidak ada temuan konsistensi form baru — modul ini sudah unik by design (checklist),
tidak perlu diseragamkan dengan modul lain.
