-- 1. Ticket auto-numbering function
--    Returns the next ticket number for an org in the format TKT-0001.
--    Uses MAX of existing numeric suffixes so gaps from deleted tickets don't repeat.
CREATE OR REPLACE FUNCTION get_next_ticket_number(org_id_input UUID)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next integer;
BEGIN
  SELECT COALESCE(MAX(
    CASE
      WHEN ticket_number ~ '^\D*\d+$'
      THEN CAST(REGEXP_REPLACE(ticket_number, '^\D+', '') AS integer)
      ELSE 0
    END
  ), 0) + 1
  INTO v_next
  FROM service_tickets
  WHERE org_id = org_id_input;

  RETURN 'TKT-' || LPAD(v_next::text, 4, '0');
END;
$$;

-- 2. Add contact_id to service_tickets so a ticket can track who reported it
ALTER TABLE service_tickets
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES client_contacts(id) ON DELETE SET NULL;
