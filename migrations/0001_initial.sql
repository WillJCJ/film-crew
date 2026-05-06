CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS films (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imdb_id TEXT NOT NULL UNIQUE,
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

CREATE TABLE IF NOT EXISTS weekly_screenings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  week_key TEXT NOT NULL UNIQUE,
  watch_date TEXT NOT NULL UNIQUE,
  chooser_member_id INTEGER NOT NULL,
  film_id INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (chooser_member_id) REFERENCES members(id),
  FOREIGN KEY (film_id) REFERENCES films(id)
);

CREATE TABLE IF NOT EXISTS ratings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screening_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 10),
  review TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (screening_id, member_id),
  FOREIGN KEY (screening_id) REFERENCES weekly_screenings(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_screenings_watch_date ON weekly_screenings(watch_date DESC);
CREATE INDEX IF NOT EXISTS idx_ratings_screening_id ON ratings(screening_id);