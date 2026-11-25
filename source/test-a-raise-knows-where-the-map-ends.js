// A raise knows where the map ends: off the top and bottom is the edge of the world, and east meets west.
// #a-raise-knows-where-the-map-ends
//
// TEST 33's rehearsal, audited against the base game:
//
//   • THE TOP AND BOTTOM. Generated land that reached row 0 or the last row stood there at full strength: t33a's top five rows
//     read 136.8 / 136.7 / 136.5 / 136.4 / 136.6 (max 240), its bottom row 129. Vanilla's row 0 reads 95.6 (max 102, 44.7% of
//     it at or under the waterline) and climbs 99.9 / 102.2 / 104.8 / 107.5; Millennium Dawn, Rise of Nations, Novum Vexillum,
//     Road to 56 and Damaged Continuum ramp down to their edges the same way. The raise's isWaterAt answered false off the map,
//     so land touching the edge had no shore there.
//   • THE SEAM. HOI4's map wraps east to west — provinceNeighbourGraph, drownedShoreFringe, the relief lattice and the coast
//     noise all know it — but the raise's five walks and isWaterAt stopped at x = 0 and x = W − 1. 140 rows of t33a's coast ran
//     down the date line (land at x 5631 against sea at x 0) with no beach on it: the step across the seam was median 15, max
//     23, against 5 everywhere else, and 0 such rows on any of the eight shipping maps.
//
// So off-map rows are water FOR THE DEPTH ONLY — nothing is written off the map — and every walk of the raise wraps x, as
// drownedShoreFringe already did.
//
//   • …BUT NOT EVERY MAP'S EDGE IS A SHORE. Old World Blues runs standing land into its top row (the median of what stands on it
//     139, its bottom 153), and counted as water there a raise touching the edge cut a strip of 94 under the waterline along it,
//     inside the land: 52 of 60 pixels on the review's fixture (GRV-2), where the commit before wrote 107..127. So an edge is a
//     shore when what stands on its row says so (mapEdgeIsShore: median at most the beach ramp's top) — the map's own row, or where
//     nothing stands on it (Delete map leaves nothing) the layer below's, or where neither has anything, a shore.
//
// Small fixtures, 64 × 24, so every assertion is a known answer derived from heightmapReliefField(64) and the writer's constants:
// i the top and bottom rows; ii the sea across the seam is a coast; ii′ the depth is walked across it; iii the cap and the lift
// reach old land across it, and the seam is not an edge; iv a fill across it re-settles an older coast's beach ring there; v an
// edge the map runs standing land into is not a shore; vi the layer below answers for an edge row with nothing standing, on an
// add-on and (vi′) on a mod that replaces map; vii the base game's own edge rows (SKIP, saying so, when it is not installed).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};
const NOGAME = path.join(os.tmpdir(), "__no_game_map_ends__");
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const tmps = [];
const RAMP = md.HEIGHTMAP_BEACH_RAMP;
const S = md.HEIGHTMAP_RAISE_RIM_SLOPE;
const STEP4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const W = 64, H = 24, SEA = 1, NEW = 2, OLD = 3;
const relief = md.heightmapReliefField(W);

