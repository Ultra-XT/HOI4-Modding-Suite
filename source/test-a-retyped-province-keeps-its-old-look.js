// A province Nova retypes must also be REPAINTED. #a-retyped-province-keeps-its-old-look
//
// THE OWNER'S "GLASS". He built a world through Nova's own sequence — new mod → Delete map → Generate land
// at 35% → Auto-fix ×2 — and launched it without -debug. It LOADED: no MAP_ERROR, no "Failed to load the
// map", error.log 14 lines, a 1936 singleplayer game started. Then he looked at it: "the world looked super
// weird … it was still the same world but full of holes … full of weird things that looked like glass."
//
// The heightmap was not the fault. Measured over every pixel of his installed mod, land Nova created sits at
// a mean height of 103.2 with vanilla's own beach at the waterline (distance 1 → 94, 2 → 97, … 9+ → 106,
// matching vanilla's medians), 94.5% of it above sea level, and NOT ONE of its 4,654 land provinces is
// wholly below the waterline — the base game has one. #new-land-needs-a-beach is holding.
//
// map/terrain.bmp was. definition.csv says what a province IS, heightmap.bmp decides what is drawn above or
// below water — Nova writes both — and terrain.bmp decides what the surface is PAINTED with. Nova had never
// written it; it appeared in this tree only inside validation rules. On the mod he launched:
//
//     land Nova created   2,605,543 px — 96.4% painted with the OCEAN texture
//     sea  Nova created   2,628,608 px — 0.0% painted as water; plains, forest, desert and mountain instead
//     789 of its 1,094 new land provinces painted ENTIRELY as water
//
// Ocean texture standing above the waterline is a flat pale sheet on a plateau. That is the glass, and it is
// in the ocean, which is where the raised provinces are. Land texture left under the water is the holes.
//
// 🈯 AGREEMENT IS THE SHIPPING CONVENTION, so this is not a rule Nova invented: all six shipping maps carry a
// terrain.bmp of their own and keep it in step with definition.csv — land painted as water 0.00% (vanilla),
// 0.08% (MD), 0.01% (R56), 0.28% (OWB), 0.06% (NV), 0.01% (RoN).
//
// ⛔ AND ONLY THE PIXELS THAT CROSSED THE WATERLINE. Repainting every pixel of a named province was the first
// attempt and the corpus refused it: erasing a province that is ALREADY sea rewrote 1,193 pixels of vanilla's
// own terrain.bmp, because a shipping map paints the sea beside a coast with the LAND texture on purpose.
// 300,629 of vanilla's sea pixels carry a land index and only 85% are within 3px of land, so no radius rule
// separates that blend from the rest. The pixels the heightmap write just moved across the waterline are
// exactly the ones whose paint is now wrong, and a blend pixel already under water never crosses.
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
const NOGAME = path.join(os.tmpdir(), "__no_game_repaint__");
const tmps = [];

// ── the fixture: a 40x8 strip, nine provinces, and a map that is already CORRECT ────────────────────
// Columns 0-3 province 1, then 2..8 four pixels each, then 9. 1, 2, 8, 9 are sea; 3..7 are land.
// ⭐ The fixture declares plains at indices 0 AND 5 and paints its existing plains with 5, never 0. A writer
// that reaches for the first index common/terrain declares would pick 0 and be wrong — the right answer is
// the one THIS MAP already uses.
const OCEAN_INDEX = 15, PLAINS_USED = 5, PLAINS_UNUSED = 0;
function makeMod({ types = null, beachAt = null } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-repaint-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.mkdirSync(path.join(d, "common", "terrain"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="RP"\nreplace_path="map"\n');
  fs.writeFileSync(path.join(d, "common", "terrain", "00_terrain.txt"),
    "categories = {\n" +
    "\tocean = { is_water = yes naval_terrain = yes color = { 40 83 176 } }\n" +
    "\tplains = { color = { 200 200 100 } }\n" +
    "}\n" +
    "terrain = {\n" +
    `\tplains_first  = { type = plains color = { ${PLAINS_UNUSED} } texture = 1 }\n` +
    `\tplains_second = { type = plains color = { ${PLAINS_USED} } texture = 0 }\n` +
    `\tocean_a       = { type = ocean  color = { ${OCEAN_INDEX} } texture = 9 }\n` +
    "}\n");

  const W = 40, H = 8;
  const idAtX = (x) => (x < 4 ? 1 : x < 32 ? 2 + Math.floor((x - 4) / 4) : 9);
  const COL = {}; for (let i = 1; i <= 9; i++) COL[i] = [i * 20, i * 5, i * 9];
  const kind = types || { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "land", 6: "land", 7: "land", 8: "sea", 9: "sea" };

  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[idAtX(x)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);

  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let i = 1; i <= 9; i++) {
    const t = kind[i];
    rows.push(`${i};${COL[i][0]};${COL[i][1]};${COL[i][2]};${t};false;${t === "land" ? "plains" : "ocean"};${t === "land" ? 1 : 0}`);
  }
  fs.writeFileSync(path.join(d, "map", "definition.csv"), rows.join("\n") + "\n");

  // an 8-bit greyscale bitmap of the right shape, filled by `fill(x, y)`
  const irs = Math.floor((8 * W + 31) / 32) * 4, isz = irs * H;
  const indexed = (fill) => {
    const b = Buffer.alloc(54 + 1024 + isz);
    b.write("BM", 0, "ascii");
    b.writeUInt32LE(54 + 1024 + isz, 2); b.writeUInt32LE(54 + 1024, 10); b.writeUInt32LE(40, 14);
    b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26);
    b.writeUInt16LE(8, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(isz, 34);
    b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50);
    for (let i = 0; i < 256; i++) { const o = 54 + i * 4; b[o] = i; b[o + 1] = i; b[o + 2] = i; b[o + 3] = 0; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[54 + 1024 + (H - 1 - y) * irs + x] = fill(x, y);
    return b;
  };
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), indexed((x, y) => {
    if (beachAt && beachAt.x === x) return 94;             // a shoreline pixel already UNDER the waterline
    return kind[idAtX(x)] === "land" ? 106 : 89;
  }));
  fs.writeFileSync(path.join(d, "map", "terrain.bmp"), indexed((x) => (kind[idAtX(x)] === "land" ? PLAINS_USED : OCEAN_INDEX)));
  return { d, W, H, irs, idAtX };
}
const idxAt = (f, file, x, y) => { const b = fs.readFileSync(path.join(f.d, "map", file)); const off = b.readUInt32LE(10); return b[off + (f.H - 1 - y) * f.irs + x]; };
const retype = (f, id, type, terrain) => {
  const lines = fs.readFileSync(path.join(f.d, "map", "definition.csv"), "utf8").split("\n");
  const out = lines.map((l) => (l.split(";")[0] === String(id) ? l.split(";").map((c, i) => (i === 4 ? type : i === 6 ? terrain : i === 7 ? (type === "land" ? "1" : "0") : c)).join(";") : l));
  fs.writeFileSync(path.join(f.d, "map", "definition.csv"), out.join("\n"));
};

