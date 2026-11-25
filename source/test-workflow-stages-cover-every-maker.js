// #military-missing-from-the-workflow — HOME LISTED NINE STAGES AND THE APP SHIPS TEN MAKERS.
//
// The Military tab — division templates, equipment, the modular designer, manufacturers, orders of battle —
// was absent from Home's "Modding workflow stages" and from the per-mod progress strip beneath it. It was the
// only maker in the nav bar that Home never mentioned, so the one route a new modder is pointed down walked
// straight past it.
//
// Two stage names were also stale in the same list: "Event Maker" and "Decision Maker", renamed to Events and
// Decisions in the nav months earlier.
//
// ⭐ THE CHECK IS DERIVED, NOT LISTED. A hand-written expectation here would have been written at the same
// time as the hand-written stage list, from the same incomplete idea of what the app contains — so it would
// have agreed with the bug. Instead: read the nav bar (the app's own statement of what makers exist) and
// require the workflow to cover all of it, with matching names.
"use strict";
const fs = require("fs");
const path = require("path");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300));
  }
}

const read = (f) => fs.readFileSync(path.join(__dirname, "public", f), "utf8");
const HOME = read("home.html");

// ── What makers does the app say it has? Take it from a nav bar, not from this file. ───────────────────
// `[^>]*` after the class is load-bearing: the nav links carry other attributes now (data-i18n, added when
// Nova gained an interface language), and an anchor that demanded `class="…">` immediately stopped matching
// ANY of them — so this test's whole premise silently evaluated to an empty list. Match the smallest thing
// that carries the meaning: the href, the class, and the label.
const nav = [...read("modhealth.html").matchAll(/<a href="([a-z-]+\.html)" class="suite-nav-link[^"]*"[^>]*>([^<]+)<\/a>/g)]
  .map((m) => ({ href: m[1], name: m[2].trim() }))
  .filter((x) => x.href !== "home.html");

console.log("\n[the nav bar is readable — otherwise this test asserts nothing]");
rec("found the maker list in the nav", nav.length >= 9, nav.map((n) => n.name));

// ── What does the workflow claim? ─────────────────────────────────────────────────────────────────────
// `[^>]*>` after each class, for the same reason as the nav matcher above: these elements carry other
// attributes now (data-i18n, added when the workflow cards became translatable), and demanding `class="…">`
// with the `>` immediately after matched NONE of them — which would have left this test comparing two empty
// lists and passing. The `.length >= 9` guard is what catches that; keep it.
const stages = [...HOME.matchAll(/<a href="([a-z-]+\.html)"[^>]*class="journey-card"[^>]*>[\s\S]{0,400}?<h3 class="journey-name"[^>]*>(\d+)\.\s*([^<]+)<\/h3>/g)]
  .map((m) => ({ href: m[1], n: Number(m[2]), name: m[3].trim() }));

console.log("\n[every maker in the nav is a workflow stage]");
{
  rec("the workflow parses", stages.length > 5, stages.length);
  const missing = nav.filter((x) => !stages.some((s) => s.href === x.href));
  rec("no maker is missing from the workflow", missing.length === 0, missing.map((m) => m.name));
  // …and nothing in the workflow points at a page that is not a maker.
  const stray = stages.filter((s) => !nav.some((x) => x.href === s.href));
  rec("no workflow stage points somewhere the nav does not", stray.length === 0, stray.map((s) => s.name));
}

console.log("\n[the names agree with the nav]");
{
  // "Event Maker" vs "Events" is how the list drifted last time.
  const mismatched = stages
    .map((s) => ({ s, navName: (nav.find((x) => x.href === s.href) || {}).name }))
    .filter((p) => p.navName && p.navName !== p.s.name);
  rec("every stage is named as the nav names it", mismatched.length === 0,
    mismatched.map((p) => `${p.s.name} != ${p.navName}`));
}

console.log("\n[the numbering is 1..n with no gaps or repeats]");
{
  const ns = stages.map((s) => s.n);
  const want = ns.map((_, i) => i + 1);
  rec("numbered 1..n in order", JSON.stringify(ns) === JSON.stringify(want), ns);
}

console.log("\n[the progress strip covers the same ground]");
{
  const HOMEJS = read("home.js");
  const at = HOMEJS.indexOf("const PROGRESS_STEPS = [");
  const block = at === -1 ? "" : HOMEJS.slice(at, HOMEJS.indexOf("];", at));
  rec("PROGRESS_STEPS parses", block.length > 100, block.length);
  const hrefs = [...block.matchAll(/href:\s*"([a-z-]+\.html)"/g)].map((m) => m[1]);
  rec("the Military maker has a progress chip", hrefs.includes("army.html"), hrefs);
  // Every chip must point at a real maker page, or it is a dead link on the front page.
  const bad = hrefs.filter((h) => !nav.some((x) => x.href === h));
  rec("every chip points at a maker in the nav", bad.length === 0, bad);
  // The chip needs a count key the index actually publishes, or it renders a permanent zero.
  const keys = [...block.matchAll(/key:\s*"([a-z_]+)"/g)].map((m) => m[1]);
  rec("the Military chip counts equipment", keys.includes("equipment"), keys);
}

console.log(`\n=== workflow stages cover every maker: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
