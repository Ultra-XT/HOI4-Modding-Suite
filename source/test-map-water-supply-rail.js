// Unit test: fixWaterSupplyRail + flipProvinceToSea cleanup. Erasing a province to water must ALSO strip any
// SUPPLY NODE on it and any RAILWAY running through it — otherwise HOI4's supply pathfinder divides by zero
// building the network (EXCEPTION_INT_DIVIDE_BY_ZERO, a real CTD ~5s into loading, nothing in error.log).
// Builds a synthetic mod with supply_nodes.txt + railways.txt, then verifies the auto-fix sweep (all water)
// and the per-province erase path. Run: node test-map-water-supply-rail.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-watersr-"));
  mk(path.join(mod, "descriptor.mod"), 'name="WaterSR"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;true;plains;3;",   // coastal land (has a port)
    "2;0;200;0;land;false;plains;3;",  // inland land
    "3;0;0;200;land;false;plains;3;",  // inland land
    "4;200;200;0;sea;false;ocean;0;",  // sea
    "5;0;200;200;lake;false;lakes;0;", // lake
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "supply_nodes.txt"), "1 2\n1 4\n1 5\n");           // node on land 2 (ok), sea 4 + lake 5 (BAD)
  mk(path.join(mod, "map", "railways.txt"), "1 3 1 2 3 \n1 3 2 4 3 \n1 2 4 5 \n"); // all-land ok / through sea 4 / all-water
  // buildings.txt: floating harbor anchors to LAND; sea/lake-anchored harbors are orphans to drop. Naval bases
  // legitimately sit on a sea province and must be KEPT.
  mk(path.join(mod, "map", "buildings.txt"), [
    "1;floating_harbor;0.0;9.5;0.0;0.0;1", // anchored to coastal land 1 (ok)
    "1;floating_harbor;0.0;9.5;0.0;0.0;4", // anchored to SEA 4 (orphan → drop)
    "1;floating_harbor;0.0;9.5;0.0;0.0;5", // anchored to LAKE 5 (orphan → drop)
    "1;naval_base;0.0;9.5;0.0;0.0;4",      // naval base on SEA 4 (KEEP)
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "S1"\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = { owner = AAA }\n}\n');
  return mod;
}
const lines = (mod, f) => fs.readFileSync(path.join(mod, "map", f), "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

(() => {
  console.log("=== fixWaterSupplyRail + flipProvinceToSea rail/supply cleanup ===");

  // (A) Auto-fix sweep (no waterIds): scans every water province (sea 4, lake 5).
  let mod = buildMod();
  try {
    const r = md.fixWaterSupplyRail({ modRoot: mod });
    ok("sweep reports changed", r.changed === true, r);
    ok("removed the 2 supply nodes on water (sea 4 + lake 5)", r.supplyRemoved === 2, r);
    // #the-water-cleanup-keeps-legal-lakes-and-splits-railways — these two pins encoded the WELD. `2 4 3` minus 4
    // used to become `2 3`; it is now split, leaving two one-province runs, so that railway is removed.
    ok("no railway is 'fixed' by joining across the water — the split leaves no 2-province run here", r.railFixed === 0, r);
    ok("removed the through-sea railway (split into single provinces) and the all-water one", r.railRemoved === 2, r);
    const sn = lines(mod, "supply_nodes.txt");
    ok("supply_nodes: only the land node (prov 2) remains", sn.length === 1 && sn[0] === "1 2", sn);
    const rw = lines(mod, "railways.txt");
    ok("railways: the all-land railway is untouched", rw.some((l) => /^1 3 1 2 3$/.test(l)), rw);
    ok("railways: the through-sea railway is split at the gap, NOT welded into '1 2 2 3'", !rw.some((l) => /^1 2 2 3$/.test(l)), rw);
    ok("railways: the all-water railway is gone", !rw.some((l) => /\b4 5\b/.test(l)), rw);
    ok("removed the 2 floating harbors on water (sea 4 + lake 5)", r.harborRemoved === 2, r);
    const bl = lines(mod, "buildings.txt");
    ok("buildings: the land-anchored floating harbor (prov 1) is kept", bl.some((l) => /^1;floating_harbor;.*;1$/.test(l)), bl);
    ok("buildings: the naval base on sea (prov 4) is kept", bl.some((l) => /^1;naval_base;.*;4$/.test(l)), bl);
    ok("buildings: no floating harbor anchored to sea/lake remains", !bl.some((l) => /^1;floating_harbor;.*;[45]$/.test(l)), bl);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }

  // (B) Erase integration: a coastal province with a supply node + railway → flipProvinceToSea strips them.
  mod = buildMod();
  try {
    fs.writeFileSync(path.join(mod, "map", "supply_nodes.txt"), "1 1\n1 2\n"); // node on coastal prov 1 + land 2
    fs.writeFileSync(path.join(mod, "map", "railways.txt"), "1 2 1 2 \n");     // railway 1↔2
    const er = md.flipProvinceToSea({ modRoot: mod, provinceId: 1 });          // coastal → sea
    ok("erasing a coastal province reports the rail/supply cleanup", er.supplyRail && er.supplyRail.supplyRemoved === 1, er.supplyRail);
    const sn = lines(mod, "supply_nodes.txt");
    ok("the supply node on the erased province is gone (land node kept)", !sn.some((l) => /^1 1$/.test(l)) && sn.includes("1 2"), sn);
    const rw = lines(mod, "railways.txt");
    ok("the railway through the erased province is removed (dropped < 2)", rw.length === 0, rw);
    ok("erasing also reports the orphaned floating harbor removed", er.supplyRail && er.supplyRail.harborRemoved === 1, er.supplyRail);
    const bl = lines(mod, "buildings.txt");
    ok("the floating harbor on the now-sea province is gone", !bl.some((l) => /^1;floating_harbor;.*;1$/.test(l)), bl);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }

  console.log(`\ntest-map-water-supply-rail: ${pass} checks passed`);
})();
