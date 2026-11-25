// ⛔ #a-generated-railway-is-as-good-as-the-rail-below — A NEW RAILWAY IS AS GOOD AS THE RAIL ITS COUNTRY HAD BELOW.
//
// Every railway Generate land laid was level 1: TEST 32's 1,031 of 1,031, against vanilla's 467 / 406 / 29 / 7 at levels 1–4, and a
// level is supply (00_defines NODE_FLOW_BONUS_PER_RAIL_LEVEL, per level of a node's bottleneck). Now each country is dealt the share
// of its own railway PAIRS the layer below gave it at each level — the whole map's where it had none, and for ownerless land — its
// busiest rows first (betweenness over the hub forest, a hub weighing 1 + its victory points), and a row across a border is as good
// as the weaker line it joins.
//
// Pinned on a world of four countries over a base game whose map/railways.txt gives them different rail, and whose defines cap a
// railway at level 3 while one of its rows is level 4:
//   AAA  nine two-province states with victory points — rail below at levels 1, 2, 3 and 4
//   BBB  three states — every railway below level 1
//   CCC  a chain of six one-province states with NO victory point, their ids out of order along it — rail below at 1 and 2
//   DDD  two states and no railway below at all: the whole map's share
// Part A drives generateSupplyNetwork on hand-written states (as Generate land calls it, with the states it made); Part B runs
// Generate land itself, owned and unowned. Every expected number is computed here from the fixture's own files.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-levels-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}

// ── the world: a letter a cell of 8 x 8 px, "~" sea (the sea columns keep the map's east–west wrap from joining its edges) ──────
const MAP = [
  "~AAAAAA~BBB~",
  "~AAAAAA~BBB~",
  "~AAAAAADDDD~",
  "~CCCCCC~~~~~",
];
const COLS = MAP[0].length, ROWS = MAP.length, CELL = 8, W = COLS * CELL, H = ROWS * CELL;
const CHAIN = [201, 250, 270, 280, 260, 202];          // CCC's provinces west to east: by id, the chain's two ENDS come first
const idAt = (c, r) => (MAP[r][c] === "C" ? CHAIN[c - 1] : r * COLS + c + 1);
const colour = (id) => [id & 255, 50 + (id >> 8), 77];
const cells = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push({ c, r, id: idAt(c, r), k: MAP[r][c] });
const STATES = [];
{
  let sid = 1;
  for (let r = 0; r < 3; r++) for (let c = 1; c <= 6; c += 2) STATES.push({ id: sid++, tag: "AAA", provinces: [idAt(c, r), idAt(c + 1, r)] });
  for (let c = 8; c <= 10; c++) STATES.push({ id: sid++, tag: "BBB", provinces: [idAt(c, 0), idAt(c, 1)] });
  for (let c = 1; c <= 6; c++) STATES.push({ id: sid++, tag: "CCC", provinces: [idAt(c, 3)] });
  for (let c = 7; c <= 10; c += 2) STATES.push({ id: sid++, tag: "DDD", provinces: [idAt(c, 2), idAt(c + 1, 2)] });
}
const VP = new Map();   // state → [province, value]: AAA's all different, BBB's alike, CCC and DDD none
STATES.filter((s) => s.tag === "AAA").forEach((s, i) => VP.set(s.id, [s.provinces[i % 2], [5, 1, 3, 10, 2, 1, 4, 1, 2][i]]));
STATES.filter((s) => s.tag === "BBB").forEach((s) => VP.set(s.id, [s.provinces[0], 3]));
const OWNER = new Map();
for (const s of STATES) for (const p of s.provinces) OWNER.set(p, s.tag);
const stateText = (s, owned = true) => `state={\n\tid=${s.id}\n\tname="STATE_${s.id}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${s.provinces.join(" ")} }\n\thistory={\n${owned ? `\t\towner=${s.tag}\n` : ""}${VP.has(s.id) ? `\t\tvictory_points = { ${VP.get(s.id).join(" ")} }\n` : ""}\t}\n}\n`;
const definition = (landIsSea) => ["0;0;0;0;land;false;unknown;0"].concat(cells.slice().sort((a, b) => a.id - b.id)
  .map((x) => `${x.id};${colour(x.id).join(";")};${x.k === "~" || landIsSea ? "sea;false;ocean;0" : "land;false;plains;1"}`)).join("\n") + "\n";
