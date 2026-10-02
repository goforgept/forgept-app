-- Add subtotal_value: pre-tax project revenue, used for pipeline/dashboard metrics.
-- proposal_value stays as the with-tax total (correct for PDFs, AIA, customer invoices).
-- subtotal_value is what we use for won revenue, pipeline, forecasts, and leaderboards.

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS subtotal_value numeric;

-- Backfill: reverse the tax out of existing proposal_value.
-- Only proposals where tax is actually applied (not exempt, tax_rate > 0).
UPDATE proposals
SET subtotal_value = ROUND(proposal_value / (1 + tax_rate / 100.0), 2)
WHERE tax_exempt IS NOT TRUE
  AND tax_rate IS NOT NULL
  AND tax_rate > 0
  AND proposal_value IS NOT NULL;

-- All other proposals (tax exempt, no tax rate, or no value): subtotal = proposal_value.
UPDATE proposals
SET subtotal_value = proposal_value
WHERE subtotal_value IS NULL
  AND proposal_value IS NOT NULL;
