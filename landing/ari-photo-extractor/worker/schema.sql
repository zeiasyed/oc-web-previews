CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ari_credentials (
  user_name TEXT PRIMARY KEY,
  email_enc TEXT NOT NULL,
  password_enc TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
  id TEXT PRIMARY KEY,
  user_name TEXT NOT NULL,
  name TEXT NOT NULL,
  client_name TEXT,
  date_from TEXT,
  date_to TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batch_cars (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  ari_invoice_id TEXT NOT NULL,
  invoice_number TEXT,
  vin TEXT,
  year TEXT,
  make TEXT,
  model TEXT,
  client_name TEXT,
  date_ordered TEXT,
  kept INTEGER NOT NULL DEFAULT 0,
  photos_json TEXT NOT NULL DEFAULT '[]',
  review_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(batch_id, ari_invoice_id),
  FOREIGN KEY (batch_id) REFERENCES batches(id)
);

CREATE INDEX IF NOT EXISTS idx_batches_user ON batches(user_name);
CREATE INDEX IF NOT EXISTS idx_batch_cars_batch ON batch_cars(batch_id);
