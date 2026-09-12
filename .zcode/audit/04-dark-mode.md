# Topik 4 — Dark Mode: Palet Warna & Rencana Implementasi

> Scope: seluruh UI web (dashboard, form, tabel, chart, login). **Dokumen PDF (BAST,
> Invoice, Kontrak, Perjanjian, SPH) TIDAK ikut dark mode** — tetap putih permanen
> (dokumen cetak/legal, bukan permukaan kerja layar). Sumber warna asli:
> `src/app/globals.css` (:root, status badge, metric-icon, chart).

## Prinsip pemilihan warna

- **Bukan hitam pekat** — dasar gelap dipilih abu-abu kebiruan gelap (slate), bukan `#000`,
  supaya tidak silau/kontras berlebihan saat dipakai lama untuk input data (pola yang sama
  dipakai dashboard profesional seperti Linear/Vercel/GitHub, bukan tren sesaat).
- **Aksen oranye brand dipertahankan** — ini identitas HeavyOps (logo, warna aktif nav,
  tombol utama). Cuma dinaikkan sedikit terangnya (`#ef762d` → `#f2874a`) supaya tetap
  kontras jelas di atas latar gelap, bukan diganti warna lain.
- **5 warna status badge tetap sama hue-nya** (amber/hijau/merah/biru/ungu) — cuma versi
  gelapnya. Ini penting: pengguna sudah hafal "oranye = pending, hijau = selesai" dari mode
  terang; kalau hue diganti pas dark mode, itu justru bikin bingung, bukan bikin bagus.
- **Login page tetap terang selamanya** (rekomendasi, bukan keharusan teknis) — halaman
  ini palet krem/beige terpisah (`#f2f0eb`) yang jadi identitas visual "wajah" aplikasi,
  bukan permukaan kerja data. Pola umum: layar auth/marketing tetap 1 tema, dashboard ikut
  preferensi user.

## Token warna — Terang (sekarang) vs Gelap (diusulkan)

| Token | Terang (ada) | Gelap (diusulkan) | Dipakai untuk |
|---|---|---|---|
| `--bg` | `#f7f8fa` | `#14171c` | Latar halaman |
| `--surface` | `#fff` | `#1b1f26` | Kartu, panel, sidebar, topbar, modal |
| `--surface-alt` *(baru)* | `#fafbfc`/`#f8f9fb` (implisit) | `#21262f` | Header tabel, popover, hover state |
| `--text` | `#25292e` | `#e7e9ec` | Teks utama |
| `--muted` | `#8a8e96` | `#8b929c` | Teks sekunder/label (nyaris tak berubah — sudah cukup netral) |
| `--border` | `#eaebed` | `#2b3038` | Semua garis pembatas |
| `--orange` (brand) | `#ef762d` | `#f2874a` | Tombol utama, link aktif, aksen |
| `--orange-light` (bg aktif) | `#fff0e7` | `#3a2a1c` | Nav item aktif, kartu terpilih |
| `--green` | `#348b67` | `#4caf82` | Indikator sukses/utilisasi |

## Status badge (5 kategori — hue sama, versi gelap)

| Kategori | Status | Terang (text/bg/border) | Gelap (text/bg/border) |
|---|---|---|---|
| Amber | renting, unpaid, pending | `#d89546` / `#fff6e9` / `#f8eedb` | `#e0a860` / `#2e2418` / `#4a3a22` |
| Hijau | available, approved, paid, completed | `#599b7d` / `#edf7f1` / `#e5f1e9` | `#6fbd97` / `#1c2c24` / `#2c4436` |
| Merah | maintenance, rejected, overdue, banned | `#cf7871` / `#fdf0ed` / `#f8e6e2` | `#e08a83` / `#2e1f1d` / `#4a2e2a` |
| Biru | in_transit, active, mobilization | `#789dc7` / `#eff5fc` / `#e7effa` | `#8fb3dd` / `#1c2530` / `#2c3c50` |
| Ungu | draft, partial, demobilization | `#9083ac` / `#f3eff9` / `#ece7f5` | `#b09fd0` / `#241f30` / `#382e4a` |

