// Tests for the gather endpoint. No network: fetch is stubbed with fixtures
// shaped like the real Apple/Spotify/YouTube responses.
//
//   node --test test/
//
import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/gather.js";

// Episode titles in Global Book Network's real format, including the same
// author twice for two different books — the case name-only search can't solve.
const EPISODES = [
  { title: "Global Book Network - Melanie Whyte, Author of Birth, Death and Rebirth", slug: "melanie" },
  { title: "Global Book Network - Esther L. Sanni, author of The Quiet Harvest", slug: "quiet-harvest" },
  { title: "Global Book Network - Esther L. Sanni, author of Rivers of Ash", slug: "rivers-of-ash" },
];

function stubFetch() {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("itunes.apple.com")) {
      return ok({
        results: [
          { wrapperType: "track", kind: "podcast", collectionName: "Global Book Network", collectionViewUrl: "https://podcasts.apple.com/show" },
          ...EPISODES.map((e) => ({ wrapperType: "podcastEpisode", trackName: e.title, trackViewUrl: "https://podcasts.apple.com/" + e.slug })),
        ],
      });
    }
    if (u.includes("accounts.spotify.com")) return ok({ access_token: "t", expires_in: 3600 });
    if (u.includes("/v1/shows/")) {
      return ok({ items: EPISODES.map((e) => ({ name: e.title, external_urls: { spotify: "https://open.spotify.com/" + e.slug } })) });
    }
    if (u.includes("googleapis.com/youtube")) {
      return ok({ items: [{ id: { videoId: "VID123" }, snippet: { title: EPISODES[0].title } }] });
    }
    return ok({});
  };
  return calls;
}
const ok = (body) => ({ ok: true, json: async () => body });

// Minimal Express-ish response double.
function run(query) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      headers: {},
      status(c) { this.statusCode = c; return this; },
      setHeader(k, v) { this.headers[k] = v; },
      json(body) { resolve({ status: this.statusCode, body }); },
      end() { resolve({ status: this.statusCode, body: null }); },
    };
    handler({ method: "GET", query }, res);
  });
}

test.beforeEach(() => {
  stubFetch();
  delete process.env.YOUTUBE_API_KEY;
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.SPOTIFY_CLIENT_SECRET;
});

test("rejects a request with neither author nor book", async () => {
  const { status, body } = await run({});
  assert.equal(status, 400);
  assert.match(body.error, /Missing/);
});

test("Apple works with no API key and no configuration", async () => {
  const { status, body } = await run({ q: "Melanie Whyte" });
  assert.equal(status, 200);
  assert.equal(body.enabled.apple, true);
  assert.ok(body.results.apple.url.endsWith("/melanie"));
});

test("searches are scoped to the Global Book Network show", async () => {
  const calls = stubFetch();
  await run({ q: "Melanie Whyte" });
  const appleCall = calls.find((c) => c.includes("itunes"));
  assert.match(appleCall, /id=1789422185/, "should look up the GBN Apple show id");
});

test("book title picks the right episode when an author appears twice", async () => {
  process.env.SPOTIFY_CLIENT_ID = "id";
  process.env.SPOTIFY_CLIENT_SECRET = "secret";

  const ash = await run({ q: "Esther L. Sanni", book: "Rivers of Ash" });
  assert.ok(ash.body.results.apple.url.endsWith("/rivers-of-ash"));
  assert.ok(ash.body.results.spotify.url.endsWith("/rivers-of-ash"));

  const harvest = await run({ q: "Esther L. Sanni", book: "The Quiet Harvest" });
  assert.ok(harvest.body.results.apple.url.endsWith("/quiet-harvest"));
  assert.ok(harvest.body.results.spotify.url.endsWith("/quiet-harvest"));
});

test("a book title alone is enough to match", async () => {
  const { body } = await run({ book: "Rivers of Ash" });
  assert.ok(body.results.apple.url.endsWith("/rivers-of-ash"));
});

