ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS doc_font text NOT NULL DEFAULT 'helvetica',
  ADD COLUMN IF NOT EXISTS pdf_table_style text NOT NULL DEFAULT 'striped';
