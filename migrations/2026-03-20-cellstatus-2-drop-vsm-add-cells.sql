-- CellStatus 2.0 migration
-- Remove legacy flow-config table and create cell_configurations

DROP TABLE IF EXISTS vsm_configurations;

CREATE TABLE IF NOT EXISTS cell_configurations (
  id VARCHAR PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'active',
  operations_json JSONB NOT NULL,
  throughput_uph REAL,
  total_wip REAL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