function makeMod(idAt, tag, newType = "land") {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mapends-" + tag + "-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="MAPENDS"\nreplace_path="map"\n');
  const col = (id) => [(id * 37) & 255, (id * 91 + 11) & 255, (id * 53 + 7) & 255];
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii"); bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = col(idAt(x, y)); bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  // the new land is land by this click, the old land was land before it, the rest is sea
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (const i of [SEA, NEW, OLD]) { const c = col(i); rows.push(i === SEA || (i === NEW && newType === "sea") ? `${i};${c.join(";")};sea;false;ocean;0` : `${i};${c.join(";")};land;false;plains;1`); }
  fs.writeFileSync(path.join(d, "map", "definition.csv"), rows.join("\n") + "\n");
  const hrs = Math.floor((8 * W + 31) / 32) * 4, hsz = hrs * H;
  const hb = Buffer.alloc(54 + 1024 + hsz, 89);
  hb.write("BM", 0, "ascii"); hb.writeUInt32LE(54 + 1024 + hsz, 2); hb.writeUInt32LE(54 + 1024, 10); hb.writeUInt32LE(40, 14);
  hb.writeInt32LE(W, 18); hb.writeInt32LE(H, 22); hb.writeUInt16LE(1, 26); hb.writeUInt16LE(8, 28); hb.writeUInt32LE(0, 30); hb.writeUInt32LE(hsz, 34);
  hb.writeUInt32LE(256, 46); hb.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; hb[o] = i; hb[o + 1] = i; hb[o + 2] = i; hb[o + 3] = 0; }
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), hb);
  return { d, hrs, idAt };
}
const grid = (f) => { const b = fs.readFileSync(path.join(f.d, "map", "heightmap.bmp")); const off = b.readUInt32LE(10); const g = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = b[off + (H - 1 - y) * f.hrs + x]; return g; };
// the old land, standing at its own height as a layer below would have left it
const stand = (f, h) => { const hp = path.join(f.d, "map", "heightmap.bmp"), b = fs.readFileSync(hp), off = b.readUInt32LE(10); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (f.idAt(x, y) === OLD) b[off + (H - 1 - y) * f.hrs + x] = h; fs.writeFileSync(hp, b); };
const raise = (f, ids = [NEW], gameRoot = NOGAME) => md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot, dependencyRoots: [], provinceIds: ids, raise: true });
// a layer below that is only a heightmap, `hAt(x, y)` its heights — all the raise asks of it is its edge rows
function makeBelow(tag, hAt) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-mapends-below-" + tag + "-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  const hrs = Math.floor((8 * W + 31) / 32) * 4, hsz = hrs * H;
  const hb = Buffer.alloc(54 + 1024 + hsz);
  hb.write("BM", 0, "ascii"); hb.writeUInt32LE(54 + 1024 + hsz, 2); hb.writeUInt32LE(54 + 1024, 10); hb.writeUInt32LE(40, 14);
  hb.writeInt32LE(W, 18); hb.writeInt32LE(H, 22); hb.writeUInt16LE(1, 26); hb.writeUInt16LE(8, 28); hb.writeUInt32LE(0, 30); hb.writeUInt32LE(hsz, 34);
  hb.writeUInt32LE(256, 46); hb.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; hb[o] = i; hb[o + 1] = i; hb[o + 2] = i; hb[o + 3] = 0; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) hb[54 + 1024 + (H - 1 - y) * hrs + x] = hAt(x, y);
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), hb);
  return d;
}
const toLand = (f, id) => { const p = path.join(f.d, "map", "definition.csv"); fs.writeFileSync(p, fs.readFileSync(p, "utf8").split("\n").map((l) => (l.split(";")[0] === String(id) ? l.replace(";sea;false;ocean;0", ";land;false;plains;1") : l)).join("\n")); };
// the depth of each NEW pixel from SEA, by the test's own walk; `edges` / `wrap` say whether off-map rows are water and x wraps
// (`edges` true / false for both, or { top, bottom } for each)
function depthOf(idAt, { edges = true, wrap = true } = {}) {
  const depth = new Int32Array(W * H);
  let front = [];
  const water = (b) => (typeof edges === "object" ? (b < 0 ? edges.top : edges.bottom) : edges);
  const nb = (x, y, dx, dy) => { const b = y + dy; let a = x + dx; if (b < 0 || b >= H) return water(b) ? "water" : null; if (a < 0 || a >= W) { if (!wrap) return null; a = (a + W) % W; } return b * W + a; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (idAt(x, y) !== NEW) continue;
    if (STEP4.some(([dx, dy]) => { const j = nb(x, y, dx, dy); return j === "water" || (j !== null && idAt(j % W, (j - (j % W)) / W) === SEA); })) { depth[y * W + x] = 1; front.push(y * W + x); }
  }
  for (let d = 2; front.length; d++) {
    const next = [];
    for (const i of front) { const x = i % W, y = (i - x) / W; for (const [dx, dy] of STEP4) { const j = nb(x, y, dx, dy); if (j === null || j === "water" || depth[j] || idAt(j % W, (j - (j % W)) / W) !== NEW) continue; depth[j] = d; next.push(j); } }
    front = next;
  }
  return depth;
}
const settles = (f, label, gameRoot = NOGAME) => {
  const hp = path.join(f.d, "map", "heightmap.bmp"), b0 = fs.readFileSync(hp), mt = fs.statSync(hp).mtimeMs;
  const again = raise(f, [NEW], gameRoot);
  ok(again.changed === false && Buffer.compare(b0, fs.readFileSync(hp)) === 0 && fs.statSync(hp).mtimeMs === mt, label + " — a second raise writes nothing (#a-second-raise-must-not-re-cut-the-coast)", { changed: again.changed, pixels: again.pixels });
};

