// #a-same-named-file-replaces-the-lower-one, IN common/terrain — and the agreement it decides.
//
// map/terrain.bmp holds one byte per pixel: an index into a table common/terrain declares. The table says
// which index means plains, which means ocean. Nothing in the bitmap says it — so a writer that repaints a
// province has to read that table exactly the way the game reads it, or it writes a number that draws the
// wrong surface with no error anywhere.
//
// ⛔ THE BUG THIS PINS. graphicalTerrainIndices read EVERY root's common/terrain and merged them. HOI4
// replaces a common/ file WHOLESALE at the same relative path, so a mod shipping vanilla's own
// 00_terrain.txt is the only file the game reads there. Old World Blues does exactly that and renumbers the
// whole table — its ocean is index 1, and 15, vanilla's ocean, is its DESERT. Measured over every pixel of
// the six shipping maps, the merged read disagreed with the index the map itself paints with, on OWB, for 7
// of its 11 categories:
//
//     ocean     OWB paints 8,596,536 px with 1     merged read returned 15  (= OWB's desert)
//     urban     OWB paints    48,177 px with 19    merged read returned 13  (= OWB's desert)
//     hills     OWB paints   189,319 px with 5     merged read returned 14
//     mountain  OWB paints    48,171 px with 7     merged read returned 18
//     marsh     OWB paints   161,937 px with 10    merged read returned 9
//     jungle    OWB paints    43,428 px with 11    merged read returned 21 — declared NOWHERE in OWB
//     lakes     OWB has no lakes terrain at all    merged read returned 14  (= OWB's hills)
//
// So erasing one province to sea on an OWB-based mod painted the new sea DESERT: the owner's "glass", caused
// by the very writer added to cure it. The per-category vote could not save it, because a vote counts a
// pixel only when its index maps back to the same category, and vanilla's entry for index 1 (forest)
// shadowed OWB's (ocean) — all 8.6 million of OWB's ocean pixels read as "already mispainted", and the
// fallback took vanilla's 15.
//
// ⚠️ WHY THIS IS NOT A PER-PIXEL RULE OVER THE WHOLE MAP. Measured on the base game, the terrain a
// definition.csv row CLAIMS and the index its pixels are painted with agree on only 92.56% of 11,534,336
// pixels — 201,691 ocean pixels are painted plains, 140,031 mountain pixels desert. That is the shoreline
// blend and the map artist's shading, and it is the convention on all six shipping maps. A rule demanding
// agreement everywhere would fire on every map that ships. What must agree is what NOVA WRITES: an index it
// paints for a category has to be one the LOADED table declares for that category.
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
const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";
const tmps = [];
const mkdtemp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tload-" + tag + "-")); tmps.push(d); return d; };

// ── the fixture ────────────────────────────────────────────────────────────────────────────────────
// A "base game" whose table is vanilla-shaped, and a mod that RENUMBERS it the way OWB does. The numbers
// are chosen to reproduce OWB's exact trap: the mod's ocean index is one the base game gives to another
// category, and the base game's ocean index is one the mod gives to DESERT.
const BASE_TABLE = { plains: 0, forest: 1, ocean: 15 };
const MOD_TABLE = { plains: 3, ocean: 1, desert: 15 };
const terrainFile = (table) =>
  "categories = {\n"
  + Object.keys(table).map((c) => `\t${c} = {${c === "ocean" ? " is_water = yes naval_terrain = yes" : ""} color = { 200 200 100 } }`).join("\n") + "\n"
  + "}\n"
  + "terrain = {\n"
  + Object.entries(table).map(([c, i]) => `\t${c}_g = { type = ${c} color = { ${i} } texture = 1 }`).join("\n") + "\n"
  + "}\n";

function writeTerrain(root, fileName, table) {
  fs.mkdirSync(path.join(root, "common", "terrain"), { recursive: true });
  fs.writeFileSync(path.join(root, "common", "terrain", fileName), terrainFile(table));
}

// A 40x8 strip: province 1 sea, 2 sea, 3..7 land, 8 sea, 9 sea — the shape the sibling repaint test uses.
const W = 40, H = 8;
const idAtX = (x) => (x < 4 ? 1 : x < 32 ? 2 + Math.floor((x - 4) / 4) : 9);
const COL = {}; for (let i = 1; i <= 9; i++) COL[i] = [i * 20, i * 5, i * 9];
const KIND = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "land", 6: "land", 7: "land", 8: "sea", 9: "sea" };
const IRS = Math.floor((8 * W + 31) / 32) * 4;

