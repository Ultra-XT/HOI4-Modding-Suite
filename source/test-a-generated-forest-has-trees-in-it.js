// ⛔ #a-generated-forest-has-no-trees-in-it — A QUARTER OF THE NEW LAND IS FOREST AND NOTHING GREW ON IT.
//
// #drowned-land-keeps-its-forests taught Nova to take vegetation OFF land that drowns, and deliberately
// stopped there: at the time every province Generate land raised was `plains`, and the corpus says the base
// map puts nothing on plains, so the correct write on the raise path was no write. Then
// #a-generated-world-is-one-terrain gave a generated world the corpus TERRAIN mix, and that reasoning stopped
// being true the same day. A forest province with no trees drawn on it is bare ground carrying a forest
// label: the game paints the forest ground texture from terrain.bmp, fights at forest modifiers, and draws
// not one tree.
//
// 📊 Measured 2026-09-17 on the built world the owner has installed (a new mod owning vanilla's
// provinces.bmp → Delete map → Generate land 35% seed 1 → Auto-fix ×2), against the installed base game. The
// unit is a trees.bmp BLOCK whose whole footprint in provinces.bmp is land of ONE terrain:
//
//                          forest blocks   vegetated      jungle blocks   vegetated
//     before                   119,964          0.0%           21,766          0.0%
//     vanilla                   79,643         90.8%           18,582         83.3%
//     after                    119,964         90.8%           21,766         83.3%
//
// …and the mix came out index 6 on 46.4% of the forest blocks, 5 on 27.9%, 0 on 9.2%, 28 on 9.1%, 29 on 7.0%
// — vanilla's own numbers to the decimal, because the mix IS vanilla's, sliced rather than sampled. Blocks
// standing entirely over open water did not move at all: 48 before the change and 48 after, which is 0.038%
// of the vegetated blocks, inside the band the shipping maps sit in (vanilla 0.021%, Road to 56 0.021%, Rise
// of Nations 0.021%, Novum Vexillum 0.038%, Old World Blues 0.063%, Millennium Dawn 1.775%).
//
// WHAT THIS FILE PINS, and why each part is here rather than typed into an assertion:
//   1. the SPECIFICATION, re-derived from the six shipping maps every run — which terrains are WOODY (their
//      commonest index a tree), which index, and that every other category is bare at its modal index — and,
//      on Hearts of Minecraft, that the sampler's woody list is the kit's when a map has woods of its own;
//   2. that the planter plants, in the mix the map BELOW the mod grows, as a texture and not a fill;
//   3. that plains gets nothing HERE, where the map below grows a trace on too few plains blocks to speak for
//      (TREES_STRATUM_MIN_BLOCKS) — where plains does get trees, and where, is pinned by
//      test-a-generated-world-grows-trees-round-its-forests.js (#a-generated-world-grows-trees-only-in-its-forests);
//   4. that it never invents an index the loaded `gfx/entities/trees.gfx` declares no mesh for;
//   5. that a second click writes nothing — nothing crosses the waterline twice;
//   6. that it never paints over vegetation somebody else put there, never over a block that still has water
//      under it, and never over a forest edge the map below has no edge of its own to learn from;
//   7. that header and palette come through byte for byte, at trees.bmp's OWN size.
//
// ⚠️ The measuring kit below is deliberately its own code. A measurement that runs the writer's own helpers
// cannot refute the writer.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const CORPUS = {
  vanilla: GAME,
  "Millennium Dawn": WORKSHOP + "2777392649",
  "Road to 56": WORKSHOP + "820260968",
  "Old World Blues": WORKSHOP + "2265420196",
  "Novum Vexillum": WORKSHOP + "1827273767",
  "Rise of Nations": WORKSHOP + "2026448968",
};
const tmps = [];

