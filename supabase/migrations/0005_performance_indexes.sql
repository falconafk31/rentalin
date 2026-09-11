-- =====================================================================
-- 0005 · INDEKS PERFORMA (dari roadmap.md Fase 0.6)
-- Sifatnya aditif & aman; boleh dijalankan setelah produksi berjalan.
-- FK tidak otomatis terindeks PostgreSQL — tanpa indeks ini,
-- JOIN dan agregasi melambat seiring pertumbuhan data.
-- =====================================================================

CREATE INDEX IF NOT EXISTS contracts_client_id_idx   ON contracts(client_id);
CREATE INDEX IF NOT EXISTS invoices_contract_id_idx  ON invoices(contract_id);
CREATE INDEX IF NOT EXISTS handovers_contract_id_idx ON handovers(contract_id);
CREATE INDEX IF NOT EXISTS timesheets_operator_id_idx ON timesheets(operator_id);
CREATE INDEX IF NOT EXISTS timesheets_invoice_id_idx  ON timesheets(invoice_id);
CREATE INDEX IF NOT EXISTS fleet_status_idx           ON fleet(status);

-- Catatan: timesheets(contract_id, date) SUDAH terindeks oleh
-- UNIQUE constraint di 0002, jadi tidak perlu indeks tambahan.
