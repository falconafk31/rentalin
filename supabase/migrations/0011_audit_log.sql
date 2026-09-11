-- =====================================================================
-- 0011 · Audit log: jejak siapa-mengubah-apa (append-only)
-- Dependensi: 0001 (profiles, untuk bacaan manusia via actor_name).
-- Alasan: ERP keuangan wajib punya bukti sengketa (audit A7 / ui-audit A-5).
-- Ditulis oleh Server Actions setiap ada create/update/status/payment/revisi.
-- Tanpa FK ke profiles agar baris log tetap utuh walau akun dihapus.
-- =====================================================================

CREATE TABLE audit_log (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_id UUID,
 actor_name TEXT NOT NULL DEFAULT 'Sistem',
 action TEXT NOT NULL,
 entity TEXT NOT NULL,
 entity_id TEXT,
 summary TEXT NOT NULL,
 before_data JSONB,
 after_data JSONB,
 created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity, entity_id);

-- Append-only: admin boleh baca; staf boleh menambah (sesuai perilaku
-- Server Actions); TIDAK ADA policy update/delete = tidak bisa diubah/hapus.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_admin_read ON audit_log FOR SELECT TO authenticated
 USING (public.current_app_role() = 'admin');
CREATE POLICY audit_staff_insert ON audit_log FOR INSERT TO authenticated
 WITH CHECK (public.current_app_role() IN ('admin','operations','operator','finance'));