// ══ the measuring kit ════════════════════════════════════════════════════════════════════════════════════
// Geometry comes out of each file's OWN header — dataOffset AND the DIB header size, because 40 and 124 both
// appear in this corpus and a header's length is never judged.
function indexed(file) {
  const buf = fs.readFileSync(file);
  const dataOffset = buf.readUInt32LE(10), dib = buf.readUInt32LE(14);
  const W = buf.readInt32LE(18), rawH = buf.readInt32LE(22);
  const H = Math.abs(rawH), up = rawH > 0, rowSize = (W + 3) & ~3;
  return { buf, dataOffset, dib, W, H, up, rowSize,
    off: (x, y) => dataOffset + (up ? (H - 1 - y) : y) * rowSize + x,
    at(x, y) { return this.buf[this.off(x, y)]; },
    palette() { return this.buf.slice(14 + this.dib, this.dataOffset); } };
}
function truecolour(file) {
  const buf = fs.readFileSync(file);
  const dataOffset = buf.readUInt32LE(10), W = buf.readInt32LE(18), rawH = buf.readInt32LE(22);
  const H = Math.abs(rawH), up = rawH > 0, rowSize = Math.floor((24 * W + 31) / 32) * 4;
  return { buf, dataOffset, W, H, up, rowSize,
    key(x, y) { const o = dataOffset + (up ? (H - 1 - y) : y) * rowSize + x * 3;
      return ((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]) >>> 0; } };
}
function byColour(csv) {
  const out = new Map();
  for (const line of fs.readFileSync(csv, "latin1").split(/\r?\n/)) {
    const c = line.trim().split(";");
    if (c.length < 7 || !/^\d+$/.test(c[0])) continue;
    out.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0,
      { id: +c[0], land: (c[4] || "").trim().toLowerCase() === "land", terrain: (c[6] || "").trim().toLowerCase() });
  }
  return out;
}
/** Fold every provinces.bmp pixel into the trees.bmp block covering it, at the scale the two headers give. */
function blockFacts(treesFile, provFile, defFile) {
  const t = indexed(treesFile), p = truecolour(provFile), def = byColour(defFile);
  const n = t.W * t.H;
  const hasLand = new Uint8Array(n), hasWater = new Uint8Array(n);
  const terr = new Array(n).fill(undefined);
  for (let y = 0; y < p.H; y++) {
    const rowBase = Math.min(t.H - 1, Math.floor(y * t.H / p.H)) * t.W;
    for (let x = 0; x < p.W; x++) {
      const rec = def.get(p.key(x, y));
      if (!rec) continue;
      const b = rowBase + Math.min(t.W - 1, Math.floor(x * t.W / p.W));
      if (!rec.land) { hasWater[b] = 1; continue; }
      hasLand[b] = 1;
      if (terr[b] === undefined) terr[b] = rec.terrain; else if (terr[b] !== rec.terrain) terr[b] = null;
    }
  }
  return { t, p, n, hasLand, hasWater, terr,
    index: (b) => t.at(b % t.W, Math.floor(b / t.W)),
    pure: (b, cat) => !!hasLand[b] && !hasWater[b] && terr[b] === cat };
}
/** The index this map uses for "nothing grows here": the modal one under blocks that are entirely water. */
function bareIndexOf(f) {
  const votes = new Map();
  for (let b = 0; b < f.n; b++) { if (f.hasLand[b] || !f.hasWater[b]) continue; const i = f.index(b); votes.set(i, (votes.get(i) || 0) + 1); }
  let bare = -1, best = -1;
  for (const [i, c] of votes) if (c > best || (c === best && i < bare)) { bare = i; best = c; }
  return bare;
}
/** Per terrain: the histogram of indices over blocks that are purely that terrain. */
function histogramsOf(f) {
  const out = new Map();
  for (let b = 0; b < f.n; b++) {
    if (!f.hasLand[b] || f.hasWater[b] || !f.terr[b]) continue;
    const h = out.get(f.terr[b]) || new Map();
    const i = f.index(b);
    h.set(i, (h.get(i) || 0) + 1);
    out.set(f.terr[b], h);
  }
  return out;
}
const modalOf = (h) => { let m = -1, best = -1; for (const [i, n] of h) if (n > best || (n === best && i < m)) { m = i; best = n; } return m; };
const totalOf = (h) => { let s = 0; for (const v of h.values()) s += v; return s; };
const sha = (buf) => crypto.createHash("sha1").update(buf).digest("hex");

