// One "Auto-fix all" click ends where both region rules agree: a province cut off from its strategic region moves with its
// whole state, or Auto-fix says it cannot, and a second click writes nothing. #the-region-fixers-agree-on-a-cut-off-province
//
// THE DEFECT (batch 8 discovery F11). fixFractionedRegions moves a cut-off piece of a naval region into the region it borders
// most, whatever state its land belongs to. repairRegionOverlaps then runs and moves that province back to the region the rest
// of its state is in. On a Delete-map world they undid each other on every click: clicks 3 and 4 each returned
// fractionedRegions { moved: 5 } and regionOverlaps { statesAligned: 4, provincesMoved: 5 }, the mod's tree was byte-identical
// before and after each click, and fractioned_naval_region (FATAL, refuses-to-load) still named 13392, 13298, 10145, 7419 and
// 2183. Each is a generated LAND province whose only neighbours are sea of another region, in a state whose other provinces
// sit in the region it is listed in. The page's summary never read fractionedRegions, so every click read the same.
//
// THE DECISION. HOI4 judges a region with any sea as one piece: every listed province floods over provinces.bmp's four pixel
// neighbours, with the horizontal wrap, and over every adjacencies.csv row. And a region holds whole states. So a cut-off piece
// whose land belongs to a state that reaches outside the piece moves only together with that whole state, into a neighbouring
// region where that leaves the piece's region in fewer pieces and no other region in more (a region with no sea is not
// checked). When no neighbouring region takes the whole state, Auto-fix moves nothing and reports no work.
// MEASURED on discovery's world (f11-judge.js): none of the five has a neighbouring region that takes its whole state (each
// would cut the target region into 3-6 pieces), so there moving the state whole is not the answer.
//
// ⚠️ SECTION 1 MOVED WITH #a-cut-off-piece-gets-a-state-of-its-own. "Auto-fix says it cannot" was the answer for EVERY stuck
// piece; it is now the answer only for a piece Auto-fix may not carve — one whose state comes from a layer below the mod,
// where cutting the state in two would copy that layer's file into the mod. A piece in a state the mod itself ships is carved
// out into a state of its own and moved (test-a-cut-off-piece-gets-a-state-of-its-own.js), so section 1 is that shape in two
// layers instead of one. Everything it asserts is unchanged: no region work, nothing written, the province still named, and a
// second click that writes nothing either. What Auto-fix still never does is hand the province to ANOTHER state: which state
// owns land is the modder's decision.
//
// On the base commit this file fails 9 checks: both looping shapes report the same region work on every click, the island is
// never said to be unrepairable, and the movable shape still has fractioned_naval_region after its click.
//
// Requests are the page's: POST /api/map/auto-fix { modPath } (the Map Errors popup's button) and GET /api/map/validate?modPath.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b9-cutoff-state");
const { createApp } = require("./server.js");

// A 256x256 map the mod ships whole. Top half: sea 1 (x < 128) and sea 5 (x >= 128), with the island, land 3, inside sea 5.
// Bottom half: land 2 (32 <= x < 96) with land 4 on both sides of it, so across the wrap seam 1 meets 5 and 4 meets itself
// (no X-crossing on the seam). Land 2 touches sea 1 and land 4 only; land 4 touches both seas.
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 0, 120] };
const at = (x, y) => (y < 128 ? (x >= 192 && x < 224 && y >= 32 && y < 64 ? 3 : x < 128 ? 1 : 5) : (x >= 32 && x < 96 ? 2 : 4));
const DEF = ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1",
  "3;0;200;0;land;true;plains;1", "4;200;200;0;land;true;plains;1", "5;0;0;120;sea;false;ocean;0"].join("\r\n") + "\r\n";
