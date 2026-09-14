# Audit Rute `/dashboard/settings`

> Ruang lingkup: penggunaan `/dashboard/settings`, `/dashboard`, `/setting`, `/settings`,
> dan `/dasboard` (typo) di seluruh codebase, plus analisis dampak bila `/dashboard/settings`
> dipisah menjadi rute sendiri — serta alasan kenapa seluruh modul tetap memakai prefix
> `/dashboard/...` daripada di-root.
>
> Status: **audit saja — belum ada perubahan kode, belum ada PR.**

---

## 1. Ringkasan eksekutif

Saat ini **tidak ada rute `settings` yang berdiri sendiri**. "Pengaturan" diimplementasikan
sebagai salah satu *module slug* dari rute dinamis `/dashboard/[module]`, sehingga URL
kanoniknya adalah **`/dashboard/settings`** (jamak). Rute `[module]` menerima `settings`
sebagai nilai `module` lewat `MODULE_SLUGS`, lalu menempuh jalur khusus (`special case`)
di beberapa lapisan.

Konsekuensi utamanya: **`settings` diperlakukan seperti "tabel data" padahal bukan** —
tidak ada `rows`, pagination, status count, dsb. Hal ini memaksa kode `settings` menyebar
sebagai cabang-cabang `if (module === 'settings')` di `lib/data.ts`, `app/actions.ts`,
dan `components/module-workspace.tsx`.

Sebagai pembanding, halaman admin lain (`/dashboard/users`, `/dashboard/audit`) **sudah
dipisah** menjadi rute statis dengan loader sendiri (`getUsersData` / `getAuditData`) dan
guard admin di level halaman. `settings` adalah satu-satunya "modul" yang masih tertinggal
di pola dinamis `[module]`.

---

## 2. Inventarisasi rute & referensi (keadaan aktual)

| URL / path | Status | Keterangan |
|---|---|---|
| `/dashboard` | ✅ Aktif | Dasbor utama — `src/app/dashboard/page.tsx` + `getDashboardData()` |
| `/dashboard/settings` | ✅ Kanonik | `src/app/dashboard/[module]/page.tsx` dengan `module === 'settings'` |
| `/dashboard/[module]` | ✅ Dinamis | `fleet, clients, contracts, timesheets, bast, invoices, settings` |
| `/dashboard/users` | ✅ Statis | `src/app/dashboard/users/page.tsx` — admin-only |
| `/dashboard/audit` | ✅ Statis | `src/app/dashboard/audit/page.tsx` — admin-only |
| `/settings` (top-level) | ❌ Tidak ada | 404 → `not-found.tsx` |
| `/setting` (tunggal) | ❌ Tidak ada | 404 (via `notFound()` di `[module]`) |
| `/dasboard` (typo) | ❌ Tidak ada | 404 |

Referensi string `settings` di kode (hasil grep):

- `src/components/shell.tsx:22` — entri navigasi `{ path: '/dashboard/settings', label: 'Pengaturan', section: 'LAINNYA' }`.
- `src/components/shell.tsx:172` — menu profil: `<Link href="/dashboard/settings">Pengaturan akun</Link>`.
- `src/lib/data.ts:42` — `MODULE_SLUGS = [... , 'settings']`.
- `src/lib/data.ts:289-300` — cabang `if (module === 'settings')` di `getModulePage()`.
- `src/app/actions.ts:73` — `saveRecord`: role `settings` → `['admin']`.
- `src/app/actions.ts:167-177` — cabang `else if (module === 'settings')` di `saveRecord`.
- `src/app/actions.ts:478/496/516` — `revalidatePath('/dashboard/settings', 'page')` untuk template PDF.
- `README.md:14` — menyebut `/dashboard/settings` (huruf besar: "persisted company letterhead").

Tidak ditemukan satu pun referensi ke `/setting` (tunggal) atau `/dasboard`.

---

## 3. Bagaimana `settings` diimplementasikan sekarang

