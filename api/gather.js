// Serverless endpoint: gather platform links for a query.
// Runs on Vercel/Netlify Node functions. No npm dependencies — uses global fetch.
//
//   GET /api/gather?q=<guest or episode>&show=<optional show/channel>
//
// Each connector is guarded: a platform with no API key configured is simply
// skipped (reported as not-enabled) rather than erroring. Facebook, Amazon,
// Roku, Fire TV and Global Book Network have no free search API and are never
// gathered here — they stay manual in the UI.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = (req.query.q || "").toString().trim();
  const show = (req.query.show || "").toString().trim();
  if (!q) return res.status(400).json({ error: "Missing ?q= search term" });

  const enabled = {
    apple: true, // free, no key
    youtube: !!process.env.YOUTUBE_API_KEY,
    spotify: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
  };

  const term = show ? `${show} ${q}` : q;

  const [apple, youtube, spotify] = await Promise.all([
    safe(() => gatherApple(term)),
    enabled.youtube ? safe(() => gatherYouTube(q, show)) : Promise.resolve(null),
    enabled.spotify ? safe(() => gatherSpotify(term)) : Promise.resolve(null),
  ]);

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  return res.status(200).json({
    query: { q, show },
    enabled,
    results: { apple, youtube, spotify },
  });
}

async function safe(fn) {
  try { return await fn(); } catch (e) { return null; }
}

// --- Apple Podcasts (iTunes Search API — free, no key) ---
async function gatherApple(term) {
  const base = "https://itunes.apple.com/search";
  // Prefer a specific episode; fall back to the show.
  let r = await fetch(`${base}?media=podcast&entity=podcastEpisode&limit=5&term=${encodeURIComponent(term)}`);
  let d = await r.json();
  let hit = (d.results || []).find((x) => x.trackViewUrl || x.collectionViewUrl);
  if (!hit) {
    r = await fetch(`${base}?media=podcast&entity=podcast&limit=5&term=${encodeURIComponent(term)}`);
    d = await r.json();
    hit = (d.results || [])[0];
  }
  if (!hit) return null;
  return {
    url: hit.trackViewUrl || hit.collectionViewUrl,
    title: hit.trackName || hit.collectionName || "",
  };
}

// --- YouTube (Data API v3 — free API key) ---
async function gatherYouTube(q, show) {
  const key = process.env.YOUTUBE_API_KEY;
  const channel = process.env.YOUTUBE_CHANNEL_ID; // optional: scope to your channel
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
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const d = await r.json();
  if (!d.access_token) throw new Error("spotify token failed");
  _spToken = { value: d.access_token, exp: Date.now() + (d.expires_in - 60) * 1000 };
  return _spToken.value;
}
async function gatherSpotify(term) {
  const token = await spotifyToken();
  const params = new URLSearchParams({ q: term, type: "episode", limit: "5", market: "US" });
  const r = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const d = await r.json();
  const ep = d.episodes && d.episodes.items && d.episodes.items.find(Boolean);
  if (!ep || !ep.external_urls) return null;
  return { url: ep.external_urls.spotify, title: ep.name || "" };
}
