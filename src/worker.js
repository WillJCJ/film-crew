const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

export default {
  async fetch(request, env) {
    try {
      return await routeRequest(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json(
          {
            error: error.code || "request_error",
            message: error.message
          },
          error.status
        );
      }

      console.error(error);
      return json(
        {
          error: "internal_error",
          message: "Unexpected server error."
        },
        500
      );
    }
  }
};

async function routeRequest(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (pathname === "/api/health" && request.method === "GET") {
    return json({ ok: true });
  }

  if (pathname === "/api/me" && request.method === "GET") {
    const member = await extractMemberFromAuth(request, env);
    return json({ member });
  }

  if (pathname === "/api/members" && request.method === "GET") {
    const members = await listMembers(env.DB);
    return json({ members });
  }

  if (pathname === "/api/screenings" && request.method === "GET") {
    const screenings = await listScreenings(env.DB);
    return json({ screenings });
  }

  if (pathname === "/api/screenings/current" && request.method === "GET") {
    const screening = await getCurrentScreening(env.DB);
    return json({ screening });
  }

  if (pathname.match(/^\/api\/screenings\/[\w-]+$/) && request.method === "GET") {
    const weekKey = pathname.split("/").pop();
    const screening = await getScreeningById(env.DB, weekKey);

    if (!screening) {
      return json({ error: "not_found", message: "Screening not found." }, 404);
    }

    return json({ screening });
  }

  if (pathname.match(/^\/api\/screenings\/[\w-]+\/ratings$/) && request.method === "POST") {
    const member = await extractMemberFromAuth(request, env);
    const weekKey = pathname.split("/")[3];
    return handleUpsertRating(request, env, member, weekKey);
  }

  if (pathname === "/api/admin/film-search" && request.method === "GET") {
    const member = await extractMemberFromAuth(request, env);
    await requireAdmin(env.DB, member);

    const query = url.searchParams.get("q")?.trim();
    if (!query) {
      return json({ error: "invalid_request", message: "Query is required." }, 400);
    }

    const results = await searchOmdb(env, query);
    return json({ results });
  }

  if (pathname === "/api/admin/screenings" && request.method === "POST") {
    const member = await extractMemberFromAuth(request, env);
    await requireAdmin(env.DB, member);

    return handleCreateScreening(request, env);
  }

  const assetResponse = await env.ASSETS.fetch(request);
  const contentType = assetResponse.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return assetResponse;
  }

  let authed = false;
  try {
    await extractMemberFromAuth(request, env);
    authed = true;
  } catch {
    // not authenticated
  }

  if (!authed) {
    return assetResponse;
  }

  const html = await assetResponse.text();
  const patched = html.replace("<body>", '<body data-authed>');
  const headers = new Headers(assetResponse.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.delete("content-length");
  return new Response(patched, { status: assetResponse.status, headers });
}

async function extractMemberFromAuth(request, env) {
  const assertion = getAccessJwtAssertion(request);
  if (!assertion) {
    const devEmail = String(env.DEV_AUTH_EMAIL || "").trim();
    if (devEmail) {
      const member = await getMemberByEmail(env.DB, devEmail);
      if (!member) {
        throw new HttpError(403, "DEV_AUTH_EMAIL does not match a seeded member.", "not_a_member");
      }
      return member;
    }

    throw new HttpError(401, "Cloudflare One authentication required.", "unauthorized");
  }

  let claims;
  try {
    const parts = assertion.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    claims = JSON.parse(decoded);
  } catch (error) {
    throw new HttpError(401, "Invalid authentication token.", "unauthorized");
  }

  const email = claims.email;
  if (!email) {
    throw new HttpError(401, "Token missing email claim.", "unauthorized");
  }

  const member = await getMemberByEmail(env.DB, email);

  if (!member) {
    throw new HttpError(403, "Member not found. Please contact an admin.", "not_a_member");
  }

  return {
    email: member.email,
    displayName: member.displayName
  };
}

async function getMemberByEmail(db, email) {
  return db.prepare("SELECT email, display_name AS displayName FROM members WHERE email = ? LIMIT 1")
    .bind(email)
    .first();
}

function getAccessJwtAssertion(request) {
  const headerAssertion = request.headers.get("cf-access-jwt-assertion");
  if (headerAssertion) {
    return headerAssertion;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === "CF_Authorization") {
      return rawValue.join("=") || null;
    }
  }

  return null;
}

async function requireAdmin(db, member) {
  const adminRow = await db.prepare("SELECT 1 FROM members WHERE display_name = ? AND is_admin = 1 LIMIT 1")
    .bind(member.displayName)
    .first();

  if (!adminRow) {
    throw new HttpError(403, "Admin access required.", "forbidden");
  }
}

