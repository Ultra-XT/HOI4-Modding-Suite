// ⛔ #a-railway-closes-the-long-way-round — A GENERATED RAILWAY NETWORK CLOSES THE LOOPS THE WAY ROUND WOULD DETOUR.
//
// TEST 33's rehearsal (10-08) laid its railways as a spanning forest: 2 loops against the base game's 240, and from a capital the
// rail to its own hubs ran 4.87x the straight line at the worst tenth (the base game 1.62x) — the USA's capital to Gresbasta 9.31x.
// A detour costs trains and reinforcement time (00_defines NSupply NUM_RAILWAYS_TRAIN_FACTOR, RAILWAY_DISTANCE_FACTOR_FOR_
// REINFORCEMENT_SPEED). Rule (h) in generateSupplyNetwork: after the owner pass's forest, a link whose two hubs are already joined is
// laid when the way round over the country's own rail is more than RAIL_LOOP_STRETCH times the link's own length — never over a
// border that costs a step more (d, e, g), never where its arrows would lie on or CROSS the rail drawn (f, and the crossing a loop
// alone is asked), never between hubs of states the call does not serve, never on a joinOnly call, and written only over the
// provinces not yet on the rail.
//
// Fixtures (cells of 8 px, a cell a province; column 0 and the last are sea, so nothing touches across the east-west seam):
//   ring      four states round a lake, each a hub cell with one gate into the ring   -> the forest leaves one gap, the rule closes it
//   halves    two states round a lake, the two ways round equally long                 -> asked, and the way round is short: no loop
//   thin      the ring with the gap's border cut to one pixel                          -> the loop would cross a thin border: none
//   mine      the ring as the MODDER's own states and railways, plus a new ring        -> the click closes its own ring, not theirs
//   stations  the ring with every station written (unitstacks.txt), and a modder's railway elsewhere whose two stations are then
//             moved to straddle the gap's new arrow                                     -> the CALL asks the crossing: no loop
//   repair    the ring as a world the mod owns, its supply file empty, no state named   -> Auto-fix's repair closes the gap too
//   joinOnly  the ring as one capital state holding two hubs joined the long way round  -> a joinOnly call lays no loop
// Every expected number is derived here from the fixture's own grid (a breadth-first walk over its land, the stations written), not
// typed.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rail-loop-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const STRETCH = md.RAIL_LOOP_STRETCH;

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ok   " + m); } else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); } };
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const CELL = 8, ROWS = 5;
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
// a ring of 3 x 3 cells round a lake cell, hub cells outside it at N/E/S/W, its top-left cell at (c0, r0); returns cell -> name
function ringCells(c0, r0) {
  return { [`${c0 + 2},${r0}`]: "HN", [`${c0 + 1},${r0 + 1}`]: "cNW", [`${c0 + 2},${r0 + 1}`]: "rN", [`${c0 + 3},${r0 + 1}`]: "cNE",
    [`${c0},${r0 + 2}`]: "HW", [`${c0 + 1},${r0 + 2}`]: "rW", [`${c0 + 3},${r0 + 2}`]: "rE", [`${c0 + 4},${r0 + 2}`]: "HE",
    [`${c0 + 1},${r0 + 3}`]: "cSW", [`${c0 + 2},${r0 + 3}`]: "rS", [`${c0 + 3},${r0 + 3}`]: "cSE", [`${c0 + 2},${r0 + 4}`]: "HS" };
}
const FOUR = { N: ["HN", "rN", "cNE"], E: ["HE", "rE", "cSE"], S: ["HS", "rS", "cSW"], W: ["HW", "rW", "cNW"] };
const TWO = { A: ["HW", "rW", "cNW", "cSW", "rN"], B: ["HE", "rE", "cNE", "cSE", "rS"] };
const ALL = ["HN", "cNW", "rN", "cNE", "HW", "rW", "rE", "HE", "cSW", "rS", "cSE", "HS"];
/** A world of `cols` x 5 cells holding the given rings: [{ c0, states: { key: [cell names, the first the hub's] }, owner,
 *  firstState, mod (true = the modder's own: its hubs in supply_nodes.txt and `modRails` in railways.txt; a list of state keys: those
 *  states only), hubs (the mod's hub
 *  cells, when not each state's first), drop: [cell names that are sea] }]. `thin`: [a, b] cell names in ring 0 whose border is cut
 *  to its last pixel row. `extra`: { cells: { name: [c, r] }, state, owner, rails: [[names]] } — a state of land outside the rings,
 *  the modder's own, with its railways in railways.txt. `stations`: write a Standstill (unitstacks.txt types 0, 9, 38) at every land
 *  cell's centre, `moved` { "ring:name" | name: [x, row] } where one stands elsewhere. Returns ids, stations, the land graph. */
