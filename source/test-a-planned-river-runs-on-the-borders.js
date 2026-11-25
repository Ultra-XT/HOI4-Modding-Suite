// A generated world's rivers run along the borders between its provinces, as the map below's do, and keep every rule a river
// is drawn by. #a-river-runs-on-the-borders #a-generated-world-has-no-rivers
//
// THE GAP. TEST 31 has no river at all: Delete map wiped Earth's and Generate land drew none. Vanilla's rivers are 2.18% of
// its land, and 87.2% of their pixels sit on a province-border pixel against 16.5% of land — a shipping river runs ALONG a
// border, so the game's river crossing between two provinces is that border (95.5% of vanilla's crossings). The first
// prototype ran rivers through the middle of provinces: right density, right shape, and 75.6% of its crossings a river inside
// one of the two provinces — the game would charge a river penalty where no river divides them.
//
// THE PLAN (planGeneratedRivers, pure) draws only on border LANES, routes the flow so every lane is reached before any province
// interior, and calibrates the head threshold until the share of land-land border with a river on a side is the map below's.
//
// Fixture (testlib-river-world.js): a hand-drawn SAMPLE whose border share this test counts itself, learnt through
// riversLearntFromMap, and a Voronoi TARGET raised whole, carrying one river already — a whole river of a first plan, so it
// stands exactly where the generator would draw.
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

const S = RW.gridSample();
const T = RW.voronoiWorld();
const { W, H, N } = T;
const learnt = md.riversLearntFromMap(S);
const pairs = md.riverBorderPairs({ W, H, land: T.land, pid: T.pid, side: T.land });
const plan = (existing, seed = 1) => md.planGeneratedRivers({ W, H, land: T.land, water: T.water, draw: T.land, height: T.height, existing, pid: T.pid, seed, learnt, pairsDenominator: pairs });

console.log("1. What the map below teaches, counted by this test");
const own = RW.borderShareOf({ W: S.W, H: S.H, isLand: (k) => S.type[k] === 1, pid: S.pid, isRiver: (k) => RW.isRiverIndex(S.idx[k]) });
rec("THE CONTROL: the sample has rivers on a real share of its land-land border", own.withRiver > 0 && own.share > 0.05 && own.share < 0.5, own);
rec("⭐ riversLearntFromMap's border share is the one this test counts", !!learnt && Math.abs(learnt.borderShare - own.share) < 1e-12, { learnt: learnt && learnt.borderShare, own });
{
  const used = new Map(); for (let k = 0; k < S.N; k++) { const v = S.idx[k]; if (v >= 3 && v <= 11) used.set(v, (used.get(v) || 0) + 1); }
  const n = [...used.values()].reduce((a, b) => a + b, 0);
  const off = [...used].filter(([i, c]) => Math.abs((learnt.bodyShare[i] || 0) - c / n) > 1e-12);
  rec("⭐ …and its width shares are the sample's own", off.length === 0 && Object.keys(learnt.bodyShare).length === used.size, { learnt: learnt.bodyShare, off });
  rec("…its markers are the green and red the sample draws with", learnt.source === RW.GREEN && learnt.flowIn === RW.RED, { source: learnt.source, flowIn: learnt.flowIn });
}

// the existing river: the largest whole river of a plan drawn with nothing in the way, so it lies on the very lanes the plan wants
const free = plan(new Uint8Array(N));
const freeIdx = RW.overlay(N, free.edits, W);
const biggest = RW.riverTrees({ W, H, idx: freeIdx }).sort((a, b) => b.px.length - a.px.length)[0];
const existing = new Uint8Array(N), base = new Uint8Array(N).fill(RW.BG);
for (const k of (biggest ? biggest.px : [])) { existing[k] = 1; base[k] = freeIdx[k]; }
const a = plan(existing), b = plan(existing), c = plan(existing, 2);
const idx = RW.overlay(N, a.edits, W, base);
const mine = new Uint8Array(N); for (const e of a.edits) mine[e.y * W + e.x] = 1;

