// An add-on's map file is judged against the copy it stands in front of — its dependency's, not the base game's: an add-on that puts the
// base game's provinces.bmp or definition.csv back under a dependency that changed them is told what that does to the dependency's map,
// and a verbatim copy of the dependency's file is still nobody's change. #a-map-file-is-judged-against-the-layer-it-stands-in-front-of
//
// THE DEFECT. modChangedMapFile — "did the mod change this map file?", the gate in front of fractioned_naval_region (FATAL: HOI4 refuses to
// load the map), the unit check, the unitstacks rule and naval_base_sea_zone_invalid — compared the mod's copy with the BASE GAME's. On an
// add-on that is the wrong layer. A copy of the game's file over a dependency that ships its own is "not changed", so the gate stays shut
// on a change HOI4 very much sees.
//
// MEASURED on 65978a2 (batch 8, scratchpad batch8/layers probe-a5.js, in-process): a dependency moves sea 8 beside 5 in its provinces.bmp and
// joins them in one region; an add-on shipping the base game's provinces.bmp verbatim cuts that region in two — fixFractionedRegions' dry run
// finds [8] — and validateMapBitmap reported nothing. The same add-on with any other map file of its own (an adjacencies.csv) was told [8].
// Re-measured on 790cb21 with the fixtures below (see the commit).
//
// Fixtures below are the two-layer world of testlib-two-layer-map.js, through GET /api/map/validate and the real Save gate, in both
// directions: a fatal the add-on makes stops its Save, and a verbatim copy of what it stands on does not.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 360)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("infront");
const { createApp } = require("./server.js");

const FRAC = "fractioned_naval_region", STACKS = "unitstacks_disagrees_with_province_type";
const GAME_BMP = fs.readFileSync(path.join(W.GAME, "map", "provinces.bmp"));
// The dependency reaches inland 4 up to the sea (a strip of 4 where 3's right edge was) and puts it in the sea region: whole, in its map.
const DEP_BMP = lib.bmp24(256, 256, (x, y) => lib.COL[x >= 240 && y >= 64 && y < 160 ? 4 : lib.provAt(x, y)]);
const DEP_REGIONS = { "map/strategicregions/1-Sea.txt": lib.region(1, "1 4"), "map/strategicregions/2-Land.txt": lib.region(2, "2 3 5") };
W.mod("Reach dependency", { "map/provinces.bmp": DEP_BMP, ...DEP_REGIONS });

// Unit positions: the game's, and a dependency that turns land 5 into sea with a full sea set of slots for it — consistent.
const row = (p, t) => `${p};${t};100.00;9.50;100.00;0.00;0.24`;
const FLOOR = [0, 1, 2, 9, 10, 11, 12, 21, 22, 23, 30, 31, 38];
lib.write(W.GAME, { "map/unitstacks.txt": FLOOR.map((t) => row(1, t)).concat([2, 3, 4, 5].flatMap((p) => [row(p, 1), row(p, 2)])).join("\n") + "\n" });
const SEA5_DEF = lib.DEF({ 5: "5;0;200;200;sea;false;ocean;0" });
W.mod("Sea five dependency", {
  "map/definition.csv": SEA5_DEF,
  "map/unitstacks.txt": FLOOR.map((t) => row(1, t)).concat([2, 3, 4].flatMap((p) => [row(p, 1), row(p, 2)]), FLOOR.map((t) => row(5, t))).join("\n") + "\n",
});

let S = null;
(async () => {
  try {
    S = await lib.startServer(createApp);

    console.log("\n=== THE CONTROLS ===");
    {
      const v = await S.validate(W.mod("Reach plain", {}, ["Reach dependency"]));
      rec("the region dependency is whole: a plain add-on over it is told no fractioned region", lib.idsOf(v, FRAC).length === 0, lib.idsOf(v, FRAC));
      const c = await S.validate(W.mod("Reach copy", { "map/provinces.bmp": DEP_BMP }, ["Reach dependency"]));
      rec("an add-on holding the dependency's provinces.bmp verbatim is told none either", lib.idsOf(c, FRAC).length === 0, lib.idsOf(c, FRAC));
      const cg = await lib.saveGate(c);
      rec("…and its Save is not stopped", cg.crashes === 0 && !cg.armed, cg.status);
      const s = await S.validate(W.mod("Sea five plain", {}, ["Sea five dependency"]));
      rec("the unit-position dependency is consistent: a plain add-on over it is told nothing of unit positions", lib.idsOf(s, STACKS).length === 0 && !s.problems.some((p) => p.rule === STACKS), lib.rulesIn(s));
      const sc = await S.validate(W.mod("Sea five copy", { "map/definition.csv": SEA5_DEF }, ["Sea five dependency"]));
      rec("…nor is an add-on holding its definition.csv verbatim", !sc.problems.some((p) => p.rule === STACKS), lib.rulesIn(sc));
      // A mod with no dependency is judged against the game, as before: the game's own bitmap copied in is no change.
      const g = await S.validate(W.mod("Game copy", { "map/provinces.bmp": GAME_BMP }));
      rec("a plain mod holding the game's provinces.bmp verbatim is told no fractioned region", lib.idsOf(g, FRAC).length === 0, lib.idsOf(g, FRAC));
    }

    console.log("\n=== 1. an add-on puts the base game's provinces.bmp back under the region dependency ===");
    {
      const a = W.mod("Reach revert", { "map/provinces.bmp": GAME_BMP }, ["Reach dependency"]);
      const v = await S.validate(a);
      rec("⭐⭐⭐ the add-on is told the sea region its bitmap cut in two (province 4)", lib.idsOf(v, FRAC).join() === "4", lib.idsOf(v, FRAC));
      const g = await lib.saveGate(v);
      rec("⭐⭐⭐ …and its Save is stopped for it", g.crashes >= 1 && g.armed, g.status);
    }

    console.log("\n=== 2. an add-on puts the base game's definition.csv back under the unit-position dependency ===");
    {
      const a = W.mod("Sea five revert", { "map/definition.csv": lib.DEF() }, ["Sea five dependency"]);
      const v = await S.validate(a);
      const p = v.problems.find((x) => x.rule === STACKS);
      rec("⭐⭐⭐ the add-on is told the dependency's sea slots now stand on its land province 5", !!p && (p.provinces || []).join() === "5", p ? p.provinces : lib.rulesIn(v));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== an add-on's map file is judged against the layer it stands in front of: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
