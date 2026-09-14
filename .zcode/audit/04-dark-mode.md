# Topik 4 — Dark Mode: Palet Warna & Rencana Implementasi

> ✅ Dieksekusi dengan keputusan produk lanjutan (14 September 2026).
> Night mode tersedia pada `/login` dan `/dashboard` melalui subtree terisolasi;
> pemulihan akses, verifikasi publik, dan dokumen PDF tetap terang. **Dokumen PDF (BAST,
> Invoice, Kontrak, Perjanjian, SPH) TIDAK ikut dark mode** — tetap putih permanen
> (dokumen cetak/legal, bukan permukaan kerja layar). Sumber warna asli:
> `src/app/globals.css` (:root + `.login-page.login-night` + `.app-shell.dashboard-dark`).

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
- **Login dan dashboard memiliki night mode terisolasi** — login memakai palet slate
  gelap sebagai titik masuk, sementara dashboard dapat mengikuti preferensi pengguna tanpa
  mengubah halaman pemulihan akses atau verifikasi publik. Form input memakai satu permukaan
  gelap yang sama untuk placeholder, ketikan, dan autofill agar tidak terasa berganti warna.
- **Toggle tetap berada di luar konteks form** — login memakai kontrol sederhana di sudut
  kanan atas; dashboard memakai kontrol yang sama di topbar. Tidak ada menu profil yang harus
  dibuka terlebih dahulu untuk mengganti tema.

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

- `/login` merender `.login-page.login-night` secara default; token gelap diwariskan hanya
  di subtree tersebut. Toggle sederhana ditempatkan di luar form, pada sudut kanan atas
  halaman, untuk berpindah ke mode terang.
- `/dashboard` memakai class `.app-shell.dashboard-dark` saat toggle di topbar aktif.
  Preferensi disimpan di `localStorage['heavyops-dashboard-theme']`, tanpa atribut
  `data-theme` global atau pengaruh ke halaman pemulihan akses dan verifikasi publik.
- Field login dan dashboard menggunakan permukaan gelap yang sama untuk placeholder, nilai
  yang sudah diketik, fokus, dan browser autofill. Chart dashboard juga membaca token tema
  sehingga tidak mempertahankan tooltip atau grid putih.
- Token terang di `:root` tetap menjadi default untuk seluruh UI; PDF/dokumen cetak tidak
  disentuh.

## Urutan eksekusi yang disarankan

1. ✅ Isolasi palet night mode di `.login-page.login-night` dan `.app-shell.dashboard-dark`;
   halaman non-login/non-dashboard tidak ikut berubah.
2. ✅ Selaraskan permukaan input: placeholder, teks terisi, fokus, dan autofill memakai
   warna permukaan gelap yang sama.
3. ✅ Sinkronkan chart dashboard ke CSS token agar grid, tooltip, garis, dan donut tetap
   terbaca pada kedua tema.
4. ✅ QA shell: sidebar memiliki overflow vertikal di desktop/mobile dan topbar sticky
   terhadap scroll viewport.
5. QA manual lanjutan: validasi kontras fokus/error pada browser target dan pastikan PDF/
   dokumen cetak tetap putih permanen.
