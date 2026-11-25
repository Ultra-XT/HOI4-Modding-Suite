// ⛔ #a-generated-terrain-follows-the-latitude-below — THE JUNGLE GROWS WHERE THE LAYER BELOW GROWS IT, AND THE DESERT DOES NOT PILE UP
// IN THE SOUTH.
//
// TEST 33's rehearsal (Delete map → Generate land 35% seed 1 → Auto-fix → Redraw), terrain per eighth of the map, north to south:
//     jungle   t33a 0 · 0 · 0 · 1.37 · 2.68 · 3.18 · 0.22 · 0 %  (40 provinces)     vanilla 0 · 0 · 0 · 0.99 · 17.14 · 39.59 · 7.92 · 0 %  (477)
//     desert   t33a … 6.97 · 4.33 · 5.77 · 26.09 · 23.26 %                         vanilla … 20.95 · 8.47 · 2.2 · 6.86 · 14.23 %
// generatedTerrainTypes cut each elevation slice by TERRAIN_BY_ELEVATION's mix alone, latitude playing no part, and the latitude pass
// after it (keepTerrainToItsLatitudes) only ever moves a terrain OUT of a band the layer below grows (almost) none of it in — so
// jungle made in the north was moved away and nothing put jungle where it belongs: 73 → 40 on seed 1. And desert, the most inland
// terrain of all, took the inland end of every slice, which on a map whose coast is in the north is the south.
//
// So the weight of each terrain is the slice's mix times a LIFT: the layer below's share of it in the province's latitude band over
// its share across all of them (1 where a band has fewer than LATITUDE_TREE_MIN_BLOCKS provinces below), made continuous by blending
// linearly between band centres so no band edge becomes a seam, and 0 where the pass would move it anyway. Each slice is ranked "most
// coastal first" within each latitude band, blended the same way, so a band whose land is all inland cannot take the inland end of
// every cut.
//
// Pure, on generatedTerrainTypes: a 48 × 64 grid of provinces under two rows of sea — so the north is the coast and the south the
// interior, the shape that piled the desert up — with a synthetic layer below that grows forest only in bands 0-1, desert only in 2
// and 7, jungle only in 4-5, and no marsh at all. Every expected number is derived here from that mix, the module's
// TERRAIN_BY_ELEVATION and the rule written out above, never typed.
"use strict";
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};

const COLS = 48, ROWS = 64, SEA_ROWS = 2, B = md.LATITUDE_BANDS, SEED = 7;
const idAt = (c, r) => r * COLS + c + 1, rowOf = (id) => Math.floor((id - 1) / COLS), colOf = (id) => (id - 1) % COLS;
const picked = [];
for (let r = SEA_ROWS; r < ROWS; r++) for (let c = 0; c < COLS; c++) picked.push(String(idAt(c, r)));
const ids = picked.map(Number), land = new Set(ids);
const adj = new Map();
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const nb = [];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = c + dc, b = r + dr; if (a >= 0 && a < COLS && b >= 0 && b < ROWS) nb.push(idAt(a, b)); }
  adj.set(idAt(c, r), nb);
}
// a smooth ground that varies across the map in both directions, so every elevation slice reaches every latitude
const elevationOf = new Map(ids.map((id) => [id, 110 + 25 * Math.sin(colOf(id) / 6.5) * Math.cos(rowOf(id) / 7.5) + 12 * Math.sin((colOf(id) + 2 * rowOf(id)) / 11)]));
const latitudeOf = new Map(ids.map((id) => [id, (rowOf(id) + 0.5) / ROWS]));
const palette = ["plains", "forest", "hills", "mountain", "desert", "jungle", "marsh"];
// the layer below, per latitude band: provinces of each terrain (terrainMixByLatitude's own shape)
const BELOW = [
  { plains: 40, forest: 30, hills: 15, mountain: 15 },
  { plains: 40, forest: 30, hills: 15, mountain: 15 },
  { plains: 40, desert: 30, hills: 15, mountain: 15 },
  { plains: 55, hills: 25, mountain: 20 },
  { plains: 40, jungle: 30, hills: 15, mountain: 15 },
  { plains: 40, jungle: 30, hills: 15, mountain: 15 },
  { plains: 55, hills: 25, mountain: 20 },
  { plains: 40, desert: 30, hills: 15, mountain: 15 },
];
const mixOf = (rows) => ({ bands: rows.map((o) => new Map(Object.entries(o))), totals: rows.map((o) => Object.values(o).reduce((a, v) => a + v, 0)), from: "fixture" });
const MIX = mixOf(BELOW);
const run = (extra) => md.generatedTerrainTypes({ picked, adj, landAfter: land, seed: SEED, palette, elevationOf, ...extra });

