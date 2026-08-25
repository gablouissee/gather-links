// Sanity checks for index.html. The page is one hand-written file with inline
// JS, so CI verifies that the script still parses and that the elements the
// script reaches for actually exist. No dependencies.
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const problems = [];

// 1. The inline script must be valid JavaScript.
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) problems.push("no inline <script> found in index.html");
for (const [i, src] of scripts.entries()) {
  try {
    new Function(src);
  } catch (e) {
    problems.push(`inline script #${i + 1} does not parse: ${e.message}`);
  }
}

// 2. Every getElementById the script uses must exist in the markup.
const declaredIds = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const usedIds = new Set([...scripts.join("\n").matchAll(/\$\("([^"]+)"\)/g)].map((m) => m[1]));
for (const id of usedIds) {
  if (!declaredIds.has(id)) problems.push(`script references #${id}, which is not in the markup`);
}

// 3. The pieces the generator depends on.
for (const id of ["g_q", "g_book", "g_show", "gatherBtn", "gStatus", "linkFields", "card", "raw", "copyBtn"]) {
  if (!declaredIds.has(id)) problems.push(`missing required element #${id}`);
}

// 4. All eight platforms must still be listed, in the announcement's order.
for (const label of [
  "YouTube:", "Facebook:", "Spotify:", "Apple Podcast:",
  "Amazon Podcast:", "Global Book Network:", "Watch it on Roku!", "Watch it on Fire TV!",
]) {
  if (!html.includes(label)) problems.push(`platform label missing: ${label}`);
}

// 5. Every manual (paste) platform needs an "open" shortcut, or the user is
//    left hunting for the page the link is copied from.
const platformRows = [...html.matchAll(/\{key:"(\w+)",[^}]*auto:(true|false)[^}]*\}/g)];
for (const [row, key, auto] of platformRows) {
  if (auto === "false" && !/\bgo:"https?:/.test(row)) {
    problems.push(`manual platform "${key}" has no open-shortcut (go:) URL`);
  }
}
if (platformRows.length !== 8) problems.push(`expected 8 platform entries, found ${platformRows.length}`);

// 6. Theme tokens must be defined on bare :root, not only inside a media query,
//    or the page renders unreadable in one of the themes.
if (!/:root\s*\{[^}]*--ink:/.test(html)) problems.push("--ink is not defined on bare :root");

if (problems.length) {
  console.error("index.html checks failed:");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`index.html OK — ${declaredIds.size} ids, ${usedIds.size} referenced by script, 8 platforms present.`);
