// #a-lake-is-not-painted-with-the-index-nothing-paints — AND THE REPORT THAT SAID THE OPPOSITE.
//
// 🚨 READ THIS BEFORE "FIXING" IT. A probe measured the built world's lake pixels against the index
// common/terrain declares for `lakes` and found 0.00% agreement — 43.7% index 0, 42.4% index 15, 11.6%
// index 3, and not one pixel of 14 — and filed it as "nothing Nova writes ever gives a lake its own terrain
// index". Run the same probe on the BASE GAME and it scores 0.00% on its own map, with those same three
// numbers. Every shipping map does. The 0% is the convention, not the defect. This file exists so the next
// reader finds that measured rather than re-derives it from a wiki page.
//
// 📊 What the six installed maps actually do (section 1 re-measures all of it from disk):
//
//   • five declare `lakes` at index 14; Old World Blues replaces vanilla's 00_terrain.txt wholesale,
//     declares no `lakes` at all, and gives 14 to its HILLS. So the index is per-mod and a hardcoded 14 is
//     wrong on a map that ships today.
//   • NOT ONE of them paints it. Index 14 appears 0 times in the 11,534,336 pixels of vanilla's, Road to
//     56's, Novum Vexillum's and Rise of Nations' terrain.bmp, and 17 times in Millennium Dawn's — none of
//     those under a lake.
//   • vanilla's own declaration says why: `forest_14 = { type = lakes color = { 14 } texture = 255 }`, the
//     only one of its 25 graphical entries whose texture is not a real texture.
//   • a lake province's pixels carry the GROUND AROUND THEM, unchanged — which is exactly what a province
//     that becomes a lake should end up with.
//
// ⛔ THE REAL FAULT, which is the opposite one and is what this fixes. paintProvincesInTerrainBmp votes for
// the index a category is already painted with on THIS map, and falls back to the first index common/terrain
// declares for a category the map paints nowhere. For a land category that fallback is right — a generated
// world writing `jungle` onto a map that has none has to start somewhere. For water it is not "nowhere yet",
// it is the convention, and `lakes` gets no votes on any map that ships. So a province turned into a lake
// was painted 14: measured, 32 of 32 pixels on the fixture below, pointing every one of them at a texture
// that does not exist. A water category now takes the vote and never the declaration.
//
// ⭐ The vote still wins. A map that really does paint its lakes is followed — ask the mod, not vanilla —
// so this is not a blanket "never paint water", and section 2 pins that distinction.
//
// Run: node test-a-lake-is-not-painted-with-an-index-nothing-paints.js
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lakepaint-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";
const INSTALLED = [
  ["vanilla", GAME], ["Millennium Dawn", WORKSHOP + "/2777392649"], ["Road to 56", WORKSHOP + "/820260968"],
  ["Old World Blues", WORKSHOP + "/2265420196"], ["Novum Vexillum", WORKSHOP + "/1827273767"],
  ["Rise of Nations", WORKSHOP + "/2026448968"],
];

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// 1. THE CORPUS. Every number below is measured from the installed maps here rather than typed in — a
//    constant nobody re-measures is a constant that goes stale, and this whole file exists because a number
//    was read off a declaration instead of off a map.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("=== 1. what the installed maps paint under their own lakes ===");

function bmp(file) {
  const buf = fs.readFileSync(file);
  const bpp = buf.readUInt16LE(28);
  const W = buf.readInt32LE(18);
  return { buf, off: buf.readUInt32LE(10), W, H: buf.readInt32LE(22), bpp, row: Math.floor((bpp * W + 31) / 32) * 4 };
}
const px = (b, x, y, ch) => b.buf[b.off + (b.H - 1 - y) * b.row + x * (b.bpp / 8) + (ch || 0)];

/** The painter's OWN vote rule, replayed over a whole shipping map: per category, which index does this map
 *  already paint it with, counting a pixel only where its index maps back to that same category. */
