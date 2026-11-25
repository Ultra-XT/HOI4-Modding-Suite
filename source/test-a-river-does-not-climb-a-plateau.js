// A generated river does not climb a plateau to reach the sea: a main that would climb more than the map below lets its own
// mains climb starts past the climb instead. #a-river-does-not-climb-a-plateau (critic R7)
//
// THE DEFECT, in the prototype. Rivers run on province-border lanes, and on coarse provinces the only lane from a basin to the
// sea can lead over a plateau. Measured on TEST 31 (rivers-critic/climb.js, a main's largest rise met going downstream on the
// 5×5-smoothed heightmap): 17.9% of the prototype's mains climbed 20+ height units and 4.2% 40+, against vanilla's 9.7% and
// 1.8%; the worst 122. crop-climb1.png shows rivers following straight ex-ocean edges across a high plateau.
//
// THE FIX: riversLearntFromMap learns climbP95 — the 95th percentile of that same measure over the map below's mains — and
// planGeneratedRivers cuts a main whose climb is over it: the source moves downstream past the climb, to the longest stretch
// above the mouth that climbs no more, before any tributary is drawn; a stretch left under minMain is taken back.
//
// Fixture: the Voronoi world with the ground raised into a ridge between x 170 and 210 and a basin behind it, so every lane from
// the basin reaches the sea over the ridge. The climb is measured here by the test's own reading (testlib-river-world.js).
"use strict";

