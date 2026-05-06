PRAGMA foreign_keys = OFF;

DROP VIEW IF EXISTS v_screening_summary;
DROP VIEW IF EXISTS v_film_scores;
DROP VIEW IF EXISTS v_member_top_rated_films;
DROP VIEW IF EXISTS v_member_rating_averages;
DROP VIEW IF EXISTS v_rating_with_member;

ALTER TABLE ratings RENAME TO ratings_old;

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

INSERT INTO ratings (
  rating_id,
  screening_id,
  member_id,
  score,
  reaction,
  review,
  created_at,
  updated_at
)
SELECT
  rating_id,
  screening_id,
  member_id,
  score,
  reaction,
  review,
  created_at,
  updated_at
FROM ratings_old;

DROP TABLE ratings_old;

CREATE VIEW IF NOT EXISTS v_screening_summary AS
  SELECT
    ws.week_key AS weekKey,
    ws.watch_date AS watchDate,
    ws.guest_picker_name AS guestPickerName,
    ws.notes,
    m.display_name AS chooserName,
    m.profile_color AS chooserColor,
    m.profile_emoji AS chooserEmoji,
    f.imdb_id AS imdbId,
    f.title,
    f.year,
    f.runtime,
    f.director,
    f.genre,
    f.plot,
    f.poster_url AS posterUrl,
    f.imdb_rating AS imdbRating,
    f.imdb_votes AS imdbVotes,
    ROUND(AVG(r.score), 2) AS averageScore,
    COUNT(r.rating_id) AS ratingCount
  FROM weekly_screenings ws
  LEFT JOIN members m ON m.display_name = ws.chooser_member_id
  JOIN films f ON f.id = ws.film_id
  LEFT JOIN ratings r ON r.screening_id = ws.week_key
  GROUP BY ws.week_key;

CREATE VIEW IF NOT EXISTS v_rating_with_member AS
  SELECT
    r.rating_id AS ratingId,
    r.screening_id AS screeningId,
    r.score,
    r.reaction,
    r.review,
    r.updated_at AS updatedAt,
    m.display_name AS memberName,
    m.profile_color AS memberColor,
    m.profile_emoji AS memberEmoji
  FROM ratings r
  JOIN members m ON m.display_name = r.member_id;

CREATE VIEW IF NOT EXISTS v_film_scores AS
  SELECT
    ws.week_key AS weekKey,
    f.title,
    f.year,
    f.imdb_id AS imdbId,
    ROUND(AVG(r.score), 2) AS averageScore,
    COUNT(r.rating_id) AS ratingCount
  FROM weekly_screenings ws
  JOIN films f ON f.id = ws.film_id
  JOIN ratings r ON r.screening_id = ws.week_key
  WHERE r.score IS NOT NULL
  GROUP BY ws.week_key
  HAVING ratingCount > 0;

CREATE VIEW IF NOT EXISTS v_member_rating_averages AS
  SELECT
    m.display_name AS displayName,
    m.profile_color AS profileColor,
    m.profile_emoji AS profileEmoji,
    ROUND(AVG(r.score), 2) AS averageScore,
    COUNT(r.rating_id) AS ratingCount
  FROM members m
  JOIN ratings r ON r.member_id = m.display_name
  WHERE r.score IS NOT NULL
  GROUP BY m.display_name;

CREATE VIEW IF NOT EXISTS v_member_top_rated_films AS
  SELECT
    m.display_name AS displayName,
    m.profile_color AS profileColor,
    m.profile_emoji AS profileEmoji,
    f.title,
    f.year,
    f.imdb_id AS imdbId,
    ws.week_key AS weekKey,
    ws.watch_date AS watchDate,
    r.score
  FROM ratings r
  JOIN members m ON m.display_name = r.member_id
  JOIN weekly_screenings ws ON ws.week_key = r.screening_id
  JOIN films f ON f.id = ws.film_id
  WHERE r.score IS NOT NULL
    AND r.score = (
      SELECT MAX(r2.score) FROM ratings r2
      WHERE r2.member_id = r.member_id AND r2.score IS NOT NULL
    );

PRAGMA foreign_keys = ON;
