// A sea Generate land cuts off goes back to the ocean when that changes less than filling it. #generate-land-leaves-no-sea-cut-off
//
// THE DEFECT. TEST 32 (Delete map, Generate land 35% seed 1, Auto-fix, Redraw) left 30 seas walled off from the ocean — 213
// provinces, the largest 146 — and nothing filled them: the half-water keep read the base game's regions over a drowned map. 10 of
// its 44 harbours opened only onto one, 140 spawn rows faced one, and 21 of the 1936 task forces lay in one, unable to leave.
// Vanilla has ONE sea body, and hangs big seas behind one-province straits (46 of them).
//
// THE FIX, the half this file pins: joinCutOffSeasToOcean, pure. Largest body first, re-measured after each join, a body the click
// cut off keeps its way out through the fewest of the click's picks — which stay sea — when that chain is SHORTER than the body;
// a tie keeps the land. The way out may cross another pocket the click cut off, at no cost, and that pocket comes back with it:
// walking picks alone, vanilla at 35% seed 2 filled a 16-province sea whose every way out crossed a 2-province pocket, where 4 picks
// kept both open (review R-P1). A body that must not become land (`mustJoin`: a port faces it, or it is in no strategic region) is
// joined whatever the chain. A body `keep` names (cut off before the click) is never touched nor crossed, a chain never walks land
// that was land before the click, and the ocean is the body holding most of the ocean as it was (`ocean`; with none, the largest).
//
// Every expectation is DERIVED on the hand graphs below by an oracle written here — a breadth-first count of the fewest picks
// between a body and the ocean, the same count relaxed to a fixpoint when other pockets may be crossed, and a flood of the sea that
// is left — never typed in.
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

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-joinseas-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

// ── the oracle ──────────────────────────────────────────────────────────────────────────────────────────
const graph = (edges) => {
  const adj = new Map();
  const link = (a, b) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(b); };
  for (const [a, b] of edges) { link(a, b); link(b, a); }
  return adj;
};
// the sea bodies of a map, each sorted, the largest first
const seaBodies = (adj, isSea) => {
  const seen = new Set(), out = [];
  for (const s of [...adj.keys()].sort((a, b) => a - b)) {
    if (seen.has(s) || !isSea(s)) continue;
    const m = [s]; seen.add(s);
    for (let i = 0; i < m.length; i++) for (const q of adj.get(m[i]) || []) if (!seen.has(q) && isSea(q)) { seen.add(q); m.push(q); }
    out.push(m.sort((a, b) => a - b));
  }
  return out.sort((a, b) => b.length - a.length || a[0] - b[0]);
};
// the fewest picks between a body and a set of sea provinces, walking picks only (Infinity: none)
const fewestPicks = (adj, picks, body, ocean) => {
  const dist = new Map(), q = [];
  for (const p of body) for (const r of adj.get(p) || []) if (picks.has(r) && !dist.has(r)) { dist.set(r, 1); q.push(r); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h];
    if ([...(adj.get(c) || [])].some((r) => ocean.has(r))) return dist.get(c);
    for (const r of adj.get(c) || []) if (picks.has(r) && !dist.has(r)) { dist.set(r, dist.get(c) + 1); q.push(r); }
  }
  return Infinity;
};
// …and when the provinces of `across` (the other pockets) may be crossed at no cost: relaxed to a fixpoint, not searched
const fewestPicksAcross = (adj, picks, body, ocean, across) => {
  const dist = new Map(body.map((p) => [p, 0]));
  for (let moved = true; moved;) {
    moved = false;
    for (const [c, d] of [...dist]) for (const r of adj.get(c) || []) {
      const w = picks.has(r) ? 1 : across.has(r) ? 0 : -1;
      if (w >= 0 && (!dist.has(r) || d + w < dist.get(r))) { dist.set(r, d + w); moved = true; }
    }
  }
  let best = Infinity;
  for (const [c, d] of dist) if (picks.has(c) && [...(adj.get(c) || [])].some((r) => ocean.has(r))) best = Math.min(best, d);
  return best;
};
const same = (a, b) => JSON.stringify([...a].map(Number).sort((x, y) => x - y)) === JSON.stringify([...b].map(Number).sort((x, y) => x - y));

