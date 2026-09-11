-- =====================================================================
-- 0009 · Konfigurasi perusahaan: tarif PPN + ambang peringatan dokumen
-- Dependensi: 0002 (tabel company_settings).
-- Alasan: tarif PPN sebelumnya hardcode 11% di Server Action, PDF, dan UI
-- (audit K6 / ui-audit D-2). Kini jadi kolom pengaturan yang bisa diubah
-- admin lewat modul Pengaturan — TANPA deploy ulang.
-- Catatan penting: tarif baru hanya berlaku untuk invoice yang diterbitkan
-- SETELAH perubahan; invoice lama menyimpan nominal pajaknya sendiri.
-- =====================================================================

ALTER TABLE company_settings
 ADD COLUMN IF NOT EXISTS ppn_rate NUMERIC(5,2) NOT NULL DEFAULT 11
  CHECK (ppn_rate >= 0 AND ppn_rate <= 100),
 ADD COLUMN IF NOT EXISTS expiry_warning_days INTEGER NOT NULL DEFAULT 30
  CHECK (expiry_warning_days >= 1 AND expiry_warning_days <= 180);