test("an unknown book does not invent an episode match", async () => {
  const { body } = await run({ book: "Zzz Nonexistent Title" });
  // Falls back to the show page rather than guessing an episode.
  assert.ok(body.results.apple.url.endsWith("/show"));
  assert.match(body.results.apple.note, /no episode match/);
});

test("stopwords alone cannot carry a match", async () => {
  const { body } = await run({ book: "The Of And" });
  assert.ok(body.results.apple.url.endsWith("/show"), "should not match an episode on stopwords");
});

test("Spotify without credentials is reported as disabled, not failed", async () => {
  const { body } = await run({ q: "Melanie Whyte" });
  assert.equal(body.enabled.spotify, false, "Spotify genuinely needs a key");
  assert.equal(body.results.spotify, null);
  // YouTube stays enabled without a key: the public channel feed covers it.
  assert.equal(body.enabled.youtube, true);
});

test("YouTube search is restricted to the show's channel", async () => {
  process.env.YOUTUBE_API_KEY = "key";
  const calls = stubFetch();
  await run({ q: "Melanie Whyte" });
  const yt = calls.find((c) => c.includes("googleapis.com/youtube"));
  assert.match(yt, /channelId=UC1fzWsm6INY4aYEIYPGMIBw/);
});

test("a platform outage degrades to null instead of failing the request", async () => {
  globalThis.fetch = async (u) => {
    if (String(u).includes("itunes")) throw new Error("network down");
    return ok({});
  };
  const { status, body } = await run({ q: "Melanie Whyte" });
  assert.equal(status, 200, "the endpoint should still answer");
  assert.equal(body.results.apple, null);
});

// --- YouTube via the public channel feed (no API key) ---

const FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom">
 <title>Global Book Network</title>
 <entry>
  <yt:videoId>aaa111</yt:videoId>
  <title>Global Book Network - Patricia Punch Barrett, author of Ventaloha</title>
 </entry>
 <entry>
  <yt:videoId>bbb222</yt:videoId>
  <title>Global Book Network - Melanie Whyte, Author of Birth, Death &amp; Rebirth</title>
 </entry>
</feed>`;

function stubFeedFetch() {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/feeds/videos.xml")) return { ok: true, text: async () => FEED_XML };
    if (u.includes("itunes")) return ok({ results: [] });
    return ok({});
  };
}

test("YouTube resolves from the public feed with no API key", async () => {
  stubFeedFetch();
  delete process.env.YOUTUBE_API_KEY;
  const { body } = await run({ q: "Patricia Punch Barrett", book: "Ventaloha" });
  assert.equal(body.enabled.youtube, true, "YouTube should be enabled without a key");
  assert.equal(body.results.youtube.url, "https://www.youtube.com/watch?v=aaa111");
  assert.equal(body.results.youtube.via, "feed");
});

test("feed matching still respects the book title", async () => {
  stubFeedFetch();
  const { body } = await run({ q: "", book: "Birth, Death & Rebirth" });
  assert.equal(body.results.youtube.url, "https://www.youtube.com/watch?v=bbb222");
});

test("feed XML entities are decoded in titles", async () => {
  stubFeedFetch();
  const { body } = await run({ book: "Birth, Death & Rebirth" });
  assert.match(body.results.youtube.title, /Birth, Death & Rebirth/);
});

test("an unrelated name does not match a feed video", async () => {
  stubFeedFetch();
  const { body } = await run({ q: "Someone Not On The Show" });
  assert.equal(body.results.youtube, null);
});

// --- Links read out of the episode's YouTube description ---
// This mirrors the real GBN description: every platform listed under the video.

const DESC = `Global Book Network - Patricia Punch Barrett, author of Ventaloha

Watch and listen everywhere:

Facebook:
https://www.facebook.com/share/v/16abcXYZ/

Spotify:
https://open.spotify.com/show/0jsYkdCqjGzmxK8JkceRa3

