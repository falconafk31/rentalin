# Modul: Timesheet Harian (`/dashboard/timesheets`)
n> ✅ Dieksekusi — lihat "Status eksekusi" di README.md

Lihat juga: [`../02-konsistensi-form-list.md`](../02-konsistensi-form-list.md) (K1 — pola
ringkasan berbeda dari fleet/invoices).

## Spesifik modul ini
- Ringkasan hanya 1 baris `info-callout` ("X catatan menunggu persetujuan"), bukan kartu
  seperti fleet atau invoices — salah satu dari 3 pola berbeda yang disebut di K1.
  Setelah G1 dikerjakan, modul ini bisa tetap pakai `info-callout` (karena memang cuma
  1 angka, bukan beberapa breakdown) — jadi tidak wajib migrasi penuh ke `ModuleSummary`,
  cukup dipastikan gaya `info-callout`-nya konsisten dipakai untuk kasus "1 angka penting".
- Kalkulasi "Total Jam Efektif" di form sudah client-side ringan (`Math.max(0, ...)`) —
  tidak ada masalah performa.
- Tidak ditemukan temuan baru di luar topik 1–2.
