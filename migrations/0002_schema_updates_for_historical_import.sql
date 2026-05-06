PRAGMA foreign_keys = OFF;

ALTER TABLE films RENAME TO films_old;
CREATE TABLE films (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imdb_id TEXT UNIQUE,
  title TEXT NOT NULL,
  year TEXT,
  runtime TEXT,
  director TEXT,
  genre TEXT,
  plot TEXT,
  poster_url TEXT,
  imdb_rating TEXT,
  imdb_votes TEXT,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO films (
  id,
  imdb_id,
  title,
  year,
  runtime,
  director,
  genre,
  plot,
  poster_url,
  imdb_rating,
  imdb_votes,
  raw_json,
  created_at,
  updated_at
)
SELECT
  id,
  imdb_id,
  title,
  year,
  runtime,
  director,
  genre,
  plot,
  poster_url,
  imdb_rating,
  imdb_votes,
  raw_json,
  created_at,
  updated_at
FROM films_old;
DROP TABLE films_old;

ALTER TABLE weekly_screenings RENAME TO weekly_screenings_old;
CREATE TABLE weekly_screenings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_key TEXT NOT NULL UNIQUE,
  watch_date TEXT UNIQUE,
  chooser_member_id INTEGER,
  guest_picker_name TEXT,
  film_id INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (chooser_member_id IS NOT NULL OR guest_picker_name IS NOT NULL),
  FOREIGN KEY (chooser_member_id) REFERENCES members(id),
  FOREIGN KEY (film_id) REFERENCES films(id)
);
INSERT INTO weekly_screenings (
  id,
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
  id,
  week_key,
  watch_date,
  chooser_member_id,
  NULL,
  film_id,
  notes,
  created_at,
  updated_at
FROM weekly_screenings_old;
DROP TABLE weekly_screenings_old;

ALTER TABLE ratings RENAME TO ratings_old;
CREATE TABLE ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screening_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  score REAL CHECK (score >= 1),
  reaction TEXT,
  review TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (score IS NOT NULL OR reaction IS NOT NULL),
  UNIQUE (screening_id, member_id),
  FOREIGN KEY (screening_id) REFERENCES weekly_screenings(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);
INSERT INTO ratings (
  id,
  screening_id,
  member_id,
  score,
  reaction,
  review,
  created_at,
  updated_at
)
SELECT
  id,
  screening_id,
  member_id,
  CAST(score AS REAL),
  NULL,
  review,
  created_at,
  updated_at
FROM ratings_old;
DROP TABLE ratings_old;

CREATE INDEX IF NOT EXISTS idx_screenings_watch_date ON weekly_screenings(watch_date DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_screening_id ON ratings(screening_id);

PRAGMA foreign_keys = ON;
