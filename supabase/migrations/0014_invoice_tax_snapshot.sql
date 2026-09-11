-- 0014: snapshot subtotal + tarif pajak per invoice (TASK-1 §7).
-- Tarif setting (company_settings.ppn_rate) boleh berubah; invoice yang
-- sudah terbit WAJIB mempertahankan angka penerbitannya.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(15,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2);
-- Backfill dari data lama: subtotal = total − pajak; tarif = pajak/subtotal×100.
UPDATE invoices SET subtotal_amount = ROUND(total_amount - tax_amount, 2) WHERE subtotal_amount IS NULL;
UPDATE invoices SET tax_rate = COALESCE(ROUND(tax_amount / NULLIF(total_amount - tax_amount, 0) * 100, 2), 0) WHERE tax_rate IS NULL;
ALTER TABLE invoices ALTER COLUMN subtotal_amount SET NOT NULL, ALTER COLUMN tax_rate SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_tax_rate_range CHECK (tax_rate >= 0 AND tax_rate <= 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
