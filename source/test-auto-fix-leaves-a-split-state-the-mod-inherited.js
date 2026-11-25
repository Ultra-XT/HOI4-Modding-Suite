// Auto-fix aligns only the strategic-region splits the validator reports: a state the mod neither ships nor spans a
// region of is left as the layer below made it. #auto-fix-leaves-a-split-state-the-mod-inherited
//
// THE DEFECT. state_split_strategic_regions reports a state spread over two regions only when the mod ships the state
// or one of the regions it spans (batch 4, 84cbe32). repairRegionOverlaps — the last region fixer on every Auto-fix
// click — still aligned EVERY split state, and removed every province listed in two regions, whoever shipped them.
//
// MEASURED on the base commit 113d5b5, on a two-layer fixture where the layer below ships state 3 = { 7 8 9 } with 9 in
// a region of its own and the add-on ships only a state with no manpower: the validator reported no split, and
// repairRegionOverlaps (directly, and inside one autoFixMap click) copied BOTH base region files into the add-on and
// moved province 9 — leaving the add-on's copy of region 3 with no provinces at all. The six shipping maps have 0 split
// states, which is why nothing had shown it; a dependency that ships one is enough.
//
// THE FIX. One helper, stateSplitIsTheModsOwn, answers the rule and the fixer alike. The fixer still plans every state
// (so a province two states pull different ways is still left alone), and then writes only for: a split the rule
// reports; a province in two regions where one of them is the mod's (province_in_two_regions' own gate); and a province
// in no region, for a state the mod ships (unchanged). A split the mod's own edit makes in an inherited state is still
// repaired in one click, because the edit makes the state the mod's (section 4).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhsplit-home-"));
process.env.NOVA_HOME_DIR = HOME;
const M = require("./map-data.js");
const tmps = [HOME];

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// 16 vertical strips of 16 px: provinces 1..12 land, 13..16 sea — no four-way corners to repair.
// States 1={1 2 3} 2={4 5 6} 3={7 8 9} 4={10 11 12}.
const COLOF = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const weather = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 30.11 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";
const region = (id, provs) => `strategic_region={\n\tid=${id}\n\tname="R${id}"\n\tprovinces={ ${provs} }\n${weather}}\n`;
const st = (id, provs, owner, manpower = 1000 * id) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
const STATES = { "history/states/1-A.txt": st(1, "1 2 3", "AAA"), "history/states/2-B.txt": st(2, "4 5 6", "BBB"),
  "history/states/3-C.txt": st(3, "7 8 9", "AAA"), "history/states/4-D.txt": st(4, "10 11 12", "BBB") };

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inhsplit-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
function world(tag, regions) {
  const defRows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, g, b] = COLOF(p); const sea = p >= 13; defRows.push(`${p};${r};${g};${b};${sea ? "sea" : "land"};${!sea && (p === 1 || p === 12) ? "true" : "false"};${sea ? "ocean" : "plains"};${sea ? 0 : 1}`); }
  const bRow = (s, t, x) => `${s};${t};${x.toFixed(2)};9.50;128.00;0.00;0`;
  const buildings = [];
  for (const [s, x] of [[1, 24], [2, 72], [3, 120], [4, 168]]) buildings.push(bRow(s, "air_base", x), bRow(s, "rocket_site_spawn", x + 2));
  return dir(tag, {
    "map/provinces.bmp": bmp24(256, 256, (x) => COLOF(Math.floor(x / 16) + 1)),
    "map/definition.csv": defRows.join("\n") + "\n",
    ...STATES,
    "history/countries/AAA.txt": "capital = 1\n",
    "history/countries/BBB.txt": "capital = 2\n",
    ...Object.fromEntries(Object.entries(regions).map(([file, [id, provs]]) => [`map/strategicregions/${file}`, region(id, provs)])),
    "map/buildings.txt": buildings.join("\n") + "\n",
    "map/adjacencies.csv": "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n",
  });
}
const validate = (opts) => M.validateMapModel(M.buildMapModel({ ...opts, cacheStableLayers: false }));
const splits = (opts) => validate(opts).filter((p) => p.rule === "state_split_strategic_regions").map((p) => p.stateId);
const doubles = (opts) => validate(opts).filter((p) => p.rule === "province_in_two_regions").flatMap((p) => p.provinces || []);
const regionFiles = (d) => { try { return fs.readdirSync(path.join(d, "map", "strategicregions")).sort(); } catch (_) { return []; } };
const regionText = (d, f) => fs.readFileSync(path.join(d, "map", "strategicregions", f), "utf8");
const listed = (txt) => ((/provinces\s*=\s*\{([^}]*)\}/.exec(txt) || [])[1] || "").trim().split(/\s+/).filter(Boolean).map(Number);
// An add-on with a problem of its own, so an Auto-fix click on it really runs every fixer.
const addon = (tag, extra = {}) => dir(tag, { "descriptor.mod": `name="${tag}"\n`, "history/states/1-A.txt": st(1, "1 2 3", "AAA", 0), ...extra });

