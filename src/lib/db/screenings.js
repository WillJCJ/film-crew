export function mapScreeningSummary(row) {
  return {
    weekKey: row.weekKey,
    watchDate: row.watchDate,
    guestPickerName: row.guestPickerName,
    notes: row.notes,
    chooser: {
      name: row.chooserName || row.guestPickerName || "Guest",
      profileColor: row.chooserColor || null,
      profileEmoji: row.chooserEmoji || null
    },
    film: {
      imdbId: row.imdbId,
      title: row.title,
      year: row.year,
      runtime: row.runtime,
      director: row.director,
      genre: row.genre,
      plot: row.plot,
      posterUrl: row.posterUrl,
      imdbRating: row.imdbRating,
      imdbVotes: row.imdbVotes
    },
    averageScore: row.averageScore === null ? null : Number(row.averageScore),
    ratingCount: Number(row.ratingCount || 0)
  };
}

export async function listScreenings(db) {
  const result = await db
    .prepare(
      `SELECT * FROM v_screening_summary
       ORDER BY CASE WHEN watchDate IS NULL THEN 1 ELSE 0 END, watchDate DESC, weekKey DESC`
    )
    .all();

  return (result.results || []).map(mapScreeningSummary);
}

export async function getCurrentScreening(db) {
  const row = await db
    .prepare(
      `SELECT week_key FROM weekly_screenings
       ORDER BY CASE WHEN watch_date IS NULL THEN 1 ELSE 0 END, watch_date DESC, week_key DESC LIMIT 1`
    )
    .first();

  if (!row) {
    return null;
  }

  return getScreeningById(db, row.week_key);
}

export async function getScreeningById(db, weekKey) {
  const screening = await db
    .prepare("SELECT * FROM v_screening_summary WHERE weekKey = ? LIMIT 1")
    .bind(weekKey)
    .first();

  if (!screening) {
    return null;
  }

  const ratingsResult = await db
    .prepare("SELECT * FROM v_rating_with_member WHERE screeningId = ? ORDER BY memberName ASC")
    .bind(weekKey)
    .all();

  return {
    ...mapScreeningSummary(screening),
    ratings: ratingsResult.results || []
  };
}
