-- Full screening summary: joins screenings, chooser member, film, and aggregated ratings.
-- Used by listScreenings and getScreeningById.
CREATE VIEW IF NOT EXISTS v_screening_summary AS
  SELECT
    ws.week_key        AS weekKey,
    ws.watch_date      AS watchDate,
    ws.guest_picker_name AS guestPickerName,
    ws.notes,
    m.display_name     AS chooserName,
    m.profile_color    AS chooserColor,
    m.profile_emoji    AS chooserEmoji,
    f.imdb_id          AS imdbId,
    f.title,
    f.year,
    f.runtime,
    f.director,
    f.genre,
    f.plot,
    f.poster_url       AS posterUrl,
    f.imdb_rating      AS imdbRating,
    f.imdb_votes       AS imdbVotes,
    ROUND(AVG(r.score), 2) AS averageScore,
    COUNT(r.rating_id) AS ratingCount
  FROM weekly_screenings ws
  LEFT JOIN members m ON m.display_name = ws.chooser_member_id
  JOIN films f ON f.id = ws.film_id
  LEFT JOIN ratings r ON r.screening_id = ws.week_key
  GROUP BY ws.week_key;

-- Ratings joined with member profile info.
-- Used by getScreeningById to fetch the per-member rating list.
CREATE VIEW IF NOT EXISTS v_rating_with_member AS
  SELECT
    r.rating_id        AS ratingId,
    r.screening_id     AS screeningId,
    r.score,
    r.reaction,
    r.review,
    r.updated_at       AS updatedAt,
    m.display_name     AS memberName,
    m.profile_color    AS memberColor,
    m.profile_emoji    AS memberEmoji
  FROM ratings r
  JOIN members m ON m.display_name = r.member_id;

-- Per-screening average scores (only screenings that have at least one numeric score).
-- Used by the stats endpoint for highest/lowest rated films.
CREATE VIEW IF NOT EXISTS v_film_scores AS
  SELECT
    ws.week_key        AS weekKey,
    f.title,
    f.year,
    f.imdb_id          AS imdbId,
    ROUND(AVG(r.score), 2) AS averageScore,
    COUNT(r.rating_id) AS ratingCount
  FROM weekly_screenings ws
  JOIN films f ON f.id = ws.film_id
  JOIN ratings r ON r.screening_id = ws.week_key
  WHERE r.score IS NOT NULL
  GROUP BY ws.week_key
  HAVING ratingCount > 0;

-- Per-member average score across all screenings.
-- Used by the stats endpoint.
CREATE VIEW IF NOT EXISTS v_member_rating_averages AS
  SELECT
    m.display_name     AS displayName,
    m.profile_color    AS profileColor,
    m.profile_emoji    AS profileEmoji,
    ROUND(AVG(r.score), 2) AS averageScore,
    COUNT(r.rating_id) AS ratingCount
  FROM members m
  JOIN ratings r ON r.member_id = m.display_name
  WHERE r.score IS NOT NULL
  GROUP BY m.display_name;

-- All ratings where the score equals that member's personal maximum.
-- Ties are broken in the worker by taking the most recent watch_date.
-- Used by the stats endpoint for member favourites.
CREATE VIEW IF NOT EXISTS v_member_top_rated_films AS
  SELECT
    m.display_name     AS displayName,
    m.profile_color    AS profileColor,
    m.profile_emoji    AS profileEmoji,
    f.title,
    f.year,
    f.imdb_id          AS imdbId,
    ws.week_key        AS weekKey,
    ws.watch_date      AS watchDate,
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