// ══ 1. THE SPECIFICATION, RE-DERIVED FROM THE SHIPPING MAPS ══════════════════════════════════════════════
//
// Nothing below is a list. "Which terrains are woody" is asked of each map as "is the modal index under this
// terrain the map's own bare index", and the answer has to come out the same two categories on all six or
// the rule Nova ships is not the corpus's rule. (Woody is not "grows anything": every other terrain grows a
// trace, planted by where it lies — #a-generated-world-grows-trees-only-in-its-forests.)
console.log("\n=== 🌲 what the shipping maps actually grow, asked of each of them ===");
{
  const seen = [];
  let missing = 0;
  for (const [name, root] of Object.entries(CORPUS)) {
    const tr = path.join(root, "map", "trees.bmp");
    const pv = path.join(root, "map", "provinces.bmp");
    const df = path.join(root, "map", "definition.csv");
    if (!fs.existsSync(tr) || !fs.existsSync(pv) || !fs.existsSync(df)) { missing++; continue; }
    const f = blockFacts(tr, pv, df);
    const bare = bareIndexOf(f);
    const hist = histogramsOf(f);
    const grows = [], bareAt = [];
    for (const [cat, h] of hist) {
      if (totalOf(h) < 200) continue;               // too small to speak for itself
      (modalOf(h) !== bare ? grows : bareAt).push(cat);
    }
    grows.sort();
    const plains = hist.get("plains") || new Map();
    const sampled = md.sampleTreesByTerrain(tr, pv, df);
    seen.push({ name, bare, grows, bareAt: bareAt.sort(), plainsGrown: totalOf(plains) - (plains.get(bare) || 0), samplerWoody: sampled && sampled.woody });
    console.log(`     ${name.padEnd(16)} bare=${bare}  woody: ${grows.join(", ") || "(nothing)"}`);
  }
  ok(missing === 0 && seen.length === Object.keys(CORPUS).length,
    "all six shipping maps are installed and were read", { missing, read: seen.length });
  if (seen.length) {
    ok(seen.every((s) => s.grows.join(",") === "forest,jungle"),
      "⭐⭐ on every shipping map the commonest index is a tree on EXACTLY forest and jungle — the woody terrains — and nothing else",
      seen.map((s) => `${s.name}: ${s.grows.join(",")}`));
    // ⚠️ That is this kit's answer, and the kit leaves out a terrain under 200 blocks. The planter asks the sampler, which had no
    // floor at all and called Road to 56's two-block `plain` (index 29 on both) woody — so the fringe and the edge were measured
    // round it. The list the planter uses is pinned here too.
    ok(seen.every((s) => (s.samplerWoody || []).join(",") === "forest,jungle"),
      "⭐⭐ …and so does the sampler the planter asks, on every one of them: two blocks of a terrain are not a vote",
      seen.map((s) => `${s.name}: ${(s.samplerWoody || []).join(",")}`));
    // ⚠️ …which pins the vote's minimum from below only: on the six above even the smallest woody terrain is about 18,500 blocks,
    // so a minimum raised to the stratum floor of 800 passed. Hearts of Minecraft has woods of its own, the smallest its cherry at
    // 741 blocks — so there the sampler's list must be this kit's, terrain for terrain.
    const HOM = WORKSHOP + "2624254320";
    const homFiles = ["trees.bmp", "provinces.bmp", "definition.csv"].map((x) => path.join(HOM, "map", x));
    let homKit = [], homSampler = null, homSmallest = 0;
    if (homFiles.every((x) => fs.existsSync(x))) {
      const g = blockFacts(...homFiles), gb = bareIndexOf(g), gh = histogramsOf(g);
      for (const [cat, h] of gh) if (totalOf(h) >= 200 && modalOf(h) !== gb) homKit.push(cat);
      homKit.sort();
      homSmallest = Math.min(...homKit.map((cat) => totalOf(gh.get(cat))));
      homSampler = (md.sampleTreesByTerrain(...homFiles) || {}).woody || null;
    }
    ok(homKit.length > 2 && JSON.stringify(homSampler) === JSON.stringify(homKit),
      `⭐⭐ …and on Hearts of Minecraft, whose woods are its own, the sampler votes every one of them woody — the smallest is ${homSmallest} blocks`,
      { installed: homFiles.every((x) => fs.existsSync(x)), kit: homKit, sampler: homSampler });
    ok(seen.every((s) => s.bareAt.includes("plains")),
      "⭐ …and plains is bare at its MODAL index on every one of them, which makes it not woody",
      seen.map((s) => `${s.name}: plains bare=${s.bareAt.includes("plains")}`));
    // ⚠️ This file said "plains gets nothing — the old reasoning, still true" and "marsh gets NOTHING" here. Bare at the modal
    // index is not bare: the trace is the forests' fringe, planted by where it lies (#a-generated-world-grows-trees-only-in-its-forests).
    ok(seen.every((s) => s.plainsGrown > 0),
      "⭐ …but not BARE: every one of them grows trees on some of its plains",
      seen.map((s) => `${s.name}: ${s.plainsGrown}`));
    ok(seen.every((s) => !s.grows.includes("marsh")),
      "⭐ …and marsh is not woody either, which the name does not tell you and the corpus does",
      seen.map((s) => s.grows.join(",")));
  }
}

// The declared set, and that it is the reason to filter rather than a decoration.
console.log("\n=== 🌲 an index with no mesh behind it draws nothing, so it is never written ===");
{
  const d = md.declaredTreeIndices({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [] });
  ok(d && d.indices instanceof Set && d.indices.size > 0,
    "the base game's gfx/entities/trees.gfx declares a mesh per index, and they were read", d && { n: d.indices && d.indices.size, file: d.file });
  const tr = path.join(GAME, "map", "trees.bmp");
  if (d && d.indices.size && fs.existsSync(tr)) {
    const f = blockFacts(tr, path.join(GAME, "map", "provinces.bmp"), path.join(GAME, "map", "definition.csv"));
    const bare = bareIndexOf(f);
    const hist = histogramsOf(f);
    const used = new Set();
    for (const cat of ["forest", "jungle"]) for (const i of (hist.get(cat) || new Map()).keys()) if (i !== bare) used.add(i);
    const undeclared = [...used].filter((i) => !d.indices.has(i));
    ok(undeclared.length === 0,
      "⭐⭐ every index vanilla's own forest and jungle use IS declared — the filter costs vanilla nothing", { used: [...used].sort((a, b) => a - b), undeclared });
    // …and it is not vacuous: a shipping mod does carry indices nothing declares.
    const mdRoot = CORPUS["Millennium Dawn"];
    if (fs.existsSync(path.join(mdRoot, "map", "trees.bmp"))) {
      const g = blockFacts(path.join(mdRoot, "map", "trees.bmp"), path.join(mdRoot, "map", "provinces.bmp"), path.join(mdRoot, "map", "definition.csv"));
      const gb = bareIndexOf(g);
      const gh = histogramsOf(g).get("forest") || new Map();
      const loose = [...gh.keys()].filter((i) => i !== gb && !d.indices.has(i));
      ok(loose.length > 0,
        "⭐ …and the filter is not vacuous: Millennium Dawn's forest carries indices no mesh is declared for", { distinct: gh.size, undeclared: loose.length });
    }
  }
}

