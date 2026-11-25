// ⛔ #a-generated-railway-is-as-good-as-the-rail-below — dealRailwayLevels, the pure rule, over hand cases and 300 seeded forests.
//
// What it promises, each asked here of its output and nothing else:
//   · a level from 1 to the define;
//   · each group's pairs at or above each level within half its longest row of its share (its own pairs below, else the map's);
//   · each group's rows at or above each level ONE piece in each piece of its own rail — a main line, not scattered stretches —
//     which holds only while every hub weighs something: a hub of no victory point weighs 1, never 0 (over 300 random trees with
//     half their hubs at no victory point, weighing the victory point alone broke 72 main lines in two);
//   · a row across a border the lower of the best one-group levels at its two ends;
//   · the same levels whatever order the rows come in.
"use strict";
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};
const deal = md.dealRailwayLevels;
ok(typeof deal === "function", "map-data.js exports dealRailwayLevels");
const share = (o) => new Map(Object.entries(o).map(([k, v]) => [+k, v]));
const ends = (r) => [r.provinces[0], r.provinces[r.provinces.length - 1]];

console.log("\n-- hand cases --");
{
  // a chain of five hubs, one country, every row one pair; half its pairs below were level 2: the two middle rows, the busiest
  const chain = [[1, 2], [2, 3], [3, 4], [4, 5]].map((p) => ({ provinces: p }));
  const s = { byGroup: new Map([["AAA", share({ 1: 1, 2: 1 })]]), all: share({ 1: 1 }) };
  ok(deal(chain, { groupOf: () => "AAA", shares: s, maxLevel: 5 }).join() === "1,2,2,1", "a chain's middle rows are its busiest, and take the level-2 half", deal(chain, { groupOf: () => "AAA", shares: s, maxLevel: 5 }));
  // the same chain with a heavy hub at one end: the busiest rows move towards it
  ok(deal(chain, { groupOf: () => "AAA", vpOf: (h) => (h === 1 ? 20 : 0), shares: s, maxLevel: 5 }).join() === "2,2,1,1", "…and a hub of 20 victory points at one end pulls them to it", deal(chain, { groupOf: () => "AAA", vpOf: (h) => (h === 1 ? 20 : 0), shares: s, maxLevel: 5 }));
  // ⚠️ the shape the critic measured: hubs of no victory point but one, ids out of order along the chain
  const scrambled = [[1, 50], [50, 60], [60, 2], [2, 70]].map((p) => ({ provinces: p }));
  const sc = deal(scrambled, { groupOf: () => "AAA", vpOf: (h) => (h === 70 ? 5 : 0), shares: s, maxLevel: 5 });
  ok(sc.filter((l) => l === 2).length === 2 && [[0, 1], [1, 2], [2, 3]].some(([a, b]) => sc[a] === 2 && sc[b] === 2), "⭐⭐ hubs of no victory point still weigh: the level-2 rows are two that touch", sc);
  ok(deal(chain, { groupOf: () => "BBB", shares: s, maxLevel: 5 }).join() === "1,1,1,1" && deal(chain, { groupOf: () => "", shares: { byGroup: new Map(), all: share({ 2: 1 }) }, maxLevel: 5 }).join() === "2,2,2,2",
    "a country with no rail below takes the map's share, and so does ownerless land", [deal(chain, { groupOf: () => "BBB", shares: s, maxLevel: 5 })]);
  ok(deal(chain, { groupOf: () => "AAA", shares: { byGroup: new Map([["AAA", share({ 7: 1 })]]), all: share({ 1: 1 }) }, maxLevel: 3 }).every((l) => l === 3), "a level above the define counts at it", deal(chain, { groupOf: () => "AAA", shares: { byGroup: new Map([["AAA", share({ 7: 1 })]]), all: share({ 1: 1 }) }, maxLevel: 3 }));
  ok(deal(chain, { groupOf: () => "AAA", shares: null }).every((l) => l === 1) && deal(chain, { groupOf: () => "AAA", shares: { byGroup: new Map(), all: new Map() } }).every((l) => l === 1) && deal([], { shares: s }).length === 0,
    "no shares, or empty ones: every row level 1");
  // a crossing: AAA's rows 1-2-3 at level 3, BBB's 4-5 at 1; the row 3-4 between them takes the lower; one whose far end has no own row takes the near end's
  const two = [{ provinces: [1, 2] }, { provinces: [2, 3] }, { provinces: [3, 11, 4] }, { provinces: [4, 5] }, { provinces: [5, 12, 6] }];
  const own = { 1: "AAA", 2: "AAA", 3: "AAA", 11: "AAA", 4: "BBB", 5: "BBB", 12: "CCC", 6: "CCC" };
  const t = deal(two, { groupOf: (p) => own[p], shares: { byGroup: new Map([["AAA", share({ 3: 1 })], ["BBB", share({ 1: 1 })]]), all: share({ 2: 1 }) }, maxLevel: 5 });
  ok(t.join() === "3,3,1,1,1", "⭐ a row across a border is the lower of its ends' best levels; an end with no own row is passed over", t);
}