/** One case: a hand map, the click's picks, and the join run on it. Returns what the oracle needs to judge it. */
function run({ edges, land = [], picks, keep = null, mustJoin = null, ocean = null }) {
  const adj = graph(edges);
  const landSet = new Set(land);
  const typeOf = (id) => (landSet.has(id) ? "land" : "sea");
  const raised = new Set(picks);
  const out = md.joinCutOffSeasToOcean({ ids: [...adj.keys()], typeOf, raised, adj, keep, mustJoin, ocean: ocean ? new Set(ocean) : null });
  const isSea = (id) => typeOf(id) === "sea" && !raised.has(id);
  const bodies = seaBodies(adj, isSea);
  const holding = ocean ? (b) => b.filter((p) => ocean.includes(p)).length : () => 0;
  const oceanBody = bodies.slice().sort((a, b) => holding(b) - holding(a) || b.length - a.length || a[0] - b[0])[0] || [];
  const cutOff = bodies.filter((b) => b !== oceanBody);
  return { adj, out, raised, bodies, oceanBody: new Set(oceanBody), cutOff, inOcean: (ids) => ids.every((p) => oceanBody.includes(p)) };
}
// the invariant every case ends on: a sea still cut off (and not one `keep` names) is one a fill changes less than a join would,
// counted across the other pockets still cut off (never across a kept one)
const nothingLeftToJoin = (r, { keep = () => false, mustJoin = () => false } = {}) =>
  r.cutOff.filter((b) => !keep(b)).every((b) => !mustJoin(b)
    && fewestPicksAcross(r.adj, r.raised, b, r.oceanBody, new Set(r.cutOff.filter((o) => o !== b && !keep(o)).flat())) >= b.length);

const OCEAN = [1, 2, 3, 4, 5, 6];
const ring = (ids) => ids.map((id, i) => [id, ids[(i + 1) % ids.length]]);
const path_ = (ids) => ids.slice(1).map((id, i) => [ids[i], id]);