// ── i. land that reaches the top and bottom of the map ─────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ i. land touching the top and bottom rows has a beach there, as the base game's does ===");
{
  const X0 = 20, X1 = 43;
  const idAt = (x) => (x >= X0 && x <= X1 ? NEW : SEA);
  const f = makeMod(idAt, "edges");
  const r = raise(f);
  const g = grid(f);
  const depth = depthOf(idAt), flat = depthOf(idAt, { edges: false });
  let edgeOff = 0, row1Off = 0, mism = 0, firstMism = null, couldTell = 0;
  for (let x = X0; x <= X1; x++) {
    for (const y of [0, H - 1]) { if (g[y * W + x] !== RAMP[0]) edgeOff++; if (relief(x, y, flat[y * W + x]) !== RAMP[0]) couldTell++; }
    if (x > X0 && x < X1 && g[W + x] !== relief(x, 1, 2)) row1Off++;
  }
  for (let i = 0; i < W * H; i++) if (idAt(i % W) === NEW) { const x = i % W, y = (i - x) / W; if (g[i] !== relief(x, y, depth[i])) { mism++; if (!firstMism) firstMism = { x, y, depth: depth[i], got: g[i], want: relief(x, y, depth[i]) }; } }
  console.log("     row 0 of the new land: " + Array.from(g.subarray(X0, X1 + 1)).join(" "));
  ok(r.changed === true, "the raise ran", { changed: r.changed, pixels: r.pixels });
  ok(couldTell > 0, "precondition: counted only from the sea at its sides, the edge rows would not be the beach's 94 — the fixture can tell", couldTell);
  ok(edgeOff === 0, "⭐⭐⭐ the land's top and bottom rows are the beach's 94: where nothing stands at the edge, here or below, off the map is a shore, not more land", { edgeOff, beach: RAMP[0] });
  ok(row1Off === 0, "⭐⭐ …and the row inside them is the field's answer two pixels from the water", row1Off);
  ok(mism === 0, "⭐⭐ every raised pixel is the field at its depth, the edges counted as water", { mism, firstMism });
  settles(f, "⭐⭐ i.");
}

// ── ii. land at x = 0 with the sea across the date line ────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ ii. land at the west edge meets the sea at the east edge as its coast ===");
{
  const idAt = (x, y) => (x <= 9 && y >= 2 && y <= H - 3 ? NEW : SEA);
  const f = makeMod(idAt, "seam");
  raise(f);
  const g = grid(f);
  const depth = depthOf(idAt), cut = depthOf(idAt, { wrap: false });
  let westOff = 0, nextOff = 0, mism = 0, firstMism = null, couldTell = 0;
  for (let y = 3; y <= H - 4; y++) {
    if (g[y * W] !== RAMP[0]) westOff++;
    if (y >= 4 && y <= H - 5 && g[y * W + 1] !== relief(1, y, 2)) nextOff++;
    if (relief(0, y, cut[y * W]) !== RAMP[0]) couldTell++;
  }
  for (let i = 0; i < W * H; i++) { const x = i % W, y = (i - x) / W; if (idAt(x, y) === NEW && g[i] !== relief(x, y, depth[i])) { mism++; if (!firstMism) firstMism = { x, y, depth: depth[i], got: g[i], want: relief(x, y, depth[i]) }; } }
  console.log("     row 12, x 0..9: " + Array.from(g.subarray(12 * W, 12 * W + 10)).join(" ") + "   (the sea at x " + (W - 1) + " reads " + g[12 * W + W - 1] + ")");
  ok(couldTell > 0, "precondition: without the wrap x = 0 is ten pixels from the sea and not a beach — the fixture can tell", couldTell);
  ok(westOff === 0, "⭐⭐⭐ the column at x = 0 is the beach's 94: the sea across the date line is its coast", { westOff });
  ok(nextOff === 0, "⭐⭐ …and the column inside it is the field two pixels from that water", nextOff);
  ok(mism === 0, "⭐⭐ every raised pixel is the field at its depth, counted across the seam", { mism, firstMism });
  settles(f, "⭐ ii.");
}

