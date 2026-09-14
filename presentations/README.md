# HeavyOps — Tur Produk & Fitur (Video + Presentasi)

Presentasi/video tur produk **HeavyOps** (repositori ini) yang seluruh mockup-nya
diambil langsung dari aplikasi yang berjalan (tanpa mengubah kode apa pun):
aplikasi dijalankan dalam mode pratinjau lokal, data dummy di-seed otomatis oleh
`src/db/seed.ts`, lalu setiap halaman di-screenshot 1920×1080 dan dinarasikan
dengan voice over Bahasa Indonesia.

## Isi

| Berkas | Keterangan |
|---|---|
| `heavyops-tur-produk.mp4` | Video tur final — 13 segmen, 1920×1080 H.264 + AAC, durasi ±5 menit 28 detik. |
| `index.html` | Presentasi interaktif (13 slide): narasi audio per slide, subtitle teks sama persis dengan voice over, mode putar otomatis, navigasi keyboard/tombol. |
| `shots/` | Screenshot asli aplikasi (login, dasbor, armada, klien, kontrak, BAST, timesheet, invoice, pengaturan, pengguna, audit, verifikasi publik) + slide cover/penutup. |
| `audio/` | Klip narasi per slide (Bahasa Indonesia). |

## Menjalankan presentasi interaktif

```sh
cd presentations && python3 -m http.server 8080
# buka http://localhost:8080
```

## Urutan slide & sinkronisasi

Naskah setiap slide menyebut angka yang benar-benar tampil pada screenshot
(mis. 24 unit armada, 18 kontrak aktif, PPN 11%, total tagihan
Rp 1.081.500.000) sehingga isi dan voice over selalu sesuai dengan mockup kode.
