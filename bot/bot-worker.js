/**
 * Film Crew — Telegram Bot Worker
 *
 * Secrets (set via `wrangler secret put`):
 *   BOT_TOKEN   — from @BotFather
 *   BOT_SECRET  — shared secret, checked by the main worker on /api/bot/* routes
 *   API_BASE    — e.g. https://film-crew.your-subdomain.workers.dev
 */

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("OK");
    const update = await request.json();
    await handleUpdate(update, env);
    return new Response("OK");
  }
};


// ── Telegram helpers ──────────────────────────────────────────────────────────

async function send(env, chatId, text, extra = {}) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", ...extra })
  });
}

async function edit(env, chatId, messageId, text, extra = {}) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: "Markdown", ...extra })
  });
}

async function answerCallback(env, callbackQueryId) {
  await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}

function keyboard(rows) {
  return { reply_markup: JSON.stringify({ inline_keyboard: rows }) };
}


// ── API helpers ───────────────────────────────────────────────────────────────

async function api(env, method, path, body) {
  const res = await fetch(`${env.API_BASE}/api/bot${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Bot-Secret": env.BOT_SECRET
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${method} ${path} → ${res.status}: ${err}`);
  }
  return res.json();
}

const GET  = (env, path)       => api(env, "GET",  path);
const POST = (env, path, body) => api(env, "POST", path, body);


// ── In-memory conversation state ──────────────────────────────────────────────

const state = {};
const getState   = id => state[id] || null;
const setState   = (id, s) => { state[id] = s; };
const clearState = id => { delete state[id]; };


// ── Update router ─────────────────────────────────────────────────────────────

async function handleUpdate(update, env) {
  if (update.message)        await handleMessage(update.message, env);
  if (update.callback_query) await handleCallback(update.callback_query, env);
}

async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const text   = (msg.text || "").trim();

  // Resolve telegram username to member display_name
  const telegramUsername = msg.from.username || msg.from.first_name;

  // Mid-conversation?
  const s = getState(chatId);
  if (s) {
    await handleStep(s, text, chatId, telegramUsername, env);
    return;
  }

  const [cmd, ...args] = text.split(" ");
  switch (cmd) {
    case "/pick":       return startPick(chatId, telegramUsername, env);
    case "/rate":       return startRate(chatId, telegramUsername, args, env);
    case "/show":       return handleShow(chatId, args, env);
    default:
      if (text.startsWith("/")) await send(env, chatId,
        "🎬 *Film Crew Bot*\n\n" +
        "/pick — choose next film\n" +
        "/rate — rate the last screening\n" +
        "/show picks|pick <name>"
      );
  }
}


// ── /pick ─────────────────────────────────────────────────────────────────────

async function startPick(chatId, telegramUsername, env) {
  // Verify this person is a member
  let member;
  try { member = await GET(env, `/members/by-telegram/${telegramUsername}`); }
  catch { return send(env, chatId, `@${telegramUsername} — you're not in the members list. Ask an admin to add your Telegram username.`); }

  setState(chatId, { step: "pick:film", data: { telegramUsername, displayName: member.displayName } });
  await send(env, chatId, "🎬 What film are you picking?");
}


// ── /rate ─────────────────────────────────────────────────────────────────────

async function startRate(chatId, telegramUsername, args, env) {
  // Verify member
  let member;
  try { member = await GET(env, `/members/by-telegram/${telegramUsername}`); }
  catch { return send(env, chatId, `@${telegramUsername} — you're not in the members list.`); }

  // Get last screening
  let screening;
  try { screening = await GET(env, "/screenings/last"); }
  catch { return send(env, chatId, "No screenings yet — use /pick first!"); }

  if (!screening) return send(env, chatId, "No screenings yet — use /pick first!");

  // /rate 8 shortcut
  if (args[0] && /^\d+(\.\d+)?$/.test(args[0])) {
    const score = parseFloat(args[0]);
    if (score < 1 || score > 10) return send(env, chatId, "Score must be between 1 and 10.");
    try {
      const result = await POST(env, "/ratings", {
        week_key: screening.weekKey,
        display_name: member.displayName,
        score
      });
      return send(env, chatId,
        `⭐ *${member.displayName}* gave *${screening.title}* ${score}/10\n` +
        `Group average: ⭐ ${result.avg_score}/10`
      );
    } catch (e) {
      return send(env, chatId, `Couldn't save rating: ${e.message}`);
    }
  }

  // Button grid — no title in callback_data (colon clash + 64-byte Telegram limit)
  const rows = [
    [1,2,3,4,5].map(i  => ({ text: `${i}`, callback_data: `rate:${screening.weekKey}:${i}` })),
    [6,7,8,9,10].map(i => ({ text: `${i}`, callback_data: `rate:${screening.weekKey}:${i}` })),
  ];
  await send(env, chatId, `⭐ Rate *${screening.title}*:`, keyboard(rows));
}