async function handleCreateScreening(request, env) {
  const body = await readJson(request);
  const watchDate = String(body.watchDate || "").trim();
  const weekKeyInput = String(body.weekKey || "").trim();
  const chooserDisplayName = String(body.chooserDisplayName || "").trim() || null;
  const guestPickerName = String(body.guestPickerName || "").trim() || null;
  const imdbId = String(body.imdbId || "").trim();
  const notes = String(body.notes || "").trim() || null;

  if ((!watchDate && !weekKeyInput) || (!chooserDisplayName && !guestPickerName) || !imdbId) {
    return json(
      {
        error: "invalid_request",
        message: "Provide watchDate or weekKey, chooserDisplayName or guestPickerName, and IMDb ID."
      },
      400
    );
  }

  const weekKey = watchDate ? toWeekKey(watchDate) : weekKeyInput;
  if (!weekKey) {
    return json({ error: "invalid_request", message: "weekKey is required when watchDate is omitted." }, 400);
  }

  const filmId = await ensureFilmByImdbId(env, imdbId);

  if (!filmId) {
    return json({ error: "omdb_error", message: "Unable to import film from OMDb." }, 502);
  }

  try {
    await env.DB.prepare(
      `
        INSERT INTO weekly_screenings (week_key, watch_date, chooser_member_id, guest_picker_name, film_id, notes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `
    )
      .bind(weekKey, watchDate || null, chooserDisplayName, guestPickerName, filmId, notes)
      .run();

    const screening = await getScreeningById(env.DB, weekKey);
    return json({ screening }, 201);
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE constraint failed")) {
      return json({ error: "duplicate_week", message: "That screening week already exists." }, 409);
    }

    throw error;
  }
}

async function handleUpsertRating(request, env, member, weekKey) {
  const body = await readJson(request);
  const rawScore = body.score;
  const hasScore = rawScore !== undefined && rawScore !== null && String(rawScore).trim() !== "";
  const score = hasScore ? Number(rawScore) : null;
  const reaction = String(body.reaction || "").trim() || null;
  const review = String(body.review || "").trim() || null;

  if (!hasScore && !reaction) {
    return json({ error: "invalid_request", message: "Provide a score or reaction." }, 400);
  }

  if (hasScore && (!Number.isFinite(score) || score < 1)) {
    return json({ error: "invalid_request", message: "Score must be a number greater than or equal to 1." }, 400);
  }

  const screening = await env.DB.prepare("SELECT week_key FROM weekly_screenings WHERE week_key = ? LIMIT 1")
    .bind(weekKey)
    .first();

  if (!screening) {
    return json({ error: "not_found", message: "Screening not found." }, 404);
  }

  await env.DB.prepare(
    `
      INSERT INTO ratings (screening_id, member_id, score, reaction, review, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(screening_id, member_id)
      DO UPDATE SET score = excluded.score, reaction = excluded.reaction, review = excluded.review, updated_at = CURRENT_TIMESTAMP
    `
  )
    .bind(weekKey, member.displayName, score, reaction, review)
    .run();

  const updatedScreening = await getScreeningById(env.DB, weekKey);
  return json({ screening: updatedScreening });
}

async function systemNeedsSetup(db) {
  const row = await db.prepare("SELECT COUNT(*) AS memberCount FROM members").first();
  return Number(row?.memberCount || 0) === 0;
}

async function requireSession(request, env) {
  const token = readCookie(request, "film_crew_session");
  if (!token) {
    throw new HttpError(401, "Authentication required.", "unauthorized");
  }

  const sessionId = await sha256(token);
  const session = await env.DB.prepare(
    `
      SELECT
        sessions.expires_at AS expiresAt,
        members.id AS memberId,
        members.username AS username,
        members.display_name AS displayName,
        members.role AS role
      FROM sessions
      JOIN members ON members.id = sessions.member_id
      WHERE sessions.id = ?
      LIMIT 1
    `
  )
    .bind(sessionId)
    .first();

  if (!session || new Date(session.expiresAt).getTime() < Date.now()) {
    throw new HttpError(401, "Session expired.", "unauthorized");
  }

  return {
    member: {
      id: session.memberId,
      username: session.username,
      displayName: session.displayName,
      role: session.role
    }
  };
}

async function listMembers(db) {
  const result = await db.prepare(
    `
      SELECT email, display_name AS displayName, is_admin AS isAdmin
      FROM members
      ORDER BY display_name ASC
    `
  ).all();

  return result.results || [];
}