### 3.1 Routing (file-system)
`/dashboard/settings` **tidak punya folder sendiri**. Ia ditangkap oleh rute dinamis
`src/app/dashboard/[module]/page.tsx` dengan `module = 'settings'`, lalu dirender lewat
komponen yang sama dengan modul tabel lain:

```
src/app/dashboard/[module]/page.tsx
  → getModulePage('settings', filters)
  → <ModuleWorkspace module="settings" ... />
```

### 3.2 Data (`lib/data.ts`)
`getModulePage('settings')` mengembalikan payload "kosong yang dimodifikasi":

```ts
if (module === 'settings') {
  // ambil published + history ke-4 jenis template PDF
  return { ...base, filters:{...filters,page:1}, rows:[], total:0,
           page:1, pageCount:1, statusCounts:{}, templates };
}
```

Artinya `settings` meminjam bentuk `ModulePageData` yang dirancang untuk tabel
(`rows`, `total`, `pageCount`, `statusCounts`) padahal semuanya diisi nilai dummy.

### 3.3 Tulis (`app/actions.ts`)
`saveRecord(module='settings')` menangani **dua hal berbeda sekaligus** di satu cabang:
profil perusahaan (`company_settings`) **dan** editor template PDF (lewat
`saveTemplateDraft` / `publishTemplate` / `rollbackTemplate` yang terpisah).

### 3.4 UI (`components/module-workspace.tsx`)
`ModuleWorkspace` memuat cabang `module === 'settings'` yang besar (tab "Perusahaan" vs
"Template PDF"), form perusahaan dengan belasan field, dan kontrol template.

---

## 4. Dampak `/dashboard/settings` "dipisah sendiri" vs menjadi sub-path

Pertanyaan intinya: **apa pengaruh jika `/dashboard/settings` dipisah menjadi rute
sendiri** (seperti `/dashboard/users` dan `/dashboard/audit`)? Berikut analisis
per dimensi.

### 4.1 Routing & kebersihan kode — **dampak positif terbesar**
Saat ini `settings` mencemari tiga abstraksi yang seharusnya khusus "tabel data":

| Lapisan | Yang harus dihapus jika dipisah |
|---|---|
| `MODULE_SLUGS` | keluarkan `'settings'` dari daftar |
| `getModulePage()` | hapus cabang `if (module === 'settings')` (~12 baris) |
| `getFormOptions()` | hapus percabangan `settings` |
| `saveRecord()` | hapus `else if (module === 'settings')` + role mapping |
| `ModuleWorkspace` | keluarkan cabang render `module === 'settings'` ke komponen `SettingsWorkspace` sendiri |

Setelah dipisah, `[module]` hanya melayani modul tabel murni dan `getModulePage`
kembali koheren (selalu punya `rows`/pagination yang bermakna).

### 4.2 Otorisasi (RBAC) — **menutup celah exposure data**
Temuan penting: **pemisahan view vs write saat ini asimetris.**

- Halaman (`getModulePage`) hanya memanggil `requireUser()` **tanpa role** — semua
  peran (`admin`, `operations`, `operator`, `finance`) bisa MEMBUKA `/dashboard/settings`.
- Aksi tulis (`saveRecord`, template actions) menuntut `['admin']`.

Efeknya: role non-admin bisa **melihat** data sensitif perusahaan — NPWP, nomor KTP
penandatangan, nomor rekening bank — hanya di-disable input-nya (lihat
`canWrite` + `disabled={!canWrite}` di `module-workspace.tsx:442-456`).

Pola `/dashboard/users` & `/dashboard/audit` sudah lebih benar: guard admin di
**level halaman** (`if (data.user.role !== 'admin') return <AccessDenied />`).
Memisah `settings` memungkinkan guard serupa diterapkan konsisten.

### 4.3 Revalidasi cache — **konsistensi, bukan bug fatal**
Campuran dua strategi saat ini:

- Mutasi data operasional → `revalidatePath('/dashboard', 'layout')` (membersihkan shell).
- Mutasi template PDF → `revalidatePath('/dashboard/settings', 'page')`.
- Mutasi profil perusahaan (`saveRecord` settings) → ikut `revalidatePath('/dashboard','layout')` karena masuk jalur umum.

Karena `layout.tsx` memakai `dynamic='force-dynamic'`, revalidasi halaman berfungsi,
tetapi: `revalidatePath('/dashboard/settings','page')` **tidak** membersihkan cache
shell. Ini aman untuk template (template tidak tampil di shell), tapi **perlu
diwaspadai** — bila kelak ada data settings yang ikut dirender di shell dan hanya
di-revalidate per-page, topbar/help bisa tampil basi.

Satu rute sendiri dengan loader sendiri memudahkan menentukan scope revalidasi yang
tepat dan seragam.

### 4.4 Middleware / matcher Supabase — **tanpa perubahan jika tetap di `/dashboard/...`**
`src/proxy.ts` mencakup `/dashboard/:path*`, jadi `/dashboard/settings` sudah
terlindungi sesi. **Jika** dipindah ke `/settings` top-level, matcher WAJIB ditambah
`'/settings'` — kalau tidak, refresh sesi Supabase tidak berjalan dan halaman bisa
kelihatan "belum login". Ini argumen untuk **tetap memakai `/dashboard/settings`**
sebagai path, bukan `/settings`.

### 4.5 Navigasi aktif & breadcrumb — **minor**
`shell.tsx` menandai item aktif dengan `pathname.startsWith(n.path)`. Karena
`/dashboard/settings` tidak punya anak, tidak ada konflik. Namun perlu dicatat: ada
ambiguitas potensial — `/dashboard/settings` vs `/dashboard/setting` (typo) vs
`/dashboard/settingsX` semuanya akan cocok dengan `startsWith('/dashboard/settings')`.
Tidak kritis sekarang, tapi layak diberi batas.

### 4.6 Semantik URL & SEO — **netral (internal app)**
Aplikasi ini ruang kerja internal (di balik login), jadi SEO tidak relevan. Dari sisi
konvensi, `/dashboard/settings` (sub-path) konsisten dengan seluruh menu lain yang
berada di bawah `/dashboard`. Memisah ke `/settings` top-level justru melanggar
konvensi dan menambah kerja di matcher (lihat 4.4).

---

## 4A. Kenapa semua modul tetap di bawah prefix `/dashboard` (bukan `/invoices`, `/fleet`, dst.)

Pertanyaan lanjutan: apakah lebih baik URL modul **tanpa** `/dashboard`, mis. `/invoices`
langsung di root (seperti `/login`)? Jawaban untuk aplikasi ini: **tidak — pertahankan
`/dashboard/...`**. Prefix-nya bukan redundansi; ia menanggung tiga mekanisme inti secara
struktural.

### 4A.1 Layout shell dibagikan lewat satu segmen
`src/app/dashboard/layout.tsx` merender `Shell` (sidebar, topbar, notifikasi) untuk
**semua** anaknya otomatis. `/dashboard/invoices`, `/dashboard/fleet`, dst. mewarisi
layout ini tanpa deklarasi per halaman. Tanpa prefix, layout bersama harus lewat *route
group* (lihat 4A.5) yang tidak muncul di URL.

### 4A.2 Matcher sesi cukup satu glob
`src/proxy.ts`:
```ts
matcher: ['/dashboard/:path*', '/login', '/api/documents/:path*']
```
Satu pola `/dashboard/:path*` sudah mencakup refresh sesi Supabase untuk seluruh ruang
kerja. Jika prefix dibuang, matcher harus menyebut satu per satu
(`/fleet`, `/clients`, `/contracts`, `/timesheets`, `/bast`, `/invoices`, `/settings`,
`/users`, `/audit`) — lupa satu = halaman itu tidak me-refresh sesi → tampak "belum login".