console.log("\n2. The plan");
rec("THE CONTROL: the river already there is a whole river of the first plan, on its lanes", !!biggest && biggest.px.length >= learnt.minMain && biggest.greens.length === 1, biggest && biggest.px.length);
rec("⭐ rivers are drawn", !a.error && a.stats.systems > 0 && a.edits.length > 0, a.error || a.stats);
const shape = md.riverShapeProblems({ W, H, idx, palette: RW.PALETTE });
const broken = Object.entries(shape).filter(([k, v]) => k !== "components" && k !== "examples" && v);
rec("⭐⭐ every shape rule 0 over the whole file, the river that was there included", broken.length === 0 && shape.components === a.stats.systems + 1, { broken, examples: shape.examples, components: shape.components });

console.log("\n3. On the borders");
{
  let onLand = 0, near = 0;
  for (const e of a.edits) { const k = e.y * W + e.x; if (!T.land[k]) continue; onLand++; if (RW.nearBorder(T, k)) near++; }
  rec("THE CONTROL: fewer than 3 land pixels in 5 of this world are on a border or beside one (36%), so drawing anywhere would show",
    (() => { let n = 0, l = 0; for (let k = 0; k < N; k++) if (T.land[k]) { l++; if (RW.nearBorder(T, k)) n++; } return n / l < 0.6; })());
  rec("⭐⭐ ≥ 95% of the drawn land pixels are on a province border or beside one", onLand > 0 && near / onLand >= 0.95, { near, onLand, share: +(near / onLand).toFixed(4) });
  const got = RW.borderShareOf({ W, H, isLand: (k) => T.land[k] === 1, pid: T.pid, isRiver: (k) => mine[k] === 1 });
  rec("⭐⭐ the share of land-land border with a NEW river on a side is the map below's, within 0.02", Math.abs(got.share - own.share) <= 0.02, { got, want: own.share });
  rec("…and the plan reports the same share, not saturated", Math.abs(a.stats.borderShare - got.share) < 1e-4 && a.stats.saturated === false, a.stats);
}