// ══ 2. THE BEHAVIOUR, on a fixture whose every expected byte can be stated ═══════════════════════════════
//
// 240x80 provinces, trees.bmp at 120x40 — HALF the width and HALF the height, so one block covers a 2x2
// square of province pixels and a writer that assumed the two files were the same size addresses the wrong
// bytes. The fixture's bare index is 7, not 0, so a writer that types vanilla's 0 fails here. The base map's
// forest carries index 99 as well, which its gfx declares no mesh for: it must never be copied forward.
const SEA_LEVEL = md.HEIGHTMAP_SEA_LEVEL, SEA_VALUE = md.HEIGHTMAP_SEA_VALUE;
const FIX_W = 240, FIX_H = 80, TR_W = 120, TR_H = 40;
const BARE = 7, UNDECLARED = 99;
// eight vertical bands of 30 px; band k is province k+1. 30 px = 15 whole blocks, so no band straddles —
// ⚠️ EXCEPT ONE, MADE TO STRADDLE ON PURPOSE. Province 5 starts one pixel late, so block 60 covers province 4
// and province 5 at once. A block carries ONE index for the 2x2 province pixels under it, so a block
// straddling forest and plains is a forest EDGE, planted only from the edge mix the map below grows — and
// this map below has no edge anywhere, so without a straddle in the fixture that refusal cannot be told
// from a gate that is not there.
const BAND = 30;
const STRADDLE_BX = 60;
const provAtX = (x) => (x === 4 * BAND ? 4 : Math.min(8, Math.floor(x / BAND) + 1));
const COL = {};
for (let i = 1; i <= 8; i++) COL[i] = [i * 11, 200 - i * 7, 30 + i * 5];

function bmp8(width, height, indexFn, paletteSalt) {
  const rowSize = (width + 3) & ~3, imageSize = rowSize * height, dataOffset = 54 + 256 * 4;
  const buf = Buffer.alloc(dataOffset + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(dataOffset, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(8, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34); buf.writeUInt32LE(256, 46);
  const s = paletteSalt | 0;
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; buf[o] = (i * 7 + s) & 0xff; buf[o + 1] = (255 - i + s) & 0xff; buf[o + 2] = (i + s) & 0xff; buf[o + 3] = 0; }
  for (let y = 0; y < height; y++) { const row = dataOffset + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) buf[row + x] = indexFn(x, y) & 0xff; }
  return buf;
}
function provincesBmp() {
  const rowSize = (FIX_W * 3 + 3) & ~3, imageSize = rowSize * FIX_H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(FIX_W, 18); bmp.writeInt32LE(FIX_H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < FIX_H; y++) { let p = 54 + (FIX_H - 1 - y) * rowSize; for (let x = 0; x < FIX_W; x++) { const c = COL[provAtX(x)]; bmp[p++] = c[2]; bmp[p++] = c[1]; bmp[p++] = c[0]; } }
  return bmp;
}
// What the BASE map grows on forest. Sixteen slots, one of which is an index nothing declares a mesh for.
//   6 ×8   5 ×4   28 ×2   BARE ×1   UNDECLARED ×1
const BASE_FOREST = (slot) => (slot < 8 ? 6 : slot < 12 ? 5 : slot < 14 ? 28 : slot === 14 ? BARE : UNDECLARED);
function baseTreeAt(bx, by) {
  const x = bx * 2, prov = provAtX(x), slot = (bx * 7 + by * 5) % 16;
  if (prov === 1 || prov === 2) return BASE_FOREST(slot);                     // forest, a real mix
  // ⚠️ PLAINS CARRIES A TRACE, because the corpus does — 1.0% of vanilla's pure-plains blocks are vegetated,
  // 11.0% of Millennium Dawn's. But on 600 blocks, fewer than a sample needs to speak for plains anywhere else
  // (TREES_STRATUM_MIN_BLOCKS), so this map's answer for plains is "too few to say", and a fixture whose plains
  // were 100% bare could not tell that refusal from "there was nothing to plant".
  if (prov === 3) return slot === 0 ? 6 : BARE;
  return BARE;                                                                // every kind of water
}

/**
 * base   = the layer BELOW the mod: a WHOLE map (trees + provinces + definition) plus a trees.gfx
 * mod    = provinces.bmp, definition.csv, heightmap.bmp; NO trees.bmp until the planter gives it one
 *   provinces 1,2 land forest · 3 land plains · 4..8 sea in the base
 *   the mod retypes 4 → land forest, 5 → land plains, and leaves 6,7,8 at sea
 */