function world(tag, rings, { thin = null, cols = 7, extra = null, stations = false, moved = {} } = {}) {
  const W = cols * CELL, H = ROWS * CELL;
  const nameAt = new Map();   // "c,r" -> { ring, name }
  rings.forEach((rg, i) => { const cells = ringCells(rg.c0, 0); for (const [k, n] of Object.entries(cells)) if (!(rg.drop || []).includes(n)) nameAt.set(k, { ring: i, name: n }); });
  if (extra) for (const [n, [c, r]] of Object.entries(extra.cells)) nameAt.set(`${c},${r}`, { ring: "x", name: n });
  const idOf = (c, r) => r * cols + c + 1;
  const lakeId = cols * ROWS + 1;                                      // one sea province for every water cell (and the thin cut)
  const cellAt = (x, y) => { const c = Math.floor(x / CELL), r = Math.floor(y / CELL); return { c, r, k: `${c},${r}` }; };
  let thinCut = null;
  if (thin) {
    const find = (n) => [...nameAt].find(([, v]) => v.ring === 0 && v.name === n)[0].split(",").map(Number);
    const [a, b] = thin.map(find);                                     // b is right of a: cut b's left pixel column but its last row
    thinCut = (x, y) => x === b[0] * CELL && y >= b[1] * CELL && y < b[1] * CELL + CELL - 1 && a[1] === b[1];
  }
  const pid = (x, y) => { const { c, r, k } = cellAt(x, y); if (!nameAt.has(k) || (thinCut && thinCut(x, y))) return lakeId; return idOf(c, r); };
  const mod = path.join(ROOT, tag);
  write(mod, "descriptor.mod", `name="${tag}"\nreplace_path="history/states"\n`);
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(pid(x, y))));
  const def = ["0;0;0;0;land;false;unknown;0"];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < cols; c++) { const id = idOf(c, r); if (nameAt.has(`${c},${r}`)) def.push(`${id};${colour(id).join(";")};land;false;plains;1`); }
  def.push(`${lakeId};${colour(lakeId).join(";")};sea;false;ocean;0`);
  write(mod, "map/definition.csv", def.join("\n") + "\n");
  const ids = new Map();   // "ring:name" -> province id
  for (const [k, v] of nameAt) { const [c, r] = k.split(",").map(Number); ids.set(`${v.ring}:${v.name}`, idOf(c, r)); }
  const stateFile = (sid, owner, provs, vp) => write(mod, `history/states/${sid}-S.txt`, `state={\n\tid=${sid}\n\tname="STATE_${sid}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=${owner}\n\t\tvictory_points = { ${vp} 5 }\n\t}\n}\n`);
  const hubRows = [], railRows = [], served = [];
  rings.forEach((rg, i) => {
    let sid = rg.firstState;
    for (const [key, cells] of Object.entries(rg.states)) {
      const provs = cells.filter((n) => ids.has(`${i}:${n}`)).map((n) => ids.get(`${i}:${n}`));
      stateFile(sid, rg.owner, provs, ids.get(`${i}:${cells[0]}`));
      // `mod` true: every state the modder's; a list: those states only, the rest the click's
      if (rg.mod === true || (Array.isArray(rg.mod) && rg.mod.includes(key))) for (const n of (rg.hubs || [cells[0]])) hubRows.push(`1 ${ids.get(`${i}:${n}`)}`); else served.push(sid);
      sid++;
    }
    if (rg.mod) for (const p of rg.modRails || []) railRows.push(`1 ${p.length} ${p.map((n) => ids.get(`${i}:${n}`)).join(" ")}`);
  });
  if (extra) {
    const provs = Object.keys(extra.cells).map((n) => ids.get(`x:${n}`));
    stateFile(extra.state, extra.owner, provs, provs[0]);
    for (const p of extra.rails || []) railRows.push(`1 ${p.length} ${p.map((n) => ids.get(n.includes(":") ? n : `x:${n}`)).join(" ")}`);   // "0:HE": a ring's cell
  }
  write(mod, "map/supply_nodes.txt", hubRows.join("\n") + (hubRows.length ? "\n" : ""));
  write(mod, "map/railways.txt", railRows.join("\n") + (railRows.length ? "\n" : ""));
  write(mod, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
  const st = new Map();   // province -> [x, row], rows top-down
  if (stations) {
    for (const [k, v] of nameAt) { const [c, r] = k.split(",").map(Number); st.set(idOf(c, r), moved[`${v.ring}:${v.name}`] || moved[v.name] || [c * CELL + CELL / 2, r * CELL + CELL / 2]); }
    write(mod, "map/unitstacks.txt", [...st].map(([p, [x, row]]) => [0, 9, 38].map((ty) => `${p};${ty};${x.toFixed(2)};10.00;${(H - 1 - row).toFixed(2)};0.00;0.00`).join("\n")).join("\n") + "\n");
  }
  // the land graph, from the cells (4-neighbour; the thin cut leaves its pair touching)
  const land = new Map();
  for (const [k] of nameAt) { const [c, r] = k.split(",").map(Number); const u = idOf(c, r); land.set(u, new Set()); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (nameAt.has(`${c + dc},${r + dr}`)) land.get(u).add(idOf(c + dc, r + dr)); }
  return { w: { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] }, ids, served, land, st };
}
const bfs = (nb, a, b) => { const d = new Map([[a, 0]]), q = [a]; for (let k = 0; k < q.length; k++) { const u = q[k]; if (u === b) return d.get(u); for (const v of (nb.get(u) || [])) if (!d.has(v)) { d.set(v, d.get(u) + 1); q.push(v); } } return Infinity; };
const railGraph = (rows) => { const g = new Map(); for (const r of rows) for (let i = 1; i < r.provinces.length; i++) { const a = r.provinces[i - 1], b = r.provinces[i]; for (const [u, v] of [[a, b], [b, a]]) { if (!g.has(u)) g.set(u, new Set()); g.get(u).add(v); } } return g; };
/** the network's loops: its distinct province pairs, less its provinces, plus its pieces (the cycle rank) */
const loopsOf = (rows) => { const g = railGraph(rows), pairs = new Set(); for (const r of rows) for (let i = 1; i < r.provinces.length; i++) { const a = r.provinces[i - 1], b = r.provinces[i]; pairs.add(a < b ? a + "-" + b : b + "-" + a); } let pieces = 0; const seen = new Set(); for (const s of g.keys()) { if (seen.has(s)) continue; pieces++; const q = [s]; seen.add(s); while (q.length) { const u = q.pop(); for (const v of g.get(u)) if (!seen.has(v)) { seen.add(v); q.push(v); } } } return pairs.size - g.size + pieces; };
const pairsOf = (r) => r.provinces.slice(1).map((p, i) => { const a = r.provinces[i]; return a < p ? a + "-" + p : p + "-" + a; });
const plan = (wd, stateIds, extra = {}) => md.generateSupplyNetwork({ ...wd.w, ...(stateIds ? { stateIds } : {}), dryRun: true, ...extra });
const readRows = (wd) => md.parseRailways(fs.readFileSync(path.join(wd.w.modRoot, "map", "railways.txt"), "utf8"));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

