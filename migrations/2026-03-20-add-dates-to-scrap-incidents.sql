ALTER TABLE scrap_incidents ADD COLUMN IF NOT EXISTS date_created text;
ALTER TABLE scrap_incidents ADD COLUMN IF NOT EXISTS date_closed text;
