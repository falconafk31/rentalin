# Topik 2 — Konsistensi Form & List Antar Modul

> Semua modul (fleet/clients/contracts/timesheets/bast/invoices) sudah memakai **satu**
> komponen `ModuleWorkspace` + `RecordModal` — jadi kerangka dasarnya memang sama. Tapi ada
> beberapa titik di mana tiap modul menyimpang dari pola yang sama, sehingga terasa "hampir
> seragam" bukan "seragam". Sumber: `src/components/module-workspace.tsx`.

## Temuan

| # | Ketidakkonsistenan | Bukti | Kenapa masalah |
|---|---|---|---|
| K1 | **Blok ringkasan di atas tabel beda bentuk & perilaku per modul.** `fleet` pakai `.module-stats` — 4 kartu **berupa tombol** yang jadi filter status kedua (duplikat dengan tab di bawahnya). `invoices` pakai `.invoice-stats` — markup & CSS class berbeda, 3 kartu **statis** (tidak bisa diklik). Modul lain (clients, contracts, bast) tidak punya ringkasan sama sekali; `timesheets` cuma satu baris `info-callout`. | `module-workspace.tsx` baris ~340 (fleet), ~356 (invoices), ~363 (timesheets) | 3 pola berbeda (klik-filter / statis / tidak ada) untuk "hal yang sama" (ringkasan angka di atas list) — user harus belajar ulang tiap buka modul berbeda. |
| K2 | **Fleet punya 2 cara memfilter status yang identik**: kartu `.module-stats` di atas DAN tab status di bawah — keduanya memanggil `navigate({status})` yang sama persis. | `module-workspace.tsx` (kartu fleet vs `table-tabs`) | Redundan — bukan cuma tidak konsisten dengan modul lain, tapi juga duplikat kontrol di modul yang sama. |
| K3 | **Filter kategori (`small-select`) di-hardcode hanya untuk `module==='fleet'`**, bukan pola generik "tampilkan filter bila modul punya `categoryOptions`". | `module-workspace.tsx` toolbar (`{module === 'fleet' && ...}`) | Kalau modul lain nanti butuh filter kategori (mis. kontrak by jenis alat), harus ditulis ulang dari nol, bukan tinggal pakai ulang. |
| K4 | **Helper teks bantuan field opsional (`<small className="cell-sub">...</small>`) cuma ada di form Pengaturan**, form modal modul lain (fleet/clients/kontrak/dll) tidak punya pola ini sama sekali — field opsional di sana polos tanpa keterangan. | `module-workspace.tsx` (blok Pengaturan vs blok modal per-modul) | Dua konvensi berbeda untuk "field opsional dengan konteks tambahan" — pengguna dapat pengalaman berbeda tergantung modul mana yang dibuka. |
| K5 | **Sebagian field pakai helper `field()` (konsisten), sebagian ditulis manual berulang** (select, textarea, dan beberapa input custom) dengan markup `<label className="form-field">` yang disalin-tempel per modul. | `module-workspace.tsx` (banyak titik) | Bukan bug visual sekarang (hasilnya kebetulan sama), tapi resiko drift ke depan: kalau `field()` diubah/ditambah fitur (mis. tooltip), field manual tidak ikut ter-update otomatis. |
| K6 | **Label tombol submit** ditentukan lewat rantai ternary panjang langsung di JSX (`pending ? '...' : module==='timesheets' ? '...' : ...`), bukan dari `config` map di atas (yang sudah dipakai untuk `title`/`description`/`add`/`singular`). | `module-workspace.tsx` (form-footer) | Menambah/mengubah 1 modul berarti mengedit rantai ternary yang sama, bukan menambah 1 baris ke config — makin banyak modul makin rawan salah. |
| K7 | **`clients` tidak punya tab status** (karena `tableMeta.clients.statuses=[]`) sehingga hanya tab "Semua" yang tampil — secara struktur benar (klien memang tidak berstatus), tapi secara visual list klien terlihat "kurang lengkap" dibanding modul lain yang selalu punya beberapa tab. | `tableMeta` di `module-workspace.tsx` | Bukan bug, tapi perlu didokumentasikan sebagai keputusan desain, bukan dibiarkan terlihat seperti kelalaian. |

## Saran penyeragaman (agar "list dibuat sama semua secara global")

| # | Saran | Menyelesaikan | Effort |
|---|---|---|---|
| G1 | Buat **satu komponen `ModuleSummary`** dengan 1 varian visual (kartu, klik = filter opsional lewat prop `onFilter?`), lalu pakai itu di fleet & invoices (hapus `.invoice-stats` custom). Modul tanpa data ringkasan cukup tidak me-render komponennya — bukan bikin pola baru. | K1 | 0.5–1 hari |
| G2 | Fleet: hapus kartu `.module-stats` yang duplikat dengan tab status, **atau** hapus tab status dan pertahankan kartu saja — pilih satu, jangan dua-duanya. | K2 | 1–2 jam |
| G3 | Generalisasi filter kategori: render `small-select` bila `data.categoryOptions?.length`, bukan `module==='fleet'` secara eksplisit. | K3 | 30 menit |
| G4 | Standarkan `field()` agar menerima `hint?: string` opsional (dirender sebagai `.cell-sub` bila diisi), pakai di seluruh modul termasuk Pengaturan — satu konvensi untuk semua field opsional. | K4 | 2–3 jam |
| G5 | Audit ulang semua blok form manual, migrasikan yang mungkin ke `field()` (untuk select/textarea juga, bisa extend helper jadi `field()`+`selectField()`+`textareaField()`). | K5 | 0.5–1 hari |
| G6 | Pindahkan label tombol submit ke `config` map (tambah key `submitLabel` per modul, fallback default `'Simpan Data'`). | K6 | 1 jam |
| G7 | Tambah 1 baris catatan desain di README/CONTRIBUTING: "modul tanpa status (spt Klien) sengaja hanya tampilkan tab Semua — bukan bug" agar tidak "diperbaiki" keliru di masa depan. | K7 | 10 menit |

## Prinsip untuk modul baru ke depan
Kalau nanti nambah modul ke-7/ke-8: pakai `ModuleSummary` (G1) + filter kategori generik (G3) +
`field()` yang sudah di-extend (G5) + `submitLabel` di `config` (G6) — modul baru otomatis
seragam tanpa perlu menulis ulang pola dari nol.
