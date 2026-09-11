-- =====================================================================
-- 0019 · DATA PEMBAYARAN & IDENTITAS DOKUMEN
-- Melengkapi komponen artikel "Surat Perjanjian Sewa Alat Berat"
-- (rujukan Mekari Sign) yang sebelumnya belum terotomasi:
--   • Rekening bank perusahaan (nama bank, a.n., no. rekening)
--     → PASAL 3 Surat Perjanjian + catatan pembayaran invoice.
--   • NPWP perusahaan → blok identitas PIHAK PERTAMA.
--   • No. KTP penandatangan (PIHAK PERTAMA) & KTP PIC klien
--     (PIHAK KEDUA) → blok identitas para pihak perjanjian.
-- Aditif & aman (pola 0009/0018): default kosong, idempoten.
-- =====================================================================

ALTER TABLE company_settings
 ADD COLUMN IF NOT EXISTS npwp text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS signer_ktp text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS bank_name text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS bank_account_name text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS bank_account_number text NOT NULL DEFAULT '';

ALTER TABLE clients ADD COLUMN IF NOT EXISTS pic_ktp text;
