-- Add QBO contact id to client_contacts for dedup on re-sync
ALTER TABLE public.client_contacts
  ADD COLUMN IF NOT EXISTS qbo_contact_id text;

CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_qbo_contact_id_idx
  ON public.client_contacts (qbo_contact_id)
  WHERE qbo_contact_id IS NOT NULL;
