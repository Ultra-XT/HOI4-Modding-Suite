// Land raised beside a world that is already there gets the map below's share of rivers on ITS borders — not a flood of them.
// #a-partial-raise-gets-its-share-of-rivers (critic R1)
//
// THE DEFECT, in the prototype. The plan calibrates its head threshold until the share of land-land border with a new river
// on a side is the map below's (vanilla 21.6%). The prototype counted that share over EVERY border pair of the map, while it
// could only draw on the raised provinces. On a whole new world the two are the same; on anything less they are not: an add-on
// island chain of 25 provinces raised beside vanilla (1.7% of its land) can never lift the whole map's share to 21.6%, so the
// bisection fell to its floor and drew rivers on 54.8% of the chain's own borders (critic, rivers-critic/partial.js). A second
// Generate land, or one over a total conversion, is the same case.
//
// THE FIX: planGeneratedRivers takes the denominator as an input, and its caller passes the land-land border pairs with at least
// one RAISED side (riverBorderPairs with `side`), counting new pixels only.
//
// Fixture (testlib-river-world.js): the Voronoi world, its provinces west of x 180 raised out of the sea (the strip between the
// old coast and the new), the rest the old world, carrying the rivers it was drawn with before — whose mouths the raise has left
// inland. The map below's numbers come from the hand-drawn sample, counted by this test.
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
const want = RW.borderShareOf({ W: S.W, H: S.H, isLand: (k) => S.type[k] === 1, pid: S.pid, isRiver: (k) => RW.isRiverIndex(S.idx[k]) }).share;
const OLD_COAST = 180;
const T = RW.voronoiWorld(), { W, H, N } = T;
const raisedIds = new Set(); T.seeds.forEach((s, i) => { if (s[0] < OLD_COAST) raisedIds.add(i + 1); });
const raised = Uint8Array.from(T.land, (v, k) => (v && raisedIds.has(T.pid[k]) ? 1 : 0));
// the old world's own rivers, drawn when the strip was still sea
const oldLand = Uint8Array.from(T.land, (v, k) => (v && !raised[k] ? 1 : 0)), oldWater = Uint8Array.from(T.water, (v, k) => (v || raised[k] ? 1 : 0));
const before = md.planGeneratedRivers({ W, H, land: oldLand, water: oldWater, draw: oldLand, height: T.height, existing: new Uint8Array(N), pid: T.pid, seed: 3, learnt, pairsDenominator: md.riverBorderPairs({ W, H, land: oldLand, pid: T.pid }) });
const existing = new Uint8Array(N); for (const e of before.edits) existing[e.y * W + e.x] = 1;
const base = RW.overlay(N, before.edits, W);

console.log("1. The fixture can tell the two denominators apart");
const allPairs = RW.borderShareOf({ W, H, isLand: (k) => T.land[k] === 1, pid: T.pid, isRiver: () => false }).pairs;
const raisedPairs = RW.borderShareOf({ W, H, isLand: (k) => T.land[k] === 1, pid: T.pid, isRiver: () => false, side: raised }).pairs;
rec("THE CONTROL: the raised strip holds at most half of the map's land-land border, so a plan calibrated over the whole map would need twice the share on it",
  raisedPairs > 0 && raisedPairs / allPairs <= 0.5, { raisedPairs, allPairs });
rec("THE CONTROL: the old world carries rivers of its own", before.edits.length > 0 && !before.error, before.error || before.edits.length);
rec("⭐ riverBorderPairs with `side` gives exactly the pairs this test counts", md.riverBorderPairs({ W, H, land: T.land, pid: T.pid, side: raised }).a.length === raisedPairs);

const plan = md.planGeneratedRivers({ W, H, land: T.land, water: T.water, draw: raised, height: T.height, existing, pid: T.pid, seed: 1, learnt,
  pairsDenominator: md.riverBorderPairs({ W, H, land: T.land, pid: T.pid, side: raised }) });
const mine = new Uint8Array(N); for (const e of plan.edits) mine[e.y * W + e.x] = 1;

