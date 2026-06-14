CREATE TABLE IF NOT EXISTS scans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  scanned_at TEXT NOT NULL,
  user_agent TEXT,
  referer TEXT,
  country TEXT,
  region_code TEXT,
  region TEXT,
  city TEXT
);

CREATE INDEX IF NOT EXISTS idx_scans_slug ON scans(slug);
CREATE INDEX IF NOT EXISTS idx_scans_at ON scans(scanned_at);
