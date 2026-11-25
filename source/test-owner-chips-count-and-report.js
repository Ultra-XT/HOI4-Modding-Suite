// #owner-chips-are-unsaved-work + #owner-sync-result-discarded
//
// THE GAME-START OWNER CHIPS WERE INVISIBLE TO EVERY DIRTY CHECK, AND THEIR FAILURES REPORTED SUCCESS.
//
// The owner bridge is the "activate this at game start for…" control on the Decisions and Spirits pages: a
// country picker, an Add button, and a row of chips. The chips are rendered from a JS Set as spans — not
// form controls — and both pages decide "is this dirty?" by snapshotting the editor's inputs. So adding five
// countries changed nothing either snapshot could compare: the editor looked untouched, and a click in the
// item list discarded them with no prompt.
//
// And the write path had the mirror problem. owner-bridge.js's sync() deliberately does NOT throw — it
// collects what the server refused and RETURNS { failed }, so the caller can report it. The Events maker
// reads that and appends it to its save dialog. Decisions and Spirits both wrote `await bridge.sync(id)` and
// dropped the result on the floor, so a refused owner write — no mod selected, a read-only vanilla root, an
// item type the endpoint will not grant — ended with "Successfully saved". The bridge does raise an amber
// status line of its own, but the post-save list reload and auto-select wipe it about 50ms later, so the
// modal is the only place that survives.
//
// Verified in both running makers on Millennium Dawn, with the owner writes stubbed to answer 400:
//     add country chips                        → the page reports unsaved changes
//     click another item in the list            → asks, instead of discarding them
//     Save with the owner write refused         → "Successfully saved" (true — the item WAS saved)
//                                                 AND "could not be written", naming the reason
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
const PUB = path.join(__dirname, "public");
const { stripJsComments } = require("./testlib-strip-comments.js");
const read = (f) => stripJsComments(fs.readFileSync(path.join(PUB, f), "utf8"));
const BRIDGE = read("owner-bridge.js"), OVERLAY = read("loading-overlay.js");
const IDEAS = read("ideas.js"), DEC = read("decisions.js"), EV = read("events.js");