console.log("\n2. The raise");
rec("rivers are drawn", !plan.error && plan.edits.length > 0, plan.error || plan.stats);
{
  let offRaised = 0, onLand = 0, near = 0;
  for (const e of plan.edits) { const k = e.y * W + e.x; if (!T.land[k]) continue; onLand++; if (!raised[k]) offRaised++; if (RW.nearBorder(T, k)) near++; }
  rec("⭐⭐ not one new pixel on the old world's land", offRaised === 0 && onLand > 0, { offRaised, onLand });
  rec("⭐ …and every one of them on a border of the raised land or beside one", near === onLand, { near, onLand });
}
{
  const got = RW.borderShareOf({ W, H, isLand: (k) => T.land[k] === 1, pid: T.pid, isRiver: (k) => mine[k] === 1, side: raised });
  rec("⭐⭐⭐ the share of the raised land's border with a new river is the map below's, within 0.02", Math.abs(got.share - want) <= 0.02, { got, want });
  rec("⭐ …and the plan is not saturated, and reports the pairs it answered for", plan.stats.saturated === false && plan.stats.pairs === raisedPairs, plan.stats);
  const whole = RW.borderShareOf({ W, H, isLand: (k) => T.land[k] === 1, pid: T.pid, isRiver: (k) => mine[k] === 1 });
  rec("THE CONTROL: over the whole map the same drawing is far under the target — the number the prototype chased", whole.share < want / 2, { whole: whole.share, want });
  // a share the lanes cannot carry is reported, not chased: the owner is told the new land took all the rivers it could
  const tooMuch = md.planGeneratedRivers({ W, H, land: T.land, water: T.water, draw: raised, height: T.height, existing, pid: T.pid, seed: 1, learnt: { ...learnt, borderShare: 0.95 },
    pairsDenominator: md.riverBorderPairs({ W, H, land: T.land, pid: T.pid, side: raised }) });
  rec("⭐ a target its lanes cannot reach (95%) is saturated, at the most they carry — more than the calibrated plan draws",
    tooMuch.stats.saturated === true && tooMuch.stats.borderShare < 0.95 && tooMuch.stats.borderShare > plan.stats.borderShare, tooMuch.stats);
}
{
  let over = 0, touch = 0;
  for (const e of plan.edits) {
    const k = e.y * W + e.x;
    if (existing[k]) over++;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const j = k + dy * W + dx; if ((dx || dy) && j >= 0 && j < N && existing[j]) touch++; }
  }
  rec("⭐ the old world's rivers are not drawn over or touched", over === 0 && touch === 0, { over, touch });
  const idx = RW.overlay(N, plan.edits, W, base);
  const sh = md.riverShapeProblems({ W, H, idx, palette: RW.PALETTE, onlyMask: mine });
  const broken = Object.entries(sh).filter(([k, v]) => k !== "components" && k !== "examples" && v);
  rec("⭐ every shape rule 0 over the rivers the raise drew", broken.length === 0 && sh.components === plan.stats.systems, { broken, components: sh.components });
}

console.log("\n3. The border between the new land and the old has its lane on the new side, whatever the two provinces' ids");
{
  // A river is drawn on ONE side of a border: the lower id's between two raised provinces, but always the raised side against land
  // that is not raised — the old side is not this write's to draw on. Two provinces sharing one straight border, the north one old
  // and the south one raised, the sea a strip at the east edge: the south side of that border is the only lane. In the Voronoi
  // fixture above the raised provinces happen to have lower ids than the old ones beside them, so keying that border by id alone
  // passed it (review F6); here the raised province's id is the HIGHER one.
  const LW = 240, LH = 40, COAST = 232, N1 = LW * LH;
  const world = (oldId, newId) => {
    const L = { pid: new Int32Array(N1), land: new Uint8Array(N1), water: new Uint8Array(N1), height: new Uint8Array(N1), draw: new Uint8Array(N1) };
    for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
      const k = y * LW + x;
      if (x >= COAST) { L.water[k] = 1; L.pid[k] = 9000; L.height[k] = 89; continue; }
      L.land[k] = 1; L.height[k] = 100 + Math.round((COAST - 1 - x) * 0.08);
      if (y < LH / 2) L.pid[k] = oldId; else { L.pid[k] = newId; L.draw[k] = 1; }
    }
    return L;
  };
  const drawIt = (L) => md.planGeneratedRivers({ W: LW, H: LH, land: L.land, water: L.water, draw: L.draw, height: L.height, existing: new Uint8Array(N1), pid: L.pid, seed: 1,
    learnt: { ...learnt, borderShare: 1 }, pairsDenominator: md.riverBorderPairs({ W: LW, H: LH, land: L.land, pid: L.pid, side: L.draw }) });
  const along = (L, p) => p.edits.filter((e) => L.land[e.y * LW + e.x]).every((e) => e.y === LH / 2 && L.draw[e.y * LW + e.x]);
  const lowNew = world(2, 1), highNew = world(1, 2);
  const a = drawIt(lowNew), b = drawIt(highNew);
  rec("THE CONTROL: raised with the LOWER id, the new province carries a river along its border with the old, on its own side",
    a.stats.systems === 1 && a.stats.onLand >= learnt.minMain && along(lowNew, a), a.stats);
  rec("⭐⭐ raised with the HIGHER id, the same river, on the same side: the old land's id does not decide the new land's lane",
    b.stats.systems === 1 && along(highNew, b) && b.edits.length === a.edits.length && b.edits.every((e, i) => e.x === a.edits[i].x && e.y === a.edits[i].y && e.index === a.edits[i].index), b.stats);
}

console.log(`\n=== a partial raise gets its share of rivers: ${checks} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exitCode = fails.length ? 1 : 0;
