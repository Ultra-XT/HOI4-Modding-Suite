// ✋ #the-map-page-says-what-writes-at-once — THE MAP PAGE'S TWO NOTES ON WHAT IS WRITTEN, AND WHEN, SAY WHAT ITS CODE DOES.
//
// B6-27 (tool campaign, CONFIRMED, low):
//   (a) the intro under the title said "Saves to your mod's history/states only — vanilla is never touched." A Save writes every
//       file its edits belong in: a 🎨 colour change writes common/countries/colors.txt, a railway railways.txt, a supply hub
//       supply_nodes.txt, an adjacency adjacencies.csv, a river rivers.bmp…
//   (b) the ✋ note said nothing is written until 💾 Save "except the buttons that say they write straight away" and named four:
//       🌍 Generate a world, 🌍 Generate land, 🗺 Redraw regions and 🔧 Auto-fix all. ✨ New country (22 files at once), 🏳 Countries…
//       Remove and Restore, 🛟 Restore baseline, ✛ a new region or supply area, 🧹 Clear ALL rivers and 💾 Save army write at once too.
//
// DERIVED, not typed: every POST public/map.js makes outside 💾 Save's own replay (flushMapSaves), found the way
// test-an-immediate-map-write-is-checked-the-way-a-save-is.js finds them, must be NAMED in the ✋ note's list — each name there
// carries the endpoints its click posts, in data-writes — or be judged below as not a write into the mod, with its reason. A new
// immediate writer therefore cannot go unsaid, and a judgement or a list entry that outlives its endpoint fails loudly.
"use strict";
const fs = require("fs");
const path = require("path");
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}
const M = T.MASKED;
const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8").replace(/\r\n/g, "\n");
const strip = (h) => h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ── 1. every immediate POST of the page (outside flushMapSaves' replay of the staged writes) ──
const flushAt = M.indexOf("async function flushMapSaves");
const flushEnd = flushAt === -1 ? -1 : M.indexOf("} finally { if (btn) btn.disabled = false; updateSaveButton(); }", flushAt);
rec("THE CONTROL: flushMapSaves was located, so its replay of the staged writes is left out", flushAt > 0 && flushEnd > flushAt, { flushAt, flushEnd });
const found = [];
{
  const re = /fetch\(\s*["'`]([^"'`]+)["'`]\s*,\s*\{\s*method:\s*["']POST["']/g;
  for (let m; (m = re.exec(M));) if (m.index < flushAt || m.index > flushEnd) found.push({ url: m[1], at: m.index });
}
const urls = [...new Set(found.map((f) => f.url))].sort();
rec(`THE CONTROL: ${found.length} immediate POSTs found outside Save's replay (${urls.length} endpoints)`, found.length >= 10, urls);

// ── 2. the ✋ note's list, and what each name says its click posts ──
const summary = (/<details class="map-autosave-note">\s*<summary>([\s\S]*?)<\/summary>/.exec(HTML) || [])[1] || "";
const listAt = summary.indexOf('<span id="mapWritesAtOnce">');
const items = [...summary.matchAll(/<span data-writes="([^"]*)">([\s\S]*?)<\/span>/g)].map((m) => ({ writes: m[1].trim().split(/\s+/).filter(Boolean), label: strip(m[2]) }));
const listed = [...new Set(items.flatMap((i) => i.writes))].sort();
rec("the ✋ note is found, and its list of what writes at once is marked up (#mapWritesAtOnce, data-writes)", summary.length > 0 && listAt !== -1 && items.length > 0, summary.slice(0, 400));
rec("…every name in that list has words and names at least one endpoint", items.length > 0 && items.every((i) => i.label.length > 2 && i.writes.length > 0 && i.writes.every((u) => /^\/api\//.test(u))), items);
const said = strip(summary);
rec("⭐ the note says nothing is written until 💾 Save, except the list that follows", /^✋ Nothing is written to your mod until you click 💾 Save changes\./.test(said) && /\bexcept\b[^:]*:/.test(said.slice(0, said.indexOf(items.length ? items[0].label : "\u0000"))), said.slice(0, 300));

// ── 3. the POSTs that are NOT a write into the mod, each with why (re-checked where the evidence is in this file) ──
const NOT_THE_MOD = {
  "/api/map/save-baseline": "💾 Save baseline copies the map OUT of the mod, into Nova's own baseline folder; the mod's files are unchanged",
  "/api/map/drag-country": "Move country stays disabled (the owner, 09-06): the server refuses it before it writes anything",
  "/api/map/prepare-world": "🌍 Generate a world's confirm asks it with dryRun: true, to say what the run will change; it writes nothing (re-checked below)",
  "/api/map/world-run/seen": "marks a finished run's panel seen, in Nova's own record of the run (app data); nothing in the mod",
  "/api/map/railway-curves": "asks what the game would draw over water, for the 🛤 Railway tool's note; a read",
};
const unsaid = urls.filter((u) => !listed.includes(u) && !(u in NOT_THE_MOD));
rec("⭐⭐ every immediate write of the page is named in the ✋ note's list (or judged here as not a write into the mod)", urls.length > 0 && unsaid.length === 0, unsaid);
const staleListed = listed.filter((u) => !urls.includes(u));
const staleJudged = Object.keys(NOT_THE_MOD).filter((u) => !urls.includes(u));
rec("⚠️ …and neither the list nor a judgement names an endpoint the page no longer posts to at once", staleListed.length === 0 && staleJudged.length === 0, { staleListed, staleJudged });
const both = listed.filter((u) => u in NOT_THE_MOD);
rec("…and no endpoint is both listed as a write and judged not to be one", both.length === 0, both);
{
  const prep = found.filter((f) => f.url === "/api/map/prepare-world").map((f) => M.slice(f.at, M.indexOf(";", f.at)));
  rec("⚠️ the evidence for prepare-world's judgement holds: every immediate post to it is a dry run", prep.length === 0 || prep.every((s) => /dryRun:\s*true/.test(s)), prep.map((s) => s.slice(0, 200)));
}

// ── 4. ✨ New country, the one the finding named, says so on its own button too ──
{
  const t = (/<button id="mapModeNewcountry"[^>]*title="([^"]*)"/.exec(HTML) || [])[1] || "";
  rec("✨ New country's button says its click writes into the mod straight away, not on 💾 Save", /straight away/.test(t) && /not on 💾 Save/.test(t), t);
}

// ── 5. the intro under the title says where a Save writes without narrowing it to one folder ──
{
  const intro = strip((/<h1[\s\S]*?<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/.exec(HTML) || [])[1] || "");
  // THE CONTROL, from the page's own queue: a Save sends staged writes that belong outside history/states (a 🎨 country colour is
  // common/countries/colors.txt), so a "history/states only" claim would be false.
  const queued = [...new Set([...M.matchAll(/queueWrite\("(\/api\/[^"]+)"/g)].map((m) => m[1]))];
  rec("THE CONTROL: 💾 Save replays writes beyond the states (the queue holds a country-colour write)", queued.includes("/api/map/set-country-color") && queued.length > 5, queued);
  rec("⭐ the intro says a Save writes into the mod, and does not narrow it with an \"only\"", /Save writes[^.]*into your mod/.test(intro) && !/\bonly\b/i.test(intro), intro);
  rec("…and that a Save into a mod does not change the base game's files", /never changes the base game's files/.test(intro), intro);
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("All green");