console.log("\n[the premise] sync reports refusals instead of throwing");
{
  rec("sync collects what it could not write", /const failed = \[\];/.test(BRIDGE) && /failed\.push\(\{ who, error/.test(BRIDGE), "the bridge stopped collecting refusals");
  rec("…and returns them", /return \{ failed \};/.test(BRIDGE), "the caller has nothing to read");
  rec("…and a non-2xx counts as a refusal", /!r\.ok \|\| \(data && data\.error\)/.test(BRIDGE), "a 400 would read as success");
  rec("…and the chips are exposed for a dirty check", /owners: \(\) => owners/.test(BRIDGE), "no way to see the staged chips from outside");
}

console.log("\n[the chips count as unsaved work]");
{
  // The shared watcher gains a hook for state that is not a form control.
  rec("the shared watcher accepts an extra signal", /typeof opts\.extra === "function"/.test(OVERLAY), "novaWatchUnsaved cannot see non-input state");
  rec("…folded into the snapshot", /parts\.push\("\\u0002extra=" \+ String\(opts\.extra\(\)\)\)/.test(OVERLAY), "the extra is read and discarded");
  rec("…and a throwing extra cannot break the dirty check", /catch \(_e\) \{ \/\* never break the dirty check \*\/ \}/.test(OVERLAY) || /catch \(_e\) \{/.test(OVERLAY), "a bad extra would take the guard down");

  rec("Spirits passes its chips in", /extra: \(\) => \(ideaBridge \? \[\.\.\.ideaBridge\.owners\(\)\]\.sort\(\)\.join\(","\) : ""\)/.test(IDEAS), "spirit owner chips are still invisible");
  rec("Decisions folds its chips into its own snapshot", /decisionBridge\.owners\(\)\]\.sort\(\)\.join\(","\)/.test(DEC), "decision owner chips are still invisible");
  rec("Events passes its chips in too", /extra: \(\) => \[\.\.\.eventOwners\]\.sort\(\)\.join\(","\)/.test(EV),
    "removing an event's owner-country chip is discarded with no prompt");

  // ⭐ DERIVED, because two pages adopting a hook and the third not is exactly how this shipped twice.
  // Any maker that holds owner countries in a JS collection AND watches its editor must fold that
  // collection into what it watches — the chips are spans, so nothing else can see them.
  {
    const PUBDIR = path.join(__dirname, "public");
    const owners = [];
    for (const f of fs.readdirSync(PUBDIR).filter((x) => x.endsWith(".js")).sort()) {
      const src = stripJsComments(fs.readFileSync(path.join(PUBDIR, f), "utf8"));
      // A maker holds owner countries either by attaching the SHARED widget (ideas.js and decisions.js —
      // the chip markup lives in owner-bridge.js, not in them, so looking for chip rendering in the maker
      // itself found only events.js and missed the two this bug was originally fixed in) or by keeping its
      // own Set and rendering the chips itself (events.js).
      const usesSharedBridge = /NovaOwnerBridge\.attach\(\{/.test(src);
      const ownsItsOwnChips = /OwnerChips|owner-chip/i.test(src) && /new Set\(\)/.test(src);
      const watches = /novaWatchUnsaved\(\{/.test(src) || /decEditorSnapshot/.test(src);
      if (watches && (usesSharedBridge || ownsItsOwnChips)) owners.push(f);
    }
    console.log("     makers with owner chips AND a watcher: " + owners.join(", "));
    rec("the makers that own this widget were found", owners.length >= 3, owners);
    const foldsThemIn = (f) => {
      const src = stripJsComments(fs.readFileSync(path.join(PUBDIR, f), "utf8"));
      // Either through the shared watcher's `extra` hook, or folded into a home-grown snapshot.
      return /extra: \(\) =>/.test(src) || /owners\(\)\]\.sort\(\)\.join/.test(src);
    };
    const missing = owners.filter((f) => !foldsThemIn(f));
    rec("…and every one of them folds its chips into what it watches", missing.length === 0,
      { missing, note: "a maker whose chips no guard can see discards them with no prompt" });
  }
  // ⭐ SORTED. Otherwise the order the chips happened to be added in reads as a change on every render.
  rec("…both sorted, so insertion order is not a change", (IDEAS.match(/owners\(\)\]\.sort\(\)/g) || []).length === 1 && (DEC.match(/owners\(\)\]\.sort\(\)/g) || []).length === 1, "an unsorted signature would flap");

  // RUN the extra hook through the real snapshot builder.
  const at = OVERLAY.indexOf("window.novaWatchUnsaved = function (opts)");
  let fnSrc = "";
  if (at !== -1) {
    let i = OVERLAY.indexOf("{", OVERLAY.indexOf("(opts)", at)), d = 0;
    for (; i < OVERLAY.length; i++) { if (OVERLAY[i] === "{") d++; else if (OVERLAY[i] === "}") { d--; if (d === 0) { fnSrc = OVERLAY.slice(at, i + 1); break; } } }
  }
  rec("the watcher factory was extracted", fnSrc.length > 400, fnSrc.length);
  if (fnSrc) {
    let owners = [];
    const ctx = {
      document: { querySelector: () => ({ __novaTouchWired: false, querySelectorAll: () => [], addEventListener: () => {} }) },
      window: {}, api: null,
    };
    vm.createContext(ctx);
    vm.runInContext(fnSrc.replace(/^window\.novaWatchUnsaved = /, "api = ") + `;\napi = api({ root: "#x", label: "t", extra: () => owners.slice().sort().join(",") });`, Object.assign(ctx, { owners }));
    ctx.api.markClean();
    rec("RUN: an editor with no inputs but staged chips starts clean", ctx.api.isDirty() === false, ctx.api.snapshot());
    ctx.owners.push("FRA");
    rec("RUN: …and adding a chip makes it dirty", ctx.api.isDirty() === true, "chips still invisible to the watcher");
    ctx.owners.length = 0;
    rec("RUN: …and removing it again goes clean", ctx.api.isDirty() === false, ctx.api.snapshot());
    ctx.owners.push("GER", "FRA");
    const a = ctx.api.snapshot();
    ctx.owners.length = 0; ctx.owners.push("FRA", "GER");
    rec("RUN: …and the order they were added in does not count", ctx.api.snapshot() === a, "an unsorted signature would report a phantom change");
  }
}

console.log("\n[a refused owner write is reported where it survives]");
{
  for (const [name, code, verb] of [["Spirits", IDEAS, "spirit"], ["Decisions", DEC, "decision"]]) {
    rec(`${name} keeps what sync returned`, /const ownerSync = \w+Bridge \? await \w+Bridge\.sync\(/.test(code), "the result is discarded again");
    rec(`…${name} builds a warning from it`, /ownerSync\.failed\.map\(\(f\) => "• " \+ f\.who \+ ": " \+ f\.error\)/.test(code), "the reasons are dropped");
    rec(`…and ${name} puts it in the save dialog`, new RegExp("nbAlert\\(`[^`]*\\$\\{ownerWarn\\}`\\)").test(code), "the warning is built and never shown");
    rec(`…saying the ${verb} itself WAS saved`, new RegExp("The " + verb + " was saved, but").test(code), "it would read as a total failure, which it is not");
  }
  // Events already did this and is the pattern; if it regresses, the others lose their reference. Both of
  // its save dialogs carry the warning, so require both — one surviving mention of the variable is not
  // evidence the user would ever see it. (The first version of this check was satisfied by an unrelated
  // second occurrence of `ownerSync.failed.length` in the same file, and stayed silent when I broke it.)
  rec("CONTROL: Events still builds its warning from the refusals",
    /ownerWarn = \(ownerSync && ownerSync\.failed\.length\)/.test(EV) && /ownerSync\.failed\.map\(\(f\) => "• " \+ f\.who/.test(EV),
    "the page this was copied from regressed");
  rec("…and still shows it in BOTH of its save dialogs",
    (EV.match(/nbAlert\([^;]*ownerWarn/g) || []).length === 2,
    (EV.match(/nbAlert\([^;]*ownerWarn/g) || []).length);
}

console.log("\n[CONTROL] the bridge and the guards around it still work");
{
  rec("the bridge still writes per-country", /set-startup"/.test(BRIDGE), "the per-country write went");
  rec("…and still toggles the all-countries grant", /set-startup-all"/.test(BRIDGE), "the all-countries write went");
  rec("…and still records what actually landed", /loaded = nowLoaded;/.test(BRIDGE), "the disk belief is no longer corrected after a failure");
  rec("Spirits still guards its item switch", /confirmDiscard\("Switch spirit"/.test(IDEAS), "the list guard went");
  rec("Decisions still guards its item switch", /confirmDiscardDecisionEdits\(/.test(DEC), "the list guard went");
}

console.log(`\n=== owner chips count and report: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
