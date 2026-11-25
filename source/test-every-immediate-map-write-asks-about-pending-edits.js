// Every map action that writes IMMEDIATELY and then reloads must ask about unsaved work first.
// #new-country-discards-your-staged-edits
//
// Most map edits stage into pendingWrites and land on 💾 Save. A handful POST straight away and then call
// load() — and load() resets pendingWrites, paintDiff, stagedRiverEdits and the dirty flag. So an immediate
// write with staged edits outstanding throws them away.
//
// That is why hasPendingMapEdits() exists, and Move country, Generate land, Save baseline, Auto-fix, Fix all
// and Remove country all consult it. ✨ New country never did: staged owner changes, painted pixels, river
// strokes and unstaged panel typing vanished with no message.
//
// ⚠️ ONE deliberate exception, asserted as such below: 🛟 Restore baseline. It is the recovery path — the
// modder is restoring precisely because the map is broken, discarding the edits is the point, and blocking
// it behind "save your edits first" would make the escape hatch unreachable exactly when it is needed. Its
// confirm says so in terms and is styled dangerous.
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const { maskJsComments } = require("./testlib-strip-comments.js");
const MASKED = maskJsComments(MAP);

console.log("\n=== every immediate writer consults the guard ===");
{
  // DERIVED, not listed: an immediate write is a fetch to a mutating /api/map/ endpoint that is NOT part of
  // the staged-save replay. Find them by walking the fetches and asking whether a guard appears above.
  const IMMEDIATE = [
    "/api/map/create-country",
    "/api/map/auto-fix",
    "/api/map/generate-land",
    "/api/map/save-baseline",
    "/api/map/restore-baseline",
    "/api/map/rebuild-regions",   // #a-rebuilt-world-needs-its-own-regions — 🗺 Redraw regions, checked in its own section below
    "/api/map/world-run",         // 🌍 Generate a world — its run reloads the page when it ends; checked in its own section below
  ];
  // …and check the list itself is still real, so it cannot quietly stop covering anything.
  for (const url of IMMEDIATE) {
    ok(MASKED.indexOf(url) > 0, `${url} is still an endpoint this page calls`, url);
  }

  // ⚠️ NO "is there a guard above this fetch" SWEEP. Two attempts at one were both wrong, and the reasons
  // are worth recording because they are properties of the page, not of the probe:
  //
  //   · a fixed look-back window spills into the PREVIOUS handler — restore-baseline read as guarded
  //     because save-baseline's guard sits a few lines above it;
  //   · scoping to the enclosing handler then read generate-land as UNGUARDED, because its guard is on the
  //     toolbar button while its fetch lives in the confirm dialog's own handler — a different function.
  //
  // A guard and its write are simply not always lexically adjacent, so a lexical sweep cannot decide this.
  // Assert instead what CAN be bounded exactly: the guard count does not fall, and the one function this
  // fix is about holds a guard (checked properly in its own section below).
  const guardCount = (MASKED.match(/hasPendingMapEdits\(\)/g) || []).length;
  ok(guardCount >= 10,
    `⭐⭐ the page consults the unsaved-work guard in ${guardCount} places`, guardCount);
  const decl = (MASKED.match(/function hasPendingMapEdits/g) || []).length;
  ok(decl === 1, "…and there is exactly one definition of it, so they all mean the same thing", decl);
}

