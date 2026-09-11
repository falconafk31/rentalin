-- ═══════════════════════════════════════════════════════════════════
-- ARSIP LEGACY — JANGAN DIJALANKAN / JANGAN DIUBAH (lihat audit K4, ui-audit D-1).
-- Jalur skema kanonik: supabase/migrations/*.sql (Supabase) dan
-- src/db/schema.ts (Drizzle, preview lokal). File ini hanya snapshot historis.
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE profiles (
 id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
 full_name TEXT NOT NULL,
 role TEXT CHECK (role IN ('admin','operations','operator','finance')) NOT NULL,
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE clients (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_name TEXT NOT NULL,
 npwp TEXT, address TEXT, pic_name TEXT NOT NULL, pic_phone TEXT, pic_email TEXT,
 created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE fleet (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), unit_code TEXT UNIQUE NOT NULL,
 category TEXT NOT NULL, brand_model TEXT NOT NULL, year INTEGER,
 status TEXT CHECK (status IN ('available','renting','maintenance','in_transit')) DEFAULT 'available',
 current_location TEXT, siko_expiry DATE, insurance_expiry DATE,
 hourly_rate DECIMAL(12,2) NOT NULL CHECK (hourly_rate >= 0), created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE contracts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), contract_number TEXT UNIQUE NOT NULL,
 client_id UUID REFERENCES clients(id) ON DELETE RESTRICT,
 unit_id UUID REFERENCES fleet(id) ON DELETE RESTRICT,
 start_date DATE NOT NULL, end_date DATE NOT NULL,
 rate_per_hour DECIMAL(12,2) NOT NULL CHECK (rate_per_hour > 0),
 status TEXT CHECK (status IN ('draft','active','completed')) DEFAULT 'draft',
 created_at TIMESTAMPTZ DEFAULT NOW(), CHECK (end_date >= start_date)
);
CREATE UNIQUE INDEX one_active_contract_per_unit ON contracts(unit_id) WHERE status = 'active';
CREATE TABLE timesheets (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 contract_id UUID REFERENCES contracts(id) ON DELETE CASCADE,
 unit_id UUID REFERENCES fleet(id) ON DELETE RESTRICT,
 operator_id UUID REFERENCES profiles(id), date DATE NOT NULL,
 start_hm DECIMAL(10,2) NOT NULL, end_hm DECIMAL(10,2) NOT NULL,
 total_hours DECIMAL(5,2) GENERATED ALWAYS AS (end_hm - start_hm) STORED,
 breakdown_hours DECIMAL(5,2) DEFAULT 0,
 effective_hours DECIMAL(5,2) GENERATED ALWAYS AS ((end_hm - start_hm) - breakdown_hours) STORED,
 notes TEXT, status TEXT CHECK (status IN ('pending','approved','rejected')) DEFAULT 'pending',
 created_at TIMESTAMPTZ DEFAULT NOW(),
 CHECK (start_hm >= 0 AND end_hm >= start_hm AND breakdown_hours >= 0 AND breakdown_hours <= end_hm-start_hm),
 UNIQUE(contract_id,date)
);
CREATE TABLE invoices (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), invoice_number TEXT UNIQUE NOT NULL,
 contract_id UUID REFERENCES contracts(id) ON DELETE RESTRICT,
 total_amount DECIMAL(15,2) NOT NULL, tax_amount DECIMAL(15,2) NOT NULL,
 status TEXT CHECK (status IN ('unpaid','partial','paid','overdue')) DEFAULT 'unpaid',
 issue_date DATE NOT NULL, due_date DATE NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE timesheets ADD COLUMN invoice_id UUID REFERENCES invoices(id) ON DELETE RESTRICT;
CREATE TABLE handovers (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), document_number TEXT NOT NULL UNIQUE,
 contract_id UUID NOT NULL REFERENCES contracts(id), type TEXT NOT NULL CHECK(type IN ('mobilization','demobilization')),
 date DATE NOT NULL, engine BOOLEAN NOT NULL, hydraulics BOOLEAN NOT NULL, tracks BOOLEAN NOT NULL,
 notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE company_settings (
 id TEXT PRIMARY KEY DEFAULT 'main', company_name TEXT NOT NULL DEFAULT 'PT Penyewaan Alat Berat',
 address TEXT NOT NULL DEFAULT 'Jakarta, Indonesia', email TEXT NOT NULL DEFAULT 'operasional@heavyops.id',
 phone TEXT NOT NULL DEFAULT '+62 21 555 0128'
);
-- Profiles are provisioned by administrators, never by user-editable metadata.
CREATE OR REPLACE FUNCTION public.current_app_role() RETURNS TEXT
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_read ON profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.current_app_role() = 'admin');
CREATE POLICY profile_admin ON profiles FOR ALL TO authenticated USING(public.current_app_role()='admin') WITH CHECK(public.current_app_role()='admin');
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['clients','fleet','contracts','timesheets','invoices','handovers','company_settings'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY staff_read ON %I FOR SELECT TO authenticated USING (public.current_app_role() IN (''admin'',''operations'',''operator'',''finance''))',t);
 END LOOP;
END $$;
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['clients','fleet','contracts','handovers'] LOOP
  EXECUTE format('CREATE POLICY operations_write ON %I FOR ALL TO authenticated USING (public.current_app_role() IN (''admin'',''operations'')) WITH CHECK (public.current_app_role() IN (''admin'',''operations''))',t);
 END LOOP;
END $$;
CREATE POLICY timesheet_submit ON timesheets FOR INSERT TO authenticated WITH CHECK (public.current_app_role() IN ('admin','operations','operator') AND operator_id = auth.uid() AND status='pending' AND invoice_id IS NULL);
CREATE POLICY timesheet_review ON timesheets FOR UPDATE TO authenticated USING (public.current_app_role() IN ('admin','operations')) WITH CHECK (public.current_app_role() IN ('admin','operations'));
CREATE POLICY invoice_write ON invoices FOR ALL TO authenticated USING (public.current_app_role() IN ('admin','finance')) WITH CHECK (public.current_app_role() IN ('admin','finance'));
CREATE POLICY settings_admin ON company_settings FOR ALL TO authenticated USING(public.current_app_role()='admin') WITH CHECK(public.current_app_role()='admin');
