-- =====================================================================
-- 0007 · Riwayat revisi kontrak (amandemen)
-- Dependensi: 0001 (contracts, fleet, profiles).
-- Alasan: koreksi periode / tarif / unit kontrak aktif harus tercatat
-- sebagai nomor revisi + alasan, bukan update diam-diam. Tarif baru
-- hanya berlaku untuk jam belum tertagih (invoice lama tidak berubah).
-- =====================================================================

CREATE TABLE contract_revisions (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
 revision_number INTEGER NOT NULL CHECK (revision_number >= 1),
 reason TEXT NOT NULL,
 changed_by UUID REFERENCES profiles(id),
 prev_start_date DATE NOT NULL,
 new_start_date DATE NOT NULL,
 prev_end_date DATE NOT NULL,
 new_end_date DATE NOT NULL,
 prev_rate DECIMAL(12,2) NOT NULL CHECK (prev_rate > 0),
 new_rate DECIMAL(12,2) NOT NULL CHECK (new_rate > 0),
 prev_unit_id UUID NOT NULL REFERENCES fleet(id) ON DELETE RESTRICT,
 new_unit_id UUID NOT NULL REFERENCES fleet(id) ON DELETE RESTRICT,
 created_at TIMESTAMPTZ DEFAULT NOW(),
 CHECK (new_end_date >= new_start_date),
 UNIQUE(contract_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_revisions_contract ON contract_revisions(contract_id);

-- RLS selaras contracts: baca seluruh role internal, tulis admin & operations.
-- Dependensi: 0003 (current_app_role), 0004 (pola policy).
ALTER TABLE contract_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY staff_read ON contract_revisions FOR SELECT TO authenticated
 USING (public.current_app_role() IN ('admin','operations','operator','finance'));
CREATE POLICY operations_write ON contract_revisions FOR ALL TO authenticated
 USING (public.current_app_role() IN ('admin','operations'))
 WITH CHECK (public.current_app_role() IN ('admin','operations'));
