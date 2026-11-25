// ⛔ #an-add-on-is-told-what-auto-fix-froze — EVERY 🔧 AUTO-FIX STEP THAT ANSWERS THE FILES IT COPIED INTO THE MOD HAS THEM SAID.
//
// B6-16 made the page say " — to do it, <file> is now YOUR mod's, frozen at this build of the map below" for the steps that copy a
// file of the layer below in (materialisedNote), because from then on the add-on pins that file as the layer below has it today and an
// update of that layer no longer reaches it (the overlay rule). The B4-7 repair (fixRailwayLinksNotNeighbours, review of group b)
// answers `materialised: ["map/railways.txt"]` — on its own repro a 🔗 Remove of vanilla's Japan–Kyushu row, then one click, copied the
// base game's 909-line railways.txt into the add-on — and the page's split clause did not read it, so the line named no file.
//
// Derived, never typed: the steps are autoFixMap's own `fixes.<key> = <fixer>(` assignments, a step "answers" the list when its
// fixer's body (comments masked) names `materialised`, and the page must read `<its variable>.materialised`, its variable being the
// one the summary binds to `fr.fixes.<key>`. Then run, not read: the page's own summary (testlib-map-page.autoFixSummary) for a split
// that copied railways.txt in names the file. Run: node test-every-auto-fix-step-that-copies-a-file-in-says-so.js
"use strict";
const fs = require("fs");
const path = require("path");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
const T = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}

// ── 1. derived: each step that answers `materialised` is read by the page ──
{
  const raw = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const LIT = maskJsLiterals(raw), CODE = maskJsComments(raw);
  const at = LIT.indexOf("function autoFixMap(");
  const body = at < 0 ? null : jsBodyAt(LIT, at);
  rec("THE CONTROL: autoFixMap's body is found", !!body && body[1] - body[0] > 20000, body);
  const page = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
  const steps = new Map();
  if (body) for (const m of CODE.slice(body[0], body[1]).matchAll(/fixes\.(\w+)\s*=\s*(\w+)\(/g)) if (!steps.has(m[1])) steps.set(m[1], m[2]);
  const answering = [];
  for (const [key, fn] of steps) {
    const i = LIT.indexOf(`function ${fn}(`);
    if (i < 0) continue;
    const b = jsBodyAt(LIT, i);
    if (b && /\bmaterialised\b/.test(CODE.slice(b[0], b[1]))) answering.push([key, fn]);
  }
  rec("THE CONTROL: the steps that answer `materialised` are found, the railway split among them", answering.length >= 8 && answering.some(([k]) => k === "railGaps"), answering.map(([k]) => k));
  for (const [key, fn] of answering) {
    const v = new RegExp(`(\\w+) = \\(fr\\.fixes && fr\\.fixes\\.${key}\\) \\|\\| \\{\\}`).exec(page);
    rec(`the page reads what ${key} (${fn}) copied in`, !!v && new RegExp(`\\b${v[1]}\\.materialised\\b`).test(page), v ? v[1] : "the summary binds no variable to fr.fixes." + key);
  }
}

// ── 2. run: a split that copied railways.txt in says so, and one that did not says nothing of a file ──
{
  const split = { line: 442, level: 1, from: 11985, to: 1025, pieces: [], removed: true };
  let copied = "", own = "";
  try {
    copied = T.autoFixSummary({ ok: true, fixes: { railGaps: { fixed: 1, splits: [split], materialised: ["map/railways.txt"] } } });
    own = T.autoFixSummary({ ok: true, fixes: { railGaps: { fixed: 1, splits: [split] } } });
  } catch (e) { copied = own = "THREW " + e.message; }
  rec("CONTROL: the page says the split", /split 1 railway link/.test(copied) && /11985 → 1025/.test(own), { copied, own });
  rec("a split that copied map/railways.txt in names it as the mod's now", /split 1 railway link[^]*— to do it, map\/railways\.txt is now YOUR mod's, frozen at this build of the map below/.test(copied), copied);
  rec("…and one on the mod's own railways.txt names no file", !/now YOUR mod's/.test(own), own);
}

console.log(`\n=== every Auto-fix step that copies a file in says so: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) process.exit(1);
