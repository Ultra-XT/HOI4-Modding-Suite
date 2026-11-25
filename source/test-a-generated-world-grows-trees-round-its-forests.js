// ⛔ #a-generated-world-grows-trees-only-in-its-forests — A GENERATED WORLD CAME UP BALDER THAN THE MAP IT COPIES.
//
// The planter grew trees only on the terrains whose commonest index below is a tree — forest and jungle — and planted every
// other terrain at 0%, because "modal index bare → plant nothing" vetoed each of them whole. And it skipped every block where a
// forest province meets other land ("one index covers both"). Measured 09-30 on the owner's flow (vanilla → Delete map →
// Generate land 35%, seed 1): plains, hills, mountain, desert, marsh 0.0% vegetated, and the 14,584 blocks where its forests
// meet other land 3.0% (only round its towns; TEST 31, built before those, 0.0% of 14,535) — where vanilla grows 3.2% on plains
// within two blocks of woody land and 0.4% beyond, and 48.8% on its forest edges. After: 3.2% / 0.8% and 50.2%.
//
// One mix per terrain would put the right number of trees in the wrong places: the trace on plains is the forests' FRINGE, not
// a spread. So a non-woody terrain is planted from the layer below's mix for it NEAR woody land or FAR from it, per latitude
// band where the sample is big enough, else that stratum over the whole map, else nothing; and a forest edge is a stratum of
// its own, planted only where all of its land came up in this write.
//
// Pinned on a layer below whose plains are treed beside its forests and bare away from them, and on the real base game:
//   0. the sampler's strata on the base game, block for block, against this file's own count;
//   1. plains trees only within TREES_WOODY_REACH blocks of woody land, at the rate the layer below grows there;
//   2. a stratum too thin in every band is planted from the whole map's; one thick enough in a band from that band's;
//   3. a stratum under TREES_STRATUM_MIN_BLOCKS plants nothing, however much the layer below grows on it;
//   4. the forest edge is planted in the edge's own mix — and left alone where the modder's own forest stands in it;
//   5. forest keeps exactly the bytes it got before, and the same world plants the same bytes every time;
//   6. a town's own ground stays bare (#a-town-in-the-woods-has-trees-round-it), though its stratum below now has a mix;
//   7. a whole-map stratum over the floor whose rest grows at half its rate or less is ONE band's paint: its mix is planted in
//      that band and in no other (Millennium Dawn's desert by the woods: 41.8% against the rest's 16.5%, planted at every latitude);
//   8. a town's forest-painted ring is not the woods the fringe and the edge are measured from — the layer below never saw one;
//   9. a terrain too small to vote (Road to 56's two-block `plain`) is not woody, and moves no fringe round itself;
//  10. paint is a RATE, not where the trees are: a stratum at one rate on ground lying mostly in one band stands in for every
//      band (the 2/3-of-the-trees gate refused vanilla's marsh away from the woods, and left a tropical jungle edge bare);
//  11. one band's paint with a key of its own stands in for no other band either, and the bands too thin to speak are then
//      planted from their own pool where it clears the floor — not the whole-map mix, not nothing, and not a pool with another
//      keyed band's ground in it.
//
// ⚠️ The measuring kit below is its own code. A measurement that runs the writer's own helpers cannot refute the writer.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-tree-fringe-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c === true) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sha = (buf) => crypto.createHash("sha1").update(buf).digest("hex");
const pct = (n, d) => (d ? 100 * n / d : 0);

// The two numbers the rule is made of, read off the module so the fixture is sized off them rather than a typed copy. The
// fallbacks only let the unfixed code run to its failures instead of throwing before it gets there.
ok(Number.isInteger(md.TREES_STRATUM_MIN_BLOCKS) && Number.isInteger(md.TREES_WOODY_REACH),
  "the minimum sample and the fringe's reach are exported", { floor: md.TREES_STRATUM_MIN_BLOCKS, reach: md.TREES_WOODY_REACH });
const FLOOR = Number.isInteger(md.TREES_STRATUM_MIN_BLOCKS) ? md.TREES_STRATUM_MIN_BLOCKS : 800;
const REACH = Number.isInteger(md.TREES_WOODY_REACH) ? md.TREES_WOODY_REACH : 2;
const BANDS = md.LATITUDE_BANDS;
// …and the two that say whether a sample speaks at all: how many times the rest of a stratum's rate its whole-map mix may plant
// the rest, and the fewest blocks a terrain votes woody from.
ok(typeof md.TREES_STRATUM_MAX_STAND_IN_RATIO === "number" && Number.isInteger(md.LATITUDE_TREE_MIN_BLOCKS),
  "the most a whole-map mix may plant the rest of its stratum over the rest's own rate, and the woody vote's minimum, are exported",
  { ratio: md.TREES_STRATUM_MAX_STAND_IN_RATIO, woodyMin: md.LATITUDE_TREE_MIN_BLOCKS });
const RATIO = typeof md.TREES_STRATUM_MAX_STAND_IN_RATIO === "number" ? md.TREES_STRATUM_MAX_STAND_IN_RATIO : 2;
const WOODY_MIN = Number.isInteger(md.LATITUDE_TREE_MIN_BLOCKS) ? md.LATITUDE_TREE_MIN_BLOCKS : 20;

// ══ the measuring kit ═══════════════════════════════════════════════════════════════════════════════════════════════════════
function indexed(file) {
  const buf = fs.readFileSync(file);
  const dataOffset = buf.readUInt32LE(10), W = buf.readInt32LE(18), rawH = buf.readInt32LE(22);
  const H = Math.abs(rawH), up = rawH > 0, rowSize = (W + 3) & ~3;
  return { buf, W, H, at: (x, y) => buf[dataOffset + (up ? (H - 1 - y) : y) * rowSize + x] };
}
function definitions(file) {
  const out = new Map();
  for (const line of fs.readFileSync(file, "latin1").split(/\r?\n/)) {
    const c = line.trim().split(";");
    if (c.length < 7 || !/^\d+$/.test(c[0])) continue;
    out.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0, { land: (c[4] || "").trim().toLowerCase() === "land", t: (c[6] || "").trim().toLowerCase() });
  }
  return out;
}
/** Every trees.bmp block of a whole map: is there land, water, and which land terrains, at the scale the two headers give. */
function blocksOf(treesFile, provFile, defFile) {
  const t = indexed(treesFile), def = definitions(defFile);
  const p = fs.readFileSync(provFile), off = p.readUInt32LE(10), W = p.readInt32LE(18), H = Math.abs(p.readInt32LE(22)), rs = Math.floor((24 * W + 31) / 32) * 4;
  const N = t.W * t.H, land = new Uint8Array(N), water = new Uint8Array(N), cats = new Array(N);
  for (let y = 0; y < H; y++) {
    const rb = Math.min(t.H - 1, Math.floor(y * t.H / H)) * t.W, row = off + (H - 1 - y) * rs;
    for (let x = 0; x < W; x++) {
      const o = row + x * 3, rec = def.get(((p[o + 2] << 16) | (p[o + 1] << 8) | p[o]) >>> 0);
      if (!rec) continue;
      const b = rb + Math.min(t.W - 1, Math.floor(x * t.W / W));
      if (!rec.land) { water[b] = 1; continue; }
      land[b] = 1;
      (cats[b] || (cats[b] = new Set())).add(rec.t);
    }
  }
  return { t, N, TW: t.W, TH: t.H, land, water, cats, idx: (b) => t.at(b % t.W, Math.floor(b / t.W)) };
}
/** The strata, asked the way the rule words them: bare = the modal index under all-water blocks; woody = a terrain whose
 *  modal index under its pure blocks is not bare, over WOODY_MIN of them or more; near = within REACH blocks, along either axis,
 *  of a block holding woody land; an edge = land of a woody terrain and another, no water. Keys "<t>~n", "<t>~f",
 *  "<first woody>~edge", each also "@<band>". */
