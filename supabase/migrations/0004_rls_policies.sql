-- =====================================================================
-- 0004 · ROW LEVEL SECURITY: aktifkan + kebijakan per role
-- Dependensi: 0002 (semua tabel) dan 0003 (current_app_role).
-- Catatan: RLS ini mengamankan akses via Supabase Data API.
-- Koneksi aplikasi (Drizzle via DATABASE_URL) adalah trusted server-side
-- dan mem-bypass RLS — otorisasi aplikasi tetap wajib di Server Actions.
-- =====================================================================

-- Profiles: pengguna boleh lihat dirinya; hanya admin yang boleh kelola.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_read ON profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.current_app_role() = 'admin');
CREATE POLICY profile_admin ON profiles FOR ALL TO authenticated USING(public.current_app_role()='admin') WITH CHECK(public.current_app_role()='admin');

-- Semua tabel bisnis: seluruh role internal boleh MEMBACA.
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['clients','fleet','contracts','timesheets','invoices','handovers','company_settings'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY staff_read ON %I FOR SELECT TO authenticated USING (public.current_app_role() IN (''admin'',''operations'',''operator'',''finance''))',t);
 END LOOP;
END $$;

-- Tulis data master (klien, armada, kontrak, BAST): admin & operations saja.
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['clients','fleet','contracts','handovers'] LOOP
  EXECUTE format('CREATE POLICY operations_write ON %I FOR ALL TO authenticated USING (public.current_app_role() IN (''admin'',''operations'')) WITH CHECK (public.current_app_role() IN (''admin'',''operations''))',t);
 END LOOP;
END $$;

-- Timesheet: operator hanya boleh MENGAJUKAN miliknya, status pending, belum tertagih.
CREATE POLICY timesheet_submit ON timesheets FOR INSERT TO authenticated WITH CHECK (public.current_app_role() IN ('admin','operations','operator') AND operator_id = auth.uid() AND status='pending' AND invoice_id IS NULL);
-- Persetujuan/reject timesheet: admin & operations.
CREATE POLICY timesheet_review ON timesheets FOR UPDATE TO authenticated USING (public.current_app_role() IN ('admin','operations')) WITH CHECK (public.current_app_role() IN ('admin','operations'));

-- Invoice: hanya admin & finance.
CREATE POLICY invoice_write ON invoices FOR ALL TO authenticated USING (public.current_app_role() IN ('admin','finance')) WITH CHECK (public.current_app_role() IN ('admin','finance'));

-- Pengaturan perusahaan: admin saja.
CREATE POLICY settings_admin ON company_settings FOR ALL TO authenticated USING(public.current_app_role()='admin') WITH CHECK(public.current_app_role()='admin');