// ── the rule, written out here: the band lift, blended between band centres, gated by the latitude pass's own floor ────────────────
const bandOf = (f) => Math.max(0, Math.min(B - 1, Math.floor(B * f)));
const share = (mix, b, t) => (mix.totals[b] ? (mix.bands[b].get(t) || 0) / mix.totals[b] : null);
const liftModel = (mix, { blend = true, gate = true } = {}) => {
  const all = new Map(); let n = 0;
  mix.bands.forEach((m, b) => { for (const [t, k] of m) all.set(t, (all.get(t) || 0) + k); n += mix.totals[b]; });
  const L = (b, t) => { const whole = n ? (all.get(t) || 0) / n : 0; return !whole || mix.totals[b] < md.LATITUDE_TREE_MIN_BLOCKS ? 1 : share(mix, b, t) / whole; };
  return (f, t) => {
    const own = bandOf(f);
    if (gate && mix.totals[own] && share(mix, own, t) < md.LATITUDE_TERRAIN_FLOOR) return 0;
    if (!blend) return L(own, t);
    const g = B * f - 0.5, b0 = Math.max(0, Math.min(B - 1, Math.floor(g))), b1 = Math.min(B - 1, b0 + 1), u = Math.max(0, Math.min(1, g - b0));
    return L(b0, t) * (1 - u) + L(b1, t) * u;
  };
};
// the elevation slices, cut as generatedTerrainTypes cuts them: by the relief averaged TERRAIN_RELIEF_SMOOTHING times over the graph
const sliceOf = (() => {
  let v = new Map(elevationOf);
  for (let k = 0; k < md.TERRAIN_RELIEF_SMOOTHING; k++) { const w = new Map(); for (const [id, x] of v) { let s = x, m = 1; for (const nb of adj.get(id)) if (v.has(nb)) { s += v.get(nb); m++; } w.set(id, s / m); } v = w; }
  const order = ids.slice().sort((p, q) => v.get(p) - v.get(q) || p - q), out = new Map();
  let at = 0;
  md.TERRAIN_BY_ELEVATION.forEach((band, e) => { const end = Math.round(band.upTo * order.length); for (const id of order.slice(at, end)) out.set(id, e); at = end; });
  return out;
})();
// what each province is expected to be, in expectation: its slice's mix times the lift, over the palette the module may write
const usable = Object.keys(md.TERRAIN_HOPS_FROM_SEA).filter((t) => palette.includes(t));
const expectedOf = (lift) => {
  const out = new Map();
  for (const id of ids) {
    const mix = md.TERRAIN_BY_ELEVATION[sliceOf.get(id)].mix;
    let w = usable.map((t) => [t, (mix[t] || 0) * lift(latitudeOf.get(id), t)]).filter(([, x]) => x > 0);
    if (!w.length) w = usable.map((t) => [t, mix[t] || 0]).filter(([, x]) => x > 0);
    const tot = w.reduce((a, [, x]) => a + x, 0);
    out.set(id, new Map(w.map(([t, x]) => [t, x / tot])));
  }
  return out;
};
const EXP = expectedOf(liftModel(MIX));
const sumExp = (pred, t) => { let s = 0; for (const id of ids) if (pred(id)) s += EXP.get(id).get(t) || 0; return s; };
const count = (terr, pred, t) => { let n = 0; for (const id of ids) if (pred(id) && terr.get(id) === t) n++; return n; };
const inBands = (...bs) => (id) => bs.includes(bandOf(latitudeOf.get(id)));

const got = run({ latitudeOf, latitudeMix: MIX });
const flat = run({});
ok(got.size === ids.length && flat.size === ids.length, "the fixture: every province gets a terrain, with the layer below and without it", { got: got.size, flat: flat.size, of: ids.length });

