# Topik 1 — Kehalusan (Smoothness) List/Tabel Modul

> ✅ Dieksekusi — lihat "Status eksekusi" di README.md

> Fokus: interaksi pager/sort/tab di `/dashboard/[module]` — bukan query DB (sudah efisien,
> lihat `ui-audit.md` bawaan repo). Sumber: `src/components/module-workspace.tsx`,
> `src/app/globals.css`.

## Penyebab

| # | Penyebab | Bukti | Dampak |
|---|---|---|---|
| S1 | Pager/sort/tab status/tab kategori/filter jatuh-tempo semuanya `<button onClick={()=>navigate(...)}>` → `router.push/replace`. Tidak ada `<Link>`, tidak ada `router.prefetch()` di mana pun. | `module-workspace.tsx` (navigate calls) | Setiap klik selalu nunggu round-trip penuh dulu baru mulai fetch — tidak ada "kepala mulai". |
| S2 | Indikator loading = `opacity:.55` tanpa `transition` pada `.table-scroll`. | `globals.css` | Dim muncul instan (snap), terasa kedip bukan transisi halus. |
| S3 | Tidak ada skeleton baris saat `pending` — baris lama cuma diredupkan, padahal pola shimmer sudah ada (`loading-bar`, `loading-cards`, `loading-chart`). | `module-workspace.tsx` vs `overview.tsx` | Ambigu: user tidak yakin apakah UI freeze atau memang loading. |
| S4 | `MODULE_PAGE_SIZE = 8` — kecil untuk dataset puluhan/ratusan baris. | `lib/data.ts:43` | Makin sering kena S1+S2 karena makin sering klik pager. |
| S5 | `app/dashboard/loading.tsx` hanya terpicu transisi *segment*, tidak terpicu saat hanya `searchParams` berubah (pager/sort/tab tetap di segment `[module]` yang sama). | `app/dashboard/loading.tsx` | Satu-satunya sinyal loading yang tersisa cuma S2. |
| S6 | `tbody tr:hover` tanpa `transition` (beda dari elemen lain yang sudah `transition:.18s`). | `globals.css` | Minor — hover baris snap, tidak konsisten dengan micro-interaction lain. |

## Saran (urut prioritas)

| # | Saran | Effort |
|---|---|---|
| P1 | `router.prefetch(url)` on `onMouseEnter`/`onFocus` di tombol pager/sort/tab | 0.5 hari |
| P2 | `transition: opacity .15s ease` pada `.table-scroll` | 5 menit |
| P3 | Skeleton baris (pakai pola shimmer yang sudah ada) saat `pending`, khusus perubahan tab/filter besar | 0.5–1 hari |
| P4 | Naikkan `MODULE_PAGE_SIZE` (8→15-20) atau beri pemilih ukuran halaman | 1–2 jam |
| P5 | `transition:background .15s` pada `tbody tr:hover` | 5 menit |
| P6 | Tab status/kategori jadi optimistic (state visual tab tidak nunggu network, karena `statusCounts` sudah ada di payload) | 0.5 hari |

## Yang tidak perlu diubah
Server-side pagination (`getModulePage`), debounce 300ms search box, dan tidak perlu virtualisasi selama page size ≤20.