// ── ii′. land that spans the date line: its depth is counted across it ─────────────────────────────────────────────────────────
console.log("\n=== ⛔ ii′. land spanning the date line is as deep as the walk ACROSS it says ===");
{
  // new land on x 58..63 and 0..5, sea on x 6..20 only, old land standing at 110 on x 21..57: x 63 is 7 from the sea, by the wrap
  const idAt = (x) => (x >= 58 || x <= 5 ? NEW : x <= 20 ? SEA : OLD);
  const f = makeMod(idAt, "span");
  stand(f, 110);
  raise(f);
  const g = grid(f);
  const Y = 12, at = (x) => (x <= 5 ? 6 - x : 6 + (W - x));
  const cut = depthOf(idAt, { wrap: false });
  let off = 0; const row = [];
  for (const x of [0, 1, 2, 3, 4, 5, W - 1]) { row.push([x, at(x), g[Y * W + x]]); if (g[Y * W + x] !== relief(x, Y, at(x))) off++; }
  console.log("     row " + Y + " [x, depth, height]: " + JSON.stringify(row) + "; without the wrap x " + (W - 1) + " would be at depth " + cut[Y * W + W - 1]);
  ok(cut[Y * W + W - 1] !== at(W - 1) && relief(W - 1, Y, cut[Y * W + W - 1]) !== relief(W - 1, Y, at(W - 1)), "precondition: a depth walk that stops at the seam gives x 63 another depth and another height", { cut: cut[Y * W + W - 1], wrap: at(W - 1) });
  ok(off === 0, "⭐⭐⭐ x 63 stands at the field's answer for depth 7 — the beach climbs across the date line, not up against it", row);
  settles(f, "⭐ ii′.");
}

// ── iii. land at x = 0 beside OLD land across the seam ─────────────────────────────────────────────────────────────────────────
for (const [tag, OLD_H] of [["a", 160], ["b", 100]]) {
  console.log("\n=== ⛔ iii-" + tag + ". new land at x = 0 beside old land at " + OLD_H + " across the seam stands on it ===");
  const idAt = (x) => (x <= 9 ? NEW : x <= 53 ? SEA : OLD);
  const f = makeMod(idAt, "old" + tag);
  stand(f, OLD_H);
  raise(f);
  const g = grid(f);
  const Y = 12, depth = depthOf(idAt);
  let worst = 0, worstAt = null;
  for (let y = 0; y < H; y++) { const s = Math.abs(g[y * W] - g[y * W + W - 1]); if (s > worst) { worst = s; worstAt = { y, x0: g[y * W], xEnd: g[y * W + W - 1] }; } }
  console.log("     x 0 at row " + Y + " reads " + g[Y * W] + " (depth " + depth[Y * W] + "; the field alone " + relief(0, Y, depth[Y * W]) + "), the old land across the seam " + g[Y * W + W - 1] + "; steepest step across the seam " + worst);
  ok(g[Y * W + W - 1] === OLD_H, "the old land keeps its height", g[Y * W + W - 1]);
  if (tag === "a") {
    ok(Math.abs(relief(0, Y, depth[Y * W]) - OLD_H) > S, "precondition: the field alone would stand more than S off the old land across the seam — the fixture can tell", { field: relief(0, Y, depth[Y * W]), OLD_H, S });
    ok(worst <= S, "⭐⭐⭐ no row steps more than HEIGHTMAP_RAISE_RIM_SLOPE across the date line: the cap and the lift reach across it (#a-raise-stands-on-the-land-around-it)", { worst, worstAt, S });
  } else {
    const want = Math.min(relief(0, Y, depth[Y * W]), OLD_H + S);
    ok(depth[Y * W] === 10, "precondition: old land is not water, so x 0 is ten pixels from the sea", depth[Y * W]);
    ok(g[Y * W] > RAMP[0] && g[Y * W] === want, "⭐⭐⭐ x 0 is not a beach — the seam is a neighbour, not an edge of the world — and stands within S of the land across it", { got: g[Y * W], want });
  }
  settles(f, "⭐ iii-" + tag + ".");
}