console.log("\n-- ⭐ C1. jungle where the layer below grows it, and nowhere else --");
{
  const outside = count(got, inBands(0, 1, 2, 3, 6, 7), "jungle"), inside = count(got, inBands(4, 5), "jungle"), want = sumExp(inBands(4, 5), "jungle");
  const flatInside = count(flat, inBands(4, 5), "jungle");
  console.log(`     jungle in bands 4-5: ${inside} (expected ${want.toFixed(1)}; the elevation table alone gave ${flatInside}); elsewhere ${outside}`);
  ok(outside === 0, "⭐⭐⭐ C1. not one province outside bands 4-5 is jungle — the latitude below grows none there", outside);
  ok(inside >= 0.6 * want, "⭐⭐⭐ C1. …and inside them jungle stands at its lifted share, not the elevation table's", { inside, want: +want.toFixed(1), flatInside });
  ok(want > 1.5 * flatInside, "CONTROL: the lifted share is well above what the table alone gives, so the check can tell", { want: +want.toFixed(1), flatInside });
  const marsh = count(got, () => true, "marsh");
  ok(marsh === 0, "⭐ …and marsh, which the layer below grows nowhere, is generated nowhere", marsh);
}

console.log("\n-- ⭐ C2. the desert does not pile up in the inland south --");
{
  const south = count(got, inBands(7), "desert"), want = sumExp(inBands(7), "desert"), flatSouth = count(flat, inBands(7), "desert");
  const mid = count(got, inBands(2), "desert"), wantMid = sumExp(inBands(2), "desert");
  console.log(`     desert in band 7 (inland): ${south} (expected ${want.toFixed(1)}); in band 2 (near the coast): ${mid} (expected ${wantMid.toFixed(1)})`);
  // Measured on this fixture: 1.04× and 0.99× with each latitude ranked on its own; 1.23× and 0.74× ranked over the whole slice,
  // where the inland south takes the inland end of every cut and the desert with it. Without the lift the desert is not lifted at all.
  ok(south <= 1.15 * want, "⭐⭐⭐ C2. the inland south carries no more than 1.15× its expected desert — the pile-up", { south, want: +want.toFixed(1) });
  ok(mid >= 0.85 * wantMid, "⭐⭐ C2. …and the coastal band the layer below grows desert in gets 0.85× its share or more, though it is not inland", { mid, want: +wantMid.toFixed(1) });
}

console.log("\n-- ⭐ C3. no seam along a band edge --");
{
  // Asked of a layer below that grows every terrain in every band — at shares that swing from one band to the next — because where
  // the floor rule lets a terrain into one band and not the next (the fixture above, at every edge but 0|1 and 4|5) the seam is the
  // rule's, and meant. Here nothing is gated, so a seam could only be the bands' own edges showing through.
  const SWING = mixOf(BELOW.map((_, b) => ({ plains: 30, hills: 15, mountain: 15, jungle: 10, marsh: 5, forest: b % 2 ? 4 : 40, desert: b % 2 ? 40 : 4 })));
  const hard = liftModel(SWING, { blend: false });
  ok(hard(0.5 / B, "forest") > 3 * hard(1.5 / B, "forest") && hard(1.5 / B, "desert") > 3 * hard(0.5 / B, "desert"),
    "CONTROL: band by band, this layer below lifts forest and desert by more than three times as much on one side of each edge as on the other", [hard(0.5 / B, "forest"), hard(1.5 / B, "forest")]);
  const swung = run({ latitudeOf, latitudeMix: SWING });
  let inN = 0, inS = 0, acN = 0, acS = 0;
  for (const id of ids) for (const nb of adj.get(id)) {
    if (nb < id || !land.has(nb)) continue;
    const same = swung.get(id) === swung.get(nb) ? 1 : 0;
    if (bandOf(latitudeOf.get(id)) === bandOf(latitudeOf.get(nb))) { inN++; inS += same; } else { acN++; acS += same; }
  }
  const within = inS / inN, across = acS / acN;
  console.log(`     neighbours sharing a terrain: ${(100 * within).toFixed(1)}% within a band, ${(100 * across).toFixed(1)}% across a band edge (${acN} pairs)`);
  ok(acN > 100 && across >= 0.9 * within, "⭐⭐ C3. pairs across a band edge share a terrain about as often as pairs within one — no straight seam along an eighth of the map", { within: +within.toFixed(3), across: +across.toFixed(3) });
}