function makeFixture(opts) {
  const o = opts || {};
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-plant-mod-")); tmps.push(d);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "nova-plant-base-")); tmps.push(base);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="Plant"\n');
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.mkdirSync(path.join(base, "map"), { recursive: true });
  fs.mkdirSync(path.join(base, "gfx", "entities"), { recursive: true });

  const baseRow = (id, type, terrain) => `${id};${COL[id][0]};${COL[id][1]};${COL[id][2]};${type};false;${terrain};${type === "land" ? 1 : 0}`;
  const baseDef = ["0;0;0;0;land;false;unknown;0",
    baseRow(1, "land", "forest"), baseRow(2, "land", "forest"), baseRow(3, "land", "plains"),
    baseRow(4, "sea", "ocean"), baseRow(5, "sea", "ocean"), baseRow(6, "sea", "ocean"),
    baseRow(7, "sea", "ocean"), baseRow(8, "sea", "ocean")].join("\n") + "\n";
  const modDef = ["0;0;0;0;land;false;unknown;0",
    baseRow(1, "land", "forest"), baseRow(2, "land", "forest"), baseRow(3, "land", "plains"),
    baseRow(4, "land", "forest"), baseRow(5, "land", "plains"), baseRow(6, "sea", "ocean"),
    baseRow(7, "sea", "ocean"), baseRow(8, "sea", "ocean")].join("\n") + "\n";

  const prov = provincesBmp();
  fs.writeFileSync(path.join(base, "map", "provinces.bmp"), prov);
  fs.writeFileSync(path.join(base, "map", "definition.csv"), baseDef);
  fs.writeFileSync(path.join(base, "map", "trees.bmp"), bmp8(TR_W, TR_H, baseTreeAt, 0));
  fs.writeFileSync(path.join(base, "gfx", "entities", "trees.gfx"), o.noGfx ? "objectTypes = {\n}\n" :
    // ⚠️ a COMMENTED-OUT mesh is not a declaration, and 99 is commented out here on purpose.
    ["objectTypes = {",
      '\tpdxmesh = { name = "mapobject_5"  file = "gfx/models/a.mesh" }',
      '\tpdxmesh = { name = "mapobject_6"  file = "gfx/models/b.mesh" }',
      '\tpdxmesh = { name = "mapobject_28" file = "gfx/models/c.mesh" }',
      `#\tpdxmesh = { name = "mapobject_${UNDECLARED}" file = "gfx/models/ghost.mesh" }`,
      "}"].join("\n") + "\n");
  if (o.noGfx) fs.writeFileSync(path.join(base, "gfx", "entities", "trees.gfx"), "objectTypes = {\n}\n");

  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), prov);
  fs.writeFileSync(path.join(d, "map", "definition.csv"), modDef);
  // the base's water sits AT the sea value, its land above it, so raising 4 and 5 really crosses.
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"),
    bmp8(FIX_W, FIX_H, (x) => (provAtX(x) >= 4 ? SEA_VALUE : SEA_LEVEL + 11), 0));
  if (o.treesInMod) fs.writeFileSync(path.join(d, "map", "trees.bmp"), bmp8(TR_W, TR_H, baseTreeAt, o.otherPalette ? 33 : 0));
  return { d, base };
}
const raise = (f, ids) => md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: f.base, dependencyRoots: [], provinceIds: ids || [4, 5], raise: true });
// ⚠️ Read through the file the mod EFFECTIVELY has. Backing the fix out leaves no mod copy, and a test that
// throws there reports one crash instead of the dozen things that stopped being true — a back-out control has
// to survive the back-out to be read.
const effectiveTrees = (f) => path.join(fs.existsSync(path.join(f.d, "map", "trees.bmp")) ? f.d : f.base, "map", "trees.bmp");