console.log("\n4. Shaped like a river");
{
  const trees = RW.riverTrees({ W, H, idx }).filter((t) => t.px.some((k) => mine[k]));
  const notAtWater = trees.filter((t) => !t.main || !RW.nb4(W, N, t.main[t.main.length - 1]).concat(t.main[t.main.length - 1]).some((k) => T.water[k]));
  rec("⭐ every main reaches water, and every river has one green", trees.length === a.stats.systems && notAtWater.length === 0 && trees.every((t) => t.greens.length === 1), { trees: trees.length, notAtWater: notAtWater.length });
  let narrow = 0, wider = 0, tribs = 0;
  for (const t of trees) {
    narrow += RW.narrowings(idx, t.main);
    for (const tr of t.tribs) { tribs++; narrow += RW.narrowings(idx, tr.path); const head = tr.path.filter((k) => idx[k] >= 3); if (head.length && idx[head[head.length - 1]] > idx[tr.junction]) wider++; }
  }
  rec("⭐ widths never narrow downstream, and a tributary is never wider than the river it joins", narrow === 0 && wider === 0, { narrow, wider, tribs });
  rec("THE CONTROL: there are tributaries to judge, and more than one width", tribs === a.stats.tributaries && tribs > 0 && new Set(a.edits.map((e) => e.index)).size >= 3, { tribs, stats: a.stats.tributaries });
  const allowed = new Set([learnt.source, learnt.flowIn, ...Object.keys(learnt.bodyShare).map(Number)]);
  rec("every index written is one the map below writes", a.edits.every((e) => allowed.has(e.index)), [...new Set(a.edits.map((e) => e.index))]);
  // the mouth: a shipping main runs on a few pixels into the water (vanilla's p50 is 4), which is how the game reads its direction
  const sampleWet = RW.riverTrees({ W: S.W, H: S.H, idx: S.idx }).filter((t) => t.main).map((t) => t.main.filter((k) => S.type[k] !== 1).length).sort((p, q) => p - q);
  const runOn = sampleWet[Math.floor(sampleWet.length / 2)];
  rec("THE CONTROL: the sample's mains run on into the sea, every one as far", runOn > 0 && sampleWet.every((v) => v === runOn), sampleWet);
  rec("⭐ learnt.mouthIntoWater is how far the sample's mains run on", learnt.mouthIntoWater === runOn, { learnt: learnt.mouthIntoWater, runOn });
  // the floor: no stub shorter than the map below's short rivers — their 10th percentile (nearest rank), counted here. ⛔ A main is
  // measured ON LAND, as the planner caps the stretch it draws before the mouth runs on (review F2: counted with its run-on, the
  // learnt floor and longest stood mouthIntoWater above the planner's, and a world learning from its own rivers grew by it each time)
  const sTrees = RW.riverTrees({ W: S.W, H: S.H, idx: S.idx });
  const p10 = (arr) => { const s = [...arr].sort((p, q) => p - q); return s[Math.min(s.length - 1, Math.floor(0.1 * (s.length - 1) + 0.5))]; };
  const onLand = (t) => t.main.filter((k) => S.type[k] === 1).length;
  const minMain = p10(sTrees.filter((t) => t.main).map(onLand)), minTrib = p10(sTrees.flatMap((t) => t.tribs.map((tr) => tr.path.length)));
  rec("THE CONTROL: learnt.minMain and minTrib are the sample's own, and the sample's mains are not all one length", learnt.minMain === minMain && learnt.minTrib === minTrib && new Set(sTrees.map((t) => t.px.length)).size > 1, { learnt: [learnt.minMain, learnt.minTrib], own: [minMain, minTrib] });
  const longest = Math.max(...sTrees.filter((t) => t.main).map(onLand));
  rec("⭐ learnt.maxMain is the sample's longest main on land — not counting the pixels it runs on into the sea", learnt.maxMain === longest && longest < Math.max(...sTrees.filter((t) => t.main).map((t) => t.main.length)), { learnt: learnt.maxMain, longest });
  const shortMains = trees.filter((t) => t.main && t.main.filter((k) => !T.water[k]).length < minMain).length;
  const shortTribs = trees.reduce((n, t) => n + t.tribs.filter((tr) => tr.path.length < minTrib).length, 0);
  rec("⭐ no main is shorter on land than the map below's short mains, and no tributary than its short tributaries", shortMains === 0 && shortTribs === 0, { shortMains, shortTribs, minMain, minTrib });
  const planWet = trees.filter((t) => t.main).map((t) => t.main.filter((k) => T.water[k]).length);
  rec("⭐ every main of the plan runs on into the water as far, and no further (each of this world's mouths opens on open water)",
    planWet.length === a.stats.systems && planWet.every((v) => v === runOn) && a.stats.runOn === runOn * planWet.length, { planWet, runOn, stats: a.stats.runOn });
}

console.log("\n5. The river that was there");
{
  let over = 0, touch = 0;
  for (const e of a.edits) {
    const k = e.y * W + e.x;
    if (existing[k]) over++;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = k + dy * W + dx; if ((dx || dy) && j >= 0 && j < N && existing[j]) touch++; }
  }
  const there = biggest ? biggest.px.length : 0;
  rec("⭐⭐ not one of its pixels is drawn over, and no new pixel touches it, 4- or 8-way", there > 0 && over === 0 && touch === 0, { over, touch, existing: there });
  let freeOver = 0; for (const e of free.edits) if (existing[e.y * W + e.x]) freeOver++;
  rec("THE CONTROL: drawn without it, the plan puts a river on every one of those pixels", there > 0 && freeOver === there, { freeOver });
}

console.log("\n6. The seed");
{
  const same = (p, q) => p.edits.length === q.edits.length && p.edits.every((e, i) => e.x === q.edits[i].x && e.y === q.edits[i].y && e.index === q.edits[i].index);
  rec("⭐ the same seed draws the same rivers", same(a, b));
  rec("⭐ another seed draws others", !same(a, c), { a: a.edits.length, c: c.edits.length });
}