ok(typeof STRETCH === "number" && STRETCH > 1, "(map-data.js exports RAIL_LOOP_STRETCH, the stretch every expected loop below is derived from)", STRETCH);

console.log("\n-- ⭐ a ring of four: the forest leaves one gap, and the rule closes it --");
{
  const wd = world("ring", [{ c0: 1, states: FOUR, owner: "XXX", firstState: 1 }]);
  const p = plan(wd, wd.served);
  const rows = p.railRows || [], hubs = ["HN", "HE", "HS", "HW"].map((n) => wd.ids.get(`0:${n}`));
  const forest = rows.filter((r) => !r.loop), loops = rows.filter((r) => r.loop);
  ok(forest.length === hubs.length - 1 && loopsOf(forest) === 0, "CONTROL: the forest joins the four hubs with three railways and no loop", forest.map((r) => r.provinces));
  // the way round the forest leaves between neighbouring hubs, against their walk over land — derived from the grid
  const g0 = railGraph(forest);
  const gap = []; for (let i = 0; i < 4; i++) { const a = hubs[i], b = hubs[(i + 1) % 4]; gap.push({ a, b, round: bfs(g0, a, b), land: bfs(wd.land, a, b) }); }
  const want = gap.filter((x) => x.round > STRETCH * x.land).length;
  ok(want === 1, "CONTROL: exactly one pair of neighbouring hubs goes the long way round on the forest (derived)", gap);
  ok(loops.length === want && loopsOf(rows) === want, "⭐⭐ the rule lays one railway, and the network has one loop", { loops: loops.map((r) => r.provinces), all: rows.map((r) => r.provinces) });
  ok((p.railLoops || {}).laid === loops.length, "…and the result says so (railLoops.laid)", p.railLoops);
  const g1 = railGraph(rows);
  ok(gap.every((x) => bfs(g1, x.a, x.b) <= STRETCH * x.land), "⭐ no two neighbouring hubs are more than RAIL_LOOP_STRETCH times their walk over land apart by rail", gap.map((x) => ({ ...x, now: bfs(g1, x.a, x.b) })));
  const forestPairs = new Set(forest.flatMap(pairsOf));
  ok(loops.every((r) => pairsOf(r).every((k) => !forestPairs.has(k))), "⭐ a loop row carries no pair a forest row already lists (it is written over the new provinces only)", loops.map((r) => r.provinces));
  const onRail = new Set(forest.flatMap((r) => r.provinces));
  ok(loops.every((r) => onRail.has(r.provinces[0]) && onRail.has(r.provinces[r.provinces.length - 1])), "…and it starts and ends on the rail already laid, so it closes a loop", loops.map((r) => r.provinces));
}

console.log("\n-- two halves round a lake: the way round is no longer than the link, so no loop --");
{
  const wd = world("halves", [{ c0: 1, states: TWO, owner: "XXX", firstState: 1, drop: ["HN", "HS"] }]);
  const p = plan(wd, wd.served);
  const rows = p.railRows || [];
  const a = wd.ids.get("0:HW"), b = wd.ids.get("0:HE");
  // the two ways round the lake over land, derived: north through rN, south through rS
  const without = (gone) => { const g = new Map([...wd.land].map(([u, vs]) => [u, new Set([...vs].filter((v) => v !== gone))])); g.delete(gone); return g; };
  const north = bfs(without(wd.ids.get("0:rS")), a, b), south = bfs(without(wd.ids.get("0:rN")), a, b);
  ok(Number.isFinite(north) && Number.isFinite(south) && Math.max(north, south) <= STRETCH * Math.min(north, south), "CONTROL: the two ways round are within RAIL_LOOP_STRETCH of each other (derived)", { north, south, STRETCH });
  ok((p.railLoops || {}).asked >= 1, "CONTROL: the second way WAS asked (railLoops.asked), so the answer below is the rule's", p.railLoops);
  ok(loopsOf(rows) === 0 && !rows.some((r) => r.loop), "⭐ no loop is laid", rows.map((r) => r.provinces));
}

