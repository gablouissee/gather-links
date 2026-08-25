// Serverless endpoint: gather platform links for a query.
// Runs on Vercel/Netlify Node functions. No npm dependencies — uses global fetch.
//
//   GET /api/gather?q=<guest or episode>&show=<optional show/channel>
//
// Scoping (recommended): set these env vars to lock searches to ONE show, so a
// guest name only matches episodes of your podcast/channel:
//   YOUTUBE_CHANNEL_ID   — your channel (UC...)
//   APPLE_PODCAST_ID     — the number after /id in your Apple Podcasts show URL
//   SPOTIFY_SHOW_ID      — the id in open.spotify.com/show/<id>
// Without them, each connector does an open search instead.
//
// Facebook, Amazon, Roku, Fire TV and Global Book Network have no free search
// API and are never gathered here — they stay manual in the UI.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = (req.query.q || "").toString().trim();
  const show = (req.query.show || "").toString().trim();
  if (!q) return res.status(400).json({ error: "Missing ?q= search term" });

  const enabled = {
    apple: true,
    youtube: !!process.env.YOUTUBE_API_KEY,
    spotify: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
  };
  const scoped = {
    apple: !!process.env.APPLE_PODCAST_ID,
    youtube: !!process.env.YOUTUBE_CHANNEL_ID,
    spotify: !!process.env.SPOTIFY_SHOW_ID,
  };

  const term = show ? `${show} ${q}` : q;

  const [apple, youtube, spotify] = await Promise.all([
    safe(() => gatherApple(term, q)),
    enabled.youtube ? safe(() => gatherYouTube(q, show)) : Promise.resolve(null),
    enabled.spotify ? safe(() => gatherSpotify(term, q)) : Promise.resolve(null),
  ]);

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  return res.status(200).json({
    query: { q, show },
    enabled,
    scoped,
    results: { apple, youtube, spotify },
  });
}

async function safe(fn) {
  try { return await fn(); } catch (e) { return null; }
}

// Local fuzzy match: keep only candidates that share enough of the query's words.
function norm(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function bestMatch(q, items, getText, minRatio) {
  const qt = norm(q).split(" ").filter(Boolean);
  if (!qt.length) return null;
  let best = null, bestScore = -1;
  for (const it of items) {
    const t = norm(getText(it));
    let hits = 0;
    for (const tok of qt) if (t.indexOf(tok) >= 0) hits++;
    const score = hits / qt.length;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return bestScore >= (minRatio == null ? 0.5 : minRatio) ? best : null;
}

// --- Apple Podcasts (iTunes — free, no key) ---
async function gatherApple(term, q) {
  const id = process.env.APPLE_PODCAST_ID;
  if (id) {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&media=podcast&entity=podcastEpisode&limit=200`);
    const d = await r.json();
    const all = d.results || [];
    const episodes = all.filter((x) => x.trackViewUrl && (x.wrapperType === "podcastEpisode" || x.kind === "podcast-episode"));
    const showRow = all.find((x) => x.collectionViewUrl && (x.wrapperType === "track" || x.kind === "podcast"));
    const hit = bestMatch(q, episodes, (e) => e.trackName);
    if (hit) return { url: hit.trackViewUrl, title: hit.trackName || "" };
    if (showRow) return { url: showRow.collectionViewUrl, title: showRow.collectionName || "", note: "show page (no episode match)" };
    return null;
  }
  // open search fallback
  const base = "https://itunes.apple.com/search";
  let r = await fetch(`${base}?media=podcast&entity=podcastEpisode&limit=5&term=${encodeURIComponent(term)}`);
  let d = await r.json();
  let hit = (d.results || []).find((x) => x.trackViewUrl || x.collectionViewUrl);
  if (!hit) {
    r = await fetch(`${base}?media=podcast&entity=podcast&limit=5&term=${encodeURIComponent(term)}`);
    d = await r.json();
    hit = (d.results || [])[0];
  }
  if (!hit) return null;
  return { url: hit.trackViewUrl || hit.collectionViewUrl, title: hit.trackName || hit.collectionName || "" };
}

// --- YouTube (Data API v3 — free key) ---
async function gatherYouTube(q, show) {
  const key = process.env.YOUTUBE_API_KEY;
  const channel = process.env.YOUTUBE_CHANNEL_ID; // optional scope
  const params = new URLSearchParams({
    part: "snippet", type: "video", maxResults: "5", key,
    q: channel ? q : (show ? `${show} ${q}` : q),
  });
  if (channel) params.set("channelId", channel);
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const d = await r.json();
  const item = (d.items || [])[0];
  if (!item || !item.id || !item.id.videoId) return null;
  return {
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    title: (item.snippet && item.snippet.title) || "",
  };
}

// --- Spotify (Web API — free client credentials) ---
let _spToken = { value: null, exp: 0 };
async function spotifyToken() {
  if (_spToken.value && Date.now() < _spToken.exp) return _spToken.value;
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("spotify token failed");
  _spToken = { value: d.access_token, exp: Date.now() + (d.expires_in - 60) * 1000 };
  return _spToken.value;
}
async function gatherSpotify(term, q) {
  const token = await spotifyToken();
  const showId = process.env.SPOTIFY_SHOW_ID;
  if (showId) {
    let items = [];
    for (let off = 0; off < 150; off += 50) {
      const r = await fetch(`https://api.spotify.com/v1/shows/${encodeURIComponent(showId)}/episodes?limit=50&offset=${off}&market=US`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (!d.items || !d.items.length) break;
      items = items.concat(d.items);
      if (d.items.length < 50) break;
    }
    const hit = bestMatch(q, items.filter(Boolean), (e) => e.name);
    if (hit && hit.external_urls) return { url: hit.external_urls.spotify, title: hit.name || "" };
    return null;
  }
  // open search fallback
  const params = new URLSearchParams({ q: term, type: "episode", limit: "5", market: "US" });
  const r = await fetch(`https://api.spotify.com/v1/search?${params}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json();
  const ep = d.episodes && d.episodes.items && d.episodes.items.find(Boolean);
  if (!ep || !ep.external_urls) return null;
  return { url: ep.external_urls.spotify, title: ep.name || "" };
}