function surveyOf(root) {
  const eff = (rel) => (fs.existsSync(path.join(root, rel)) ? path.join(root, rel) : path.join(GAME, rel));
  const need = ["map/definition.csv", "map/provinces.bmp", "map/terrain.bmp"].map(eff);
  if (!need.every((p) => fs.existsSync(p))) return null;
  const arg = { modRoot: root, gameRoot: GAME, dependencyRoots: [] };
  const declared = md.graphicalTerrainIndices(arg);
  const water = md.waterTerrainCategories(arg);
  const catOfIndex = new Map();
  for (const [cat, list] of declared) for (const i of list) if (!catOfIndex.has(i)) catOfIndex.set(i, cat);

  const byColour = new Map();
  for (const line of fs.readFileSync(need[0], "utf8").split(/\r?\n/)) {
    const c = line.split(";");
    if (c.length < 8 || !/^[0-9]+$/.test(c[0])) continue;
    byColour.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0,
      { type: (c[4] || "").trim().toLowerCase(), terrain: (c[6] || "").trim().toLowerCase() });
  }

  let P, T;
  try { P = bmp(need[1]); T = bmp(need[2]); } catch (_) { return null; }
  if (P.W !== T.W || P.H !== T.H) return null;

  const votes = new Map();     // category -> Map(index -> count)   — the painter's rule
  const seat = new Map();      // category -> { n, right }          — agreement over its own rows
  const whole = new Uint32Array(256);
  for (let y = 0; y < P.H; y++) for (let x = 0; x < P.W; x++) {
    const idx = px(T, x, y);
    whole[idx]++;
    const m = byColour.get(((px(P, x, y, 2) << 16) | (px(P, x, y, 1) << 8) | px(P, x, y, 0)) >>> 0);
    if (!m || !m.terrain) continue;
    let s = seat.get(m.terrain); if (!s) { s = { n: 0, right: 0 }; seat.set(m.terrain, s); }
    s.n++;
    const d = declared.get(m.terrain);
    if (d && d.includes(idx)) s.right++;
    if (catOfIndex.get(idx) !== m.terrain) continue;
    if (!votes.has(m.terrain)) votes.set(m.terrain, new Map());
    const h = votes.get(m.terrain);
    h.set(idx, (h.get(idx) || 0) + 1);
  }
  return { declared, water, votes, seat, whole, pixels: P.W * P.H };
}

