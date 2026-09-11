-- 0015: catatan internal per pembayaran (TASK-1 A-2).
ALTER TABLE payments ADD COLUMN IF NOT EXISTS notes TEXT;
