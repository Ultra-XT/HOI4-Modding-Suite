// A paint-shape stroke says how many map/buildings.txt positions it left standing on water.
// #a-paint-says-which-buildings-it-put-in-the-water
//
// THE DEFECT, found by driving the owner's flow by hand (assignment D, 2026-09-23). /api/map/paint-provinces
// already names every other consequence of a stroke on its own answer — a province it covered completely and
// reseeded, one left under the game's minimum pixel count, one split into far-apart blobs, and each of the five
// bitmaps the mod has just taken a copy of. The damage to map/buildings.txt was the one it never named, and it
// is the one the modder cannot undo.
//
// 📊 MEASURED through the real endpoint with the body public/map.js sends (scratchpad D1/flow3.js and
// D1/addon-l2s.js), ONE ordinary coastline drag — six stamps of the radius-12 brush, 2,276 painted pixels:
//
//     Road to 56, which owns its own buildings.txt    building_not_over_land   0 → 35 rows
//     a bare add-on over the installed base game      building_not_over_land   0 → 35 rows
//
// Both runs answered `applied`, one warning about a covered province, and the heightmap / terrain / trees /
// world_normal notes. Neither mentioned the 35. HOI4's own line for each is ": map building location is not
// over the land - ignoring instance.", and on Road to 56 Auto-fix could put 19 of the 35 back — the other 16
// are gone unless the modder moves them by hand with the game's building-position editor.
//
// WHAT IS ASSERTED, and why each control is here:
//   1. the stroke's own answer names the rows it drowned, and the number is EXACTLY the number the validator's
//      building_not_over_land gains — one implementation, so the click and the save gate cannot disagree.
//   2. ⭐ THE CRY-WOLF CONTROL: a land-to-land reshape, the common case, says nothing. A sentence that appears
//      on an ordinary reshape would be worse than the silence it replaces.
//   3. a row that was ALREADY over water before the stroke is not blamed on the stroke: the click reports the
//      DELTA while the validator reports the TOTAL, and the test measures both.
//   4. a floating harbour — anchor-keyed, and at sea by design — is not counted, judged by the same
//      anchorKeyedBuildingTypes census buildingsTxtPlacementScan uses.
//
// Everything is derived: no count is typed into this file. The expected number on each run is the validator's
// own before/after difference, so the test moves with the rule instead of pinning a fixture's arithmetic.
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!ok) fails.push(label);
};

const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("paintdrown");   // before server.js: it reads HOI4_MODS_ROOT when it loads
const mapData = require("./map-data.js");
const { createApp } = require("./server.js");

// The fixture's own geometry, read out of the testlib rather than restated: sea 1 lies across the top
// (y < 64) and land 2 is under it on the left. The row `2;naval_base_spawn;64.00;9.50;191.00;0.00;1` sits at
// pixel (64, buildingZToPixelY(256,191)) = (64,64) — the first land row under the coast, which is exactly
// where a modder carving a bay puts the brush.
const W = 256, H = 256;
const COAST = { x: 64, y: mapData.buildingZToPixelY(H, 191) };
const COL = { sea1: [0, 0, 200], land2: [200, 0, 0], land5: [0, 200, 200] };
/** One brush disc, as public/map.js's stampBrushAt builds it: every pixel in the disc, including no-ops. */
const disc = (cx, cy, R, rgb) => {
  const out = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    if (dx * dx + dy * dy > R * R) continue;
    const x = cx + dx, y = cy + dy;
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    out.push({ x, y, r: rgb[0], g: rgb[1], b: rgb[2] });
  }
  return out;
};
/** building_not_over_land's population, summed the way CLAUDE.md asks: the rows carry `total`/`items`. */
const overWaterTotal = (v) => {
  let n = 0;
  for (const p of ((v && v.problems) || [])) {
    if (p.rule !== "building_not_over_land") continue;
    n += Array.isArray(p.items) ? p.items.length : (typeof p.total === "number" ? p.total : 1);
  }
  return n;
};
const buildingsNote = (res) => ((res && res.warnings) || []).find((s) => /building position/.test(String(s)) && /buildings\.txt/.test(String(s))) || "";
const noteCount = (s) => { const m = /left (\d+) building position/.exec(String(s)); return m ? parseInt(m[1], 10) : -1; };

