// ⛔ #unwired-fixer — A REPAIR THAT EXISTS AND IS TESTED BUT IS NEVER CALLED LOOKS EXACTLY LIKE A BUG THAT
// CANNOT BE FIXED.
//
// This has happened here before. fixDuplicateStateFiles was written, tested and correct — and was never
// wired into autoFixMap. So duplicate_state_id and province_in_two_states_files had no auto-fixer in
// practice, the owner hit sixteen "unfixable" Map Errors on Millennium Dawn, and the problems "came back
// every click". The function passing its own test is precisely what made it invisible: nothing was broken
// except the wiring.
//
// So: derive the list of repair functions from the source, and require each to be reachable from
// autoFixMap — either called directly, or called by another fixer that is. Typing the list into this file
// would reproduce the original failure, because a fixer added later and never wired would also never be
// typed in here.
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail === undefined ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail))));
  if (!ok) fails.push(label);
};

const raw = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8").replace(/\r/g, "");
const lines = raw.split("\n");
const isComment = (s) => /^\s*(\/\/|\*|\/\*)/.test(s);

// Every repair function this module defines, derived — never typed in.
const REPAIR_NAME = /^\s*function\s+((?:fix|repair|close|renumber)[A-Za-z0-9_]*)\s*\(/;
const defined = [];
const ranges = new Map();
for (let i = 0; i < lines.length; i++) {
  if (isComment(lines[i])) continue;
  const m = REPAIR_NAME.exec(lines[i]);
  if (m) { defined.push(m[1]); ranges.set(m[1], i); }
}
// function body = from its declaration to the next top-level function
const allFns = [];
for (let i = 0; i < lines.length; i++) {
  if (isComment(lines[i])) continue;
  const m = /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(lines[i]);
  if (m) allFns.push({ name: m[1], start: i });
}
for (let i = 0; i < allFns.length; i++) allFns[i].end = (i + 1 < allFns.length) ? allFns[i + 1].start : lines.length;
const bodyOf = (name) => {
  const f = allFns.find((x) => x.name === name);
  if (!f) return "";
  return lines.slice(f.start + 1, f.end).filter((l) => !isComment(l)).join("\n");
};

rec("the sweep found the repair functions", defined.length >= 15, defined.length + " defined");
rec("autoFixMap exists", !!bodyOf("autoFixMap"), "autoFixMap not found");

// Reachability: start from autoFixMap and walk calls into other repair functions.
const calledIn = (body, name) => new RegExp("(^|[^A-Za-z0-9_$.])" + name + "\\s*\\(").test(body);
const reachable = new Set();
const queue = ["autoFixMap"];
const seen = new Set(queue);
while (queue.length) {
  const cur = queue.shift();
  const body = bodyOf(cur);
  if (!body) continue;
  for (const name of defined) {
    if (reachable.has(name) || !calledIn(body, name)) continue;
    reachable.add(name);
    if (!seen.has(name)) { seen.add(name); queue.push(name); }
  }
}

console.log("\n-- every repair is reachable from the one-click Auto-fix --");
const orphaned = defined.filter((n) => !reachable.has(n));
rec("no repair function is defined but never called", orphaned.length === 0, {
  orphaned,
  hint: "it exists, it probably has a test, and it will never run — wire it into autoFixMap or call it from a fixer that is wired",
});
rec("…and the walk actually reached most of them", reachable.size >= defined.length - 1, reachable.size + " of " + defined.length);

// ⛔ #region-moves-unprotect-an-inland-sea — WIRED IN IS NOT ENOUGH; SOME FIXERS MUST RUN AFTER OTHERS.
//
// fixInlandSeas spares a sea body that sits in a SEA strategic region (the legitimate Caspian case). The
// region fixers MOVE provinces between regions, which changes that judgement — so a body protected when
// fixInlandSeas ran can be unprotected by the time the click ends. Measured on a 1,524-state workshop mod
// with the map already settled: fixFractionedRegions moved 27 provinces and fixInlandSeas then found 5 NEW
// isolated inland seas. HOI4 divides by zero on one of those ~5s into loading, so a single "Auto-fix all"
// ended with a CTD still in the map and reported nothing — the user only got it repaired by clicking again.
//
// These are dependencies between fixers, invisible in each fixer's own tests, and re-ordering autoFixMap
// looks harmless. Reproducing them needs a province bitmap, which a unit fixture has no cheap way to build,
// so the ORDER is pinned here instead. Positions come from the source; only the constraint is stated.
console.log("\n-- fixers that must run after other fixers --");
{
  const body = bodyOf("autoFixMap");
  const lastCall = (name) => body.lastIndexOf(name + "({");
  const firstCall = (name) => body.indexOf(name + "({");
  const ORDER = [
    ["fixInlandSeas", "fixFractionedRegions",
      "moving provinces between strategic regions can unprotect a sea body, so the inland-sea sweep must run again afterwards or the click ends with a crash still in the map"],
    ["fixStatelessLand", "fixInlandSeas",
      "converting a sea province to land leaves it with no state, so the stateless-land pass must follow the last inland-sea pass"],
    ["fixBuildingsTxtPlacement", "repairRegionOverlaps",
      "buildings are re-homed by province ownership, so this must read the map after every fixer that moves provinces"],
    ["fixUnitStacks", "fixInlandSeas",
      "unitstacks slot types are land/sea specific, and fixInlandSeas turns sea into land — reading the province types any earlier repairs the map as it was halfway through the click"],
    // #one-auto-fix-click-leaves-every-coast-with-a-port — found by test-map-stress.js on seed 20260911.
    ["fixCoastalNoPort", "fixPortsWhoseWaterIsGone",
      "removing a port that points at land can leave its province with none, so ports must be added after stranded ones are removed — or the click ends with a coast HOI4 says will likely crash"],
    ["fixCoastalNoPort", "fixInlandSeas",
      "turning an inland sea back into land strands the ports that faced it and changes its neighbours' coasts, so the port pass must read the province types the click ends with"],
    // ⭐ #a-land-province-leaves-the-seas-layout — the star and the Standstill of land the map below never laid out as land. Not a
    // `fix…` name, so the reachability sweep above does not know it; its place in the click is pinned here.
    ["layOutUnitPositions", "fixUnitStacks",
      "only a unitstacks.txt the mod owns is laid out, and the unit-stack repair is the step that copies one in — before it, the first click would take the copy and only a second would lay it out"],
    ["layOutUnitPositions", "fixStateIdFloor",
      "a row is laid out only in a state the mod's own file defines, and a state the floor pass splits off is one, with a new victory point of its own"],
    ["fixModelsOnTheOldGround", "layOutUnitPositions",
      "the layout gives a row it moves the height of the ground at its new place, after which it is no longer the layer below's row — the old-ground step, run first, would re-seat and count rows that are then moved"],
  ];
  for (const [later, earlier, why] of ORDER) {
    const a = lastCall(later), b = firstCall(earlier);
    rec(`${later} runs after ${earlier}`, a > -1 && b > -1 && a > b, { [later]: a, [earlier]: b, why });
  }
  // #a-click-keeps-the-dockyard-of-a-coast-it-gives-back — found by batch 8's discovery on a vanilla mod: the naval pass removed
  // Litorale's dockyard for having no coast, then the stateless-land pass gave Litorale its coastal province back in the same click.
  // After the LAST call of each, not the first: the second inland-sea pass turns sea into land (landlocking a state) and is followed
  // by a second stateless-land pass (handing a coast to one).
  for (const [earlier, why] of [
    ["fixStatelessLand", "giving a stateless coastal province to a state gives that state a coast, so a dockyard must not be removed for a coast the click then hands back"],
    ["fixInlandSeas", "turning an inland sea back into land can landlock a state, so the naval pass must judge the province types the click ends with"],
  ]) {
    const a = lastCall("fixNavalBuildingsWithoutCoast"), b = lastCall(earlier);
    rec(`fixNavalBuildingsWithoutCoast runs after the last ${earlier}`, a > -1 && b > -1 && a > b, { fixNavalBuildingsWithoutCoast: a, [earlier]: b, why });
  }
  // fixBuildingsTxtPlacement must be the LAST fixer called at all — it reads the final province→state map.
  // ⛔ #a-model-left-on-the-old-ground — …but for ONE step that must follow it for a reason of its own. fixModelsOnTheOldGround stands
  // the rows of the mod's own buildings.txt / unitstacks.txt on the ground the map has now, and the buildings.txt pass (like the port,
  // slot and unit-stack passes before it) can copy one of those files in with the layer below's heights; a step before it would leave
  // that copy on the old ground. It rewrites heights only — no province, no state, no position — so nothing the buildings pass reads
  // moves after it. Named, with its reason, and it checks itself: an entry whose call is gone or moved fails here.
  const AFTER_BUILDINGS = ["fixModelsOnTheOldGround"];
  const btIdx = lastCall("fixBuildingsTxtPlacement");
  const laterThanBuildings = defined.filter((n) => n !== "fixBuildingsTxtPlacement" && !AFTER_BUILDINGS.includes(n) && lastCall(n) > btIdx);
  rec("nothing runs after the buildings.txt pass", laterThanBuildings.length === 0, laterThanBuildings);
  for (const n of AFTER_BUILDINGS) {
    rec(`${n} runs after the buildings.txt pass and every unit-stack repair — the one step allowed there, and only while it is there`,
      defined.includes(n) && firstCall(n) > btIdx && firstCall(n) > lastCall("fixUnitStacks"), { [n]: firstCall(n), fixBuildingsTxtPlacement: btIdx, fixUnitStacks: lastCall("fixUnitStacks") });
  }
}

console.log("\n-- validateMapBitmap builds ONE model, not one per rule --");
// ⏱ #one-model-per-validate — buildMapModel is NOT memoised: measured at 187 ms on the owner's kurdistan
// mod whether it is the first call or the fifth. validateMapBitmap runs on every save, and every rule in it
// used to build its own, so ADDING A RULE SILENTLY ADDED 187 ms. Sharing one lazily-built model took the
// whole call from 2119 ms to 1894 ms on vanilla and 3454 ms to 3174 ms on kurdistan.
//
// ⚠️ This is a SOURCE-SHAPE assertion, and CLAUDE.md is right that those are weaker than running the thing.
// It is here because the failure it guards is a slow creep that no behavioural test would ever go red on —
// the next rule that calls buildMapModel directly costs a fifth of a second per save and breaks nothing.
// The behavioural half is the whole suite, which exercises these rules for real.
{
  // ⚠️ FOLLOW THE SPLIT, DO NOT PIN THE NAME. validateMapBitmap became a two-line wrapper when the read-only
  // pass landed (#the-active-mod-was-read-eight-times-for-one-press): it now opens readOnlyMapPass and hands
  // the work to validateMapBitmapRules. The old lift found the wrapper, counted zero model builds, and failed
  // five checks on a change that made the thing it guards STRICTLY BETTER — a test encoding the old shape.
  // So: lift the wrapper, and if all it does is delegate, lift what it delegates to. Derived, so the next
  // split costs nobody an hour.
  let body = bodyOf("validateMapBitmap");
  const delegate = /return\s+\w+\(\s*\(\s*\)\s*=>\s*(\w+)\s*\(/.exec(body.replace(/\r/g, ""));
  if (delegate && body.length < 500) {
    const inner = bodyOf(delegate[1]);
    rec("validateMapBitmap delegates, so the rules body is " + delegate[1], inner.length > 500, inner.length + " chars");
    body = inner;
  }
  rec("validateMapBitmap's rules body was found", body.length > 500, body.length + " chars");
  const builds = (body.match(/(^|[^A-Za-z0-9_$.])buildMapModel\s*\(/g) || []).length;
  rec("⏱ it builds the map model exactly once", builds === 1, builds + " call(s) — share sharedModel() instead of adding another");
  rec("…inside the memoised helper, so it is built lazily and only once",
    /_modelTried\s*=\s*true;?\s*\n?\s*try\s*\{\s*_model\s*=\s*buildMapModel/.test(body.replace(/\r/g, "")),
    "the single call must be the one inside sharedModel()");
  // …and the rules that need it must actually be given it, or they build their own inside themselves.
  for (const fn of ["findDatedNavalBuildingsWithoutCoast", "findUnitStackMismatches"]) {
    const called = new RegExp("(^|[^A-Za-z0-9_$.])" + fn + "\\s*\\(\\{[^}]*model:\\s*sharedModel\\(\\)").test(body);
    rec(`${fn} is handed the shared model`, called, "without it, it builds its own and the sharing is undone");
  }
}

console.log("\n-- every model build says what it wants from the stable layers --");
// ⏱ #stable-layers-on-purpose — buildMapModel re-parses the base game every call unless told not to:
// 187 ms against 57 ms, measured on kurdistan. Only 4 of 51 call sites asked for the cache, so an Auto-fix
// click paid full price 31 times over (~31 s, of which ~6 s was this).
//
// It is safe by construction, which is why it can be the default answer: getRootLayer(modRoot, false) means
// the MOD's own layer is never cached — only the base game's and the dependencies', which Nova does not
// write to — and the one unsafe case, a user editing the base game directly, is disabled inside
// buildMapModel by editingGameRoot. Vanilla's validate time is unchanged by the whole change, which is that
// guard doing its job rather than a missed optimisation.
//
// So every call site must say which it wants, `true` or an explicit `false` with a reason. That is a
// self-documenting alternative to an allow-list, which CLAUDE.md notes goes stale the moment the call it
// excused is gone.
{
  // ⚠️ Mask comments first — CLAUDE.md: a fix's own explanatory prose contains the string the check greps
  // for, and the notes above these call sites talk about cacheStableLayers at length.
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const src = maskJsComments(raw);
  // Each call's argument object, up to its closing brace — enough to see whether the flag is mentioned.
  const calls = src.match(/buildMapModel\(\{[^}]*\}/g) || [];
  const silent = calls.filter((c) => !/cacheStableLayers/.test(c));
  rec("the sweep found the model builds", calls.length >= 40, calls.length + " call(s)");
  rec("⏱ every one states its stable-layer intent", silent.length === 0,
    silent.length + " say nothing — pass cacheStableLayers: true, or an explicit false with a reason");
  rec("…and at least one is a deliberate opt-out or opt-in, so the flag is not dead",
    calls.some((c) => /cacheStableLayers:\s*true/.test(c)));
}

console.log("\n-- the control: an unwired repair must be caught --");
// Prove the check can fail, rather than trusting that it would. A name the source does not call.
{
  const fake = "fixSomethingNobodyCalls";
  const wouldCatch = !new RegExp("(^|[^A-Za-z0-9_$.])" + fake + "\\s*\\(").test(bodyOf("autoFixMap"));
  rec("a repair autoFixMap does not call is not treated as reachable", wouldCatch);
}

console.log("\n  (" + defined.length + " repair functions, all reachable from autoFixMap)");
console.log("\n" + (fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks));
process.exitCode = fails.length ? 1 : 0;
