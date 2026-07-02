CREATE TABLE IF NOT EXISTS sync_store (
  account_email TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