let sawAMap = false, sawALakeDeclarer = false, sawANonDeclarer = false;
const lakeIndices = new Set();
for (const [name, root] of INSTALLED) {
  const s = surveyOf(root);
  if (!s) { console.log("  ~~   " + name + " is not installed — nothing measured from it"); continue; }
  sawAMap = true;

  const waterCats = [...s.declared.keys()].filter((c) => s.water.has(c));
  const landCats = [...s.declared.keys()].filter((c) => !s.water.has(c));
  const lakeDecl = s.declared.get("lakes");
  if (lakeDecl && lakeDecl.length) { sawALakeDeclarer = true; for (const i of lakeDecl) lakeIndices.add(i); }
  else sawANonDeclarer = true;

  // (a) every map paints its OCEAN, so the vote answers and the narrowing leaves the sea alone.
  const oceanVotes = s.votes.get("ocean");
  rec(name + ": the vote answers for `ocean`, so a new sea still follows this map",
    !!(oceanVotes && oceanVotes.size),
    oceanVotes ? [...oceanVotes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([i, c]) => i + "x" + c).join(" ") : "NO VOTES");

  // (b) …and no map paints its LAKES, so for that one the fallback would have invented a number.
  if (lakeDecl && lakeDecl.length) {
    const lakeVotes = s.votes.get("lakes");
    rec(name + ": declares `lakes` " + lakeDecl.join("/") + " and votes for it NOWHERE",
      !(lakeVotes && lakeVotes.size),
      "whole-bitmap count of " + lakeDecl.join("/") + ": " + lakeDecl.map((i) => i + "x" + s.whole[i]).join(" ") + " of " + s.pixels + " px");

    // (c) the outlier, stated against this map's OWN land categories rather than a typed threshold: every
    //     land category agrees with its declaration far more often than `lakes` does.
    const lake = s.seat.get("lakes");
    if (lake && lake.n) {
      const landAgreement = landCats.map((c) => s.seat.get(c)).filter((e) => e && e.n > 1000).map((e) => e.right / e.n);
      const worstLand = landAgreement.length ? Math.min(...landAgreement) : null;
      rec(name + ": its lake rows agree with the `lakes` declaration less than its WORST land category does",
        worstLand != null && lake.right / lake.n < worstLand,
        "lakes " + (100 * lake.right / lake.n).toFixed(2) + "% over " + lake.n + " px, worst land " +
        (worstLand == null ? "n/a" : (100 * worstLand).toFixed(2) + "%"));
    }
  } else {
    rec(name + ": declares NO `lakes` — a hardcoded lakes index would be wrong here", true,
      "declares: " + [...s.declared.keys()].join(", "));
  }

  // (d) the one water set both the row side and the paint side are asked, on a real map.
  const palette = md.generatedTerrainPalette({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
  rec(name + ": generatedTerrainPalette offers no water category",
    palette.every((c) => !s.water.has(c)) && waterCats.length > 0,
    "water " + waterCats.join(",") + " | palette " + palette.join(","));
}
if (!sawAMap) console.log("  ⚠️  NO MAP IS INSTALLED — section 1 measured nothing. That is not a pass.");
if (sawALakeDeclarer && sawANonDeclarer) {
  console.log("  ⓘ  the corpus disagrees about `lakes` (declared at " + [...lakeIndices].join("/") +
    " by some maps, not declared at all by others) — which is why the index is read per mod and never typed in.");
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// 2. THE WRITER. A fixture strip, so this half runs with nothing installed.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 2. what Nova paints when a province becomes a lake ===");

const W = 40, H = 8;
const idAtX = (x) => (x < 4 ? 1 : x < 32 ? 2 + Math.floor((x - 4) / 4) : 9);
const COL = {}; for (let i = 1; i <= 9; i++) COL[i] = [i * 20, i * 5, i * 9];
const IRS = Math.floor((8 * W + 31) / 32) * 4;

/** `table` is category → index; `kinds` is province id → land|sea|lake; `paint` decides each column's
 *  starting terrain index. Vanilla's own shape by default, lakes entry and texture 255 included. */
function makeMod(tag, table, kinds, paint, terrainOf) {
  const root = fs.mkdtempSync(path.join(SANDBOX, tag + "-"));
  const waterNames = new Set(["ocean", "lakes"]);
  fs.mkdirSync(path.join(root, "common", "terrain"), { recursive: true });
  fs.writeFileSync(path.join(root, "common", "terrain", "00_terrain.txt"),
    "categories = {\n"
    + Object.keys(table).map((c) => `\t${c} = {${waterNames.has(c) ? " is_water = yes" : ""}${c === "ocean" ? " naval_terrain = yes" : ""} color = { 200 200 100 } }`).join("\n") + "\n}\n"
    + "terrain = {\n"
    + Object.entries(table).map(([c, i]) => `\t${c}_g = { type = ${c} color = { ${i} } texture = ${c === "lakes" ? 255 : 1} }`).join("\n") + "\n}\n");
  fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="' + tag + '"\n');
  fs.mkdirSync(path.join(root, "map"), { recursive: true });

  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const b24 = Buffer.alloc(54 + imageSize);
  b24.write("BM", 0, "ascii");
  b24.writeUInt32LE(54 + imageSize, 2); b24.writeUInt32LE(54, 10); b24.writeUInt32LE(40, 14);
  b24.writeInt32LE(W, 18); b24.writeInt32LE(H, 22); b24.writeUInt16LE(1, 26);
  b24.writeUInt16LE(24, 28); b24.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[idAtX(x)]; b24[o++] = c[2]; b24[o++] = c[1]; b24[o++] = c[0]; } }
  fs.writeFileSync(path.join(root, "map", "provinces.bmp"), b24);

  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let i = 1; i <= 9; i++) {
    const t = kinds[i];
    rows.push(`${i};${COL[i][0]};${COL[i][1]};${COL[i][2]};${t};${t === "land" ? "true" : "false"};${terrainOf(i)};${t === "land" ? 1 : 0}`);
  }
  fs.writeFileSync(path.join(root, "map", "definition.csv"), rows.join("\n") + "\n");

  const indexed = (fill) => {
    const isz = IRS * H;
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
  fs.writeFileSync(path.join(root, "map", "heightmap.bmp"), indexed((x) => (kinds[idAtX(x)] === "land" ? 106 : 89)));
  fs.writeFileSync(path.join(root, "map", "terrain.bmp"), indexed((x) => paint(idAtX(x))));
  fs.mkdirSync(path.join(root, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(root, "history", "states", "1-a.txt"),
    "state = {\n\tid = 1\n\tname = \"S\"\n\tprovinces = { " + Object.keys(kinds).filter((i) => kinds[i] === "land").join(" ") + " }\n}\n");
  return root;
}

/** every terrain.bmp index under province `id`, commonest first */
const paintOf = (root, id) => {
  const t = fs.readFileSync(path.join(root, "map", "terrain.bmp"));
  const off = t.readUInt32LE(10);
  const seen = new Map();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (idAtX(x) !== id) continue;
    const i = t[off + (H - 1 - y) * IRS + x];
    seen.set(i, (seen.get(i) || 0) + 1);
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]);
};
const retype = (root, id, type, terrain) => {
  const p = path.join(root, "map", "definition.csv");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").split("\n").map((l) => (l.split(";")[0] === String(id)
    ? l.split(";").map((c, i) => (i === 4 ? type : i === 5 ? "false" : i === 6 ? terrain : i === 7 ? (type === "land" ? "1" : "0") : c)).join(";")
    : l)).join("\n"));
};

