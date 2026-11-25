// ⛔ #inherited-problem-not-yours — A WHOLE-FILE OVERRIDE IS NOT AN AUTHORSHIP CLAIM.
//
// HOI4 replaces map/definition.csv wholesale, so changing ONE province's terrain obliges the mod to ship all
// 465 KB of it — and Nova's Terrain tool copies it in for you on the first click. `modOwnsMapFile` then says
// "yes, the mod ships it", and every quirk in the base game's own 13,000 rows becomes the modder's crash
// report. Measured on the real game before this fix:
//
//   * a scratch mod holding vanilla's definition.csv VERBATIM, nothing else  -> "⛔ This map will crash HOI4",
//     over 2 errors, both of them vanilla's;
//   * the same mod after ONE terrain edit (4861 mountain -> hills, a LAND province)  -> 60 sea provinces
//     reported "cut off from their naval strategic region". A land province's terrain cannot fracture a
//     naval region. Pointing the same validator at unmodified vanilla returned 161 problems, including
//     province 5257 (`sea;true;ocean;2`) — and the base game launches. Vanilla ships 76 such fragments.
//
// So the question a rule of this shape must ask is not "does the mod ship the file" but "did the mod CHANGE
// this". Each gate below is checked in BOTH directions, because suppressing noise must never collapse into
// "the rule never fires".
//
// ⚠️ The first draft of this file called ok(label, cond) while ok() is (cond, label) — so a non-empty string
// was the condition and all 16 checks passed vacuously, two of them over a fixture that never produced a
// fractured region at all. If you edit this file, keep the argument order.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};
const mk = (p, s) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, s); };
const tmps = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-" + tag + "-")); tmps.push(d); return d; };

// A 24-bit BMP, bottom-up, of vertical province stripes.
function bmp24(W, H, colAt) {
  const rs = Math.floor((24 * W + 31) / 32) * 4;
  const buf = Buffer.alloc(54 + rs * H);
  buf.write("BM", 0); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14); buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22);
  buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = colAt(x, y), o = 54 + (H - 1 - y) * rs + x * 3;
    buf[o] = c[2]; buf[o + 1] = c[1]; buf[o + 2] = c[0];
  }
  return buf;
}

