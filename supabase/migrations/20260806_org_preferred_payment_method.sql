-- Per-org preferred payment method for ForgePt platform billing
-- ACH = bank transfer only (cheap, no card option)
-- Credit Card = card allowed + CC surcharge added to invoice
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS preferred_payment_method text DEFAULT 'ACH' CHECK (preferred_payment_method IN ('ACH', 'Credit Card'));
