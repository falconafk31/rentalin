# Modul: Kontrak Sewa (`/dashboard/contracts`)

## Spesifik modul ini
- Form punya 2 varian besar: buat baru vs revisi (`revising`) — masing-masing render blok
  JSX terpisah dalam kondisional yang sama. Konsisten secara pola dengan modul fleet
  (single vs bulk), jadi tidak melanggar K5, tapi tetap kandidat kuat untuk `field()`
  extended (G5) karena banyak field manual (select unit tersedia, textarea alasan revisi).
- Riwayat amandemen (`revisionHistory`) dirender dengan class `.invoice-preview` yang
  namanya mengacu ke modul invoice, dipakai ulang di sini untuk tampilan "kotak ringkasan
  bergaris" — secara visual konsisten (memang itu tujuannya), tapi nama class-nya
  menyesatkan untuk maintainer baru (harusnya nama netral, mis. `.summary-box`).
- Tidak ditemukan masalah performa/konsistensi tambahan di luar topik 1–2.

## Saran tambahan
| # | Saran | Effort |
|---|---|---|
| C1 | Ganti nama class `.invoice-preview` → `.summary-box` (dipakai di invoice & kontrak), update kedua pemakaian. | 15 menit |