const VANILLA_SHAPED = { plains: 0, forest: 1, desert: 3, urban: 13, lakes: 14, ocean: 15 };
const NO_LAKES = { plains: 0, forest: 1, desert: 3, urban: 13, ocean: 15 };
const ALL_LAND_SEA = { 1: "sea", 2: "sea", 3: "land", 4: "land", 5: "land", 6: "land", 7: "land", 8: "sea", 9: "sea" };
const groundPaint = (table) => (id) => (ALL_LAND_SEA[id] === "land" ? table.plains : table.ocean);
const groundTerrain = (id) => (ALL_LAND_SEA[id] === "land" ? "plains" : "ocean");

// (a) ⛔ THE FIX. A land province turned into a lake keeps the ground it had — not index 14.
{
  const root = makeMod("lake", VANILLA_SHAPED, ALL_LAND_SEA, groundPaint(VANILLA_SHAPED), groundTerrain);
  const before = paintOf(root, 4);
  retype(root, 4, "lake", "lakes");
  const r = md.sinkProvincesInHeightmap({ modRoot: root, gameRoot: null, dependencyRoots: [], provinceIds: [4] });
  const after = paintOf(root, 4);
  rec("a province turned into a lake keeps the paint it had",
    JSON.stringify(after) === JSON.stringify(before), "before " + JSON.stringify(before) + " after " + JSON.stringify(after));
  rec("…and no pixel of it carries the declared lakes index " + VANILLA_SHAPED.lakes,
    after.every(([i]) => i !== VANILLA_SHAPED.lakes), JSON.stringify(after));
  rec("…and the painter says WHY, without claiming the map is missing a terrain it ships",
    !!(r.terrain && Array.isArray(r.terrain.keptAsIs) && r.terrain.keptAsIs.includes("lakes") && !r.terrain.unknown),
    r.terrain);
}

// (b) THE SIBLING MUST STILL WORK. A province turned into SEA is painted the map's own ocean index — the
//     vote answers there, so the narrowing must not have taken the sea with it.
{
  const root = makeMod("sea", VANILLA_SHAPED, ALL_LAND_SEA, groundPaint(VANILLA_SHAPED), groundTerrain);
  retype(root, 4, "sea", "ocean");
  md.sinkProvincesInHeightmap({ modRoot: root, gameRoot: null, dependencyRoots: [], provinceIds: [4] });
  const after = paintOf(root, 4);
  rec("a province turned into sea is still painted this map's ocean index",
    after.length === 1 && after[0][0] === VANILLA_SHAPED.ocean, JSON.stringify(after));
}

