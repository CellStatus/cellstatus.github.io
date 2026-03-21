CREATE TABLE IF NOT EXISTS scrap_incidents (
  id varchar PRIMARY KEY,
  machine_id varchar NOT NULL,
  characteristic text NOT NULL,
  quantity integer NOT NULL,
  estimated_cost real NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at text NOT NULL,
  updated_at text NOT NULL
);