console.log("\n-- ⭐ C4. without a layer below, today's answer exactly --");
{
  const same = (p, q) => p.size === q.size && [...p].every(([id, t]) => q.get(id) === t);
  ok(same(run({ latitudeOf, latitudeMix: null }), flat), "⭐⭐ C4. latitudeMix null is the call without it — the same Map, so no rnd draw moved", null);
  ok(same(run({ latitudeOf: null, latitudeMix: MIX }), flat), "⭐⭐ C4. …and so is latitudeOf null", null);
  let differ = 0; for (const [id, t] of got) if (flat.get(id) !== t) differ++;
  ok(differ > 0, "CONTROL: with the layer below the answer does differ", differ);
  // the answer is the same whatever order the provinces come in: B1's per-piece call and C2's provisional call over the parents ask it
  // of the same land in another order
  const shuffled = picked.slice().reverse();
  ok(same(md.generatedTerrainTypes({ picked: shuffled, adj, landAfter: land, seed: SEED, palette, elevationOf, latitudeOf, latitudeMix: MIX }), got),
    "⭐ C4. with the layer below, the same land in another order gets the same terrain", null);
}

console.log("\n-- C5. each latitude band's mix is the lifted table's, in expectation --");
{
  // A slice is no longer cut to the table's counts exactly: each province draws from its own lifted weights at its rank, so the counts
  // are the expected ones within the noise of the ranks. The tolerance is measured on this fixture: the largest miss with the rule
  // in place, against the misses of the rule without its lift.
  let worst = 0, worstAt = null, flatWorst = 0;
  for (let b = 0; b < B; b++) for (const t of usable) {
    const want = sumExp(inBands(b), t), miss = Math.abs(count(got, inBands(b), t) - want), flatMiss = Math.abs(count(flat, inBands(b), t) - want);
    if (miss > worst) { worst = miss; worstAt = { band: b, t, got: count(got, inBands(b), t), want: +want.toFixed(1) }; }
    if (flatMiss > flatWorst) flatWorst = flatMiss;
  }
  const perBand = ids.length / B, TOL = 0.1 * perBand;
  console.log(`     largest miss of a band's expected count: ${worst.toFixed(1)} of ~${perBand.toFixed(0)} provinces ${JSON.stringify(worstAt)}; without the lift ${flatWorst.toFixed(1)}`);
  ok(worst <= TOL, `⭐⭐ C5. every band's count of every terrain is within ${TOL.toFixed(0)} (a tenth of a band) of the lifted table's expectation`, { worst: +worst.toFixed(1), worstAt });
  ok(flatWorst > TOL, "CONTROL: without the lift some band misses it by more, so the check can tell", +flatWorst.toFixed(1));
}

console.log("\n-- C6. the mountains still stand highest --");
{
  const auc = (terr) => { const M = [], P = []; for (const [id, t] of terr) { if (t === "mountain") M.push(elevationOf.get(id)); else if (t === "plains") P.push(elevationOf.get(id)); } let s = 0; for (const a of M) for (const b of P) s += a > b ? 1 : a === b ? 0.5 : 0; return s / (M.length * P.length); };
  const a = auc(got), b = auc(flat);
  console.log(`     AUC mountain over plains by relief: ${a.toFixed(3)} with the lift, ${b.toFixed(3)} without`);
  ok(a >= b - 0.02, "⭐ C6. the lift does not cost the relief its order: mountain over plains no worse than without it, less 0.02", { with: +a.toFixed(3), without: +b.toFixed(3) });
}

