-- Add probability and definition columns to pipeline_stages for richer CRM forecasting

ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS probability integer DEFAULT 50;
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS definition text;