console.log("\n-- ⭐ the gap's border is one pixel: a loop is optional, so it never takes a border that costs a step more --");
{
  const wd = world("thin", [{ c0: 1, states: FOUR, owner: "XXX", firstState: 1 }], { thin: ["cNW", "rN"] });
  const wn = world("thin-not", [{ c0: 1, states: FOUR, owner: "XXX", firstState: 1 }]);
  const p = plan(wd, wd.served), wide = plan(wn, wn.served);
  const rows = p.railRows || [];
  ok(rows.filter((r) => !r.loop).length === 3, "CONTROL: the forest still joins all four hubs", rows.map((r) => r.provinces));
  ok((p.railLoops || {}).waited && p.railLoops.waited.dear === (wide.railLoops || {}).laid && Object.keys(p.railLoops.waited).length === 1 && (wide.railLoops || {}).laid > 0,
    "CONTROL: the loop laid over the gap's wide border was asked over the thin one and held back (waited.dear), and for nothing else", { thin: p.railLoops, wide: wide.railLoops });
  ok(loopsOf(rows) === 0, "⭐⭐ no loop crosses the one-pixel border", rows.map((r) => r.provinces));
}

console.log("\n-- ⭐ the modder's own ring keeps its railways as they are; the click closes only its own --");
{
  const MODRAILS = [["HN", "rN", "cNE", "rE", "HE"], ["HE", "rE", "cSE", "rS", "HS"], ["HS", "rS", "cSW", "rW", "HW"]];   // their forest, open at W-N
  const wd = world("mine", [{ c0: 1, states: FOUR, owner: "XXX", firstState: 1, mod: true, modRails: MODRAILS }, { c0: 7, states: FOUR, owner: "YYY", firstState: 5 }], { cols: 13 });
  const theirs = new Set([...wd.ids].filter(([k]) => k.startsWith("0:")).map(([, v]) => v));
  const p = plan(wd, wd.served);
  const rows = p.railRows || [];
  ok(bfs(railGraph(readRows(wd)), wd.ids.get("0:HW"), wd.ids.get("0:HN")) > STRETCH * bfs(wd.land, wd.ids.get("0:HW"), wd.ids.get("0:HN")), "CONTROL: the modder's own ring goes the long way round between W and N (derived)");
  ok(!rows.some((r) => r.provinces.some((q) => theirs.has(q))), "⭐⭐ no railway is laid on the modder's own ring", rows.filter((r) => r.provinces.some((q) => theirs.has(q))).map((r) => r.provinces));
  ok(rows.filter((r) => r.loop).length === 1 && loopsOf(rows) === 1, "⭐ …and the click's own ring gets its loop", rows.map((r) => r.provinces));
}

console.log("\n-- ⭐ a ring half the click's and half the modder's: no loop between a hub the click serves and one it does not, either way round --");
{
  // FOUR with two states the modder's — their hubs in supply_nodes.txt, joined by their own railway — and two the click's. The forest
  // joins the click's hubs to the modder's; the link it leaves joins a hub the click serves to one it does not. Both halves are asked,
  // so the served hub is that link's first end in one and its second in the other: the guard is asked of BOTH ends. (Review of
  // b42f689a: asked of one end, every check passed, and on a half-served TEST 33 the loops went 32 → 61, onto the modder's hubs.)
  for (const [label, theirs, rail] of [["the modder's south and west", ["S", "W"], ["HS", "rS", "cSW", "rW", "HW"]], ["the modder's north and east", ["N", "E"], ["HN", "rN", "cNE", "rE", "HE"]]]) {
    const wd = world("half-" + theirs.join(""), [{ c0: 1, states: FOUR, owner: "XXX", firstState: 1, mod: theirs, modRails: [rail] }]);
    const hubOf = (k) => wd.ids.get(`0:${FOUR[k][0]}`), clicks = Object.keys(FOUR).filter((k) => !theirs.includes(k));
    const p = plan(wd, wd.served), rows = p.railRows || [];
    const g = railGraph(rows.filter((r) => !r.loop).concat(readRows(wd)));
    // the pairs of neighbouring hubs, served and unserved, whose way round over the forest and the modder's rail runs past the stretch
    const order = ["N", "E", "S", "W"], mixed = [];
    for (let i = 0; i < 4; i++) {
      const a = order[i], b = order[(i + 1) % 4];
      if (clicks.includes(a) === clicks.includes(b)) continue;
      const round = bfs(g, hubOf(a), hubOf(b)), land = bfs(wd.land, hubOf(a), hubOf(b));
      if (round > STRETCH * land) mixed.push({ a, b, round, land });
    }
    ok(wd.served.length === clicks.length && rows.filter((r) => !r.loop).length >= clicks.length, `(${label}: the click serves ${clicks.join(" and ")} and joins their hubs to the modder's)`, { served: wd.served, rows: rows.map((r) => r.provinces) });
    ok(mixed.length === 1, `CONTROL (${label}): one served hub and one unserved are neighbours the long way round, so (h) would close them were both served`, mixed);
    ok(!rows.some((r) => r.loop) && (p.railLoops || {}).laid === 0, `⭐⭐ ${label}: no loop is laid between a hub the click serves and one it does not`, { rows: rows.map((r) => r.provinces), railLoops: p.railLoops });
  }
}