console.log("\n-- the rule's own parts --");
{
  const lift = liftModel(MIX);
  // a band with fewer provinces below than the tree rule asks for says nothing: its lift is 1
  const thin = mixOf(BELOW.map((o, b) => (b === 5 ? { plains: 5, jungle: 10 } : o)));
  const thinLift = liftModel(thin);
  ok(thin.totals[5] < md.LATITUDE_TREE_MIN_BLOCKS && thinLift(5.5 / B, "jungle") === 1, "the fixture's model: a band with too few provinces below lifts nothing", thinLift(5.5 / B, "jungle"));
  ok(lift(3.9 / B, "jungle") === 0 && liftModel(MIX, { gate: false })(3.9 / B, "jungle") > 0, "the fixture's model: near band 4 the blend alone would let jungle into band 3, and the gate stops it", liftModel(MIX, { gate: false })(3.9 / B, "jungle"));
  const gThin = md.generatedTerrainTypes({ picked, adj, landAfter: land, seed: SEED, palette, elevationOf, latitudeOf, latitudeMix: thin });
  ok(count(gThin, inBands(5), "jungle") < count(got, inBands(5), "jungle"), "⭐ with too few provinces below band 5, its jungle is not lifted there", { thin: count(gThin, inBands(5), "jungle"), full: count(got, inBands(5), "jungle") });
  // a band below that grows none of what an elevation slice's mix holds leaves every weight there 0: the slice's mix, unlifted
  const jungleSouth = mixOf(BELOW.map((o, b) => (b === 7 ? { jungle: 30 } : o)));
  const gJ = md.generatedTerrainTypes({ picked, adj, landAfter: land, seed: SEED, palette, elevationOf, latitudeOf, latitudeMix: jungleSouth });
  const stranded = ids.filter((id) => inBands(7)(id) && !(md.TERRAIN_BY_ELEVATION[sliceOf.get(id)].mix.jungle > 0));
  const kinds = new Set(stranded.map((id) => gJ.get(id)));
  ok(stranded.length >= 20 && stranded.every((id) => md.TERRAIN_BY_ELEVATION[sliceOf.get(id)].mix[gJ.get(id)] > 0) && kinds.size >= 2,
    "⭐ where the latitude below grows nothing a slice holds, the slice's own mix is drawn — not one terrain for all", { n: stranded.length, kinds: [...kinds] });
  // …and the one call generateLand makes runs the latitude pass over that draw as the guard: exactly the provinces whose draw their
  // band below grows none of are moved, onto what it does grow. The read terrainOfGeneratedLand takes is provinceExtents' shape.
  const extents = { H: ROWS, cnt: new Map(ids.map((id) => [id, 1])), sumY: new Map(ids.map((id) => [id, rowOf(id)])) };
  const home = (id, t) => { const s = share(jungleSouth, bandOf(latitudeOf.get(id)), t); return s === null || s >= md.LATITUDE_TERRAIN_FLOOR; };
  const away = ids.filter((id) => !home(id, gJ.get(id)));
  const one = typeof md.terrainOfGeneratedLand === "function"
    ? md.terrainOfGeneratedLand({ picked, adj, landAfter: land, seed: SEED, palette, elevationOf, extents, mix: jungleSouth }) : { terrainOf: new Map(), latitude: {} };
  ok(away.length > 0 && one.latitude.lifted === true && one.latitude.moved === away.length && ids.every((id) => home(id, one.terrainOf.get(id))),
    "⭐ terrainOfGeneratedLand: the latitude pass after the lift moves exactly the draws their band below grows none of, and nothing is left away from home", { away: away.length, latitude: one.latitude });
  // a slice with land in band 3 (the coastal end of its order) and band 0 (the inland end) and none in band 1: a band-0 province past
  // its band's centre blends toward band 1, which has nothing to rank it among — so it keeps its own band's place, and band 0 still
  // spreads over the whole cut instead of drawing at the slice's inland end
  const N3 = 10, N0 = 10, coastFirst = [];
  for (let i = 0; i < N3; i++) coastFirst.push(1000 + i);
  for (let i = 0; i < N0; i++) coastFirst.push(2000 + i);
  const lat = new Map(coastFirst.map((id) => [id, id < 2000 ? 3.5 / B : 0.95 / B]));
  const ranks = typeof md.latitudeRanks === "function" ? md.latitudeRanks(coastFirst, lat) : new Map();
  const band0 = coastFirst.filter((id) => id >= 2000).map((id) => ranks.get(id)), want0 = band0.map((_, i) => (i + 0.5) / N0);
  ok(band0.every((r, i) => Math.abs(r - want0[i]) < 1e-12), "⭐ beside a band the slice has no land in, a province draws at its own band's place, not the slice's inland end", { got: band0.map((r) => (r == null ? r : +r.toFixed(3))), want: want0 });
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
