-- =====================================================================
-- SEED · Baris awal pengaturan perusahaan (kop surat dokumen PDF)
-- Jalankan SETELAH semua migrations, SEBELUM go-live.
-- Setelah itu, data ini diedit lewat modul Pengaturan di aplikasi
-- (oleh role admin) — bukan lewat SQL lagi.
-- =====================================================================

INSERT INTO company_settings (id, company_name, address, email, phone)
VALUES (
  'main',
  'PT Penyewaan Alat Berat',
  'Jl. Jenderal Sudirman No. 28, Jakarta Selatan 12190',
  'operasional@heavyops.id',
  '+62 21 555 0128'
)
ON CONFLICT (id) DO NOTHING;