// ── 🈯 the graphical terrain table is read from the game, not typed in ──────────────────────────────
console.log("\n=== 🈯 what does the GAME say terrain.bmp's indices mean? ===");
{
  if (!fs.existsSync(path.join(GAME, "map", "terrain.bmp"))) console.log("  ..   (the base game is not installed)");
  else if (typeof md.graphicalTerrainIndices !== "function") {
    // ⚠️ A back-out must BITE ON BEHAVIOUR, not throw on a missing export and take the rest of the file with
    // it. Report it and keep going, so the checks that matter still run and still fail.
    ok(false, "map-data exports graphicalTerrainIndices", typeof md.graphicalTerrainIndices);
  } else {
    const g = md.graphicalTerrainIndices({ gameRoot: GAME, dependencyRoots: [] });
    ok(g.size > 0, "the base game declares graphical terrain", g.size);
    const ocean = g.get("ocean") || [];
    ok(ocean.length > 0, "…including an `ocean` category", ocean);
    // Derived, not typed: the index vanilla's own terrain.bmp uses under its own sea provinces must be one
    // of the indices its 00_terrain.txt declares for `ocean`.
    const tb = fs.readFileSync(path.join(GAME, "map", "terrain.bmp"));
    const pb = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
    const toff = tb.readUInt32LE(10), poff = pb.readUInt32LE(10);
    const W = pb.readInt32LE(18), H = pb.readInt32LE(22);
    const prs = Math.floor((24 * W + 31) / 32) * 4, trs = (W + 3) & ~3;
    const sea = new Set();
    for (const ln of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
      const c = ln.split(";");
      if (c.length < 8 || (c[4] || "").trim() !== "sea") continue;
      sea.add(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0);
    }
    const tally = new Map();
    for (let y = 0; y < H; y += 7) for (let x = 0; x < W; x += 7) {
      const o = poff + (H - 1 - y) * prs + x * 3;
      if (!sea.has(((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0)) continue;
      const i = tb[toff + (H - 1 - y) * trs + x];
      tally.set(i, (tally.get(i) || 0) + 1);
    }
    let best = -1, n = -1, total = 0;
    for (const [i, c] of tally) { total += c; if (c > n) { best = i; n = c; } }
    console.log(`     ${total} sampled sea pixels; the commonest index is ${best} (${(100 * n / total).toFixed(1)}%)`);
    ok(ocean.includes(best), `⭐⭐ the index vanilla PAINTS its sea with (${best}) is one it DECLARES as ocean`, { best, ocean });
  }
}

// ── ⛔ the finding: land erased to sea must stop being painted as land ──────────────────────────────
console.log("\n=== ⛔ a province retyped to sea is repainted as sea ===");
{
  const f = makeMod();
  ok(idxAt(f, "terrain.bmp", 8, 4) === PLAINS_USED, "before: province 3 is painted with the land index", idxAt(f, "terrain.bmp", 8, 4));
  retype(f, 3, "sea", "ocean");
  const r = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [3] });
  ok(r.changed === true && r.pixels > 0, "the sink ran", r);
  ok(!!(r.terrain && r.terrain.changed && r.terrain.pixels > 0), "⭐⭐⭐ …and terrain.bmp was repainted with it", r.terrain);
  ok(idxAt(f, "terrain.bmp", 9, 4) === OCEAN_INDEX, "⭐⭐⭐ province 3 is now painted with the OCEAN index", idxAt(f, "terrain.bmp", 9, 4));
  ok(idxAt(f, "heightmap.bmp", 9, 4) === 89, "…and it is under the water too", idxAt(f, "heightmap.bmp", 9, 4));
  ok(idxAt(f, "terrain.bmp", 16, 4) === PLAINS_USED, "⚠️ the land next door (province 4) is untouched", idxAt(f, "terrain.bmp", 16, 4));
  ok(idxAt(f, "terrain.bmp", 2, 4) === OCEAN_INDEX, "⚠️ …and so is the sea next door (province 1)", idxAt(f, "terrain.bmp", 2, 4));
}

