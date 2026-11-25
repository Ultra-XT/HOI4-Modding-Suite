// #makers-lose-unsaved-work — BROWSING PROMPTED TO DISCARD WORK NOBODY HAD DONE.
//
// Reported from real use: clicking through companies asked "you have unsaved changes … lose them?",
// clicking through characters did the same, and so did switching tabs. Three symptoms, one cause.
//
// novaWatchUnsaved decides "dirty" by comparing a SNAPSHOT of every input/textarea/select under the
// watched root against a baseline taken by markClean(). Loading an entity is not over when the
// synchronous part ends: several makers start a fetch that later writes into one of those controls. If
// the baseline is taken before that write lands, the write itself makes snapshot() != clean, and the page
// announces unsaved changes with zero user input. The tab bar is not a separate bug — novaGuardSuiteNav
// consults the very same isDirty(), so a stale-dirty editor makes every tab click prompt too.
//
// The watcher already ships the cure, markCleanUnlessTouched(), and events.js already uses it correctly:
//
//     bridgeLoad = loadEventBridge();
//     evUnsaved.markClean();
//     Promise.resolve(bridgeLoad).then(() => evUnsaved.markCleanUnlessTouched()).catch(() => {});
//
// characters.js reproduced every element of that shape — the markClean, the markCleanUnlessTouched, even
// the explanatory comment — and wrote `Promise.resolve()` where events.js writes `Promise.resolve(load)`.
// An argument-less Promise.resolve() is ALREADY RESOLVED, so the re-baseline ran on the next microtask,
// before the fetch had been answered, and re-snapshotted the identical state markClean() had taken one
// line earlier. A perfect no-op that reads like a fix.
//
// The MIO (companies) editor had no late re-baseline at all: render() -> wire() starts the country
// catalog fetch, the host's baseline is taken synchronously a few lines later while <select id="mioAllowed">
// is still empty, and the fetch then writes the company's `allowed` tag into it. A fetch cannot resolve
// inside a synchronous block, so that one was not a race — it fired for every company carrying an
// allowed tag, which is essentially all of vanilla's and Millennium Dawn's.
//
// WHAT THIS TEST GUARDS. Comments are stripped first, because this file and the fixes it checks both
// describe the broken shape in prose, and a naive grep would find its own explanation and pass.
"use strict";

const fs = require("fs");
const path = require("path");
const { stripJsComments } = require("./testlib-strip-comments.js");

const PUB = path.join(__dirname, "public");
const read = (f) => stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + detail));
  if (!cond) fails.push(label);
};

