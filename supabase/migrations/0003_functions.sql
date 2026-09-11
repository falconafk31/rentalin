-- =====================================================================
-- 0003 · FUNGSI BANTU RLS: current_app_role()
-- Dependensi: 0001 (profiles).
-- SECURITY DEFINER: policy RLS membaca role tanpa bisa diakali pemanggil.
-- Role dibaca dari tabel profiles — BUKAN dari metadata auth.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.current_app_role() RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;
