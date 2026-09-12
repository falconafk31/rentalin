# HeavyOps — Indeks Audit UI/UX

> Audit dipecah per topik & per modul supaya tiap bagian bisa direview/dieksekusi terpisah.
> Semua temuan diverifikasi langsung dari source (`falconafk31/rentalin`, branch `main`),
> bukan asumsi.

## Per topik

| File | Isi |
|---|---|
| [`01-performa-list.md`](./01-performa-list.md) | Kenapa navigasi list (pager/sort/tab) terasa kurang smooth |
| [`02-konsistensi-form-list.md`](./02-konsistensi-form-list.md) | Kenapa bentuk form & list belum 100% seragam antar modul + rencana penyeragaman |
| [`03-icon-audit-2026-2036.md`](./03-icon-audit-2026-2036.md) | Audit ikon: mana yang ambigu/berpotensi terasa usang, penggantinya yang lebih timeless |
| [`04-dark-mode.md`](./04-dark-mode.md) | Palet warna dark mode (sesuai brand oranye + status badge yang ada), yang dikecualikan (PDF), urutan eksekusi |

## Per modul (temuan spesifik, di luar 3 topik di atas)

| File | Modul |
|---|---|
| [`modules/fleet.md`](./modules/fleet.md) | Armada Alat Berat |
| [`modules/clients.md`](./modules/clients.md) | Data Klien |
| [`modules/contracts.md`](./modules/contracts.md) | Kontrak Sewa |
| [`modules/timesheets.md`](./modules/timesheets.md) | Timesheet Harian |
| [`modules/bast.md`](./modules/bast.md) | BAST Serah Terima |
| [`modules/invoices.md`](./modules/invoices.md) | Penagihan/Invoice |
| [`modules/settings.md`](./modules/settings.md) | Pengaturan |

## Cara pakai

Tunjuk file + item mana yang mau dieksekusi (mis. "kerjakan 02 poin K1-K3 + icon-audit poin I1"),
audit ini murni temuan+saran, belum ada perubahan kode.
