// Repairing an X-crossing keeps each province within an eighth of the map when a repaint can: the one pixel goes to the neighbour
// whose box stays inside the limit province_too_large judges, and Auto-fix adds no "too large" province of its own.
// #an-x-crossing-repaint-keeps-a-province-within-an-eighth
//
// THE DEFECT (batch 8 autofix, A-audit-xcrossing-threshold). fixMapXCrossings breaks a four-province corner by recolouring the
// block's bottom-right pixel with the bottom-left's colour, always. province_too_large reports a province whose box is wider than
// bmpW/8 or taller than bmpH/8 (w = x1 - x0 + 1, the wrap seam excused). So a bottom-left province already exactly an eighth of
// the map wide grows one pixel past it. MEASURED by batch 8's per-fixer audit on test-auto-fix-leaves-a-building-on-a-lake-its-
// state-lists.js: province_too_large went 0 -> 49 right after fixMapXCrossings repaired 56 corners of an 8x8 grid of 64 px cells
// on a 512 px map. (There every neighbour is exactly 64 px, so no repaint avoids it; no shipping map has an X-crossing to repair.)
//
// THE DECISION. The pixel keeps its place (the bottom-right of the block); its colour is the bottom-left's, as before, unless that
// takes the bottom-left province past the limit and the top-right's would not — the other colour that joins the pixel to its
// province by a pixel edge. When neither fits, the old choice stands.
//
// Requests are the page's: POST /api/map/auto-fix { modPath } and GET /api/map/validate?modPath.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b9-xcross-box");
const { createApp } = require("./server.js");

// Every province is land in one state and one region, so nothing but the corner is for Auto-fix to repair.
// Rows 96..131 hold the small ones: A (x 0..31, y 96..99), U (x 32..63, y 96..99), L (x 0..31, y 100..131), R (x 32..63,
// y 100..131), Z (x 64..95), Q (x 96..end). Above them S, below them P. A, U, L and R meet at one pixel corner: the block
// (31,99)-(32,100) is the map's only X-crossing, and on the seam A and L meet Q, which is one province.
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200], 4: [200, 200, 0], 5: [0, 200, 200], 6: [200, 0, 200], 7: [120, 120, 0], 8: [0, 120, 120] };
const NAME = { S: 1, A: 2, U: 3, L: 4, R: 5, Z: 6, Q: 7, P: 8 };
const at = (x, y) => (y < 96 ? 1 : y < 132 ? (x < 32 ? (y < 100 ? 2 : 4) : x < 64 ? (y < 100 ? 3 : 5) : x < 96 ? 6 : 7) : 8);
const DEF = ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(COL).map((id) => `${id};${COL[id].join(";")};land;false;plains;1`)).join("\r\n") + "\r\n";

function shape(name, W) {
  return world.mod(name, {
    "descriptor.mod": `name="${name}"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
    "map/provinces.bmp": lib.bmp24(W, 256, (x, y) => COL[at(x, y)]),
    "map/definition.csv": DEF,
    // x is the pixel column, z the row counted from the bottom: (150, 200) is province P.
    "map/buildings.txt": ["1;air_base;150.00;9.50;56.00;0.00;0", "1;rocket_site_spawn;150.00;9.50;56.00;0.00;0"].join("\n"),
    "map/strategicregions/1-R.txt": lib.region(1, "1 2 3 4 5 6 7 8"),
    "history/states/1-S.txt": lib.st(1, "1 2 3 4 5 6 7 8"),
  });
}
const pixel = (mod, x, y) => {
  const b = fs.readFileSync(path.join(mod, "map", "provinces.bmp"));
  const off = b.readUInt32LE(10), W = b.readInt32LE(18), H = b.readInt32LE(22), rs = Math.floor((24 * W + 31) / 32) * 4;
  const o = off + (H - 1 - y) * rs + x * 3;
  const rgb = [b[o + 2], b[o + 1], b[o]];
  return +(Object.keys(COL).find((id) => COL[id].join() === rgb.join()) || 0);
};
const large = (v) => lib.idsOf(v, "province_too_large");

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);

    for (const [title, W, wantCorner, why] of [
      ["1. ⛔⛔ A 256 px map: L is exactly an eighth wide (32 px), U has room below it", 256, NAME.U, "the bottom-left colour would take L to 33 px, over 256/8"],
      ["2. CONTROL: a 512 px map, where both neighbours have room — the old choice, the bottom-left colour", 512, NAME.L, "L's 33 px is inside 512/8"],
    ]) {
      console.log("\n" + title);
      const mod = shape(title.slice(0, 2).trim(), W);
      const before = await srv.validate(mod);
      rec("CONTROL: validate names the X-crossing", lib.rulesIn(before).includes("map_x_crossing"), lib.rulesIn(before));
      rec("CONTROL: …and neither L nor U is too large before the click", !large(before).includes(NAME.L) && !large(before).includes(NAME.U), large(before));
      const c1 = await srv.autoFix(mod);
      const xc = (c1.body && c1.body.fixes && c1.body.fixes.xCrossings) || {};
      rec("click 1 repairs the one corner", c1.status === 200 && xc.fixed === 1, xc);
      const after = await srv.validate(mod);
      rec("the X-crossing is gone", !lib.rulesIn(after).includes("map_x_crossing"), lib.rulesIn(after));
      const added = large(after).filter((p) => !large(before).includes(p));
      rec(`⭐⭐⭐ Auto-fix named no province too large that was not before (${why})`, added.length === 0, { added, before: large(before), after: large(after) });
      rec(`⭐⭐ the corner pixel (32,100) went to province ${wantCorner === NAME.U ? "U, above it" : "L, left of it"}`, pixel(mod, 32, 100) === wantCorner, pixel(mod, 32, 100));
      const t1 = lib.tree(mod);
      await srv.autoFix(mod);
      rec("click 2 writes nothing", lib.written(t1, lib.tree(mod)).length === 0, lib.written(t1, lib.tree(mod)));
    }
  } catch (e) {
    rec("harness", false, String(e && e.stack || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== repairing an X-crossing keeps each province within an eighth of the map: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  }
})();
