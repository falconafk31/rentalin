-- =====================================================================
-- 0027 · SIKLUS HIDUP BAST + SNAPSHOT HISTORIS
-- Dependensi: 0002 (handovers), 0006 (checklist), 0021/0022 (unique (contract_id, type)).
--
-- Alasan (audit M4 — temuan F1 & F2):
-- 1. F1: BAST tidak punya status, sehingga dokumen yang sudah diserahkan
--    masih bisa diubah tanpa batas dan tanpa jejak. Kini `draft` -> `final`
--    satu arah; setelah `final` seluruh isi & snapshot beku (dijaga Server
--    Action, lihat src/app/actions.ts).
-- 2. F2: PDF BAST membaca kontrak/klien/unit LIVE, sehingga revisi kontrak
--    mengubah dokumen historis (unit/tarif/klien ikut berubah). Snapshot
--    dibekukan saat BAST dibuat dan dipakai PDF.
--
-- FAIL-CLOSED (pola M1.3 migrasi 0026): baris lama TIDAK di-backfill dari
-- nilai live. Nama klien/unit/tarif saat migrasi dijalankan belum tentu sama
-- dengan keadaan saat BAST dibuat; lebih baik PDF menampilkan
-- "Data historis tidak tersedia" daripada memalsukan bukti serah terima.
-- Snapshot NULL hanya boleh terisi ke depan (saat create BAST).
--
-- Aman di-rerun (ADD COLUMN IF NOT EXISTS + EXCEPTION duplicate_object).
-- =====================================================================

-- 1. Status siklus hidup. Default 'draft' untuk baris lama maupun baru.
--    Baris lama dipromosikan ke 'final' secara EKSPLISIT oleh
--    admin/operations setelah diperiksa — bukan otomatis oleh migrasi,
--    agar tidak mengklaim finalisasi yang tidak pernah dilakukan.
ALTER TABLE handovers
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

DO $$ BEGIN
  ALTER TABLE handovers
    ADD CONSTRAINT handovers_status_valid CHECK (status IN ('draft','final'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Snapshot historis. Nullable supaya baris lama tetap valid tanpa
--    mengarang data (fail-closed).
ALTER TABLE handovers
  ADD COLUMN IF NOT EXISTS client_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS unit_code_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS unit_model_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS rate_at_handover DECIMAL(12,2);

-- Tarif snapshot mengikuti aturan contracts.rate_per_hour > 0 (migrasi M3):
-- 0 / negatif bukan tarif yang sah, jadi tunduk pada fail-closed (NULL).
DO $$ BEGIN
  ALTER TABLE handovers
    ADD CONSTRAINT handovers_rate_at_handover_positive
    CHECK (rate_at_handover IS NULL OR rate_at_handover > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Index bantu: penyaringan siklus hidup (modul BAST / audit internal).
CREATE INDEX IF NOT EXISTS handovers_status_idx ON handovers(status);

-- 4. Dokumentasi kolom (rujukan langsung dari Drizzle/schema.ts).
COMMENT ON COLUMN handovers.status IS
  'Siklus hidup satu arah: draft -> final. Setelah final seluruh isi & snapshot immutable (dijaga Server Action).';
COMMENT ON COLUMN handovers.client_name_snapshot IS
  'Nama klien dibekukan saat BAST dibuat. NULL = warisan pra-0027 (fail-closed, jangan diisi dari nilai live).';
COMMENT ON COLUMN handovers.unit_code_snapshot IS
  'Kode unit dibekukan saat BAST dibuat. NULL = warisan pra-0027 (fail-closed).';
COMMENT ON COLUMN handovers.unit_model_snapshot IS
  'Merek/model unit dibekukan saat BAST dibuat. NULL = warisan pra-0027 (fail-closed).';
COMMENT ON COLUMN handovers.rate_at_handover IS
  'Snapshot contracts.rate_per_hour saat BAST dibuat; revisi kontrak tidak mengubahnya. NULL = warisan pra-0027 (fail-closed).';

-- =====================================================================
-- VERIFIKASI PASCA-MIGRASI (non-destruktif, tanpa perubahan data)
-- =====================================================================
DO $$
DECLARE
  total INTEGER;
  drafts INTEGER;
  legacy_missing_snapshot INTEGER;
BEGIN
  SELECT COUNT(*) INTO total FROM handovers;
  SELECT COUNT(*) INTO drafts FROM handovers WHERE status = 'draft';
  SELECT COUNT(*) INTO legacy_missing_snapshot
    FROM handovers WHERE client_name_snapshot IS NULL;

  IF total > 0 AND drafts = total THEN
    RAISE NOTICE '0027: % baris BAST berstatus draft — finalisasi dilakukan eksplisit oleh admin/operations.', total;
  END IF;

  IF legacy_missing_snapshot > 0 THEN
    RAISE NOTICE '0027: % baris warisan tanpa snapshot historis (tetap NULL; PDF menampilkan pesan aman).', legacy_missing_snapshot;
  END IF;

  RAISE NOTICE '0027 SELESAI. Snapshot bukan hasil backfill; kolom NULL = tidak terbukti secara historis.';
END $$;