console.log("\n=== 🌲 the planter plants, in the mix the map BELOW the mod grows ===");
let PLANTED_SHA = "";
{
  const f = makeFixture();
  const baseTrees = fs.readFileSync(path.join(f.base, "map", "trees.bmp"));
  const up = raise(f);
  const tr = up.trees || {};
  ok(up.changed === true, "raising the two sea provinces changed the map", up.error || up.reason || up);
  ok(tr.changed === true && tr.planted === true, "⭐ …and trees.bmp was PLANTED beside the heightmap", tr);
  ok(tr.width === TR_W && tr.height === TR_H,
    "⭐ the writer worked at trees.bmp's OWN size, not provinces.bmp's", { got: [tr.width, tr.height], provinces: [FIX_W, FIX_H] });
  ok(tr.bare === BARE, "⭐ the bare index was VOTED for by the map below, not typed as 0", { got: tr.bare, fixture: BARE });
  ok(tr.materialized === true && fs.existsSync(path.join(f.d, "map", "trees.bmp")),
    "…and the mod took its own copy, because you cannot plant into a file you do not own", tr);

  const after = indexed(effectiveTrees(f));
  PLANTED_SHA = sha(after.buf);
  const src = indexed(path.join(f.base, "map", "trees.bmp"));
  ok(after.buf.length === baseTrees.length && Buffer.compare(after.palette(), src.palette()) === 0
    && Buffer.compare(after.buf.slice(0, after.dataOffset), baseTrees.slice(0, src.dataOffset)) === 0,
    `⭐ the first ${src.dataOffset} bytes — header and palette — came through byte-identical`,
    { src: baseTrees.length, out: after.buf.length });

  // What the planter was asked to reproduce, derived from the base map here rather than typed.
  const bf = blockFacts(path.join(f.base, "map", "trees.bmp"), path.join(f.base, "map", "provinces.bmp"), path.join(f.base, "map", "definition.csv"));
  const declared = md.declaredTreeIndices({ modRoot: f.d, gameRoot: f.base, dependencyRoots: [] });
  const want = new Map();
  let wantTotal = 0;
  for (const [i, n] of (histogramsOf(bf).get("forest") || new Map())) {
    if (i !== BARE && !declared.indices.has(i)) continue;      // the filter, applied independently
    want.set(i, n); wantTotal += n;
  }
  ok(declared.indices.has(UNDECLARED) === false && declared.indices.size === 3,
    "⭐ the commented-out mesh is not a declaration — three indices are declared, not four", { got: [...declared.indices].sort((a, b) => a - b) });

  // The mod's own blocks, as the mod's own map now reads.
  const mf = blockFacts(effectiveTrees(f), path.join(f.d, "map", "provinces.bmp"), path.join(f.d, "map", "definition.csv"));
  const got = new Map();
  let gotTotal = 0, grown = 0;
  const p4x = 3 * BAND;                                        // province 4's own band
  for (let b = 0; b < mf.n; b++) {
    const bx = b % TR_W;
    if (bx * 2 < p4x || bx * 2 >= p4x + BAND) continue;         // province 4 alone
    const i = mf.index(b);
    got.set(i, (got.get(i) || 0) + 1); gotTotal++;
    if (i !== BARE) grown++;
  }
  ok(gotTotal > 0 && grown > 0, "⭐⭐ the raised FOREST province came up with vegetation on it", { blocks: gotTotal, grown });
  ok(!got.has(UNDECLARED),
    "⭐⭐ …and not one block carries the index nothing declares a mesh for", { got: [...got.keys()].sort((a, b) => a - b) });
  const drift = [];
  for (const [i, n] of want) {
    const wantPct = 100 * n / wantTotal, gotPct = 100 * (got.get(i) || 0) / gotTotal;
    if (Math.abs(wantPct - gotPct) > 1.5) drift.push(`${i}: want ${wantPct.toFixed(1)}% got ${gotPct.toFixed(1)}%`);
  }
  ok(drift.length === 0, "⭐⭐⭐ …and in the MIX the map below grows, index by index, to within 1.5 points", drift);
  ok((got.get(BARE) || 0) > 0,
    "⭐ …with the gaps kept: the bare index is part of the mix, and a fill with no gaps is as wrong as a gap with no fill",
    { bare: got.get(BARE) || 0, of: gotTotal });

  // A texture, not a fill: neighbours agree far more often than independent draws would, and far less than always.
  let pairs = 0, same = 0;
  for (let b = 0; b < mf.n; b++) {
    const bx = b % TR_W;
    if (bx * 2 < p4x || (bx + 1) * 2 >= p4x + BAND) continue;
    pairs++; if (mf.index(b) === mf.index(b + 1)) same++;
  }
  let indep = 0;
  for (const n of got.values()) indep += (n / gotTotal) ** 2;
  const agree = pairs ? same / pairs : 0;
  ok(pairs > 0 && agree > indep + 0.15 && agree < 0.97,
    "⭐⭐ it came out as PATCHES, not confetti and not a solid fill", { agree: +agree.toFixed(3), independent: +indep.toFixed(3), pairs });

  // Plains. The map below DOES grow a trace on plains, so what excludes it is that the trace is on fewer blocks
  // than a sample needs to speak for plains somewhere else, not that it had nothing to offer. ⚠️ This said "the
  // modal index is bare, so nothing" until #a-generated-world-grows-trees-only-in-its-forests: bare at the modal
  // index is not bare, and test-a-generated-world-grows-trees-round-its-forests.js pins where plains DOES grow.
  let plainsBlocks = 0, plainsGrown = 0;
  const p5x = 4 * BAND;
  for (let b = 0; b < mf.n; b++) {
    const bx = b % TR_W;
    if (bx === STRADDLE_BX) continue;                           // half of that block is province 4
    if (bx * 2 < p5x || bx * 2 >= p5x + BAND) continue;
    plainsBlocks++; if (mf.index(b) !== BARE) plainsGrown++;
  }
  ok(plainsBlocks > 0 && plainsGrown === 0,
    "⭐⭐ the raised PLAINS province got nothing — the map below has too few plains blocks to speak for it",
    { blocks: plainsBlocks, grown: plainsGrown });
  const plainsSample = histogramsOf(bf).get("plains") || new Map();
  ok(totalOf(plainsSample) > 0 && (plainsSample.get(BARE) || 0) < totalOf(plainsSample) && totalOf(plainsSample) < md.TREES_STRATUM_MIN_BLOCKS,
    "…and the map below really did grow something on plains, on fewer blocks than TREES_STRATUM_MIN_BLOCKS — so that refusal was the FLOOR and not an empty bag",
    { of: totalOf(plainsSample), bare: plainsSample.get(BARE) || 0, floor: md.TREES_STRATUM_MIN_BLOCKS });

  // A block with forest and another land terrain under it carries one index for both: a forest EDGE, planted from the edge mix
  // the map below grows. ⚠️ This said "one index covers both, so it is nobody's to write" until
  // #a-generated-world-grows-trees-only-in-its-forests, and vanilla vegetates 48.8% of such blocks. This map below has no edge
  // at all (its forest ends on a block boundary), so there is nothing to learn one from and the straddle stays bare.
  let belowEdges = 0;
  for (let b = 0; b < bf.n; b++) if (bf.hasLand[b] && !bf.hasWater[b] && bf.terr[b] === null) belowEdges++;
  const straddled = [];
  for (let by = 0; by < TR_H; by++) if (after.at(STRADDLE_BX, by) !== BARE) straddled.push([STRADDLE_BX, by, after.at(STRADDLE_BX, by)]);
  ok(belowEdges === 0 && straddled.length === 0,
    "⭐⭐ the block STRADDLING the raised forest and the raised plains was left alone: the map below has no forest edge to learn one from",
    { belowEdges, straddled: straddled.slice(0, 6) });

  // Nothing that did not cross was touched: the base's own forest keeps its bytes, index 99 included.
  const untouched = [];
  for (let b = 0; b < mf.n; b++) {
    const bx = b % TR_W, by = Math.floor(b / TR_W);
    if (bx * 2 >= p4x) continue;                                // bands 1..3 did not cross
    if (after.at(bx, by) !== src.at(bx, by)) untouched.push(`(${bx},${by}) ${src.at(bx, by)} -> ${after.at(bx, by)}`);
  }
  ok(untouched.length === 0,
    "⭐⭐ nothing that did not cross the waterline moved — the base forest keeps every byte, index 99 and all",
    untouched.slice(0, 8));
  // …and the water the raise did not reach is still bare.
  let afloat = 0;
  for (let b = 0; b < mf.n; b++) if (!mf.hasLand[b] && mf.hasWater[b] && mf.index(b) !== BARE) afloat++;
  ok(afloat === 0, "⭐⭐ not one block standing entirely over open water gained vegetation", afloat);
}