// ── iv. new land against an older coast ACROSS the seam: the old beach ring there is not water any more ──────────────────────────
console.log("\n=== ⛔ iv. a sea filled across the date line from an older coast leaves no trench under the waterline ===");
{
  // the old land on x 54..63 is raised first, while x 0..9 is still sea: its beach at x 63 faces that sea across the seam. Then
  // x 0..9 becomes land, and the raise must settle that old 94 ring with it, as it does on any other side.
  const idAt = (x) => (x <= 9 ? NEW : x <= 53 ? SEA : OLD);
  const f = makeMod(idAt, "ring", "sea");
  raise(f, [OLD]);
  const g1 = grid(f);
  let ringBefore = 0; for (let y = 1; y < H - 1; y++) if (g1[y * W + W - 1] === RAMP[0]) ringBefore++;
  toLand(f, NEW);
  raise(f);
  const g2 = grid(f);
  let under = 0, at = null;
  for (let y = 1; y < H - 1; y++) if (g2[y * W + W - 1] <= md.HEIGHTMAP_SEA_LEVEL) { under++; if (!at) at = { y, h: g2[y * W + W - 1] }; }
  console.log("     x " + (W - 1) + " rows 1.." + (H - 2) + ": " + ringBefore + " at the beach's 94 facing the sea across the seam; after the fill " + under + " still under the waterline");
  ok(ringBefore === H - 2, "precondition: the older coast built its 94 beach at x 63, facing the sea across the date line", { ringBefore, of: H - 2 });
  ok(under === 0, "⭐⭐⭐ the fill re-settles that ring with it — no one-pixel trench under the waterline down the date line (#a-second-raise-must-not-re-cut-the-coast)", { under, at });
  settles(f, "⭐ iv.");
}

// the median of what stands above the waterline on a row, and its mean — the two answers a fixture below must tell apart
const standingOn = (row) => { const up = row.filter((h) => h > md.HEIGHTMAP_SEA_LEVEL).sort((a, b) => a - b); return { n: up.length, median: up.length ? up[(up.length - 1) >> 1] : null, mean: up.length ? up.reduce((a, b) => a + b, 0) / up.length : null }; };
const RAMP_TOP = RAMP[RAMP.length - 1];

// ── the rule itself, on rows built from the ramp's top: the median of what stands decides, not its mean ─────────────────────────────
console.log("\n=== ⛔ the edge-row rule: what stands on a row, by its median against the beach ramp's top ===");
if (typeof md.mapEdgeIsShore !== "function") ok(false, "map-data.js exports mapEdgeIsShore");
else {
  const SEA_H = md.HEIGHTMAP_SEA_LEVEL;
  const row = (...runs) => runs.flatMap(([h, n]) => Array(n).fill(h));
  const beachy = row([SEA_H, 10], [RAMP_TOP, 3], [RAMP_TOP + 60, 2]), landy = row([SEA_H, 10], [RAMP_TOP + 1, 3], [SEA_H + 1, 2]);
  ok(standingOn(beachy).median === RAMP_TOP && standingOn(beachy).mean > RAMP_TOP && standingOn(landy).median > RAMP_TOP && standingOn(landy).mean <= RAMP_TOP,
    "precondition: one row a shore by its median and land by its mean, the other the reverse — the rows can tell the two apart", { beachy: standingOn(beachy), landy: standingOn(landy) });
  ok(md.mapEdgeIsShore(beachy) === true && md.mapEdgeIsShore(landy) === false, "⭐⭐ a median at most the ramp's top is a shore, over it land — whatever the mean says", { beachy: md.mapEdgeIsShore(beachy), landy: md.mapEdgeIsShore(landy) });
  ok(md.mapEdgeIsShore(row([SEA_H, 16])) === null, "⭐ nothing standing on the row says nothing (null), however much of it there is");
}

