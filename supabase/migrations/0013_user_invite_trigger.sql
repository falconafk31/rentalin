-- =====================================================================
-- 0013 · Profil otomatis untuk user undangan (Supabase Auth → profiles)
-- Dependensi: 0001 (profiles).
-- Alasan: mendukung fitur "Undang Pengguna" di UI (ui-audit A-4/A-6).
-- Admin mengundang via email; saat undangan diterima, trigger ini membuat
-- baris profiles dari metadata undangan. AMAN dari eskalasi role:
-- role dari metadata HANYA dipakai bila baris auth berasal dari undangan
-- (invited_at terisi); pendaftar mandiri selalu jadi 'operator'.
-- (Public signup tetap disarankan MATI — lihat provision_user.sql.)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
 wanted_role TEXT := COALESCE(NEW.raw_user_meta_data->>'role', 'operator');
BEGIN
 IF NEW.invited_at IS NULL THEN wanted_role := 'operator'; END IF;
 IF wanted_role NOT IN ('admin','operations','operator','finance') THEN wanted_role := 'operator'; END IF;
 INSERT INTO public.profiles (id, full_name, role)
 VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), wanted_role)
 ON CONFLICT (id) DO NOTHING;
 RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
 AFTER INSERT ON auth.users
 FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
