// ⛔ #a-generated-coast-is-not-the-oceans-border — A ROUGH COAST MOVES PIXELS BETWEEN LAND AND SEA, AND CHANGES NOTHING ELSE.
//
// Generate land retypes whole sea provinces, so every coast it made was an old province border — the smooth arcs the base game
// draws between two OCEAN provinces (TEST 31: 0.0078 coast edges per land pixel against vanilla's 0.0265). roughenCoastline moves
// the pixels along that coast between the raised province and the sea beside it, and the whole design rests on what it must NOT do:
// make or lose a province pair, move a land-land border, cut a province in two, take one below its floor, leave a 1-px strait,
// neck, checkerboard or X-crossing, move a frozen pixel, give a province pixels on both sides of the date line
// (#a-rough-coast-does-not-cross-the-date-line — the prototype left three sea provinces spanning it on every seed), or grow a
// province's box past an eighth of the map (#a-rough-coast-keeps-a-province-within-an-eighth — Map Errors' province_too_large).
//
// A PROPERTY TEST over 40 seeded worlds of Voronoi provinces (land the click raises, land it does not, sea, lake; frozen dots),
// a quarter of them with a coast lying along the seam itself. The test carries its OWN checker, written here and sharing nothing
// with map-data.js; verifyCoastlineMove (the writer's refuse-to-write guard) must agree with it on every world, and must refuse
// seven rasters broken by hand — among them the two kinds of damage roughenCoastline never does itself (a province below its
// floor, a frozen pixel moved), which no world reaches. Every expected number is derived from the fixture or the exported settings.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rough-coast-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const W = 160, H = 96, MIN_PX = 8, KEEP = md.COAST_ROUGHEN.keep, FIXTURES = 40;
const rng = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const sha = (ids) => crypto.createHash("sha256").update(Buffer.from(ids.buffer, ids.byteOffset, ids.byteLength)).digest("hex");

/** One world: Voronoi provinces by wrapped distance, types drawn per province, frozen 3×3 dots. Every fourth world also gets a pair
 *  of provinces either side of the seam — a raised land in columns 0.., a sea in columns ..W-1 — so a stretch of its coast IS the
 *  line between column W-1 and 0. The pair is smaller than an eighth of the map each way, so it is the date-line guard, and not the
 *  box rule (which refuses any growth of a province already past an eighth), that keeps the sea out of column 0. */
function world(k) {
  const r = rng(1000 + k * 7919);
  const sites = [];
  const n = 36 + Math.floor(r() * 24);
  for (let s = 0; s < n; s++) sites.push([r() * W, r() * H]);
  const seam = k % 4 === 0;
  const ids = new Int32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = 0, bd = Infinity;
    sites.forEach(([sx, sy], s) => { const dx = Math.min(Math.abs(x + 0.5 - sx), W - Math.abs(x + 0.5 - sx)), dy = y + 0.5 - sy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = s; } });
    ids[y * W + x] = best + 1;
  }
  const type = new Map(), raised = new Set();
  for (let s = 1; s <= sites.length; s++) {
    const t = r();
    if (t < 0.45) { type.set(s, "land"); if (r() < 0.8) raised.add(s); } else if (t < 0.93) type.set(s, "sea"); else type.set(s, "lake");
  }
  if (seam) {
    const sea = sites.length + 1, land = sites.length + 2, rows = H / 8 - 2, wide = 8, y0 = 10 + Math.floor(r() * (H - 20 - rows));
    for (let y = y0; y < y0 + rows; y++) for (let d = 0; d < wide; d++) { ids[y * W + d] = land; ids[y * W + W - 1 - d] = sea; }
    type.set(sea, "sea"); type.set(land, "land"); raised.add(land);
  }
  const frozen = new Uint8Array(W * H);
  for (let d = 0; d < 6; d++) { const cx = Math.floor(r() * W), cy = 1 + Math.floor(r() * (H - 2)); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) frozen[(cy + dy) * W + (cx + dx + W) % W] = 1; }
  const isLand = (p) => raised.has(p), isSea = (p) => type.get(p) === "sea";
  return { k, ids, type, raised, frozen, isLand, isSea, seam, seed: 1 + k };
}