Metric-icon (`orange`/`green`/`blue`/`amber`/`purple` di `overview.tsx`) dan warna chart
(donut status, `orange-dot`/`gray-dot` di revenue chart) ikut mapping hue yang sama persis
di atas — jangan bikin palet baru untuk chart, supaya badge dan chart konsisten.

## Yang perlu penanganan khusus (bukan sekadar ganti hex)

| # | Isu | Solusi |
|---|---|---|
| DM1 | Shadow pakai hitam-transparan (`#1c233103`, `#00000018`, dst) — di latar gelap, shadow hitam nyaris tidak kelihatan (elevasi jadi flat). | Untuk elemen mengambang (modal, popover, toast) di dark mode, ganti andalan dari `box-shadow` gelap → kombinasi `border` 1px lebih terang + shadow tipis (opacity dinaikkan, mis. `#00000055`) supaya kartu tetap "terangkat" dari background. |
| DM2 | `app/layout.tsx` sudah hardcode `bg-slate-100 text-slate-900` (Tailwind) di `<body>`, di luar sistem `--bg`/`--text`. | Hapus 2 class Tailwind itu, biarkan `body` di `globals.css` (yang sudah pakai `var(--bg)`/`var(--text)`) jadi satu-satunya sumber warna — supaya `--bg`/`--text` benar-benar dipakai (K3-style bug: sekarang dua sumber kebenaran warna body). |
| DM3 | `::selection{background:#ffe0ca}` dan outline focus `#ef762d77` hardcode. | Buat versi gelap: `::selection` pakai tint oranye gelap (`#4a3320`), outline focus tetap oranye brand (sudah cukup kontras di kedua tema). |
| DM4 | Foto BAST (`<img>`) & QR/logo di dalam UI (bukan PDF) — pastikan tidak ada background putih solid terbungkus yang jadi kotak putih menyala di dark mode. | Beri `background:var(--surface)` + border tipis pada wrapper thumbnail, bukan putih hardcode. |

## Cara aktivasi (teknis, ringkas)

- Tambah atribut `data-theme="dark"` di `<html>`, toggle dari tombol di profile menu
  (sudah ada slot popover profil di `shell.tsx`) — simpan pilihan di `localStorage` +
  baca `prefers-color-scheme` sebagai default awal.
- Semua token di atas didefinisikan 2x: `:root{...}` (terang, sudah ada) dan
  `[data-theme="dark"]{...}` (baru) — komponen **tidak perlu diubah sama sekali** karena
  sudah pakai `var(--nama)`, kecuali ~250 tempat yang masih hardcode hex (lihat topik
  sebelumnya) yang harus dipetakan ke variable dulu sebelum dark mode bisa jalan penuh.
- Skrip anti-flash kecil di `<head>` (baca localStorage sebelum React mount) supaya tidak
  ada kedipan tema terang sekilas saat reload.

## Urutan eksekusi yang disarankan

1. Migrasi ~250 hex di `globals.css` → `var(--token)` (termasuk token baru `--surface-alt`
   dan 5×3 warna status) — pekerjaan mekanis, bisa 1 sesi.
2. Tambah blok `[data-theme="dark"]` dengan nilai di tabel atas.
3. Toggle + persistensi + anti-flash script.
4. Tangani DM1–DM4 secara manual (butuh cek visual, tidak bisa full otomatis).
5. QA manual: buka tiap modul + modal + toast + chart dalam mode gelap, cek kontras teks
   status badge (semua kombinasi di atas sudah dipilih agar rasio kontras teks:bg ≥ 4.5:1).
6. PDF/dokumen cetak: tidak disentuh (sudah di luar scope by design).