// ── v. a map that runs STANDING land into its top edge: past that edge is more of that land, not water ────────────────────────────
console.log("\n=== ⛔ v. where the map runs standing land into its top edge, new land touching that edge is no beach there ===");
{
  // Old World Blues' shape: old land standing at 135 on x 0..13 of rows 0..2, far enough from the new land on x 30..49 that
  // neither the cap nor the lift reaches it. Nothing stands on the bottom row, and there is no layer below.
  const X0 = 30, X1 = 49, OLD_H = 135;
  const idAt = (x, y) => (x >= X0 && x <= X1 ? NEW : x <= 13 && y <= 2 ? OLD : SEA);
  const f = makeMod(idAt, "standtop");
  stand(f, OLD_H);
  raise(f);
  const g = grid(f);
  const depth = depthOf(idAt, { edges: { top: false, bottom: true } }), asWater = depthOf(idAt);
  let couldTell = 0, topUnder = 0, bottomOff = 0, mism = 0, firstMism = null;
  for (let x = X0; x <= X1; x++) {
    if (relief(x, 0, asWater[x]) !== relief(x, 0, depth[x])) couldTell++;
    if (depth[x] > 1 && g[x] <= md.HEIGHTMAP_SEA_LEVEL) topUnder++;
    if (g[(H - 1) * W + x] !== RAMP[0]) bottomOff++;
  }
  for (let i = 0; i < W * H; i++) { const x = i % W, y = (i - x) / W; if (idAt(x, y) === NEW && g[i] !== relief(x, y, depth[i])) { mism++; if (!firstMism) firstMism = { x, y, depth: depth[i], got: g[i], want: relief(x, y, depth[i]) }; } }
  console.log("     row 0 of the new land: " + Array.from(g.subarray(X0, X1 + 1)).join(" ") + "   (the old land on row 0 reads " + g[0] + ")");
  ok(g[0] === OLD_H, "the old land keeps its height", g[0]);
  ok(standingOn(Array.from(g.subarray(0, W))).median > RAMP_TOP, "precondition: what stands on the top row is land over the beach ramp's top, not a shore", standingOn(Array.from(g.subarray(0, W))));
  ok(couldTell > 0, "precondition: with the top edge counted as water the new land's top row would be another answer — the fixture can tell", couldTell);
  ok(topUnder === 0, "⭐⭐⭐ v. no pixel of the new land's top row more than one pixel from the sea is under the waterline: no strip of 94 along the edge inside the land", { topUnder });
  ok(mism === 0, "⭐⭐ v. every raised pixel is the field at its depth, the top edge counted as land and the bottom as water", { mism, firstMism });
  ok(bottomOff === 0, "⭐⭐ v. …while the bottom edge, where nothing stands and nothing lies below, is still a shore: its row is the beach's 94", { bottomOff });
  settles(f, "⭐ v.");
}

