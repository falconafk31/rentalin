-- =====================================================================
-- 0008 · Nama & jabatan penandatangan dokumen (company_settings)
-- Dependensi: 0002 (tabel company_settings).
-- Alasan: blok tanda tangan PDF (SPH/BAST/Invoice) kini menampilkan nama
-- penandatangan pihak perusahaan. Sisi vendor memakai dua kolom baru ini;
-- sisi klien memakai kolom clients.pic_name yang sudah ada.
-- Default '' = kolom boleh kosong; PDF tetap menampilkan label "Nama dan
-- tanda tangan" bila belum diisi.
-- =====================================================================

ALTER TABLE company_settings
 ADD COLUMN IF NOT EXISTS signer_name TEXT NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS signer_title TEXT NOT NULL DEFAULT '';
