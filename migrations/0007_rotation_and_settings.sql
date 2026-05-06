-- Pick rotation order for each member (NULL = not in rotation)
ALTER TABLE members ADD COLUMN rotation_order INTEGER;

-- Site-wide settings key/value store
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Default screening day: Thursday (JS day number, 0 = Sunday)
INSERT OR IGNORE INTO settings (key, value) VALUES ('screening_day', '4');