console.log("\n-- ⭐⭐ the stretch at its boundary: a way round just past RAIL_LOOP_STRETCH x the link is closed, one at it is not --");
{
  // A cycle of cells round a lake, three states on it each a hub cell and the cells up to the next hub: the forest lays the two
  // cheaper links, and the third is closed when the way round — the other two — runs more than STRETCH times its own hops. On a grid a
  // cycle is even, so a way round has the parity of its link. The two cases are derived from STRETCH: ABOVE the shortest link whose
  // stretch is no whole number, with the first way round past it (the one two shorter is within it); AT the shortest link whose
  // stretch is a whole number of its parity, with exactly that way round. (Review of b42f689a: the ring's way round was 12 hops against a
  // 4-hop link, so `limit = STRETCH * hops` with one hop too many, or a way round counted one short, passed every check while TEST 33
  // lost 48 or 26 of its 104 loops.)
  const parity = (a, b) => (a - b) % 2 === 0;
  let ABOVE = null, AT = null;
  for (let L = 2; L <= 12 && !(ABOVE && AT); L++) {
    const lim = STRETCH * L;
    if (!ABOVE && !Number.isInteger(lim) && parity(Math.floor(lim) + 1, L)) ABOVE = { L, R: Math.floor(lim) + 1 };
    if (!AT && Number.isInteger(lim) && parity(lim, L)) AT = { L, R: lim };
  }
  /** a 3-row cycle round a lake of the hops `arcs` between its three hubs, the last arc the link (h) asks; cells of 8 px */
  const cycleWorld = (tag, arcs) => {
    const P = arcs.reduce((a, b) => a + b, 0), w = (P - 2) / 2, cols = w + 2, rows = 5, W = cols * CELL, H = rows * CELL;
    const cyc = [];
    for (let c = 1; c <= w; c++) cyc.push([c, 1]);
    cyc.push([w, 2]);
    for (let c = w; c >= 1; c--) cyc.push([c, 3]);
    cyc.push([1, 2]);
    const idOf = (c, r) => r * cols + c + 1, lake = cols * rows + 1, landAt = new Map(cyc.map(([c, r], i) => [`${c},${r}`, i]));
    const mod = path.join(ROOT, tag);
    write(mod, "descriptor.mod", `name="${tag}"\nreplace_path="history/states"\n`);
    write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => { const c = Math.floor(x / CELL), r = Math.floor(y / CELL); return colour(landAt.has(`${c},${r}`) ? idOf(c, r) : lake); }));
    write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(cyc.map(([c, r]) => `${idOf(c, r)};${colour(idOf(c, r)).join(";")};land;false;plains;1`), [`${lake};${colour(lake).join(";")};sea;false;ocean;0`]).join("\n") + "\n");
    write(mod, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
    write(mod, "map/supply_nodes.txt", ""); write(mod, "map/railways.txt", "");
    const at = [0, arcs[0], arcs[0] + arcs[1]], hubs = at.map((i) => idOf(...cyc[i]));
    at.forEach((i, k) => {
      const cells = cyc.slice(i, k < 2 ? at[k + 1] : P).map(([c, r]) => idOf(c, r));
      write(mod, `history/states/${k + 1}-S.txt`, `state={\n\tid=${k + 1}\n\tname="STATE_${k + 1}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${cells.join(" ")} }\n\thistory={\n\t\towner=XXX\n\t\tvictory_points = { ${cells[0]} 5 }\n\t}\n}\n`);
    });
    const land = new Map(cyc.map(([c, r], i) => [idOf(c, r), new Set([idOf(...cyc[(i + 1) % P]), idOf(...cyc[(i + P - 1) % P])])]));
    return { w: { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] }, hubs, land, served: [1, 2, 3] };
  };
  ok(!!ABOVE && !!AT, `(the two cases, derived from STRETCH ${STRETCH}: a ${ABOVE && ABOVE.L}-hop link with a ${ABOVE && ABOVE.R}-hop way round, a ${AT && AT.L}-hop link with a ${AT && AT.R}-hop one)`, { ABOVE, AT });
  for (const [label, k, laid] of [["ABOVE", ABOVE, true], ["AT", AT, false]]) {
    if (!k) continue;
    const a = Math.floor(k.R / 2), arcs = [a, k.R - a, k.L];
    const wd = cycleWorld("edge-" + label, arcs);
    const p = plan(wd, wd.served), rows = p.railRows || [], forest = rows.filter((r) => !r.loop);
    const placed = new Set((p.newHubs || []).map((h) => h.province));
    ok(arcs.every((x) => x >= 1 && x <= k.L) && wd.hubs.every((h) => placed.has(h)) && placed.size === 3, `(${label}: three hubs, ${arcs.join(" + ")} hops apart round the cycle, the link ${k.L} the longest)`, { arcs, placed: [...placed], hubs: wd.hubs });
    // the pair of neighbouring hubs the forest did not join directly (a tie between two links of k.L hops is broken by id: either way
    // the way round is the other two arcs)
    const g0 = railGraph(forest), pairs = [0, 1, 2].map((i) => { const a = wd.hubs[i], b = wd.hubs[(i + 1) % 3]; return { a, b, round: bfs(g0, a, b), link: bfs(wd.land, a, b) }; });
    const open = pairs.filter((x) => x.round > x.link), { round, link } = open[0] || { round: NaN, link: NaN };
    ok(forest.length === 2 && open.length === 1 && link === k.L && round === k.R, `CONTROL (${label}): the forest joins the three by two links; the third is ${k.L} hops and its way round ${k.R}`, { pairs, forest: forest.map((r) => r.provinces) });
    ok(laid ? round > STRETCH * link && round - 2 <= STRETCH * link : round === STRETCH * link, `CONTROL (${label}): ${laid ? "the way round is the first past STRETCH x the link — the one two shorter is not" : "the way round is exactly STRETCH x the link"}`, { round, link, STRETCH });
    ok((p.railLoops || {}).asked >= 1, `CONTROL (${label}): the link was asked`, p.railLoops);
    ok(laid ? rows.filter((r) => r.loop).length === 1 && (p.railLoops || {}).laid === 1 && loopsOf(rows) === 1 : !rows.some((r) => r.loop) && (p.railLoops || {}).laid === 0 && loopsOf(rows) === 0,
      `⭐⭐ ${label}: ${laid ? `a ${k.R}-hop way round of a ${k.L}-hop link is closed` : `a ${k.R}-hop way round of a ${k.L}-hop link — STRETCH x it, not more — is not`}`, { rows: rows.map((r) => r.provinces), railLoops: p.railLoops });
  }
}

