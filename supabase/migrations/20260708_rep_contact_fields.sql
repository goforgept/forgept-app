-- Rep contact fields on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS job_title text;

-- Mirror on proposals so old proposals preserve the rep's info at time of creation
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS rep_phone text;
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS rep_title text;
