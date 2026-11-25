// #a-redraw-keeps-what-it-does-not-model — A REGION THAT IS STILL WHAT IT WAS KEEPS ITS OWN WEATHER.
//
// planStrategicRegions gives each new region the base id it overlaps most (greedy, largest overlap first), then picks a weather
// donor. It picked the base region with the largest overlap. A region can get base id k while overlapping another base region
// j just as much, when a bigger region took j first. Then its weather came from j, and the weather its own block k carries —
// the modder's, comments and all — was replaced by j's. Measured on a real redraw of Road to 56: with the own-id rule 9 of its
// 11 region-file comments survive; without it 8 ("#same as in Great Lakes 198" in 276-East North Central States.txt goes).
//
// The fixture worlds never build that tie, so this drives the pure planner with a hand-built one: four sea provinces in a row,
// base region 7 = {1 2 3} and base region 8 = {4}, two separate sea bodies, A = {1 2} and B = {3 4}. A takes 7 (2,000 px),
// B takes 8 — and B overlaps 7 and 8 by 1,000 px each. B's donor must be 8, its own.
// Back-out control (by hand, 2026-09-25): without the own-id rule the tie goes to the lower id, 7, and the check fails.
"use strict";
const assert = require("assert");
const path = require("path");
const os = require("os");
process.env.APPDATA = path.join(os.tmpdir(), "nova-own-weather-appdata");
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
const md = require("./map-data.js");

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

const P = [1, 2, 3, 4];
// two separate seas, 1-2 and 3-4 — every sea body is planned on its own, so the split is fixed by the geometry
const touch = (p, q) => (p === 1 && q === 2) || (p === 2 && q === 1) || (p === 3 && q === 4) || (p === 4 && q === 3);
const graph = new Map(P.map((p) => [p, new Set(P.filter((q) => touch(p, q)))]));
const edges = new Map(P.map((p) => [p, new Map(P.filter((q) => touch(p, q)).map((q) => [q, 10]))]));
const stats = { W: 400, H: 10, pix: new Map(P.map((p) => [p, 1000])), cx: new Map(P.map((p) => [p, p * 50])), cy: new Map(P.map((p) => [p, 5])), edges };
const model = { provinces: P.map((id) => ({ id, type: "sea" })), states: [], provinceToState: {} };
const donor = (id, members, body) => ({ id, nameKey: `R${id}`, file: `${id}-x.txt`, members, lp: 0, sp: members.length * 1000, px: members.length * 1000, pos: [members.reduce((a, p) => a + p * 50, 0) / members.length, 5], cls: "sea", body, navalTerrain: "", staticModifiers: "", snow: false, blizzard: false, sandstorm: false });
const byId = new Map([[7, donor(7, [1, 2, 3], "\n\t\tperiod={ no_phenomenon=0.5 }\n\t")], [8, donor(8, [4], "\n\t\tperiod={ no_phenomenon=1.0 } # region 8's own\n\t")]]);
const base = { typeOf: () => "sea", regionOf: new Map([[1, 7], [2, 7], [3, 7], [4, 8]]), byId, maxId: 8, fromBelow: true };

const plan = md.planStrategicRegions({ model, stats, graph, retyped: new Set(), base, opts: { openSeaPx: 2000, coastEdges: 1e9, queueShare: 0.9 } });
const A = plan.regions.find((r) => r.provinces.includes(1)), B = plan.regions.find((r) => r.provinces.includes(4));
ok(plan.regions.length === 2 && A !== B, `the four seas are split into two regions (${plan.regions.map((r) => r.provinces.join("+"))})`);
ok(A.id === 7 && B.id === 8, `A takes base id 7 by the larger overlap, B takes 8 (A ${A.id}, B ${B.id})`);
ok(B.provinces.length === 2 && B.provinces.includes(3), "…and B overlaps base 7 (province 3) and base 8 (province 4) by the same area — the tie");
ok(B.donor === 8 && B.how === "overlap", `⭐⭐⭐ B keeps ITS OWN block's weather (donor ${B.donor}), not the other base region's it ties with`);
ok(A.donor === 7, "and A, whose own id is also its largest overlap, keeps 7's");

console.log(`✓ test-a-redrawn-region-keeps-its-own-weather.js — ${pass} checks`);
