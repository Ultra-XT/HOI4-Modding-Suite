// Moving a province must not drag along a harbour that merely FLOATS over it.
// #a-floating-harbor-is-keyed-by-its-anchor  (the WRITER half — 39b7039 fixed only the scan)
//
// FOUND BY REBUILDING THE TORTURE MOD. One "make an island" — turn open ocean into land, move it into a
// new state — re-keyed EIGHT correct vanilla buildings.txt rows to the island's state 1082:
//
//   130;floating_harbor;2800.26;9.50;1615.13;-1.11;11297   ->   1082;floating_harbor;…;11297
//
// Province 11297 is in state 130 and never moved; the only thing that moved was the WATER the harbour
// floats on. Nova's own building_anchor_wrong_state rule then reported all eight — the editor wrote the
// defect and the validator blamed the modder for it.
//
// Column 7 means two different things and the corpus is unambiguous (pinned next door in
// test-a-floating-harbor-is-keyed-by-its-anchor.js):
//
//   naval_base_spawn  column 7 is a SEA province; the key follows the POSITION.
//   floating_harbor   column 7 is a LAND province; the key follows the ANCHOR — a floating harbour SITS
//                     AT SEA and belongs to the land state it serves.
//
// rekeyBuildingAnchorsForProvince has BOTH loops: an anchor loop (correct) and a position loop that ran
// over every row indiscriminately. The guard tests the DATA — is column 7 a land province? — not the type
// name, so a future anchored building type is covered without anyone remembering to add it.
//
// ⚠️ The guard must not become a blanket skip: an arms_factory (anchor 0) and a naval_base_spawn (SEA
// anchor) standing on the same moved province MUST still be re-homed, or moving a province silently
// strands every factory on it. Both are asserted below as positive controls.
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

const tmps = [];
const NOGAME = path.join(os.tmpdir(), "__nova_no_game_harbor_follow__");

// ── the fixture ──────────────────────────────────────────────────────────────────────────────────────
// 12x4 map, three columns: province 1 (land, state 1), province 2 (land, state 2), province 3 (sea).
// Province 3 is the water. A floating_harbor sits ON province 3 but is ANCHORED to province 2.
function makeMod() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-harborfollow-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="HF"\nreplace_path="map"\nreplace_path="history/states"\n');
  fs.mkdirSync(path.join(d, "map"), { recursive: true });

  const W = 12, H = 4;
  const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30] };
  const provAtX = (x) => (x < 4 ? 1 : x < 8 ? 2 : 3);
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
    "1;10;10;10;land;true;plains;1",
    "2;20;20;20;land;true;plains;1",
    "3;30;30;30;sea;false;ocean;0",
  ].join("\n") + "\n");

  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(d, "history", "states", "1.txt"),
    'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  fs.writeFileSync(path.join(d, "history", "states", "2.txt"),
    'state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = BBB\n\t}\n}\n');

  // z is measured from the BOTTOM (y = H - 1 - z), so z = 2 is y = 1 — inside the map.
  // x = 10 is a province-3 (sea) column; x = 5 is a province-2 (land) column.
  fs.writeFileSync(path.join(d, "map", "buildings.txt"), [
    "2;floating_harbor;10.00;9.50;2.00;0.00;2",   // floats on province 3, anchored to land province 2
    "2;arms_factory;10.00;9.50;2.00;0.00;0",      // stands on province 3, no anchor -> position governs
    "2;naval_base_spawn;10.00;9.50;2.00;0.00;3",  // sea anchor -> position governs
    "1;floating_harbor;10.00;9.50;2.00;0.00;1",   // anchored to province 1, which is what MOVES below
  ].join("\n") + "\n");
  return d;
}
const rowsOf = (d) => fs.readFileSync(path.join(d, "map", "buildings.txt"), "utf8")
  .split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(";"));

// ── ⛔ the finding: moving the WATER must not move the harbour ────────────────────────────────────────
console.log("\n=== ⛔ the water moves; the harbour anchored to land does not ===");
{
  const d = makeMod();
  const r = md.rekeyBuildingAnchorsForProvince({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceId: 3, toStateId: 1 });
  ok(!r.error, "the re-key ran", r.error);
  const rows = rowsOf(d);
  const harbor = rows.find((c) => c[1] === "floating_harbor" && c[6] === "2");
  ok(!!harbor && harbor[0] === "2",
    "⭐⭐⭐ the floating_harbor floating over the moved water keeps its ANCHOR's state", harbor);

  // …and the two rows the position loop is FOR still move. Without these the guard could be a blanket
  // skip and every factory on a moved province would be silently stranded.
  const factory = rows.find((c) => c[1] === "arms_factory");
  ok(!!factory && factory[0] === "1",
    "⚠️ …while the arms_factory standing on it IS re-homed (anchor 0 — position governs)", factory);
  const spawn = rows.find((c) => c[1] === "naval_base_spawn");
  ok(!!spawn && spawn[0] === "1",
    "⚠️ …and so is the naval_base_spawn, whose anchor is SEA (position governs)", spawn);
  ok(r.rekeyed >= 2, "the count reports the rows it actually moved", r);
}

// ── the anchor loop still does its own job ───────────────────────────────────────────────────────────
console.log("\n=== ✅ when the ANCHOR itself moves, the harbour follows ===");
{
  const d = makeMod();
  const r = md.rekeyBuildingAnchorsForProvince({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceId: 1, toStateId: 2 });
  ok(!r.error, "the re-key ran", r.error);
  const harbor = rowsOf(d).find((c) => c[1] === "floating_harbor" && c[6] === "1");
  ok(!!harbor && harbor[0] === "2",
    "⭐⭐ the harbour anchored to the moved province IS re-keyed — the guard only silences POSITION", harbor);
}

// ── the two rules must agree afterwards, which is the property that was broken ───────────────────────
console.log("\n=== ⭐⭐⭐ after the move, Nova's own anchor rule reports nothing ===");
{
  const d = makeMod();
  md.rekeyBuildingAnchorsForProvince({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceId: 3, toStateId: 1 });
  // Province 3 is now in state 1 as far as buildings are concerned; make the state file say so too, so the
  // validator sees the same world the writer just wrote for.
  const f = path.join(d, "history", "states", "1.txt");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("provinces = { 1 }", () => "provinces = { 1 3 }"));
  const m = md.buildMapModel({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [] });
  const probs = md.findBuildingAnchorMismatches({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], model: m });
  ok(probs.length === 0,
    "⭐⭐⭐ the editor no longer writes the defect its own validator complains about",
    probs.map((p) => String(p.message).slice(0, 110)));
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a harbor does not follow the water it floats on: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
