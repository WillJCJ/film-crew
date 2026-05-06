PRAGMA foreign_keys = OFF;

ALTER TABLE members RENAME TO members_old;
ALTER TABLE weekly_screenings RENAME TO weekly_screenings_old;
ALTER TABLE ratings RENAME TO ratings_old;

CREATE TABLE members (
  display_name TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO members (display_name, email, is_admin, created_at, updated_at)
SELECT display_name, email, is_admin, created_at, updated_at FROM members_old;

CREATE TABLE weekly_screenings (
  week_key TEXT PRIMARY KEY,
  watch_date TEXT UNIQUE,
  chooser_member_id TEXT,
  guest_picker_name TEXT,
  film_id INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (chooser_member_id IS NOT NULL OR guest_picker_name IS NOT NULL),
  FOREIGN KEY (chooser_member_id) REFERENCES members(display_name),
  FOREIGN KEY (film_id) REFERENCES films(id)
);

INSERT INTO weekly_screenings (week_key, watch_date, chooser_member_id, guest_picker_name, film_id, notes, created_at, updated_at)
SELECT
  ws.week_key,
  ws.watch_date,
  m.display_name,
  ws.guest_picker_name,
  ws.film_id,
  ws.notes,
  ws.created_at,
  ws.updated_at
FROM weekly_screenings_old ws
LEFT JOIN members_old m ON m.id = ws.chooser_member_id;

CREATE TABLE ratings (
  rating_id INTEGER PRIMARY KEY AUTOINCREMENT,
  screening_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  score REAL CHECK (score IS NULL OR score >= 1),
  reaction TEXT,
  review TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (score IS NOT NULL OR reaction IS NOT NULL),
  UNIQUE (screening_id, member_id),
  FOREIGN KEY (screening_id) REFERENCES weekly_screenings(week_key) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(display_name) ON DELETE CASCADE
);

INSERT INTO ratings (rating_id, screening_id, member_id, score, reaction, review, created_at, updated_at)
SELECT
  r.id,
  ws.week_key,
  m.display_name,
  r.score,
  r.reaction,
  r.review,
  r.created_at,
  r.updated_at
FROM ratings_old r
JOIN weekly_screenings_old ws ON ws.id = r.screening_id
JOIN members_old m ON m.id = r.member_id;

DROP TABLE ratings_old;
DROP TABLE weekly_screenings_old;
DROP TABLE members_old;

DROP INDEX IF EXISTS idx_screenings_watch_date;
DROP INDEX IF EXISTS idx_ratings_screening_id;
CREATE INDEX IF NOT EXISTS idx_screenings_watch_date ON weekly_screenings(watch_date DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_screening_id ON ratings(screening_id);

PRAGMA foreign_keys = ON;
