-- 0016: validasi snapshot pajak historis (TASK-1B Finding 4).
-- 0014 diperlakukan IMMUTABLE dan tidak diubah. Migrasi ini berjalan
-- setelahnya dan memastikan data historis valid SEBELUM constraint
-- going-forward dipasang: GAGAL EKSPILISIT (menyebut nomor invoice)
-- daripada memalsukan angka akuntansi. Tak ada repair otomatis —
-- baris korup harus diperiksa manual karena kebenaran historisnya
-- tak bisa disimpulkan mesin.
--
-- Urutan: membutuhkan kolom 0014 (subtotal_amount, tax_rate).

DO $$
DECLARE bad TEXT;
BEGIN
  -- 1. Nilai dasar mustahil: null, negatif, atau pajak melebihi total.
  SELECT string_agg(invoice_number, ', ') INTO bad FROM invoices
   WHERE total_amount IS NULL OR tax_amount IS NULL
      OR total_amount < 0 OR tax_amount < 0 OR tax_amount > total_amount;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'INVOICE KORUP: total/pajak null, negatif, atau pajak>total: %', bad;
  END IF;
  -- 2. Konsistensi snapshot 0014: subtotal eksak = total-pajak (kolom 2 dp)
  --    dan tarif dalam rentang 0-100. (Cek balik tarif→pajak disengaja
  --    TIDAK dilakukan: tak terdefinisi baik akibat pembulatan dua arah.)
  SELECT string_agg(invoice_number, ', ') INTO bad FROM invoices
   WHERE subtotal_amount IS NULL OR tax_rate IS NULL
      OR subtotal_amount <> total_amount - tax_amount
      OR tax_rate < 0 OR tax_rate > 100;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'SNAPSHOT 0014 TAK KONSISTEN: %', bad;
  END IF;
END $$;

-- 3. Kunci going-forward (idempotent): nilai dasar waras + snapshot konsisten.
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_amounts_sane
    CHECK (total_amount >= 0 AND tax_amount >= 0 AND tax_amount <= total_amount);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT invoices_snapshot_consistent
    CHECK (subtotal_amount = total_amount - tax_amount);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
