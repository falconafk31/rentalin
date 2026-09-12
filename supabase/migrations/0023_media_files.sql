-- =====================================================================
-- 0023 · media_files — metadata media layer (binary di Cloudflare R2)
-- Dependensi: 0001 (profiles, fleet), 0003 (current_app_role), 0004 (pola RLS).
-- Alasan: foto unit alat berat (cover + galeri fleet) disimpan sebagai
-- binary di Cloudflare R2; tabel ini hanya metadata + status object.
-- Binary TIDAK PERNAH masuk PostgreSQL/Supabase Storage
-- (docs/media-architecture.md — prinsip: "PostgreSQL knows what the file
-- represents. R2 stores the file. Worker controls access.").
--
-- Keputusan implementasi (audit repo, 12 Sep 2026 — lihat
-- docs/media-architecture.md §52):
--  * entity_type='bast' sudah diresevasi pada skema (persiapan fase
--    berikutnya), NAMUN foto BAST yang sudah berjalan tetap dilayani
--    bucket Supabase Storage `bast-photos` (migration 0012) dan TIDAK
--    dimigrasikan oleh perubahan ini — tanpa regresi pada fitur BAST.
--  * entity_id sengaja TANPA foreign key: satu kolom diskriminan yang
--    dapat menunjuk fleet.id maupun handovers.id. Integritas relasi
--    bisnis tetap berada di tabel bisnis (fleet.id, handovers.id, dst.).
--  * object_key = `{entity_type}/{entity_id}/{category}/{media_id}.{ext}`
--    (randomized media ID — filename asli hanya metadata, doc §28).
-- =====================================================================

CREATE TABLE IF NOT EXISTS media_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('fleet', 'bast')),
  entity_id UUID NOT NULL,
  category TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes BIGINT NOT NULL CHECK (size_bytes > 0),
  width INTEGER,
  height INTEGER,
  original_name TEXT,
  -- pending → active (lifecycle upload; doc §18) — row pending/failed yang
  -- tak terselesaikan adalah kandidat reconciler/cleanup (index di bawah).
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'failed', 'deleted')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Pair entity↔category tervalidasi di DB (doc §10): server-side, bukan
  -- hanya di Worker — Data API tidak bisa menulis pair yang tak dikenal.
  CONSTRAINT media_files_category_valid CHECK (
    (entity_type = 'fleet' AND category IN ('cover', 'gallery'))
    OR (entity_type = 'bast' AND category IN ('engine', 'hydraulics', 'tracks', 'general'))
  )
);

-- Index minimal sesuai docs/media-architecture.md §25 (entity_type +
-- entity_id); kolom ketiga `category` menutupi lookup cover/galeri tanpa
-- index terpisah (prefix (entity_type, entity_id) tetap terpakai).
CREATE INDEX IF NOT EXISTS idx_media_files_entity
  ON media_files (entity_type, entity_id, category);

-- Reconciliation/cleanup orphan: baris pending/failed yang menua.
CREATE INDEX IF NOT EXISTS idx_media_files_status
  ON media_files (status, created_at);

-- RLS selaras pola tabel internal (0004/0012/0020): baca seluruh role
-- internal; tulis role yang boleh membuat/mengubah fleet; hapus
-- admin/operations. (Koneksi aplikasi via Postgres langsung mem-bypass RLS;
-- kebijakan ini menjaga akses lewat Supabase Data API yang dipakai Worker.)
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS media_files_read ON media_files;
CREATE POLICY media_files_read ON media_files FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('admin', 'operations', 'operator', 'finance'));

DROP POLICY IF EXISTS media_files_insert ON media_files;
CREATE POLICY media_files_insert ON media_files FOR INSERT TO authenticated
  WITH CHECK (public.current_app_role() IN ('admin', 'operations', 'operator'));

DROP POLICY IF EXISTS media_files_update ON media_files;
CREATE POLICY media_files_update ON media_files FOR UPDATE TO authenticated
  USING (public.current_app_role() IN ('admin', 'operations', 'operator'))
  WITH CHECK (public.current_app_role() IN ('admin', 'operations', 'operator'));

DROP POLICY IF EXISTS media_files_delete ON media_files;
CREATE POLICY media_files_delete ON media_files FOR DELETE TO authenticated
  USING (public.current_app_role() IN ('admin', 'operations'));
