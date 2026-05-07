import { Hono } from "hono";
import { HttpError, json } from "./lib/http.js";
import { extractMemberFromAuth, requireAdmin } from "./lib/auth.js";
import { listMembers } from "./lib/db/members.js";
import { listScreenings, getCurrentScreening, getScreeningById } from "./lib/db/screenings.js";
import { searchOmdb } from "./lib/omdb.js";
import { handleUpdateOwnProfile, handleAdminUpdateMemberProfile } from "./handlers/members.js";
import {
  handleCreateScreening,
  handlePickerCreateScreening,
  handleDeleteOwnRating,
  handleUpsertRating,
  handleUpdateScreeningFilm
} from "./handlers/screenings.js";
import { handleGetFilmOmdb, handleRefreshFilmOmdb, handleRefreshAllFilms } from "./handlers/films.js";
import { handleGetRotation, handleUpdateScreeningDay, handleUpdateRotation } from "./handlers/rotation.js";
import { handleGetSchedule, handleUpsertScheduleSlot } from "./handlers/schedule.js";
import { handleGetStats } from "./handlers/stats.js";
import { toWeekKey } from "./lib/date.js";

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.code || "request_error", message: err.message }, err.status);
  }
  console.error(err);
  return c.json({ error: "internal_error", message: "Unexpected server error." }, 500);
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.get("/api/me", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  return json({ member });
});

app.put("/api/me/profile", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  return handleUpdateOwnProfile(c.req.raw, c.env.DB, member);
});

app.get("/api/members", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  await requireAdmin(c.env.DB, member);
  return json({ members: await listMembers(c.env.DB) });
});

app.put("/api/admin/members/profile", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  await requireAdmin(c.env.DB, member);
  return handleAdminUpdateMemberProfile(c.req.raw, c.env.DB);
});

app.put("/api/admin/rotation", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  await requireAdmin(c.env.DB, member);
  return handleUpdateRotation(c.req.raw, c.env.DB);
});

app.get("/api/screenings", async (c) => {
  return json({ screenings: await listScreenings(c.env.DB) });
});

app.get("/api/schedule", async (c) => {
  await extractMemberFromAuth(c.req.raw, c.env);
  return handleGetSchedule(c.env.DB);
});

app.put("/api/schedule", async (c) => {
  await extractMemberFromAuth(c.req.raw, c.env);
  return handleUpsertScheduleSlot(c.req.raw, c.env.DB);
});

app.get("/api/stats", (c) => handleGetStats(c.env.DB));

app.get("/api/rotation", async (c) => {
  await extractMemberFromAuth(c.req.raw, c.env);
  return handleGetRotation(c.env.DB);
});

app.put("/api/settings/screening-day", async (c) => {
  await extractMemberFromAuth(c.req.raw, c.env);
  return handleUpdateScreeningDay(c.req.raw, c.env.DB);
});

app.post("/api/screenings", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  return handlePickerCreateScreening(c.req.raw, c.env, member);
});

app.get("/api/screenings/current", async (c) => {
  return json({ screening: await getCurrentScreening(c.env.DB) });
});

app.get("/api/screenings/:weekKey", async (c) => {
  const screening = await getScreeningById(c.env.DB, c.req.param("weekKey"));
  if (!screening) {
    return json({ error: "not_found", message: "Screening not found." }, 404);
  }
  return json({ screening });
});

app.post("/api/screenings/:weekKey/ratings", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  return handleUpsertRating(c.req.raw, c.env, member, c.req.param("weekKey"));
});

app.delete("/api/screenings/:weekKey/ratings", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  return handleDeleteOwnRating(c.env, member, c.req.param("weekKey"));
});

app.get("/api/films/:imdbId/omdb", async (c) => {
  await extractMemberFromAuth(c.req.raw, c.env);
  return handleGetFilmOmdb(c.env, c.req.param("imdbId"));
});

app.post("/api/films/:imdbId/refresh", async (c) => {
  await extractMemberFromAuth(c.req.raw, c.env);
  return handleRefreshFilmOmdb(c.env, c.req.param("imdbId"));
});

app.post("/api/admin/films/refresh-all", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  await requireAdmin(c.env.DB, member);
  return handleRefreshAllFilms(c.env);
});

app.patch("/api/admin/screenings/:weekKey/film", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  return handleUpdateScreeningFilm(c.req.raw, c.env, member, c.req.param("weekKey"));
});

app.get("/api/admin/film-search", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  await requireAdmin(c.env.DB, member);
  const query = c.req.query("q")?.trim();
  if (!query) {
    return json({ error: "invalid_request", message: "Query is required." }, 400);
  }
  return json({ results: await searchOmdb(c.env, query) });
});

app.post("/api/admin/screenings", async (c) => {
  const member = await extractMemberFromAuth(c.req.raw, c.env);
  await requireAdmin(c.env.DB, member);
  return handleCreateScreening(c.req.raw, c.env);
});