// ── the test's own checker: nothing here comes from map-data.js ──────────────────────────────────────────────────────────────
function check(w, after) {
  const before = w.ids, wet = (p) => w.type.get(p) === "sea";
  const v = { wrongKind: 0, pairs: 0, borders: 0, pieces: 0, floor: 0, shape: 0, frozen: 0, seam: 0, box: 0 };
  const touched = new Set();
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) {
    touched.add(before[i]); touched.add(after[i]);
    if (!((w.isLand(before[i]) && w.isSea(after[i])) || (w.isSea(before[i]) && w.isLand(after[i])))) v.wrongKind++;
    if (w.frozen[i]) v.frozen++;
  }
  const borders = (ids) => { const m = new Map(), add = (a, b) => { if (a === b) return; const k = Math.min(a, b) + "-" + Math.max(a, b); m.set(k, (m.get(k) || 0) + 1); };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { add(ids[y * W + x], ids[y * W + (x + 1) % W]); if (y + 1 < H) add(ids[y * W + x], ids[(y + 1) * W + x]); } return m; };
  const bb = borders(before), ba = borders(after);
  for (const k of new Set([...bb.keys(), ...ba.keys()])) {
    if (!bb.has(k) || !ba.has(k)) { v.pairs++; continue; }
    const [a, b] = k.split("-").map(Number);
    const coast = (w.isLand(a) && w.isSea(b)) || (w.isSea(a) && w.isLand(b));
    if (!coast && bb.get(k) !== ba.get(k)) v.borders++;
  }
  const pieces = (ids) => { const seen = new Uint8Array(W * H), m = new Map();
    for (let s = 0; s < W * H; s++) { if (seen[s]) continue; const p = ids[s]; m.set(p, (m.get(p) || 0) + 1); const st = [s]; seen[s] = 1;
      while (st.length) { const c = st.pop(), x = c % W, y = (c - x) / W; for (const q of [y * W + (x + 1) % W, y * W + (x + W - 1) % W, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1]) if (q >= 0 && !seen[q] && ids[q] === p) { seen[q] = 1; st.push(q); } } }
    return m; };
  const pb = pieces(before), pa = pieces(after);
  for (const p of new Set([...pb.keys(), ...pa.keys()])) if ((pb.get(p) || 0) !== (pa.get(p) || 0)) v.pieces++;
  const area = (ids) => { const m = new Map(); for (const p of ids) m.set(p, (m.get(p) || 0) + 1); return m; };
  const ab = area(before), aa = area(after);
  for (const [p, n0] of ab) { const n = aa.get(p) || 0; if (n < n0 && n < Math.max(MIN_PX, Math.ceil(KEEP * n0))) v.floor++; }
  // a feature at a pixel: 1-px strait or neck either way (by water), a 2×2 checkerboard or an X-crossing with it at the top left
  const feat = (ids, q) => { const x = q % W, y = (q - x) / W, d = !wet(ids[q]); let f = 0;
    const l = !wet(ids[y * W + (x + W - 1) % W]), r = !wet(ids[y * W + (x + 1) % W]); if (l === r && l !== d) f |= 1;
    if (y > 0 && y < H - 1) { const u = !wet(ids[q - W]), dn = !wet(ids[q + W]); if (u === dn && u !== d) f |= 2; }
    if (y < H - 1) { const a = ids[q], b = ids[y * W + (x + 1) % W], c = ids[q + W], e = ids[(y + 1) * W + (x + 1) % W];
      if (a === e && b === c && a !== b) f |= 4; if (a !== b && a !== c && a !== e && b !== c && b !== e && c !== e) f |= 8; }
    return f; };
  for (let q = 0; q < W * H; q++) if (feat(after, q) & ~feat(before, q)) v.shape++;
  const spanning = (ids) => { const l = new Set(), r = new Set(); for (let y = 0; y < H; y++) { l.add(ids[y * W]); r.add(ids[y * W + W - 1]); } return new Set([...l].filter((p) => r.has(p))); };
  const sb = spanning(before), sa = spanning(after); for (const p of sa) if (!sb.has(p)) v.seam++;
  // Map Errors' province_too_large: a box past W/8 wide (on both edge columns it is judged on its height alone) or H/8 tall — a
  // province pushed past it, or one already past it whose box grew (#a-rough-coast-keeps-a-province-within-an-eighth)
  const boxes = (ids) => { const m = new Map(); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = ids[y * W + x], b = m.get(p); if (!b) m.set(p, [x, x, y, y]); else { b[0] = Math.min(b[0], x); b[1] = Math.max(b[1], x); b[3] = y; } } return m; };
  const tooBig = (b, span) => (!span && b[1] - b[0] + 1 > W / 8) || b[3] - b[2] + 1 > H / 8;
  const xb = boxes(before);
  for (const [p, b] of boxes(after)) { const o = xb.get(p); if (tooBig(b, sa.has(p)) && (!o || !tooBig(o, sb.has(p)) || b[0] < o[0] || b[1] > o[1] || b[2] < o[2] || b[3] > o[3])) v.box++; }
  v.total = Object.values(v).reduce((a, b) => a + b, 0);
  return v;
}

