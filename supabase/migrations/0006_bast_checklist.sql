-- =====================================================================
-- 0006 · BAST checklist lengkap: 9 kolom boolean tambahan
-- Dependensi: 0002 (tabel handovers).
-- Alasan: BAST awal hanya 3 titik (engine/hydraulics/tracks).
-- Referensi sewa alat berat: oli, BBM, aki, lampu, rem, bucket,
-- kabin/ROPS, APAR & P3K, SIKO/STNK. Kolom baru NOT NULL DEFAULT TRUE
-- agar baris lama tetap valid.
-- =====================================================================

ALTER TABLE handovers
 ADD COLUMN oil BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN fuel BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN battery BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN lights BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN brakes BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN bucket BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN cabin BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN safety BOOLEAN NOT NULL DEFAULT TRUE,
 ADD COLUMN documents BOOLEAN NOT NULL DEFAULT TRUE;