Apple Podcast:
https://podcasts.apple.com/us/podcast/ventaloha/id1789422185?i=1000700123456

Amazon Podcast:
https://music.amazon.com/podcasts/92023114-c003-403f-9a81-781c6c0a6f44/global-book-network

Global Book Network:
https://www.globalbooknetwork.tv/episodes/ventaloha

Watch it on Roku!
Home-> Streaming Channels-> Search Channels-> Type in "GLOBAL BOOK NETWORK"
https://channelstore.roku.com/en-gb/details/7d47d3e405cf/global-book-network

Watch it on Fire TV!
https://www.amazon.com/gp/product/B0DWXZKYTC.

Subscribe: https://www.youtube.com/@GlobalBookNetwork`;

function stubDescFetch() {
  const xml = `<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
<entry><yt:videoId>vid789</yt:videoId>
<title>Global Book Network - Patricia Punch Barrett, author of Ventaloha</title>
<media:group><media:description>${DESC.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</media:description></media:group>
</entry></feed>`;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/feeds/videos.xml")) return { ok: true, text: async () => xml };
    if (u.includes("itunes")) return ok({ results: [] });
    return ok({});
  };
}

test("every platform link is read from the video description", async () => {
  stubDescFetch();
  const { body } = await run({ q: "Patricia Punch Barrett", book: "Ventaloha" });
  const r = body.results;
  assert.equal(r.youtube.url, "https://www.youtube.com/watch?v=vid789");
  assert.match(r.facebook.url, /facebook\.com\/share\/v\/16abcXYZ/);
  assert.match(r.spotify.url, /open\.spotify\.com\/show\//);
  assert.match(r.apple.url, /podcasts\.apple\.com/);
  assert.match(r.amazon.url, /music\.amazon\.com\/podcasts\//);
  assert.match(r.gbn.url, /globalbooknetwork\.tv\/episodes\/ventaloha/);
});

test("Roku and Fire TV are told apart, not confused with Amazon Podcast", async () => {
  stubDescFetch();
  const { body } = await run({ q: "Patricia Punch Barrett" });
  assert.match(body.results.roku.url, /channelstore\.roku\.com/);
  assert.match(body.results.firetv.url, /amazon\.com\/gp\/product\/B0DWXZKYTC$/,
    "Fire TV must be the appstore link with its trailing full stop stripped");
  assert.match(body.results.amazon.url, /music\.amazon\.com/,
    "Amazon Podcast must stay the music.amazon link");
});

test("all eight platforms resolve from one search", async () => {
  stubDescFetch();
  const { body } = await run({ q: "Patricia Punch Barrett", book: "Ventaloha" });
  const keys = ["youtube","facebook","spotify","apple","amazon","gbn","roku","firetv"];
  const filled = keys.filter((k) => body.results[k] && body.results[k].url);
  assert.equal(filled.length, 8, "expected all 8, got: " + filled.join(", "));
});

test("a dedicated connector's result wins over the description", async () => {
  stubDescFetch();
  const prev = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("itunes")) {
      return ok({ results: [{ wrapperType: "podcastEpisode", trackName: "Ventaloha", trackViewUrl: "https://podcasts.apple.com/VERIFIED" }] });
    }
    return prev(url);
  };
  const { body } = await run({ book: "Ventaloha" });
  assert.equal(body.results.apple.url, "https://podcasts.apple.com/VERIFIED");
});

test("no description yields no invented links", async () => {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("/feeds/videos.xml")) {
      return { ok: true, text: async () => `<feed xmlns:yt="x"><entry><yt:videoId>v1</yt:videoId><title>Global Book Network - Patricia Punch Barrett</title></entry></feed>` };
    }
    if (u.includes("itunes")) return ok({ results: [] });
    return ok({});
  };
  const { body } = await run({ q: "Patricia Punch Barrett" });
  assert.ok(body.results.youtube.url);
  assert.ok(!body.results.facebook);
  assert.ok(!body.results.roku);
});