const worlds = [];
for (let k = 0; k < FIXTURES; k++) worlds.push(world(k));
const seamWorlds = worlds.filter((w) => w.seam);

console.log("\n-- the fixtures --");
{
  // what makes a seam fixture: a raised province and a sea that meet ACROSS the seam, each on its own side of it
  const acrossSeam = (w) => { for (let y = 0; y < H; y++) { const a = w.ids[y * W + W - 1], b = w.ids[y * W]; if (a !== b && ((w.isLand(a) && w.isSea(b)) || (w.isSea(a) && w.isLand(b)))) return true; } return false; };
  ok(seamWorlds.length === FIXTURES / 4 && seamWorlds.every(acrossSeam), `(the fixtures: ${FIXTURES} worlds, ${seamWorlds.length} with a coast running along the seam between column ${W - 1} and column 0)`);
  const lakes = worlds.filter((w) => [...w.type.values()].includes("lake")).length;
  const kept = worlds.filter((w) => [...w.type.keys()].some((p) => w.type.get(p) === "land" && !w.raised.has(p))).length;
  ok(lakes > FIXTURES / 2 && kept > FIXTURES / 2, `(…${lakes} of them with lakes and ${kept} with land the click does not raise, neither of which may move)`, { lakes, kept });
  // CONTROL: the checker sees a violation of each kind it judges, on a raster broken on purpose
  const w = worlds[0], bad = w.ids.slice();
  const land = [...w.raised][0]; const i = bad.findIndex((p) => p === land);
  bad[i] = [...w.type.keys()].find((p) => w.type.get(p) === "lake") || 999;
  ok(check(w, bad).wrongKind === 1, "CONTROL: the test's own checker catches a pixel moved into a province that may not take it");
}