try {
  // The offending shape, as a detector rather than a hand-written list of places to look. Any
  // markCleanUnlessTouched chained onto an argument-less Promise.resolve() is the bug, wherever it is.
  const BARE_RESOLVE = /Promise\s*\.\s*resolve\s*\(\s*\)\s*\.then\s*\([^;]{0,200}?markCleanUnlessTouched/;

  // ---------------------------------------------------------------------------------------------
  console.log("\n1. The detector itself bites (composed here, so a green run cannot be a broken check)");
  // Memory of this codebase: a control that does not bite means the check is not load-bearing. So the
  // OLD code is reconstructed here and fed to the same detector the real files go through.
  const OLD_SHAPE =
    "if (chUnsaved) {\n" +
    "  chUnsaved.markClean();\n" +
    "  Promise.resolve().then(() => chUnsaved.markCleanUnlessTouched());\n" +
    "}\n";
  const NEW_SHAPE =
    "if (chUnsaved) {\n" +
    "  chUnsaved.markClean();\n" +
    "  Promise.resolve(recruitLoad).then(() => chUnsaved.markCleanUnlessTouched()).catch(() => {});\n" +
    "}\n";
  rec("the detector flags the shape that shipped the bug", BARE_RESOLVE.test(OLD_SHAPE));
  rec("the detector passes the shape that fixes it", !BARE_RESOLVE.test(NEW_SHAPE));

  // ---------------------------------------------------------------------------------------------
  console.log("\n2. No maker re-baselines on an already-resolved promise");
  // Derived from the directory, never typed in: a new maker with this bug must fail without anyone
  // remembering to add it here.
  const uiFiles = fs.readdirSync(PUB).filter((f) => f.endsWith(".js")).sort();
  let sawWatcher = 0;
  for (const f of uiFiles) {
    const src = read(f);
    if (!src.includes("markCleanUnlessTouched")) continue;
    sawWatcher++;
    rec(f + " chains its late re-baseline onto a real promise", !BARE_RESOLVE.test(src));
  }
  // A filter that excludes the evidence reads exactly like an absence of it, so prove the loop ran.
  rec("more than one file was actually examined", sawWatcher >= 3, "files using the watcher: " + sawWatcher);

  // ---------------------------------------------------------------------------------------------
  console.log("\n3. characters.js waits for the recruit-country lookup");
  const ch = read("characters.js");
  rec("the async load's promise is captured rather than discarded", /const\s+recruitLoad\s*=/.test(ch));
  rec("the re-baseline is chained to it", /Promise\s*\.\s*resolve\s*\(\s*recruitLoad\s*\)/.test(ch));
  // There were two fire-and-forget calls in this shape. Exactly one is left, and it is newChar's, which
  // is not a defect: for a blank character autoDetectMembership has no token, so it returns before
  // touching the picker and writes only status text and a button's display — neither of which the
  // snapshot looks at. Asserting the COUNT rather than the absence keeps that distinction honest; if a
  // third one appears, this fails and someone has to decide which kind it is.
  const fireAndForget = (ch.match(/if \(recruitRefresh\) recruitRefresh\(\);/g) || []).length;
  rec("only newChar still calls recruitRefresh without keeping its promise", fireAndForget === 1,
    "matches: " + fireAndForget);

  // ---------------------------------------------------------------------------------------------
  console.log("\n4. The companies editor tells its host when the async fill lands");
  const mio = read("mio-editor.js");
  rec("mio-editor accepts an onFormSettled callback", /var\s+onFormSettled\s*=\s*opts\.onFormSettled/.test(mio));
  rec("the country-catalog fetch is kept, not dropped", /pendingFill\s*=\s*window\.NovaCountryPicker\.populate/.test(mio));
  rec("settleForm chains onto that promise", /Promise\s*\.\s*resolve\s*\(\s*pendingFill\s*\)/.test(mio));

  // Every place that re-baselines must also settle, or one path keeps the bug. Counted, not spot-checked:
  // "after X" is not "only after X" in this codebase, and an exact count is the only honest form.
  const replaced = (mio.match(/onFormReplaced\(\)\s*;/g) || []).length;
  const settled = (mio.match(/settleForm\(\)\s*;/g) || []).length;
  rec("every onFormReplaced() call is followed by a settleForm()", replaced > 0 && replaced === settled,
    "onFormReplaced() x" + replaced + ", settleForm() x" + settled);

  // ---------------------------------------------------------------------------------------------
  console.log("\n5. The host actually supplies it");
  // The editor has no watcher of its own; it is mounted inside ideas.html and the page's watcher is the
  // one that sees its fields. A callback the host never passes is a fix that does nothing.
  const ideas = read("ideas.js");
  rec("ideas.js passes onFormSettled to the MIO editor", /onFormSettled\s*:/.test(ideas));
  rec("and maps it to markCleanUnlessTouched, not markClean",
    /onFormSettled\s*:[^,]{0,160}markCleanUnlessTouched/.test(ideas));

  // ---------------------------------------------------------------------------------------------
  console.log("\n6. The pattern that already worked is still intact");
  // events.js is the reference implementation. If it ever regresses, the thing everything else was
  // modelled on is gone, and this test should say so rather than quietly measuring nothing.
  const ev = read("events.js");
  rec("events.js still captures its bridge load", /bridgeLoad\s*=\s*loadEventBridge\(\)/.test(ev));
  rec("events.js still chains the re-baseline to it", /Promise\s*\.\s*resolve\s*\(\s*bridgeLoad\s*\)/.test(ev));

  console.log(`\n=== a loaded entity is not unsaved work: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  process.exitCode = 1;
}