function strataOf(B) {
  const votes = new Map();
  for (let b = 0; b < B.N; b++) if (!B.land[b] && B.water[b]) { const i = B.idx(b); votes.set(i, (votes.get(i) || 0) + 1); }
  let bare = -1, best = -1;
  for (const [i, n] of votes) if (n > best || (n === best && i < bare)) { bare = i; best = n; }
  const pure = new Map();
  for (let b = 0; b < B.N; b++) {
    if (!B.land[b] || B.water[b] || !B.cats[b] || B.cats[b].size !== 1) continue;
    const t = [...B.cats[b]][0]; if (!t) continue;
    const h = pure.get(t) || new Map(); const i = B.idx(b); h.set(i, (h.get(i) || 0) + 1); pure.set(t, h);
  }
  const woody = [];
  for (const [t, h] of pure) { let m = -1, bb = -1; for (const [i, n] of h) if (n > bb || (n === bb && i < m)) { m = i; bb = n; } if (m !== bare && totalOf(h) >= WOODY_MIN) woody.push(t); }
  woody.sort();
  const holdsWoody = (b) => !!B.cats[b] && woody.some((w) => B.cats[b].has(w));
  const near = new Uint8Array(B.N);
  for (let b = 0; b < B.N; b++) {
    if (!holdsWoody(b)) continue;
    const bx = b % B.TW, by = Math.floor(b / B.TW);
    for (let y = Math.max(0, by - REACH); y <= Math.min(B.TH - 1, by + REACH); y++)
      for (let x = Math.max(0, bx - REACH); x <= Math.min(B.TW - 1, bx + REACH); x++) near[y * B.TW + x] = 1;
  }
  const keyOf = (b) => {
    if (!B.land[b] || B.water[b] || !B.cats[b]) return "";
    if (B.cats[b].size > 1) { const w = woody.find((t) => B.cats[b].has(t)); return w ? w + "~edge" : ""; }
    const t = [...B.cats[b]][0];
    return !t || woody.includes(t) ? "" : t + (near[b] ? "~n" : "~f");
  };
  const hist = new Map();
  const tally = (k, i) => { const h = hist.get(k) || new Map(); h.set(i, (h.get(i) || 0) + 1); hist.set(k, h); };
  for (let b = 0; b < B.N; b++) {
    const k = keyOf(b); if (!k) continue;
    const i = B.idx(b);
    tally(k, i); tally(k + "@" + Math.min(BANDS - 1, Math.floor(BANDS * (Math.floor(b / B.TW) + 0.5) / B.TH)), i);
  }
  return { bare, woody, near, keyOf, hist };
}
const totalOf = (h) => { let s = 0; for (const v of (h || new Map()).values()) s += v; return s; };
/** The stand-in question asked of a stratum (`live` counts the trees in a histogram): the band that grew the most of its trees,
 *  the share of its trees and of its ground that band holds, the whole-map rate, the rate of the REST (every other band), and how
 *  many times the rest's rate the whole-map rate is. */
const standIn = (S, k, live) => {
  let top = 0, topTrees = -1;
  for (let b = 0; b < BANDS; b++) { const t = live(S.hist.get(k + "@" + b)); if (t > topTrees) { top = b; topTrees = t; } }
  const all = live(S.hist.get(k)), n = totalOf(S.hist.get(k)), restN = n - totalOf(S.hist.get(k + "@" + top));
  const whole = pct(all, n), rest = pct(all - topTrees, restN);
  return { top, share: all ? topTrees / all : 0, ground: n ? 1 - restN / n : 0, whole, rest, ratio: rest ? whole / rest : all ? Infinity : 0 };
};
const brief = (s) => ({ top: s.top, share: +s.share.toFixed(3), ground: +s.ground.toFixed(3), whole: +s.whole.toFixed(2), rest: +s.rest.toFixed(2), ratio: +(+s.ratio).toFixed(2) });

