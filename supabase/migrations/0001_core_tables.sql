-- =====================================================================
-- 0001 · TABEL INTI: identitas, klien, armada, kontrak
-- Jalankan pada database Supabase yang FRESH, berurutan sesuai nomor.
-- Dependensi: skema `auth` bawaan Supabase (auth.users) sudah tersedia.
-- =====================================================================

-- Pengguna internal. id = UUID dari auth.users (Supabase Auth).
-- Role TIDAK disimpan di metadata auth yang bisa diedit pengguna.
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

-- Satu unit hanya boleh terikat SATU kontrak aktif.
CREATE UNIQUE INDEX one_active_contract_per_unit ON contracts(unit_id) WHERE status = 'active';