// ── A base game whose naval region 10 is ALREADY fractioned, exactly as the shipped one is. ───────────────
// Stripes, left to right:  6 sea | 1 sea | 2 land | 3 sea | 5 sea | 4 land
// Region 10 claims seas 1 and 3, which the land wall keeps apart — and each fragment has an adjacent naval
// region to be re-homed into (60 on the left, 30 on the right), which is what makes the fixer emit a move at
// all. Vanilla ships 76 of these and launches; none of them is any mod's doing.
const COL = { 6: [10, 10, 200], 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200], 5: [90, 90, 90], 4: [30, 140, 140] };
const DEF_ROWS = [
  "0;0;0;0;land;false;unknown;0",
  "6;10;10;200;sea;false;ocean;0",
  "1;200;0;0;sea;false;ocean;1",     // sea, and a continent — vanilla really does this
  "2;0;200;0;land;false;plains;1",
  "3;0;0;200;sea;false;ocean;0",
  "5;90;90;90;sea;false;ocean;0",
  "4;30;140;140;land;false;plains;1",
];
const DEF = DEF_ROWS.join("\r\n") + "\r\n";
const STRIPES = [6, 6, 1, 1, 2, 2, 3, 3, 5, 5, 4, 4];
const BMP = bmp24(STRIPES.length, 4, (x) => COL[STRIPES[x]]);
const region = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs.join(" ")} }\n}\n`;
const BASE_REGIONS = { 10: [1, 3], 30: [5, 4], 60: [6] };

function makeBaseGame() {
  const g = tmp("basegame");
  mk(path.join(g, "map", "definition.csv"), DEF);
  fs.writeFileSync(path.join(g, "map", "provinces.bmp"), BMP);
  for (const [id, provs] of Object.entries(BASE_REGIONS)) mk(path.join(g, "map", "strategicregions", id + ".txt"), region(id, provs));
  return g;
}
const mod = (tag, files) => {
  const m = tmp(tag);
  mk(path.join(m, "descriptor.mod"), 'name="' + tag + '"\nsupported_version="1.19.*"\n');
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(m, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return m;
};
// ⚠️ BOTH validators, because the two rules live in different ones and /api/map/validate concatenates them
// (server.js ~38530). An earlier draft called only validateMapModel — which never emits
// fractioned_naval_region at all, so every "no fractioned_naval_region" check below passed vacuously.
const validate = (modRoot, gameRoot) => {
  const model = md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [] });
  return md.validateMapModel(model).concat(md.validateMapBitmap({ modRoot, gameRoot, dependencyRoots: [] }));
};
const fracOf = (probs) => probs.filter((p) => p.rule === "fractioned_naval_region");
const seaContOf = (probs) => probs.filter((p) => p.rule === "sea_province_has_continent");

(() => {
  const game = makeBaseGame();
  let baseFrags = [];

  console.log("\n=== the base game really is broken in both ways, so the fixtures are honest ===");
  {
    const dry = md.fixFractionedRegions({ modRoot: game, gameRoot: game, dependencyRoots: [], dryRun: true });
    // ⚠️ A dryRun writes nothing, so it must be allowed on the game root — otherwise there is no way to
    // measure the baseline at all, and the refusal buys no safety.
    ok(!(dry && dry.error), "a dryRun on the game root is not refused", dry && dry.error);
    baseFrags = (dry && dry.provinces) || [];
    ok(baseFrags.length > 0, "vanilla's own naval region 10 is fractioned", dry);
    ok(DEF_ROWS.some((r) => r.split(";")[4] === "sea" && Number(r.split(";")[7]) !== 0),
      "…and vanilla ships a sea province with a non-zero continent", DEF_ROWS);
  }

  console.log("\n=== 1. a mod that copies definition.csv in VERBATIM is blamed for none of it ===");
  {
    const m = mod("verbatim", { "map/definition.csv": DEF });
    ok(fs.readFileSync(path.join(m, "map", "definition.csv")).equals(fs.readFileSync(path.join(game, "map", "definition.csv"))),
      "the copy really is byte-identical");
    const probs = validate(m, game);
    ok(seaContOf(probs).length === 0, "no sea_province_has_continent", seaContOf(probs));
    ok(fracOf(probs).length === 0, "no fractioned_naval_region", fracOf(probs));
  }

  console.log("\n=== 2. …nor after a TERRAIN edit, which cannot fracture a naval region ===");
  {
    // The exact shape measured on the real game: one LAND province, mountain -> hills, and 60 sea provinces
    // reported as cut off. Terrain, the coastal flag and the continent are the three columns that cannot
    // move a province between naval regions.
    const rows = DEF_ROWS.slice();
    rows[3] = "2;0;200;0;land;false;hills;1";
    const m = mod("terrainedit", { "map/definition.csv": rows.join("\r\n") + "\r\n" });
    ok(!fs.readFileSync(path.join(m, "map", "definition.csv")).equals(fs.readFileSync(path.join(game, "map", "definition.csv"))),
      "the file DID change, so this is the gate and not mere absence");
    const probs = validate(m, game);
    ok(fracOf(probs).length === 0, "a land terrain edit does not raise fractioned_naval_region", fracOf(probs));
    ok(seaContOf(probs).length === 0, "…and still no sea_province_has_continent", seaContOf(probs));
  }

  console.log("\n=== 3. the positive halves — a change the mod really did make IS reported ===");
  {
    const rows = DEF_ROWS.slice();
    rows[2] = "1;200;0;0;sea;false;ocean;7";        // continent CHANGED from 1
    const probs = validate(mod("seacont", { "map/definition.csv": rows.join("\r\n") + "\r\n" }), game);
    ok(seaContOf(probs).some((p) => (p.provinces || []).includes(1)),
      "a sea province whose continent the MOD changed is reported", probs.map((p) => p.rule));
  }
  {
    const rows = DEF_ROWS.concat(["9;77;88;99;sea;false;ocean;3"]);
    const probs = validate(mod("seaadd", { "map/definition.csv": rows.join("\r\n") + "\r\n" }), game);
    ok(seaContOf(probs).some((p) => (p.provinces || []).includes(9)),
      "a sea province the mod INVENTED is its own, continent and all", probs.map((p) => p.rule));
    ok(!seaContOf(probs).some((p) => (p.provinces || []).includes(1)),
      "…while province 1, inherited untouched, is left out of it", seaContOf(probs));
  }

  console.log("\n=== 4. only the fragments the mod ADDED — vanilla's are subtracted ===");
  {
    // Negative half, and it must isolate the SUBTRACTION rather than the gate: the mod's region files differ
    // from the base game's (a renamed region — a real thing modders do), so `modChangedMapFile` waves it
    // through, but membership is untouched, so every fragment the fixer finds is one vanilla already ships.
    // Only the baseline subtraction can suppress these. Shipping byte-identical files would have been stopped
    // one step earlier by the gate and proved nothing about the subtraction.
    const same = mod("cosmeticregions", Object.fromEntries(
      Object.entries(BASE_REGIONS).map(([id, provs]) =>
        ["map/strategicregions/" + id + ".txt", region(id, provs).replace('name = "R', 'name = "Renamed R')])));
    ok(!fs.readFileSync(path.join(same, "map", "strategicregions", "10.txt"))
      .equals(fs.readFileSync(path.join(game, "map", "strategicregions", "10.txt"))),
      "the mod's region file really does differ from the base game's, so the gate lets it through");
    ok(md.fixFractionedRegions({ modRoot: same, gameRoot: game, dependencyRoots: [], dryRun: true }).provinces.length > 0,
      "the raw fixer still sees vanilla's fragments through this mod");
    ok(fracOf(validate(same, game)).length === 0,
      "…but the validator attributes none of them to it", fracOf(validate(same, game)));

    // Positive half: the mod re-homes sea 5 into region 10, so region 10's largest blob becomes {3,5} and
    // sea 1 is the piece left stranded — a fragment vanilla does not have.
    const moved = mod("movedregions", {
      "map/strategicregions/10.txt": region(10, [1, 3, 5]),
      "map/strategicregions/30.txt": region(30, [4]),
      "map/strategicregions/60.txt": region(60, [6]),
    });
    const got = fracOf(validate(moved, game));
    const novel = got.flatMap((p) => p.provinces || []);
    ok(novel.length > 0, "a fragment the mod CREATED is still reported", { baseFrags, novel });
    ok(novel.every((p) => !baseFrags.includes(p)),
      "…and what it reports is exactly what vanilla does not already have", { baseFrags, novel });
  }

  console.log("\n=== 5. the count it quotes is the real one, not a truncation ===");
  {
    // `provinces` used to come back sliced to 60, and the message reported `provinces.length` — so a map with
    // 200 fragments was told "60". On the shipped game the true figure is 76, and the banner said 60.
    const dry = md.fixFractionedRegions({ modRoot: game, gameRoot: game, dependencyRoots: [], dryRun: true });
    const listed = (dry.provinces || []).length;
    const fromDetails = (dry.details || []).reduce((n, d) => n + (d.count || (d.cutOffLandMemberMovedTo != null ? 1 : 0)), 0);
    ok(listed === fromDetails, "the dry run returns every fragment, not the first 60", { listed, fromDetails });
  }

  console.log("\n=== 6. with no mod selected nothing is suppressed — there is nobody else to blame ===");
  {
    const noMod = md.validateMapModel({
      provinces: [{ id: 1, type: "sea", continent: 5 }],
      states: [{ id: 1, provinces: [1] }],
      provinceToState: { 1: 1 },
    });
    ok(seaContOf(noMod).length > 0, "the sea-continent rule still fires with no modRoot", noMod.map((p) => p.rule));
  }

  tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log(`\n=== a map warning is about what the mod changed: ${pass} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