### 4A.3 Invalidasi cache cukup satu panggilan
Hampir semua mutasi memanggil `revalidatePath('/dashboard', 'layout')` — sekali panggil
membersihkan cache shell (badge sidebar, data topbar) sekaligus. Tanpa prefix tidak ada
satu path yang bisa meng-invalidasi seluruh grup sekaligus, karena *route group* tidak
muncul di URL.

### 4A.4 Pemisahan publik vs privat jadi eksplisit
Halaman publik sudah di root: `/login`, `/forgot-password`, `/reset-password`, `/verify`,
`/auth/callback`. Prefix `/dashboard` memberi garis tegas: *semua di belakangnya = ruang
kerja ber-login*. Menaruh `/invoices` setara `/login` membuat pemisahan ini implisit
(hanya lewat route group) dan lebih mudah salah baca bagi kontributor baru.

### 4A.5 Alternatif `(dashboard)` route group — mungkin, tapi mahal
Next.js mendukung *route group* `(dashboard)` yang menjaga shared layout **tanpa** segmen
URL, sehingga URL jadi `/invoices`. Tapi ini kehilangan 4A.2 dan 4A.3, plus biaya migrasi
riil:

- `navigation[]` di `shell.tsx` (9 entri path),
- ~10 titik `revalidatePath('/dashboard', ...)`,
- `redirect('/dashboard')` di `signIn`, `src/app/page.tsx`, `src/app/auth/callback/route.ts`,
- `path` hasil `searchGlobal()` di `lib/data.ts`,
- `not-found.tsx`, link pratinjau di `login-form.tsx`,
- `redirectTo: .../auth/callback?next=/dashboard` di `inviteUser`.

Risikonya: satu referensi terlewat = link mati / halaman "belum login" — hanya demi URL
yang sedikit lebih pendek, tanpa nilai nyata untuk pengguna aplikasi internal.

### 4A.6 Kapan membuang `/dashboard` justru masuk akal
- Aplikasi jadi publik / SaaS multi-tenant di mana URL dibagikan (mis. `/invoices/INV-001`
  dilihat klien) dan estetika/SEO penting.
- Ada kebutuhan short link / deep link bersih yang sering disalin-tempel.

Untuk ruang kerja back-office internal seperti HeavyOps, konvensi `/dashboard/...` adalah
praktik umum (Laravel Nova, ActiveAdmin, Grafana) justru karena menyatukan layout, guard,
dan cache di satu namespace.

### 4A.7 Kesimpulan perbandingan

| | `/dashboard/invoices` | `/invoices` (route group) |
|---|---|---|
| Shared layout | otomatis | otomatis (via group) |
| Matcher auth | 1 glob | harus enumerate N rute |
| Revalidasi shell | 1 panggilan | harus per-halaman / root |
| Pemisahan publik-privat | eksplisit | implisit |
| Biaya migrasi | — | sedang-tinggi, rawan bocor |

**Rekomendasi: pertahankan `/dashboard/...`** untuk seluruh modul.

---

## 5. Temuan (findings)