console.log("\n-- ⭐ 300 seeded forests --");
let seed = 20261007;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = (a) => a[Math.floor(rnd() * a.length)];
function world() {
  const n = 4 + Math.floor(rnd() * 30), hubs = [], rows = [], owner = {};
  let nextId = 1000;
  const tags = ["AAA", "BBB", "CCC", ""];
  for (let i = 0; i < n; i++) {
    const h = 1 + Math.floor(rnd() * 900);
    if (hubs.includes(h)) { i--; continue; }
    hubs.push(h);
    // a hub mostly keeps its parent's country, so countries come in pieces of land
    const parent = i === 0 || rnd() < 0.08 ? null : hubs[Math.floor(rnd() * i)];   // null: a new tree (another landmass)
    owner[h] = parent !== null && rnd() < 0.8 ? owner[parent] : pick(tags);
    if (parent === null) continue;
    const mid = [];
    for (let k = Math.floor(rnd() * 4); k > 0; k--) { const p = nextId++; owner[p] = rnd() < 0.5 ? owner[parent] : owner[h]; mid.push(p); }
    rows.push({ provinces: [parent, ...mid, h] });
  }
  const vp = {};
  for (const h of hubs) vp[h] = rnd() < 0.5 ? 0 : 1 + Math.floor(rnd() * 20);
  const randShare = () => { const m = new Map(); for (let l = 1; l <= 5; l++) if (rnd() < 0.7) m.set(l, Math.floor(rnd() * 20)); return m; };
  const byGroup = new Map();
  for (const t of ["AAA", "BBB", "CCC"]) if (rnd() < 0.8) byGroup.set(t, randShare());
  return { rows, owner, vp, shares: { byGroup, all: randShare() }, maxLevel: 2 + Math.floor(rnd() * 4) };
}
const groupOfRow = (r, owner) => { const g = new Set(r.provinces.map((p) => owner[p] || "")); return g.size === 1 ? [...g][0] : null; };
const size = (m) => [...m.values()].reduce((a, b) => a + b, 0);
const atLeast = (m, l) => { const n = size(m); let k = 0; for (const [lv, v] of m) if (lv >= l) k += v; return n ? k / n : 0; };
/** the rows at or above a level in each piece of one group's own rail: how many pieces each */
function pieces(rs, level) {
  const mk = () => { const par = new Map(); const f = (x) => { if (!par.has(x)) par.set(x, x); while (par.get(x) !== x) x = par.get(x); return x; }; return { f, join: (a, b) => par.set(f(a), f(b)) }; };
  const comp = mk(); for (const r of rs) comp.join(...ends(r));
  const by = new Map();
  for (const r of rs) if (r.level >= level) { const k = comp.f(ends(r)[0]); if (!by.has(k)) by.set(k, []); by.get(k).push(r); }
  return [...by.values()].map((list) => { const u = mk(); for (const r of list) u.join(...ends(r)); return new Set(list.map((r) => u.f(ends(r)[0]))).size; });
}
const bad = { range: [], quota: [], linked: [], cross: [], shuffle: [] };
let worlds = 0, rowsSeen = 0, aboveOne = 0, crossings = 0;
for (let w = 0; w < 300; w++) {
  const W = world();
  if (!W.rows.length) continue;
  worlds++;
  const opts = { groupOf: (p) => W.owner[p] || "", vpOf: (h) => W.vp[h] || 0, shares: W.shares, maxLevel: W.maxLevel };
  const lv = deal(W.rows, opts);
  const rows = W.rows.map((r, i) => ({ ...r, level: lv[i] }));
  rowsSeen += rows.length; aboveOne += rows.filter((r) => r.level > 1).length;
  if (rows.some((r) => !(Number.isInteger(r.level) && r.level >= 1 && r.level <= W.maxLevel))) bad.range.push(w);
  const groups = new Map(), cross = [];
  for (const r of rows) { const g = groupOfRow(r, W.owner); if (g === null) cross.push(r); else { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); } }
  crossings += cross.length;
  for (const [g, rs] of groups) {
    const own = g && W.shares.byGroup.get(g), m = own && size(own) > 0 ? own : W.shares.all;
    const P = rs.reduce((s, r) => s + r.provinces.length - 1, 0), half = Math.max(...rs.map((r) => r.provinces.length - 1)) / 2;
    for (let l = 2; l <= W.maxLevel; l++) {
      const placed = rs.filter((r) => r.level >= l).reduce((s, r) => s + r.provinces.length - 1, 0);
      if (size(m) && Math.abs(placed - P * atLeast(m, l)) > half + 1e-9) bad.quota.push({ w, g, l, placed, want: P * atLeast(m, l), half });
      if (pieces(rs, l).some((n) => n > 1)) bad.linked.push({ w, g, l });
    }
  }
  const best = new Map();
  for (const rs of groups.values()) for (const r of rs) for (const h of ends(r)) best.set(h, Math.max(best.get(h) || 0, r.level));
  for (const r of cross) { const at = ends(r).map((h) => best.get(h)).filter((v) => v > 0); if (r.level !== (at.length ? Math.min(...at) : 1)) bad.cross.push({ w, row: r.provinces }); }
  // the same rows in another order: the same level for each
  const order = W.rows.map((_, i) => i).sort(() => rnd() - 0.5);
  const again = deal(order.map((i) => W.rows[i]), opts);
  if (order.some((i, k) => again[k] !== lv[i])) bad.shuffle.push(w);
}
ok(worlds >= 290 && aboveOne > rowsSeen / 10 && crossings > 100, `(the worlds: ${worlds} forests, ${rowsSeen} rows, ${aboveOne} above level 1, ${crossings} across a border)`);
ok(bad.range.length === 0, "every level is from 1 to the define", bad.range.slice(0, 5));
ok(bad.quota.length === 0, "⭐⭐⭐ each group's pairs at each level are within half its longest row of its share", bad.quota.slice(0, 5));
ok(bad.linked.length === 0, "⭐⭐⭐ each group's rows at each level are one piece in each piece of its own rail — with half the hubs on no victory point", bad.linked.slice(0, 5));
ok(bad.cross.length === 0, "⭐⭐ every row across a border is the lower of its ends' best levels", bad.cross.slice(0, 5));
ok(bad.shuffle.length === 0, "⭐⭐ the same rows in another order get the same levels", bad.shuffle.slice(0, 5));

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
