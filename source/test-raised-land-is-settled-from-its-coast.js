// ⛔ #raised-land-is-settled-from-its-coast — A CONTINENT GENERATE LAND RAISES FROM OPEN OCEAN IS SETTLED FROM ITS COAST, NOT CUT INTO
// CELLS ROUND THE OLD LAND NEAREST IT.
//
// TEST 33 (the owner's flow: New mod → Delete map → Generate land 35% seed 1, inherit → Auto-fix → Redraw regions): after supply commit
// 1, 26.46% of the owned land still had no supply route to its capital (the base game 0.40%), and most of it was land no harbour could
// reach: 45% of the land on a country's pieces other than its capital's had no coast at all (the base game 1.35%, Greenland's interior).
// assignGeneratedStateOwners' proximity pass labelled every province with the owner of the old land nearest it over the OLD graph, sea
// and land alike, so a mid-ocean island of England's took the interior of a continent raised round it while Brazil, South Africa and
// Portugal took its coast — a 427k px English piece walled in behind other countries' land. Now only the raised provinces that touch the
// sea this click leaves keep their nearest label, and carry it inland over the raised land alone.
//
// The fixture is one world, COLS x ROWS blocks of 64 px, province = col + row x COLS + 1, x wrapping, y not (rows 0 and 6 are the map's
// edge, not sea):
//   AH  AAA's old land, a column on the west;         BH  BBB's old land, a column on the east;
//   C   a continent raised from open ocean between them, a strait of sea each side, its interior nearest II;
//   II  one province of III's old land in the middle of C;  IH  III's old homeland, far off on the coast — so III owns a coastal piece;
//   EH  EEE's old land, a ring;  FH  FFF's old land, a ring inside it;  P  one province of open ocean below inside FH (the FIN/EST shape:
//       a country whose whole land is walled in keeps its group).
// Every region is one state below or one raised state. Every expected value is derived from the manifest by grid arithmetic; the
// nearest-land answer is the same function asked without `seaNow` (the pass it was), the control that the fixture tells right from wrong.
//   1. assignGeneratedStateOwners, pure;   2. Generate land end to end, and the page.
// Fixture-only: binds no port.
// Run: node test-raised-land-is-settled-from-its-coast.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-settled-from-coast-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
process.env.HOI4_MODS_ROOT = SANDBOX;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
let made = 0;
const tmpDir = (tag) => { const d = path.join(SANDBOX, `${tag}-${++made}`); fs.mkdirSync(d, { recursive: true }); return d; };
const sorted = (a) => [...a].map(Number).sort((x, y) => x - y);

// ── the grid ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const B = 64, COLS = 22, ROWS = 7, W = COLS * B, H = ROWS * B, N = COLS * ROWS;
const at = (c, r) => ((c + COLS) % COLS) + r * COLS + 1;
const colOf = (p) => (p - 1) % COLS, rowOf = (p) => Math.floor((p - 1) / COLS);
const neighbours = (p) => { const c = colOf(p), r = rowOf(p); return [at(c - 1, r), at(c + 1, r)].concat(r > 0 ? [at(c, r - 1)] : [], r < ROWS - 1 ? [at(c, r + 1)] : []); };
const block = (c0, c1, r0, r1) => { const out = []; for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(at(c, r)); return out; };
const ring = (c0, c1, r0, r1) => { const inner = new Set(block(c0 + 1, c1 - 1, r0 + 1, r1 - 1)); return block(c0, c1, r0, r1).filter((p) => !inner.has(p)); };