try {
  console.log("=== A sea the click cut off goes back to the ocean when that changes less ===\n");

  console.log("(a) a bay of five behind one pick");
  {
    const BAY = [30, 31, 32, 33, 34];
    const r = run({ edges: [...ring(OCEAN), [3, 20], [20, 30], ...path_(BAY)], picks: [20] });
    rec("THE CONTROL: the bay is cut off by one pick", fewestPicks(r.adj, new Set([20]), BAY, new Set(OCEAN)) === 1 && BAY.length === 5);
    rec("⭐⭐⭐ it is joined: the one pick between it and the ocean stays sea, and nothing else does", same(r.out.leftSea, [20]) && r.inOcean(BAY), r.out);
    rec("…and the join says which sea it put back, by which chain", r.out.joined.length === 1 && same(r.out.joined[0].provinces, BAY) && same(r.out.joined[0].chain, [20]) && r.out.seas === 1, r.out.joined);
    rec("…and leaves nothing to join", nothingLeftToJoin(r));
  }

  console.log("\n(b) one province behind one pick: a tie keeps the land");
  {
    const r = run({ edges: [...ring(OCEAN), [4, 21], [21, 40]], picks: [21] });
    rec("THE CONTROL: the pocket is one province behind one pick", fewestPicks(r.adj, new Set([21]), [40], new Set(OCEAN)) === 1);
    rec("⭐⭐ it is not joined — filling it changes no more than opening it would, and the land is what was asked for",
      r.out.leftSea.length === 0 && r.out.joined.length === 0 && r.raised.has(21) && r.cutOff.length === 1, r.out);
    rec("…and it is left to fill", nothingLeftToJoin(r));
  }

  console.log("\n(c) two provinces behind one pick, and two behind two");
  {
    const ONE = [50, 51], TWO = [52, 53];
    const r = run({ edges: [...ring(OCEAN), [2, 22], [22, 50], [50, 51], [5, 23], [23, 24], [24, 52], [52, 53]], picks: [22, 23, 24] });
    rec("THE CONTROL: the oracle counts one pick and two", fewestPicks(r.adj, new Set([22, 23, 24]), ONE, new Set(OCEAN)) === 1 && fewestPicks(r.adj, new Set([22, 23, 24]), TWO, new Set(OCEAN)) === 2);
    rec("⭐⭐ the pair behind one pick is joined", r.inOcean(ONE) && same(r.out.leftSea, [22]), r.out);
    rec("⭐⭐ the pair behind two is not: its chain is as long as it is", r.cutOff.some((b) => same(b, TWO)) && r.raised.has(23) && r.raised.has(24), r.out);
    rec("…and nothing is left to join", nothingLeftToJoin(r));
  }

  console.log("\n(d) the one-province pocket of (b) again, with a port facing it: it MUST join");
  {
    const must = (b) => b.includes(40);
    const r = run({ edges: [...ring(OCEAN), [4, 21], [21, 40]], picks: [21], mustJoin: must });
    rec("⭐⭐⭐ the sea a port faces goes back to the ocean, whatever the chain", same(r.out.leftSea, [21]) && r.inOcean([40]) && r.out.joined.length === 1 && r.out.joined[0].must === true, r.out);
    rec("…and nothing is left to join", nothingLeftToJoin(r, { mustJoin: must }));
  }

  console.log("\n(e) a sea cut off BEFORE the click is never this click's");
  {
    const BAY = [30, 31, 32, 33, 34];
    const keep = (b) => b.includes(30);
    const r = run({ edges: [...ring(OCEAN), [3, 20], [20, 30], ...path_(BAY)], picks: [20], keep });
    rec("⭐⭐ the bay (a) would have joined is left as it is, and so is the pick beside it", r.out.leftSea.length === 0 && r.out.joined.length === 0 && r.raised.has(20) && r.cutOff.some((b) => same(b, BAY)), r.out);
    rec("…and nothing else is left to join", nothingLeftToJoin(r, { keep }));
  }

  console.log("\n(f) one chain opens two seas: re-measured after every join");
  {
    // A (3) sits behind pick 26 alone; B (2) behind pick 25 of its own AND pick 26. A goes first, as the larger; opening 26 opens B too.
    const A = [60, 61, 62], B = [63, 64];
    const r = run({ edges: [...ring(OCEAN), [1, 26], [26, 60], ...path_(A), [26, 63], [63, 64], [64, 25], [25, 4]], picks: [25, 26] });
    rec("THE CONTROL: each has a chain of its own shorter than itself", fewestPicks(r.adj, new Set([25, 26]), A, new Set(OCEAN)) === 1 && fewestPicks(r.adj, new Set([25, 26]), B, new Set(OCEAN)) === 1);
    rec("⭐⭐⭐ one pick stays sea, not two — the larger sea's chain already brought the smaller one back", same(r.out.leftSea, [26]) && r.raised.has(25) && r.inOcean([...A, ...B]), r.out);
    rec("…and the count of seas put back is two, from one join", r.out.seas === 2 && r.out.joined.length === 1 && same(r.out.joined[0].provinces, [...A, ...B]), r.out);
  }

  console.log("\n(g) two chains of one: the lower id stays sea");
  {
    const r = run({ edges: [...ring(OCEAN), [2, 27], [27, 70], [5, 28], [28, 71], [70, 71]], picks: [27, 28] });
    rec("THE CONTROL: the pair has two chains of one", fewestPicks(r.adj, new Set([27]), [70, 71], new Set(OCEAN)) === 1 && fewestPicks(r.adj, new Set([28]), [70, 71], new Set(OCEAN)) === 1);
    rec("⭐ it is joined through the lower id, and the other pick stays land", same(r.out.leftSea, [27]) && r.raised.has(28), r.out);
  }

  console.log("\n(h) land that was land before the click is never part of a chain");
  {
    // the body (3) touches old land 91, and 91 touches the ocean: one step — but 91 is not the click's to give back. Two picks are.
    const BODY = [72, 73, 74];
    const r = run({ edges: [...ring(OCEAN), [72, 91], [91, 3], [74, 29], [29, 39], [39, 6], ...path_(BODY)], land: [91], picks: [29, 39] });
    rec("THE CONTROL: across the old land the body is one step from the ocean, across the picks two", r.adj.get(91).has(3) && r.adj.get(91).has(72)
      && fewestPicks(r.adj, new Set([29, 39]), BODY, new Set(OCEAN)) === 2);
    rec("⭐⭐⭐ it is joined through the two picks, and the old land stays land", same(r.out.leftSea, [29, 39]) && !r.out.leftSea.includes(91) && r.inOcean(BODY), r.out);
  }

  console.log("\n(i) a sea a port faces, behind ANOTHER pocket: it crosses that pocket, and brings it back too");
  {
    // ocean ring 1..10; P (40, the port's) - pick 21 - Q (30) - pick 20 - ocean 1, with old land 50/51 behind both
    const O10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const must = (b) => b.includes(40);
    const r = run({ edges: [...ring(O10), [20, 1], [20, 30], [21, 30], [21, 40], [30, 50], [40, 51], [50, 51], [20, 50], [21, 51], [21, 50]], land: [50, 51], picks: [20, 21], mustJoin: must });
    rec("THE CONTROL: walking picks alone, P never reaches the ocean — every way out crosses Q",
      fewestPicks(r.adj, new Set([20, 21]), [40], new Set(O10)) === Infinity);
    rec("⭐⭐⭐ P goes back to the ocean, and Q with it", r.inOcean([40, 30]) && same(r.out.leftSea, [20, 21]) && r.out.failed.length === 0, r.out);
    rec("…and the count of seas put back is both", r.out.seas === 2, r.out);
  }

  console.log("\n(j) a designed ocean larger than what the click leaves of the real one");
  {
    // the real ocean is a path 1..10 (the largest body before the click); a designed ring 101..106 was cut off before it; old land 200
    // touches both. The click raises 3 and 7: the real ocean is now three pieces, each smaller than the ring.
    const REAL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], RINGED = [101, 102, 103, 104, 105, 106];
    const edges = [...path_(REAL), ...ring(RINGED), ...[1, 5, 10, 101, 104].map((p) => [200, p])];
    const keep = (b) => b.some((p) => RINGED.includes(p));
    const before = seaBodies(graph(edges), (id) => id !== 200);
    rec("THE CONTROL: before the click the real ocean is the largest body, and after it the ring is",
      same(before[0], REAL) && seaBodies(graph(edges), (id) => id !== 200 && id !== 3 && id !== 7)[0].length === RINGED.length);
    const r = run({ edges, land: [200], picks: [3, 7], keep, ocean: REAL });
    rec("⭐⭐⭐ every piece of the real ocean goes back to it — the ocean is where the ocean was, not the largest body left",
      r.inOcean(REAL) && same(r.out.leftSea, [3, 7]) && r.out.seas === 2, r.out);
    rec("…and the designed ring is left alone", r.cutOff.length === 1 && same(r.cutOff[0], RINGED), r.cutOff);
    // the plan asks the same question: over the map the click leaves (before any join), the ocean is the piece holding most of it
    const typeOf = (id) => (id === 200 || id === 3 || id === 7 ? "land" : "sea");
    const model = { provinces: [...graph(edges).keys()].map((id) => ({ id, type: typeOf(id) })), strategicRegions: [], provinceToRegion: {} };
    const plan = md.inlandSeaPlan({ model, adj: graph(edges), typeOf, keepMostlyWater: false, ocean: new Set(REAL) });
    const pieces = seaBodies(graph(edges), (id) => typeOf(id) === "sea").filter((b) => !b.some((p) => RINGED.includes(p)));
    const held = pieces.slice().sort((a, b) => b.length - a.length || a[0] - b[0])[0];
    rec("⭐⭐⭐ inlandSeaPlan takes the piece of the real ocean as the ocean, and the ring as a body cut off",
      !plan.fill.some((p) => held.includes(p)) && RINGED.every((p) => plan.fill.includes(p)), { fill: plan.fill, ocean: held });
    const bare = md.inlandSeaPlan({ model, adj: graph(edges), typeOf, keepMostlyWater: false });
    rec("THE CONTROL: asked with no `ocean`, it takes the ring — the largest — as before", RINGED.every((p) => !bare.fill.includes(p)) && held.every((p) => bare.fill.includes(p)), bare.fill);
  }

  console.log("\n(k) the half-water keep is the repair's, and Generate land can turn it off");
  {
    // a pocket in a strategic region that is mostly water: kept by default (the repair, Auto-fix), filled when the caller says so
    const edges = [...ring(OCEAN), [3, 20], [20, 40]];
    const typeOf = (id) => (id === 20 ? "land" : "sea");
    const model = { provinces: [...OCEAN, 20, 40].map((id) => ({ id, type: typeOf(id) })), strategicRegions: [{ id: 9, provinces: [40, 5, 20] }], provinceToRegion: { 40: 9, 5: 9, 20: 9 } };
    const keepIt = md.inlandSeaPlan({ model, adj: graph(edges), typeOf });
    const fillIt = md.inlandSeaPlan({ model, adj: graph(edges), typeOf, keepMostlyWater: false });
    rec("THE CONTROL: by default the pocket is kept, as the repair keeps it", same(keepIt.kept.caspian, [40]) && keepIt.fill.length === 0, keepIt);
    rec("⭐⭐ keepMostlyWater: false fills it", same(fillIt.fill, [40]) && fillIt.kept.caspian.length === 0, fillIt);
  }

  console.log("\n(l) a sea behind ANOTHER pocket, no port facing it: it crosses that pocket when that changes less (review R-P1)");
  {
    // (i)'s shape with no port and a larger sea: P (40-41-42) - pick 21 - Q (30) - pick 20 - ocean 1, old land 50/51 behind both
    const O10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], P = [40, 41, 42], Q = [30];
    const r = run({ edges: [...ring(O10), ...path_(P), [20, 1], [20, 30], [21, 30], [21, 40], [30, 50], [42, 51], [50, 51], [20, 50], [21, 51], [21, 50]], land: [50, 51], picks: [20, 21] });
    const across = fewestPicksAcross(r.adj, new Set([20, 21]), P, new Set(O10), new Set(Q));
    rec("THE CONTROL: walking picks alone, P never reaches the ocean; across Q it is fewer picks away than it has provinces",
      fewestPicks(r.adj, new Set([20, 21]), P, new Set(O10)) === Infinity && across < P.length, { across, size: P.length });
    rec("⭐⭐⭐ P goes back to the ocean across Q, and Q with it — not filled", r.inOcean([...P, ...Q]) && r.out.leftSea.length === across && r.out.failed.length === 0, r.out);
    rec("…by one join that is not a must, and the count of seas put back is both", r.out.joined.length === 1 && r.out.joined[0].must === false && r.out.seas === 2, r.out);
    rec("…and nothing is left to join", nothingLeftToJoin(r));
  }

  console.log("\n(m) the cheaper of the two ways: a chain of picks alone as long as the sea, a shorter one across a pocket");
  {
    // B (80-81-82): picks 31-32-33 to ocean 4, or pick 34 - Q (90) - pick 35 to ocean 2
    const B = [80, 81, 82], Q = [90], ALONE = [31, 32, 33];
    const picks = [...ALONE, 34, 35];
    const r = run({ edges: [...ring(OCEAN), ...path_(B), [82, 31], ...path_(ALONE), [33, 4], [80, 34], [34, 90], [90, 35], [35, 2]], picks });
    const alone = fewestPicks(r.adj, new Set(picks), B, new Set(OCEAN)), across = fewestPicksAcross(r.adj, new Set(picks), B, new Set(OCEAN), new Set(Q));
    rec("THE CONTROL: across picks alone the sea's chain ties its size (so it would be filled); across Q it is shorter",
      alone === B.length && across < B.length, { alone, across, size: B.length });
    rec("⭐⭐⭐ it goes back to the ocean by the shorter chain, Q with it, and the longer one stays land",
      r.inOcean([...B, ...Q]) && r.out.leftSea.length === across && ALONE.every((p) => r.raised.has(p)), r.out);
    rec("…and nothing is left to join", nothingLeftToJoin(r));
  }

  console.log("\n(n) the fewest PICKS, not the fewest steps: a long pocket crossed beats a short wall of picks");
  {
    // B (130..134): pick 41 - R (140..143) - pick 42 to ocean 3 is two picks over six steps; picks 43-44-45 to ocean 5 are three
    // picks over three steps. A search counting steps finds the three, joins B by them, then R by 42: four picks left sea, not two.
    const B = [130, 131, 132, 133, 134], R = [140, 141, 142, 143], WALL = [43, 44, 45];
    const picks = [41, 42, ...WALL];
    const r = run({ edges: [...ring(OCEAN), ...path_(B), ...path_(R), [130, 41], [41, 140], [143, 42], [42, 3], [134, 43], ...path_(WALL), [45, 5]], picks });
    const across = fewestPicksAcross(r.adj, new Set(picks), B, new Set(OCEAN), new Set(R));
    rec("THE CONTROL: picks alone, B is three away; across R, two", fewestPicks(r.adj, new Set(picks), B, new Set(OCEAN)) === WALL.length && across === 2 && across < WALL.length);
    rec("⭐⭐⭐ B goes back across R by the two picks, R with it, and the wall of three stays land",
      r.inOcean([...B, ...R]) && r.out.leftSea.length === across && WALL.every((p) => r.raised.has(p)) && r.out.joined.length === 1, r.out);
  }

  console.log("\n(o) with no `ocean` given, the ocean is the LARGEST body — not the one that holds the lowest id");
  {
    // the ocean ring 201..206; a one-province pocket 7 behind pick 50. Asked which body is the ocean by id, the pocket would be.
    const RING = [201, 202, 203, 204, 205, 206];
    const r = run({ edges: [...ring(RING), [203, 50], [50, 7]], picks: [50] });
    const cut = seaBodies(r.adj, (id) => id !== 50);   // the click's map, before any join
    rec("THE CONTROL: the pocket holds the lowest sea id, and the ring is the largest body", same(cut[0], RING) && Math.min(...cut.flat()) === 7 && cut.length === 2, cut);
    rec("⭐⭐ the pocket is judged against the ring: one province behind one pick, a tie, so the land stays",
      r.out.leftSea.length === 0 && r.out.joined.length === 0 && r.out.seas === 0 && r.raised.has(50) && same(r.oceanBody, RING), r.out);
  }

  console.log("\n(p) a sea `keep` names is never crossed — not by a sea the click cut off, not by one that must join");
  {
    // B (150-151-152) - pick 46 - K (160, kept: the layers below ship it cut off) - pick 47 - ocean 1; B has no other way out
    const B = [150, 151, 152], K = [160];
    const edges = [...ring(OCEAN), ...path_(B), [150, 46], [46, 160], [160, 47], [47, 1]];
    const keep = (b) => b.includes(160);
    const r = run({ edges, picks: [46, 47], keep });
    rec("THE CONTROL: across K, B would be two picks from the ocean — fewer than its three provinces",
      fewestPicksAcross(r.adj, new Set([46, 47]), B, new Set(OCEAN), new Set(K)) === 2 && fewestPicks(r.adj, new Set([46, 47]), B, new Set(OCEAN)) === Infinity);
    rec("⭐⭐⭐ B is not joined through K: no pick stays sea, and K and B are both still cut off",
      r.out.leftSea.length === 0 && r.cutOff.some((b) => same(b, K)) && r.cutOff.some((b) => same(b, B)), r.out);
    rec("…and nothing is left to join", nothingLeftToJoin(r, { keep }));
    const must = (b) => b.includes(150);
    const m = run({ edges, picks: [46, 47], keep, mustJoin: must });
    rec("⭐⭐ a must-join B with no other way out is reported failed, not joined through K",
      m.out.leftSea.length === 0 && m.out.failed.length === 1 && same(m.out.failed[0], B) && m.cutOff.some((b) => same(b, K)), m.out);
  }

  console.log(`\n=== A sea the click cut off goes back to the ocean when that changes less: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
