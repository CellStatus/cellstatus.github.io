-- Migration: Normalize SPC data to 3NF
-- Creates parts, characteristics, spc_measurements tables
-- Migrates data from the flat audit_findings / spc_data table
-- Then drops the old table

-- Step 0: Rename table if it's still called audit_findings
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_findings') THEN
    ALTER TABLE audit_findings RENAME TO spc_data;
  END IF;
END $$;

-- Add op_name column to spc_data if it doesn't exist yet
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'spc_data' AND column_name = 'op_name'
  ) THEN
    ALTER TABLE spc_data ADD COLUMN op_name TEXT;
  END IF;
END $$;

-- Step 1: Create new normalized tables

CREATE TABLE IF NOT EXISTS parts (
  id VARCHAR PRIMARY KEY,
  part_number TEXT NOT NULL,
  part_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS characteristics (
  id VARCHAR PRIMARY KEY,
  part_id VARCHAR NOT NULL REFERENCES parts(id),
  char_number TEXT NOT NULL,
  char_name TEXT,
  char_max TEXT,
  char_min TEXT,
  tolerance TEXT,
  op_name TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS spc_measurements (
  id VARCHAR PRIMARY KEY,
  characteristic_id VARCHAR NOT NULL REFERENCES characteristics(id),
  machine_id VARCHAR NOT NULL,
  measured_value TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  record_note TEXT,
  created_at TEXT NOT NULL
);

-- Step 2: Migrate data from spc_data
-- Use NULLIF to handle empty strings, so COALESCE falls through correctly

-- Insert distinct parts
INSERT INTO parts (id, part_number, part_name, created_at)
SELECT
  gen_random_uuid()::text,
  COALESCE(NULLIF(part_number, ''), '(no-part)'),
  MAX(NULLIF(part_name, '')),
  MIN(created_at)
FROM spc_data
GROUP BY COALESCE(NULLIF(part_number, ''), '(no-part)')
ON CONFLICT DO NOTHING;

-- Insert distinct characteristics (unique per part + char_number)
INSERT INTO characteristics (id, part_id, char_number, char_name, char_max, char_min, tolerance, op_name, created_at)
SELECT
  gen_random_uuid()::text,
  p.id,
  COALESCE(NULLIF(s.char_number, ''), NULLIF(s.characteristic, ''), '(unknown)'),
  MAX(NULLIF(s.char_name, '')),
  MAX(NULLIF(s.char_max, '')),
  MAX(NULLIF(s.char_min, '')),
  MAX(NULLIF(s.tolerance, '')),
  MAX(NULLIF(s.op_name, '')),
  MIN(s.created_at)
FROM spc_data s
JOIN parts p ON p.part_number = COALESCE(NULLIF(s.part_number, ''), '(no-part)')
GROUP BY p.id, COALESCE(NULLIF(s.char_number, ''), NULLIF(s.characteristic, ''), '(unknown)')
ON CONFLICT DO NOTHING;

-- Insert measurements referencing characteristics
INSERT INTO spc_measurements (id, characteristic_id, machine_id, measured_value, status, record_note, created_at)
SELECT
  s.id,
  c.id,
  s.machine_id,
  s.measured_value,
  COALESCE(s.status, 'open'),
  s.corrective_action,
  s.created_at
FROM spc_data s
JOIN parts p ON p.part_number = COALESCE(NULLIF(s.part_number, ''), '(no-part)')
JOIN characteristics c ON c.part_id = p.id
  AND c.char_number = COALESCE(NULLIF(s.char_number, ''), NULLIF(s.characteristic, ''), '(unknown)')
ON CONFLICT DO NOTHING;

-- Step 3: Drop old table
DROP TABLE IF EXISTS spc_data;

-- Step 4: Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_characteristics_part_id ON characteristics(part_id);
CREATE INDEX IF NOT EXISTS idx_characteristics_part_char ON characteristics(part_id, char_number);
CREATE INDEX IF NOT EXISTS idx_spc_measurements_char_id ON spc_measurements(characteristic_id);
CREATE INDEX IF NOT EXISTS idx_spc_measurements_machine_id ON spc_measurements(machine_id);
CREATE INDEX IF NOT EXISTS idx_spc_measurements_created_at ON spc_measurements(created_at);
CREATE INDEX IF NOT EXISTS idx_parts_part_number ON parts(part_number);