console.log("\n-- ⭐⭐⭐ 40 worlds roughened: only coast moved, and nothing else changed --");
const handed = worlds.map((w) => sha(w.ids));
const runs = worlds.map((w) => {
  const r = md.roughenCoastline({ W, H, ids: w.ids, isMovableLand: w.isLand, isMovableSea: w.isSea, frozen: w.frozen, seed: w.seed, minPx: MIN_PX });
  return { w, r, c: check(w, r.ids), v: md.verifyCoastlineMove({ W, H, before: w.ids, after: r.ids, isLand: w.isLand, isSea: w.isSea, frozen: w.frozen, minPx: MIN_PX }) };
});
const failing = (key) => runs.filter((x) => x.c[key]).map((x) => ({ world: x.w.k, n: x.c[key] }));
ok(runs.every((x) => sha(x.w.ids) === handed[x.w.k] && x.r.ids !== x.w.ids), "it is pure: the raster it was handed is byte-for-byte what it was, and the answer is a copy");
ok(!failing("wrongKind").length, "⭐⭐ every moved pixel went between a raised province and a sea — no lake, no land the click did not raise", failing("wrongKind"));
ok(!failing("pairs").length, "⭐⭐⭐ no province pair made or lost (the exactly-two-provinces 3×3 rule)", failing("pairs"));
ok(!failing("borders").length, "⭐⭐ …and every border that is not a coast keeps its length: land-land, sea-sea, lake shores", failing("borders"));
ok(!failing("pieces").length, "⭐⭐⭐ no province cut in two or joined up: every province has the pieces it had (the simple-point test)", failing("pieces"));
ok(!failing("floor").length, `⭐⭐ no province shrank below max(${MIN_PX} px, ${KEEP} × its area)`, failing("floor"));
ok(!failing("frozen").length, "⭐⭐ not one frozen pixel moved", failing("frozen"));
ok(!failing("shape").length, "⭐⭐ no new 1-px strait, 1-px neck, checkerboard or X-crossing at any pixel, the seam included", failing("shape"));
ok(!failing("seam").length, "⭐⭐⭐ no province has pixels on both sides of the date line that did not have them (#a-rough-coast-does-not-cross-the-date-line)", failing("seam"));
ok(!failing("box").length, `⭐⭐ no province's box grown past an eighth of the map (${W / 8} × ${H / 8} px here: Map Errors' province_too_large)`, failing("box"));
// the chunk undo is what keeps the growth clean; the repair pass behind it is a safety net that should find nothing to do
ok(runs.every((x) => x.r.stats.repair.rounds === 0), "⭐⭐ the all-or-nothing chunks leave the repair pass nothing to repair, on every world", runs.filter((x) => x.r.stats.repair.rounds).map((x) => ({ world: x.w.k, repair: x.r.stats.repair })));
const movedWorlds = runs.filter((x) => x.r.moved.length > 0).length;
ok(movedWorlds >= FIXTURES - FIXTURES / 8, `⭐⭐ …and it is not idle: ${movedWorlds} of ${FIXTURES} worlds had coast reshaped`, runs.map((x) => x.r.moved.length));
ok(runs.every((x) => x.r.moved.length === x.r.stats.toLand + x.r.stats.toSea && x.r.moved.every((i) => x.r.ids[i] !== x.w.ids[i])), "its own count of what moved is what moved");
const seamRefused = runs.filter((x) => x.w.seam).reduce((n, x) => n + x.r.stats.refused.seam, 0);
ok(seamRefused > 0, `(the seam fixtures do ask: ${seamRefused} moves were refused for crossing the date line)`, seamRefused);
const boxRefused = runs.reduce((n, x) => n + x.r.stats.refused.box, 0);
ok(boxRefused > 0, `(…and the boxes do bind: ${boxRefused} moves were refused for taking a province past an eighth of the map)`, boxRefused);

console.log("\n-- ⭐⭐ the noise leans neither way --");
{
  // A noise centred on 0 is a fair coin at each of its largest lattice cells, so the coast it moves goes to land about as often as to
  // sea: summed over every world, the lean is within three standard errors of a fair coin over the cells the moves fall in. A 0..1
  // noise dropped in uncentred would push every coast out by up to amp/2 and fail this by far.
  const wl = md.COAST_ROUGHEN.maxWave, nx = Math.max(1, Math.round(W / wl)), cw = W / nx;
  let toLand = 0, toSea = 0, cells = 0;
  for (const x of runs) {
    toLand += x.r.stats.toLand; toSea += x.r.stats.toSea;
    cells += new Set(x.r.moved.map((i) => Math.floor((i % W) / cw) + "," + Math.floor(Math.floor(i / W) / wl))).size;
  }
  const lean = Math.abs(toLand - toSea) / (toLand + toSea), bound = 3 / Math.sqrt(cells);
  ok(lean < bound, `⭐⭐ ${toLand} px to land, ${toSea} to sea: a lean of ${lean.toFixed(3)}, inside ${bound.toFixed(3)} (3 / √${cells} lattice cells)`, { toLand, toSea, lean, bound, cells });
}

