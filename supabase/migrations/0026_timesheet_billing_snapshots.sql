-- =====================================================================
-- 0026 - TIMESHEET BILLING SNAPSHOTS
-- Dependensi: 0001 (timesheets), 0024 (operators), 0025 (invoice operator_amount).
-- 
-- Capture billing rates at timesheet approval (when work becomes billable).
-- Historical correctness: contract revisions do not retroactively change
-- billing rates for already-approved timesheets.
--
-- CRITICAL: Historical backfill is intentionally conservative. We do NOT
-- backfill invoiced timesheets with current contract rates if the contract
-- may have been revised after invoicing. Better to leave NULL and flag
-- ambiguous data than to fabricate false historical financial records.
-- =====================================================================

-- Add snapshot columns (nullable during transition)
ALTER TABLE timesheets
  ADD COLUMN IF NOT EXISTS billing_rate_snapshot DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS operator_rate_snapshot DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS operator_rate_type_snapshot TEXT;

-- Constraint: operator rate/type must be consistent (both NULL or both set)
DO $$ BEGIN
  ALTER TABLE timesheets
    ADD CONSTRAINT timesheets_operator_snapshot_consistent
    CHECK (
      (operator_rate_snapshot IS NULL AND operator_rate_type_snapshot IS NULL)
      OR
      (operator_rate_snapshot IS NOT NULL AND operator_rate_type_snapshot IN ('hourly','daily'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index for invoice aggregation query (critical performance path)
CREATE INDEX IF NOT EXISTS idx_timesheets_billing_aggregation 
  ON timesheets(contract_id, status, invoice_id)
  WHERE status='approved' AND invoice_id IS NULL;

-- =====================================================================
-- HISTORICAL BACKFILL (conservative, non-fabricating)
-- =====================================================================
-- Category B: Approved + Unbilled timesheets
-- These are financially critical - about to be invoiced.
-- Use current contract rate with assumption: approved recently, rate unchanged.
UPDATE timesheets SET
  billing_rate_snapshot = c.rate_per_hour,
  operator_rate_snapshot = CASE WHEN c.include_operator THEN c.operator_rate ELSE NULL END,
  operator_rate_type_snapshot = CASE WHEN c.include_operator THEN c.operator_rate_type ELSE NULL END
FROM contracts c
WHERE timesheets.contract_id = c.id
  AND timesheets.status = 'approved'
  AND timesheets.invoice_id IS NULL
  AND timesheets.billing_rate_snapshot IS NULL;

-- Category A: Approved + Invoiced timesheets
-- DO NOT BACKFILL from current contracts.rate_per_hour.
-- Invoices already store authoritative ledger values (subtotal_amount,
-- operator_amount, tax_amount, total_amount). Backfilling from current
-- contract would fabricate historical financial facts if contracts were revised.
-- Leave billing_rate_snapshot NULL when historical rate cannot be proven.

-- Category C: Pending timesheets
-- DO NOT BACKFILL. Snapshots captured on approval.
-- Leave NULL.

-- Category D: Rejected timesheets
-- DO NOT BACKFILL. Rejected timesheets are not billable.
-- Leave NULL.

-- =====================================================================
-- POST-BACKFILL VERIFICATION
-- =====================================================================
DO $$
DECLARE
  orphan_approved_unbilled INTEGER;
  legacy_approved_invoiced INTEGER;
  orphan_pending INTEGER;
BEGIN
  -- Approved + Unbilled (critical)
  SELECT COUNT(*) INTO orphan_approved_unbilled
  FROM timesheets
  WHERE status = 'approved'
    AND invoice_id IS NULL
    AND billing_rate_snapshot IS NULL;

  -- Approved + Invoiced (expected to be NULL for legacy pre-snapshot records)
  SELECT COUNT(*) INTO legacy_approved_invoiced
  FROM timesheets
  WHERE status = 'approved'
    AND invoice_id IS NOT NULL
    AND billing_rate_snapshot IS NULL;

  -- Pending (expected to be NULL)
  SELECT COUNT(*) INTO orphan_pending
  FROM timesheets
  WHERE status = 'pending'
    AND billing_rate_snapshot IS NOT NULL;

  -- Report
  IF orphan_approved_unbilled > 0 THEN
    RAISE WARNING 'BACKFILL: % approved unbilled timesheets missing snapshot (orphaned from contract)', orphan_approved_unbilled;
  END IF;

  IF legacy_approved_invoiced > 0 THEN
    RAISE NOTICE 'BACKFILL: % legacy approved invoiced timesheets left with NULL snapshot (historical ledger values remain authoritative)', legacy_approved_invoiced;
  END IF;

  IF orphan_pending > 0 THEN
    RAISE WARNING 'BACKFILL: % pending timesheets have snapshot (unexpected)', orphan_pending;
  END IF;

  RAISE NOTICE 'BACKFILL COMPLETE. Check warnings above for any orphaned data.';
END $$;

-- =====================================================================
-- COMMENTS
-- =====================================================================
COMMENT ON COLUMN timesheets.billing_rate_snapshot IS 
  'Equipment rate frozen at approval (from contracts.rate_per_hour). Immutable after approval. NULL for pending/orphaned.';
COMMENT ON COLUMN timesheets.operator_rate_snapshot IS 
  'Operator rate frozen at approval (from contracts.operator_rate). NULL for dry-hire or pending.';
COMMENT ON COLUMN timesheets.operator_rate_type_snapshot IS 
  'Operator rate type frozen at approval (hourly/daily). NULL for dry-hire or pending.';

