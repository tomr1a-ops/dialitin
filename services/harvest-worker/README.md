# Harvest worker (Railway scaffold)

Long-running Node service for the full harvest pipeline: YouTube search (via Supabase cache), download with **yt-dlp**, trim with **ffmpeg**, pose ingest via Playwright + MediaPipe, gate, upload to Supabase Storage, and optional bands seed.

## Prerequisites (host / Railway image)

Install on the worker machine:

- **Node.js** 20+
- **yt-dlp** — `brew install yt-dlp` or [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases)
- **ffmpeg** — `brew install ffmpeg`
- **Google Chrome** (or Chromium) for Playwright ingest — `npx playwright install chrome`

Deploy from the **monorepo root** (`dialitin/`), not this folder alone. The worker imports `@/lib/harvest/*` from `src/`.

## Local run

From repo root (with env vars set — see Railway list below):

```bash
npm run harvest:worker
```

Health: `GET http://localhost:8080/health`

Trigger full pipeline:

```bash
curl -X POST http://localhost:8080/harvest/run \
  -H "Authorization: Bearer $HARVEST_WORKER_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"seed": true}'
```

## Railway

1. Create a Railway service pointing at this repo; set **root directory** to the repo root.
2. **Start command:** `npm run harvest:worker`
3. Add the environment variables listed below (names only — set values in the Railway dashboard).
4. Expose the service URL; set `HARVEST_WORKER_URL` on Vercel to that URL (no trailing slash).

Admin UI **Run on worker** calls Vercel `POST /api/admin/harvest/worker`, which proxies to this service with the shared secret.

## Required Railway environment variables

Set these in the Railway dashboard (values not listed here):

- `YOUTUBE_API_KEY`
- `SUPABASE_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `HARVEST_WORKER_SECRET`
- `NEXT_PUBLIC_SITE_URL`

## Optional Railway environment variables

- `COACH_MODEL`
- `PLAYWRIGHT_CHROME_CHANNEL`
- `PORT` (Railway usually injects this)

## Vercel (admin proxy — not on Railway)

- `HARVEST_WORKER_URL` — public URL of the Railway worker
- `HARVEST_WORKER_SECRET` — same bearer token as on the worker

Optional client hint (not required if using the server proxy):

- `NEXT_PUBLIC_HARVEST_WORKER_URL`
