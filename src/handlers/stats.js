import { json } from "../lib/http.js";

export async function handleGetStats(db) {
  const [highestRow, lowestRow, memberRows, favRows] = await Promise.all([
    db.prepare("SELECT * FROM v_film_scores ORDER BY averageScore DESC LIMIT 1").first(),
    db.prepare("SELECT * FROM v_film_scores ORDER BY averageScore ASC LIMIT 1").first(),
    db.prepare("SELECT * FROM v_member_rating_averages ORDER BY displayName ASC").all(),
    db.prepare("SELECT * FROM v_member_top_rated_films ORDER BY displayName ASC, watchDate DESC").all()
  ]);

  const seenMembers = new Set();
  const memberFavorites = (favRows.results || []).filter((row) => {
    if (seenMembers.has(row.displayName)) return false;
    seenMembers.add(row.displayName);
    return true;
  });

  return json({
    highestRated: highestRow || null,
    lowestRated: lowestRow || null,
    memberAverages: memberRows.results || [],
    memberFavorites
  });
}
