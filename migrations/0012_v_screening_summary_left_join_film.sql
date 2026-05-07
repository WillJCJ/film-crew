-- Allow screenings without a film to appear in the summary view.
-- Previously used INNER JOIN films which excluded film-less rows.
DROP VIEW IF EXISTS v_screening_summary;

CREATE VIEW v_screening_summary AS
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
  LEFT JOIN films f ON f.id = ws.film_id
  LEFT JOIN ratings r ON r.screening_id = ws.week_key
  GROUP BY ws.week_key;
