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

  if (pathname === "/api/me/profile" && request.method === "PUT") {
    const member = await extractMemberFromAuth(request, env);
    return handleUpdateOwnProfile(request, env.DB, member);
  }

  if (pathname === "/api/members" && request.method === "GET") {
    const member = await extractMemberFromAuth(request, env);
    await requireAdmin(env.DB, member);
    const members = await listMembers(env.DB);
    return json({ members });
  }

  if (pathname === "/api/admin/members/profile" && request.method === "PUT") {
    const member = await extractMemberFromAuth(request, env);
    await requireAdmin(env.DB, member);
    return handleAdminUpdateMemberProfile(request, env.DB);
  }

  if (pathname === "/api/admin/rotation" && request.method === "PUT") {
    const member = await extractMemberFromAuth(request, env);
    await requireAdmin(env.DB, member);
    return handleUpdateRotation(request, env.DB);
  }

  if (pathname === "/api/screenings" && request.method === "GET") {
    const screenings = await listScreenings(env.DB);
    return json({ screenings });
  }

  if (pathname === "/api/stats" && request.method === "GET") {
    return handleGetStats(env.DB);
  }

  if (pathname === "/api/rotation" && request.method === "GET") {
    await extractMemberFromAuth(request, env);
    return handleGetRotation(env.DB);
  }

  if (pathname === "/api/settings/screening-day" && request.method === "PUT") {
    await extractMemberFromAuth(request, env);
    return handleUpdateScreeningDay(request, env.DB);
  }

  if (pathname === "/api/screenings" && request.method === "POST") {
    const member = await extractMemberFromAuth(request, env);
    return handlePickerCreateScreening(request, env, member);
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

  if (pathname.match(/^\/api\/films\/tt\d+\/omdb$/) && request.method === "GET") {
    await extractMemberFromAuth(request, env);
    const imdbId = pathname.split("/")[3];
    return handleGetFilmOmdb(env, imdbId);
  }

  if (pathname.match(/^\/api\/films\/tt\d+\/refresh$/) && request.method === "POST") {
    await extractMemberFromAuth(request, env);
    const imdbId = pathname.split("/")[3];
    return handleRefreshFilmOmdb(env, imdbId);
  }

  if (pathname === "/api/admin/films/refresh-all" && request.method === "POST") {
    const member = await extractMemberFromAuth(request, env);
    await requireAdmin(env.DB, member);
    return handleRefreshAllFilms(env);
  }

  if (pathname.match(/^\/api\/admin\/screenings\/[\w-]+\/film$/) && request.method === "PATCH") {
    await extractMemberFromAuth(request, env);
    const weekKey = pathname.split("/")[4];
    return handleUpdateScreeningFilm(request, env, weekKey);
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

  let assetRequest = request;
  if (request.method === "GET" && /^\/archive\/[\w-]+\/?$/.test(pathname)) {
    const rewritten = new URL(request.url);
    rewritten.pathname = "/archive-detail/";
    assetRequest = new Request(rewritten.toString(), request);
  }

  const assetResponse = await env.ASSETS.fetch(assetRequest);
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

  const isDashboard = pathname === "/dashboard" || pathname === "/dashboard/";
  if (!authed && isDashboard) {
    return Response.redirect(new URL("/login/", request.url).toString(), 302);
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
  } catch {
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
    displayName: member.displayName,
    isAdmin: Boolean(member.isAdmin),
    profileColor: member.profileColor,
    profileEmoji: member.profileEmoji
  };
}

async function getMemberByEmail(db, email) {
  return db.prepare(`
    SELECT
      email,
      display_name AS displayName,
      is_admin AS isAdmin,
      profile_color AS profileColor,
      profile_emoji AS profileEmoji
    FROM members
    WHERE email = ?
    LIMIT 1
  `)
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

async function handleUpdateOwnProfile(request, db, member) {
  const body = await readJson(request);
  const profile = parseProfileInput(body);

  await updateMemberProfile(db, member.displayName, profile);
  const refreshed = await getMemberByDisplayName(db, member.displayName);
  return json({ member: refreshed });
}

async function handleAdminUpdateMemberProfile(request, db) {
  const body = await readJson(request);
  const displayName = String(body.displayName || "").trim();

  if (!displayName) {
    return json({ error: "invalid_request", message: "displayName is required." }, 400);
  }

  const profile = parseProfileInput(body);
  await updateMemberProfile(db, displayName, profile);

  const updated = await getMemberByDisplayName(db, displayName);
  if (!updated) {
    return json({ error: "not_found", message: "Member not found." }, 404);
  }

  return json({ member: updated });
}

function parseProfileInput(body) {
  const rawColor = String(body.profileColor || "").trim();
  const rawEmoji = String(body.profileEmoji || "").trim();

  if (!/^#[0-9a-fA-F]{6}$/.test(rawColor)) {
    throw new HttpError(400, "profileColor must be a hex value like #4A7C59.", "invalid_request");
  }

  if (!isSingleEmoji(rawEmoji)) {
    throw new HttpError(400, "profileEmoji must be exactly one emoji, with no text.", "invalid_request");
  }

  return {
    profileColor: rawColor.toUpperCase(),
    profileEmoji: rawEmoji
  };
}

function countGraphemes(value) {
  if (!value) {
    return 0;
  }

  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(value)).length;
  }

  return Array.from(value).length;
}

