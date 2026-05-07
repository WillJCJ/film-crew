import { Bot, InlineKeyboard } from "grammy";
import { json } from "../lib/http.js";
import { listScreenings, getCurrentScreening, getScreeningById } from "../lib/db/screenings.js";

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
      "/show picks|pick <name>\n\n" +
      "To add a pick, use the dashboard."
    );
  });

  bot.command("rate", async (ctx) => startRate(ctx, env));
  bot.command("show", async (ctx) => handleShow(ctx, env));

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
  if (!data.startsWith("rate:")) return;

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
