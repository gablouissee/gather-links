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
| YouTube | ✅ | YouTube Data API v3 — free key |
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