function isSingleEmoji(value) {
  if (!value) {
    return false;
  }

  const trimmed = value.trim();
  if (!trimmed || countGraphemes(trimmed) !== 1) {
    return false;
  }

  if (/[\p{L}]/u.test(trimmed)) {
    return false;
  }

  return /(\p{Extended_Pictographic}|\p{Regional_Indicator})/u.test(trimmed);
}

async function updateMemberProfile(db, displayName, profile) {
  const result = await db.prepare(
    `
      UPDATE members
      SET profile_color = ?, profile_emoji = ?, updated_at = CURRENT_TIMESTAMP
      WHERE display_name = ?
    `
  )
    .bind(profile.profileColor, profile.profileEmoji, displayName)
    .run();

  if (Number(result.meta?.changes || 0) === 0) {
    throw new HttpError(404, "Member not found.", "not_found");
  }
}

async function getMemberByDisplayName(db, displayName) {
  return db.prepare(
    `
      SELECT
        email,
        display_name AS displayName,
        is_admin AS isAdmin,
        profile_color AS profileColor,
        profile_emoji AS profileEmoji
      FROM members
      WHERE display_name = ?
      LIMIT 1
    `
  )
    .bind(displayName)
    .first();
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

async function listMembers(db) {
  const result = await db.prepare(
    `
      SELECT
        email,
        display_name AS displayName,
        is_admin AS isAdmin,
        profile_color AS profileColor,
        profile_emoji AS profileEmoji,
        rotation_order AS rotationOrder
      FROM members
      ORDER BY display_name ASC
    `
  ).all();

  return result.results || [];
}

function nextOccurrenceOfDay(dayOfWeek) {
  const now = new Date();
  const todayDay = now.getUTCDay();
  let daysUntil = (dayOfWeek - todayDay + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntil);
  return new Date(ms).toISOString().slice(0, 10);
}

async function getRotationData(db) {
  const [rotationResult, settingRow, lastScreeningRow] = await Promise.all([
    db.prepare(
      `SELECT display_name AS displayName, profile_color AS profileColor, profile_emoji AS profileEmoji, rotation_order AS rotationOrder
       FROM members WHERE rotation_order IS NOT NULL ORDER BY rotation_order ASC`
    ).all(),
    db.prepare("SELECT value FROM settings WHERE key = 'screening_day'").first(),
    db.prepare(
      "SELECT chooser_member_id FROM weekly_screenings WHERE chooser_member_id IS NOT NULL ORDER BY week_key DESC LIMIT 1"
    ).first()
  ]);

  const rotation = rotationResult.results || [];
  const screeningDayOfWeek = Number(settingRow?.value ?? 4);
  const nextScreeningDate = nextOccurrenceOfDay(screeningDayOfWeek);

  let nextPicker = null;
  if (rotation.length > 0) {
    const lastPickerName = lastScreeningRow?.chooser_member_id || null;
    const lastIdx = lastPickerName ? rotation.findIndex((m) => m.displayName === lastPickerName) : -1;
    const nextIdx = lastIdx === -1 ? 0 : (lastIdx + 1) % rotation.length;
    nextPicker = rotation[nextIdx];
  }

  return { rotation, nextPicker, screeningDayOfWeek, nextScreeningDate };
}

async function handleGetRotation(db) {
  return json(await getRotationData(db));
}

async function handleUpdateScreeningDay(request, db) {
  const body = await readJson(request);
  const day = Number(body.day);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return json({ error: "invalid_request", message: "day must be 0 (Sunday) to 6 (Saturday)." }, 400);
  }
  await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('screening_day', ?)").bind(String(day)).run();
  return json({ screeningDayOfWeek: day });
}

async function handleUpdateRotation(request, db) {
  const body = await readJson(request);
  if (!Array.isArray(body.order)) {
    return json({ error: "invalid_request", message: "order must be an array of display names." }, 400);
  }
  await db.prepare("UPDATE members SET rotation_order = NULL").run();
  for (let i = 0; i < body.order.length; i++) {
    await db.prepare("UPDATE members SET rotation_order = ? WHERE display_name = ?")
      .bind(i, String(body.order[i])).run();
  }
  return json(await getRotationData(db));
}