const md = require("./map-data.js");
const RW = require("./testlib-river-world.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const S = RW.gridSample(), learnt = md.riversLearntFromMap(S);
const RIDGE = { up: 170, top: 190, down: 210 };
const ground = (x, y) => {
  if (x < RIDGE.up) return 97 + Math.round((x - 100) * 0.1 + 2 * Math.sin(y / 9));
  if (x < RIDGE.top) return 104 + Math.round((x - RIDGE.up) * 3.5);
  if (x < RIDGE.down) return 174 - Math.round((x - RIDGE.top) * 3.2);
  return 110 + Math.round((x - RIDGE.down) * 0.03 + 3 * Math.sin(x / 13) * Math.cos(y / 11));
};
const P = RW.voronoiWorld({ lake: null, ground }), { W, H, N } = P;
const h5 = RW.smoothed5(P);

console.log("1. What the map below lets a main climb, counted by this test");
{
  const sh5 = RW.smoothed5(S), climbs = [];
  for (const t of RW.riverTrees({ W: S.W, H: S.H, idx: S.idx })) if (t.main && t.px.length >= 20) climbs.push(RW.climbAlong(sh5, t.main));
  climbs.sort((a, b) => a - b);
  const p95 = climbs[Math.min(climbs.length - 1, Math.floor(0.95 * (climbs.length - 1) + 0.5))];
  rec("⭐ riversLearntFromMap's climbP95 is the sample's own 95th percentile main climb", climbs.length > 0 && Math.abs(learnt.climbP95 - p95) < 1e-9, { learnt: learnt.climbP95, own: p95, mains: climbs.length });
  // …and a tributary's, from its head down to its red (review F5)
  const tc = [];
  for (const t of RW.riverTrees({ W: S.W, H: S.H, idx: S.idx })) if (t.px.length >= 20) for (const tr of t.tribs) tc.push(RW.climbAlong(sh5, tr.path));
  tc.sort((a, b) => a - b);
  const tp95 = tc[Math.min(tc.length - 1, Math.floor(0.95 * (tc.length - 1) + 0.5))];
  rec("⭐ …and its tribClimbP95 the sample's own 95th percentile tributary climb, head to red", tc.length > 0 && Math.abs(learnt.tribClimbP95 - tp95) < 1e-9 && tp95 > 0, { learnt: learnt.tribClimbP95, own: tp95, tribs: tc.length });
}
let lowestPass = Infinity, basinTop = -Infinity;
for (let y = 0; y < H; y++) {
  let top = -Infinity; for (let x = RIDGE.up; x < RIDGE.down; x++) top = Math.max(top, h5[y * W + x]);
  lowestPass = Math.min(lowestPass, top);
  for (let x = RIDGE.down + 3; x < W - 3; x++) basinTop = Math.max(basinTop, h5[y * W + x]);
}
rec("THE CONTROL: the ridge's lowest pass stands more than climbP95 above the highest ground of the basin — a river from the basin must climb more than that",
  lowestPass - basinTop > learnt.climbP95, { lowestPass, basinTop, climbP95: learnt.climbP95 });

const pairs = md.riverBorderPairs({ W, H, land: P.land, pid: P.pid, side: P.land });
const plan = md.planGeneratedRivers({ W, H, land: P.land, water: P.water, draw: P.land, height: P.height, existing: new Uint8Array(N), pid: P.pid, seed: 1, learnt, pairsDenominator: pairs });
const idx = RW.overlay(N, plan.edits, W);
const trees = RW.riverTrees({ W, H, idx });

console.log("\n2. The plan");
rec("rivers are drawn", !plan.error && plan.stats.systems > 0, plan.error || plan.stats);
{
  const climbs = trees.filter((t) => t.main).map((t) => ({ climb: RW.climbAlong(h5, t.main), head: t.main[0] % W }));
  const over = climbs.filter((c) => c.climb > learnt.climbP95 + 1e-9);
  rec("⭐⭐⭐ no main climbs more than the map below's mains climb (its climbP95)", climbs.length === plan.stats.systems && over.length === 0, { over, climbP95: learnt.climbP95 });
  rec("⭐⭐ the gate cut the mains that would have climbed the ridge, and says so", plan.stats.climbCut >= 1 && plan.stats.climbCap === learnt.climbP95, plan.stats);
  let behind = 0; for (const e of plan.edits) if (e.x >= RIDGE.down) behind++;
  rec("⭐ nothing is drawn in the basin behind the ridge", behind === 0, { behind });
  // the cut moves a source, it does not throw a river away: drawn without the gate, the mains that climb the ridge; with it, the
  // same mouths still carry a river — the lower course, below the climb
  const free = md.planGeneratedRivers({ W, H, land: P.land, water: P.water, draw: P.land, height: P.height, existing: new Uint8Array(N), pid: P.pid, seed: 1, learnt: { ...learnt, climbP95: null }, pairsDenominator: pairs });
  const mouthOf = (t) => t.main.filter((k) => P.land[k]).pop();
  const climbing = RW.riverTrees({ W, H, idx: RW.overlay(N, free.edits, W) }).filter((t) => t.main && RW.climbAlong(h5, t.main) > learnt.climbP95);
  const kept = new Map(trees.filter((t) => t.main).map((t) => [mouthOf(t), t]));
  const lower = climbing.filter((t) => kept.has(mouthOf(t)) && kept.get(mouthOf(t)).main.length < t.main.length);
  rec("THE CONTROL: drawn without the gate, mains climb the ridge", climbing.length >= 1 && free.stats.climbCut === 0, { climbing: climbing.length, cut: free.stats.climbCut });
  rec("⭐⭐ …and with it, every one of their mouths still carries a river, shorter: its source moved below the climb", climbing.length >= 1 && lower.length === climbing.length,
    { climbing: climbing.map((t) => ({ mouth: mouthOf(t), len: t.main.length, kept: kept.has(mouthOf(t)) ? kept.get(mouthOf(t)).main.length : 0 })) });
}
{
  const sh = md.riverShapeProblems({ W, H, idx, palette: RW.PALETTE });
  const broken = Object.entries(sh).filter(([k, v]) => k !== "components" && k !== "examples" && v);
  rec("⭐⭐ the cut keeps every shape rule 0", broken.length === 0 && sh.components === plan.stats.systems, { broken, examples: sh.examples });
  const dry = trees.filter((t) => !t.main || !RW.nb4(W, N, t.main[t.main.length - 1]).concat(t.main[t.main.length - 1]).some((k) => P.water[k]));
  rec("⭐ …and every main still reaches the sea, with one green", dry.length === 0 && trees.every((t) => t.greens.length === 1), { dry: dry.length });
}

console.log("\n3. The cut takes only the climb: one lane, so the river is known before the gate");
{
  // Two provinces, north and south, sharing one straight border from the coast inland: the north side of it is the only lane, so
  // the plan's one main runs along it. The sea is a strip at the map's EAST edge as wide as the map below's mouths run on into the
  // water, so a run-on drawn in full would end on the seam. The ground rises from the coast to a ridge and falls away westward to a
  // basin, with a ±3 ripple a 5×5 box smooths out. Asked for more border than one lane can carry, both plans draw at the floor of
  // A, so the gated main can be judged against the whole one: it must be EXACTLY its longest stretch above the mouth that climbs no
  // more than climbP95 (the test's own reading) — not one pixel shorter (a gate reading the raw ripple, or cutting past where it
  // must), not one longer.
  const LW = 240, LH = 40, SEA = learnt.mouthIntoWater, COAST = LW - SEA, RIDGE = 60, N1 = LW * LH;
  const L = { W: LW, H: LH, pid: new Int32Array(N1), land: new Uint8Array(N1), water: new Uint8Array(N1), height: new Uint8Array(N1) };
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const k = y * LW + x;
    if (x >= COAST) { L.water[k] = 1; L.pid[k] = 9000; L.height[k] = 89; continue; }
    L.land[k] = 1; L.pid[k] = y < LH / 2 ? 1 : 2;
    const d = COAST - 1 - x;   // pixels inland from the coast
    const ground = d <= RIDGE ? 100 + d * 50 / RIDGE : 150 - (d - RIDGE) * 40 / (COAST - 1 - RIDGE);
    L.height[k] = Math.round(ground) + [0, 3, -3][x % 3];
  }
  const lh5 = RW.smoothed5(L), lpairs = md.riverBorderPairs({ W: LW, H: LH, land: L.land, pid: L.pid, side: L.land });
  const lanePlan = (climbP95) => md.planGeneratedRivers({ W: LW, H: LH, land: L.land, water: L.water, draw: L.land, height: L.height, existing: new Uint8Array(N1), pid: L.pid, seed: 1,
    learnt: { ...learnt, borderShare: 1, climbP95 }, pairsDenominator: lpairs });
  const stemOf = (p) => { const t = RW.riverTrees({ W: LW, H: LH, idx: RW.overlay(N1, p.edits, LW) }).filter((r) => r.main); return t.length === 1 ? t[0].main.filter((k) => L.land[k]) : null; };
  const whole = lanePlan(null), cut = lanePlan(learnt.climbP95);
  const wStem = stemOf(whole), cStem = stemOf(cut);
  // the mouth's run-on heads for the map's east edge, where a river pixel would stand on the seam (the "onSeam" rule)
  const brokenIn = (p) => { const sh = md.riverShapeProblems({ W: LW, H: LH, idx: RW.overlay(N1, p.edits, LW), palette: RW.PALETTE }); return Object.entries(sh).filter(([k, v]) => k !== "components" && k !== "examples" && v); };
  rec("THE CONTROL: the sea in line with the lane reaches the seam, and is no wider than a full run-on", SEA >= 2 && L.water[(LH / 2 - 1) * LW + LW - 1] === 1 && L.land[(LH / 2 - 1) * LW + COAST - 1] === 1, { SEA });
  rec("⭐ both plans keep every shape rule: the run-on stops one pixel short of the seam",
    brokenIn(whole).length === 0 && brokenIn(cut).length === 0 && whole.stats.runOn === SEA - 1 && cut.stats.runOn === SEA - 1, { whole: brokenIn(whole), cut: brokenIn(cut), runOn: [whole.stats.runOn, cut.stats.runOn] });
  rec("THE CONTROL: ungated, the one lane carries one main from the basin to the coast, climbing the ridge by more than climbP95",
    !!wStem && whole.stats.saturated && wStem.length > 2 * RIDGE && RW.climbAlong(lh5, wStem) > learnt.climbP95, { len: wStem && wStem.length, climb: wStem && RW.climbAlong(lh5, wStem), stats: whole.stats });
  // the longest stretch above the mouth that climbs no more: the first start, from the head, whose climb is under the cap
  let s = 0; while (wStem && s < wStem.length && RW.climbAlong(lh5, wStem.slice(s)) > learnt.climbP95) s++;
  const want = wStem ? wStem.slice(s) : [];
  rec("THE CONTROL: the ripple is one a raw reading sees and the smoothed one does not — read raw, that stretch climbs more than climbP95",
    want.length > 0 && RW.climbAlong(L.height, want) > learnt.climbP95, { raw: RW.climbAlong(L.height, want), smoothed: RW.climbAlong(lh5, want), cap: learnt.climbP95 });
  rec("⭐⭐ gated, the main is exactly that stretch, pixel for pixel: its source moved past the climb, and no further",
    !!cStem && want.length >= learnt.minMain && cStem.length === want.length && cStem.every((k, i) => k === want[i]) && cut.stats.climbCut === 1,
    { got: cStem && cStem.length, want: want.length, cutAt: want.length && want[0] % LW, climbCut: cut.stats.climbCut });
}

