-- =====================================================================
-- 0012 · Lampiran foto BAST + bucket Storage privat
-- Dependensi: 0002 (handovers), 0003 (current_app_role).
-- Alasan: BAST tanpa bukti foto lemah saat sengketa kondisi unit
-- (audit A13 / ui-audit A-3). Path file disimpan di handovers.photo_urls;
-- berkasnya di bucket privat `bast-photos` (akses via signed URL).
-- =====================================================================

ALTER TABLE handovers
 ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}';

INSERT INTO storage.buckets (id, name, public)
VALUES ('bast-photos', 'bast-photos', false)
ON CONFLICT (id) DO NOTHING;

-- Baca: seluruh role internal. Tulis: role yang boleh membuat BAST.
CREATE POLICY bast_photo_read ON storage.objects FOR SELECT TO authenticated
 USING (bucket_id = 'bast-photos'
  AND public.current_app_role() IN ('admin','operations','operator','finance'));
CREATE POLICY bast_photo_write ON storage.objects FOR INSERT TO authenticated
 WITH CHECK (bucket_id = 'bast-photos'
  AND public.current_app_role() IN ('admin','operations','operator'));
CREATE POLICY bast_photo_delete ON storage.objects FOR DELETE TO authenticated
 USING (bucket_id = 'bast-photos'
  AND public.current_app_role() IN ('admin','operations'));
