-- Add probability and definition columns to pipeline_stages

ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS probability integer;
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS definition text;

-- Seed probability for existing rows by well-known stage names
UPDATE pipeline_stages SET probability = CASE
  WHEN lower(name) = 'lead'                               THEN 10
  WHEN lower(name) IN ('contacted', 'qualified')          THEN 20
  WHEN lower(name) LIKE '%site%'                          THEN 40
  WHEN lower(name) LIKE '%design%' OR lower(name) LIKE '%engineering%' THEN 50
  WHEN lower(name) LIKE '%quot%' AND lower(name) NOT LIKE '%submit%'   THEN 60
  WHEN lower(name) LIKE '%submit%'                        THEN 70
  WHEN lower(name) LIKE '%negotiat%' OR lower(name) LIKE '%revision%'  THEN 80
  WHEN lower(name) LIKE '%pending%' OR lower(name) LIKE '%award%'      THEN 90
  WHEN lower(name) = 'won'                                THEN 100
  WHEN lower(name) = 'lost'                               THEN 0
  ELSE 40
END
WHERE probability IS NULL;
