import { Bot, InlineKeyboard } from "grammy";
import { json } from "../lib/http.js";
import { listScreenings, getCurrentScreening, getScreeningById } from "../lib/db/screenings.js";
import { listSchedule } from "../lib/db/schedule.js";
import { searchOmdb, ensureFilmByImdbId } from "../lib/omdb.js";

async function findTelegramMember(db, username) {
  return db.prepare(
    "SELECT display_name AS displayName, email, is_admin AS isAdmin FROM members WHERE telegram_username = ?"
  ).bind(username).first();
}

async function saveTelegramRating(db, weekKey, displayName, score) {
  await db.prepare(`
    INSERT INTO ratings (screening_id, member_id, score, reaction, review, updated_at)
    VALUES (?, ?, ?, NULL, NULL, CURRENT_TIMESTAMP)
    ON CONFLICT(screening_id, member_id)
    DO UPDATE SET score = excluded.score, reaction = excluded.reaction,
                 review = excluded.review, updated_at = CURRENT_TIMESTAMP
  `).bind(weekKey, displayName, score).run();

  const avg = await db.prepare(
    "SELECT ROUND(AVG(score), 2) AS avg_score FROM ratings WHERE screening_id = ? AND score IS NOT NULL"
  ).bind(weekKey).first();

  return avg.avg_score;
}

// ── Bot factory ──────────────────────────────────────────────────────────────

function buildBot(env) {
  const bot = new Bot(env.BOT_TOKEN);

  bot.command(["start", "help"], async (ctx) => {
    await ctx.reply(
      "Film Crew Bot\n\n" +
      "/rate - rate the last screening\n" +
      "/schedule - view upcoming screenings\n" +
      "/pick <movie name> - set your film pick\n" +
      "/show picks|pick <name>"
    );
  });

  bot.command("rate", async (ctx) => startRate(ctx, env));
  bot.command("show", async (ctx) => handleShow(ctx, env));
  bot.command("schedule", async (ctx) => handleSchedule(ctx, env));
  bot.command("pick", async (ctx) => handlePick(ctx, env));

  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery();
    await handleCallback(ctx, env);
  });

  return bot;
}

// ── Command handlers ─────────────────────────────────────────────────────────

async function startRate(ctx, env) {
  const username = ctx.from?.username || ctx.from?.first_name || "";
  let member;
  try {
    member = await findTelegramMember(env.DB, username);
  } catch {
    member = null;
  }
  if (!member) {
    return ctx.reply(`@${username} - you're not in the members list. Ask an admin to add your Telegram username.`);
  }

  const screening = await getCurrentScreening(env.DB).catch(() => null);
  if (!screening) {
    return ctx.reply("No screenings yet.");
  }

  const args = ctx.message.text.split(" ").slice(1);
  if (args[0] && /^\d+(\.\d+)?$/.test(args[0])) {
    const score = parseFloat(args[0]);
    if (score < 1 || score > 10) {
      return ctx.reply("Score must be between 1 and 10.");
    }
    try {
      const avgScore = await saveTelegramRating(env.DB, screening.weekKey, member.displayName, score);
      return ctx.reply(
        `*${member.displayName}* gave *${screening.film.title}* ${score}/10\nGroup average: ${avgScore}/10`,
        { parse_mode: "Markdown" }
      );
    } catch (error) {
      return ctx.reply(`Couldn't save rating: ${error.message}`);
    }
  }

  const keyboard = new InlineKeyboard()
    .row(...[1, 2, 3, 4, 5].map((i) => InlineKeyboard.text(`${i}`, `rate:${screening.weekKey}:${i}`)))
    .row(...[6, 7, 8, 9, 10].map((i) => InlineKeyboard.text(`${i}`, `rate:${screening.weekKey}:${i}`)));

  await ctx.reply(`Rate *${screening.film.title}*:`, { parse_mode: "Markdown", reply_markup: keyboard });
}

async function handleShow(ctx, env) {
  const args = ctx.message.text.split(" ").slice(1);
  const sub = (args[0] || "").toLowerCase();
  const all = await listScreenings(env.DB);

  if (sub === "picks") {
    if (!all.length) {
      return ctx.reply("No picks yet.");
    }
    const lines = ["*All Picks*\n", ...all.map((s) => {
      const avg = s.averageScore != null ? `${s.averageScore}` : "not rated";
      const date = s.watchDate || "TBD";
      return `- *${s.film.title}* - ${s.chooser.name} (${date}) - ${avg}`;
    })];
    return ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  }

  if (sub === "pick") {
    const name = args.slice(1).join(" ").replace(/^@/, "").trim();
    if (!name) {
      return ctx.reply("Usage: /show pick <name>");
    }
    const screenings = all.filter((s) => s.chooser.name.toLowerCase() === name.toLowerCase());
    if (!screenings.length) {
      return ctx.reply(`No picks found for *${name}*.`, { parse_mode: "Markdown" });
    }
    const lines = [`*Picks by ${screenings[0].chooser.name}*\n`, ...screenings.map((s) => {
      const avg = s.averageScore != null ? `${s.averageScore}` : "not rated";
      return `- *${s.film.title}* (${s.watchDate || "TBD"}) - ${avg}`;
    })];
    return ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
  }

  return ctx.reply("Try: /show picks or /show pick <name>");
}