function makeMap(root, table) {
  fs.mkdirSync(path.join(root, "map"), { recursive: true });
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[idAtX(x)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(root, "map", "provinces.bmp"), bmp);

  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let i = 1; i <= 9; i++) {
    const t = KIND[i];
    rows.push(`${i};${COL[i][0]};${COL[i][1]};${COL[i][2]};${t};false;${t === "land" ? "plains" : "ocean"};${t === "land" ? 1 : 0}`);
  }
  fs.writeFileSync(path.join(root, "map", "definition.csv"), rows.join("\n") + "\n");

  const isz = IRS * H;
  const indexed = (fill) => {
    const b = Buffer.alloc(54 + 1024 + isz);
    b.write("BM", 0, "ascii");
    b.writeUInt32LE(54 + 1024 + isz, 2); b.writeUInt32LE(54 + 1024, 10); b.writeUInt32LE(40, 14);
    b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26);
    b.writeUInt16LE(8, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(isz, 34);
    b.writeUInt32LE(256, 46); b.writeUInt32LE(256, 50);
    for (let i = 0; i < 256; i++) { const o = 54 + i * 4; b[o] = i; b[o + 1] = i; b[o + 2] = i; b[o + 3] = 0; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[54 + 1024 + (H - 1 - y) * IRS + x] = fill(x, y);
    return b;
  };
  fs.writeFileSync(path.join(root, "map", "heightmap.bmp"), indexed((x) => (KIND[idAtX(x)] === "land" ? 106 : 89)));
  // Painted with the MOD's own numbering — a map is in step with the table it ships.
  fs.writeFileSync(path.join(root, "map", "terrain.bmp"), indexed((x) => (KIND[idAtX(x)] === "land" ? table.plains : table.ocean)));
}
const idxAt = (root, file, x, y) => { const b = fs.readFileSync(path.join(root, "map", file)); return b[b.readUInt32LE(10) + (H - 1 - y) * IRS + x]; };
const retype = (root, id, type, terrain) => {
  const lines = fs.readFileSync(path.join(root, "map", "definition.csv"), "utf8").split("\n");
  fs.writeFileSync(path.join(root, "map", "definition.csv"),
    lines.map((l) => (l.split(";")[0] === String(id)
      ? l.split(";").map((c, i) => (i === 4 ? type : i === 6 ? terrain : i === 7 ? (type === "land" ? "1" : "0") : c)).join(";")
      : l)).join("\n"));
};

