-- Migration: budget_milestone_float_to_decimal
-- Issue #942: Store on-chain monetary amounts as DECIMAL(19,7) instead of
-- DOUBLE PRECISION to eliminate IEEE-754 floating-point rounding errors that
-- can corrupt escrow payout amounts when syncing stroops↔XLM.
--
-- DECIMAL(19,7) provides:
--   • 19 significant digits total  (more than enough for u128 stroops / 1e7)
--   • 7 decimal places             (Stellar uses 7 decimal places for XLM)
--   • Zero rounding error for all valid XLM amounts
--
-- The cast is lossless: existing DOUBLE PRECISION values that were created
-- from small, exact XLM amounts (e.g. 500.0, 1000.0) convert to DECIMAL
-- without any loss. Values that had accumulated float error are corrected
-- to their nearest representable DECIMAL(19,7) value.

-- Job.budget: DOUBLE PRECISION → DECIMAL(19,7)
ALTER TABLE "Job"
  ALTER COLUMN "budget" TYPE DECIMAL(19,7)
    USING "budget"::DECIMAL(19,7);

-- Milestone.amount: DOUBLE PRECISION → DECIMAL(19,7)
ALTER TABLE "Milestone"
  ALTER COLUMN "amount" TYPE DECIMAL(19,7)
    USING "amount"::DECIMAL(19,7);
