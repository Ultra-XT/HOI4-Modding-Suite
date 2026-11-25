// 🌍 Generate land ends with 🔧 Auto-fix all's own repair, so the click leaves no FATAL problem behind.
// ⛔ #generate-land-leaves-no-fatal (B5-WD1)
//
// THE DEFECT (campaign B5, WD-1, driven twice: 11-04 and 11-13; again by repro-B5-wd1 at 69382835: 4,650 ocean provinces raised,
// FATAL after the click {"fractioned_naval_region":1}). Raised land splits a base-game region's sea, so Generate land alone left
// fractioned_naval_region — in the fatal set: HOI4 refuses the map — under a dialog that promises "one region's worth at a time, so
// nothing crashes". 🌍 Generate a world runs 🔧 Auto-fix all right after this step (world-run.js step 4) and its worlds load; the
// button did not. map-data.js says so itself (padQueueAndReberthFleets: "Ending the click with those repairs too is the next step").
//
// Now a click that left a problem in the fatal set (asked as the Save check asks it: reportedMapProblems + isFatalRule) ends, inside its
// own backup scope (the wrapper's `then`), with the same function 🔧 Auto-fix all's click runs — autoFixMapAndItsNames, ONE function and
// not a second version — and the answer carries its answer as `autoFix` (+ `forFatal`). Not in a world run's own child: its next step
// is that same repair, and its HTTP client gives up on an answer after 300 s.
//
// Driven through the endpoint with map-data's two calls stubbed (generateLand answers a write and runs the endpoint's `then`;
// autoFixMap records each call), so this measures the endpoint's wiring in seconds; repro-B5-wd1 measures a real world.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL " ) + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b5-wd1-genland");
const md = require("./map-data.js");
const SW = require("./safe-write.js");
const { createApp } = require("./server.js");
const { jsBodyAt, maskJsLiterals } = require("./testlib-strip-comments.js");
const RAW = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
const SERVER = maskJsComments(RAW);
const LITS = maskJsLiterals(RAW);   // braces counted with strings, templates and regexes masked (lengths kept)
/** From `sig` to the brace that closes the body it opens, comments masked. */
const bodyOf = (_src, sig) => {
  const at = SERVER.indexOf(sig);   // found where strings are still there; both masks keep every offset
  const b = at < 0 ? null : jsBodyAt(LITS, at);
  return b ? SERVER.slice(at, b[1] + 1) : "";
};
/** The route's own handler: from its app.post( to the brace that closes it. */
const routeOf = (ep) => bodyOf(SERVER, `app.post("${ep}"`);

// The stubs. generateLand: as the real wrapper does, it runs the endpoint's `then` with its result inside a backup scope of its own.
const calls = [];
let genAnswer = () => ({ changed: true, newStates: [], createdStates: 0 });
let fixAnswer = () => ({ ok: true, fixes: { marker: "the auto-fix stub" } });
// what the Save check finds after the land was raised: a real world's one FATAL (repro-B5-wd1), or nothing at all
let problemsAfter = () => [{ severity: "error", rule: "fractioned_naval_region", provinces: [8812], total: 1 }, { severity: "warning", rule: "coastal_no_port", total: 3 }];
md.reportedMapProblems = (opts) => { calls.push({ fn: "reportedMapProblems", modRoot: opts.modRoot }); return problemsAfter(); };
md.landProvincesInEffectiveDefinition = () => 0;
md.generateLand = (opts, then) => {
  calls.push({ fn: "generateLand", modRoot: opts.modRoot });
  const scope = SW.beginBackupScope({ dir: path.join(world.ROOT, "gl-copies"), root: opts.modRoot });
  try {
    const made = genAnswer();
    if (typeof then === "function" && made) then(made);
    return made;
  } finally { SW.endBackupScope(); void scope; }
};
md.autoFixMap = (opts) => {
  // inside a scope that is open already, beginBackupScope hands back that scope: its dir says whose it is
  const s = SW.beginBackupScope({ dir: "" }); const dir = s && s.dir; SW.endBackupScope();
  calls.push({ fn: "autoFixMap", modRoot: opts.modRoot, scopeDir: dir });
  return fixAnswer();
};