console.log("\n=== 🌲 the second click writes nothing: nothing crosses the waterline twice ===");
{
  const f = makeFixture();
  const first = raise(f);
  ok(!!(first.trees && first.trees.changed) === true, "the first click planted", first.trees);
  const afterFirst = sha(fs.readFileSync(effectiveTrees(f)));
  const second = raise(f);
  const afterSecond = sha(fs.readFileSync(effectiveTrees(f)));
  ok(!!(second.trees && second.trees.changed) === false,
    "⭐⭐ the second click reports no change", second.trees);
  ok(afterFirst === afterSecond, "⭐⭐⭐ …and the file on disk is byte-identical", { afterFirst, afterSecond });
}

console.log("\n=== 🌲 the same map plants the same forest every time it is asked ===");
{
  const a = makeFixture(); raise(a);
  const again = sha(fs.readFileSync(effectiveTrees(a)));
  ok(again === PLANTED_SHA && fs.existsSync(path.join(a.d, "map", "trees.bmp")),
    "⭐⭐ a second, independent fixture came out byte-identical — no seed, no clock, no Math.random",
    { again: again.slice(0, 12), first: PLANTED_SHA.slice(0, 12) });
}

console.log("\n=== 🌲 it never paints over vegetation somebody else put there ===");
{
  // The mod already owns a trees.bmp, and it is the base's — so every block the raise would plant on already
  // carries SOMETHING under the base's forest bands and the bare index under the raised bands. Give the
  // raised band vegetation of its own and it must survive.
  const f = makeFixture({ treesInMod: true });
  const mine = indexed(path.join(f.d, "map", "trees.bmp"));
  const buf = Buffer.from(mine.buf);
  const p4x = 3 * BAND, marked = [];
  for (let by = 0; by < TR_H; by++) {
    const bx = Math.floor(p4x / 2) + 3;
    buf[mine.off(bx, by)] = 28; marked.push([bx, by]);
  }
  fs.writeFileSync(path.join(f.d, "map", "trees.bmp"), buf);
  raise(f);
  const after = indexed(path.join(f.d, "map", "trees.bmp"));
  const lost = marked.filter(([bx, by]) => after.at(bx, by) !== 28);
  ok(lost.length === 0, "⭐⭐ every block that already carried vegetation still carries exactly it", lost.slice(0, 6));
}

