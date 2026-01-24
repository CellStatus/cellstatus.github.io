CREATE TABLE IF NOT EXISTS vsm_configurations (
  id VARCHAR(255) PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  stations_json JSONB NOT NULL,
  bottleneck_rate FLOAT8,
  process_efficiency FLOAT8,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by VARCHAR(255) NOT NULL,
  updated_by VARCHAR(255)
);

CREATE INDEX idx_vsm_created_by ON vsm_configurations(created_by);
CREATE INDEX idx_vsm_updated_at ON vsm_configurations(updated_at);