// ── ⛔ the finding: a same-named file replaces the one below it ─────────────────────────────────────
console.log("\n=== ⛔ a mod's common/terrain file REPLACES the base game's of the same name ===");
{
  const game = mkdtemp("game"); writeTerrain(game, "00_terrain.txt", BASE_TABLE);
  const mod = mkdtemp("mod"); writeTerrain(mod, "00_terrain.txt", MOD_TABLE);
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="T"\n');

  const g = md.graphicalTerrainIndices({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
  const list = (c) => (g.get(c) || []).slice();
  ok(JSON.stringify(list("ocean")) === JSON.stringify([MOD_TABLE.ocean]),
    `⭐⭐⭐ ocean is the mod's ${MOD_TABLE.ocean} and ONLY that — the base game's ${BASE_TABLE.ocean} does not load`, list("ocean"));
  ok(JSON.stringify(list("plains")) === JSON.stringify([MOD_TABLE.plains]),
    `plains is the mod's ${MOD_TABLE.plains}, not the base game's ${BASE_TABLE.plains}`, list("plains"));
  ok(list("forest").length === 0,
    "⭐⭐ a category only the REPLACED file declared is gone — the game never reads that file", list("forest"));
  ok(JSON.stringify(list("desert")) === JSON.stringify([MOD_TABLE.desert]),
    `⭐⭐⭐ index ${MOD_TABLE.desert} belongs to DESERT here, whatever the base game calls it`, list("desert"));
}

console.log("\n=== 🈯 …but a file the base game does NOT ship still merges, as the game merges it ===");
{
  const game = mkdtemp("game2"); writeTerrain(game, "00_terrain.txt", BASE_TABLE);
  const mod = mkdtemp("mod2"); writeTerrain(mod, "10_extra.txt", { radiation: 20 });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="T2"\n');
  const g = md.graphicalTerrainIndices({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
  ok(JSON.stringify((g.get("plains") || [])) === JSON.stringify([BASE_TABLE.plains]),
    "the base game's table is still read under a differently-named addition", [...(g.get("plains") || [])]);
  ok(JSON.stringify((g.get("radiation") || [])) === JSON.stringify([20]),
    "…and the mod's own graphical terrain is read on top of it", [...(g.get("radiation") || [])]);
}

console.log("\n=== 🈯 …and replace_path = \"common/terrain\" hides the base game outright ===");
{
  const game = mkdtemp("game3"); writeTerrain(game, "00_terrain.txt", BASE_TABLE);
  const mod = mkdtemp("mod3"); writeTerrain(mod, "10_extra.txt", { radiation: 20 });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="T3"\nreplace_path="common/terrain"\n');
  const g = md.graphicalTerrainIndices({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
  ok((g.get("plains") || []).length === 0,
    "⭐⭐ the declarer of replace_path cuts every lower root, the other half of the rule", [...(g.get("plains") || [])]);
  ok(JSON.stringify((g.get("radiation") || [])) === JSON.stringify([20]), "…and its own file still loads", [...(g.get("radiation") || [])]);
}

// ── ⛔ what the painter WRITES has to agree with the row it is painting for ─────────────────────────
console.log("\n=== ⛔ the index painted is one the LOADED table declares for the row's terrain ===");
{
  const game = mkdtemp("game4"); writeTerrain(game, "00_terrain.txt", BASE_TABLE);
  const mod = mkdtemp("mod4"); writeTerrain(mod, "00_terrain.txt", MOD_TABLE);
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="T4"\n');
  makeMap(mod, MOD_TABLE);

  // province 3 spans x=8..11 — land, painted with the mod's plains index.
  ok(idxAt(mod, "terrain.bmp", 9, 4) === MOD_TABLE.plains, "before: province 3 carries the mod's plains index", idxAt(mod, "terrain.bmp", 9, 4));
  retype(mod, 3, "sea", "ocean");
  const r = md.sinkProvincesInHeightmap({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceIds: [3] });
  ok(!!(r.terrain && r.terrain.changed === true), "the repaint ran", r.terrain);
  const got = idxAt(mod, "terrain.bmp", 9, 4);
  ok(got === MOD_TABLE.ocean,
    `⭐⭐⭐ the new sea is painted ${MOD_TABLE.ocean}, the OCEAN of the table that loads`, { got, want: MOD_TABLE.ocean });
  ok(got !== BASE_TABLE.ocean,
    `⭐⭐⭐ …and NOT ${BASE_TABLE.ocean}, which is this mod's DESERT — that is the glass`, { got, wouldBe: BASE_TABLE.ocean });

  // ⭐ the general form of item 3: whatever the painter reports painting, the index must be declared for
  //    that category by the table that loads. Derived from the call's own result, never typed in.
  const loaded = md.graphicalTerrainIndices({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
  const wrong = Object.entries((r.terrain && r.terrain.byCategory) || {})
    .filter(([cat, v]) => !(loaded.get(cat) || []).includes(v.index));
  ok(wrong.length === 0, "⭐⭐⭐ every category it painted got an index DECLARED for that category", wrong);
  ok(Object.keys((r.terrain && r.terrain.byCategory) || {}).length > 0, "…and it painted at least one", r.terrain && r.terrain.byCategory);
}

console.log("\n=== ⭐ the mirror: sea raised to land is painted the mod's plains, not the base game's ===");
{
  const game = mkdtemp("game5"); writeTerrain(game, "00_terrain.txt", BASE_TABLE);
  const mod = mkdtemp("mod5"); writeTerrain(mod, "00_terrain.txt", MOD_TABLE);
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="T5"\n');
  makeMap(mod, MOD_TABLE);
  retype(mod, 2, "land", "plains");
  const r = md.sinkProvincesInHeightmap({ modRoot: mod, gameRoot: game, dependencyRoots: [], provinceIds: [2], raise: true });
  const got = idxAt(mod, "terrain.bmp", 5, 4);
  ok(got === MOD_TABLE.plains, `⭐⭐ new land carries ${MOD_TABLE.plains}`, { got, want: MOD_TABLE.plains, changed: r.terrain });
  ok(got !== BASE_TABLE.plains, `…not the replaced file's ${BASE_TABLE.plains}`, got);
}

// ── 🈯 THE CORPUS CONTROL — the numbers come off the shipping maps, not out of this file ────────────
console.log("\n=== 🈯 on the shipping maps themselves ===");
{
  // The index a map paints a CATEGORY with, sampled from its own bitmaps. Never typed in.
  const sampleIndexFor = (root, category) => {
    const pf = path.join(root, "map", "provinces.bmp"), tf = path.join(root, "map", "terrain.bmp"), df = path.join(root, "map", "definition.csv");
    if (![pf, tf, df].every((f) => fs.existsSync(f))) return null;
    const want = new Set();
    for (const ln of fs.readFileSync(df, "utf8").split(/\r?\n/)) {
      const c = ln.split(";");
      if (c.length < 8 || String(c[6] || "").trim().toLowerCase() !== category) continue;
      want.add(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0);
    }
    if (!want.size) return null;
    const pb = fs.readFileSync(pf), tb = fs.readFileSync(tf);
    const poff = pb.readUInt32LE(10), toff = tb.readUInt32LE(10);
    const w = pb.readInt32LE(18), h = pb.readInt32LE(22);
    if (tb.readInt32LE(18) !== w || tb.readInt32LE(22) !== h) return null;
    const prs = Math.floor((24 * w + 31) / 32) * 4, trs = (w + 3) & ~3;
    const tally = new Map();
    for (let y = 0; y < h; y += 7) for (let x = 0; x < w; x += 7) {
      const o = poff + (h - 1 - y) * prs + x * 3;
      if (!want.has(((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0)) continue;
      const i = tb[toff + (h - 1 - y) * trs + x];
      tally.set(i, (tally.get(i) || 0) + 1);
    }
    let best = null, n = -1, total = 0;
    for (const [i, c] of tally) { total += c; if (c > n) { best = i; n = c; } }
    return best === null ? null : { index: best, share: n / total, sampled: total };
  };

  if (!fs.existsSync(path.join(GAME, "map", "terrain.bmp"))) console.log("  ..   (the base game is not installed)");
  else {
    const van = sampleIndexFor(GAME, "ocean");
    const g = md.graphicalTerrainIndices({ gameRoot: GAME, dependencyRoots: [] });
    console.log(`     base game: ${van.sampled} sampled ocean pixels, commonest index ${van.index} (${(100 * van.share).toFixed(1)}%)`);
    ok((g.get("ocean") || []).includes(van.index),
      `⭐⭐ the index the base game PAINTS its sea with (${van.index}) is one it DECLARES as ocean`, [...(g.get("ocean") || [])]);

    if (!fs.existsSync(path.join(OWB, "common", "terrain"))) console.log("  ..   (Old World Blues is not installed)");
    else {
      const owb = sampleIndexFor(OWB, "ocean");
      console.log(`     Old World Blues: ${owb.sampled} sampled ocean pixels, commonest index ${owb.index} (${(100 * owb.share).toFixed(1)}%)`);
      ok(owb.index !== van.index,
        "⭐⭐ …and OWB, which ships the base game's own 00_terrain.txt, uses a DIFFERENT one — which is why this matters",
        { owb: owb.index, vanilla: van.index });

      // The real overlay shape: an add-on that depends on OWB. Its table is OWB's, not the base game's.
      const addon = mkdtemp("owbaddon");
      fs.writeFileSync(path.join(addon, "descriptor.mod"), 'name="OWB add-on"\n');
      for (const [label, args] of [
        ["editing Old World Blues itself", { modRoot: OWB, gameRoot: GAME, dependencyRoots: [] }],
        ["an add-on that depends on it", { modRoot: addon, gameRoot: GAME, dependencyRoots: [OWB] }],
      ]) {
        const t = md.graphicalTerrainIndices(args);
        const ocean = [...(t.get("ocean") || [])];
        ok(JSON.stringify(ocean) === JSON.stringify([owb.index]),
          `⭐⭐⭐ ${label}: ocean is [${owb.index}], the index OWB's own terrain.bmp uses — and the base game's ${van.index} is not in it`, ocean);
        // …and the base game's ocean index must not have been handed to OWB for something else by accident:
        // whatever category OWB gives it, that is the category this must report.
        const owner = [...t.entries()].filter(([, l]) => l.includes(van.index)).map(([c]) => c);
        ok(!owner.includes("ocean"),
          `…and index ${van.index} is not called ocean here (OWB calls it ${owner.join("/") || "nothing"})`, owner);
      }
    }
  }
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp dir */ } }
console.log(`\n=== the terrain painter reads the file that loads: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
