# Modul: Penagihan/Invoice (`/dashboard/invoices`)

Lihat juga: [`../02-konsistensi-form-list.md`](../02-konsistensi-form-list.md) (K1 — sumber
utama temuan `.invoice-stats` vs `.module-stats`).

## Spesifik modul ini
- Ringkasan 3 kartu (`.invoice-stats`) memakai markup & CSS berbeda dari kartu status fleet
  (`.module-stats`) — target utama G1 (bikin `ModuleSummary` bersama).
- Preview total tagihan di form (`.invoice-preview`) memakai nama class yang sama dipakai
  ulang untuk riwayat amandemen kontrak — lihat C1 di `modules/contracts.md` untuk saran
  penamaan ulang.
- Payment ledger (cicilan/`partial`) sudah berfungsi baik menurut `ui-audit.md` bawaan
  repo — tidak ada temuan baru di alur pembayaran itu sendiri.

## Tidak ada temuan performa baru di luar topik 1.