// ── vi. nothing stands on the map's own edge rows (what Delete map leaves): the layer below says whether each edge is a shore ─────
// vi is an add-on over that layer (Old World Blues' add-ons: the review's case); vi′ a mod that declares replace_path="map", where
// the layer below still answers, as it does for every …Beneath reader of a Generate land click (#a-generated-world-keeps-the-date-line-at-sea).
for (const [V, replacesMap] of [["vi", false], ["vi′", true]]) {
  console.log("\n=== ⛔ " + V + ". where nothing stands on the map's own edge row, the layer below says whether that edge is a shore" + (replacesMap ? ' — on a mod that replaces map' : " — on an add-on") + " ===");
  // the layer below runs standing land into its top row (135), and its bottom row is Millennium Dawn's shape: a beach at 97 with
  // land standing at 161 behind a quarter of it — a shore by its median, land by its mean.
  const X0 = 20, X1 = 43;
  const idAt = (x) => (x >= X0 && x <= X1 ? NEW : SEA);
  const hBelow = (x, y) => (y === 0 ? 135 : y === H - 1 ? (x % 4 === 0 ? 161 : 97) : 89);
  const game = makeBelow(replacesMap ? "vi-tc" : "vi", hBelow);
  const f = makeMod(idAt, replacesMap ? "belowedge-tc" : "belowedge");
  if (!replacesMap) fs.writeFileSync(path.join(f.d, "descriptor.mod"), 'name="MAPENDS"\n');
  const g0 = grid(f);
  raise(f, [NEW], game);
  const g = grid(f);
  const depth = depthOf(idAt, { edges: { top: false, bottom: true } }), asWater = depthOf(idAt);
  const top = standingOn(Array.from({ length: W }, (_, x) => hBelow(x, 0))), bottom = standingOn(Array.from({ length: W }, (_, x) => hBelow(x, H - 1)));
  let couldTell = 0, topOff = 0, bottomOff = 0, mism = 0, firstMism = null;
  for (let x = X0; x <= X1; x++) {
    if (relief(x, 0, asWater[x]) !== relief(x, 0, depth[x])) couldTell++;
    if (g[x] !== relief(x, 0, depth[x])) topOff++;
    if (g[(H - 1) * W + x] !== RAMP[0]) bottomOff++;
  }
  for (let i = 0; i < W * H; i++) { const x = i % W, y = (i - x) / W; if (idAt(x, y) === NEW && g[i] !== relief(x, y, depth[i])) { mism++; if (!firstMism) firstMism = { x, y, depth: depth[i], got: g[i], want: relief(x, y, depth[i]) }; } }
  console.log("     row 0 of the new land: " + Array.from(g.subarray(X0, X1 + 1)).join(" ") + "; the layer below's top row stands at a median " + top.median + ", its bottom at " + bottom.median + " (mean " + bottom.mean.toFixed(1) + ")");
  ok(/replace_path="map"/.test(fs.readFileSync(path.join(f.d, "descriptor.mod"), "utf8")) === replacesMap, "precondition: the mod " + (replacesMap ? "declares" : "does not declare") + ' replace_path="map"');
  ok(standingOn(Array.from(g0.subarray(0, W))).n === 0 && standingOn(Array.from(g0.subarray((H - 1) * W))).n === 0, "precondition: before the raise nothing stood on the mod's own edge rows — only the layer below can answer");
  ok(top.median > RAMP_TOP && bottom.median <= RAMP_TOP && bottom.mean > RAMP_TOP, "precondition: the layer below's top row is land, and its bottom row a shore by its median but land by its mean — the fixture can tell which is asked", { top, bottom, RAMP_TOP });
  ok(couldTell > 0, "precondition: with the top edge counted as water the new land's top row would be another answer", couldTell);
  ok(topOff === 0, "⭐⭐⭐ " + V + ". the new land's top row is the field with the top edge counted as land: the layer below runs its land into it", { topOff });
  ok(mism === 0, "⭐⭐ " + V + ". every raised pixel is the field at its depth, the top edge counted as land and the bottom as water", { mism, firstMism });
  ok(bottomOff === 0, "⭐⭐ " + V + ". …and the bottom row is the beach's 94: the layer below's bottom row is a shore by its median, the land behind a quarter of it notwithstanding", { bottomOff });
  settles(f, "⭐ " + V + ".", game);
}

// ── vii. the base game's own edge rows, asked as the raise asks a layer below's ────────────────────────────────────────────────────
console.log("\n=== vii. the base game's top row is a shore, and nothing stands on its bottom row ===");
{
  const hp = path.join(GAME, "map", "heightmap.bmp");
  if (typeof md.mapEdgeIsShore !== "function") ok(false, "map-data.js exports mapEdgeIsShore");
  else if (!fs.existsSync(hp)) console.log("  SKIP vii: the base game is not installed at " + GAME + ", so its edge rows cannot be read");
  else {
    const b = fs.readFileSync(hp), off = b.readUInt32LE(10), w = b.readInt32LE(18), h0 = b.readInt32LE(22), h = Math.abs(h0), rs = (w + 3) & ~3;
    const row = (y) => { const s = off + (h0 > 0 ? h - 1 - y : y) * rs; return Array.from(b.subarray(s, s + w)); };
    const top = row(0), bottom = row(h - 1);
    console.log("     top row: " + JSON.stringify(standingOn(top)) + "; bottom row: " + JSON.stringify(standingOn(bottom)));
    ok(md.mapEdgeIsShore(top) === true, "⭐⭐ vii. the base game's top row is a shore — the owner's flow (Delete map, then Generate land over it) keeps the beach along the top edge", standingOn(top));
    ok(md.mapEdgeIsShore(bottom) === null, "⭐ vii. …and nothing stands on its bottom row, which says nothing: that edge is a shore by default", standingOn(bottom));
  }
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp dir */ } }
console.log(`\n=== a raise knows where the map ends: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((l) => console.log("   FAILED: " + l));
process.exit(fails.length ? 1 : 0);
