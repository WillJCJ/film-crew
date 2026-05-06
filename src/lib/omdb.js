import { HttpError } from "./http.js";

export async function fetchOmdbById(env, imdbId) {
  const apiKey = env.OMDB_API_KEY;
  if (!apiKey) {
    throw new HttpError(500, "OMDB_API_KEY is not configured.");
  }

  const response = await fetch(
    `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(imdbId)}&plot=full`
  );
  const payload = await response.json();

  if (!response.ok || payload.Response === "False") {
    return null;
  }

  return {
    imdbId: payload.imdbID,
    title: payload.Title,
    year: payload.Year,
    runtime: payload.Runtime === "N/A" ? null : payload.Runtime,
    director: payload.Director === "N/A" ? null : payload.Director,
    genre: payload.Genre === "N/A" ? null : payload.Genre,
    plot: payload.Plot === "N/A" ? null : payload.Plot,
    posterUrl: payload.Poster === "N/A" ? null : payload.Poster,
    imdbRating: payload.imdbRating === "N/A" ? null : payload.imdbRating,
    imdbVotes: payload.imdbVotes === "N/A" ? null : payload.imdbVotes,
    raw: payload
  };
}

export async function searchOmdb(env, query) {
  const apiKey = env.OMDB_API_KEY;
  if (!apiKey) {
    throw new HttpError(500, "OMDB_API_KEY is not configured.");
  }

  const response = await fetch(
    `https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&s=${encodeURIComponent(query)}`
  );
  const payload = await response.json();

  if (!response.ok || payload.Response === "False") {
    return [];
  }

  return (payload.Search || []).map((item) => ({
    imdbId: item.imdbID,
    title: item.Title,
    year: item.Year,
    posterUrl: item.Poster && item.Poster !== "N/A" ? item.Poster : null,
    type: item.Type
  }));
}

export async function ensureFilmByImdbId(env, imdbId) {
  const existing = await env.DB.prepare("SELECT id FROM films WHERE imdb_id = ? LIMIT 1")
    .bind(imdbId)
    .first();

  if (existing) {
    return existing.id;
  }

  const film = await fetchOmdbById(env, imdbId);
  if (!film) {
    return null;
  }

  const result = await env.DB.prepare(
    `INSERT INTO films (
      imdb_id, title, year, runtime, director, genre, plot,
      poster_url, imdb_rating, imdb_votes, raw_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
  )
    .bind(
      film.imdbId, film.title, film.year, film.runtime, film.director,
      film.genre, film.plot, film.posterUrl, film.imdbRating, film.imdbVotes,
      JSON.stringify(film.raw)
    )
    .run();

  return Number(result.meta.last_row_id);
}