console.log("\n7. No combs");
{
  rec("⭐ the plan's rivers keep their distance: clearance at 4 px no worse than the map below's + 1 point", a.stats.clearance.r4 <= learnt.clearance.r4 + 0.01, { plan: a.stats.clearance, below: learnt.clearance });
  // a comb — two rivers side by side, two pixels apart — is what the measure is for
  const combW = 40, combH = 8, comb = new Uint8Array(combW * combH).fill(RW.BG), px = [];
  for (let x = 5; x < 35; x++) { comb[2 * combW + x] = 3; comb[4 * combW + x] = 3; px.push(2 * combW + x); }
  const cl = md.riverClearance({ W: combW, H: combH, isRiver: (k) => comb[k] !== RW.BG, pixels: px });
  rec("THE CONTROL: the clearance measure sees a comb (two stretches 2 px apart: every pixel)", cl.r2 === 1 && cl.pixels === px.length, cl);
  // …and a river's own course is not "another stretch": one straight river alone, every pixel of it 1 px from the next
  const lone = new Uint8Array(combW * combH).fill(RW.BG), lpx = [];
  for (let x = 5; x < 35; x++) { lone[2 * combW + x] = 3; lpx.push(2 * combW + x); }
  const cl1 = md.riverClearance({ W: combW, H: combH, isRiver: (k) => lone[k] !== RW.BG, pixels: lpx });
  rec("THE CONTROL: one river alone has nothing within 2, 3 or 4 px of it but its own course", cl1.r2 === 0 && cl1.r3 === 0 && cl1.r4 === 0 && cl1.pixels === lpx.length, cl1);
}

console.log("\n8. No river system larger than the map below's largest");
{
  // the map below's largest system, cut to well under the biggest one this plan drew, so the cap has something to bind. Its
  // longest main is the same number — a sparse map whose largest system is one lone main — so a main can reach the cap and still
  // run on into the water, and a tributary must then be refused outright, not given a length below nothing.
  const sizes = RW.riverTrees({ W, H, idx: RW.overlay(N, free.edits, W) }).map((t) => t.px.length).sort((p, q) => q - p);
  const cap = Math.floor(sizes[0] * 0.6), small = { ...learnt, maxComponent: cap, maxMain: cap };
  const capped = md.planGeneratedRivers({ W, H, land: T.land, water: T.water, draw: T.land, height: T.height, existing: new Uint8Array(N), pid: T.pid, seed: 1, learnt: small, pairsDenominator: pairs });
  const loose = md.planGeneratedRivers({ W, H, land: T.land, water: T.water, draw: T.land, height: T.height, existing: new Uint8Array(N), pid: T.pid, seed: 1, learnt: { ...small, maxComponent: Infinity }, pairsDenominator: pairs });
  const cTrees = RW.riverTrees({ W, H, idx: RW.overlay(N, capped.edits, W) }), lTrees = RW.riverTrees({ W, H, idx: RW.overlay(N, loose.edits, W) });
  const withTribs = (ts) => ts.filter((t) => t.tribs.length);
  rec("THE CONTROL: with mains of the same length and no cap on a system, systems with tributaries grow past it", withTribs(lTrees).some((t) => t.px.length > cap) && cap >= learnt.minMain,
    { cap, loose: withTribs(lTrees).map((t) => t.px.length).sort((p, q) => q - p).slice(0, 5) });
  const over = withTribs(cTrees).filter((t) => t.px.length > cap).map((t) => t.px.length);
  rec("⭐⭐ capped, no system with a tributary is larger than the map below's largest, and tributaries are still drawn", over.length === 0 && withTribs(cTrees).length > 0, { over, cap, tribs: capped.stats.tributaries });
  const sh = md.riverShapeProblems({ W, H, idx: RW.overlay(N, capped.edits, W), palette: RW.PALETTE });
  const broken = Object.entries(sh).filter(([k, v]) => k !== "components" && k !== "examples" && v);
  rec("⭐ …and every river the capped plan draws is whole: every shape rule 0, its systems and tributaries the ones it reports",
    broken.length === 0 && cTrees.length === capped.stats.systems && cTrees.reduce((n, t) => n + t.tribs.length, 0) === capped.stats.tributaries,
    { broken, trees: cTrees.length, systems: capped.stats.systems, tribs: [cTrees.reduce((n, t) => n + t.tribs.length, 0), capped.stats.tributaries] });
  // what a map holding this drawing would teach (a second Generate land, were Nova's own rivers not left out of the sample): its
  // longest main is the cap it was drawn under, no longer — the learner measures a main as the planner does (review F2)
  const back = md.riversLearntFromMap({ W, H, idx: RW.overlay(N, capped.edits, W), palette: RW.PALETTE, type: T.type, pid: T.pid, height: T.height });
  const atCap = cTrees.filter((t) => t.main && t.main.filter((k) => T.land[k]).length === cap).length;
  rec("THE CONTROL: some main of the capped plan is as long on land as the cap lets it be, and runs on into the water", atCap > 0 && capped.stats.runOn > 0, { atCap, cap, runOn: capped.stats.runOn });
  rec("⭐ learnt back from the capped plan's own drawing, the longest main is the cap, not the cap and its run-on", !!back && back.maxMain === cap, { back: back && back.maxMain, cap });
}