async function handlePickerCreateScreening(request, env, member) {
  const data = await getRotationData(env.DB);

  if (!member.isAdmin) {
    if (!data.nextPicker || data.nextPicker.displayName !== member.displayName) {
      throw new HttpError(403, "It is not your turn to pick this week.", "forbidden");
    }
  }

  const body = await readJson(request);
  const imdbId = String(body.imdbId || "").trim();
  const guestPickerName = String(body.guestPickerName || "").trim() || null;
  const notes = String(body.notes || "").trim() || null;

  if (!imdbId) {
    return json({ error: "invalid_request", message: "imdbId is required." }, 400);
  }

  const watchDate = data.nextScreeningDate;
  const weekKey = toWeekKey(watchDate);
  const filmId = await ensureFilmByImdbId(env, imdbId);

  if (!filmId) {
    return json({ error: "omdb_error", message: "Unable to import film from OMDb." }, 502);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO weekly_screenings (week_key, watch_date, chooser_member_id, guest_picker_name, film_id, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
    ).bind(weekKey, watchDate, member.displayName, guestPickerName, filmId, notes).run();

    const screening = await getScreeningById(env.DB, weekKey);
    return json({ screening }, 201);
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE constraint failed")) {
      return json({ error: "duplicate_week", message: "A screening for that week already exists." }, 409);
    }
    throw error;
  }
}

async function handleGetStats(db) {
  const [highestRow, lowestRow, memberRows, favRows] = await Promise.all([
    db.prepare(
      "SELECT * FROM v_film_scores ORDER BY averageScore DESC LIMIT 1"
    ).first(),
    db.prepare(
      "SELECT * FROM v_film_scores ORDER BY averageScore ASC LIMIT 1"
    ).first(),
    db.prepare(
      "SELECT * FROM v_member_rating_averages ORDER BY displayName ASC"
    ).all(),
    db.prepare(
      "SELECT * FROM v_member_top_rated_films ORDER BY displayName ASC, watchDate DESC"
    ).all()
  ]);

  // Deduplicate favorites: one per member (first row wins, which is most recent on tie)
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

async function listScreenings(db) {
  const result = await db.prepare(
    "SELECT * FROM v_screening_summary ORDER BY CASE WHEN watchDate IS NULL THEN 1 ELSE 0 END, watchDate DESC, weekKey DESC"
  ).all();

  return (result.results || []).map(mapScreeningSummary);
}

async function getCurrentScreening(db) {
  const row = await db.prepare(
    "SELECT week_key FROM weekly_screenings ORDER BY CASE WHEN watch_date IS NULL THEN 1 ELSE 0 END, watch_date DESC, week_key DESC LIMIT 1"
  ).first();

  if (!row) {
    return null;
  }

  return getScreeningById(db, row.week_key);
}

async function getScreeningById(db, weekKey) {
  const screening = await db.prepare(
    "SELECT * FROM v_screening_summary WHERE weekKey = ? LIMIT 1"
  )
    .bind(weekKey)
    .first();

  if (!screening) {
    return null;
  }

  const ratingsResult = await db.prepare(
    "SELECT * FROM v_rating_with_member WHERE screeningId = ? ORDER BY memberName ASC"
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

async function handleGetFilmOmdb(env, imdbId) {
  const film = await fetchOmdbById(env, imdbId);
  if (!film) {
    return json({ error: "not_found", message: "Film not found in OMDb." }, 404);
  }

  return json({
    film: {
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
    }
  });
}

async function handleRefreshFilmOmdb(env, imdbId) {
  const film = await fetchOmdbById(env, imdbId);
  if (!film) {
    return json({ error: "not_found", message: "Film not found in OMDb." }, 404);
  }

  const result = await env.DB.prepare(
    `
      UPDATE films
      SET
        title = ?,
        year = ?,
        runtime = ?,
        director = ?,
        genre = ?,
        plot = ?,
        poster_url = ?,
        imdb_rating = ?,
        imdb_votes = ?,
        raw_json = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE imdb_id = ?
    `
  )
    .bind(
      film.title,
      film.year,
      film.runtime,
      film.director,
      film.genre,
      film.plot,
      film.posterUrl,
      film.imdbRating,
      film.imdbVotes,
      JSON.stringify(film.raw),
      imdbId
    )
    .run();

  if (Number(result.meta?.changes || 0) === 0) {
    await env.DB.prepare(
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
  }

  return json({
    refreshed: true,
    film: {
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
    }
  });
}

async function handleRefreshAllFilms(env) {
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

async function handleUpdateScreeningFilm(request, env, weekKey) {
  const body = await readJson(request);
  const imdbId = String(body.imdbId || "").trim();

  if (!/^tt\d+$/.test(imdbId)) {
    return json({ error: "invalid_request", message: "imdbId must be a valid IMDb ID (e.g. tt1234567)." }, 400);
  }

  const filmId = await ensureFilmByImdbId(env, imdbId);
  if (!filmId) {
    return json({ error: "omdb_error", message: "Unable to find or import film from OMDb." }, 502);
  }

  await env.DB.prepare(
    "UPDATE weekly_screenings SET film_id = ?, updated_at = CURRENT_TIMESTAMP WHERE week_key = ?"
  )
    .bind(filmId, weekKey)
    .run();

  const screening = await getScreeningById(env.DB, weekKey);
  return json({ screening });
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