(async () => {
  const S = await L2.startServer(createApp);
  try {
    console.log("\n1. A coastal cut says how many building positions it left on water — and the number is the validator's");
    {
      // An add-on that owns nothing: buildings.txt, definition.csv and provinces.bmp all resolve to the game.
      const MOD = world.mod("Paint Drown Probe", {});
      const before = overWaterTotal(await S.validate(MOD));
      rec("THE CONTROL: nothing in this map is over water before the stroke", before === 0, { before });
      const r = await S.post("/api/map/paint-provinces", { diff: disc(COAST.x, COAST.y, 5, COL.sea1) }, MOD);
      rec("the paint was applied", r.status === 200 && r.body && r.body.ok === true, r.body && r.body.error);
      const after = overWaterTotal(await S.validate(MOD));
      const gained = after - before;
      rec("THE CONTROL: the stroke really did put building positions on water", gained > 0, { before, after });
      const note = buildingsNote(r.body);
      rec("⭐⭐ the stroke's own answer names them", !!note, { warnings: (r.body && r.body.warnings) || [] });
      rec("⭐⭐ …and says exactly what the validator counts, so the click and the save gate cannot disagree",
        noteCount(note) === gained, { said: noteCount(note), validatorGained: gained, note });
      rec("…and quotes the game's own line for it", /not over the land - ignoring instance/.test(note), note);
    }

    console.log("\n2. ⭐ THE CRY-WOLF CONTROL — a land-to-land reshape, the common case, says nothing");
    {
      const MOD = world.mod("Paint Reshape Probe", {});
      const before = overWaterTotal(await S.validate(MOD));
      // Land 5's colour over the same coastal disc: half the disc is land 2 and half is sea 1, so pixels move
      // in BOTH directions across the waterline — and not one of them stops being land.
      const r = await S.post("/api/map/paint-provinces", { diff: disc(COAST.x, COAST.y, 5, COL.land5) }, MOD);
      rec("the paint was applied", r.status === 200 && r.body && r.body.ok === true, r.body && r.body.error);
      const after = overWaterTotal(await S.validate(MOD));
      rec("THE CONTROL: the validator finds nothing over water either", after === before, { before, after });
      rec("⭐⭐ the reshape says nothing about buildings", buildingsNote(r.body) === "", (r.body && r.body.warnings) || []);
    }

    console.log("\n3. A row that was already over water is not blamed on the stroke — the click reports the DELTA");
    {
      // One extra row, placed on a pixel inside sea 1 that the stroke never touches.
      const strandedZ = mapData.pixelYToBuildingZ(H, 35);   // pixel (64,35) is sea 1 in this fixture
      const MOD = world.mod("Paint Delta Probe", {
        "map/buildings.txt": fs.readFileSync(path.join(world.GAME, "map", "buildings.txt"), "utf8")
          + `\n2;arms_factory;64.00;9.50;${strandedZ}.00;0.00;0\n`,
      });
      const before = overWaterTotal(await S.validate(MOD));
      rec("THE CONTROL: this mod starts with a building already on water", before > 0, { before });
      const r = await S.post("/api/map/paint-provinces", { diff: disc(COAST.x, COAST.y, 5, COL.sea1) }, MOD);
      const after = overWaterTotal(await S.validate(MOD));
      const note = buildingsNote(r.body);
      rec("⭐⭐ the stroke claims only what IT drowned, not the map's total",
        noteCount(note) === after - before && noteCount(note) > 0, { said: noteCount(note), before, after, note });
      // ⚠️ `note` must be non-empty here, or this passes on the very silence the test exists to forbid: with
      // the sentence backed out, noteCount is -1 and `after > -1` is true. The back-out control caught it.
      rec("…and the pre-existing row is still reported by the validator", !!note && after > noteCount(note), { after, said: noteCount(note), note });
    }

    console.log("\n4. A floating harbour is at sea by design and is not counted");
    {
      const MOD = world.mod("Paint Harbour Probe", {
        // Anchored to province 2, which is LAND — the shape that makes a type anchor-keyed — and sitting on
        // the very pixel the stroke is about to drown, so only the skip can keep it out of the count.
        "map/buildings.txt": fs.readFileSync(path.join(world.GAME, "map", "buildings.txt"), "utf8")
          + "\n2;floating_harbor;64.00;9.50;191.00;0.00;2\n",
      });
      const anchorKeyed = mapData.anchorKeyedBuildingTypes({
        modRoot: MOD, gameRoot: world.GAME, dependencyRoots: [],
        text: fs.readFileSync(path.join(MOD, "map", "buildings.txt"), "utf8"),
      });
      rec("THE CONTROL: the census does classify floating_harbor as anchor-keyed, so the skip is armed",
        !!anchorKeyed && anchorKeyed.has("floating_harbor"), anchorKeyed ? [...anchorKeyed] : null);
      const before = overWaterTotal(await S.validate(MOD));
      const r = await S.post("/api/map/paint-provinces", { diff: disc(COAST.x, COAST.y, 5, COL.sea1) }, MOD);
      const after = overWaterTotal(await S.validate(MOD));
      const note = buildingsNote(r.body);
      rec("⭐⭐ the harbour on the drowned pixel is not counted — the click still matches the validator",
        noteCount(note) === after - before && noteCount(note) > 0, { said: noteCount(note), before, after, note });
      // Same trap as above: an absent sentence names no harbour either. It has to say something first.
      rec("…and the harbour is not the row it names", !!note && !/floating_harbor/.test(note), note);
    }
  } finally {
    S.close();
    world.cleanup();
  }

  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
})().catch((e) => { console.log("FATAL " + (e && e.stack || e)); process.exit(1); });