console.log("\n-- ⭐ the way round is counted over the country's OWN rail: a railway through a neighbour's land does not make it short --");
{
  // The ring the click serves, and ZZZ's land round its south-east corner with the modder's railway HE - Z1 - Z2 - Z3 - HS on it: the
  // union-find calls HE and HS joined, and over ZZZ's rail they are as close as over XXX's land, but a train of XXX's cannot use it.
  const EXTRA = { cells: { Z1: [5, 3], Z2: [5, 4], Z3: [4, 4] }, state: 9, owner: "ZZZ", rails: [["0:HE", "Z1", "Z2", "Z3", "0:HS"]] };
  const wd = world("foreign", [{ c0: 1, states: FOUR, owner: "XXX", firstState: 1 }], { extra: EXTRA });
  const zzz = new Set(["Z1", "Z2", "Z3"].map((n) => wd.ids.get(`x:${n}`)));
  const ownLand = new Map([...wd.land].filter(([u]) => !zzz.has(u)).map(([u, vs]) => [u, new Set([...vs].filter((v) => !zzz.has(v)))]));
  const hubs = ["HN", "HE", "HS", "HW"].map((n) => wd.ids.get(`0:${n}`)), he = hubs[1], hs = hubs[2];
  const theirs = readRows(wd);
  ok(bfs(railGraph(theirs), he, hs) <= STRETCH * bfs(ownLand, he, hs), "(the fixture: over ZZZ's railway HE and HS are within RAIL_LOOP_STRETCH of their walk over XXX's land, derived)", { rail: bfs(railGraph(theirs), he, hs), land: bfs(ownLand, he, hs) });
  const p = plan(wd, wd.served), rows = p.railRows || [];
  const own = railGraph(rows.concat(theirs).map((r) => ({ provinces: r.provinces })).filter((r) => r.provinces.every((q) => !zzz.has(q))));
  const pairs = hubs.map((a, i) => ({ a, b: hubs[(i + 1) % 4] })).map((x) => ({ ...x, rail: bfs(own, x.a, x.b), land: bfs(ownLand, x.a, x.b) }));
  ok(pairs.every((x) => x.rail <= STRETCH * x.land), "⭐⭐ every two neighbouring hubs of XXX are within RAIL_LOOP_STRETCH of their walk over its land on XXX's OWN rail", pairs);
  ok(!rows.some((r) => r.provinces.some((q) => zzz.has(q))) && (p.railLoops || {}).laid === rows.filter((r) => r.loop).length, "…and no railway was laid over ZZZ's land; the result counts the loops laid", { rows: rows.map((r) => r.provinces), railLoops: p.railLoops });
}