// ── Bot API (/api/bot/*) ──────────────────────────────────────────────────────
// Authenticated via X-Bot-Secret header instead of Cloudflare One.

function botAuth(c) {
  if (c.req.header("X-Bot-Secret") !== c.env.BOT_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }
}

// Resolve telegram username → member
app.get("/api/bot/members/by-telegram/:username", async (c) => {
  const err = botAuth(c);
  if (err) return err;
  const row = await c.env.DB.prepare(
    "SELECT display_name AS displayName, email, is_admin AS isAdmin FROM members WHERE telegram_username = ?"
  ).bind(c.req.param("username")).first();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

// All screenings (reuses existing listScreenings which queries v_screening_summary)
app.get("/api/bot/screenings", async (c) => {
  const err = botAuth(c);
  if (err) return err;
  return c.json(await listScreenings(c.env.DB));
});

// Most recent screening
app.get("/api/bot/screenings/last", async (c) => {
  const err = botAuth(c);
  if (err) return err;
  const row = await c.env.DB.prepare(
      "SELECT weekKey, watchDate, chooserName, guestPickerName, title, averageScore FROM v_screening_summary ORDER BY watchDate DESC LIMIT 1"
  ).first();
  return c.json(row ?? null);
});

// Screenings by picker name
app.get("/api/bot/screenings/by/:name", async (c) => {
  const err = botAuth(c);
  if (err) return err;
  const { results } = await c.env.DB.prepare(
      "SELECT weekKey, watchDate, chooserName, title, averageScore FROM v_screening_summary WHERE chooserName = ? ORDER BY watchDate DESC"
  ).bind(c.req.param("name")).all();
  return c.json(results);
});

// Create a screening from the bot (minimal film record, no OMDb)
app.post("/api/bot/screenings", async (c) => {
  const err = botAuth(c);
  if (err) return err;
  const { title, display_name, watch_date } = await c.req.json();

  // Find or create a minimal film record
  let film = await c.env.DB.prepare(
      "SELECT id FROM films WHERE LOWER(title) = LOWER(?)"
  ).bind(title).first();

  if (!film) {
    const result = await c.env.DB.prepare(
        "INSERT INTO films (title) VALUES (?)"
    ).bind(title).run();
    film = { id: result.meta.last_row_id };
  }

    const weekKey = (watch_date && watch_date !== "TBD")
      ? toWeekKey(watch_date)
      : `bot-${Date.now()}`;

  await c.env.DB.prepare(
      "INSERT INTO weekly_screenings (week_key, watch_date, chooser_member_id, film_id) VALUES (?, ?, ?, ?)"
  ).bind(weekKey, watch_date === "TBD" ? null : watch_date, display_name, film.id).run();

  return c.json({ week_key: weekKey });
});

// Submit or update a rating
app.post("/api/bot/ratings", async (c) => {
  const err = botAuth(c);
  if (err) return err;
  const { week_key, display_name, score } = await c.req.json();

  await c.env.DB.prepare(`
    INSERT INTO ratings (screening_id, member_id, score)
    VALUES (?, ?, ?)
    ON CONFLICT(screening_id, member_id)
    DO UPDATE SET score = excluded.score, updated_at = CURRENT_TIMESTAMP
  `).bind(week_key, display_name, score).run();

  const avg = await c.env.DB.prepare(
      "SELECT ROUND(AVG(score), 2) as avg_score FROM ratings WHERE screening_id = ? AND score IS NOT NULL"
  ).bind(week_key).first();

  return c.json({ avg_score: avg.avg_score });
});

// ─────────────────────────────────────────────────────────────────────────────

app.get("*", async (c) => {
  let assetRequest = c.req.raw;
  if (/^\/archive\/[\w-]+\/?$/.test(c.req.path)) {
    const rewritten = new URL(c.req.url);
    rewritten.pathname = "/archive-detail/";
    assetRequest = new Request(rewritten.toString(), c.req.raw);
  }

  const assetResponse = await c.env.ASSETS.fetch(assetRequest);
  const contentType = assetResponse.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return assetResponse;
  }

  let authed = false;
  try {
    await extractMemberFromAuth(c.req.raw, c.env);
    authed = true;
  } catch {
    // not authenticated
  }

  const { path } = c.req;
  const isDashboard = path === "/dashboard" || path === "/dashboard/";
  if (!authed && isDashboard) {
    return Response.redirect(new URL("/login/", c.req.url).toString(), 302);
  }

  if (!authed) {
    return assetResponse;
  }

  const html = await assetResponse.text();
  const patched = html.replace("<body>", "<body data-authed>");
  const headers = new Headers(assetResponse.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.delete("content-length");
  return new Response(patched, { status: assetResponse.status, headers });
});

addEventListener("unhandledrejection", (event) => {
  console.error(event.reason);
});

export default app;
