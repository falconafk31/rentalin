# Modul: Armada Alat Berat (`/dashboard/fleet`)

Lihat juga temuan lintas-modul: [`../01-performa-list.md`](../01-performa-list.md),
[`../02-konsistensi-form-list.md`](../02-konsistensi-form-list.md) (K1, K2, K3 spesifik
menyebut modul ini).

## Spesifik modul ini
- Satu-satunya modul dengan **2 kontrol filter status yang identik** (kartu `.module-stats` +
  tab `.table-tabs`) — lihat K2 di file konsistensi. Pilih salah satu.
- Satu-satunya modul dengan filter kategori (`small-select`) — saat ini hardcode
  `module==='fleet'`, lihat K3.
- Form punya 2 mode (single-add vs bulk-add) dalam satu blok kondisional besar di
  `RecordModal` — sudah berfungsi baik, tidak ada temuan performa/bug baru di sesi ini.
- Badge kedaluwarsa SIKO/asuransi (`isExpiringFleet`) sudah TZ-aman dan pakai
  `expiryWarningDays` dari Pengaturan (bukan hardcode 30) — sudah benar, tidak perlu diubah.

## Belum ada temuan baru di luar yang sudah tercakup topik 1–3.
