# Telegram Bot Setup

The Telegram bot runs inside the main Cloudflare Worker. Telegram sends updates
to the worker via webhook; there is no separate bot process.

The bot handles rating and browsing picks. Film picks are added via the dashboard.

## Endpoints

Webhook (called by Telegram):

- `POST /api/telegram/webhook`

## Secrets

Two secrets are required. Set each one with `wrangler secret put <NAME>`,
which encrypts it and stores it in Cloudflare — never commit these values.

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in
the values there instead.

### `BOT_TOKEN`

The API token for your Telegram bot. Obtain it from `@BotFather` in Telegram
(see step 1 below). It looks like `123456789:ABCdef...`.

The worker uses this to authenticate outbound calls to the Telegram Bot API
(sending messages, editing messages, answering callback queries).

### `TELEGRAM_WEBHOOK_SECRET`

A secret string you choose freely (any random alphanumeric string, up to 256
characters). You supply this when registering the webhook with Telegram, and
Telegram sends it back on every webhook request in the
`X-Telegram-Bot-Api-Secret-Token` header.

The worker checks this header on every incoming webhook call to confirm the
request genuinely comes from Telegram and not an outside party.

Generate one with:

```bash
openssl rand -hex 32
```

---

## Setup steps

### 1. Create the bot

In Telegram, talk to `@BotFather`:

1. Send `/newbot`
2. Follow the prompts to choose a name and username
3. Copy the token BotFather gives you — this is your `BOT_TOKEN`

### 2. Set worker secrets

From the repository root, run each command and paste the value when prompted:

```bash
wrangler secret put BOT_TOKEN
wrangler secret put TELEGRAM_WEBHOOK_SECRET
```

### 3. Deploy the worker

```bash
npm run deploy
```

### 4. Register the webhook with Telegram

Telegram needs to know where to send updates. Run this with your real values:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<YOUR_WORKER_DOMAIN>/api/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>"
  }'
```

`YOUR_WORKER_DOMAIN` is the `*.workers.dev` domain shown after deploy, or your
custom domain if one is configured.

A successful response looks like:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

### 5. Link members to their Telegram usernames

Each Film Crew member who wants to use bot commands must have their Telegram
username recorded in their profile. They can set this themselves from the
Dashboard profile page (enter the username without the `@`).

A member with no `telegram_username` set will receive an error message if they
try to use `/rate`.

---

## Verification

Check the webhook is registered correctly:

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```
