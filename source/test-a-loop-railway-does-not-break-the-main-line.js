// ⛔ #a-railway-closes-the-long-way-round, #a-generated-railway-is-as-good-as-the-rail-below — A LOOP ROW IS DEALT AFTER THE FOREST,
// INSIDE ITS COUNTRY'S QUOTA, AND NEVER TAKES A MAIN LINE'S RANK.
//
// dealRailwayLevels ranks a country's rows busiest first by betweenness over the forest of hubs. A row that closes a loop (rule h) is
// no part of that forest: walked into it, it becomes a tree edge in id order and a main-line row falls out of the tree with a
// betweenness of 0 — the main line drops a level while the loop takes it. And a loop is a country's own track, so it stays in that
// country's quota: the share of its pairs at each level is still the layer below's ("the lower level of its ends" instead put every
// loop between two good lines at their level and pushed TEST 33's countries off the base game's share, median .01 -> .07). The
// planner trims a loop row to the provinces not yet on the rail, so it may start or end on a junction mid-line (58 of the 248 loop
// ends of the TEST 33 rehearsal re-planned with the rule): such a row is ranked last too.
//
// Pure fixture: hubs 1-2-3-4 on a chain of three forest rows (hub 1 the capital, VP 10), a loop row 1-14-3 between two hubs, and a
// trimmed loop row 11-15-12 between two forest rows' middle provinces. One country, half its pairs at level 2 below. Expected levels
// are derived here from the rule's own definition (betweenness on the forest alone, the ties, quota = pairs x share, a row's middle
// pair inside the quota), not typed.
"use strict";
const md = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); } };

const rows = [
  { provinces: [1, 11, 2] },                 // forest
  { provinces: [2, 12, 3] },                 // forest
  { provinces: [3, 13, 4] },                 // forest
  { provinces: [1, 14, 3], loop: true },     // closes the loop 1-2-3, hub to hub
  { provinces: [11, 15, 12], loop: true },   // closes the loop 11-2-12, trimmed: both its ends are junctions mid-line
];
const vp = { 1: 10 };
const SHARE2 = 0.5;
const shares = { byGroup: new Map([["XXX", new Map([[1, 50], [2, 50]])]]), all: new Map([[1, 50], [2, 50]]) };
const opts = { groupOf: () => "XXX", vpOf: (h) => vp[h] || 0, shares, maxLevel: 5 };
const got = md.dealRailwayLevels(rows, opts);
const isLoop = (i) => !!rows[i].loop, FOREST = rows.map((_, i) => i).filter((i) => !isLoop(i)), LOOPS = rows.map((_, i) => i).filter(isLoop);
const pairs = (i) => rows[i].provinces.length - 1;
const endsOf = (i) => [rows[i].provinces[0], rows[i].provinces[rows[i].provinces.length - 1]];

/** the deal, derived from its definition: betweenness over the rows `tree` names (each cut: W(one side) x W(the other), a hub
 *  1 + its VP), busiest first, ties to the lower end id, the higher end id, the place in `rows`; a row takes level 2 while its
 *  middle pair lies inside the quota — all pairs x SHARE2 */
function derive(tree) {
  const w = (h) => 1 + (vp[h] || 0);
  const busy = rows.map(() => 0);
  for (const i of tree) {
    const [a, b] = endsOf(i), side = new Set([b]), q = [b];
    while (q.length) { const u = q.pop(); for (const j of tree) { if (j === i) continue; const [x, y] = endsOf(j); const v = x === u ? y : y === u ? x : null; if (v !== null && !side.has(v)) { side.add(v); q.push(v); } } }
    const all = new Set(tree.flatMap(endsOf)), wb = [...side].reduce((s, h) => s + w(h), 0), total = [...all].reduce((s, h) => s + w(h), 0);
    busy[i] = side.has(a) ? 0 : wb * (total - wb);   // a row whose ends the rest of the tree joins anyway is no cut
  }
  const order = rows.map((_, i) => i).sort((a, b) => busy[b] - busy[a] || Math.min(...endsOf(a)) - Math.min(...endsOf(b)) || Math.max(...endsOf(a)) - Math.max(...endsOf(b)) || a - b);
  const P = rows.reduce((s, _, i) => s + pairs(i), 0), quota = P * SHARE2, out = rows.map(() => 1);
  let placed = 0;
  for (const i of order) { out[i] = placed + pairs(i) / 2 <= quota + 1e-9 ? 2 : 1; placed += pairs(i); }
  return { out, busy, order, P, quota };
}
const want = derive(FOREST);
ok(FOREST.every((i) => want.busy[i] > 0) && LOOPS.length === 2, "(the fixture: on the forest alone every forest row is a cut, and two rows close loops)", want.busy);
ok(JSON.stringify(got) === JSON.stringify(want.out), "⭐⭐ the forest rows keep the ranks the forest gives them, and both loop rows are dealt after them", { got, want: want.out, order: want.order });
ok(LOOPS.every((i) => FOREST.every((f) => got[i] <= got[f])), "⭐ no loop row — hub to hub, or trimmed to two junctions — is better than any forest row of its country", got);
const at2 = got.reduce((s, l, i) => s + (l >= 2 ? pairs(i) : 0), 0);
ok(Math.abs(at2 - want.quota) <= Math.max(...rows.map((_, i) => pairs(i))) / 2, "⭐ the country's pairs at level 2 or more are its quota of ALL its pairs, the loops' included, within half a row", { at2, quota: want.quota, P: want.P });
const forestOnly = md.dealRailwayLevels(FOREST.map((i) => ({ provinces: rows[i].provinces })), opts);
ok(FOREST.every((i, k) => got[i] >= forestOnly[k]), "…and a forest row never goes down a level because a loop came", { got, forestOnly });
// CONTROL: the flag is what changes the answer. Stripped, the loop rows are walked into the forest and become its tree edges — derived
// on the forest of ALL the rows' ends, a main-line row then falls out of the tree and drops below its level on the forest alone.
const stripped = md.dealRailwayLevels(rows.map(({ provinces }) => ({ provinces })), opts);
const drops = FOREST.filter((i, k) => stripped[i] < forestOnly[k]);
ok(drops.length > 0 && JSON.stringify(stripped) !== JSON.stringify(got), "CONTROL: the same rows with the flag stripped are dealt differently — a main-line row drops below its level on the forest alone", { stripped, got, forestOnly, drops: drops.map((i) => rows[i].provinces) });

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
