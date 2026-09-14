-- =====================================================================
-- 0025 - INVOICE: komponen biaya jasa operator (wet hire)
-- Dependensi: 0024 (operators, contracts.include_operator).
-- operator_amount = 0 untuk dry hire / invoice lama (default NOT NULL 0).
-- total_amount invoice wet hire = subtotal + operator_amount + tax
-- (PPN dihitung atas subtotal + operator, lihat calcInvoiceTotalsWithOperator).
-- =====================================================================
ALTER TABLE invoices
 ADD COLUMN operator_amount DECIMAL(15,2) NOT NULL DEFAULT 0;