// ── /show ─────────────────────────────────────────────────────────────────────

async function handleShow(chatId, args, env) {
  const sub = (args[0] || "").toLowerCase();

  if (sub === "picks") {
    const screenings = await GET(env, "/screenings");
    if (!screenings.length) return send(env, chatId, "No picks yet!");
    const lines = ["🎬 *All Picks*\n", ...screenings.map(s => {
      const picker = s.chooserName || s.guestPickerName || "Unknown";
      const avg    = s.averageScore != null ? `⭐ ${s.averageScore}` : "not rated";
      const date   = s.watchDate || "TBD";
      return `• *${s.title}* — ${picker} (${date}) — ${avg}`;
    })];
    return send(env, chatId, lines.join("\n"));
  }

  if (sub === "pick") {
    const name = args.slice(1).join(" ").replace(/^@/, "").trim();
    if (!name) return send(env, chatId, "Usage: `/show pick <name>`");
    const screenings = await GET(env, `/screenings/by/${encodeURIComponent(name)}`);
    if (!screenings.length) return send(env, chatId, `No picks found for *${name}*.`);
    const lines = [`🎬 *Picks by ${name}*\n`, ...screenings.map(s => {
      const avg  = s.averageScore != null ? `⭐ ${s.averageScore}` : "not rated";
      return `• *${s.title}* (${s.watchDate || "TBD"}) — ${avg}`;
    })];
    return send(env, chatId, lines.join("\n"));
  }

  await send(env, chatId, "Try: `/show picks` · `/show pick <name>`");
}


// ── Conversation steps ────────────────────────────────────────────────────────

async function handleStep(s, text, chatId, telegramUsername, env) {
  if (s.step === "pick:film") {
    setState(chatId, { step: "pick:date", data: { ...s.data, title: text } });
    await send(env, chatId, "📅 When are we watching? (e.g. `14 Jun 2025` or `TBD`)");
    return;
  }

  if (s.step === "pick:date") {
    const { title, displayName } = s.data;
    clearState(chatId);
    try {
      await POST(env, "/screenings", { title, display_name: displayName, watch_date: text });
      await send(env, chatId, `✅ *${title}* is on! Picked by ${displayName} for ${text}.`);
    } catch (e) {
      await send(env, chatId, `Couldn't create screening: ${e.message}`);
    }
    return;
  }
}


// ── Callback (rating button taps) ─────────────────────────────────────────────

async function handleCallback(query, env) {
  const chatId    = query.message.chat.id;
  const messageId = query.message.message_id;
  const telegramUsername = query.from.username || query.from.first_name;

  await answerCallback(env, query.id);

  if (query.data.startsWith("rate:")) {
    const [, weekKey, scoreStr] = query.data.split(":");
    const score = parseFloat(scoreStr);

    let member;
    try { member = await GET(env, `/members/by-telegram/${telegramUsername}`); }
    catch { return edit(env, chatId, messageId, `@${telegramUsername} — you're not in the members list.`); }

    try {
      const result = await POST(env, "/ratings", {
        week_key: weekKey,
        display_name: member.displayName,
        score
      });
      await edit(env, chatId, messageId,
        `⭐ *${member.displayName}* gave it ${score}/10\n` +
        `Group average: ⭐ ${result.avg_score}/10`
      );
    } catch (e) {
      await edit(env, chatId, messageId, `Couldn't save rating: ${e.message}`);
    }
  }
}
