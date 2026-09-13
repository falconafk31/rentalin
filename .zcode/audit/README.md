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

---

## Status eksekusi (12 September 2026)

> Branch kerja: `feat/ui-audit-exec` (commit lokal saja, **tidak** di-push/di-merge).
> Semua saran dari 10 file audit dieksekusi kecuali 1 item yang masih menunggu keputusan (B1-varian-penuh); G2 sudah diputus dan dikerjakan susulan (commit `6fc56a6`).
> Verifikasi akhir: `npm run lint` 0 error 0 warning · `npx tsc --noEmit` bersih ·
> `env -u DATABASE_URL npm run build` sukses.

Commit terpisah per topik: `4703121` (01) · `0400796` (02) · `6110ce6` (03) · `8fc274c` (modul) · `26ab4eb` (perbaikan build) · `6fc56a6` (G2 susulan) · `7fc7d88` (topik 04 dark mode).

### Per topik

#### Topik 01 — Kehalusan list/tabel

| Item | File kode | Efek |
|---|---|---|
| P1 | `src/components/module-workspace.tsx` | `router.prefetch(url)` saat hover/focus di tab status, kartu fleet, banner kedaluwarsa, tombol sort, dan semua tombol pager — klik berikutnya mulai dari cache RSC. Helper URL `buildUrl` dipakai bersama navigate/prefetch (tidak duplikat logika). |
| P2 | `src/app/globals.css` | `.table-scroll` kini `transition:opacity .15s ease` — dim loading tidak lagi snap/kedip. |
| P3 | `src/components/module-workspace.tsx`, `globals.css` | Navigasi tab/filter besar menampilkan skeleton baris shimmer; perubahan kecil (pager/sort/search) tetap dim. Aksi simpan/setujui tidak memicu skeleton. |
| P4 | `src/lib/pagination.ts` (baru), `src/lib/data.ts`, `module-workspace.tsx` | `MODULE_PAGE_SIZE` 8 → 15; angka 8 yang di-hardcode diganti konstanta. |
| P5 | `src/app/globals.css` | `tbody tr` dapat `transition:background .15s` — hover baris halus. |
| P6 | `src/components/module-workspace.tsx` | Tab status, kartu fleet, dan select kategori optimistik: highlight berubah seketika saat klik, lalu tersinkron ulang dari echo filter server. |

#### Topik 02 — Konsistensi form & list

| Item | File kode | Efek |
|---|---|---|
| G1 | `module-workspace.tsx`, `globals.css` | Komponen `ModuleSummary` tunggal dipakai fleet & invoices. Class `.invoice-stats` dihapus; varian grid `.module-stats.cols-3` mengikuti semua breakpoint lama. |
| G2 | `module-workspace.tsx` (commit `6fc56a6`) | **SELESAI (keputusan user: kartu yang dipertahankan).** Blok `.table-tabs` tidak dirender untuk `module==='fleet'` — kartu `ModuleSummary` di atas tabel jadi satu-satunya filter status. |
| G3 | `module-workspace.tsx` | Filter kategori `small-select` dirender bila `data.categoryOptions?.length`. |
| G4 | `module-workspace.tsx` | Helper `field()`/`selectField()`/`textareaField()` menerima `hint?` → dirender `<small className="cell-sub">` saat field tidak error. |
| G5 | `module-workspace.tsx` | 9 blok form manual dimigrasikan ke helper: select kontrak/unit/klien, textarea alasan revisi, dll. |
| G6 | `module-workspace.tsx` | `submitLabel` masuk ke map `config` per modul; rantai ternary panjang di footer dipangkas. |
| G7 | `README.md` | Catatan desain ditambahkan: modul tanpa status (Klien) memang hanya menampilkan tab "Semua". |

#### Topik 03 — Ikon

| Item | File kode | Efek |
|---|---|---|
| R1 | `src/components/shell.tsx` | Sidebar "Data Klien" → `Building2` (konsep perusahaan/mitra); `UsersRound` kini khusus "Pengguna & Peran". |
| R2 | `src/components/template-workspace.tsx` | Tombol "Terbitkan" template PDF → `Send` (metafora literal kirim/sahkan; `Rocket` dihapus dari kode). |
| R3 | `docs/icon-map.md` (baru) | Tabel pemetaan konsep → ikon lucide → file pemakaian, + daftar ikon yang dilarang dipakai ulang (`UsersRound` utk klien, `Rocket`). |
| R4 | `docs/icon-map.md` | Aturan "satu-satunya sumber ikon: lucide-react" didokumentasikan di header tabel. |

#### Topik 04 — Dark mode (`.zcode/audit/04-dark-mode.md`)

Commit: `7fc7d88` — `feat(theme): dark mode per audit/04-dark-mode.md`.