// x is the pixel column, z the row counted from the bottom (256 - y). A site for each state on its own land, and a port for
// every coastal land province facing a sea it touches.
const buildings = (islandState) => [
  "1;air_base;176.00;9.50;56.00;0.00;0", "1;rocket_site_spawn;176.00;9.50;56.00;0.00;0",
  "2;air_base;48.00;9.50;56.00;0.00;0", "2;rocket_site_spawn;48.00;9.50;56.00;0.00;0",
  ...(islandState === 3 ? ["3;air_base;208.00;9.50;208.00;0.00;0", "3;rocket_site_spawn;208.00;9.50;208.00;0.00;0"] : []),
  "2;naval_base_spawn;48.00;9.50;126.00;0.00;1", "1;naval_base_spawn;176.00;9.50;126.00;0.00;5",
  `${islandState};naval_base_spawn;208.00;9.50;223.00;0.00;5`,
].join("\n");                                   // no trailing newline: the buildings.txt pass trims one, which would be a write of its own

/** A mod shipping the map above. regions: { id: "provinces" }; states: { id: "provinces" }. */
function shape(name, regions, states, islandState) {
  const files = {
    "descriptor.mod": `name="${name}"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
    "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => COL[at(x, y)]),
    "map/definition.csv": DEF,
    "map/buildings.txt": buildings(islandState),
  };
  for (const [id, provs] of Object.entries(regions)) files[`map/strategicregions/${id}-R.txt`] = lib.region(id, provs);
  for (const [id, provs] of Object.entries(states)) files[`history/states/${id}-S.txt`] = lib.st(id, provs);
  return world.mod(name, files);
}

/**
 * The same map in TWO layers: a dependency shipping it whole, and an add-on shipping only its own strategic regions —
 * the ones that cut a province off. So the fragment is the add-on's doing while the state it sits in is not the add-on's
 * to carve (#a-cut-off-piece-gets-a-state-of-its-own), which is the shape where "Auto-fix cannot repair it" is still the
 * honest answer. Returns the add-on's path.
 */
function layered(name, depRegions, addonRegions, states, islandState) {
  shape(`${name} base`, depRegions, states, islandState);
  const files = { "descriptor.mod": `name="${name}"\nsupported_version="1.*"\nreplace_path="map/strategicregions"\ndependencies={\n\t"${name} base"\n}\n` };
  for (const [id, provs] of Object.entries(addonRegions)) files[`map/strategicregions/${id}-R.txt`] = lib.region(id, provs);
  return world.mod(name, files);
}

const only = (v, rule) => ((v && v.problems) || []).filter((p) => p.rule === rule);
const idsOf = (v, rule) => lib.idsOf(v, rule);
const regionOf = async (srv, mod, p) => {
  const m = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
  return m && m.provinceToRegion ? m.provinceToRegion[p] : undefined;
};
const regionWork = (b) => {
  const f = (b && b.fixes) || {};
  return { fractionedMoved: (f.fractionedRegions || {}).moved || 0, statesAligned: (f.regionOverlaps || {}).statesAligned || 0, provincesMoved: (f.regionOverlaps || {}).provincesMoved || 0 };
};
const NO_WORK = JSON.stringify({ fractionedMoved: 0, statesAligned: 0, provincesMoved: 0 });

(async () => {
  let srv = null;
  let islandFixes = null, movableFixes = null;
  try {
    srv = await lib.startServer(createApp);

    console.log("1. ⛔⛔ An island in a state whose other province no neighbouring region can take — and which is not the mod's to carve");
    {
      // Region 1 = { 1 2 3 4 }: sea 1, land 2 and land 4 are one piece, island 3 touches only sea 5 of region 2. State 2 = { 2 3 },
      // and it belongs to the layer BELOW: the add-on ships the regions that cut the island off and nothing else.
      const mod = layered("cutoff island", { 1: "1 2 4", 2: "5 3" }, { 1: "1 2 3 4", 2: "5" }, { 1: "4", 2: "2 3" }, 2);
      const before = await srv.validate(mod);
      rec("CONTROL: validate names island 3 as cut off, and nothing else Save stops for", idsOf(before, "fractioned_naval_region").join(",") === "3"
        && (await lib.saveGate(before)).crashes === 1, { frac: idsOf(before, "fractioned_naval_region"), rules: lib.rulesIn(before) });
      rec("CONTROL: no state is split before the click", only(before, "state_split_strategic_regions").length === 0, only(before, "state_split_strategic_regions"));
      const t0 = lib.tree(mod);
      const c1 = await srv.autoFix(mod);
      islandFixes = (c1.body && c1.body.fixes) || {};
      rec("click 1 is answered", c1.status === 200 && c1.body && c1.body.ok === true, c1.body);
      rec("⭐⭐⭐ click 1 reports no region work: nothing moved out, nothing aligned back", JSON.stringify(regionWork(c1.body)) === NO_WORK, regionWork(c1.body));
      const fr1 = islandFixes.fractionedRegions || {};
      rec("⭐⭐⭐ …and says it cannot repair island 3", Array.isArray(fr1.unrepairable) && fr1.unrepairable.map(Number).join(",") === "3", fr1);
      rec("⭐⭐ the click wrote nothing", lib.written(t0, lib.tree(mod)).length === 0, lib.written(t0, lib.tree(mod)));
      const after = await srv.validate(mod);
      const frac = only(after, "fractioned_naval_region")[0];
      rec("fractioned_naval_region still names island 3 (the map still will not load)", idsOf(after, "fractioned_naval_region").join(",") === "3", idsOf(after, "fractioned_naval_region"));
      rec("⭐⭐ …and its message says Auto-fix cannot repair it, instead of promising the move", !!frac && /Auto-fix cannot/.test(frac.message) && /\b3\b/.test(frac.message.slice(frac.message.indexOf("Auto-fix cannot")))
        && !/Auto-fix moves/.test(frac.message), frac && frac.message);
      rec("no state is split after the click", only(after, "state_split_strategic_regions").length === 0, only(after, "state_split_strategic_regions"));
      const t1 = lib.tree(mod);
      const c2 = await srv.autoFix(mod);
      rec("⭐⭐ click 2 writes nothing and reports no region work either", lib.written(t1, lib.tree(mod)).length === 0
        && JSON.stringify(regionWork(c2.body)) === NO_WORK, { wrote: lib.written(t1, lib.tree(mod)), work: regionWork(c2.body) });
    }

    console.log("\n2. ⭐⭐⭐ The same island, when a neighbouring region can take its whole state");
    {
      // Region 1 = { 1 2 3 }, region 2 = { 5 }, region 3 = { 4 } (land only, which HOI4 never checks). State 2 = { 2 3 }; land 2 touches 4.
      const mod = shape("cutoff movable", { 1: "1 2 3", 2: "5", 3: "4" }, { 1: "4", 2: "2 3" }, 2);
      const before = await srv.validate(mod);
      rec("CONTROL: validate names island 3 as cut off and no split", idsOf(before, "fractioned_naval_region").join(",") === "3" && only(before, "state_split_strategic_regions").length === 0,
        { frac: idsOf(before, "fractioned_naval_region"), rules: lib.rulesIn(before) });
      const c1 = await srv.autoFix(mod);
      movableFixes = (c1.body && c1.body.fixes) || {};
      rec("click 1 is answered", c1.status === 200 && c1.body && c1.body.ok === true, c1.body);
      const after = await srv.validate(mod);
      rec("⭐⭐⭐ after ONE click neither region rule fires", only(after, "fractioned_naval_region").length === 0 && only(after, "state_split_strategic_regions").length === 0,
        { frac: only(after, "fractioned_naval_region"), split: only(after, "state_split_strategic_regions"), fixes: regionWork(c1.body) });
      const r2 = await regionOf(srv, mod, 2), r3 = await regionOf(srv, mod, 3);
      rec("⭐⭐ state 2 is whole in one region, and it is not the region the island was cut off from", r2 === r3 && r2 !== 1 && r2 != null, { 2: r2, 3: r3 });
      const gate = await lib.saveGate(after);
      rec("the Save gate is clear", gate.crashes === 0, gate.status);
      const t1 = lib.tree(mod);
      const c2 = await srv.autoFix(mod);
      rec("⭐⭐⭐ click 2 writes nothing", lib.written(t1, lib.tree(mod)).length === 0 && JSON.stringify(regionWork(c2.body)) === NO_WORK,
        { wrote: lib.written(t1, lib.tree(mod)), work: regionWork(c2.body) });
    }

    console.log("\n3. CONTROL: an island that is a state of its own still moves by itself, as before");
    {
      const mod = shape("cutoff island state", { 1: "1 2 3 4", 2: "5" }, { 1: "4", 2: "2", 3: "3" }, 3);
      const before = await srv.validate(mod);
      rec("validate names island 3 as cut off", idsOf(before, "fractioned_naval_region").join(",") === "3", { frac: idsOf(before, "fractioned_naval_region"), rules: lib.rulesIn(before) });
      const c1 = await srv.autoFix(mod);
      const f = (c1.body && c1.body.fixes && c1.body.fixes.fractionedRegions) || {};
      rec("click 1 moves the island, and only the island", f.moved === 1, f);
      rec("…into the region of the sea it touches", (await regionOf(srv, mod, 3)) === 2, await regionOf(srv, mod, 3));
      rec("land 2 stays where it was", (await regionOf(srv, mod, 2)) === 1, await regionOf(srv, mod, 2));
      const after = await srv.validate(mod);
      rec("neither region rule fires after it", only(after, "fractioned_naval_region").length === 0 && only(after, "state_split_strategic_regions").length === 0, lib.rulesIn(after));
      const t1 = lib.tree(mod);
      await srv.autoFix(mod);
      rec("click 2 writes nothing", lib.written(t1, lib.tree(mod)).length === 0, lib.written(t1, lib.tree(mod)));
    }

    console.log("\n4. ⭐⭐ The Map Errors popup's summary says what Auto-fix left, and why — public/map.js fractionedRepairNote, run on the clicks above");
    {
      const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
      const MASKED = maskJsComments(MAP);
      const s = MASKED.indexOf("\n  function fractionedRepairNote(");
      const e = s < 0 ? -1 : MASKED.indexOf("\n  }", s + 1);
      const fnSrc = s < 0 || e < 0 ? "" : MAP.slice(s + 1, e + 4);
      rec("fractionedRepairNote was lifted", fnSrc.length > 100, fnSrc.length);
      const sb = {};
      vm.createContext(sb);
      if (fnSrc) vm.runInContext(fnSrc, sb);
      const f = sb.fractionedRepairNote;
      if (typeof f === "function") {
        const stuck = f((islandFixes || {}).fractionedRegions);
        rec("⭐⭐ the island click's summary names province 3 as left for the modder, says what to do, and lists no fix", /\b3\b/.test(stuck.tail) && /left for you/.test(stuck.tail)
          && /state of its own/.test(stuck.tail) && stuck.parts.length === 0, stuck);
        const moved = f((movableFixes || {}).fractionedRegions);
        rec("…and the movable click's summary lists the move, with no tail", moved.parts.length === 1 && /between strategic regions/.test(moved.parts[0]) && moved.tail === "", moved);
        const none = f(undefined);
        rec("…and a missing result is handled, not thrown on", none.parts.length === 0 && none.tail === "", none);
      }
      const uses = (MASKED.match(/fractionedRepairNote\(\(fr\.fixes && fr\.fixes\.fractionedRegions\) \|\| \{\}\)/g) || []).length;
      rec("⭐ the Map Errors popup's Auto-fix summary reads it from the click's answer", uses === 1, uses);
    }
  } catch (e) {
    rec("harness", false, String(e && e.stack || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a cut-off province moves with its whole state or Auto-fix says it cannot: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  }
})();
