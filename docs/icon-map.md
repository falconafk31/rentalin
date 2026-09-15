# Peta Ikon (R3 — audit ikon 03)

> Sumber ikon: **`lucide-react` saja** (R4 — jangan campur emoji atau keluarga ikon lain,
> konsistensi outline adalah faktor utama agar UI tidak cepat terasa usang).
> Modul/fitur baru **wajib cek tabel ini sebelum `import` ikon baru** — satu konsep = satu
> ikon, agar tidak mengulangi tabrakan seperti `UsersRound` yang dulu dipakai 2 menu.

| Konsep | Ikon | Dipakai di |
|---|---|---|
| Dasbor | `LayoutDashboard` | `shell.tsx` |
| Armada Alat Berat | `EquipmentIcon` (custom, `icons.tsx`) | `shell.tsx`, baris tabel fleet, `overview.tsx` |
| Data Klien (mitra bisnis eksternal) | `Building2` | `shell.tsx`, sel klien di `module-workspace.tsx`, panel Pengaturan |
| Kontrak Sewa | `FileText` | `shell.tsx` |
| BAST Serah Terima | `ClipboardCheck` | `shell.tsx`, notifikasi |
| Timesheet Harian | `ClipboardList` | `shell.tsx`, notifikasi |
| Penagihan / Invoice | `ReceiptText` | `shell.tsx`, notifikasi, `overview.tsx` |
| Pengguna & Peran (staf internal) | `UsersRound` | `shell.tsx`, `admin-workspace.tsx` |
| Log Audit | `ScrollText` | `shell.tsx` |
| Pengaturan | `Settings2` | `shell.tsx` |
| Terbitkan (publish template/dokumen) | `Send` | `template-workspace.tsx` |
| Simpan draf / perubahan | `Save` | `template-workspace.tsx`, `module-workspace.tsx` |
| Pratinjau | `Eye` | `template-workspace.tsx` |
| Riwayat versi | `History` | `template-workspace.tsx` |
| Ubah record | `Pencil` | `module-workspace.tsx` |
| Hapus record | `Trash2` | `module-workspace.tsx` |
| Unduh PDF | `FileDown` | `PdfLink` (`module-workspace.tsx`) |
| Finalisasi BAST (draft -> final, satu arah) | `Check` | baris tabel BAST (`module-workspace.tsx`) |
| Setujui / konfirmasi sukses | `Check` / `CircleCheck` | `module-workspace.tsx`, toast |
| Tolak | `X` (juga: tutup) | `module-workspace.tsx` |
| Peringatan dokumen kedaluwarsa | `TriangleAlert` | `module-workspace.tsx`, toast, panel admin |
| Pembayaran | `Wallet` | baris invoice (`module-workspace.tsx`) |
| Cari | `Search` | toolbar tabel, pencarian global |
| Filter kategori | `Filter` | toolbar tabel |
| Urutkan | `ArrowUpDown` | toolbar tabel |
| Pager | `ChevronLeft` / `ChevronRight` / `ChevronDown` | pagination, select, breadcrumb |
| Bantuan | `CircleHelp` | sidebar, modal help |
| Info / catatan | `Info` | `info-callout` |
| Keamanan / hak akses | `ShieldCheck` / `ShieldX` | panel akun, form invoice, admin |
| Konfirmasi email | `MailCheck` | halaman verifikasi |
| Unggah foto | `ImagePlus` | PhotoUploader BAST |
| Keluar | `LogOut` | menu profil |

Sudah aman, tidak perlu diubah: `ClipboardCheck`/`ClipboardList`, `ReceiptText`,
`ScrollText`, `MailCheck`, `ShieldCheck`/`ShieldX` — semua literal dan netral tren.

Dulu pernah dipakai dan diganti (jangan dipakai lagi untuk konsep di atas):
- `UsersRound` untuk **Data Klien** → `Building2` (tabrakan dengan Pengguna & Peran).
- `Rocket` untuk **Terbitkan** → `Send` (metafora tren startup, tidak timeless).