console.log("\n-- ⭐⭐ the same seed gives the same coast --");
{
  const again = worlds.map((w) => md.roughenCoastline({ W, H, ids: w.ids, isMovableLand: w.isLand, isMovableSea: w.isSea, frozen: w.frozen, seed: w.seed, minPx: MIN_PX }));
  ok(again.every((r, k) => sha(r.ids) === sha(runs[k].r.ids)), "⭐⭐ every world, roughened twice with its seed: byte-identical (sha256)");
  const other = worlds.map((w) => md.roughenCoastline({ W, H, ids: w.ids, isMovableLand: w.isLand, isMovableSea: w.isSea, frozen: w.frozen, seed: w.seed + 1000, minPx: MIN_PX }));
  ok(other.some((r, k) => sha(r.ids) !== sha(runs[k].r.ids)), "CONTROL: …and another seed gives another coast, so the hash is looking at something");
}

console.log("\n-- ⭐⭐⭐ verifyCoastlineMove, the writer's guard, agrees with this test's checker --");
{
  const disagree = runs.filter((x) => x.v.ok !== (x.c.total === 0)).map((x) => ({ world: x.w.k, verify: x.v.counts, checker: x.c }));
  ok(!disagree.length, `⭐⭐ on all ${FIXTURES} worlds: it passes exactly the rasters this test passes`, disagree);
  ok(runs.every((x) => x.v.moved === x.r.moved.length), "…and counts the same pixels moved");
  // seven rasters broken by hand, each with one kind of damage the guard exists to stop
  const box = (W2, H2, fn) => { const a = new Int32Array(W2 * H2); for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) a[y * W2 + x] = fn(x, y); return a; };
  const P = 1, P2 = 3, S = 2, S2 = 4;
  const land = (p) => p === P || p === P2, sea = (p) => p === S || p === S2;
  const judge = (W2, H2, before, after) => md.verifyCoastlineMove({ W: W2, H: H2, before, after, isLand: land, isSea: sea, minPx: 1, keep: 0 });
  // (1) a split: a land block, and a column of it handed to the sea
  {
    const before = box(16, 10, (x, y) => (x >= 3 && x < 13 && y >= 3 && y < 7 ? P : S)), after = before.slice();
    for (let y = 3; y < 7; y++) after[y * 16 + 8] = S;
    const v = judge(16, 10, before, after);
    ok(!v.ok && v.counts.pieces > 0, "⭐⭐ it refuses a province cut in two", v.counts);
  }
  // (2) a new pair: two islands two pixels apart, and the gap between them filled with one of them
  {
    const before = box(16, 10, (x, y) => (y >= 3 && y < 7 ? (x >= 2 && x < 6 ? P : x >= 8 && x < 12 ? P2 : S) : S)), after = before.slice();
    for (let y = 4; y < 6; y++) { after[y * 16 + 6] = P; after[y * 16 + 7] = P; }
    const v = judge(16, 10, before, after);
    ok(!v.ok && v.counts.pairs > 0, "⭐⭐ it refuses a pair of provinces that did not touch before", v.counts);
  }
  // (3) a new neck: a straight coast, and one sea pixel off it made a one-pixel-wide spit
  {
    const before = box(16, 10, (x, y) => (y < 5 ? P : S)), after = before.slice();
    after[5 * 16 + 8] = P; after[6 * 16 + 8] = P;
    const v = judge(16, 10, before, after);
    ok(!v.ok && v.counts.shape > 0, "⭐⭐ it refuses a one-pixel neck the coast did not have", v.counts);
  }
  // (4) a seam span: a sea in the last column, land in the first; one land pixel in column 0 handed to that sea
  {
    const before = box(16, 10, (x) => (x === 15 ? S2 : x < 8 ? P : S)), after = before.slice();
    after[5 * 16 + 0] = S2;
    const v = judge(16, 10, before, after);
    ok(!v.ok && v.counts.seam > 0, "⭐⭐⭐ it refuses a province given pixels on both sides of the date line", v.counts);
  }
  // (5) past an eighth: on a 64 × 32 map (an eighth is 8 × 4 px) a 6 × 4 island grown one row taller along its whole south shore
  {
    const W5 = 64, H5 = 32, before = box(W5, H5, (x, y) => (x >= 20 && x < 26 && y >= 10 && y < 14 ? P : S)), after = before.slice();
    for (let x = 20; x < 26; x++) after[14 * W5 + x] = P;
    const v = judge(W5, H5, before, after);
    ok(!v.ok && v.counts.box > 0 && v.counts.shape === 0 && v.counts.pieces === 0, "⭐⭐ it refuses a province grown past an eighth of the map — and only for that", v.counts);
  }
  // roughenCoastline never breaks the last two rules itself, so no world above reaches those refusals; the province split (batch B)
  // will hand this guard rasters it did not make. A 4 × 4 island, and its north rows handed to the sea:
  const isle = () => box(16, 10, (x, y) => (x >= 6 && x < 10 && y >= 3 && y < 7 ? P : S));
  const only = (v, k) => Object.entries(v.counts).every(([c, n]) => (c === k ? n > 0 : n === 0));
  // (6) below its floor: two rows of the island's four go, 16 px → 8 — under keep × 16 = 12, and under a minPx of 12
  {
    const before = isle(), after = before.slice();
    for (let y = 3; y < 5; y++) for (let x = 6; x < 10; x++) after[y * 16 + x] = S;
    const n0 = before.filter((p) => p === P).length, n = after.filter((p) => p === P).length, keep = KEEP, minPx = Math.ceil(n0 * KEEP);
    const byKeep = md.verifyCoastlineMove({ W: 16, H: 10, before, after, isLand: land, isSea: sea, minPx: 1, keep });
    const byMin = md.verifyCoastlineMove({ W: 16, H: 10, before, after, isLand: land, isSea: sea, minPx, keep: 0 });
    const free = judge(16, 10, before, after);
    ok(n < Math.ceil(n0 * keep) && n < minPx && free.ok, `(the move: ${n0} px → ${n}, a legal move once no floor is asked)`, { n0, n, free: free.counts });
    ok(!byKeep.ok && only(byKeep, "floor"), `⭐⭐ it refuses a province taken below ${keep} × its area — and only for that`, byKeep.counts);
    ok(!byMin.ok && only(byMin, "floor"), `⭐⭐ …and below the province-size floor (${minPx} px) — and only for that`, byMin.counts);
  }
  // (7) a frozen pixel moved: the island's north row handed to the sea (a legal move), one of its pixels frozen
  {
    const before = isle(), after = before.slice();
    for (let x = 6; x < 10; x++) after[3 * 16 + x] = S;
    const frozen = new Uint8Array(16 * 10), held = 3 * 16 + 7; frozen[held] = 1;
    const v = md.verifyCoastlineMove({ W: 16, H: 10, before, after, isLand: land, isSea: sea, minPx: 1, keep: 0, frozen });
    const elsewhere = new Uint8Array(16 * 10); elsewhere[5 * 16 + 7] = 1;
    const kept = md.verifyCoastlineMove({ W: 16, H: 10, before, after, isLand: land, isSea: sea, minPx: 1, keep: 0, frozen: elsewhere });
    ok(judge(16, 10, before, after).ok && kept.ok, "(the move is legal with no pixel of it frozen, and with a frozen pixel it leaves alone)", kept.counts);
    ok(!v.ok && only(v, "frozen") && v.counts.frozen === 1, "⭐⭐ it refuses a move of a frozen pixel — and only for that", v.counts);
  }
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
