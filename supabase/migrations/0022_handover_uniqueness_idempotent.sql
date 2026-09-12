-- =====================================================================
-- 0022 · Guard idempoten untuk unique constraint BAST (contract_id, type)
-- Dependensi: 0021 (constraint handovers_contract_type_unique).
-- Alasan: 0021 gagal dengan 42P07 bila di-rerun setelah eksekusi parsial
-- (constraint sudah terbuat tapi migrasi dianggap belum selesai). Pola ini
-- mengikuti 0016: DO-block dengan EXCEPTION WHEN duplicate_object.
-- Aman di-rerun; tanpa perubahan data.
-- =====================================================================

DO $$ BEGIN
  ALTER TABLE handovers
    ADD CONSTRAINT handovers_contract_type_unique
    UNIQUE (contract_id, type);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
