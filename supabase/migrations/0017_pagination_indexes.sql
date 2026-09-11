-- =====================================================================
-- 0017 · INDEKS PAGINASI SERVER-SIDE (O-A / audit.md O1 / isu #10)
-- Sifatnya aditif & aman (pola 0005). getModulePage kini menyaring
-- (WHERE q/status), mengurutkan (ORDER BY label/tanggal), dan memotong
-- (LIMIT/OFFSET) di server — indeks di bawah menjaga rencana eksekusi
-- tetap efisien seiring tabel tumbuh.
-- Catatan: pencarian ILIKE '%…%' tetap seq scan (butuh pg_trgm bila
-- nanti dibutuhkan); indeks ini menguntungkan ORDER BY + filter status.
-- =====================================================================

CREATE INDEX IF NOT EXISTS fleet_created_at_idx      ON fleet(created_at);
CREATE INDEX IF NOT EXISTS clients_company_name_idx  ON clients(company_name);
CREATE INDEX IF NOT EXISTS clients_created_at_idx    ON clients(created_at);
CREATE INDEX IF NOT EXISTS contracts_created_at_idx  ON contracts(created_at);
CREATE INDEX IF NOT EXISTS contracts_status_idx      ON contracts(status);
CREATE INDEX IF NOT EXISTS timesheets_date_idx       ON timesheets(date);
CREATE INDEX IF NOT EXISTS handovers_date_idx        ON handovers(date);
CREATE INDEX IF NOT EXISTS invoices_issue_date_idx   ON invoices(issue_date);
CREATE INDEX IF NOT EXISTS invoices_due_date_idx     ON invoices(due_date);
CREATE INDEX IF NOT EXISTS invoices_status_idx       ON invoices(status);
CREATE INDEX IF NOT EXISTS payments_invoice_id_idx   ON payments(invoice_id);
