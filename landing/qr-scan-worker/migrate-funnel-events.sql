CREATE TABLE IF NOT EXISTS funnel_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  event_type TEXT NOT NULL,
  page TEXT NOT NULL,
  element_id TEXT,
  element_label TEXT,
  event_at TEXT NOT NULL,
  user_agent TEXT,
  country TEXT,
  region_code TEXT,
  city TEXT
);

CREATE INDEX IF NOT EXISTS idx_funnel_slug ON funnel_events(slug);
CREATE INDEX IF NOT EXISTS idx_funnel_page ON funnel_events(page);
CREATE INDEX IF NOT EXISTS idx_funnel_element ON funnel_events(element_id);
CREATE INDEX IF NOT EXISTS idx_funnel_at ON funnel_events(event_at);
