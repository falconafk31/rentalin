-- =====================================================================
-- 0024 - MODUL OPERATOR/DRIVER: registri operator + assignment kontrak
-- Dependensi: 0001 (profiles, fleet, contracts), 0003 (current_app_role).
-- Desain: docs/plan-operator-dan-riwayat-armada.md (revisi 2).
--
-- Keputusan desain:
--  * `operators` = registri PERSONEL (SIO/SIM/tarif), terpisah dari
--    `profiles` (akun login). Tidak semua driver punya akun; data
--    SIO/SIM/KTP = PII, akses via RLS seluruh role internal untuk baca,
--    tulis hanya admin/operations (cermin policy fleet).
--  * Tarif operator DUA mode: per jam (rate_per_hour) dan per hari
--    (rate_per_day); default_rate_type menentukan pilihan awal form.
--    Tidak ada kolom biaya per timesheet - biaya dihitung saat agregasi
--    (calcOperatorCost) dari snapshot tarif di KONTRAK.
--  * Wet/dry hire diputuskan di KONTRAK: contracts.include_operator +
--    snapshot tarif operator di kontrak (pola yang sama dengan
--    contracts.rate_per_hour yang tidak mengikuti fleet.hourly_rate).
--    contract_operators menampung multi-operator (shift/rotasi).
-- =====================================================================

CREATE TABLE operators (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 full_name TEXT NOT NULL,
 employee_no TEXT UNIQUE,
 ktp_no TEXT,
 phone TEXT,
 sio_class TEXT,
 sio_number TEXT,
 sio_expiry DATE,
 license_class TEXT,
 license_expiry DATE,
 rate_per_hour DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (rate_per_hour >= 0),
 rate_per_day DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (rate_per_day >= 0),
 default_rate_type TEXT NOT NULL DEFAULT 'hourly' CHECK (default_rate_type IN ('hourly','daily')),
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
 notes TEXT,
 profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 -- Minimal salah satu tarif > 0 agar operator bisa ditugaskan wet hire.
 CHECK (rate_per_hour > 0 OR rate_per_day > 0)
);

CREATE INDEX operators_status_idx ON operators(status);
CREATE INDEX operators_name_idx ON operators(full_name);
CREATE INDEX operators_sio_expiry_idx ON operators(sio_expiry);

-- Assignment operator ke kontrak (multi-operator utk shift/rotasi).
CREATE TABLE contract_operators (
 contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
 operator_id UUID NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
 assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY (contract_id, operator_id)
);

CREATE INDEX contract_operators_operator_idx ON contract_operators(operator_id);

-- Wet/dry hire + snapshot tarif & mode tarif operator per kontrak.
-- NULL tarif saat include=true tidak diizinkan (dicek di Server Action;
-- DB hanya menjaga tipe & default).
ALTER TABLE contracts
 ADD COLUMN include_operator BOOLEAN NOT NULL DEFAULT false,
 ADD COLUMN operator_rate DECIMAL(12,2),
 ADD COLUMN operator_rate_type TEXT CHECK (operator_rate_type IN ('hourly','daily'));

-- Operator pengemudi pada timesheet (bisa berbeda dari pencatat).
-- operator_id lama (profiles) tetap = "siapa mencatat" (audit A10).
ALTER TABLE timesheets
 ADD COLUMN operator_driver_id UUID REFERENCES operators(id) ON DELETE SET NULL;

CREATE INDEX timesheets_operator_driver_id_idx ON timesheets(operator_driver_id);
-- Riwayat per unit (fitur drawer riwayat armada) - sebelumnya tidak ada.
CREATE INDEX timesheets_unit_id_idx ON timesheets(unit_id);

-- =====================================================================
-- RLS: baca semua role internal; tulis admin+operations.
-- (Koneksi aplikasi via Postgres langsung mem-bypass RLS; policy ini
-- menjaga akses lewat Supabase Data API.)
-- =====================================================================
ALTER TABLE operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY operators_read ON operators FOR SELECT TO authenticated
 USING (public.current_app_role() IN ('admin','operations','operator','finance'));
CREATE POLICY operators_insert ON operators FOR INSERT TO authenticated
 WITH CHECK (public.current_app_role() IN ('admin','operations'));
CREATE POLICY operators_update ON operators FOR UPDATE TO authenticated
 USING (public.current_app_role() IN ('admin','operations'))
 WITH CHECK (public.current_app_role() IN ('admin','operations'));
CREATE POLICY operators_delete ON operators FOR DELETE TO authenticated
 USING (public.current_app_role() IN ('admin','operations'));

ALTER TABLE contract_operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY contract_operators_read ON contract_operators FOR SELECT TO authenticated
 USING (public.current_app_role() IN ('admin','operations','operator','finance'));
CREATE POLICY contract_operators_write ON contract_operators FOR INSERT TO authenticated
 WITH CHECK (public.current_app_role() IN ('admin','operations'));
CREATE POLICY contract_operators_update ON contract_operators FOR UPDATE TO authenticated
 USING (public.current_app_role() IN ('admin','operations'))
 WITH CHECK (public.current_app_role() IN ('admin','operations'));
CREATE POLICY contract_operators_delete ON contract_operators FOR DELETE TO authenticated
 USING (public.current_app_role() IN ('admin','operations'));
