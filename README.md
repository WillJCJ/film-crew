# Film Crew

[![Deployment](https://github.com/WillJCJ/film-crew/actions/workflows/deploy.yml/badge.svg?branch=main)](https://github.com/WillJCJ/film-crew/actions/workflows/deploy.yml)

Film Crew is a Cloudflare Worker-backed site for a four-person weekly film
club. It uses:

- Cloudflare Workers for auth via Cloudflare One, API routes, and D1 access
- Cloudflare D1 for members, screenings, ratings, and films
- Cloudflare One (Zero Trust) for authenticating members
- Eleventy with Liquid templates for the site shell and assets
- OMDb for importing IMDb-linked film metadata

## Local setup

1. Install dependencies.

```sh
npm install
```

1. Create a D1 database and update the database id in
   [wrangler.toml](wrangler.toml).

```sh
wrangler d1 create film-crew
```

1. Apply the migration locally.

```sh
npm run db:migrate:local
```

1. Set local development variables in `.dev.vars`.

```dotenv
OMDB_API_KEY=your-omdb-key
DEV_AUTH_EMAIL=me@example.com
```

When `DEV_AUTH_EMAIL` is set, local `wrangler dev` requests authenticate as
that member without Cloudflare One.

You can point local dev at remote infrastructure with
`wrangler dev --remote`, but for day-to-day work it is usually safer to keep
a local D1 copy.

To refresh local D1 from remote on demand:

```sh
npm run db:pull
```

1. Start local development with automatic rebuild/reload on source changes.

```sh
npm run dev
```

## Cloudflare One Setup

Authentication is handled by Cloudflare One (Zero Trust). You must configure
access policies in the Cloudflare dashboard before deploying:

1. Go to **Cloudflare Dashboard** → **Zero Trust** → **Access** → **Applications**
2. Click **Add an application** and choose **Self-hosted**
3. Name the app `film-crew`
4. Set the application domain to your Worker URL (e.g., `film-crew.workers.dev`)
5. Create policies for the protected routes:
   - `/archive/*` - Archive pages (protected)
   - `/dashboard/*` - Member dashboard (protected)
6. Configure an identity provider (Google, GitHub, email domain, enterprise
   SSO, etc.)
7. Members will authenticate through your chosen identity provider when
   accessing protected pages

## Deployment

1. Apply migrations remotely (includes seeded members).

```sh
npm run db:migrate:remote
```

1. Set the OMDb API key in Cloudflare.

```sh
wrangler secret put OMDB_API_KEY
```

1. Deploy.

```sh
npm run deploy
```

## Members

Members are seeded in the database and authenticate through Cloudflare One
using their configured email.
For local development only, `DEV_AUTH_EMAIL` can impersonate a seeded member.

To make someone an admin, update their D1 record:

```sh
wrangler d1 execute DB "
UPDATE members
SET is_admin = 1
WHERE email = 'george@example.com'
" --remote
```

To add new members, insert them into the D1 database:

```sh
wrangler d1 execute DB "
INSERT INTO members (email, display_name, is_admin, created_at, updated_at)
VALUES ('new@example.com', 'New Person', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
" --remote
```

## Current implementation scope

- Cloudflare One-backed authentication with seeded members
- Public home and login info pages
- Protected member dashboard with current screening ratings
- Admin OMDb search and weekly screening creation flow
- Film archive with historical ratings

## Next implementation slices

- Better validation and nicer error boundaries
- Automated tests for auth and data helpers
- Split up large worker.js into managable files
- Stats page
- Shortlist of film picks
  - Personal watch list
- Allow guest profiles and ratings
- Filter/search archive
- enrich existing films with OMDB/IMDB data
- Click on individual archive items to enlarge
