ALTER TABLE permission_groups
  ADD COLUMN IF NOT EXISTS description TEXT;