// (c) ⭐ ASK THE MOD, NOT VANILLA. A map that really DOES paint its lakes is followed — this is not a
//     blanket "never paint water". Province 8 is an existing lake already painted with the lakes index, so
//     the vote has something to find.
{
  const kinds = { ...ALL_LAND_SEA, 8: "lake" };
  const root = makeMod("lakepainter", VANILLA_SHAPED, kinds,
    (id) => (kinds[id] === "lake" ? VANILLA_SHAPED.lakes : kinds[id] === "land" ? VANILLA_SHAPED.plains : VANILLA_SHAPED.ocean),
    (id) => (kinds[id] === "lake" ? "lakes" : kinds[id] === "land" ? "plains" : "ocean"));
  retype(root, 4, "lake", "lakes");
  md.sinkProvincesInHeightmap({ modRoot: root, gameRoot: null, dependencyRoots: [], provinceIds: [4] });
  const after = paintOf(root, 4);
  rec("a map that paints its own lakes IS followed — the vote still wins",
    after.length === 1 && after[0][0] === VANILLA_SHAPED.lakes, JSON.stringify(after));
}

// (d) A MAP THAT DECLARES NO `lakes` AT ALL — Old World Blues' shape. Left alone, and reported as the
//     undeclared category it is rather than as water deliberately kept.
{
  const root = makeMod("nolakes", NO_LAKES, ALL_LAND_SEA, groundPaint(NO_LAKES), groundTerrain);
  const before = paintOf(root, 4);
  retype(root, 4, "lake", "lakes");
  const r = md.sinkProvincesInHeightmap({ modRoot: root, gameRoot: null, dependencyRoots: [], provinceIds: [4] });
  const after = paintOf(root, 4);
  rec("a map that declares no `lakes` is left exactly as it was",
    JSON.stringify(after) === JSON.stringify(before), "before " + JSON.stringify(before) + " after " + JSON.stringify(after));
  rec("…and is reported as an UNDECLARED category, not as water kept on purpose",
    !!(r.terrain && Array.isArray(r.terrain.unknown) && r.terrain.unknown.includes("lakes") && !r.terrain.keptAsIs),
    r.terrain);
}

// (e) THE ROW SIDE AND THE PAINT SIDE ASK ONE QUESTION OF ONE FILE SET. waterTerrainCategories is that
//     question; generatedTerrainPalette is its other caller.
{
  const root = makeMod("pal", VANILLA_SHAPED, ALL_LAND_SEA, groundPaint(VANILLA_SHAPED), groundTerrain);
  const arg = { modRoot: root, gameRoot: null, dependencyRoots: [] };
  const water = md.waterTerrainCategories(arg);
  const palette = md.generatedTerrainPalette(arg);
  rec("waterTerrainCategories reads is_water from the files that LOAD",
    water.has("lakes") && water.has("ocean") && !water.has("plains"), [...water].join(","));
  rec("generatedTerrainPalette is that same set, subtracted",
    palette.length > 0 && palette.every((c) => !water.has(c)), palette.join(","));

  const bare = makeMod("bare", NO_LAKES, ALL_LAND_SEA, groundPaint(NO_LAKES), groundTerrain);
  const bareWater = md.waterTerrainCategories({ modRoot: bare, gameRoot: null, dependencyRoots: [] });
  rec("a mod with no lakes at all yields no `lakes` water category",
    !bareWater.has("lakes") && bareWater.has("ocean"), [...bareWater].join(","));
}

// (f) THE LIVE PRIMITIVE, end to end — flipProvinceToSea is what an erase runs, and its lake branch must
//     land in the same place.
{
  const root = makeMod("flip", VANILLA_SHAPED, ALL_LAND_SEA, groundPaint(VANILLA_SHAPED), groundTerrain);
  const before = paintOf(root, 4);
  md.flipProvinceToSea({ modRoot: root, gameRoot: null, dependencyRoots: [], provinceId: 4, waterType: "lake" });
  const after = paintOf(root, 4);
  rec("flipProvinceToSea's lake branch paints no lakes index either",
    JSON.stringify(after) === JSON.stringify(before) && after.every(([i]) => i !== VANILLA_SHAPED.lakes),
    "before " + JSON.stringify(before) + " after " + JSON.stringify(after));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
process.exit(0);
