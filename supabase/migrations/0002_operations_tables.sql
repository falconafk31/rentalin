-- =====================================================================
-- 0002 · TABEL OPERASIONAL: timesheet, invoice, serah terima, pengaturan
-- Dependensi: 0001 (contracts, fleet, profiles).
-- Urutan di file ini penting: invoices harus ada SEBELUM
-- ALTER TABLE timesheets ADD invoice_id.
-- =====================================================================

-- Generated columns: total_hours & effective_hours dihitung PostgreSQL,
-- bukan aplikasi. UNIQUE(contract_id, date) = satu catatan per hari per kontrak.
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

-- Tautan timesheet → invoice (RESTRICT: invoice tidak bisa hilang sendirian).
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