async function listScreenings(db) {
  const result = await db.prepare(
    `
      SELECT
        weekly_screenings.week_key AS weekKey,
        weekly_screenings.watch_date AS watchDate,
        weekly_screenings.guest_picker_name AS guestPickerName,
        weekly_screenings.notes,
        members.display_name AS chooserName,
        films.imdb_id AS imdbId,
        films.title,
        films.year,
        films.runtime,
        films.director,
        films.genre,
        films.plot,
        films.poster_url AS posterUrl,
        films.imdb_rating AS imdbRating,
        films.imdb_votes AS imdbVotes,
        ROUND(AVG(ratings.score), 2) AS averageScore,
        COUNT(ratings.rating_id) AS ratingCount
      FROM weekly_screenings
      LEFT JOIN members ON members.display_name = weekly_screenings.chooser_member_id
      JOIN films ON films.id = weekly_screenings.film_id
      LEFT JOIN ratings ON ratings.screening_id = weekly_screenings.week_key
      GROUP BY weekly_screenings.week_key
      ORDER BY (weekly_screenings.watch_date IS NULL), weekly_screenings.watch_date DESC
    `
  ).all();

  return (result.results || []).map(mapScreeningSummary);
}

async function getCurrentScreening(db) {
  const row = await db.prepare(
    `
      SELECT week_key
      FROM weekly_screenings
      ORDER BY (watch_date IS NULL), watch_date DESC
      LIMIT 1
    `
  ).first();

  if (!row) {
    return null;
  }

  return getScreeningById(db, row.week_key);
}

async function getScreeningById(db, weekKey) {
  const screening = await db.prepare(
    `
      SELECT
        weekly_screenings.week_key AS weekKey,
        weekly_screenings.watch_date AS watchDate,
        weekly_screenings.guest_picker_name AS guestPickerName,
        weekly_screenings.notes,
        members.display_name AS chooserName,
        films.imdb_id AS imdbId,
        films.title,
        films.year,
        films.runtime,
        films.director,
        films.genre,
        films.plot,
        films.poster_url AS posterUrl,
        films.imdb_rating AS imdbRating,
        films.imdb_votes AS imdbVotes,
        ROUND(AVG(ratings.score), 2) AS averageScore,
        COUNT(ratings.rating_id) AS ratingCount
      FROM weekly_screenings
      LEFT JOIN members ON members.display_name = weekly_screenings.chooser_member_id
      JOIN films ON films.id = weekly_screenings.film_id
      LEFT JOIN ratings ON ratings.screening_id = weekly_screenings.week_key
      WHERE weekly_screenings.week_key = ?
      GROUP BY weekly_screenings.week_key
      LIMIT 1
    `
  )
    .bind(weekKey)
    .first();

  if (!screening) {
    return null;
  }

  const ratingsResult = await db.prepare(
    `
      SELECT
        ratings.rating_id AS ratingId,
        ratings.score,
        ratings.reaction,
        ratings.review,
        ratings.updated_at AS updatedAt,
        members.display_name AS memberName
      FROM ratings
      JOIN members ON members.display_name = ratings.member_id
      WHERE ratings.screening_id = ?
      ORDER BY members.display_name ASC
    `
  )
    .bind(weekKey)
    .all();

  return {
    ...mapScreeningSummary(screening),
    ratings: ratingsResult.results || []
  };
}

function mapScreeningSummary(row) {
  return {
    weekKey: row.weekKey,
    watchDate: row.watchDate,
    guestPickerName: row.guestPickerName,
    notes: row.notes,
    chooser: {
      name: row.chooserName || row.guestPickerName || "Guest"
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

async function ensureFilmByImdbId(env, imdbId) {
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
    `
      INSERT INTO films (
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
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `
  )
    .bind(
      film.imdbId,
      film.title,
      film.year,
      film.runtime,
      film.director,
      film.genre,
      film.plot,
      film.posterUrl,
      film.imdbRating,
      film.imdbVotes,
      JSON.stringify(film.raw)
    )
    .run();

  return Number(result.meta.last_row_id);
}

async function searchOmdb(env, query) {
  const apiKey = env.OMDB_API_KEY;
  if (!apiKey) {
    throw new HttpError(500, "OMDB_API_KEY is not configured.");
  }

  const response = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&s=${encodeURIComponent(query)}`);
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

async function fetchOmdbById(env, imdbId) {
  const apiKey = env.OMDB_API_KEY;
  if (!apiKey) {
    throw new HttpError(500, "OMDB_API_KEY is not configured.");
  }

  const response = await fetch(`https://www.omdbapi.com/?apikey=${encodeURIComponent(apiKey)}&i=${encodeURIComponent(imdbId)}&plot=full`);
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

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: jsonHeaders
  });
}

function toWeekKey(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, "Watch date must be a valid ISO date.");
  }

  const normalized = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = normalized.getUTCDay() || 7;
  normalized.setUTCDate(normalized.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((normalized - yearStart) / 86400000) + 1) / 7);
  return `${normalized.getUTCFullYear()}-W${String(weekNumber).padStart(2, "0")}`;
}

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
});