// ── ⛔ THE MANIFEST: regions, each one state; `below` the country that held it in the layer below (none: open ocean) ─────────────────
const II = at(8, 3), P = at(19, 2);
const REGIONS = [
  { name: "AH", below: "AAA", provinces: block(1, 1, 0, 6) },
  ...[4, 5, 6, 7].map((c) => ({ name: "C" + c, provinces: block(c, c, 0, 6) })),
  { name: "C8N", provinces: block(8, 8, 0, 2) },
  { name: "II", below: "III", provinces: [II] },
  { name: "C8S", provinces: block(8, 8, 4, 6) },
  ...[9, 10, 11, 12].map((c) => ({ name: "C" + c, provinces: block(c, c, 0, 6) })),
  { name: "BH", below: "BBB", provinces: block(15, 15, 0, 6) },
  { name: "EH", below: "EEE", provinces: ring(17, 21, 0, 4) },
  { name: "FH", below: "FFF", provinces: ring(18, 20, 1, 3) },
  { name: "P", provinces: [P] },
  { name: "IH", below: "III", provinces: block(18, 20, 5, 6) },
];
const LAND = new Set(REGIONS.flatMap((g) => g.provinces));
const SEA = new Set(Array.from({ length: N }, (_, i) => i + 1).filter((p) => !LAND.has(p)));
const OWNER_BELOW = new Map(REGIONS.filter((g) => g.below).flatMap((g) => g.provinces.map((p) => [p, g.below])));
const TAGS_BELOW = new Set(OWNER_BELOW.values());
const RAISED = new Set(REGIONS.filter((g) => !g.below).flatMap((g) => g.provinces));   // open ocean below, land now
const touchesSea = (p) => neighbours(p).some((q) => SEA.has(q));
const C_LAND = new Set(REGIONS.filter((g) => /^C/.test(g.name)).flatMap((g) => g.provinces));

// by grid arithmetic: hops over the WHOLE grid (the old graph, sea and land) from each country's old land
const hopsFrom = (seeds, through) => {
  const d = new Map(seeds.map((p) => [p, 0])); let front = seeds.slice();
  while (front.length) { const next = []; for (const u of front) for (const v of neighbours(u)) if (!d.has(v) && through(v)) { d.set(v, d.get(u) + 1); next.push(v); } front = next; }
  return d;
};
const hopsByTag = new Map([...TAGS_BELOW].map((t) => [t, hopsFrom([...OWNER_BELOW].filter(([, o]) => o === t).map(([p]) => p), () => true)]));
const nearestTags = (p) => { let best = Infinity, out = []; for (const [t, d] of hopsByTag) { const h = d.get(p); if (h < best) { best = h; out = [t]; } else if (h === best) out.push(t); } return out.sort(); };

/** every proximity-owned group (all its provinces open ocean below) on a piece with no coast, of a country that owns a coastal piece.
 *  `owners` Map(group → tag); `groups` [{ provinces }]. Pieces: a country's groups joined by touching provinces. */
function walledIn(groups, owners) {
  const groupAt = new Map(); for (const g of groups) for (const p of g.provinces) groupAt.set(p, g);
  const tagAt = (p) => (groupAt.has(p) ? owners.get(groupAt.get(p)) || "" : "");
  const pieceOf = new Map(), coastOf = new Map(), coastalTags = new Set();
  for (const p0 of LAND) {
    if (pieceOf.has(p0) || !tagAt(p0)) continue;
    const t = tagAt(p0), q = [p0]; let coast = false; pieceOf.set(p0, p0);
    while (q.length) { const u = q.pop(); if (touchesSea(u)) coast = true; for (const v of neighbours(u)) if (LAND.has(v) && !pieceOf.has(v) && tagAt(v) === t) { pieceOf.set(v, p0); q.push(v); } }
    coastOf.set(p0, coast); if (coast) coastalTags.add(t);
  }
  return groups.filter((g) => g.provinces.every((p) => RAISED.has(p)) && owners.get(g) && !coastOf.get(pieceOf.get(g.provinces[0])) && coastalTags.has(owners.get(g)));
}
const nameOf = (g) => (REGIONS.find((x) => sorted(x.provinces).join() === sorted(g.provinces).join()) || {}).name || `[${sorted(g.provinces).join(" ")}]`;