console.log("\n9. Saturated means the lanes could carry no more — not that the plan ended under its target");
{
  // a target a plan's tries step over: the calibration keeps whichever try came nearest, and that one can be under the target while
  // another try drew more. Scanned over targets round the learnt share, so the case is found, not typed in (review F6: no fixture
  // ended under its target, and `saturated` reduced to "the plan is under" passed every test)
  let under = null;
  for (let i = 0; i <= 40 && !under; i++) {
    const want = Math.round(own.share * (0.8 + 0.01 * i) * 10000) / 10000;
    const p = md.planGeneratedRivers({ W, H, land: T.land, water: T.water, draw: T.land, height: T.height, existing: new Uint8Array(N), pid: T.pid, seed: 1, learnt: { ...learnt, borderShare: want }, pairsDenominator: pairs });
    if (p.stats.borderShare < want - 0.0001) under = { want, stats: p.stats };
  }
  const floor = md.planGeneratedRivers({ W, H, land: T.land, water: T.water, draw: T.land, height: T.height, existing: new Uint8Array(N), pid: T.pid, seed: 1, learnt: { ...learnt, borderShare: 1 }, pairsDenominator: pairs });
  rec("THE CONTROL: among the targets scanned, a plan ends just under its own, and the lanes can carry far more than that target",
    !!under && floor.stats.saturated === true && floor.stats.borderShare > under.want + 0.02, { under: under && { want: under.want, got: under.stats.borderShare }, most: floor.stats.borderShare });
  rec("⭐ that plan is not saturated: a try above its target was drawn", !!under && under.stats.saturated === false, under && under.stats);
}

