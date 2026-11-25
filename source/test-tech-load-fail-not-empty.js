// #tech-load-fail-wipes-starting-techs — A FAILED READ LOOKED EXACTLY LIKE "THIS COUNTRY HAS NONE".
//
// Country Setup's starting-technology panel read `data.techs || []` and never looked at resp.ok or
// data.error. /api/technologies/country-techs answers HTTP 400 {error} on failure — a cold mod, a blip, a
// bad path — and the panel rendered "No starting technologies assigned."
//
// That is the dangerous half. Adding one technology then posts techIds: currentTechs, which now holds only
// the tech just typed, and writeCountryTechnologies strips the country's top-level set_technology and
// re-emits exactly what it was sent. Millennium Dawn gives most of its 345 countries a full starting tech
// list; one failed read plus one ＋ Add replaced it with a single entry, reported as success.
//
// ⭐ army.js has carried this whole pattern for the starting STOCKPILE for a long time, under a comment
// describing the identical failure: "a transient failure must NOT masquerade as an EMPTY stockpile —
// otherwise the user adds one entry, Saves, and the server replaces the file's stockpile block, silently
// wiping this country's REAL starting equipment". It sets S._spLoadFailed, shows a Retry, and refuses to
// write while the flag is set. Country Setup never adopted any of it.
"use strict";
const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const fails = [];
let checks = 0;
function rec(label, cond, detail) {
  checks++;
  if (cond) console.log("  ok   " + label);
  else {
    fails.push(label);
    console.log("  FAIL " + label + "  -> " + String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400));
  }
}

const CS = fs.readFileSync(path.join(__dirname, "public", "country-setup.js"), "utf8");
const CODE = stripJsComments(CS); // ⚠️ the fix's own prose names every symbol this greps for

console.log("\n[the read] a non-ok response must not be read as an empty list");
{
  const at = CODE.indexOf("async function loadCountryTechs(");
  const near = at === -1 ? "" : CODE.slice(at, at + 1600);
  rec("the loader is findable", at !== -1, "not found");
  // THE BUG: `currentTechs = data.techs || [];` with no status check at all.
  rec("it checks resp.ok", /!resp\.ok/.test(near), near.slice(0, 300));
  rec("…and an error body too", /data\.error/.test(near), near.slice(0, 300));
  rec("…and records that the load failed", /techLoadFailed = true/.test(near), near.slice(0, 400));
  rec("…and clears the flag on a good read", /techLoadFailed = false/.test(near), near.slice(0, 400));
}

console.log("\n[⭐ the save] must refuse while the list is unknown");
{
  const at = CODE.indexOf("async function saveCountryTechs(");
  const near = at === -1 ? "" : CODE.slice(at, at + 900);
  rec("the save is findable", at !== -1, "not found");
  rec("it refuses when the load failed", /if \(techLoadFailed\)/.test(near), near.slice(0, 300));
  // …and refuses BEFORE it posts anything, not after.
  const guardAt = near.indexOf("techLoadFailed");
  const postAt = near.indexOf("save-country-techs");
  rec("…and the refusal comes before the request", guardAt !== -1 && (postAt === -1 || guardAt < postAt), { guardAt, postAt });
}

console.log("\n[the empty state] a failure must not borrow the words for 'this country has none'");
{
  const at = CODE.indexOf("function renderTechs(");
  const near = at === -1 ? "" : CODE.slice(at, at + 1200);
  rec("the renderer is findable", at !== -1, "not found");
  rec("a failed load renders its own message", /if \(techLoadFailed\)/.test(near), near.slice(0, 300));
  // …and the failure branch comes FIRST, or the empty state wins and says the wrong thing.
  const failAt = near.indexOf("techLoadFailed");
  const emptyAt = near.indexOf("No starting technologies assigned");
  rec("…before the empty-state branch", failAt !== -1 && emptyAt !== -1 && failAt < emptyAt, { failAt, emptyAt });
  rec("…and it offers a retry", /csTechRetryBtn/.test(near), near.slice(0, 400));
}

console.log("\n[⭐ THE SIBLING] army.js still has the pattern this was copied from");
{
  // If that guard is ever removed from army.js this test's premise is gone and someone should look at both.
  const army = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "army.js"), "utf8"));
  rec("army.js still flags a failed stockpile load", /_spLoadFailed = true/.test(army), "the sibling pattern is gone");
  rec("…and still refuses to save on it", /_spLoadFailed/.test(army) && /spRetryBtn/.test(army), "the sibling's retry is gone");
}

console.log("\n[CONTROL] a genuinely empty country still reads as empty, not as an error");
{
  // The fix must not turn "no starting technologies" into a scary message. The empty branch is still there
  // and still reachable when the load succeeded.
  const at = CODE.indexOf("function renderTechs(");
  const near = at === -1 ? "" : CODE.slice(at, at + 1200);
  rec("the empty state survives", /No starting technologies assigned/.test(near), near.slice(0, 400));
  rec("…and is guarded by the list being empty, not by the flag",
    /if \(!currentTechs\.length\)/.test(near), near.slice(0, 500));
}

console.log("\n[the cache tag] a fixed page the browser never re-fetches is not fixed");
{
  let tags = [];
  for (const h of fs.readdirSync(path.join(__dirname, "public")).filter((f) => f.endsWith(".html"))) {
    const html = fs.readFileSync(path.join(__dirname, "public", h), "utf8");
    for (const m of html.matchAll(/country-setup\.js\?v=([A-Za-z0-9]+)/g)) tags.push(m[1]);
  }
  console.log(`     country-setup.js cache tag: ${[...new Set(tags)].join(", ") || "(none)"}`);
  rec("country-setup.js is served with a cache tag", tags.length > 0, tags);
  // ⚠️ DIGITS ONLY FOR THIS ONE. Three other tests assert /country-setup\.js\?v=\d+/ —
  // test-tech-picker-icon-size, test-new-country-name-list and test-country-setup-picker-cache — so a
  // descriptive tag like "techload40" breaks all three at once, which is exactly what it did. Other pages
  // allow a word prefix; this page does not, and that only shows up in the full suite, so state it here
  // where anyone bumping the tag will read it.
  rec("…and the tag is digits only, which three other tests require",
    tags.every((t) => /^\d+$/.test(t)), tags);
}

console.log(`\n=== tech load fail not empty: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