// ── ⭐ the mirror, and the index is the one THIS MAP uses ───────────────────────────────────────────
console.log("\n=== ⭐ sea raised to land is painted with the index this map already uses for it ===");
{
  const f = makeMod();
  retype(f, 2, "land", "plains");
  const r = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [2], raise: true });
  ok(r.changed === true, "the raise ran", r);
  const got = idxAt(f, "terrain.bmp", 5, 4);
  ok(got === PLAINS_USED,
    `⭐⭐⭐ province 2 is painted ${PLAINS_USED} — the plains index this map uses — not ${PLAINS_UNUSED}, the first one declared`,
    { got, used: PLAINS_USED, firstDeclared: PLAINS_UNUSED });
  ok(!!(r.terrain && r.terrain.byCategory && r.terrain.byCategory.plains && r.terrain.byCategory.plains.index === PLAINS_USED),
    "…and it says so", r.terrain && r.terrain.byCategory);
}

// ── ⚠️ the shoreline blend: a pixel already under the water keeps its paint ─────────────────────────
console.log("\n=== ⚠️ a pixel that did not cross the waterline keeps the paint it has ===");
{
  // province 3 spans x=8..11; give x=8 a height of 94 — a beach, already below the render waterline of 95.
  const f = makeMod({ beachAt: { x: 8 } });
  ok(idxAt(f, "heightmap.bmp", 8, 4) === 94, "the fixture has a beach pixel at 94", idxAt(f, "heightmap.bmp", 8, 4));
  retype(f, 3, "sea", "ocean");
  md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [3] });
  ok(idxAt(f, "terrain.bmp", 9, 4) === OCEAN_INDEX, "the pixels that crossed are repainted", idxAt(f, "terrain.bmp", 9, 4));
  ok(idxAt(f, "terrain.bmp", 8, 4) === PLAINS_USED,
    "⭐⭐⭐ the beach pixel, which never crossed, keeps its land index — that is the shoreline blend",
    idxAt(f, "terrain.bmp", 8, 4));
}

// ── ⚠️ nothing moved, nothing is painted ───────────────────────────────────────────────────────────
console.log("\n=== ⚠️ retyping nothing repaints nothing ===");
{
  const f = makeMod();
  const before = fs.readFileSync(path.join(f.d, "map", "terrain.bmp"));
  const r = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [1] });
  ok(r.changed === false, "sinking a province already at sea level changes nothing", r);
  ok(Buffer.compare(before, fs.readFileSync(path.join(f.d, "map", "terrain.bmp"))) === 0,
    "⭐⭐ …and terrain.bmp is byte-for-byte what it was");
}

// ── 🈯 THE CRY-WOLF CONTROL, on the shipping map itself ─────────────────────────────────────────────
console.log("\n=== 🈯 a no-op on the base game must not rewrite the base game's own painting ===");
{
  if (!fs.existsSync(path.join(GAME, "map", "terrain.bmp"))) console.log("  ..   (the base game is not installed)");
  else {
    // 209 is a real vanilla SEA province. Vanilla paints 300,629 of its sea pixels with a LAND index on
    // purpose — the shoreline blend — and an earlier draft of this writer rewrote 1,193 of them for a
    // province that had not changed at all.
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-repaint-van-")); tmps.push(d);
    fs.mkdirSync(path.join(d, "map"), { recursive: true });
    fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="RP2"\n');
    const r = md.sinkProvincesInHeightmap({ modRoot: d, gameRoot: GAME, dependencyRoots: [], provinceIds: [209] });
    ok(r.changed === false, "erasing a province that is already sea changes nothing", r);
    ok(!!(r.terrain && r.terrain.changed === false), "…including terrain.bmp", r.terrain);
    ok(!fs.existsSync(path.join(d, "map", "terrain.bmp")),
      "⭐⭐⭐ …and the mod does not acquire an 11.5 MB copy of terrain.bmp for a click that changed nothing");
  }
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp dir */ } }
console.log(`\n=== a retyped province keeps its old look: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