console.log("\n4. A tributary does not climb one either (review F5)");
{
  // The T world (testlib-river-world.js): one main, from the coast along province 1's top row and up province 2's east column, and
  // one tributary, the rest of that row, joining it at (xb − 1, ym). A ridge stands across the tributary's row between x 60 and 80,
  // so from its head it climbs the ridge on the way down to its red. Ungated (the review measured TEST 31's tributaries climbing up to
  // 127.6, vanilla's worst 71.5) it climbs it; gated, it must be EXACTLY its longest stretch above the red that climbs no more than
  // the map below's tributaries do (tribClimbP95, the test's own reading of the climb).
  const COAST = 232, XB = 180, YM = 90;
  const TW = RW.teeWorld({ ym: YM, xb: XB, coast: COAST, ground: (x, y) => 100 + Math.round((COAST - 1 - x) * 0.08) + (x >= 60 && x <= 80 && Math.abs(y - YM) <= 8 ? 60 : 0) });
  const th5 = RW.smoothed5(TW), tp = md.riverBorderPairs({ W: TW.W, H: TW.H, land: TW.land, pid: TW.pid, side: TW.land });
  const run = (tribClimbP95) => md.planGeneratedRivers({ W: TW.W, H: TW.H, land: TW.land, water: TW.water, draw: TW.land, height: TW.height, existing: new Uint8Array(TW.N), pid: TW.pid, seed: 1,
    learnt: { ...learnt, borderShare: 1, tribClimbP95 }, pairsDenominator: tp });
  const tribOf = (p) => { const t = RW.riverTrees({ W: TW.W, H: TW.H, idx: RW.overlay(TW.N, p.edits, TW.W) }); return t.length === 1 && t[0].tribs.length === 1 ? t[0].tribs[0].path : null; };
  const free = run(null), gated = run(learnt.tribClimbP95);
  const whole = tribOf(free), kept = tribOf(gated);
  rec("THE CONTROL: ungated, the one tributary runs from the far side of the ridge to its red, climbing it by more than tribClimbP95",
    !!whole && whole.length > 100 && whole[0] % TW.W < 60 && RW.climbAlong(th5, whole) > learnt.tribClimbP95 && free.stats.tribClimbCut === 0, { len: whole && whole.length, climb: whole && RW.climbAlong(th5, whole), stats: free.stats });
  // the longest stretch above the red that climbs no more: the first start, from the head, whose climb is under the cap
  let s = 0; while (whole && s < whole.length && RW.climbAlong(th5, whole.slice(s)) > learnt.tribClimbP95) s++;
  const want = whole ? whole.slice(s) : [];
  rec("⭐⭐ gated, the tributary is exactly that stretch, pixel for pixel: its head moved past the climb, and no further",
    !!kept && want.length >= learnt.minTrib && kept.length === want.length && kept.every((k, i) => k === want[i]) && gated.stats.tribClimbCut === 1 && gated.stats.tribClimbCap === learnt.tribClimbP95,
    { got: kept && kept.length, want: want.length, cutAt: want.length && want[0] % TW.W, stats: { cut: gated.stats.tribClimbCut, cap: gated.stats.tribClimbCap } });
  // the map below lets its tributaries climb more than its mains: the cut is at the tributaries' own cap, not the mains'
  rec("⭐ …and what is kept climbs more than the mains may, as the map below's tributaries do", learnt.tribClimbP95 > learnt.climbP95 && !!kept && RW.climbAlong(th5, kept) > learnt.climbP95,
    { kept: kept && RW.climbAlong(th5, kept), climbP95: learnt.climbP95, tribClimbP95: learnt.tribClimbP95 });
  const sh = md.riverShapeProblems({ W: TW.W, H: TW.H, idx: RW.overlay(TW.N, gated.edits, TW.W), palette: RW.PALETTE });
  const broken = Object.entries(sh).filter(([k, v]) => k !== "components" && k !== "examples" && v);
  rec("⭐ …and the cut keeps every shape rule 0, the main untouched by it", broken.length === 0 && gated.stats.climbCut === 0 && free.stats.climbCut === 0, { broken, climbCut: gated.stats.climbCut });
}

console.log(`\n=== a river does not climb a plateau: ${checks} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exitCode = fails.length ? 1 : 0;
