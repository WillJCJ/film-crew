import { json, readJson } from "../lib/http.js";
import { HttpError } from "../lib/http.js";
import { toWeekKey } from "../lib/date.js";
import { getScreeningById } from "../lib/db/screenings.js";
import { getRotationData } from "../lib/db/rotation.js";
import { ensureFilmByImdbId } from "../lib/omdb.js";

export async function handleCreateScreening(request, env) {
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
      `INSERT INTO weekly_screenings (week_key, watch_date, chooser_member_id, guest_picker_name, film_id, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`
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

export async function handlePickerCreateScreening(request, env, member) {
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
    )
      .bind(weekKey, watchDate, member.displayName, guestPickerName, filmId, notes)
      .run();

    const screening = await getScreeningById(env.DB, weekKey);
    return json({ screening }, 201);
  } catch (error) {
    if (String(error.message || "").includes("UNIQUE constraint failed")) {
      return json({ error: "duplicate_week", message: "A screening for that week already exists." }, 409);
    }
    throw error;
  }
}

export async function handleUpsertRating(request, env, member, weekKey) {
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
    `INSERT INTO ratings (screening_id, member_id, score, reaction, review, updated_at)
     VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(screening_id, member_id)
     DO UPDATE SET score = excluded.score, reaction = excluded.reaction,
                   review = excluded.review, updated_at = CURRENT_TIMESTAMP`
  )
    .bind(weekKey, member.displayName, score, reaction, review)
    .run();

  const updatedScreening = await getScreeningById(env.DB, weekKey);
  return json({ screening: updatedScreening });
}

export async function handleUpdateScreeningFilm(request, env, weekKey) {
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