const PROVINCES_BMP = bmp24(W, H, (x, y) => colour(idAt(Math.floor(x / CELL), Math.floor(y / CELL))));

// The rail below. AAA: 6 pairs at 1, 4 at 2, 2 at 3 and 2 at 4 (the define caps it at 3). BBB: 3 at 1. CCC: 3 at 1, 2 at 2. A row
// across AAA and BBB at 2, and none of DDD's. Pairs need not touch: the share is counted, not walked.
const RAIL_BELOW = ["1 7 2 3 4 5 6 7 14", "2 5 14 15 16 17 18", "3 3 26 27 28", "4 3 29 30 31", "1 4 9 10 11 23", "1 4 201 250 270 280", "2 3 280 260 202", "2 5 7 9 19 21 31"];
function makeGame(tag) {
  const g = path.join(ROOT, tag);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", PROVINCES_BMP);
  write(g, "map/definition.csv", definition(false));
  for (const s of STATES) write(g, `history/states/${s.id}-S.txt`, stateText(s));
  write(g, "common/defines/00_defines.lua", "NDefines = {\nNSupply = {\n\tMAX_RAILWAY_LEVEL = 3,\t-- each frame corresponds to a level\n},\n}\n");
  write(g, "map/railways.txt", RAIL_BELOW.join("\n") + "\n");
  return g;
}
function makeMod(tag, { rails = "" } = {}) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", 'name="rail levels"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", PROVINCES_BMP);
  write(m, "map/definition.csv", definition(false));
  for (const s of STATES) write(m, `history/states/${s.id}-S.txt`, stateText(s));
  write(m, "map/supply_nodes.txt", "");
  write(m, "map/railways.txt", rails);
  write(m, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  return m;
}
const GAME = makeGame("game");

// ── what the fixture's own files say, read back here ──────────────────────────────────────────────────────────────────────────
const MAX = +(/MAX_RAILWAY_LEVEL\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(GAME, "common", "defines", "00_defines.lua"), "utf8")) || [])[1];
const readRails = (file) => fs.readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.trim().split(/\s+/).map(Number)).filter((n) => n.length >= 3 && n.every(Number.isFinite))
  .map((n) => ({ level: n[0], provinces: n.slice(2, 2 + n[1]) }));
const sharesBelow = (() => {
  const best = new Map();
  for (const r of readRails(path.join(GAME, "map", "railways.txt"))) for (let i = 1; i < r.provinces.length; i++) {
    const a = r.provinces[i - 1], b = r.provinces[i], k = Math.min(a, b) + "-" + Math.max(a, b);
    best.set(k, Math.max(best.get(k) || 0, r.level));
  }
  const all = new Map(), byTag = new Map();
  for (const [k, lv] of best) {
    const [a, b] = k.split("-").map(Number), L = Math.min(lv, MAX);
    all.set(L, (all.get(L) || 0) + 1);
    if (OWNER.get(a) && OWNER.get(a) === OWNER.get(b)) { if (!byTag.has(OWNER.get(a))) byTag.set(OWNER.get(a), new Map()); byTag.get(OWNER.get(a)).set(L, (byTag.get(OWNER.get(a)).get(L) || 0) + 1); }
  }
  return { all, byTag };
})();
const atLeast = (m, l) => { let n = 0, k = 0; for (const [lv, v] of m) { n += v; if (lv >= l) k += v; } return n ? k / n : 0; };
const pairsOf = (r) => r.provinces.length - 1;
const groupOfRow = (r, owner) => { const g = new Set(r.provinces.map((p) => owner.get(p) || "")); return g.size === 1 ? [...g][0] : null; };
/** the test's own betweenness: W(one side) × W(the other) over the forest the rows make between their end hubs, a hub 1 + its VP — a
 *  row that closes a loop (`loop`, #a-railway-closes-the-long-way-round) is no part of that forest and has none, as in the deal */