const SPLIT = { "1-Land.txt": [1, "1 2 3 4 5 6 7 8 10 11 12"], "2-Sea.txt": [2, "13 14 15 16"], "3-Nine.txt": [3, "9"] };

try {
  const GAME = world("game", SPLIT);
  console.log("\n=== THE CONTROL: the layer below ships a split state, and reports it for itself ===");
  rec("state 3 is split across regions 1 and 3 in the base", splits({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] }).join() === "3",
    splits({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] }));

  console.log("\n=== 1. an add-on that neither ships state 3 nor a region it spans: nothing is copied in ===");
  {
    const a = addon("addon");
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [] };
    rec("the validator reports no split to the add-on", splits(opts).length === 0, splits(opts));
    const r = M.repairRegionOverlaps(opts);
    rec("⭐⭐⭐ repairRegionOverlaps aligns nothing", !!r && r.ok === true && r.statesAligned === 0 && r.provincesMoved === 0, r);
    rec("⭐⭐⭐ …and copies no strategic-region file into the add-on", regionFiles(a).length === 0, regionFiles(a));
    const c = addon("addon-click");
    const copts = { modRoot: c, gameRoot: GAME, dependencyRoots: [] };
    const r1 = M.autoFixMap(copts);
    rec("a whole Auto-fix click ran every fixer", !!r1 && r1.ok === true && !r1.nothingToFix && ((r1.fixes || {}).noManpower || {}).fixed >= 1, r1 && (r1.error || (r1.fixes || {}).noManpower));
    rec("⭐⭐⭐ the click copies no strategic-region file into the add-on", regionFiles(c).length === 0 && ((r1.fixes || {}).regionOverlaps || {}).statesAligned === 0,
      { files: regionFiles(c), regionOverlaps: (r1.fixes || {}).regionOverlaps });
    M.autoFixMap(copts);
    rec("⭐ …nor does a second one", regionFiles(c).length === 0, regionFiles(c));
  }

  console.log("\n=== 2. THE CONTROL: an add-on that ships state 3 has its split repaired ===");
  {
    const a = addon("addon-state", { "history/states/3-C.txt": STATES["history/states/3-C.txt"] });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [] };
    rec("the validator reports the add-on's split", splits(opts).join() === "3", splits(opts));
    const r = M.repairRegionOverlaps(opts);
    rec("⭐⭐ repairRegionOverlaps aligns state 3", !!r && r.statesAligned === 1 && (r.alignedDetail || []).some((d) => d.state === 3), r);
    rec("…and the split is gone", splits(opts).length === 0, splits(opts));
  }

  console.log("\n=== 3. THE CONTROL: an add-on that ships a region the inherited state spans has the split repaired ===");
  {
    const a = addon("addon-region", { "map/strategicregions/3-Nine.txt": region(3, "9") });
    const opts = { modRoot: a, gameRoot: GAME, dependencyRoots: [] };
    rec("the validator reports the split to the add-on", splits(opts).join() === "3", splits(opts));
    const r = M.repairRegionOverlaps(opts);
    rec("⭐⭐ repairRegionOverlaps aligns state 3", !!r && r.statesAligned === 1, r);
    rec("…and the split is gone", splits(opts).length === 0, splits(opts));
  }

  console.log("\n=== 4. THE CONTROL: a split the add-on's own edit makes in an inherited state is repaired in one click ===");
  {
    const G2 = world("game-whole", { "1-Land.txt": [1, "1 2 3 4 5 6 7 8 9"], "2-Sea.txt": [2, "13 14 15 16"], "3-East.txt": [3, "10 11 12"] });
    rec("THE CONTROL: this base has no split", splits({ modRoot: G2, gameRoot: G2, dependencyRoots: [] }).length === 0);
    const a = addon("addon-move");
    const opts = { modRoot: a, gameRoot: G2, dependencyRoots: [] };
    const mv = M.moveProvince({ ...opts, provinceId: 9, toStateId: 4 });
    rec("the add-on moves province 9 into inherited state 4, which sits in another region", !!mv && mv.changed === true, mv && mv.error);
    rec("…which the validator reports as the add-on's split", splits(opts).join() === "4", splits(opts));
    const r = M.autoFixMap(opts);
    rec("Auto-fix ran", !!r && r.ok === true, r && r.error);
    rec("⭐⭐⭐ ONE click: the split is gone", splits(opts).length === 0, { splits: splits(opts), regionOverlaps: (r.fixes || {}).regionOverlaps });
  }

  console.log("\n=== 5. a province the layer below lists in two regions is left alone; one the add-on lists twice is not ===");
  {
    // 0-Dup.txt is read before 1-Land.txt, so province 5's effective region is 1 — state 2 is whole, 5 is listed twice.
    const G3 = world("game-dup", { "0-Dup.txt": [3, "5"], "1-Land.txt": [1, "1 2 3 4 5 6 7 8 9 10 11 12"], "2-Sea.txt": [2, "13 14 15 16"] });
    const base = { modRoot: G3, gameRoot: G3, dependencyRoots: [] };
    rec("THE CONTROL: the base lists province 5 twice, and splits no state", doubles(base).includes(5) && splits(base).length === 0, { doubles: doubles(base), splits: splits(base) });
    const a = addon("addon-dup");
    const opts = { modRoot: a, gameRoot: G3, dependencyRoots: [] };
    rec("the validator reports neither to the add-on", doubles(opts).length === 0 && splits(opts).length === 0, { doubles: doubles(opts), splits: splits(opts) });
    const r = M.repairRegionOverlaps(opts);
    rec("⭐⭐⭐ repairRegionOverlaps removes no inherited listing", !!r && r.doubleMembershipFixed === 0, r);
    rec("⭐⭐⭐ …and copies no strategic-region file into the add-on", regionFiles(a).length === 0, regionFiles(a));

    const own = addon("addon-dup-own", { "map/strategicregions/0-Dup.txt": region(3, "5") });
    const oopts = { modRoot: own, gameRoot: G3, dependencyRoots: [] };
    rec("THE CONTROL: an add-on shipping the region that lists 5 again is told", doubles(oopts).includes(5), doubles(oopts));
    const r2 = M.repairRegionOverlaps(oopts);
    rec("⭐⭐ …and repairRegionOverlaps takes 5 out of it", !!r2 && r2.doubleMembershipFixed === 1 && !listed(regionText(own, "0-Dup.txt")).includes(5), { r2, text: regionText(own, "0-Dup.txt") });
    rec("⭐ …without copying in the base region that keeps it", !regionFiles(own).includes("1-Land.txt"), regionFiles(own));
    rec("…and the validator has nothing left to report", doubles(oopts).length === 0, doubles(oopts));
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== auto-fix leaves a split state the mod inherited: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
