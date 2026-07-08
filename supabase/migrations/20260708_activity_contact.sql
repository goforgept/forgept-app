ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES client_contacts(id) ON DELETE SET NULL;
