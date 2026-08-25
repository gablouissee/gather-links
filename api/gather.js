// Serverless endpoint: gather platform links for a query.
// Runs on Vercel/Netlify Node functions. No npm dependencies — uses global fetch.
//
//   GET /api/gather?q=<guest or episode>&show=<optional show/channel>
//
// Searches are scoped to one show (see SHOW below) so an author name only
// matches episodes of that podcast/channel. Override any of them with the
// YOUTUBE_CHANNEL_ID / APPLE_PODCAST_ID / SPOTIFY_SHOW_ID env vars.
//
// Facebook, Amazon, Roku, Fire TV and Global Book Network have no free search
// API and are never gathered here — they stay manual in the UI.

// Global Book Network's public show IDs, used when no env var overrides them.
// These are public identifiers, not secrets. Set the matching env var to point
// the generator at a different show.
const SHOW = {
  apple: process.env.APPLE_PODCAST_ID || "1789422185",
  spotify: process.env.SPOTIFY_SHOW_ID || "0jsYkdCqjGzmxK8JkceRa3",
  youtube: process.env.YOUTUBE_CHANNEL_ID || "UC1fzWsm6INY4aYEIYPGMIBw",
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const q = (req.query.q || "").toString().trim();
  const book = (req.query.book || "").toString().trim();
  const show = (req.query.show || "").toString().trim();
  if (!q && !book) return res.status(400).json({ error: "Missing ?q= (guest) or ?book= (title)" });

  const enabled = {
    apple: true,
    // The public channel feed needs no key, so YouTube is on whenever the
    // channel is known; a key only extends reach to the back catalogue.
    youtube: !!(SHOW.youtube || process.env.YOUTUBE_API_KEY),
    spotify: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
  };
  const scoped = { apple: !!SHOW.apple, youtube: !!SHOW.youtube, spotify: !!SHOW.spotify };

  // Guest + book together are the search text; either alone also works.
  const who = [q, book].filter(Boolean).join(" ");
  const term = show ? `${show} ${who}` : who;

  const [apple, youtube, spotify] = await Promise.all([
    safe(() => gatherApple(term, q, book)),
    enabled.youtube ? safe(() => gatherYouTube(q, book, show)) : Promise.resolve(null),
    enabled.spotify ? safe(() => gatherSpotify(term, q, book)) : Promise.resolve(null),
  ]);

  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate");
  return res.status(200).json({
    query: { q, book, show },
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
// Words too common in episode titles to prove a match on their own.
const STOP = new Set(["the","a","an","of","and","or","in","on","for","to","with","my","your","how","what","is","it"]);
function tokens(s) {
  return norm(s).split(" ").filter((w) => w && w.length > 1 && !STOP.has(w));
}
function ratio(toks, text) {
  if (!toks.length) return null; // no signal given
  let hits = 0;
  for (const tok of toks) if (text.indexOf(tok) >= 0) hits++;
  return hits / toks.length;
}
// Match on guest name and/or book title. Either alone can carry a match; both
// matching ranks highest, which is what disambiguates same-guest repeat visits.
function bestMatch(q, book, items, getText) {
  const gt = tokens(q), bt = tokens(book);
  if (!gt.length && !bt.length) return null;
  let best = null, bestScore = -1;
  for (const it of items) {
    const t = norm(getText(it));
    const g = ratio(gt, t), b = ratio(bt, t);
    // Weight whichever signals were supplied; book slightly favoured when both
    // are present, since titles are more distinctive than names.
    let score;
    if (g != null && b != null) score = g * 0.45 + b * 0.55;
    else score = (g != null ? g : b);
    if (score > bestScore) { bestScore = score; best = it; }
  }
  // Accept if either supplied signal is convincing on its own.
  if (best) {
    const t = norm(getText(best));
    const g = ratio(gt, t), b = ratio(bt, t);
    if ((g != null && g >= 0.5) || (b != null && b >= 0.6)) return best;
  }
  return null;
}

// --- Apple Podcasts (iTunes — free, no key) ---
async function gatherApple(term, q, book) {
  const id = SHOW.apple;
  if (id) {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&media=podcast&entity=podcastEpisode&limit=200`);
    const d = await r.json();
    const all = d.results || [];
    const episodes = all.filter((x) => x.trackViewUrl && (x.wrapperType === "podcastEpisode" || x.kind === "podcast-episode"));
    const showRow = all.find((x) => x.collectionViewUrl && (x.wrapperType === "track" || x.kind === "podcast"));
    const hit = bestMatch(q, book, episodes, (e) => e.trackName);
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

// --- YouTube ---
// Two routes. The channel's public Atom feed needs no API key and covers the
// most recent 15 uploads, which is where a premiere always is. The Data API is
// used only when a key is configured, since it can reach the whole back
// catalogue. Feed first: it is free, keyless, and enough for the common case.
async function gatherYouTube(q, book, show) {
  const channel = SHOW.youtube;
  if (channel) {
    const viaFeed = await safe(() => gatherYouTubeFeed(channel, q, book));
    if (viaFeed) return viaFeed;
  }
  if (!process.env.YOUTUBE_API_KEY) return null;
  return gatherYouTubeApi(q, book, show, channel);
}

// Public channel feed — no key, no quota. Latest 15 uploads only.
async function gatherYouTubeFeed(channel, q, book) {
  const r = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channel)}`);
  if (!r.ok) return null;
  const xml = await r.text();
  const entries = [];
  for (const block of xml.split("<entry>").slice(1)) {
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(block);
    const title = /<title>([\s\S]*?)<\/title>/.exec(block);
    if (id && title) entries.push({ id: id[1], title: unescapeXml(title[1]) });
  }
  const hit = bestMatch(q, book, entries, (e) => e.title);
  if (!hit) return null;
  return { url: `https://www.youtube.com/watch?v=${hit.id}`, title: hit.title, via: "feed" };
}

function unescapeXml(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
          .replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").trim();
}

// Data API — reaches older episodes the feed has dropped. Needs a free key.
async function gatherYouTubeApi(q, book, show, channel) {
  const who = [q, book].filter(Boolean).join(" ");
  const params = new URLSearchParams({
    part: "snippet", type: "video", maxResults: "5",
    key: process.env.YOUTUBE_API_KEY,
    q: channel ? who : (show ? `${show} ${who}` : who),
  });
  if (channel) params.set("channelId", channel);
  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  const d = await r.json();
  const item = (d.items || [])[0];
  if (!item || !item.id || !item.id.videoId) return null;
  return {
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    title: (item.snippet && item.snippet.title) || "",
    via: "api",
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
async function gatherSpotify(term, q, book) {
  const token = await spotifyToken();
  const showId = SHOW.spotify;
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
    const hit = bestMatch(q, book, items.filter(Boolean), (e) => e.name);
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
