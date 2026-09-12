-- =====================================================================
-- 0020 · TEMPLATE PDF DINAMIS (Pengaturan > Template PDF)
-- Dependensi: 0003 (current_app_role), 0004 (pola RLS).
-- Alasan: isi surat (pasal perjanjian, intro BAST, notes SPH/Invoice,
-- footer verifikasi) sebelumnya hardcoded di pdf-document.tsx /
-- route.ts. Tabel ini menyimpan template per jenis dokumen dengan
-- draft + publish + histori versi agar perubahan tidak butuh deploy.
-- BAST boleh 2+ halaman bila teks kustom panjang: render react-pdf
-- multi-page otomatis, footer fixed ulang tiap halaman.
-- =====================================================================

CREATE TABLE IF NOT EXISTS document_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('sph', 'bast', 'invoice', 'perjanjian')),
  version INTEGER NOT NULL CHECK (version >= 1),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  title TEXT NOT NULL DEFAULT '',
  content JSONB NOT NULL DEFAULT '{}',
  variables TEXT[] NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  UNIQUE (kind, version)
);

CREATE INDEX IF NOT EXISTS idx_doc_templates_kind_status
  ON document_templates (kind, status);

-- RLS selaras company_settings: baca seluruh role internal, tulis admin.
ALTER TABLE document_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS templates_staff_read ON document_templates;
CREATE POLICY templates_staff_read ON document_templates FOR SELECT TO authenticated
  USING (public.current_app_role() IN ('admin', 'operations', 'operator', 'finance'));

DROP POLICY IF EXISTS templates_admin_write ON document_templates FOR ALL TO authenticated
  USING (public.current_app_role() = 'admin')
  WITH CHECK (public.current_app_role() = 'admin');

-- Seed v1 published per jenis: struktur blok default, isi teks mengikuti
-- hardcoded saat ini di aplikasi (route mengisi fallback bila kosong).
INSERT INTO document_templates (kind, version, status, title, content, variables, published_at)
VALUES
  ('sph', 1, 'published', 'Surat Penawaran Harga',
   '{"intro": "Dengan hormat, kami menyampaikan penawaran harga sewa alat berat dengan rincian dan ketentuan sebagai berikut:", "notes": "Tarif belum termasuk PPN. Penagihan berdasarkan jam kerja efektif yang telah disetujui. Mobilisasi, bahan bakar, operator, dan ketentuan pembayaran mengikuti kesepakatan dalam kontrak sewa."}',
   '{nomor_dokumen,nama_klien,tanggal_dokumen,periode_sewa,tarif_per_jam}', NOW()),
  ('bast', 1, 'published', 'Berita Acara Serah Terima',
   '{"intro_mobilisasi": "Dengan ini para pihak menyatakan telah melaksanakan pemeriksaan dan serah terima unit alat berat dengan rincian sebagai berikut:", "intro_demobilisasi": "Dengan ini para pihak menyatakan telah melaksanakan pemeriksaan dan pengembalian unit alat berat dengan rincian sebagai berikut:", "notes": "Para pihak telah memeriksa unit bersama-sama. Kondisi unit sesuai hasil pemeriksaan yang tercantum dalam berita acara ini."}',
   '{nomor_dokumen,nama_klien,tanggal_dokumen,daftar_checklist}', NOW()),
  ('invoice', 1, 'published', 'Faktur Tagihan',
   '{"intro": "Bersama ini kami sampaikan tagihan sewa alat berat sesuai dengan kontrak dan rincian pekerjaan berikut:", "notes": "Pembayaran dilakukan sesuai kesepakatan dalam kontrak sewa. Cantumkan nomor tagihan pada bukti pembayaran dan sampaikan konfirmasi kepada bagian keuangan."}',
   '{nomor_dokumen,nama_klien,tanggal_dokumen,jatuh_tempo,total_tagihan}', NOW()),
  ('perjanjian', 1, 'published', 'Surat Perjanjian Sewa',
   '{"pasal_1": "PIHAK PERTAMA menyewakan kepada PIHAK KEDUA satu unit alat berat sebagaimana tercantum dalam spesifikasi.", "pasal_2": "Jangka waktu sewa sebagaimana tercantum dalam periode kontrak; perpanjangan mengikuti amandemen kontrak.", "pasal_3": "Harga sewa per jam sebagaimana tercantum, belum termasuk PPN; pembayaran via transfer bank perusahaan.", "pasal_4": "PIHAK KEDUA wajib memakai, merawat, dan mengembalikan unit dalam kondisi baik.", "pasal_5": "Kerusakan/kehilangan akibat kelalaian menjadi tanggung jawab PIHAK KEDUA.", "pasal_6": "Sengketa diselesaikan secara musyawarah; bila gagal, diajukan ke Pengadilan Negeri setempat."}',
   '{kota,nama_signer,jabatan_signer,nama_pic_klien,periode_sewa,tarif_per_jam}', NOW())
ON CONFLICT (kind, version) DO NOTHING;