// ── Callback handler ──────────────────────────────────────────────────────────

async function handleCallback(ctx, env) {
  const data = String(ctx.callbackQuery.data || "");
  if (data.startsWith("rate:")) {
    await handleRateCallback(ctx, env, data);
  } else if (data.startsWith("pick_film:")) {
    await handlePickFilmCallback(ctx, env, data);
  } else if (data.startsWith("pick_date:") || data.startsWith("pick_confirm:")) {
    await handlePickDateCallback(ctx, env, data);
  } else if (data === "pick_cancel") {
    const chatId = String(ctx.chat?.id ?? ctx.from?.id);
    if (env.BOT_KV) await env.BOT_KV.delete(`pick:${chatId}`);
    await ctx.editMessageText("Pick cancelled.");
  }
}

async function handleRateCallback(ctx, env, data) {
  const [, weekKey, scoreStr] = data.split(":");
  const score = parseFloat(scoreStr);
  const username = ctx.from?.username || ctx.from?.first_name || "";

  let member;
  try {
    member = await findTelegramMember(env.DB, username);
  } catch {
    member = null;
  }
  if (!member) {
    await ctx.editMessageText(`@${username} - you're not in the members list.`);
    return;
  }

  const screening = await getScreeningById(env.DB, weekKey).catch(() => null);

  try {
    const avgScore = await saveTelegramRating(env.DB, weekKey, member.displayName, score);
    const title = screening?.film?.title ?? weekKey;
    await ctx.editMessageText(
      `*${member.displayName}* gave *${title}* ${score}/10\nGroup average: ${avgScore}/10`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    await ctx.editMessageText(`Couldn't save rating: ${error.message}`);
  }
}

// ── /schedule command ─────────────────────────────────────────────────────────

async function handleSchedule(ctx, env) {
  const slots = await listSchedule(env.DB).catch(() => []);
  if (!slots.length) {
    return ctx.reply("No upcoming screenings scheduled.");
  }
  const lines = ["*Upcoming screenings*\n"];
  for (const s of slots) {
    const film = s.filmTitle ? `*${s.filmTitle}*` : "TBC";
    const picker = s.pickerDisplayName || "TBC";
    lines.push(`${s.watchDate} — ${picker} — ${film}`);
  }
  return ctx.reply(lines.join("\n"), { parse_mode: "Markdown" });
}

// ── /pick command ─────────────────────────────────────────────────────────────

async function handlePick(ctx, env) {
  const username = ctx.from?.username || ctx.from?.first_name || "";
  const member = await findTelegramMember(env.DB, username).catch(() => null);
  if (!member) {
    return ctx.reply(`@${username} - you're not in the members list. Ask an admin to add your Telegram username.`);
  }

  const query = ctx.message.text.split(" ").slice(1).join(" ").trim();
  if (!query) {
    return ctx.reply("Usage: /pick <movie name>");
  }

  const results = await searchOmdb(env, query).catch(() => []);
  if (!results.length) {
    return ctx.reply(`No films found for "${query}". Try a different search.`);
  }

  const chatId = String(ctx.chat?.id ?? ctx.from?.id);
  const top = results.slice(0, 3);

  if (top.length === 1) {
    return sendDateSelection(ctx, env, chatId, member.displayName, top[0], false);
  }

  // Multiple results — ask which film they meant
  const state = {
    step: "await_film",
    memberDisplayName: member.displayName,
    options: top.map((r) => ({ imdbId: r.imdbId, title: r.title, year: r.year || "" }))
  };
  if (env.BOT_KV) {
    await env.BOT_KV.put(`pick:${chatId}`, JSON.stringify(state), { expirationTtl: 600 });
  }

  const keyboard = new InlineKeyboard();
  top.forEach((r) => {
    keyboard.row(InlineKeyboard.text(`${r.title} (${r.year || "?"})`, `pick_film:${r.imdbId}`));
  });
  keyboard.row(InlineKeyboard.text("Cancel", "pick_cancel"));

  return ctx.reply(`Found ${top.length} films. Which did you mean?`, { reply_markup: keyboard });
}

async function handlePickFilmCallback(ctx, env, data) {
  const imdbId = data.slice("pick_film:".length);
  const chatId = String(ctx.chat?.id ?? ctx.from?.id);

  if (!env.BOT_KV) {
    return ctx.editMessageText("Bot state storage is not configured.");
  }

  const raw = await env.BOT_KV.get(`pick:${chatId}`);
  if (!raw) {
    return ctx.editMessageText("This pick session has expired. Start again with /pick.");
  }

  const state = JSON.parse(raw);
  const username = ctx.from?.username || ctx.from?.first_name || "";
  const member = await findTelegramMember(env.DB, username).catch(() => null);
  if (!member || member.displayName !== state.memberDisplayName) {
    return; // silently ignore — not the session owner
  }

  const film = state.options?.find((o) => o.imdbId === imdbId) ?? { imdbId, title: imdbId, year: "" };
  return sendDateSelection(ctx, env, chatId, state.memberDisplayName, film, true);
}

async function handlePickDateCallback(ctx, env, data) {
  const weekKey = data.replace(/^pick_(date|confirm):/, "");
  const chatId = String(ctx.chat?.id ?? ctx.from?.id);

  if (!env.BOT_KV) {
    return ctx.editMessageText("Bot state storage is not configured.");
  }

  const raw = await env.BOT_KV.get(`pick:${chatId}`);
  if (!raw) {
    return ctx.editMessageText("This pick session has expired. Start again with /pick.");
  }

  const state = JSON.parse(raw);

  const filmId = await ensureFilmByImdbId(env, state.imdbId).catch(() => null);
  if (!filmId) {
    await env.BOT_KV.delete(`pick:${chatId}`);
    return ctx.editMessageText("Couldn't import that film from OMDb. Please try again with /pick.");
  }

  try {
    await env.DB.prepare(
      "UPDATE weekly_screenings SET film_id = ?, updated_at = CURRENT_TIMESTAMP WHERE week_key = ?"
    ).bind(filmId, weekKey).run();
  } catch (error) {
    await env.BOT_KV.delete(`pick:${chatId}`);
    return ctx.editMessageText(`Couldn't save pick: ${error.message}`);
  }

  await env.BOT_KV.delete(`pick:${chatId}`);

  const screening = await getScreeningById(env.DB, weekKey).catch(() => null);
  const title = screening?.film?.title ?? state.filmTitle;
  const date = screening?.watchDate ?? weekKey;

  return ctx.editMessageText(
    `*${state.memberDisplayName}* picked *${title}* for ${date}`,
    { parse_mode: "Markdown" }
  );
}

// ── Pick helper: present date selection ──────────────────────────────────────

async function sendDateSelection(ctx, env, chatId, memberDisplayName, film, isEdit) {
  const slots = await listSchedule(env.DB);
  const mySlots = slots.filter((s) => s.pickerDisplayName === memberDisplayName);

  const send = (text, opts) =>
    isEdit ? ctx.editMessageText(text, opts) : ctx.reply(text, opts);

  if (!mySlots.length) {
    if (env.BOT_KV) await env.BOT_KV.delete(`pick:${chatId}`);
    return send("You have no upcoming screenings. Ask an admin to add you to the schedule.");
  }

  const state = {
    step: "await_date",
    memberDisplayName,
    imdbId: film.imdbId,
    filmTitle: film.title,
    filmYear: film.year || ""
  };
  if (env.BOT_KV) {
    await env.BOT_KV.put(`pick:${chatId}`, JSON.stringify(state), { expirationTtl: 600 });
  }

  if (mySlots.length === 1) {
    const slot = mySlots[0];
    const keyboard = new InlineKeyboard()
      .row(InlineKeyboard.text(`Yes — ${slot.watchDate}`, `pick_confirm:${slot.weekKey}`))
      .row(InlineKeyboard.text("Cancel", "pick_cancel"));
    return send(
      `Set *${film.title}* (${film.year || "?"}) for your screening on *${slot.watchDate}*?`,
      { parse_mode: "Markdown", reply_markup: keyboard }
    );
  }

  const keyboard = new InlineKeyboard();
  mySlots.forEach((s) => {
    keyboard.row(InlineKeyboard.text(s.watchDate, `pick_date:${s.weekKey}`));
  });
  keyboard.row(InlineKeyboard.text("Cancel", "pick_cancel"));

  return send(
    `You have ${mySlots.length} upcoming screenings. Which date for *${film.title}*?`,
    { parse_mode: "Markdown", reply_markup: keyboard }
  );
}

// ── Webhook entrypoint ────────────────────────────────────────────────────────

export async function handleTelegramWebhook(request, env) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token") || "";
    if (header !== secret) {
      return json({ error: "unauthorized" }, 401);
    }
  }

  const update = await request.json();
  const bot = buildBot(env);
  try {
    await bot.init();
    await bot.handleUpdate(update);
  } catch (error) {
    console.error(error);
  }

  return new Response("OK");
}