console.log("\n=== 🌲 an index is a number into a palette, so a different palette is refused ===");
{
  const f = makeFixture({ treesInMod: true, otherPalette: true });
  const before = sha(fs.readFileSync(path.join(f.d, "map", "trees.bmp")));
  const up = raise(f);
  ok(!!(up.trees && up.trees.changed) === false && /palette/.test(String((up.trees || {}).reason || "")),
    "⭐⭐ the map below paints from a different palette, so 6 is a different tree and nothing is written", up.trees);
  ok(sha(fs.readFileSync(path.join(f.d, "map", "trees.bmp"))) === before, "…and the file did not move", before);
}

console.log("\n=== 🌲 with nothing declaring a mesh, it plants nothing at all ===");
{
  const f = makeFixture({ noGfx: true });
  const up = raise(f);
  ok(!!(up.trees && up.trees.changed) === false && /declares/.test(String((up.trees || {}).reason || "")),
    "⭐ an empty trees.gfx means no index draws anything, and an unknown is not a licence to paint", up.trees);
  ok(!fs.existsSync(path.join(f.d, "map", "trees.bmp")), "…and the mod did not acquire a file it cannot fill");
}

// ══ 3. THE PAGE, lifted and RUN — a source-shape assertion is not a control ══════════════════════════════
//
// The sentence this section is about is the ONLY thing that tells a modder what happened to their vegetation.
// It said "was cleared" whichever way the writer ran, so a click that planted a hundred thousand blocks of
// forest reported the opposite of what it did.
console.log("\n=== 🌲 the page says which way the vegetation went ===");
{
  // 🈯 Lifted CRLF-tolerantly on purpose: a fresh worktree checks out CRLF while D:/Nova's copy is LF, and a
  // bare-newline anchor finds nothing in one of them while reporting success.
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
  const s0 = MAP.indexOf("function heightmapNote(hm) {");
  const body = s0 < 0 ? "" : MAP.slice(s0, MAP.indexOf("\n  }\n", s0) + 4);
  let note = null;
  try { note = new Function(body + "\nreturn heightmapNote;")(); } catch (_) { note = null; }
  ok(typeof note === "function", "heightmapNote lifted and runs");
  const call = (trees, raised) => (typeof note === "function"
    ? note({ pixels: 1270, raised, materialized: true, terrain: { pixels: 1270, materialized: true }, trees }) : "");
  const planted = call({ pixels: 129032, planted: true, changed: true, materialized: true }, true);
  ok(/129,032/.test(planted) && /planted/.test(planted) && !/cleared/.test(planted),
    "⭐⭐ a PLANT is reported as planting, and never as clearing", planted);
  ok(/map\/trees\.bmp/.test(planted), "…and still names the file the mod just acquired", planted);
  const cleared = call({ pixels: 99005, changed: true, materialized: true }, false);
  ok(/99,005/.test(cleared) && /cleared/.test(cleared) && !/planted/.test(cleared),
    "⭐⭐ …and a CLEAR is still reported as clearing — the other half did not move", cleared);
  const quiet = call({ changed: false, pixels: 0 }, true);
  ok(!/trees/.test(quiet), "…and a click that touched no vegetation says nothing about any", quiet);
}

console.log("\n=== 🌲 and it will not write into the base game ===");
{
  const plant = md.plantProvincesInTreesBmp;
  ok(typeof plant === "function", "the writer is exported, so a test can drive it directly", typeof plant);
  const call = (args) => { try { return plant(args); } catch (e) { return { changed: null, error: String(e && e.message) }; } };
  const f = makeFixture({ treesInMod: true });
  const r = call({ modRoot: f.base, gameRoot: f.base, dependencyRoots: [], provinceIds: [4],
    crossed: { mask: new Uint8Array(FIX_W * FIX_H), W: FIX_W, H: FIX_H } });
  ok(r.changed === false && /game directory/.test(String(r.error || "")), "refused when the mod IS the game root", r);
  const s = call({ modRoot: f.d, gameRoot: f.base, dependencyRoots: [], provinceIds: [4], crossed: null });
  ok(s.changed === false && /crossed/.test(String(s.reason || "")), "…and with no crossed mask it does nothing at all", s);
  const w = call({ modRoot: f.d, gameRoot: f.base, dependencyRoots: [], provinceIds: [4],
    crossed: { mask: new Uint8Array(4), W: 2, H: 2 } });
  ok(w.changed === false && /different bitmap/.test(String(w.reason || "")),
    "…and a mask built against a different bitmap addresses different pixels, so it is refused", w);
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(fails.length ? `\nFAILED: ${pass} ok, ${fails.length} failed` : `\nPASSED: ${pass} ok, 0 failed`);
for (const f of fails) console.log("  - " + f);
process.exit(fails.length ? 1 : 0);