console.log("\n-- ⭐ with the stations written, the planner asks a loop whether its arrows CROSS the rail drawn — the call, not only the ledger --");
{
  // The ring the click serves, every station at its cell's centre, and the modder's own state ZZZ out east (column 6 is sea) with
  // its railway M1 - M2 between two touching provinces. Moved to straddle the gap's first new arrow, 3 px either side of it (more
  // than the 2 px an arrow passing a station waits on), that railway's arrow crosses the loop's — and nothing else changes.
  const EXTRA = { cells: { M1: [7, 1], M2: [7, 2] }, state: 9, owner: "ZZZ", rails: [["M1", "M2"]] };
  const ringOf = () => [{ c0: 1, states: FOUR, owner: "XXX", firstState: 1 }];
  const off = world("stations-off", ringOf(), { cols: 9, extra: EXTRA, stations: true });
  const p0 = plan(off, off.served), rows0 = p0.railRows || [], loop0 = rows0.filter((r) => r.loop);
  ok(off.st.size === off.ids.size && fs.existsSync(path.join(off.w.modRoot, "map", "unitstacks.txt")), "(the fixture: a station written for every land province)", off.st.size);
  ok(loop0.length === 1 && (p0.railLoops || {}).laid === 1 && !rows0.some((r) => r.provinces.includes(off.ids.get("x:M1"))),
    "CONTROL: stations off the gap — the gap's loop is laid, and nothing is laid on the modder's state", { rows: rows0.map((r) => r.provinces), railLoops: p0.railLoops });
  const [a, b] = (loop0[0] || { provinces: [] }).provinces;
  const A = off.st.get(a), B = off.st.get(b);
  const len = A && B ? Math.hypot(B[0] - A[0], B[1] - A[1]) : 0, nx = len ? -(B[1] - A[1]) / len : 0, ny = len ? (B[0] - A[0]) / len : 0;
  const mid = A && B ? [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2] : [0, 0], M1 = [mid[0] + 3 * nx, mid[1] + 3 * ny], M2 = [mid[0] - 3 * nx, mid[1] - 3 * ny];
  // the crossing and the clearance, measured off the stations to be written
  const crosses = (P, Q, R, S) => { const rx = Q[0] - P[0], ry = Q[1] - P[1], sx = S[0] - R[0], sy = S[1] - R[1], den = rx * sy - ry * sx; if (!den) return false; const t = ((R[0] - P[0]) * sy - (R[1] - P[1]) * sx) / den, u = ((R[0] - P[0]) * ry - (R[1] - P[1]) * rx) / den; return t > 0 && t < 1 && u > 0 && u < 1; };
  const offLine = (P, Q, R) => { const dx = R[0] - Q[0], dy = R[1] - Q[1], L2 = dx * dx + dy * dy; let t = ((P[0] - Q[0]) * dx + (P[1] - Q[1]) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(Q[0] + t * dx - P[0], Q[1] + t * dy - P[1]); };
  const arrows0 = rows0.flatMap((r) => r.provinces.slice(1).map((q, i) => [off.st.get(r.provinces[i]), off.st.get(q)]));
  ok(!!len && crosses(A, B, M1, M2) && arrows0.every(([P, Q]) => offLine(M1, P, Q) >= 3 && offLine(M2, P, Q) >= 3),
    "(the fixture: moved, the modder's arrow crosses the gap's new arrow, and both its stations stand 3 px or more off every arrow the plan drew)", { A, B, M1, M2 });
  const on = world("stations-on", ringOf(), { cols: 9, extra: EXTRA, stations: true, moved: { M1, M2 } });
  const p1 = plan(on, on.served), rows1 = p1.railRows || [], waited = (p1.railLoops || {}).waited || {};
  ok(same(rows1.filter((r) => !r.loop).map((r) => r.provinces), rows0.filter((r) => !r.loop).map((r) => r.provinces)), "CONTROL: the forest is the one laid with the stations off the gap", rows1.map((r) => r.provinces));
  ok(!rows1.some((r) => r.loop) && loopsOf(rows1) === 0 && (p1.railLoops || {}).laid === 0, "⭐⭐⭐ the loop whose arrow would cross the modder's railway is not laid", { rows: rows1.map((r) => r.provinces), railLoops: p1.railLoops });
  ok(waited.cross === (p0.railLoops || {}).laid && Object.keys(waited).every((k) => k === "cross") && (p1.railLoops || {}).asked === (p0.railLoops || {}).asked,
    "⭐⭐ …and the crossing is why: the loop laid with the stations off the gap waited on it (railLoops.waited.cross), nothing for a dear border, a fan, a turn or a station", { off: p0.railLoops, on: p1.railLoops });
}

console.log("\n-- ⭐ Auto-fix's repair — a world the mod owns, its supply file empty, no state named — closes the gap too --");
{
  const wd = world("repair", [{ c0: 1, states: FOUR, owner: "XXX", firstState: 1 }]);
  ok(fs.readFileSync(path.join(wd.w.modRoot, "map", "supply_nodes.txt"), "utf8") === "" && readRows(wd).length === 0, "(the fixture: the mod's own supply_nodes.txt and railways.txt are empty, and every state is the mod's)");
  const res = md.generateSupplyNetwork({ ...wd.w });
  const written = readRows(wd);
  ok(!!res && res.changed === true && res.hubs === Object.keys(FOUR).length, "CONTROL: the repair ran — one hub in each of the mod's states, no state named", res && (res.error || res.reason || { hubs: res.hubs }));
  ok(loopsOf(written) === 1 && written.length === res.railways, "⭐⭐ the railways written close the ring's one loop", written.map((r) => r.provinces));
  ok(!!res.railLoops && res.railLoops.laid === 1, "…and the result says so (railLoops.laid)", res.railLoops);
}

console.log("\n-- ⭐ a joinOnly call (Auto-fix hubbing a capital it moved) joins a new hub and nothing else: no loop --");
{
  // one state, XXX's capital, holding two hubs of the mod's own (W and N) that its own railway joins the long way round (by S and E)
  const RAILS = [["HW", "rW", "cSW", "rS", "cSE", "rE", "cNE", "rN", "HN"]];
  const make = (tag) => world(tag, [{ c0: 1, states: { C: ALL }, owner: "XXX", firstState: 1, mod: true, hubs: ["HW", "HN"], modRails: RAILS }]);
  const wd = make("join-control"), sid = 1;
  const hw = wd.ids.get("0:HW"), hn = wd.ids.get("0:HN");
  ok(bfs(railGraph(readRows(wd)), hw, hn) > STRETCH * bfs(wd.land, hw, hn), "(the fixture: the two hubs are joined the long way round, derived)");
  const c = plan(wd, [sid]);
  ok((c.railRows || []).filter((r) => r.loop).length === 1 && (c.railLoops || {}).laid === 1, "CONTROL: named without joinOnly (as Generate land names its states), the same state gets the loop", { rows: (c.railRows || []).map((r) => r.provinces), railLoops: c.railLoops });
  const j = plan(wd, [sid], { joinOnly: true });
  ok((j.railRows || []).length === 0 && (j.railLoops || {}).laid === 0 && (j.railLoops || {}).asked === 0, "⭐⭐ joinOnly: no railway, and no loop was even asked", { rows: (j.railRows || []).map((r) => r.provinces), railLoops: j.railLoops });
  const wj = make("join-write"), before = fs.readFileSync(path.join(wj.w.modRoot, "map", "railways.txt"), "utf8");
  const res = md.generateSupplyNetwork({ ...wj.w, stateIds: [sid], joinOnly: true });
  ok(fs.readFileSync(path.join(wj.w.modRoot, "map", "railways.txt"), "utf8") === before && !(res && res.changed), "⭐ …and written, railways.txt keeps its bytes", res);
}

console.log("\n-- the ledger: a loop's arrow may not cross one already drawn; a forest link is not held back by a crossing --");
{
  const at = { 1: { x: 10, row: 50 }, 2: { x: 90, row: 50 }, 3: { x: 50, row: 10 }, 4: { x: 50, row: 90 } };
  const ledger = md.railArrowLedger({ W: 1000, stationOf: (p) => at[p] || null });
  ledger.lay([1, 2]);
  ok(ledger.why([3, 4]) === "", "CONTROL: asked as before (a forest link), a crossing holds nothing back", ledger.why([3, 4]));
  ok(ledger.why([3, 4], { cross: true }) === "cross", "⭐ asked for a loop, the crossing arrow is named", ledger.why([3, 4], { cross: true }));
  ok(ledger.why([3, 1], { cross: true }) === "", "…and an arrow that only meets a station of the drawn one is no crossing", ledger.why([3, 1], { cross: true }));
}

console.log("\n-- the real write: the rows of the dry run, appended through the one writer, and what the page says --");
{
  const wd = world("ring-write", [{ c0: 1, states: FOUR, owner: "XXX", firstState: 1 }]);
  const dry = plan(wd, wd.served);
  const res = md.generateSupplyNetwork({ ...wd.w, stateIds: wd.served });
  const written = readRows(wd);
  ok(res.railways === (dry.railRows || []).length && written.length === res.railways, "the file holds every row the dry run planned", { written: written.length, res: res.railways, dry: (dry.railRows || []).length });
  ok(loopsOf(written) === 1, "⭐ …and the loop is in it", written.map((r) => r.provinces));
  ok(res.railLoops && res.railLoops.laid === 1, "the result reports the loop (railLoops)", res.railLoops);
  let note = () => "(public/map.js has no generatedSupplyNote)";
  try { note = require("vm").runInNewContext(require("./testlib-map-page.js").lift("function generatedSupplyNote(") + "\ngeneratedSupplyNote", {}); } catch (e) { ok(false, "public/map.js has a generatedSupplyNote(res) to lift", e.message); }
  const said = note({ supplyNetwork: res }), none = note({ supplyNetwork: { ...res, railLoops: { asked: 0, laid: 0, waited: {} } } });
  ok(new RegExp(`\\b${res.railways} railways joining them \\(${(res.railLoops || {}).laid} of them closing a loop`).test(said) && !/closing a loop/.test(none),
    "⭐ the page says how many of the railways close a loop — and says nothing of loops when none was laid", { said, none });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
