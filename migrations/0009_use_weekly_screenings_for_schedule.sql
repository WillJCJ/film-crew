PRAGMA foreign_keys = OFF;

ALTER TABLE weekly_screenings RENAME TO weekly_screenings_old;

CREATE TABLE weekly_screenings (
  week_key TEXT NOT NULL PRIMARY KEY,
  watch_date TEXT UNIQUE,
  chooser_member_id TEXT,
  guest_picker_name TEXT,
  film_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (chooser_member_id IS NOT NULL OR guest_picker_name IS NOT NULL),
  FOREIGN KEY (chooser_member_id) REFERENCES members(display_name),
  FOREIGN KEY (film_id) REFERENCES films(id)
);

INSERT INTO weekly_screenings (
  week_key,
  watch_date,
  chooser_member_id,
  guest_picker_name,
  film_id,
  notes,
  created_at,
  updated_at
)
SELECT
  week_key,
  watch_date,
  chooser_member_id,
  guest_picker_name,
  film_id,
  notes,
  created_at,
  updated_at
FROM weekly_screenings_old;

CREATE INDEX IF NOT EXISTS idx_screenings_watch_date ON weekly_screenings(watch_date DESC);

DROP TABLE IF EXISTS screening_schedule;

PRAGMA foreign_keys = ON;