function busyness(rows, vpAt) {
  const adj = new Map(), link = (a, b, i) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push([b, i]); };
  rows.forEach((r, i) => { if (r.loop) return; const a = r.provinces[0], b = r.provinces[r.provinces.length - 1]; link(a, b, i); link(b, a, i); });   // #a-railway-closes-the-long-way-round: the forest only
  const out = rows.map(() => 0), seen = new Set();
  for (const root of adj.keys()) {
    if (seen.has(root)) continue;
    const comp = [], q = [root]; seen.add(root);
    while (q.length) { const u = q.pop(); comp.push(u); for (const [v] of adj.get(u)) if (!seen.has(v)) { seen.add(v); q.push(v); } }
    const total = comp.reduce((s, h) => s + 1 + (vpAt.get(h) || 0), 0);
    rows.forEach((r, i) => {
      const a = r.provinces[0], b = r.provinces[r.provinces.length - 1];
      if (r.loop || !comp.includes(a)) return;
      // the side of b once row i is cut
      const side = new Set([b]), qq = [b];
      while (qq.length) { const u = qq.pop(); for (const [v, j] of adj.get(u)) if (j !== i && !side.has(v)) { side.add(v); qq.push(v); } }
      const wb = [...side].reduce((s, h) => s + 1 + (vpAt.get(h) || 0), 0);
      out[i] = wb * (total - wb);
    });
  }
  return out;
}
/** the rows of a group at `level` or above, in pieces, one count per piece of the group's own rows */
function piecesAtOrAbove(rows, level) {
  const ends = (r) => [r.provinces[0], r.provinces[r.provinces.length - 1]];
  const pieces = (rs) => { const par = new Map(), f = (x) => { if (!par.has(x)) par.set(x, x); while (par.get(x) !== x) x = par.get(x); return x; };
    for (const r of rs) { const [a, b] = ends(r); par.set(f(a), f(b)); } return new Set(rs.map((r) => f(ends(r)[0]))).size; };
  // one own component at a time: the rows at or above `level` inside it must be one piece
  const par = new Map(), f = (x) => { if (!par.has(x)) par.set(x, x); while (par.get(x) !== x) x = par.get(x); return x; };
  for (const r of rows) { const [a, b] = ends(r); par.set(f(a), f(b)); }
  const byComp = new Map();
  for (const r of rows) if (r.level >= level) { const k = f(ends(r)[0]); if (!byComp.has(k)) byComp.set(k, []); byComp.get(k).push(r); }
  return [...byComp.values()].map(pieces);
}
/** every property the rule promises, asked of `rows` (with `owner` and the hubs' victory points) — returns the failures */
function judge(rows, owner, vpAt, label) {
  const groups = new Map(), cross = [];
  for (const r of rows) { const g = groupOfRow(r, owner); if (g === null) cross.push(r); else { if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r); } }
  const quota = [], linked = [], busiest = [], order = [];
  const busy = busyness(rows, vpAt);
  for (const [g, rs] of groups) {
    // a busier row is never a worse one: the deal ranks by this very betweenness, each hub 1 + the victory points on it
    const ranked = rs.map((r) => [busy[rows.indexOf(r)], r.level]);
    if (ranked.some(([b, l]) => ranked.some(([b2, l2]) => b2 > b && l2 < l))) order.push({ g, rows: ranked });
    const share = g && sharesBelow.byTag.has(g) ? sharesBelow.byTag.get(g) : sharesBelow.all;
    const P = rs.reduce((s, r) => s + pairsOf(r), 0), half = Math.max(...rs.map(pairsOf)) / 2;
    for (let l = 2; l <= MAX; l++) {
      const placed = rs.filter((r) => r.level >= l).reduce((s, r) => s + pairsOf(r), 0), Q = P * atLeast(share, l);
      if (Math.abs(placed - Q) > half + 1e-9) quota.push({ g, l, placed, Q: +Q.toFixed(2), half });
      const pc = piecesAtOrAbove(rs, l);
      if (pc.some((n) => n > 1)) linked.push({ g, l, pieces: pc });
    }
    const top = Math.max(...rs.map((r) => r.level)), most = Math.max(...rs.map((r) => busy[rows.indexOf(r)]));
    if (rs.some((r) => busy[rows.indexOf(r)] === most && r.level !== top)) busiest.push({ g, top, at: rs.filter((r) => busy[rows.indexOf(r)] === most).map((r) => r.level) });
  }
  const bestAt = new Map();
  for (const rs of groups.values()) for (const r of rs) for (const h of [r.provinces[0], r.provinces[r.provinces.length - 1]]) bestAt.set(h, Math.max(bestAt.get(h) || 0, r.level));
  const crossWrong = cross.filter((r) => { const at = [r.provinces[0], r.provinces[r.provinces.length - 1]].map((h) => bestAt.get(h)).filter((v) => v > 0); return r.level !== (at.length ? Math.min(...at) : 1); })
    .map((r) => ({ row: r.provinces.join(" "), level: r.level }));
  return { label, groups, cross, quota, linked, busiest, order, crossWrong };
}
const vpOfMod = (mod) => {
  const out = new Map();
  for (const f of fs.readdirSync(path.join(mod, "history", "states"))) {
    for (const m of fs.readFileSync(path.join(mod, "history", "states", f), "utf8").matchAll(/victory_points\s*=\s*\{\s*(\d+)\s+(\d+)/g)) out.set(+m[1], Math.max(out.get(+m[1]) || 0, +m[2]));
  }
  return out;
};

console.log("\n-- the fixture --");
{
  ok(MAX === 3 && [...sharesBelow.byTag.get("AAA").keys()].length === 3 && readRails(path.join(GAME, "map", "railways.txt")).some((r) => r.level > MAX),
    `(the base game caps a railway at level ${MAX}, and a row of its own is above it: AAA's pairs at 1–${MAX} once it counts at the cap)`, [...sharesBelow.byTag.get("AAA")]);
  ok(atLeast(sharesBelow.byTag.get("BBB"), 2) === 0 && atLeast(sharesBelow.all, 2) > 0.5 && !sharesBelow.byTag.has("DDD"),
    "(BBB had nothing above level 1; DDD had no railway; the whole map has more than half its pairs at 2 or above, so even one row of DDD's takes 2)", { all: [...sharesBelow.all] });
}

console.log("\n-- ⭐ Part A: the levels generateSupplyNetwork deals the states Generate land names --");
const MOD = makeMod("mod", { rails: "2 2 9 10 \r\n" });   // a railway the mod already has, joining two BBB hubs: written as the modder wrote it
const ids = STATES.map((s) => s.id);
const plan = md.generateSupplyNetwork({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [], stateIds: ids, dryRun: true });
const rows = (plan && plan.railRows) || [];
const vpA = vpOfMod(MOD);
const A = judge(rows, OWNER, vpA, "A");
{
  ok(rows.length >= 15 && A.groups.size === 4 && A.cross.length >= 2, "(the planner laid every country's own rows and the crossings between them)", { rows: rows.length, groups: [...A.groups.keys()], cross: A.cross.length });
  ok(new Set(rows.map(pairsOf)).size >= 2, "(rows of different lengths, so pairs and rows are not the same count)", rows.map(pairsOf));
  const chain = A.groups.get("CCC") || [];
  ok(chain.length === CHAIN.length - 1 && chain.every((r) => !VP.has(STATES.find((s) => s.provinces.includes(r.provinces[0])).id)), "(CCC's own rows are a chain of hubs on states with no victory point)", chain.map((r) => r.provinces));
  const bySide = rows.filter((r) => groupOfRow(r, OWNER) === "AAA");
  ok(bySide.some((r) => r.level >= 2) && bySide.some((r) => r.level === 1) && plan.levelsFrom === "below", "⭐⭐⭐ the railways are no longer all level 1: AAA's are several levels, read from below", { levels: plan.levels, from: plan.levelsFrom });
  ok(A.quota.length === 0, "⭐⭐⭐ (1) each country's pairs at each level are within half a row of its own share below (the whole map's for DDD)", A.quota);
  const ddd = A.groups.get("DDD") || [];
  ok(ddd.length >= 1 && ddd.every((r) => r.level >= 2), "⭐⭐ (2) DDD, which had no railway below, takes the whole map's share — not level 1", ddd.map((r) => r.level));
  ok((A.groups.get("BBB") || []).every((r) => r.level === 1), "…and BBB, whose railways below were all level 1, keeps level 1 — a country's own share, not the map's", (A.groups.get("BBB") || []).map((r) => r.level));
  ok(A.crossWrong.length === 0 && A.cross.some((r) => r.level >= 2) && A.cross.some((r) => r.level === 1), "⭐⭐ (3) a row across a border is the lower of the best levels at its two ends (both kinds here)", { wrong: A.crossWrong, cross: A.cross.map((r) => r.level) });
  ok(A.linked.length === 0, "⭐⭐ (4) each country's rows at each level are one piece in each piece of its own rail: a main line, not scattered stretches", A.linked);
  ok(A.busiest.length === 0, "⭐⭐ …and each country's busiest row carries its best level", A.busiest);
  // the control: AAA's victory points change which of its rows is busier, so a deal that does not read them is told apart
  const flat = busyness(rows, new Map()), withVp = busyness(rows, vpA), own = (A.groups.get("AAA") || []).map((r) => rows.indexOf(r));
  ok(own.some((i) => own.some((j) => withVp[i] > withVp[j] && flat[i] < flat[j])), "(the fixture: weighed without AAA's victory points, some of its rows would rank the other way)");
  ok(A.order.length === 0, "⭐⭐ (13) a busier row is never a worse one — each hub weighing 1 + the victory points on it", A.order);
  ok(rows.every((r) => r.level >= 1 && r.level <= MAX) && (A.groups.get("AAA") || []).some((r) => r.level === MAX), `⭐⭐ (5) none above level ${MAX}, the define — AAA's level-4 rail below counts at ${MAX}`, rows.map((r) => r.level));
  const busyC = busyness(rows, vpA), cc = (A.groups.get("CCC") || []);
  ok(cc.filter((r) => r.level >= 2).length === 2 && new Set(cc.map((r) => busyC[rows.indexOf(r)])).size > 1,
    "⭐⭐ (11) CCC's chain of hubs with no victory point still has a busiest stretch, and its two level-2 rows are it — a hub of no victory point still weighs", cc.map((r) => [r.provinces.join("-"), r.level, busyC[rows.indexOf(r)]]));
}

console.log("\n-- Part A, written --");
{
  const res = md.generateSupplyNetwork({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [], stateIds: ids });
  const text = fs.readFileSync(path.join(MOD, "map", "railways.txt"), "utf8"), written = readRails(path.join(MOD, "map", "railways.txt"));
  ok(res && res.changed && res.railways === rows.length && written.length === rows.length + 1, "the rows the plan laid are written", res && (res.error || { railways: res.railways, written: written.length }));
  ok(text.startsWith("2 2 9 10 \r\n"), "⭐⭐ (6) the railway the mod already had keeps its bytes", JSON.stringify(text.slice(0, 20)));
  const sum = Object.values(res.levels || {}).reduce((a, b) => a + b, 0), counted = {};
  for (const r of written.slice(1)) counted[r.level] = (counted[r.level] || 0) + 1;
  ok(sum === res.railways && JSON.stringify(res.levels) === JSON.stringify(counted) && res.levelsFrom === "below", "(10) the report counts the rows written at each level, and says where the levels came from", { levels: res.levels, counted });
  ok(written.slice(1).map((r) => r.level).join() === rows.map((r) => r.level).join(), "…the levels written are the plan's", written.slice(1).map((r) => r.level));
  const bad = (md.validateMapModel(md.buildMapModel({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] })) || []).filter((p) => p.rule === "railway_level_out_of_range");
  ok(bad.length === 0, "(9) Map Errors finds no railway level the game will not keep", bad.map((p) => p.message));
}