console.log("\n10. A tributary never joins beside a main's green");
{
  // The T world (testlib-river-world.js): one main, from the coast along province 1's top row and up province 2's east column, and
  // one tributary lane — the rest of that row — joining it at (xb − 1, ym). Capped so its green is the pixel above that junction, the
  // join would stand beside the green: no installed map has a junction 1 or 2 px below a green (0 on all 8).
  const TW = RW.teeWorld({ ground: (x) => 100 + Math.round((232 - 1 - x) * 0.08) });
  const tp = md.riverBorderPairs({ W: TW.W, H: TW.H, land: TW.land, pid: TW.pid, side: TW.land });
  const toJunction = TW.coast - 1 - (TW.xb - 1) + 1;   // the main's land pixels from its mouth to the junction, both ends counted
  const run = (maxMain) => md.planGeneratedRivers({ W: TW.W, H: TW.H, land: TW.land, water: TW.water, draw: TW.land, height: TW.height, existing: new Uint8Array(TW.N), pid: TW.pid, seed: 1,
    learnt: { ...learnt, borderShare: 1, maxMain }, pairsDenominator: tp });
  const treesOf = (p) => RW.riverTrees({ W: TW.W, H: TW.H, idx: RW.overlay(TW.N, p.edits, TW.W) });
  const headOf = (p) => { const t = treesOf(p).filter((r) => r.main); return t.length === 1 ? t[0].main[0] : -1; };
  const junction = TW.ym * TW.W + TW.xb - 1;
  const roomy = run(toJunction + 2), tight = run(toJunction + 1);
  rec("THE CONTROL: with the green two pixels above the junction, the tributary joins there", roomy.stats.systems === 1 && roomy.stats.tributaries === 1 && headOf(roomy) === junction - 2 * TW.W
    && treesOf(roomy)[0].tribs.every((tr) => tr.junction === junction), { stats: roomy.stats, head: headOf(roomy) });
  rec("⭐⭐ with the green right above it, the tributary is not drawn", tight.stats.systems === 1 && headOf(tight) === junction - TW.W && tight.stats.tributaries === 0, { stats: tight.stats, head: headOf(tight) });
}

console.log("\n11. A mouth runs on along a bank as far as the map below's do");
{
  // Two provinces, north and south, their border the one lane, from the coast inland; the sea a strip at the east edge, and the north
  // province running on into it as a jetty, so the water the mouth runs on into lies along a bank. Shipping run-ons do: vanilla's
  // touch land at 376 of their 1,268 pixels past the first. The planner used to stop a run-on at the first pixel beside land (review
  // F6: no fixture had a bank there; it cut 124 of the known-answer run's run-ons short).
  const LW = 240, LH = 40, COAST = 220, ROW = LH / 2 - 1, N1 = LW * LH;
  const L = { pid: new Int32Array(N1), land: new Uint8Array(N1), water: new Uint8Array(N1), height: new Uint8Array(N1) };
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const k = y * LW + x, jetty = y < ROW && x < LW - 2;
    if (x >= COAST && !jetty) { L.water[k] = 1; L.pid[k] = 9000; L.height[k] = 89; continue; }
    L.land[k] = 1; L.pid[k] = y <= ROW ? 1 : 2; L.height[k] = 100 + Math.round(Math.max(0, COAST - 1 - x) * 0.08);
  }
  const p = md.planGeneratedRivers({ W: LW, H: LH, land: L.land, water: L.water, draw: L.land, height: L.height, existing: new Uint8Array(N1), pid: L.pid, seed: 1,
    learnt: { ...learnt, borderShare: 1 }, pairsDenominator: md.riverBorderPairs({ W: LW, H: LH, land: L.land, pid: L.pid, side: L.land }) });
  const wet = p.edits.filter((e) => L.water[e.y * LW + e.x]);
  const beside = (e) => RW.nb4(LW, N1, e.y * LW + e.x).some((j) => L.land[j] && j !== e.y * LW + e.x - 1);
  rec("THE CONTROL: one main, its mouth on the coast in the lane's row, and the water it runs on into has the jetty beside it all the way",
    p.stats.systems === 1 && L.land[ROW * LW + COAST - 1] === 1 && L.water[ROW * LW + COAST] === 1 && [1, 2, 3].every((d) => L.land[(ROW - 1) * LW + COAST + d] === 1), p.stats);
  rec("⭐⭐ it runs on as far as the map below's mains do, along the bank", p.stats.runOn === learnt.mouthIntoWater && wet.length === learnt.mouthIntoWater && wet.slice(1).every(beside) && wet.every((e) => e.y === ROW),
    { runOn: p.stats.runOn, want: learnt.mouthIntoWater, wet });
}

console.log(`\n=== a planned river runs on the borders: ${checks} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exitCode = fails.length ? 1 : 0;
