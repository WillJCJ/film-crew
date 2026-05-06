import { json } from "../lib/http.js";
import { fetchOmdbById } from "../lib/omdb.js";

function filmPayload(film) {
  return {
    imdbId: film.imdbId,
    title: film.title,
    year: film.year,
    runtime: film.runtime,
    director: film.director,
    genre: film.genre,
    plot: film.plot,
    posterUrl: film.posterUrl,
    imdbRating: film.imdbRating,
    imdbVotes: film.imdbVotes,
    raw: film.raw
  };
}

export async function handleGetFilmOmdb(env, imdbId) {
  const film = await fetchOmdbById(env, imdbId);
  if (!film) {
    return json({ error: "not_found", message: "Film not found in OMDb." }, 404);
  }

  return json({ film: filmPayload(film) });
}

export async function handleRefreshFilmOmdb(env, imdbId) {
  const film = await fetchOmdbById(env, imdbId);
  if (!film) {
    return json({ error: "not_found", message: "Film not found in OMDb." }, 404);
  }

  const result = await env.DB.prepare(
    `UPDATE films
     SET title = ?, year = ?, runtime = ?, director = ?, genre = ?, plot = ?,
         poster_url = ?, imdb_rating = ?, imdb_votes = ?, raw_json = ?, updated_at = CURRENT_TIMESTAMP
     WHERE imdb_id = ?`
  )
    .bind(
      film.title, film.year, film.runtime, film.director, film.genre, film.plot,
      film.posterUrl, film.imdbRating, film.imdbVotes, JSON.stringify(film.raw), imdbId
    )
    .run();

  if (Number(result.meta?.changes || 0) === 0) {
    await env.DB.prepare(
      `INSERT INTO films (
        imdb_id, title, year, runtime, director, genre, plot,
        poster_url, imdb_rating, imdb_votes, raw_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    )
      .bind(
        film.imdbId, film.title, film.year, film.runtime, film.director, film.genre, film.plot,
        film.posterUrl, film.imdbRating, film.imdbVotes, JSON.stringify(film.raw)
      )
      .run();
  }

  return json({ refreshed: true, film: filmPayload(film) });
}

export async function handleRefreshAllFilms(env) {
  const { results } = await env.DB.prepare(
    "SELECT imdb_id FROM films WHERE imdb_id IS NOT NULL ORDER BY imdb_id"
  ).all();

  const outcomes = [];
  for (const row of results) {
    try {
      await handleRefreshFilmOmdb(env, row.imdb_id);
      outcomes.push({ imdbId: row.imdb_id, ok: true });
    } catch (err) {
      outcomes.push({ imdbId: row.imdb_id, ok: false, error: String(err) });
    }
  }

  const failed = outcomes.filter((o) => !o.ok);
  return json({ total: outcomes.length, failed: failed.length, outcomes });
}
