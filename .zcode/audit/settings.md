# Modul: Pengaturan (`/dashboard/settings`)
n> ✅ Dieksekusi — lihat "Status eksekusi" di README.md

Lihat juga: [`../02-konsistensi-form-list.md`](../02-konsistensi-form-list.md) (K4 — sumber
pola `.cell-sub` yang tidak dipakai modul lain), [`../03-icon-audit-2026-2036.md`](../03-icon-audit-2026-2036.md) (I2/R2 — ikon `Rocket`).

## Spesifik modul ini
- Satu-satunya form yang **tidak** pakai `RecordModal`/modal sama sekali — form penuh di
  panel (masuk akal, karena field-nya banyak & permanen, bukan record berulang). Ini bukan
  inkonsistensi yang perlu diperbaiki, hanya perlu didokumentasikan sebagai pengecualian
  yang disengaja.
- Satu-satunya tempat yang punya teks bantuan (`.cell-sub`) di bawah field opsional — jadi
  sumber acuan kalau G4 (di file topik 2) dikerjakan: pola ini yang dijadikan standar,
  bukan dihapus.
- Tab "Template PDF" → tombol **Terbitkan** pakai ikon `Rocket` — lihat I2/R2 di audit ikon,
  ini modul tempat perbaikannya dieksekusi (`template-workspace.tsx:152`).

## Tidak ada temuan performa baru di luar topik 1.
