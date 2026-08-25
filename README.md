# Gather Links — Premiere Link Generator

A tiny, **free** tool that turns one premiere's platform links into a ready‑to‑post
announcement block. Fill in the guest name, premiere date/time, and paste each
platform's link — the formatted text builds itself and you copy it straight into a post.

```
Esther L. Sanni

Premiere this Mon, August 24, 2026 7pm New York Time

YouTube:
https://…

Facebook:
https://…
…
```

## Why it's free & easy

- **One static file** (`index.html`) — no server, no database, no build step.
- Runs entirely in the browser. Your inputs are saved to `localStorage` on your
  own device; nothing is sent anywhere.
- Host it for $0 on GitHub Pages, Netlify, or Vercel — or just open the file locally.

## Platforms

YouTube · Facebook · Spotify · Apple Podcast · Amazon Podcast ·
Global Book Network · Roku · Fire TV

## Features

- **Live preview** — a premiere card plus the exact copyable text.
- **Copy text** — one click to grab the announcement for pasting into a post.
- **Copy editor link** — encodes all fields into a URL so you can bookmark or hand
  off a pre‑filled generator.
- **Hide empty** toggle — drop platforms you don't have a link for.
- **Auto‑save** — your last entry is remembered on the same browser.

## Use it locally

Open `index.html` in any browser. That's it.

## Host it free on GitHub Pages

1. Push this repo to GitHub.
2. Settings → Pages → Deploy from branch → pick the branch and `/root`.
3. Your generator is live at `https://<user>.github.io/gather-links/`.

## Roadmap

The current version is the **manual collector** — the free/easy core. A later,
optional step can auto‑fill the podcast platforms (Apple, Spotify, Amazon) from a
single RSS feed via the free Podcast Index / iTunes lookup APIs, and YouTube via
its free API. Facebook, Roku, and Fire TV stay manual (no public search API).
