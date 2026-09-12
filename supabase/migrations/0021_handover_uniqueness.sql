-- =====================================================================
-- 0021 · Bersihkan duplikat BAST + unique constraint (contract_id, type)
-- Dependensi: 0002 (tabel handovers), 0006 (kolom checklist).
-- Alasan: Validasi server sejak awal mencegah duplikat, tapi data lama
-- (sebelum validasi) bisa punya mobilisasi ganda. Desain final:
-- 1 mobilisasi + 1 demobilisasi per kontrak (maks 2 baris).
-- Revisi via UPDATE, bukan INSERT baru.
-- =====================================================================

-- Hapus duplikat mobilisasi: simpan 1 tertua per contract_id, hapus sisanya.
-- CTE identifikasi ID yang aman (created_at paling lama).
WITH keep AS (
  SELECT DISTINCT ON (contract_id, type)
    id
  FROM handovers
  WHERE type = 'mobilization'
  ORDER BY contract_id, type, created_at ASC
)
DELETE FROM handovers
WHERE type = 'mobilization'
  AND id NOT IN (SELECT id FROM keep);

-- Hapus duplikat demobilisasi (preventif, tidak seharusnya ada).
WITH keep AS (
  SELECT DISTINCT ON (contract_id, type)
    id
  FROM handovers
  WHERE type = 'demobilization'
  ORDER BY contract_id, type, created_at ASC
)
DELETE FROM handovers
WHERE type = 'demobilization'
  AND id NOT IN (SELECT id FROM keep);

-- Tambah unique constraint agar ganda mustahil di level DB.
ALTER TABLE handovers
  ADD CONSTRAINT handovers_contract_type_unique
  UNIQUE (contract_id, type);