(async () => {
  let srv = null;
  try {
    console.log("0. The source");
    const gen = routeOf("/api/map/generate-land"), fix = routeOf("/api/map/auto-fix");
    const shared = bodyOf(SERVER, "function autoFixMapAndItsNames(");
    rec("⭐⭐ the shared repair runs autoFixMap and the names writers after it", /mapData\.autoFixMap\(\{ modRoot, gameRoot, dependencyRoots \}\)/.test(shared) && /forgetAutoFixRemovedStateNames\(/.test(shared) && /nameNewStates\(/.test(shared), shared.slice(0, 300));
    rec("⭐⭐ 🔧 Auto-fix all's click runs it (one function, not two versions)", /autoFixMapAndItsNames\(modRoot, gameRoot, dependencyRoots\)/.test(fix) && !/mapData\.autoFixMap\(/.test(fix), fix.slice(0, 400));
    const thenAt = gen.indexOf("(made) => {"), namesAt = gen.indexOf("nameNewStates(modRoot, made.newStates"), fixAt = gen.indexOf("autoFixMapAndItsNames(");
    rec("⭐⭐⭐ 🌍 Generate land's endpoint runs it inside generateLand's `then`, after the new states are named", thenAt > 0 && namesAt > thenAt && fixAt > namesAt && /made\.autoFix = Object\.assign\(autoFixMapAndItsNames\(/.test(gen), { thenAt, namesAt, fixAt });
    rec("…only when the click wrote, and not in a world run's own child (its next step is this same repair)",
      /if \(made\.changed && !process\.env\.NOVA_WORLD_JOB\) \{[\s\S]{0,900}autoFixMapAndItsNames\(/.test(gen));
    rec("…and only for a problem in the fatal set, asked as the Save check asks it (reportedMapProblems + isFatalRule)",
      /mapData\.reportedMapProblems\(\{ modRoot, gameRoot: gameRootNow, dependencyRoots: depsNow \}\)[\s\S]{0,120}isFatalRule\(p\.rule\)/.test(gen) && /if \(fatal\.length\) made\.autoFix = /.test(gen));
    rec("the world run's own child is known the way installWorldRun knows it", /const inChild = !!process\.env\.NOVA_WORLD_JOB;/.test(SERVER));

    srv = await lib.startServer(createApp);
    const mod = world.mod("Generated Here", {});
    const pageBody = { count: 3, seed: 1, ownerMode: "inherit", owner: "", replacesExistingWorld: true };   // public/map.js #mapGenConfirmBtn

    console.log("\n1. ⛔ A click that raised land");
    calls.length = 0;
    const r = await srv.post("/api/map/generate-land", pageBody, mod);
    rec("the click answered ok", r.status === 200 && r.body.ok === true, r);
    const fx = calls.filter((c) => c.fn === "autoFixMap");
    rec("⭐⭐⭐ Auto-fix all's repair ran, once, on this mod", fx.length === 1 && fx[0].modRoot === mod, calls);
    rec("⭐⭐⭐ …after the land was raised", calls.findIndex((c) => c.fn === "generateLand") < calls.findIndex((c) => c.fn === "autoFixMap"), calls);
    rec("⭐⭐ …inside the click's own backup scope, so its copies are in the click's folder", fx[0] && fx[0].scopeDir === path.join(world.ROOT, "gl-copies"), fx[0]);
    rec("⭐⭐ the answer carries the repair's answer as `autoFix`, and the FATAL rules that called for it", r.body.autoFix && r.body.autoFix.ok === true && r.body.autoFix.fixes && r.body.autoFix.fixes.marker === "the auto-fix stub"
      && JSON.stringify(r.body.autoFix.forFatal) === JSON.stringify(["fractioned_naval_region"]), r.body);

    console.log("\n1b. A click that left nothing HOI4 refuses runs no repair (a warning is not a reason)");
    problemsAfter = () => [{ severity: "warning", rule: "coastal_no_port", total: 3 }];
    calls.length = 0;
    const w = await srv.post("/api/map/generate-land", pageBody, mod);
    rec("⭐⭐⭐ the Save check was asked, and no repair ran", w.body.ok === true && calls.some((c) => c.fn === "reportedMapProblems") && calls.every((c) => c.fn !== "autoFixMap") && w.body.autoFix === undefined, { calls, body: w.body });
    problemsAfter = () => [{ severity: "error", rule: "fractioned_naval_region", provinces: [8812], total: 1 }];

    console.log("\n1c. In a world run's own child the click leaves the repair to the run's next step");
    process.env.NOVA_WORLD_JOB = JSON.stringify({ modPath: mod });
    calls.length = 0;
    const c = await srv.post("/api/map/generate-land", pageBody, mod);
    delete process.env.NOVA_WORLD_JOB;
    rec("⭐⭐ no check and no repair in the child", c.body.ok === true && calls.every((x) => x.fn === "generateLand") && c.body.autoFix === undefined, { calls, body: c.body });

    console.log("\n2. A click that wrote nothing runs no repair");
    genAnswer = () => ({ changed: false, error: "No sea to raise." });
    calls.length = 0;
    const n = await srv.post("/api/map/generate-land", pageBody, mod);
    rec("⭐⭐ no repair ran, and the answer has none", calls.every((c) => c.fn !== "autoFixMap") && n.body.autoFix === undefined, { calls, body: n.body });

    console.log("\n3. A repair that throws costs the land nothing, and is said");
    genAnswer = () => ({ changed: true, newStates: [], createdStates: 0 });
    fixAnswer = () => { throw new Error("stub: the repair broke"); };
    const t = await srv.post("/api/map/generate-land", pageBody, mod);
    rec("⭐⭐ the click still answers ok (the land stands), with the repair's failure in `autoFix`", t.body.ok === true && t.body.autoFix && t.body.autoFix.ok === false && /the repair broke/.test(t.body.autoFix.error || ""), t.body);

    console.log("\n4. 🔧 Auto-fix all's own click still runs the same repair");
    fixAnswer = () => ({ ok: true, fixes: { marker: "the auto-fix stub" } });
    calls.length = 0;
    const a = await srv.post("/api/map/auto-fix", {}, mod);
    rec("⭐ POST /api/map/auto-fix runs autoFixMap once and answers its fixes", a.body.ok === true && calls.filter((c) => c.fn === "autoFixMap").length === 1 && a.body.fixes && a.body.fixes.marker === "the auto-fix stub", { a: a.body, calls });
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== Generate land ends with the Auto-fix repair: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  else if (checks < 12) { console.log("   too few checks ran"); process.exitCode = 1; }
})();
