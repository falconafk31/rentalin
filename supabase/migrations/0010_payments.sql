-- =====================================================================
-- 0010 · Payment ledger: pembayaran invoice tercatat per transaksi
-- Dependensi: 0001 (invoices, profiles).
-- Alasan: pelunasan sebelumnya toggle manual semua-atau-tidak-sama-sekali.
-- Kini setiap pembayaran (penuh maupun cicilan) tercatat dengan nominal,
-- metode, referensi, dan tanggal — status invoice dihitung dari akumulasi:
--   paid    = total bayar >= total tagihan
--   partial = bayar sebagian (atau overdue bila lewat jatuh tempo)
--   unpaid  = belum ada pembayaran
-- =====================================================================

CREATE TABLE payments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
 amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
 method TEXT NOT NULL CHECK (method IN ('transfer','cash','giro','other')),
 reference TEXT,
 paid_at DATE NOT NULL,
 noted_by UUID REFERENCES profiles(id),
 created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_invoice ON payments(invoice_id);

-- RLS selaras invoices (lihat 0004): baca admin/operations/finance,
-- tulis (catat pembayaran) admin & finance saja.
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY payment_read ON payments FOR SELECT TO authenticated
 USING (public.current_app_role() IN ('admin','operations','finance'));
CREATE POLICY payment_write ON payments FOR ALL TO authenticated
 USING (public.current_app_role() IN ('admin','finance'))
 WITH CHECK (public.current_app_role() IN ('admin','finance'));