console.log("\n=== …and the exception really is the recovery path, with its own warning ===");
{
  // ⚠️ BOUNDED BY THE HANDLER, NOT BY A CHARACTER COUNT. This was MAP.slice(at - 400, at + 2200), and this
  // file's own header already records what a fixed look-back window did to it once. The forward window then
  // did the same from the other side: the restore handler gained a paragraph explaining where it MOVES a
  // directory the baseline does not hold, the warning slid past 2,200 characters, and three checks failed
  // on a page whose warning had not changed at all. The three things asserted below all live inside the
  // restore button's own click handler, so that is the bound — from the listener to the next one.
  const at = MASKED.indexOf("/api/map/restore-baseline");
  const opens = MASKED.lastIndexOf("restoreBaseBtn.addEventListener", at);
  const next = MASKED.indexOf("addEventListener(", at);          // the first listener AFTER the restore fetch
  ok(opens > 0 && next > at, "the restore button's own click handler was bounded", { opens, at, next });
  const around = MAP.slice(opens > 0 ? opens : Math.max(0, at - 400), next > at ? next : at + 4000);
  // ⚠️ MOVED WITH the review of the units-baseline fixes (R2): the handler builds its message with baselineRestoreConfirmText, from what
  // the baseline holds, so the words are that function's — and they open every message it builds, whatever the baseline holds
  const cf = MASKED.indexOf("function baselineRestoreConfirmText(");
  const confirmBody = cf < 0 ? "" : MAP.slice(cf, MASKED.indexOf("\n  function ", cf + 10));
  // ⚠️ MOVED WITH B6-26 (#a-restore-says-what-it-leaves): the message now lists what it puts back first, then discards the edits to them
  // ⚠️ MOVED WITH review MF-2 of b6-g3 (#a-baseline-guarantees-only-what-its-check-said): it calls the baseline known-good only when it promises
  // the game loads (`loads`), so its opening is asked for with that one word left to the verdict
  ok(/const restoreMsg = baselineRestoreConfirmText\(/.test(around) && /return `Restore the map to your \$\{loads \? "known-good " : ""\}baseline\? It puts back, /.test(confirmBody)
      && /This DISCARDS every map edit made to them since the baseline was saved/.test(confirmBody),
    "⚠️ Restore baseline says in terms that it discards the modder's edits", around.slice(0, 200));
  ok(/danger:\s*true/.test(around), "⚠️ …and asks with a dangerous-styled confirm", around.slice(0, 200));
  ok(/novaConfirm|window\.confirm/.test(around),
    "⚠️ …that actually asks, rather than assuming a modal helper exists", around.slice(0, 200));
}

console.log("\n=== the message points at the modal, not the status line ===");
{
  const s = MASKED.indexOf("function submitNewCountry");
  const body = s < 0 ? "" : MAP.slice(s, MASKED.indexOf("\n  }", s) + 4);
  ok(body.length > 400, "submitNewCountry was found", body.length);
  const g = body.indexOf("hasPendingMapEdits()");
  ok(g > 0, "…and it holds the guard", g);
  const near = body.slice(g, g + 400);
  ok(/setErr\(/.test(near),
    "⭐ the refusal is shown in the modal the author is looking at", near.slice(0, 200));
  // …and it must come BEFORE the write, not after it.
  ok(g < body.indexOf("/api/map/create-country"),
    "⭐⭐ …and before the POST, so nothing has been written when it refuses", { guardAt: g, fetchAt: body.indexOf("/api/map/create-country") });
  // …and before the modal is closed, or the message would land on a dialog that is gone.
  ok(g < body.indexOf("closeNewCountryModal()"),
    "⭐ …and before the modal closes, so the message has somewhere to appear", { guardAt: g, closeAt: body.indexOf("closeNewCountryModal()") });
}

console.log("\n=== 🗺 Redraw regions asks before its plan AND before its write ===");
{
  // #a-rebuilt-world-needs-its-own-regions — the button fetches a dry run and opens a confirm; the confirm's own handler posts
  // the write. Edits could be staged while the dialog is open, so BOTH handlers hold the guard, each before its own fetch.
  for (const [btn, body] of [["mapRedrawRegions", "dryRun: true"], ["mapRedrawConfirmBtn", "confirm: true"]]) {
    const open = MASKED.indexOf(`$("${btn}").addEventListener`);
    const next = MASKED.indexOf("addEventListener(", open + 30);
    const h = open < 0 ? "" : MASKED.slice(open, next > open ? next : open + 3000);
    const g = h.indexOf("hasPendingMapEdits()"), f = h.indexOf("/api/map/rebuild-regions"), b = h.indexOf(body);
    ok(open > 0 && f > 0 && b > f, `${btn}'s handler posts ${body}`, { open, f, b });
    ok(g > 0 && g < f, `⭐ …and consults the unsaved-work guard before that POST`, { guardAt: g, fetchAt: f });
  }
}

console.log("\n=== 🌍 Generate a world asks before its plan AND before its run ===");
{
  // The toolbar button reads the plan (a dry run) and opens a confirm; the confirm's own button starts the run, whose end reloads the
  // page through load(). Edits could be staged while the dialog is open, so BOTH functions hold the guard, each before its own fetch.
  for (const [fn, url] of [["async function openWorldConfirm(", "/api/map/prepare-world"], ["async function startWorldRun(", "/api/map/world-run\""]]) {
    const open = MASKED.indexOf(fn), end = open < 0 ? -1 : MASKED.indexOf("\n  }", open);
    const h = open < 0 ? "" : MASKED.slice(open, end);
    const g = h.indexOf("hasPendingMapEdits()"), f = h.indexOf(`fetch("${url.replace(/"$/, "")}", { method: "POST"`);
    ok(open > 0 && f > 0, `${fn.replace(/^async function |\($/g, "")} posts ${url.replace(/"$/, "")}`, { open, f });
    ok(g > 0 && g < f, `⭐ …and consults the unsaved-work guard before that POST`, { guardAt: g, fetchAt: f });
  }
}

console.log(`\n=== every immediate map write asks about pending edits: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