console.log("\n-- the repair, and a world with nothing below, stay at level 1 --");
{
  const R = makeMod("mod-repair");
  const rep = md.generateSupplyNetwork({ modRoot: R, gameRoot: GAME, dependencyRoots: [] });
  const repRows = readRails(path.join(R, "map", "railways.txt"));
  ok(rep && rep.changed && repRows.length >= 15 && repRows.every((r) => r.level === 1) && rep.levelsFrom === "repair",
    "⭐⭐ (7) Auto-fix's repair of an empty network (no named states) lays level 1, whatever is below", rep && (rep.error || { rows: repRows.length, levels: [...new Set(repRows.map((r) => r.level))], from: rep.levelsFrom }));
  const none = md.generateSupplyNetwork({ modRoot: makeMod("mod-nothing-below"), gameRoot: null, dependencyRoots: [], stateIds: ids, dryRun: true });
  // (one row more than Part A's plan: that mod already had the railway between BBB's two hubs)
  ok(none && none.railRows.length === rows.length + 1 && none.railRows.every((r) => r.level === 1) && none.levelsFrom === "nothing below", "(8) with no game below, every railway is level 1, as before", none && { rows: none.railRows.length, levels: none.levels, from: none.levelsFrom });
}

// ── Part B: Generate land itself ──────────────────────────────────────────────────────────────────────────────────────────────
// A Delete-map'd world over the same base game: all sea, one strategic region a state below, so each state it raises is one below.
function makeSeaMod(tag) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", 'name="rail levels, generated"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", PROVINCES_BMP);
  write(m, "map/definition.csv", definition(true));
  STATES.forEach((s, i) => write(m, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${s.provinces.join(" ")} }\n\tweather={}\n}\n`));
  write(m, "map/supply_nodes.txt", ""); write(m, "map/railways.txt", "");
  fs.mkdirSync(path.join(m, "history", "states"), { recursive: true });
  return m;
}
const LAND = STATES.reduce((n, s) => n + s.provinces.length, 0);
const generated = (mod) => {
  const owner = new Map();
  for (const f of fs.readdirSync(path.join(mod, "history", "states"))) {
    const t = fs.readFileSync(path.join(mod, "history", "states", f), "utf8"), o = (/\bowner\s*=\s*(\w+)/.exec(t) || [])[1] || "";
    for (const p of ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number)) owner.set(p, o);
  }
  return owner;
};
console.log("\n-- ⭐ Part B: Generate land, owned --");
{
  const G = makeSeaMod("mod-generated");
  const r = md.generateLand({ modRoot: G, gameRoot: GAME, dependencyRoots: [], count: LAND, provincesPerState: 2, seed: 1, ownerMode: "inherit", roughenCoast: false });
  const owner = generated(G), written = readRails(path.join(G, "map", "railways.txt"));
  const B = judge(written, owner, vpOfMod(G), "B");
  ok(r && r.changed && r.supplyNetwork && r.supplyNetwork.railways === written.length && written.length >= 10, "Generate land raised the world and laid its railways", r && (r.error || r.supplyNetwork));
  ok([...owner.values()].filter(Boolean).length === LAND && written.some((x) => x.level >= 2) && r.supplyNetwork.levelsFrom === "below", "⭐⭐⭐ every country inherited its land, and its railways are dealt from below — not all level 1", r.supplyNetwork && r.supplyNetwork.levels);
  ok(B.quota.length === 0 && B.crossWrong.length === 0 && B.linked.length === 0 && written.every((x) => x.level <= MAX), "⭐⭐ the same rule through the click: shares, crossings, main lines, the define", { quota: B.quota, cross: B.crossWrong, linked: B.linked });
  // (Generate land gives states like these one victory point value, so here the points cannot reorder rows: Part A's (13) is the
  // check that tells a deal reading them from one that does not)
  const values = [...new Set(vpOfMod(G).values())].sort((a, b) => a - b);
  ok(B.order.length === 0, `…and a busier row is never a worse one, by the victory points Generate land gave the states it wrote (worth ${values.join(", ")})`, B.order);
}
console.log("\n-- ⭐ Part B: Generate land, nobody's --");
{
  const N = makeSeaMod("mod-generated-none");
  const r = md.generateLand({ modRoot: N, gameRoot: GAME, dependencyRoots: [], count: LAND, provincesPerState: 2, seed: 1, ownerMode: "none", roughenCoast: false });
  const owner = generated(N), written = readRails(path.join(N, "map", "railways.txt"));
  const B = judge(written, owner, vpOfMod(N), "none");
  ok(r && r.changed && [...owner.values()].every((o) => !o) && written.length >= 10 && B.cross.length === 0, "(nobody owns the world, so every railway is ownerless land's own)", r && (r.error || { rows: written.length, cross: B.cross.length }));
  ok(written.some((x) => x.level >= 2) && B.quota.length === 0, "⭐⭐ (12) ownerless rails take the whole map's share — not level 1 for want of a country", { levels: r.supplyNetwork && r.supplyNetwork.levels, quota: B.quota });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