// ══ 0. THE SAMPLER'S STRATA ON THE BASE GAME, COUNTED TWICE ═════════════════════════════════════════════════════════════════
console.log("\n=== 🌲 the base game's strata, as the sampler learns them and as this file counts them ===");
{
  const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  const files = ["trees.bmp", "provinces.bmp", "definition.csv"].map((f) => path.join(GAME, "map", f));
  ok(files.every((f) => fs.existsSync(f)), "the base game's map is installed and was read", files.filter((f) => !fs.existsSync(f)));
  if (files.every((f) => fs.existsSync(f))) {
    const mine = strataOf(blocksOf(...files));
    const s = md.sampleTreesByTerrain(...files) || {};
    ok(JSON.stringify(s.woody) === JSON.stringify(mine.woody), "the sampler's woody terrains are the ones whose commonest index is a tree", { sampler: s.woody, kit: mine.woody });
    const theirs = s.byStratum instanceof Map ? s.byStratum : new Map();
    const differ = [];
    for (const k of new Set([...mine.hist.keys(), ...theirs.keys()])) {
      const a = mine.hist.get(k) || new Map(), b = theirs.get(k) || new Map();
      if (a.size !== b.size || [...a].some(([i, n]) => b.get(i) !== n)) differ.push(`${k}: kit ${totalOf(a)} sampler ${totalOf(b)}`);
    }
    ok(mine.hist.size > 0 && differ.length === 0,
      `⭐⭐ every one of the ${mine.hist.size} strata (and stratum-by-band) is the same histogram, index for index, counted twice`, differ.slice(0, 6));
    // …and what they say is the reason for all of it: on every terrain with enough of both to speak for, the near share is
    // more than twice the far one. (The terrains are the ones the floor admits, not a list; a tree is an index the base game's
    // trees.gfx declares a mesh for, read here with comments stripped.)
    const gfx = path.join(GAME, "gfx", "entities", "trees.gfx");
    const meshes = new Set();
    if (fs.existsSync(gfx)) for (const m of fs.readFileSync(gfx, "latin1").split(/\r?\n/).map((l) => l.replace(/#.*$/, "")).join("\n").matchAll(/mapobject_(\d+)/g)) meshes.add(+m[1]);
    const live = (h) => { let n = 0; for (const [i, c] of (h || new Map())) if (i !== mine.bare && meshes.has(i)) n += c; return n; };
    const judged = [];
    for (const k of mine.hist.keys()) {
      if (!k.endsWith("~n")) continue;
      const t = k.slice(0, -2), n = mine.hist.get(k), f = mine.hist.get(t + "~f");
      if (totalOf(n) < FLOOR || totalOf(f) < FLOOR) continue;
      judged.push({ t, near: +pct(live(n), totalOf(n)).toFixed(1), far: +pct(live(f), totalOf(f)).toFixed(1) });
    }
    ok(judged.length >= 3 && judged.every((j) => j.near > 2 * j.far),
      "⭐ vanilla's trees off the woods are its forests' FRINGE: near woody land more than twice the share far from it, on every terrain it has enough of", judged);
    const edge = mine.hist.get("forest~edge");
    ok(totalOf(edge) >= FLOOR && pct(live(edge), totalOf(edge)) > 40,
      "⭐ …and it vegetates its forest EDGE blocks more than two times in five", { blocks: totalOf(edge), vegetated: +pct(live(edge), totalOf(edge)).toFixed(1) });
    // The floor is measured (split halves, see the anchor); these two real samples bracket it. Below: vanilla's city ground by
    // the woods in its southernmost band, four provinces whose trees one mix per band spread over a generated world's towns.
    // Above: its jungle edge, 333 provinces round every jungle it has.
    const thin = mine.hist.get("urban~n@7"), jungleEdge = mine.hist.get("jungle~edge");
    ok(totalOf(thin) > 0 && totalOf(thin) < FLOOR && pct(live(thin), totalOf(thin)) > 20 && totalOf(jungleEdge) >= FLOOR,
      "⭐ the floor refuses a handful of provinces (vanilla's southern city ground by the woods) and admits its jungle edge",
      { thin: [totalOf(thin), +pct(live(thin), totalOf(thin)).toFixed(1)], jungleEdge: totalOf(jungleEdge), floor: FLOOR });
    // A whole-map stratum stands in for a band with too little of it, so it has to be the whole map's mix and not one band's
    // (TREES_STRATUM_MAX_STAND_IN_RATIO, derived — see the anchor). Vanilla's own bracket it: its jungle edge grows at much the
    // same rate across its bands and keeps its whole-map mix; its marsh by the woods grows 13.1% in band 0 and 2.2% in the rest, where
    // the whole-map mix planted 8.6% — one band's paint.
    const je = standIn(mine, "jungle~edge", live), mn = standIn(mine, "marsh~n", live), mf = standIn(mine, "marsh~f", live);
    ok(je.ratio > 0 && je.ratio < RATIO && totalOf(mine.hist.get("marsh~n")) >= FLOOR && mn.ratio >= RATIO,
      "⭐ the stand-in gate admits vanilla's jungle edge and refuses its marsh by the woods, one band's paint",
      { jungleEdge: brief(je), marshNear: brief(mn), ratio: RATIO });
    // …and its marsh AWAY from the woods grew 84% of its trees in band 0 only because band 0 holds 83% of it: 0.8% there and 0.8%
    // in the rest. The 2/3-of-the-trees gate (the share below is that gate's number) refused it, and every band too thin to speak
    // got nothing; asked of rates, it is no band's paint.
    ok(totalOf(mine.hist.get("marsh~f")) >= FLOOR && mf.share >= 2 / 3 && Math.abs(mf.share - mf.ground) < 0.05 && mf.ratio < RATIO,
      "⭐⭐ …and admits its marsh away from the woods: most of its trees are in band 0 because most of its GROUND is",
      { marshFar: brief(mf), ratio: RATIO });
    // …and the case that asked for it: Millennium Dawn's desert by the woods is over the floor, thin in every band, and the rest of
    // it grows 16.5% against the whole-map 41.8% — a generated MD world planted 5,444 desert blocks from it at every latitude where
    // MD shows 350.
    const MDR = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
    const mdFiles = ["trees.bmp", "provinces.bmp", "definition.csv"].map((f) => path.join(MDR, "map", f));
    ok(mdFiles.every((f) => fs.existsSync(f)), "Millennium Dawn's map is installed and was read", mdFiles.filter((f) => !fs.existsSync(f)));
    if (mdFiles.every((f) => fs.existsSync(f))) {
      const mdK = strataOf(blocksOf(...mdFiles));
      const mdLive = (h) => { let c = 0; for (const [i, v] of (h || new Map())) if (i !== mdK.bare && meshes.has(i)) c += v; return c; };
      const bands = Array.from({ length: BANDS }, (_, b) => totalOf(mdK.hist.get("desert~n@" + b)));
      const dn = standIn(mdK, "desert~n", mdLive);
      ok(totalOf(mdK.hist.get("desert~n")) >= FLOOR && bands.every((c) => c < FLOOR) && dn.ratio >= RATIO,
        "⭐⭐ Millennium Dawn's desert by the woods clears the floor, is thin in every band, and its whole-map mix would plant the rest at more than the gate allows over the rest's rate",
        { blocks: totalOf(mdK.hist.get("desert~n")), bands, desertNear: brief(dn), ratio: RATIO });
    }
  }
}

// ══ THE FIXTURE ════════════════════════════════════════════════════════════════════════════════════════════════════════════
//
// Eight provinces in vertical stripes, provinces.bmp twice trees.bmp's size (a block is 2x2 px), TH rows of blocks sized off
// the floor so that each stratum sits on the side of it this file needs:
//     px 0-40 forest · 41-200 plains · 201-240 forest · 241-400 plains · 401-440 forest · 441-559 hills · 560-599 desert ·
//     600-619 sea
// Every forest boundary but the map's own edge falls on an odd pixel, so the block over it holds forest AND the land beside
// it: five edge columns. What the layer below grows (slot = (bx*7 + by*5) % 20, the index where the slot is under the share):
//     forest 6 on 15/20 · edge 5 on 10/20 and 99 — which nothing declares a mesh for, as on 27% of Millennium Dawn's edge
//     blocks — on 5/20 · plains NEAR woody land 28 in the north half, 29 in the south, on 6/20 · plains FAR bare · hills NEAR
//     30 on 8/20 (too few blocks to speak) · hills FAR bare in the north half, 11 on 4/20 in the south · desert (all of it far
//     from the woods, over the floor across the map and under it in every band) 3 on 12/20 in band 2 and bare everywhere else:
//     one band's paint, the shape of Millennium Dawn's desert by the woods
const TW = 310, TH = BANDS * Math.ceil(FLOOR / 32), W = 2 * TW, H = 2 * TH;
const BARE = 7, T_FOREST = 6, T_EDGE = 5, T_NORTH = 28, T_SOUTH = 29, T_HILLS_NEAR = 30, T_HILLS_SOUTH = 11, T_DESERT = 3, UNDECLARED = 99;
const DECLARED = [T_FOREST, T_EDGE, T_NORTH, T_SOUTH, T_HILLS_NEAR, T_HILLS_SOUTH, T_DESERT];
const PROVS = [[1, 0, 41, "forest"], [2, 41, 201, "plains"], [3, 201, 241, "forest"], [4, 241, 401, "plains"], [5, 401, 441, "forest"], [6, 441, 560, "hills"], [8, 560, 600, "desert"], [7, 600, 620, "ocean"]];
const FORESTS = [1, 3, 5], OPEN = [2, 4, 6, 8];
const DESERT_BAND = 2;
const bandOfRow = (by) => Math.min(BANDS - 1, Math.floor(BANDS * (by + 0.5) / TH));
const provAtX = (x) => PROVS.find(([, a, b]) => x >= a && x < b)[0];
const terrainOf = (id) => PROVS.find((p) => p[0] === id)[3];
const colour = (id) => [id * 23, 200 - id * 17, 40 + id * 9];
// Ground truth by construction, per block column: what the two pixels under it are, and how far the nearest forest is.
const colProvs = Array.from({ length: TW }, (_, bx) => [provAtX(2 * bx), provAtX(2 * bx + 1)]);
const colHoldsForest = colProvs.map((ps) => ps.some((p) => terrainOf(p) === "forest"));
const colKind = colProvs.map((ps, bx) => {
  const ts = ps.map(terrainOf);
  if (ts.every((t) => t === "ocean")) return "sea";
  if (ts[0] !== ts[1]) return ts.includes("forest") ? "edge" : "mixed";
  if (ts[0] === "forest") return "forest";
  let near = false;
  for (let c = Math.max(0, bx - REACH); c <= Math.min(TW - 1, bx + REACH); c++) if (colHoldsForest[c]) near = true;
  return ts[0] + (near ? " near" : " far");
});
const north = (by) => by < TH / 2;
function treeBelow(bx, by, onlyForest) {
  const slot = (bx * 7 + by * 5) % 20, k = colKind[bx];
  if (k === "forest") return slot < 15 ? T_FOREST : BARE;
  if (onlyForest) return BARE;
  if (k === "edge") return slot < 10 ? T_EDGE : slot < 15 ? UNDECLARED : BARE;
  if (k === "plains near") return slot < 6 ? (north(by) ? T_NORTH : T_SOUTH) : BARE;
  if (k === "hills near") return slot < 8 ? T_HILLS_NEAR : BARE;
  if (k === "hills far") return !north(by) && slot < 4 ? T_HILLS_SOUTH : BARE;
  if (k === "desert far") return bandOfRow(by) === DESERT_BAND && slot < 12 ? T_DESERT : BARE;
  return BARE;
}
function bmp24(fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
function bmp8(w, h, fn) {
  const rs = (w + 3) & ~3, off = 54 + 1024, b = Buffer.alloc(off + rs * h);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * h, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = 255 - i; b[54 + i * 4 + 2] = (i * 3) & 255; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[off + (h - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const definitionCsv = (extra = []) => ["0;0;0;0;land;false;unknown;0", ...[...PROVS, ...extra].map(([id, , , t]) => `${id};${colour(id).join(";")};${t === "ocean" ? "sea;false;ocean;0" : `land;false;${t};1`}`)].join("\n") + "\n";
const provinces = bmp24((x) => colour(provAtX(x)));
/** The layer below: the whole map, its trees, and a trees.gfx declaring every index the fixture grows. */
function makeBelow(tag, onlyForest) {
  const d = path.join(ROOT, tag);
  write(d, "map/provinces.bmp", provinces);
  write(d, "map/definition.csv", definitionCsv());
  write(d, "map/trees.bmp", bmp8(TW, TH, (bx, by) => treeBelow(bx, by, onlyForest)));
  write(d, "gfx/entities/trees.gfx", ["objectTypes = {", ...DECLARED.map((i) => `\tpdxmesh = { name = "mapobject_${i}" file = "gfx/models/t${i}.mesh" }`), "}", ""].join("\n"));
  return d;
}
/** The mod: the same shapes, a bare trees.bmp of its own (what Delete map leaves), the provinces in `sunk` under the sea. */
function makeMod(tag, sunk) {
  const d = path.join(ROOT, tag);
  write(d, "descriptor.mod", 'name="fringe"\n');
  write(d, "map/provinces.bmp", provinces);
  write(d, "map/definition.csv", definitionCsv());
  write(d, "map/trees.bmp", bmp8(TW, TH, () => BARE));
  write(d, "map/heightmap.bmp", bmp8(W, H, (x) => (sunk.includes(provAtX(x)) || terrainOf(provAtX(x)) === "ocean" ? md.HEIGHTMAP_SEA_VALUE : md.HEIGHTMAP_SEA_LEVEL + 11)));
  return d;
}
const raise = (mod, below, ids) => md.sinkProvincesInHeightmap({ modRoot: mod, gameRoot: below, dependencyRoots: [], provinceIds: ids, raise: true });
/** Per block kind (and north/south, and "@<band>"): blocks, trees (an index a mesh is declared for — the only kind the game
 *  draws), the indices the trees carry, and blocks carrying an index nothing declares. `kindAt` keys a block another way. */
function survey(treesFile, kindAt = (bx) => colKind[bx]) {
  const t = indexed(treesFile), out = {};
  for (let by = 0; by < TH; by++) for (let bx = 0; bx < TW; bx++) {
    const i = t.at(bx, by), kind = kindAt(bx, by);
    for (const k of [kind, kind + (north(by) ? " north" : " south"), kind + "@" + bandOfRow(by)]) {
      const a = out[k] || (out[k] = { blocks: 0, trees: 0, kinds: {}, undeclared: 0 });
      a.blocks++;
      if (DECLARED.includes(i)) { a.trees++; a.kinds[i] = (a.kinds[i] || 0) + 1; } else if (i !== BARE) a.undeclared++;
    }
  }
  return out;
}
const share = (a) => (a ? pct(a.trees, a.blocks) : 0);
const onlyKinds = (a, list) => !!a && Object.keys(a.kinds).every((k) => list.includes(+k));

const below = makeBelow("below", false);
const want = survey(path.join(below, "map", "trees.bmp"));
const kit = strataOf(blocksOf(...["trees.bmp", "provinces.bmp", "definition.csv"].map((f) => path.join(below, "map", f))));
const n = (k) => totalOf(kit.hist.get(k));
const bandsOf = (k) => Array.from({ length: BANDS }, (_, b) => n(k + "@" + b));
/** The trees in a histogram of the fixture's: an index its trees.gfx declares (the bare one it does not). */
const liveF = (h) => { let c = 0; for (const [i, v] of (h || new Map())) if (DECLARED.includes(i)) c += v; return c; };

console.log("\n=== 🌲 the fixture sits on the side of the floor each check needs ===");
{
  ok(kit.bare === BARE && JSON.stringify(kit.woody) === '["forest"]', "CONTROL: the layer below's bare index is voted for, and forest is its one woody terrain", { bare: kit.bare, woody: kit.woody });
  ok(n("plains~n") >= FLOOR && bandsOf("plains~n").every((c) => c < FLOOR),
    `CONTROL: plains NEAR the woods holds ${n("plains~n")} blocks, over the floor of ${FLOOR}, and fewer than that in every band`, bandsOf("plains~n"));
  ok(n("plains~f") >= FLOOR && want["plains far"].trees === 0 && want["plains near"].trees > 0,
    "CONTROL: plains FAR from the woods is bare, and plains near them is not", { far: want["plains far"], near: share(want["plains near"]).toFixed(1) });
  ok(n("hills~n") > 0 && n("hills~n") < FLOOR && want["hills near"].trees > 0,
    `CONTROL: hills near the woods grows trees on ${n("hills~n")} blocks — under the floor`, want["hills near"]);
  ok(bandsOf("hills~f").every((c) => c >= FLOOR) && want["hills far north"].trees === 0 && want["hills far south"].trees > 0,
    "CONTROL: hills far from the woods has the floor in EVERY band, bare in the north half and treed in the south", { bands: bandsOf("hills~f"), south: share(want["hills far south"]).toFixed(1) });
  ok(n("forest~edge") >= FLOOR && bandsOf("forest~edge").every((c) => c < FLOOR) && want.edge.trees > 0 && want.edge.undeclared > 0,
    `CONTROL: ${n("forest~edge")} blocks hold forest AND the land beside it, over the floor, thinner than it in every band, treed, and some carry an index nothing declares`,
    { bands: bandsOf("forest~edge"), share: share(want.edge).toFixed(1), undeclared: want.edge.undeclared });
  // dropping the undeclared blocks from the mix instead of counting them as the bare ground they draw would plant the edge at
  const dropped = pct(want.edge.trees, want.edge.blocks - want.edge.undeclared);
  ok(Math.abs(dropped - share(want.edge)) > 5, "CONTROL: …and dropping them from the mix would plant the edge at a rate the layer below does not show",
    { shows: share(want.edge).toFixed(1), dropped: dropped.toFixed(1) });
  // one mix for all of plains would put trees on the far plains: that is what the fixture can tell apart
  const onePlainsMix = (want["plains near"].trees + want["plains far"].trees) / (want["plains near"].blocks + want["plains far"].blocks);
  ok(Math.round(onePlainsMix * want["plains far"].blocks) > 0,
    "CONTROL: one mix for the whole of plains would plant trees on far plains", Math.round(onePlainsMix * want["plains far"].blocks));
  // the desert is the shape of Millennium Dawn's desert by the woods: over the floor, thin in every band, and one band's paint —
  // while its whole-map mix, planted in the other bands, would put trees where the layer below grows none
  const ds = standIn(kit, "desert~f", liveF);
  ok(n("desert~f") >= FLOOR && bandsOf("desert~f").every((c) => c > 0 && c < FLOOR) && ds.top === DESERT_BAND && ds.ratio >= RATIO
    && want["desert far@" + DESERT_BAND].trees > 0 && Math.round(pct(liveF(kit.hist.get("desert~f")), n("desert~f")) * (n("desert~f") - n("desert~f@" + DESERT_BAND)) / 100) > 0,
    `CONTROL: desert away from the woods holds ${n("desert~f")} blocks, thinner than the floor in every band, and band ${DESERT_BAND} grew ${(100 * ds.share).toFixed(0)}% of its trees, the rest ${ds.rest.toFixed(1)}% — the rest of its ground, planted from the whole-map mix, would grow some`,
    { bands: bandsOf("desert~f"), desertFar: brief(ds), ratio: RATIO });
}

console.log("\n=== 🌲 a world raised whole over that layer grows what it grows, WHERE it grows it ===");
const modA = makeMod("mod-a", [...FORESTS, ...OPEN]);
const upA = raise(modA, below, [...FORESTS, ...OPEN]);
const gotA = survey(path.join(modA, "map", "trees.bmp"));
{
  ok(!!(upA && upA.changed && upA.trees && upA.trees.changed), "the raise planted trees.bmp", upA && (upA.error || upA.trees));
  ok(gotA["plains far"].trees === 0,
    "⭐⭐⭐ not one tree on plains more than TREES_WOODY_REACH blocks from the woods — the layer below grows none there", gotA["plains far"]);
  ok(gotA["plains near"].trees > 0 && Math.abs(share(gotA["plains near"]) - share(want["plains near"])) < 1,
    "⭐⭐⭐ …and plains beside the woods is planted at the rate the layer below grows there", { got: share(gotA["plains near"]).toFixed(2), want: share(want["plains near"]).toFixed(2) });
  // no band has enough near-plains to speak, so every band is planted from the whole map's mix — both kinds, north and south
  ok([gotA["plains near north"], gotA["plains near south"]].every((a) => a.kinds[T_NORTH] > 0 && a.kinds[T_SOUTH] > 0),
    "⭐⭐ a stratum too thin in every band is planted from its whole-map mix — the northern tree and the southern one, in both halves",
    { north: gotA["plains near north"].kinds, south: gotA["plains near south"].kinds });
  ok(gotA["hills far north"].trees === 0 && Math.abs(share(gotA["hills far south"]) - share(want["hills far south"])) < 1 && onlyKinds(gotA["hills far south"], [T_HILLS_SOUTH]),
    "⭐⭐ a stratum with the floor in a band is planted from THAT band: far hills bare in the north, treed in the south at the south's rate",
    { north: gotA["hills far north"], south: share(gotA["hills far south"]).toFixed(2), want: share(want["hills far south"]).toFixed(2) });
  ok(gotA["hills near"].trees === 0,
    `⭐⭐ a stratum under the floor plants NOTHING: ${n("hills~n")} blocks of hills near the woods are too few to speak for hills anywhere else`, gotA["hills near"]);
  ok(gotA.edge.trees > 0 && onlyKinds(gotA.edge, [T_EDGE]) && gotA.edge.undeclared === 0,
    "⭐⭐⭐ the blocks where the forest meets the plains are planted — in the EDGE's own mix, and never with the index nothing declares",
    { kinds: gotA.edge.kinds, undeclared: gotA.edge.undeclared });
  ok(Math.abs(share(gotA.edge) - share(want.edge)) < 1,
    "⭐⭐ …at the share the layer below SHOWS there: an index nothing declares draws nothing, so it counts as bare ground", { got: share(gotA.edge).toFixed(2), shows: share(want.edge).toFixed(2) });
  ok(Math.abs(share(gotA.forest) - share(want.forest)) < 1 && onlyKinds(gotA.forest, [T_FOREST]),
    "…and the forest in its own mix, as it always was", { got: share(gotA.forest).toFixed(2), want: share(want.forest).toFixed(2) });
  ok(gotA.sea.trees === 0, "…and nothing on the sea", gotA.sea);
  // The desert's whole-map mix is band 2's paint: it speaks for band 2 and for no other.
  const otherBands = Array.from({ length: BANDS }, (_, b) => b).filter((b) => b !== DESERT_BAND);
  ok(otherBands.every((b) => gotA["desert far@" + b].blocks > 0) && otherBands.every((b) => gotA["desert far@" + b].trees === 0),
    `⭐⭐⭐ a whole-map mix that is ONE band's paint stands in for no other: not one tree on the desert outside band ${DESERT_BAND}, where the layer below grows none`,
    otherBands.map((b) => gotA["desert far@" + b].trees));
  const wholeDesert = pct(liveF(kit.hist.get("desert~f")), n("desert~f")), inBand = gotA["desert far@" + DESERT_BAND];
  ok(inBand.trees > 0 && Math.abs(share(inBand) - wholeDesert) < 1 && onlyKinds(inBand, [T_DESERT]),
    `⭐⭐ …and in band ${DESERT_BAND}, whose paint it is, the desert is still planted from that whole-map mix — the one sample of it there is`,
    { got: share(inBand).toFixed(2), whole: wholeDesert.toFixed(2), kinds: inBand.kinds });
}

console.log("\n=== 🌲 the edge is planted only where ALL of its land came up in this write ===");
{
  // The modder's forest is land already; only the open ground beside it comes up. A block holding both is half theirs.
  const modB = makeMod("mod-b", OPEN);
  const upB = raise(modB, below, OPEN);
  const gotB = survey(path.join(modB, "map", "trees.bmp"));
  ok(!!(upB && upB.trees && upB.trees.changed) && Math.abs(share(gotB["plains near"]) - share(want["plains near"])) < 1,
    "CONTROL: the stroke planted — plains beside the modder's forest came up at the near rate", upB && (upB.error || { trees: upB.trees && upB.trees.pixels, near: share(gotB["plains near"]).toFixed(2) }));
  ok(gotB.edge.trees === 0,
    "⭐⭐⭐ not one edge block was planted: the forest in it is the modder's own, and did not come up in this write", gotB.edge);
  ok(gotB.forest.trees === 0, "…and the modder's forest itself was not touched", gotB.forest);
}

console.log("\n=== 🌲 forest keeps exactly its bytes, and the same world plants the same bytes ===");
{
  // The same world raised over a layer below that grows NOTHING off its forests — what every terrain but forest got before.
  const belowC = makeBelow("below-forest-only", true);
  const modC = makeMod("mod-c", [...FORESTS, ...OPEN]);
  raise(modC, belowC, [...FORESTS, ...OPEN]);
  const a = indexed(path.join(modA, "map", "trees.bmp")), c = indexed(path.join(modC, "map", "trees.bmp"));
  let forest = 0, moved = 0, elsewhere = 0;
  for (let by = 0; by < TH; by++) for (let bx = 0; bx < TW; bx++) {
    if (colKind[bx] === "forest") { forest++; if (a.at(bx, by) !== c.at(bx, by)) moved++; }
    else if (c.at(bx, by) !== BARE) elsewhere++;
  }
  ok(elsewhere === 0 && gotA["plains near"].trees + gotA.edge.trees > 0,
    "CONTROL: over the forest-only layer nothing but forest is planted; over the full one, plains and edges are", { elsewhere });
  ok(forest > 0 && moved === 0,
    `⭐⭐⭐ all ${forest} forest blocks carry the same index whether or not the strata round them plant — forest is untouched by all of this`, { moved });
  const modD = makeMod("mod-d", [...FORESTS, ...OPEN]);
  raise(modD, below, [...FORESTS, ...OPEN]);
  ok(sha(fs.readFileSync(path.join(modD, "map", "trees.bmp"))) === sha(fs.readFileSync(path.join(modA, "map", "trees.bmp"))),
    "⭐⭐ a second, independent copy of the same world came out byte-identical — no seed, no clock, no Math.random");
}

console.log("\n=== 🌲 a town's own ground stays the town's, though the layer below grows trees on its city ground ===");
{
  // #a-town-in-the-woods-has-trees-round-it keeps every block with city ground in it bare. City ground was never planted
  // before, because urban's commonest index is bare; its strata now have a mix to plant (vanilla's city ground away from the
  // woods: 823 blocks, 2.8% trees), so the town's own ground is refused on purpose rather than by the old gate's accident.
  // A layer below of city ground and sea, over the floor, a tree on one block in five; a town raised on the same shapes.
  const TW2 = 60, TH2 = BANDS * Math.ceil(FLOOR / 200), W2 = 2 * TW2, H2 = 2 * TH2, SPAWN = 19, OCEAN = 15, T_TOWN = 2, TOWN = 8, SEA = 9;
  const idAt2 = (x) => (x < 100 ? TOWN : SEA);
  const prov2 = (() => {
    const rs = Math.floor((24 * W2 + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H2);
    b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
    b.writeInt32LE(W2, 18); b.writeInt32LE(H2, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H2, 34);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) { const [r, g, bl] = colour(idAt2(x)); const o = 54 + (H2 - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
    return b;
  })();
  const def2 = ["0;0;0;0;land;false;unknown;0", `${TOWN};${colour(TOWN).join(";")};land;false;urban;1`, `${SEA};${colour(SEA).join(";")};sea;false;ocean;0`].join("\n") + "\n";
  const townBelow = path.join(ROOT, "town-below");
  write(townBelow, "map/provinces.bmp", prov2);
  write(townBelow, "map/definition.csv", def2);
  write(townBelow, "map/trees.bmp", bmp8(TW2, TH2, (bx, by) => (2 * bx < 100 && (bx * 7 + by * 5) % 20 < 4 ? T_TOWN : BARE)));
  write(townBelow, "gfx/entities/trees.gfx", `objectTypes = {\n\tpdxmesh = { name = "mapobject_${T_TOWN}" file = "gfx/models/t.mesh" }\n}\n`);
  write(townBelow, "common/terrain/00_terrain.txt", ["categories = {", "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", `  terrain_city = { type = urban color = { ${SPAWN} } texture = 10 spawn_city = yes }`, `  ocean = { type = ocean color = { ${OCEAN} } }`, "}", ""].join("\n"));
  const townMod = (tag, painted) => {
    const d = path.join(ROOT, tag);
    write(d, "descriptor.mod", 'name="town"\n');
    write(d, "map/provinces.bmp", prov2);
    write(d, "map/definition.csv", def2);
    write(d, "map/trees.bmp", bmp8(TW2, TH2, () => BARE));
    // what the painter leaves on a raised town: city ground over all of it
    if (painted) write(d, "map/terrain.bmp", bmp8(W2, H2, (x) => (idAt2(x) === TOWN ? SPAWN : OCEAN)));
    const mask = new Uint8Array(W2 * H2);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) if (idAt2(x) === TOWN) mask[y * W2 + x] = 1;
    const r = md.plantProvincesInTreesBmp({ modRoot: d, gameRoot: townBelow, dependencyRoots: [], provinceIds: [TOWN], crossed: { mask, W: W2, H: H2 } });
    const t = indexed(path.join(d, "map", "trees.bmp"));
    let blocks = 0, trees = 0;
    for (let by = 0; by < TH2; by++) for (let bx = 0; bx < 50; bx++) { blocks++; if (t.at(bx, by) !== BARE) trees++; }
    return { r, blocks, trees };
  };
  const tb = indexed(path.join(townBelow, "map", "trees.bmp"));
  let belowTrees = 0;
  for (let by = 0; by < TH2; by++) for (let bx = 0; bx < 50; bx++) if (tb.at(bx, by) !== BARE) belowTrees++;
  const bare = townMod("town-unpainted", false), city = townMod("town-painted", true);
  ok(bare.blocks >= FLOOR && bare.trees > 0 && Math.abs(pct(bare.trees, bare.blocks) - pct(belowTrees, bare.blocks)) < 1,
    "CONTROL: with no city ground to read, the raised town is planted from the layer below's city-ground mix, at its rate",
    { blocks: bare.blocks, trees: bare.trees, below: belowTrees, reason: bare.r && bare.r.reason });
  ok(city.trees === 0, "⭐⭐ with its city ground painted, not one block of the town carries a tree — the town stays the town", { trees: city.trees, r: city.r && (city.r.reason || city.r.pixels) });
}

console.log("\n=== 🌲 a town's forest ring is the town's paint, not the woods its fringe is measured from ===");
{
  // The layer below keys a block by definition.csv, so its "near the woods" is near a forest PROVINCE, and its forest edge is a
  // forest province beside other land: it never saw the forest a town is ringed in (#a-town-in-the-woods-has-trees-round-it).
  // A town in the far plains, its core city ground and its ring painted forest, planted over the fixture's layer below.
  const TOWN_ID = 9, RING_IDX = 1, PLAINS_IDX = 0, SPAWN = 19, OCEAN_IDX = 15;
  const ringPx = (x) => (x >= 301 && x <= 309) || (x >= 332 && x <= 340), corePx = (x) => x >= 310 && x <= 331;
  const provT = (x) => (ringPx(x) || corePx(x) ? TOWN_ID : provAtX(x));
  const modT = path.join(ROOT, "mod-town-ring");
  write(modT, "descriptor.mod", 'name="ring"\n');
  write(modT, "map/provinces.bmp", bmp24((x) => colour(provT(x))));
  write(modT, "map/definition.csv", definitionCsv([[TOWN_ID, 0, 0, "urban"]]));
  write(modT, "map/trees.bmp", bmp8(TW, TH, () => BARE));
  write(modT, "map/terrain.bmp", bmp8(W, H, (x) => (ringPx(x) ? RING_IDX : corePx(x) ? SPAWN : terrainOf(provAtX(x)) === "ocean" ? OCEAN_IDX : PLAINS_IDX)));
  write(modT, "common/terrain/00_terrain.txt", ["categories = {", "  forest = { color = { 0 120 0 } }", "  plains = { color = { 200 200 100 } }",
    "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", `  forest = { type = forest color = { ${RING_IDX} } }`, `  plains = { type = plains color = { ${PLAINS_IDX} } }`,
    `  terrain_city = { type = urban color = { ${SPAWN} } texture = 10 spawn_city = yes }`, `  ocean = { type = ocean color = { ${OCEAN_IDX} } }`, "}", ""].join("\n"));
  // every land pixel came up in this write, as on Generate land
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (terrainOf(provAtX(x)) !== "ocean") mask[y * W + x] = 1;
  const r = md.plantProvincesInTreesBmp({ modRoot: modT, gameRoot: below, dependencyRoots: [], provinceIds: [...FORESTS, ...OPEN, TOWN_ID], crossed: { mask, W, H } });
  const holdsRing = (bx) => [2 * bx, 2 * bx + 1].some(ringPx);
  const kindT = (bx) => {
    const px = [2 * bx, 2 * bx + 1];
    if (px.some(corePx)) return "core";
    if (px.every(ringPx)) return "ring";
    if (px.some(ringPx)) return "ring edge";
    for (let c = Math.max(0, bx - REACH); c <= Math.min(TW - 1, bx + REACH); c++) if (holdsRing(c) && colKind[bx] === "plains far") return "plains by the ring";
    return colKind[bx];
  };
  const gotT = survey(path.join(modT, "map", "trees.bmp"), kindT);
  ok(!!(r && r.changed) && gotT.ring.trees > 0 && onlyKinds(gotT.ring, [T_FOREST]) && gotT.core.trees === 0 && gotT["plains near"].trees > 0,
    "CONTROL: the ring came up as the forest it is painted, with the forest's own tree; the core bare; the plains by the real woods planted",
    r && (r.error || r.reason || { ring: gotT.ring, core: gotT.core.trees, near: gotT["plains near"].trees }));
  ok(gotT["plains by the ring"].blocks > 0 && gotT["plains by the ring"].trees === 0,
    "⭐⭐ not one tree on the plains beside the ring — the layer below measured its fringe from forest provinces, and these are as far from one as the rest of its far plains",
    gotT["plains by the ring"]);
  ok(gotT["ring edge"].blocks > 0 && gotT["ring edge"].trees === 0,
    "⭐⭐ …nor on a block where the ring meets them: a town beside plains is no forest edge the layer below could have learnt one from", gotT["ring edge"]);
}

console.log("\n=== 🌲 a terrain too small to vote is not woody, and grows no fringe round itself ===");
{
  // Road to 56 names a terrain `plain` on two blocks, both carrying a tree; the commonest index under it is a tree, so it voted
  // itself woody and the fringe and the edge were measured round it too. Here: four patches of a `grove` in the far plains, two
  // blocks square, every block a tree — fewer blocks between them than the fewest a terrain votes from.
  const GROVE = 10, PATCHES = [[60, 40], [60, 140], [160, 40], [160, 140]];
  const inGrove = (bx, by) => PATCHES.some(([gx, gy]) => bx >= gx && bx < gx + 2 && by >= gy && by < gy + 2);
  const provincesG = bmp24((x, y) => colour(inGrove(x >> 1, y >> 1) ? GROVE : provAtX(x)));
  const defG = definitionCsv([[GROVE, 0, 0, "grove"]]);
  const belowG = path.join(ROOT, "below-grove");
  write(belowG, "map/provinces.bmp", provincesG);
  write(belowG, "map/definition.csv", defG);
  write(belowG, "map/trees.bmp", bmp8(TW, TH, (bx, by) => (inGrove(bx, by) ? T_SOUTH : treeBelow(bx, by, false))));
  write(belowG, "gfx/entities/trees.gfx", fs.readFileSync(path.join(below, "gfx", "entities", "trees.gfx")));
  const modG = path.join(ROOT, "mod-grove");
  write(modG, "descriptor.mod", 'name="grove"\n');
  write(modG, "map/provinces.bmp", provincesG);
  write(modG, "map/definition.csv", defG);
  write(modG, "map/trees.bmp", bmp8(TW, TH, () => BARE));
  write(modG, "map/heightmap.bmp", bmp8(W, H, () => md.HEIGHTMAP_SEA_VALUE));
  const upG = raise(modG, belowG, [...FORESTS, ...OPEN, GROVE]);
  const kindG = (bx, by) => {
    if (inGrove(bx, by)) return "grove";
    for (let y = by - REACH; y <= by + REACH; y++) for (let x = bx - REACH; x <= bx + REACH; x++) if (inGrove(x, y) && colKind[bx] === "plains far") return "plains by a grove";
    return colKind[bx];
  };
  const groveBelow = survey(path.join(belowG, "map", "trees.bmp"), kindG).grove;
  ok(groveBelow.blocks > 0 && groveBelow.blocks < WOODY_MIN && groveBelow.kinds[T_SOUTH] === groveBelow.blocks,
    `CONTROL: the layer below's grove is ${groveBelow.blocks} blocks, every one of them a tree — only its size keeps it from voting woody`, groveBelow);
  const s = md.sampleTreesByTerrain(...["trees.bmp", "provinces.bmp", "definition.csv"].map((f) => path.join(belowG, "map", f))) || {};
  ok(JSON.stringify(s.woody) === '["forest"]', "⭐⭐ the sampler counts it out: forest is still the one woody terrain", s.woody);
  const gotG = survey(path.join(modG, "map", "trees.bmp"), kindG);
  ok(!!(upG && upG.trees && upG.trees.changed) && gotG["plains near"].trees > 0,
    "CONTROL: the raise planted the plains by the real woods", upG && (upG.error || upG.trees));
  ok(gotG["plains by a grove"].blocks > 0 && gotG["plains by a grove"].trees === 0,
    "⭐⭐ not one tree on the plains round the groves — they are as far from the woods as the rest of the far plains", gotG["plains by a grove"]);
  ok(gotG.grove.trees === 0, `⭐ …and none on the grove itself: ${gotG.grove.blocks} blocks are no stratum to plant from either`, gotG.grove);
}

console.log("\n=== 🌲 paint is a RATE, and the bands one band's paint stands in for no longer are planted from their own pool ===");
{
  // A layer below with no woods, so every stratum is "<terrain>~f", in this file's geometry (TH rows, BANDS bands):
  //   marsh — a key of its own in band 0, at 40% (index 28), and in the last band, bare; the bands between too thin to speak
  //           alone and over the floor together, at about a tenth (29). Band 0's paint by rate, and not under the floor itself:
  //           a gate that fired only on a paint band too thin for a key of its own passed this file, and put vanilla's marsh by
  //           the woods back at its whole-map 9.3% where the rest of it grows 2.2%;
  //   hills — over the floor, too thin in each of its two bands, three quarters of it in band 3 and the rest in band 4, at one
  //           rate in both (11): what the 2/3-of-the-trees gate refused, leaving band 4 bare — a tropical jungle edge, or
  //           vanilla's marsh away from the woods;
  //   plains everywhere else, bare; the sea down the east edge, for the bare vote.
  const RB = TH / BANDS, LAST = BANDS - 1;
  const W_KEY = Math.ceil(FLOOR / RB) + 8, W_THIN = Math.ceil(FLOOR / ((BANDS - 2) * RB)), W_H3 = Math.ceil(FLOOR / RB) - 2, W_H4 = Math.ceil(W_H3 / 3), H0 = 100;
  const MARSH = 11, HILLS = 12, PLAINS = 13, SEA = 14, T_PAINT = 28, T_THIN = 29, T_HILLS = 11;
  const provS = (bx, by) => {
    const band = bandOfRow(by);
    if (bx >= TW - 20) return SEA;
    if (bx < (band === 0 || band === LAST ? W_KEY : W_THIN)) return MARSH;
    if (bx >= H0 && bx < H0 + (band === 3 ? W_H3 : band === 4 ? W_H4 : 0)) return HILLS;
    return PLAINS;
  };
  const colourS = (id) => [id, 150, 60];
  const provincesS = bmp24((x, y) => colourS(provS(x >> 1, y >> 1)));
  const defS = ["0;0;0;0;land;false;unknown;0", `${MARSH};${colourS(MARSH).join(";")};land;false;marsh;1`, `${HILLS};${colourS(HILLS).join(";")};land;false;hills;1`,
    `${PLAINS};${colourS(PLAINS).join(";")};land;false;plains;1`, `${SEA};${colourS(SEA).join(";")};sea;false;ocean;0`].join("\n") + "\n";
  const treeS = (bx, by) => {
    const p = provS(bx, by), band = bandOfRow(by), slot = (bx * 7 + by * 5) % 20;
    if (p === MARSH) return band === 0 ? (slot < 8 ? T_PAINT : BARE) : band === LAST ? BARE : (slot < 2 ? T_THIN : BARE);
    if (p === HILLS) return slot < 5 ? T_HILLS : BARE;
    return BARE;
  };
  const belowS = path.join(ROOT, "below-bands");
  write(belowS, "map/provinces.bmp", provincesS);
  write(belowS, "map/definition.csv", defS);
  write(belowS, "map/trees.bmp", bmp8(TW, TH, treeS));
  write(belowS, "gfx/entities/trees.gfx", ["objectTypes = {", ...[T_PAINT, T_THIN, T_HILLS].map((i) => `\tpdxmesh = { name = "mapobject_${i}" file = "gfx/models/t${i}.mesh" }`), "}", ""].join("\n"));
  const modS = path.join(ROOT, "mod-bands");
  write(modS, "descriptor.mod", 'name="bands"\n');
  write(modS, "map/provinces.bmp", provincesS);
  write(modS, "map/definition.csv", defS);
  write(modS, "map/trees.bmp", bmp8(TW, TH, () => BARE));

  const kitS = strataOf(blocksOf(...["trees.bmp", "provinces.bmp", "definition.csv"].map((f) => path.join(belowS, "map", f))));
  const liveS = (h) => { let c = 0; for (const [i, v] of (h || new Map())) if (i === T_PAINT || i === T_THIN || i === T_HILLS) c += v; return c; };
  const nS = (k) => totalOf(kitS.hist.get(k)), rateS = (k) => pct(liveS(kitS.hist.get(k)), nS(k));
  const between = Array.from({ length: BANDS - 2 }, (_, i) => i + 1);
  const thinBlocks = between.reduce((a, b) => a + nS("marsh~f@" + b), 0), thinRate = pct(between.reduce((a, b) => a + liveS(kitS.hist.get("marsh~f@" + b)), 0), thinBlocks);
  const ms = standIn(kitS, "marsh~f", liveS), hs = standIn(kitS, "hills~f", liveS);
  ok(kitS.bare === BARE && kitS.woody.length === 0 && nS("marsh~f@0") >= FLOOR && nS("marsh~f@" + LAST) >= FLOOR && rateS("marsh~f@" + LAST) === 0
    && between.every((b) => nS("marsh~f@" + b) > 0 && nS("marsh~f@" + b) < FLOOR) && thinBlocks >= FLOOR && ms.top === 0 && ms.ratio >= RATIO
    && Math.abs(thinRate - ms.rest) > 3,
    `CONTROL: marsh has a key of its own in band 0 and in band ${LAST} (bare); bands 1-${LAST - 1} are each too thin to speak and ${thinBlocks} blocks together; band 0 is its paint by rate; and the bands between grow a rate the rest with band ${LAST} in it does not`,
    { bands: Array.from({ length: BANDS }, (_, b) => nS("marsh~f@" + b)), marsh: brief(ms), thinRate: +thinRate.toFixed(2), ratio: RATIO });
  ok(nS("hills~f") >= FLOOR && nS("hills~f@3") < FLOOR && nS("hills~f@4") > 0 && nS("hills~f@4") < FLOOR && hs.top === 3 && hs.share >= 2 / 3
    && Math.abs(rateS("hills~f@3") - rateS("hills~f@4")) < 3 && hs.ratio < RATIO,
    "CONTROL: hills clears the floor, is too thin in each of its two bands, and band 3 grew more than 2/3 of its trees (the share the old gate refused at) at the rate band 4 grows",
    { bands: [nS("hills~f@3"), nS("hills~f@4")], rates: [rateS("hills~f@3").toFixed(2), rateS("hills~f@4").toFixed(2)], hills: brief(hs) });

  const mask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provS(x >> 1, y >> 1) !== SEA) mask[y * W + x] = 1;
  const r = md.plantProvincesInTreesBmp({ modRoot: modS, gameRoot: belowS, dependencyRoots: [], provinceIds: [MARSH, HILLS, PLAINS], crossed: { mask, W, H } });
  const kindS = (bx, by) => {
    const p = provS(bx, by), band = bandOfRow(by);
    if (p === MARSH) return band === 0 ? "marsh paint" : band === LAST ? "marsh keyed" : "marsh between";
    return p === HILLS ? "hills" : p === SEA ? "sea" : "plains";
  };
  const gotS = survey(path.join(modS, "map", "trees.bmp"), kindS);
  ok(!!(r && r.changed) && Math.abs(share(gotS["marsh paint"]) - rateS("marsh~f@0")) < 1 && gotS["marsh keyed"].trees === 0 && gotS.plains.trees === 0,
    "CONTROL: the planter planted — marsh's band 0 at its own rate, its bare keyed band and the plains bare",
    r && (r.error || r.reason || { paint: share(gotS["marsh paint"]).toFixed(2), keyed: gotS["marsh keyed"].trees, plains: gotS.plains.trees }));
  ok(gotS["marsh between"].trees > 0,
    "⭐⭐⭐ one band's paint with a key of its own leaves the bands too thin to speak a sample: they are planted, not left bare", gotS["marsh between"]);
  ok(onlyKinds(gotS["marsh between"], [T_THIN]),
    "⭐⭐⭐ …and not from the whole-map mix, which is band 0's paint: not one of band 0's trees on them", gotS["marsh between"].kinds);
  ok(Math.abs(share(gotS["marsh between"]) - thinRate) < 1,
    `⭐⭐ …at the rate they grow between them, ${thinRate.toFixed(1)}% — not the ${ms.rest.toFixed(1)}% of a pool with band ${LAST}'s bare keyed ground in it`,
    { got: share(gotS["marsh between"]).toFixed(2), want: thinRate.toFixed(2), rest: ms.rest.toFixed(2), whole: ms.whole.toFixed(2) });
  ok(gotS["hills@4"].blocks > 0 && gotS["hills@4"].trees > 0 && onlyKinds(gotS["hills@4"], [T_HILLS]),
    "⭐⭐⭐ hills in band 4 is planted from the whole-map mix: one rate on ground that lies mostly in band 3 is no band's paint", gotS["hills@4"]);
  ok(Math.abs(share(gotS.hills) - hs.whole) < 1,
    "⭐ …and hills as a whole at the whole-map rate", { got: share(gotS.hills).toFixed(2), whole: hs.whole.toFixed(2) });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
