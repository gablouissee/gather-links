# Gather Links — Premiere Link Generator

A **free** tool that gathers a premiere's platform links and turns them into a
ready-to-post announcement. Search a guest or episode and it **auto-fills Apple
Podcasts, YouTube, and Spotify from the web**; you paste the platforms that have
no public search API; the formatted block builds itself for you to copy into a post.

```
Esther L. Sanni

Premiere this Mon, August 24, 2026 7pm New York Time

YouTube:
https://…

Facebook:
https://…
…
```

## What can and can't be auto-gathered

| Platform | Auto-gathered? | How |
|---|---|---|
| Apple Podcast | ✅ | iTunes Search API — free, no key |
| YouTube | ✅ | public channel feed — **no key**; a free API key only adds older episodes |
| Spotify | ✅ | Spotify Web API — free client credentials |
| Amazon Podcast | ✎ paste | no public search API |
| Facebook | ✎ paste | Graph API has no open search |
| Global Book Network | ✎ paste | your own site |
| Roku | ✎ paste | no public search API |
| Fire TV | ✎ paste | no public search API |

The four "paste" platforms have **no free search API from anyone** — the tool
keeps a clean manual field (and remembers your last entry) for those.

## How it's built

- `index.html` — the whole frontend (one file, no build step).
- `api/gather.js` — a tiny serverless function that queries the platform APIs.
  No npm dependencies; uses built-in `fetch`.

## Run / deploy free on Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new) — it auto-detects the
   static site + the `api/` function. No build settings needed.
3. In **Project → Settings → Environment Variables**, add the free keys from
   [`.env.example`](./.env.example):
   - `YOUTUBE_API_KEY` (and optional `YOUTUBE_CHANNEL_ID`)
   - `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`
   - *(Apple needs nothing.)*
4. Deploy. Your generator is live at `https://<project>.vercel.app`.

Missing a key just disables that one platform's auto-fill — everything else
still works. Netlify Functions work the same way (rename `api/` per Netlify's
convention or add a `netlify.toml` redirect).

## Scoped to Global Book Network

Searches are already locked to GBN's own show on each platform, so an author
name only matches GBN episodes — never another podcast's. These IDs are baked in
as defaults (they are public, not secrets):

| Platform | ID | Source |
|---|---|---|
| YouTube | `UC1fzWsm6INY4aYEIYPGMIBw` | [youtube.com/@GlobalBookNetwork](https://www.youtube.com/@GlobalBookNetwork) |
| Apple | `1789422185` | [podcasts.apple.com/…/id1789422185](https://podcasts.apple.com/us/podcast/global-book-network/id1789422185) |
| Spotify | `0jsYkdCqjGzmxK8JkceRa3` | [open.spotify.com/show/…](https://open.spotify.com/show/0jsYkdCqjGzmxK8JkceRa3) |

Set `YOUTUBE_CHANNEL_ID`, `APPLE_PODCAST_ID`, or `SPOTIFY_SHOW_ID` to point the
generator at a different show.

The matcher scores each episode on the **author name** and the **book title**
together, weighting the title slightly higher since titles are more distinctive.
That is what separates two visits by the same author for different books.

## Automatic deploys (GitHub Actions)

Two workflows live in `.github/workflows`:

- **CI** (`ci.yml`) — runs the test suite and the `index.html` structure check on
  every push and pull request. Needs no secrets, so it works the moment you push.
- **Deploy** (`deploy.yml`) — tests, deploys to Vercel, then calls the live
  `/api/gather` endpoint to confirm the deployment actually answers. If the
  Vercel secrets are not set it skips with a note instead of failing the build.

To turn on deploys, add three repository secrets under
**Settings → Secrets and variables → Actions**:

| Secret | Where to get it |
|---|---|
| `VERCEL_TOKEN` | [vercel.com/account/tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | run `npx vercel link`, then read `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | same file |

Your API keys stay in Vercel's own environment variables — the workflow never
needs them.

## Running the tests locally

```sh
npm test               # endpoint behaviour, no network required
node scripts/check-html.mjs
```

## Getting the free keys

- **YouTube** — [Google Cloud Console](https://console.cloud.google.com): new
  project → enable *YouTube Data API v3* → Credentials → API key.
- **Spotify** — [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):
  Create app → copy Client ID and Client Secret.

## Features

- **Auto-gather** — one search fills Apple, YouTube, Spotify (found fields turn green).
- **Live preview** — premiere card + the exact copyable text.
- **Copy text** — grab the announcement for pasting into a post.
- **Copy editor link** — encodes all fields into a URL to bookmark or hand off.
- **Hide empty** — drop platforms with no link.
- **Auto-save** — your last entry is remembered on that browser.

## Privacy

Your inputs stay in your browser (`localStorage`). The only outbound calls are
the searches your own deployed backend makes to the platform APIs.
