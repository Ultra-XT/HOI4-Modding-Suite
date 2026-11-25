// "Delete map → blank ocean canvas" must strip the supply hubs and railways it just put underwater.
// #erase-leaves-the-land-standing  (the DELETE-MAP half — the one-province erase was fixed long ago)
//
// A supply node or a railway on a WATER province makes HOI4's supply pathfinder divide by zero: a CTD about
// five seconds into loading, which is why flipProvinceToSea has called fixWaterSupplyRail since that bug was
// found. blankMapToSea turns EVERY land province to sea — 10,155 of them on vanilla — and never called it.
//
// The scale, counted from the shipped files (asserted below so the claim cannot rot):
//   map/supply_nodes.txt  727 rows      map/railways.txt  909 rows
// All of them left standing on open water by the button whose entire purpose is to hand back an empty
// canvas, and every one a fault Nova's own validator calls fatal. The user is then told the map is blank.
//
// ⭐ THE DOMINANT BUG SHAPE HERE: the fix already existed one function away and one caller never adopted it.
//
// ⚠️ The `waterIds` form is what makes the buildings half honest: those provinces were LAND until this very
// call, so a row standing on one was on land a moment ago. The whole-map sweep has no such fact and drops
// nothing — that distinction is fixWaterSupplyRail's own, and this test does not weaken it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const tmps = [];
const NOGAME = path.join(os.tmpdir(), "__nova_no_game_blank_supply__");

// ── 🈯 the scale the fix is worth, re-counted from the shipped files ─────────────────────────────────
console.log("\n=== 🈯 what a blank map used to leave floating ===");
{
  const f = (n) => path.join(GAME, "map", n);
  if (!fs.existsSync(f("supply_nodes.txt"))) console.log("  ..   (the base game is not installed)");
  else {
    const rows = (n) => fs.readFileSync(f(n), "utf8").split(/\r?\n/).filter((l) => /\d/.test(l)).length;
    const s = rows("supply_nodes.txt"), r = rows("railways.txt");
    console.log(`     vanilla ships ${s} supply hubs and ${r} railways`);
    ok(s > 500 && r > 700, "⚠️ …a four-figure cleanup, not a corner case", { supply: s, rail: r });
  }
}

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────────
// 12x4 map: provinces 1, 2, 3 are land (one state), province 4 is already sea. A supply hub on 1 and on 2,
// a railway 1-2-3, an arms_factory standing on province 1, and a supply hub already out on the sea.
function makeMod() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-blanksupply-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="BS"\nreplace_path="map"\nreplace_path="history/states"\n');
  fs.mkdirSync(path.join(d, "map"), { recursive: true });

  const W = 12, H = 4;
  const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
  const provAtX = (x) => (x < 3 ? 1 : x < 6 ? 2 : x < 9 ? 3 : 4);
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[provAtX(x)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);

  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;land;false;plains;1",
    "2;20;20;20;land;false;plains;1",
    "3;30;30;30;land;true;plains;1",
    "4;40;40;40;sea;false;ocean;0",
  ].join("\n") + "\n");

  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(d, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');

  fs.writeFileSync(path.join(d, "map", "supply_nodes.txt"), "1 1\n1 2\n");
  fs.writeFileSync(path.join(d, "map", "railways.txt"), "1 3 1 2 3 \n");
  // z = 2 is y = 1; x = 1 is a province-1 column.
  fs.writeFileSync(path.join(d, "map", "buildings.txt"), "1;arms_factory;1.00;9.50;2.00;0.00;0\n");
  return d;
}
const rows = (d, n) => fs.readFileSync(path.join(d, "map", n), "utf8").split(/\r?\n/).filter((l) => l.trim());

// ── ⛔ the finding ───────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ a blank canvas leaves nothing standing on the water ===");
{
  const d = makeMod();
  const before = { supply: rows(d, "supply_nodes.txt").length, rail: rows(d, "railways.txt").length };
  ok(before.supply === 2 && before.rail === 1, "the fixture starts with hubs and a railway on land", before);

  const r = md.blankMapToSea({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(r.changed === true && !r.error, "the blank ran", r.error);
  ok(r.flippedProvinces === 3, "…and drowned all three land provinces", r.flippedProvinces);

  ok(rows(d, "supply_nodes.txt").length === 0,
    "⭐⭐⭐ every supply hub on the drowned land is gone", rows(d, "supply_nodes.txt"));
  ok(rows(d, "railways.txt").length === 0,
    "⭐⭐⭐ …and the railway that ran across it", rows(d, "railways.txt"));
  ok(rows(d, "buildings.txt").length === 0,
    "⭐⭐ …and the factory that was standing on it", rows(d, "buildings.txt"));
  ok(!!r.supplyRail && r.supplyRail.supplyRemoved === 2 && r.supplyRail.railRemoved === 1,
    "⚠️ …and the result SAYS so, so the caller can tell the user", r.supplyRail);
}

// ── ⭐⭐⭐ the property, not the counts: the validator must find nothing afterwards ────────────────────
console.log("\n=== ⭐⭐⭐ Nova's own validator no longer calls the blank map fatal ===");
{
  const d = makeMod();
  md.blankMapToSea({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  const m = md.buildMapModel({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  const probs = md.validateMapModel(m).filter((p) => p.rule === "supply_node_bad_province" || p.rule === "railway_bad_province");
  ok(probs.length === 0,
    "⭐⭐⭐ no supply hub and no railway is left on a sea province",
    probs.map((p) => p.rule + ": " + String(p.message).slice(0, 90)));
}

// ── ⚠️ and it does not fire when there is no land to drown ───────────────────────────────────────────
console.log("\n=== ⚠️ an already-blank map is left alone ===");
{
  const d = makeMod();
  fs.writeFileSync(path.join(d, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;10;10;10;sea;false;ocean;0",
    "2;20;20;20;sea;false;ocean;0",
    "3;30;30;30;sea;false;ocean;0",
    "4;40;40;40;sea;false;ocean;0",
  ].join("\n") + "\n");
  // A hub already out on the water is somebody else's problem (the whole-map sweep's), not this call's:
  // nothing here turned that province to sea, so the "it was land a moment ago" fact does not hold.
  const r = md.blankMapToSea({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(r.flippedProvinces === 0, "nothing was drowned", r.flippedProvinces);
  ok(rows(d, "supply_nodes.txt").length === 2,
    "⚠️ …so the existing rows are left exactly as they were — no silent deletion", rows(d, "supply_nodes.txt"));
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a blank map takes the supply hubs with it: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
