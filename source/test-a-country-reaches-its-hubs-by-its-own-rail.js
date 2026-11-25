// ⛔ #a-country-reaches-its-hubs-by-its-own-rail, #a-generated-capital-sits-on-its-rail — TRAINS NEED A CAPITAL ON THE RAIL
// AND RAIL OVER THE COUNTRY'S OWN LAND.
//
// The owner asked after TEST 30 about "train tracks when we build trains". The tracks were there: 783 railways, laid out the
// way the game expects. What was missing is what trains run between: supply leaves a country's CAPITAL by rail, and only 35
// of TEST 30's 832 hubs reached their own capital (vanilla 85%), because (1) a generated state had no victory point, so HOI4
// made the capital state's first province the capital, usually off the rail, and (2) the rail builder joined hubs by
// nearness alone, through other countries' land (20.9% of segments crossed a border, vanilla 3.9%) and across 7 borders an
// adjacency row calls impassable.
//
// Pinned on a small world of three countries' worth of states:
//   · a state's hub stands on its best victory point (else its largest land province);
//   · a country's hubs are joined by rail over its own land when its land allows it, even when a neighbour's is shorter;
//   · no railway crosses a border an adjacencies.csv row calls impassable — with a control proving the fixture uses it.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-own-rail-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
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

// 11 x 4 cells of 8 px; a cell is a province, id = row * 11 + col + 1. Row 3 and the edge columns are sea:
//   row0  ~  X3 X3 X3 X3 X3 X3 X3 X3 X3  ~     state 3 (country XXX): the long way round, along the top
//   row1  ~  X1 Y  Y  Y  Y  Y  Y  Y  X2  ~     state 1 (XXX) on the left, state 2 (XXX) on the right, state 4 (YYY) between
//   row2  ~  X1 Y  Y  Y  Y  Y  Y  Y  X2  ~
// ⚠ The sea columns are load-bearing: HOI4 maps wrap east–west and Nova's adjacency knows it, so without them the first and
// last land columns TOUCH across the seam, X1 and X2 are neighbours, and the owner check passes with no owner pass at all
// (it did — the back-out control caught it).
const COLS = 11, ROWS = 4, CELL = 8, W = COLS * CELL, H = ROWS * CELL, L = 1, R = COLS - 2;
const idAt = (c, r) => r * COLS + c + 1;
const kindAt = (c, r) => (r === 3 || c < L || c > R ? "sea" : r === 0 ? 3 : c === L ? 1 : c === R ? 2 : 4);
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
function world(tag, { impassable = false, vp = null } = {}) {
  const mod = path.join(ROOT, tag);
  write(mod, "descriptor.mod", 'name="own rail"\nreplace_path="history/states"\n');
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(idAt(Math.floor(x / CELL), Math.floor(y / CELL)))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const id = idAt(c, r), k = kindAt(c, r); rows.push(`${id};${colour(id).join(";")};${k === "sea" ? "sea;false;ocean;0" : "land;false;plains;1"}`); }
  write(mod, "map/definition.csv", rows.join("\n") + "\n");
  const states = { 1: [], 2: [], 3: [], 4: [] };
  for (let r = 0; r < 3; r++) for (let c = L; c <= R; c++) states[kindAt(c, r)].push(idAt(c, r));
  const owner = { 1: "XXX", 2: "XXX", 3: "XXX", 4: "YYY" };
  for (const [s, provs] of Object.entries(states)) {
    const vps = vp && vp[s] ? `\t\tvictory_points = { ${vp[s][0]} ${vp[s][1]} }\n` : "";
    write(mod, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=${owner[s]}\n${vps}\t}\n}\n`);
  }
  // the border between X1 and YYY is closed, on both rows — on the shortest route from X1's hub into YYY's land
  const adj = ["From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment"];
  if (impassable) adj.push(`${idAt(L, 1)};${idAt(L + 1, 1)};impassable;-1;-1;-1;-1;-1;;`, `${idAt(L, 2)};${idAt(L + 1, 2)};impassable;-1;-1;-1;-1;-1;;`);
  adj.push("-1;-1;-1;-1;-1;-1;-1;-1;-1");
  write(mod, "map/adjacencies.csv", adj.join("\n") + "\n");
  write(mod, "map/supply_nodes.txt", "");
  write(mod, "map/railways.txt", "");
  return { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
}
const plan = (w) => md.generateSupplyNetwork({ ...w, dryRun: true });
const ownerOfProv = (p) => { const c = (p - 1) % COLS, r = Math.floor((p - 1) / COLS); const k = kindAt(c, r); return k === 4 ? "YYY" : k === "sea" ? "" : "XXX"; };
// are two hubs joined by railways that stand only on XXX's land?
const joinedOverOwnLand = (rails, a, b) => {
  const g = new Map(), link = (u, v) => { if (!g.has(u)) g.set(u, new Set()); g.get(u).add(v); };
  for (const r of rails) for (let i = 1; i < r.provinces.length; i++) { const u = r.provinces[i - 1], v = r.provinces[i]; if (ownerOfProv(u) === "XXX" && ownerOfProv(v) === "XXX") { link(u, v); link(v, u); } }
  const seen = new Set([a]), q = [a];
  while (q.length) { const u = q.shift(); for (const v of (g.get(u) || [])) if (!seen.has(v)) { seen.add(v); q.push(v); } }
  return seen.has(b);
};

console.log("\n-- a state's hub stands on its best victory point --");
{
  const w = world("vp", { vp: { 1: [idAt(L, 2), 5], 2: [idAt(R, 2), 3] } });
  const p = plan(w);
  const hubs = new Set((p.newHubs || []).map((h) => h.province));
  ok(hubs.has(idAt(L, 2)) && hubs.has(idAt(R, 2)), "states 1 and 2 put their hubs on their victory points, not their first provinces", [...hubs]);
  const w2 = world("novp");
  const hubs2 = new Set((plan(w2).newHubs || []).map((h) => h.province));
  ok(hubs2.has(idAt(L, 1)) && hubs2.has(idAt(R, 1)), "CONTROL: without one, the largest land province (equal here, so the lowest id)", [...hubs2]);
}

console.log("\n-- ⭐ a country's hubs are joined over its own land --");
{
  const w = world("own");
  const p = plan(w);
  const hubs = (p.newHubs || []).map((h) => h.province);
  ok(hubs.length === 4, "every state gets a hub", hubs);
  ok(joinedOverOwnLand(p.railRows || [], idAt(L, 1), idAt(R, 1)), "⭐⭐ XXX's left and right hubs are joined by rail standing only on XXX's land", (p.railRows || []).map((r) => r.provinces));
  ok((p.railRows || []).every((r) => r.provinces.every((q) => ownerOfProv(q))), "…every railway stands on land");
}

console.log("\n-- ⭐ no railway crosses an impassable border --");
{
  const crosses = (rails) => rails.some((r) => r.provinces.some((q, i) => i > 0 && ((q === idAt(L + 1, 1) && r.provinces[i - 1] === idAt(L, 1)) || (q === idAt(L, 1) && r.provinces[i - 1] === idAt(L + 1, 1))
    || (q === idAt(L + 1, 2) && r.provinces[i - 1] === idAt(L, 2)) || (q === idAt(L, 2) && r.provinces[i - 1] === idAt(L + 1, 2)))));
  const open = plan(world("open"));
  ok(crosses(open.railRows || []), "CONTROL: with the border open, a railway runs across it (so the fixture uses it)", (open.railRows || []).map((r) => r.provinces));
  const shut = plan(world("shut", { impassable: true }));
  ok(!crosses(shut.railRows || []), "⭐⭐ with it impassable, none does", (shut.railRows || []).map((r) => r.provinces));
  const hubs = (shut.newHubs || []).map((h) => h.province);
  ok(hubs.length === 4 && (shut.railRows || []).length >= 3, "…and every hub is still on the network, the long way round", { hubs, rails: (shut.railRows || []).map((r) => r.provinces) });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