console.log("=== 0. the fixture can tell right from wrong (controls, from the manifest alone) ===");
rec("CONTROL: III's old homeland IH touches the sea, so III owns a coastal piece whatever the rule", block(18, 20, 5, 6).some(touchesSea));
const rim = [...C_LAND].filter(touchesSea);
rec("CONTROL: C touches the sea only on its west and east columns (rows 0 and 6 are the map's edge)", sorted(rim).join() === sorted([...block(4, 4, 0, 6), ...block(12, 12, 0, 6)]).join(), sorted(rim));
rec("CONTROL: C's west coast is nearest AAA's old land and its east coast BBB's, each alone",
  block(4, 4, 0, 6).every((p) => nearestTags(p).join() === "AAA") && block(12, 12, 0, 6).every((p) => nearestTags(p).join() === "BBB"));
const interiorIII = [...C_LAND].filter((p) => nearestTags(p).join() === "III");
rec("CONTROL: C's interior is nearer III's island than any coast, and none of it touches the sea", interiorIII.length > 0 && interiorIII.every((p) => !touchesSea(p)), interiorIII.length);
// the groups the nearest-land rule must hand III: those most of whose provinces have III alone as their nearest country
const NEAREST_III = REGIONS.filter((g) => /^C/.test(g.name) && 2 * g.provinces.filter((p) => nearestTags(p).join() === "III").length > g.provinces.length).map((g) => g.name);
rec("CONTROL: so the nearest-land rule hands III a block of C's interior, round its island", NEAREST_III.length > 0, NEAREST_III);
const namesOf = (list) => list.map(nameOf).sort().join();
rec("CONTROL: P is walled in by FFF's old land, which EEE's walls in: no province of FH or P touches the sea, and P's every neighbour is FFF's",
  !block(18, 20, 1, 3).some(touchesSea) && neighbours(P).every((q) => OWNER_BELOW.get(q) === "FFF"));

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 1. assignGeneratedStateOwners, pure ===");
const groupsPure = REGIONS.map((g, k) => ({ id: 100 + k, provinces: g.provinces.slice() }));
const beneath = new Map([...OWNER_BELOW].map(([p, o]) => [p, { owner: o }]));
const adj = new Map(Array.from({ length: N }, (_, i) => [i + 1, neighbours(i + 1)]));
const seaNow = (p) => SEA.has(Number(p));
const ownersOf = (r, groups) => new Map(groups.map((g) => [g, r.ownerOf.get(g.id) || ""]));
const old = md.assignGeneratedStateOwners({ groups: groupsPure, beneath, adj });
const now = md.assignGeneratedStateOwners({ groups: groupsPure, beneath, adj, seaNow });
{
  const was = walledIn(groupsPure, ownersOf(old, groupsPure));
  rec("CONTROL: asked as it was (no seaNow), the pass walls III in — exactly the groups round its island, no coast, while III owns IH on the coast",
    namesOf(was) === NEAREST_III.slice().sort().join() && was.every((g) => old.ownerOf.get(g.id) === "III"), { got: was.map(nameOf), want: NEAREST_III });
  const is = walledIn(groupsPure, ownersOf(now, groupsPure));
  rec("⭐⭐⭐ settled from the coast: NO raised group sits on a coastless piece of a country that owns a coastal piece", is.length === 0, is.map((g) => [nameOf(g), now.ownerOf.get(g.id)]));
  // the side of C each group is on, by hops over C's own land from its west and its east coast
  const dW = hopsFrom(block(4, 4, 0, 6), (v) => C_LAND.has(v)), dE = hopsFrom(block(12, 12, 0, 6), (v) => C_LAND.has(v));
  const cGroups = groupsPure.filter((g) => g.provinces.every((p) => C_LAND.has(p)));
  const west = cGroups.filter((g) => g.provinces.every((p) => dW.get(p) < dE.get(p))), east = cGroups.filter((g) => g.provinces.every((p) => dE.get(p) < dW.get(p)));
  rec("CONTROL: C's groups split into a west side, an east side and the middle column", west.length === 4 && east.length === 4 && cGroups.length === 10, { west: west.map(nameOf), east: east.map(nameOf) });
  rec("⭐⭐ every group raised over C goes to AAA or BBB, the countries whose coast it faces — none to III", cGroups.every((g) => ["AAA", "BBB"].includes(now.ownerOf.get(g.id))),
    cGroups.map((g) => [nameOf(g), now.ownerOf.get(g.id)]));
  rec("⭐⭐ …the west side to AAA and the east side to BBB, carried in from each coast", west.every((g) => now.ownerOf.get(g.id) === "AAA") && east.every((g) => now.ownerOf.get(g.id) === "BBB"),
    cGroups.map((g) => [nameOf(g), now.ownerOf.get(g.id)]));
  const gP = groupsPure.find((g) => g.provinces.includes(P));
  rec("⭐⭐ the FIN/EST shape: P, which no coast reaches, keeps its nearest country FFF — whose whole land is walled in",
    now.ownerOf.get(gP.id) === "FFF" && nearestTags(P).join() === "FFF" && old.ownerOf.get(gP.id) === "FFF", { now: now.ownerOf.get(gP.id), old: old.ownerOf.get(gP.id) });
  const majority = groupsPure.filter((g) => g.provinces.some((p) => OWNER_BELOW.has(p)));
  rec("⭐ the majority pass is untouched: every group on old land keeps the country that held it, as before",
    majority.length && majority.every((g) => now.ownerOf.get(g.id) === OWNER_BELOW.get(g.provinces[0]) && old.ownerOf.get(g.id) === now.ownerOf.get(g.id)),
    majority.map((g) => [nameOf(g), now.ownerOf.get(g.id)]));
  rec("…nothing is invented: every owner held land below", [...now.ownerOf.values()].every((t) => TAGS_BELOW.has(t)), [...new Set(now.ownerOf.values())]);
  rec("…and the passes count the same states", now.byMajority === old.byMajority && now.byProximity === old.byProximity && now.undecided === old.undecided && now.undecided === 0,
    { now: [now.byMajority, now.byProximity, now.undecided], old: [old.byMajority, old.byProximity, old.undecided] });

  // ⭐ WHAT IT SAYS — the change against the nearest-land answer, derived from the two answers
  const before = new Map(), after = new Map(); let states = 0, provinces = 0;
  for (const g of groupsPure) {
    const a = old.ownerOf.get(g.id), b = now.ownerOf.get(g.id), n = g.provinces.length;
    before.set(a, (before.get(a) || 0) + n); after.set(b, (after.get(b) || 0) + n);
    if (a !== b) { states++; provinces += n; }
  }
  const rows = [...new Set([...before.keys(), ...after.keys()])].map((tag) => ({ tag, before: before.get(tag) || 0, after: after.get(tag) || 0 })).filter((c) => c.before !== c.after);
  const fc = now.fromCoast || {};
  rec("CONTROL: the coast changed something here", states > 0 && rows.length >= 3, { states, rows });
  rec("⭐ fromCoast counts the states and provinces that changed hands", fc.states === states && fc.provinces === provinces, { fc, states, provinces });
  rec("⭐ …per country, before and after, every country whose land changed", Array.isArray(fc.countries) && fc.countries.length === rows.length
    && rows.every((x) => fc.countries.some((c) => c.tag === x.tag && c.before === x.before && c.after === x.after)), { fc: fc.countries, rows });
  const order = (fc.countries || []).map((c) => Math.abs(c.after - c.before));
  rec("…the largest change first", order.every((d, i) => i === 0 || order[i - 1] >= d), fc.countries);
  rec("…the seeds: the raised provinces that touch the sea", fc.seeds === [...RAISED].filter((p) => touchesSea(p) && nearestTags(p).length).length, fc.seeds);
  rec("…and nobody it emptied (III keeps its homeland and its island)", Array.isArray(fc.emptied) && fc.emptied.length === 0 && after.get("III") > 0, fc.emptied);
  rec("asked as it was (no seaNow), nothing is said", !("fromCoast" in old));

  // DETERMINISM: twice, and with every input handed over backwards
  const again = md.assignGeneratedStateOwners({ groups: groupsPure, beneath, adj, seaNow });
  const back = md.assignGeneratedStateOwners({ groups: groupsPure.slice().reverse(), beneath: new Map([...beneath].reverse()),
    adj: new Map([...adj].reverse().map(([p, l]) => [p, l.slice().reverse()])), seaNow });
  const same = (x, y) => groupsPure.every((g) => x.ownerOf.get(g.id) === y.ownerOf.get(g.id));
  rec("⭐ the same inputs give the same owners, and so do the same inputs handed over in reverse order", same(now, again) && same(now, back),
    groupsPure.filter((g) => now.ownerOf.get(g.id) !== back.ownerOf.get(g.id)).map(nameOf));
}
{
  // ⭐ A TIE IN A GROUP goes to the lower tag: one group of two coast provinces, the one nearest AAA and the other nearest BBB — both ways round
  for (const [x, y] of [["AAA", "BBB"], ["BBB", "AAA"]]) {
    // 1(x) – 2 – 3 – 4(y); 2 and 3 raised, each on a sea of its own (5, 6)
    const adjT = new Map([[1, [2]], [2, [1, 3, 5]], [3, [2, 4, 6]], [4, [3]], [5, [2]], [6, [3]]]);
    const r = md.assignGeneratedStateOwners({ groups: [{ id: 1, provinces: [2, 3] }], beneath: new Map([[1, { owner: x }], [4, { owner: y }]]), adj: adjT, seaNow: (p) => p === 5 || p === 6 });
    rec(`⭐ a group whose coast splits ${x} 1 : ${y} 1 goes to the lower tag, AAA`, r.ownerOf.get(1) === "AAA", r.ownerOf.get(1));
  }
  // ⭐ AN EQUAL-DISTANCE CONTEST is settled by the lower province id in the front, as the nearest-land BFS is: coast provinces 10 (AAA) and
  // 20 (BBB), each two steps from 40 — through 31 and through 29. The front holding 29 and 31 is walked 29 first, so 40 is BBB's.
  const adjC = new Map([[1, [10]], [2, [20]], [10, [1, 31, 99]], [20, [2, 29, 99]], [31, [10, 40]], [29, [20, 40]], [40, [31, 29]], [99, [10, 20]]]);
  const groupsC = [10, 20, 31, 29, 40].map((p) => ({ id: p, provinces: [p] }));
  const r = md.assignGeneratedStateOwners({ groups: groupsC, beneath: new Map([[1, { owner: "AAA" }], [2, { owner: "BBB" }]]), adj: adjC, seaNow: (p) => p === 99 });
  rec("CONTROL: 10 and 20 are the coast, and the two sides reach 31 and 29 in the same step", r.ownerOf.get(10) === "AAA" && r.ownerOf.get(20) === "BBB" && r.ownerOf.get(31) === "AAA" && r.ownerOf.get(29) === "BBB",
    [...r.ownerOf]);
  rec("⭐ …and 40, two steps from both, goes to the side of the lower id in the front (29, BBB's)", r.ownerOf.get(40) === "BBB", r.ownerOf.get(40));
  // ⚠ A COUNTRY THE COAST LEAVES WITH NONE is named: 1 is QQQ's old land (now another world's land, not sea), 4 RRR's, drowned; the raised
  // group {2, 3} splits QQQ 1 : RRR 1 by the nearest land and goes to QQQ, the lower tag — but only 3 touches the sea, and it is RRR's.
  const adjE = new Map([[1, [2]], [2, [1, 3]], [3, [2, 4]], [4, [3]]]);
  const e = md.assignGeneratedStateOwners({ groups: [{ id: 7, provinces: [2, 3] }], beneath: new Map([[1, { owner: "QQQ" }], [4, { owner: "RRR" }]]), adj: adjE, seaNow: (p) => p === 4 });
  const e0 = md.assignGeneratedStateOwners({ groups: [{ id: 7, provinces: [2, 3] }], beneath: new Map([[1, { owner: "QQQ" }], [4, { owner: "RRR" }]]), adj: adjE });
  rec("CONTROL: by the nearest land the group is QQQ's; settled from its coast, RRR's", e0.ownerOf.get(7) === "QQQ" && e.ownerOf.get(7) === "RRR", [e0.ownerOf.get(7), e.ownerOf.get(7)]);
  rec("⚠ …and the report names QQQ as the country it left with none of the new land", JSON.stringify((e.fromCoast || {}).emptied) === JSON.stringify(["QQQ"]), e.fromCoast);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 2. end to end: Generate land, and the page ===");
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const bmp = () => {
  const rs = (W * 3 + 3) & ~3, size = rs * H, b = Buffer.alloc(54 + size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(size, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rs; for (let x = 0; x < W; x++) { const [r, g, bl] = COL(Math.floor(x / B) + Math.floor(y / B) * COLS + 1); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
};
const csv = (land) => ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: N }, (_, i) => {
  const p = i + 1, [r, g, b] = COL(p), l = land.has(p);
  return `${p};${r};${g};${b};${l ? "land" : "sea"};false;${l ? "plains" : "ocean"};${l ? 1 : 0}`;
})).join("\n") + "\n";
function buildGame() {
  const g = tmpDir("game");
  mk(g, "map/provinces.bmp", bmp());
  mk(g, "map/definition.csv", csv(new Set(OWNER_BELOW.keys())));
  REGIONS.forEach((x, k) => mk(g, `map/strategicregions/${k + 1}.txt`, `strategic_region={\n\tid=${k + 1}\n\tname="REGION_${k + 1}"\n\tprovinces={ ${x.provinces.join(" ")} }\n\tweather={}\n}\n`));
  REGIONS.filter((x) => x.below).forEach((x, k) => mk(g, `history/states/${k + 1}.txt`, `state = {\n\tid = ${k + 1}\n\tname = "STATE_${k + 1}"\n\tmanpower = 1000000\n\tstate_category = rural\n`
    + `\tprovinces = { ${x.provinces.join(" ")} }\n\thistory = {\n\t\towner = ${x.below}\n\t\tvictory_points = { ${x.provinces[0]} 1 }\n\t}\n}\n`));
  return g;
}
function buildMod() {
  const m = tmpDir("mod");
  mk(m, "descriptor.mod", 'version="1"\nname="Settled from the coast"\nreplace_path="history/states"\npath="mod/settledfromcoast"\n');
  mk(m, "map/provinces.bmp", bmp());
  mk(m, "map/definition.csv", csv(new Set()));   // Delete map: every province is sea
  return m;
}
function readStates(modRoot) {
  const dir = path.join(modRoot, "history", "states");
  return fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
    return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], provinces: (((/\bprovinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g).map(Number),
      owner: (/\bowner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1] || "" };
  });
}
let gen = null;
{
  const game = buildGame(), mod = buildMod();
  // #a-kept-coast-keeps-its-sea keeps II's coast open (one province of III's old land inside C, sea below all round it): this file
  // asks the owner passes of the world the manifest draws, so the raise is asked as it was; the channel is test-a-kept-coast-keeps-its-sea.js's
  gen = md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: LAND.size, provincesPerState: 8, seed: 3, ownerMode: "inherit", fillCutOffSeas: false, roughenCoast: false, keepCoasts: false });
  const states = readStates(mod);
  rec("the world was generated, every province of the manifest in a state, every state owned", gen && gen.changed === true
    && sorted(states.flatMap((s) => s.provinces)).join() === sorted(LAND).join() && states.every((s) => s.owner), gen && (gen.error || states.filter((s) => !s.owner)));
  const owners = new Map(states.map((s) => [s, s.owner]));
  const wasR = md.assignGeneratedStateOwners({ groups: states, beneath, adj });
  const was = walledIn(states, new Map(states.map((s) => [s, wasR.ownerOf.get(s.id) || ""])));
  rec("CONTROL: the nearest-land rule, asked of these states, walls III in — the same groups", namesOf(was) === NEAREST_III.slice().sort().join(), { got: was.map(nameOf), want: NEAREST_III });
  const is = walledIn(states, owners);
  rec("⭐⭐⭐ on disk: no state raised from open ocean sits on a coastless piece of a country that owns a coastal piece", is.length === 0, is.map((s) => [nameOf(s), s.owner]));
  const sP = states.find((s) => s.provinces.includes(P));
  rec("⭐ …and the walled-in country keeps its own: P's state is FFF's", !!sP && sP.owner === "FFF", sP);
  const onOldLand = states.filter((s) => s.provinces.some((p) => OWNER_BELOW.has(p)));
  rec("⭐ …the states on old land are the country's that held it", onOldLand.length > 0 && onOldLand.every((s) => s.owner === OWNER_BELOW.get(s.provinces[0])), onOldLand.map((s) => [s.id, s.owner]));
  // what Generate land says: the change against the nearest-land answer, per country, in provinces
  const before = new Map(), after = new Map(); let ch = 0, chp = 0;
  for (const s of states) {
    const a = wasR.ownerOf.get(s.id), b = s.owner, n = s.provinces.length;
    before.set(a, (before.get(a) || 0) + n); after.set(b, (after.get(b) || 0) + n);
    if (a !== b) { ch++; chp += n; }
  }
  const rows = [...new Set([...before.keys(), ...after.keys()])].map((tag) => ({ tag, before: before.get(tag) || 0, after: after.get(tag) || 0 })).filter((c) => c.before !== c.after);
  const fc = ((gen && gen.ownership) || {}).fromCoast || {};
  rec("⭐⭐ Generate land reports it: the states and provinces that went to the coast, and each country before and after", fc.states === ch && fc.provinces === chp && ch > 0
    && (fc.countries || []).length === rows.length && rows.every((x) => fc.countries.some((c) => c.tag === x.tag && c.before === x.before && c.after === x.after)),
    { fc, derived: { ch, chp, rows } });

  // ── the page says it ──
  const { maskJsLiterals, jsBodyAt, stripJsComments } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const atNote = MASKED.indexOf("function generatedSettledFromCoastNote("), body = atNote < 0 ? null : jsBodyAt(MASKED, atNote);
  rec("public/map.js has generatedSettledFromCoastNote", !!body);
  const note = body ? vm.runInNewContext("(" + PAGE.slice(atNote, body[1] + 1) + ")") : () => "";
  const said = note(gen);
  rec(`⭐ the page says how many states went to the coast they face (${fc.states}) and how many provinces`, said.includes(`${fc.states} states raised from open ocean (${fc.provinces} provinces)`), said);
  rec("⭐ …and each country whose land changed, before → after", rows.every((x) => said.includes(`${x.tag} ${x.before} → ${x.after} province`)), said);
  rec("⚠ a country it left with none is said out loud", /⚠/.test(note({ ownership: { fromCoast: { states: 1, provinces: 2, countries: [{ tag: "QQQ", before: 2, after: 0 }], emptied: ["QQQ"] } } })));
  rec("CONTROL: nothing changed says nothing", note({ ownership: { fromCoast: { states: 0, countries: [] } } }) === "" && note({ ownership: {} }) === "" && note({}) === "" && note(null) === "");
  const handler = stripJsComments(PAGE), post = handler.indexOf('fetch("/api/map/generate-land"');
  const caught = post < 0 ? -1 : handler.indexOf(".catch(", post), done = caught < 0 ? -1 : handler.lastIndexOf("reloadAfterImmediateWrite(", caught);
  // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
  // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
  const line = require("./testlib-map-page.js").generateLandReportLine(handler);
  rec("⭐ the Generate land report on the page carries it", /generatedSettledFromCoastNote\(res\)/.test(line) && /\$\{settledNote\}/.test(line.slice(line.lastIndexOf("reloadAfterImmediateWrite("))), line.slice(-200));
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log(`\n${fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks}`);
process.exitCode = fails.length ? 1 : 0;
