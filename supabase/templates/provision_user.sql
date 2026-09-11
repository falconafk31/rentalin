-- =====================================================================
-- TEMPLATE · Provisioning 1 pengguna internal (auth + profile)
-- Salin file ini per pengguna, isi bagian <...>, lalu jalankan.
-- Public signup MATI di produksi — satu-satunya jalan masuk adalah
-- provisioning eksplisit oleh admin.
-- =====================================================================

-- ── LANGKAH 1: buat user di Supabase Auth ─────────────────────────────
-- Pilihan A (Dashboard): Authentication → Users → "Add user"
--   isi email + password sementara, centang "Auto Confirm User",
--   lalu SALIN UUID yang dihasilkan.
--
-- Pilihan B (SQL editor, butuh service role / akses admin):
--   SELECT id FROM auth.users WHERE email = '<email>';  -- ambil UUID

-- ── LANGKAH 2: pasangkan profil & role aplikasi ───────────────────────
INSERT INTO public.profiles (id, full_name, role)
VALUES (
  '<UUID_USER>',            -- UUID dari auth.users (langkah 1)
  '<Nama Lengkap>',         -- tampil di UI & dokumen PDF
  '<admin|operations|operator|finance>'
)
ON CONFLICT (id) DO UPDATE
SET full_name = EXCLUDED.full_name,
    role      = EXCLUDED.role;

-- ── LANGKAH 3: verifikasi ─────────────────────────────────────────────
SELECT p.id, p.full_name, p.role, u.email
FROM public.profiles p JOIN auth.users u ON u.id = p.id
WHERE p.id = '<UUID_USER>';

-- Contoh role mapping (lihat matriks di README):
--   admin       → akses penuh + pengaturan perusahaan
--   operations  → armada, klien, kontrak, BAST, approval timesheet
--   operator    → input timesheet miliknya saja (read-only lainnya)
--   finance     → invoice & pelunasan

-- ── Nonaktifkan / aktifkan akun (tanpa service key, via SQL editor) ──────
-- Nonaktifkan — pengguna tak bisa login hingga ban dicabut:
--   UPDATE auth.users SET banned_until = now() + interval '100 years'
--   WHERE id = '<UUID_USER>';
-- Aktifkan kembali:
--   UPDATE auth.users SET banned_until = NULL WHERE id = '<UUID_USER>';
