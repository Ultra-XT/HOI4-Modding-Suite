// The Map Errors "🔧 Auto-fix all" summary says what HOI4 does with a duplicate state definition — and the modder can still
// read it once the map has reloaded. #the-auto-fix-summary-claims-no-failed-load-for-a-duplicate-state
//
// THE DEFECT (two halves, both in the popup's click handler in public/map.js):
//   1. The part for fixes.dupStateFiles said "a state id in two files makes HOI4 fail to load the map". duplicate_state_id is
//      NOT in the curated FATAL set: Millennium Dawn ships duplicate state files and launches, HOI4 keeping the first file
//      (map-rule-labels.js, the FATAL comment), and the rule's own message says the game "loads only the first file
//      alphabetically and ignores the rest". Every other place a rule is shown words itself from FATAL_OUTCOME
//      (#the-save-gate-says-what-hoi4-does); this line claimed the failed load that batch 8 took off the Save gate's words.
//      Deferred as batch 8 engine item B2 because the line sat inline in a click handler "with no runnable unit to test it".
//   2. The handler set the summary as the status line and then called `await load()` with no message. load() writes
//      "Loading map model…" at once, and when the map image has decoded buildFromImage writes `doneMsg || "Ready — …"`. So
//      every Auto-fix summary — what it fixed and what it deliberately left alone — was replaced by "Ready — 256×256px…"
//      before the modder could read it. Generate land and New country already pass their result as load's doneMsg.
//
// HOW IT IS TESTED: the popup, the click handler, load() and buildFromImage() are the page's own code, lifted by
// testlib-map-page.js and RUN against a real in-process server over a small two-layer world whose mod really has a duplicate
// state id. The claim vocabulary is the one test-a-map-message-claims-only-what-the-engine-shows.js holds non-FATAL messages to.
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("autofixdup");   // before server.js: it reads HOI4_MODS_ROOT when it loads
const MOD = world.mod("Dup States", {
  "history/states/1-A.txt": L2.st(1, "4"),
  "history/states/3-C.txt": L2.st(3, "3"),
  // A leftover stub for id 3 whose only province is state 1's: fixDuplicateStateFiles removes exactly this shape.
  "history/states/3-restored.txt": L2.st(3, "4"),
});
const labels = require("./public/map-rule-labels.js");
const P = require("./testlib-map-page.js");
const { createApp } = require("./server.js");

// test-a-map-message-claims-only-what-the-engine-shows.js, section 5: what a message about a rule outside FATAL may not say.
const LOADCLAIM = /fails? to load the map|won't load the map|will not load the map|refuses to load|Failed to load the map|aborts? loading|stops? loading/i;
const CERTAIN = /\bcrashes\b|\bwill crash\b|crash the map load|fails? to load the map|aborts? loading|won't load the map|will not load the map|refuses to load/i;

(async () => {
  const srv = await L2.startServer(createApp);
  try {
    console.log("1. The world really has a duplicate state id, and the rule is not one Save stops for");
    const v0 = await srv.validate(MOD);
    const dup = (v0.problems || []).filter((p) => p.rule === "duplicate_state_id");
    rec("THE CONTROL: validate reports duplicate_state_id for id 3", dup.length === 1 && dup[0].stateId === 3, (v0.problems || []).map((p) => p.rule));
    rec("THE EVIDENCE: duplicate_state_id is not in the FATAL set", labels.isFatalRule("duplicate_state_id") === false);
    rec("…so what HOI4 does with it has no failed-load class", labels.fatalOutcome("duplicate_state_id") === "", labels.fatalOutcome("duplicate_state_id"));

    console.log("\n2. The popup's own Auto-fix click, run");
    const requests = [];
    const log = [];
    const page = P.runPage([
      "function regionRepairNote(",
      // …and the cut-off-province note the click handler has built its summary with since 790cb21. Without it the click throws
      // "fractionedRepairNote is not defined" before any summary is written.
      "function fractionedRepairNote(",
      "function openMapErrorsModal(",
      "async function load(doneMsg)",
      "function buildFromImage(img, doneMsg)",
    ], P.loadGlobals({
      modPath: () => MOD,
      Image: P.fakeImageClass({ log }),
      fetch: async (url, opts) => {
        const u = String(url);
        const r = await fetch(srv.base + u, opts);
        const body = await r.json().catch(() => ({}));
        requests.push({ url: u.split("?")[0], body });
        return { json: async () => body };
      },
    }));
    const { sb, statuses, overlays } = page;
    sb.openMapErrorsModal(v0);
    const popup = overlays.find((o) => /id="mapErrOverlay"|mapErrFix/.test(o.innerHTML)) || overlays[overlays.length - 1];
    const fixBtn = popup && popup.querySelector("#mapErrFix");
    rec("THE CONTROL: the popup offers 🔧 Auto-fix all for this map", !!fixBtn, popup && popup.innerHTML.slice(0, 200));
    if (!fixBtn) throw new Error("no Auto-fix button to click");
    const before = L2.tree(MOD);
    await fixBtn.listeners.click[0]();
    for (let i = 0; i < 40 && !log.includes("image-loaded"); i++) await P.settle(10);
    await P.settle(20);
    const after = L2.tree(MOD);

    const af = requests.find((q) => q.url === "/api/map/auto-fix");
    const removed = af && af.body && af.body.fixes && af.body.fixes.dupStateFiles && af.body.fixes.dupStateFiles.removed;
    rec("THE CONTROL: the click posted Auto-fix and the server removed the duplicate", Array.isArray(removed) && removed.length === 1 && removed[0].id === 3, af && af.body && af.body.fixes && af.body.fixes.dupStateFiles);
    rec("…and it really left the mod", !("history/states/3-restored.txt" in after) && ("history/states/3-restored.txt" in before), L2.written(before, after));
    rec("THE CONTROL: the map reloaded — the image decoded after load() returned", log.includes("image-loaded"), log);

    console.log("\n3. ⛔ What the summary says about the duplicate");
    const summary = statuses.find((s) => /Auto-fixed/.test(s)) || "";
    const part = (summary.split(" · ").find((x) => /duplicate state definition/.test(x)) || "");
    rec("the summary names the duplicate it removed", /removed 1 duplicate state definition/.test(part), summary);
    rec("⭐⭐⭐ …and does not claim HOI4 fails to load the map over a rule outside the FATAL set", !!part && !LOADCLAIM.test(part) && !CERTAIN.test(part), part);
    rec("⭐⭐ …it says what the game does instead: the first file for the id is kept and the other ignored",
      /first/i.test(part) && /ignor/i.test(part), part);

    console.log("\n4. ⛔ …and the modder can still read it when the reload is done");
    const last = statuses[statuses.length - 1] || "";
    rec("⭐⭐⭐ the status line left on screen after the reload is the Auto-fix summary, not the generic Ready line",
      /Auto-fixed/.test(last) && /duplicate state definition/.test(last), { last, statuses });
    const reopened = overlays.filter((o) => /id="mapErrClose"/.test(o.innerHTML));
    rec("THE CONTROL: the popup re-opened with the re-checked map", reopened.length >= 2, reopened.length);
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e), false);
  } finally {
    srv.close();
    world.cleanup();
    console.log(`\n=== the Auto-fix summary says what HOI4 does with a duplicate state: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