| Item | File kode | Efek |
|---|---|---|
| Langkah 1 — token baru | `src/app/globals.css` (`:root`) | Ditambah `--surface-alt:#fafbfc` + 15 token status (5 kategori × text/bg/border) dengan nilai TERANG persis tabel audit; nilai gelap menyusul di blok dark. |
| Langkah 1 — migrasi hex | `src/app/globals.css` | Nilai yang PERSIS ada di tabel audit dipetakan ke `var(--token)`: `#f7f8fa`→`--bg`, `#fff` (latar)→`--surface`, `#fafbfc`/`#f8f9fb`→`--surface-alt`, `#25292e`→`--text`, `#eaebed`→`--border`, `#ef762d`→`--orange`, `#fff0e7`→`--orange-light`, `#348b67`→`--green`, dan 15 nilai status badge → token status. Mode terang identik (nilai token = nilai lama). Dua `color:#fff` di atas aksen (`.brand-mark`, `.button-danger`) sengaja tetap literal putih — bukan `--surface`, karena di dark mode token itu jadi gelap. |
| Langkah 2 — blok gelap | `src/app/globals.css` (`[data-theme="dark"]`) | Semua token didefinisikan ulang dengan nilai persis tabel audit (`--bg:#14171c`, `--surface:#1b1f26`, `--surface-alt:#21262f`, `--text:#e7e9ec`, `--muted:#8b929c`, `--border:#2b3038`, `--orange:#f2874a`, `--orange-light:#3a2a1c`, `--green:#4caf82`, + 15 status). Tidak ada warna di luar tabel. `color-scheme` ikut di-set per tema (kontrol native browser). |
| Langkah 3 — toggle | `src/components/shell.tsx` | Tombol "Mode gelap"/"Mode terang" di popover profil (slot yang sudah ada), memakai `Moon`/`Sun`. Status dibaca lewat `useSyncExternalStore` dari atribut `data-theme` (menghindari setState-in-effect yang dilarang eslint proyek); pilihan disimpan di `localStorage['heavyops-theme']`. |
| Langkah 3 — anti-flash | `src/app/layout.tsx` | Skrip inline di `<head>` (sebelum React mount): baca `localStorage`, fallback ke `prefers-color-scheme`, lalu pasang `data-theme="dark"` — tidak ada kedipan tema terang saat reload. |
| Langkah 4 — DM1 | `src/app/globals.css` | Modal, popover header, hasil pencarian, dan toast di dark mode: border dinaikkan (campuran token, bukan warna baru) + shadow `#00000055`. |
| Langkah 4 — DM2 | `src/app/layout.tsx` | Class Tailwind `bg-slate-100 text-slate-900` dihapus dari `<body>`; `globals.css` (`var(--bg)`/`var(--text)`) jadi satu-satunya sumber warna body. |
| Langkah 4 — DM3 | `src/app/globals.css` | `::selection` versi gelap `#4a3320` (tint oranye gelap dari tabel). Outline fokus `#ef762d77` → `color-mix(in srgb, var(--orange) 47%, transparent)`. |
| Langkah 4 — DM4 | `src/app/globals.css` | `.photo-thumb img` diberi `background:var(--surface)` — thumbnail foto BAST tidak jadi kotak putih menyala. |
| Langkah 5 — QA kontras | — | Dihitung programatik: rasio teks:bg badge gelap **amber 7.19 · hijau 6.55 · merah 6.12 · biru 7.12 · ungu 6.63** (semua ≥ 4.5:1, sesuai klaim audit). |
| Langkah 6 — login & PDF | `src/app/globals.css` | `.login-page` mendedeklarasikan ulang token terang di subtree-nya → halaman login tetap terang permanen walho `data-theme="dark"` aktif. PDF (`pdf-document.tsx`) tidak disentuh sama sekali. |

#### File modul

| Item | File kode | Efek |
|---|---|---|
| C1 (`contracts.md`/`invoices.md`) | `globals.css`, `module-workspace.tsx`, `template-workspace.tsx` | Class `.invoice-preview` → `.summary_box` di seluruh 15 pemakaiannya (CSS + JSX). |
| B1 (`bast.md`) | `module-workspace.tsx` | Varian minimal sesuai saran audit: `loading="lazy" decoding="async"` pada pratinjau foto. **Catatan:** varian penuh (`next/image` + `remotePatterns`) tidak dipilih karena pratinjau memakai object-URL lokal (blob:) yang tidak didukung `next/image` tanpa custom loader — perlu keputusan bila ingin pindah ke signed-URL Supabase. |
| `fleet.md` `clients.md` `timesheets.md` `invoices.md` `settings.md` | — | Tidak ada item baru; seluruh temuannya sudah tercakup G1–G7 / R1–R2 / I1–I3 / K1–K7 yang dieksekusi di atas. |

#### Perbaikan pasca-eksekusi

| Item | File kode | Efek |
|---|---|---|
| Fixup build | `src/lib/pagination.ts` (baru), `data.ts`, `module-workspace.tsx` | Import *nilai* `MODULE_PAGE_SIZE` dari `lib/data.ts` (server-only) ke client component menyeret `pg`/`dns`/`fs` ke bundle browser → build tanpa env gagal. Konstanta dipindah ke `lib/pagination.ts` (netral), `dat
