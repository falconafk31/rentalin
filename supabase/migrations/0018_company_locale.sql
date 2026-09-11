-- =====================================================================
-- 0018 · LOKALISASI DOKUMEN: KOTA PENANDATANGANAN + ZONA WAKTU
-- Mengikuti format dokumen resmi (baris "Kota, tanggal" di atas tanda
-- tangan surat perjanjian/berita acara) dan kebutuhan perusahaan di
-- Indonesia tengah/timur (WITA/WIT) agar perhitungan "hari ini"
-- (badge jatuh tempo, validasi form, tanggal dokumen) memakai kalender
-- lokal, bukan selalu kalender WIB.
-- Aditif & aman (pola 0009).
-- =====================================================================

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT 'Jakarta';
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'WIB';

DO $$ BEGIN
  ALTER TABLE company_settings ADD CONSTRAINT company_settings_timezone_check CHECK (timezone IN ('WIB','WITA','WIT'));
EXCEPTION
  WHEN duplicate_object THEN NULL; -- idempoten: constraint sudah ada
END $$;
