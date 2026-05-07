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
import { handleTelegramWebhook } from "./handlers/telegram.js";

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

// ── Telegram (/api/telegram/*) ───────────────────────────────────────────────

app.post("/api/telegram/webhook", async (c) => {
  return handleTelegramWebhook(c.req.raw, c.env);
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
