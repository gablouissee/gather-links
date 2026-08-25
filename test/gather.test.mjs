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

test("platforms without credentials are reported as disabled, not failed", async () => {
  const { body } = await run({ q: "Melanie Whyte" });
  assert.equal(body.enabled.youtube, false);
  assert.equal(body.enabled.spotify, false);
  assert.equal(body.results.youtube, null);
  assert.equal(body.results.spotify, null);
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