| # | Temuan | Severity |
|---|---|---|
| F1 | **`settings` bukan "modul tabel" tapi diperlakukan seperti itu** — menimbulkan cabang khusus `if (module === 'settings')` di `data.ts`, `actions.ts`, dan `module-workspace.tsx`, plus payload `ModulePageData` berisi field dummy (`rows:[]`, `total:0`). | Medium (maintainability) |
| F2 | **Asimetri otorisasi**: halaman settings bisa dibuka semua role (view), padahal berisi PII sensitif (NPWP, KTP signer, rekening bank); guard admin hanya di sisi tulis. Bandingkan dengan `/dashboard/users` & `/dashboard/audit` yang guard di level halaman. | High (exposure data) |
| F3 | **Label menyesatkan**: menu profil menulis "Pengaturan akun" (`shell.tsx:172`) tapi menuju settings **perusahaan** (profil + template PDF). Tidak ada halaman pengaturan akun per-user yang sesungguhnya. | Low |
| F4 | **Revalidasi tidak seragam**: template PDF memakai `revalidatePath('/dashboard/settings','page')`, sisanya `revalidatePath('/dashboard','layout')`. Aman hari ini, tapi rapuh bila cakupan shell berubah. | Low |
| F5 | **Tidak ada alias/redirect untuk typo**: `/dashboard/setting`, `/setting`, `/settings`, `/dasboard` semua 404 tanpa arahan. Tidak ada masalah fungsional, hanya UX. | Low |
| F6 | **Dua konsep "settings" dalam satu modul**: profil perusahaan (`company_settings`) dan editor template PDF bercampur di satu halaman/`saveRecord`. Bila fitur "pengaturan akun per-user" ditambahkan kelak, akan bentrok. | Info (arsitektural) |

---

## 6. Rekomendasi

> Prioritas diurutkan berdasarkan dampak vs risiko. **Belum dieksekusi** (sesuai
> permintaan: tidak membuat PR dulu).

1. **(Sesuai F2, prioritas utama)** Terapkan guard admin di level halaman settings,
   selaras dengan `users`/`audit` — paling tidak tampilkan `<AccessDenied />` bagi
   non-admin, atau sembunyikan field PII (NPWP/KTP/rekening) dari role non-admin.

2. **(F1, refactor bersih)** Pisahkan `settings` menjadi rute statis
   `/dashboard/settings/page.tsx` + `getSettingsData()` + komponen `SettingsWorkspace`
   sendiri, meniru pola `users`/`audit`. Hapus `'settings'` dari `MODULE_SLUGS` dan
   seluruh cabang `module === 'settings'`.

3. **(F4)** Setelah dipisah, gunakan satu strategi revalidasi yang konsisten; pastikan
   data settings yang dirender di shell ikut ter-invalidasi bila diubah.

4. **(F5)** Tambahkan alias redirect (`/setting`, `/settings`, `/dasboard` →
   `/dashboard/settings` / `/dashboard`) hanya bila dianggap perlu.

5. **(F3, F6)** Rename label menu profil menjadi "Pengaturan" (bukan "Pengaturan akun"),
   dan rencanakan pemisahan konsep *company settings* vs *account settings* ke depan.

6. **Tetap pertahankan path `/dashboard/settings`** (jangan pindah ke `/settings`
   top-level) agar matcher proxy (`/dashboard/:path*`) dan konvensi navigasi tidak
   perlu diubah — kecuali ada alasan produk yang kuat. Ini berlaku umum: seluruh modul
   tetap di bawah prefix `/dashboard` (lihat §4A).

---

## 7. Peta berkas terkait (untuk eksekusi nanti)

| Berkas | Peran |
|---|---|
| `src/app/dashboard/[module]/page.tsx` | Rute dinamis yang saat ini menampung settings |
| `src/app/dashboard/layout.tsx` | Layout shell (`getShellData`) |
| `src/app/dashboard/users/page.tsx`, `audit/page.tsx` | Pola rute statis admin yang bisa ditiru |
| `src/lib/data.ts` | `MODULE_SLUGS`, `getModulePage`, `getShellData`, `getUsersData`, `getAuditData` |
| `src/app/actions.ts` | `saveRecord`, `saveTemplateDraft`, `publishTemplate`, `rollbackTemplate` |
| `src/components/module-workspace.tsx` | Cabang render `module === 'settings'` |
| `src/components/shell.tsx` | Navigasi + menu profil |
| `src/components/admin-workspace.tsx` | `AccessDenied`, pola workspace admin |
| `src/proxy.ts` | Matcher sesi Supabase `/dashboard/:path*` |
| `src/lib/auth.ts` | `requireUser`, `getCurrentUser` (dasar otorisasi) |
