// ⛔ #a-harbour-stands-on-its-coast-not-its-corner — A PORT AUTO-FIX ADDS STANDS ON ITS COAST NEAR ITS DEPOT, NOT ON THE CORNER WHERE
// ITS PROVINCE MEETS THE NEXT ONE.
//
// fixCoastalNoPort — the one writer of every naval_base_spawn row Nova adds — took the province's FIRST coast pixel in the raster, its
// northernmost, which is usually where its border meets the coast, and turned the model to the sea there. On the owner's flow (TEST 34,
// audit L8) 88% of its ports stood on that pixel and 17.7% of the turned models reached more than 5% onto another state's land; the base
// game stands 4.5% of its ports on that pixel and 5.2% of its models reach over. Its ports stand near their province's depot (p50 6 px),
// a little way along the coast from the fort (p50 4 px). The port now takes the coast pixel (not a river's) whose model, turned to its sea,
// holds 5% or less of another state's land, BUILDING_RING_NEAR px or more off the coast rows standing on the province, nearest its depot.
//
//   1. Over the installed base game (SKIPS without it): fewer than 10% of its ports stand on their province's first raster coast pixel,
//      and PORT_REACH is the reach of the models its ports are drawn with (PORT_MODEL_ENTITIES), as buildingModelReach reads them.
//   2. A fixture: a coastal province whose first raster coast pixel is the corner beside another state's land, its depot inland and its
//      fort on the coast nearest the depot. Auto-fix's port stands on the province's own coast, its column 7 the sea beside it, turned to
//      it; not on the corner; its model (this test's own sampler, every 0.1 px, counter-clockwise) holds 5% or less of the other state's
//      land — a CONTROL shows the corner's would hold more; 3 px or more off the fort; nearer the depot than the corner.
//   3. The other state's own port is left byte for byte, and the same click on a second copy writes the same bytes.
//   4. harbourSpot itself, with the depot beside the corner: the coast pixel nearest it would hold more than 5% of the neighbour's land
//      (a CONTROL), so the port goes on along the coast to one that holds 5% or less, still beside the depot; the same answer whatever
//      order the coast pixels come in.
//   5. harbourSpot on a short coast its own rows cover (every pixel within BUILDING_RING_NEAR px of one, the fort's nearest the depot):
//      the port stands a pixel beside the fort, not on its point — on the owner's flow 16.3% stood on it, the base game 4.2%.
//   6. A depot far from its province's middle, and a stray depot row of another state on the province listed first: the port stands
//      on the coast pixel nearest its own state's depot (the review of the wave found neither the depot nor the state check pinned).
//   7. The coast pixel nearest the depot holds a sliver of the neighbour's land, PORT_OVER_NEIGHBOUR or less, the next none: the port
//      stands by the depot — the share is a limit, not a ranking.
// Binds no port. Run: node test-a-harbour-stands-on-its-coast-not-its-corner.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-harbour-coast-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 500) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
const REACH = md.PORT_REACH || { west: 1.52, east: 1.52, south: 3.14, north: 1.02 };

// ── 1. the base game ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== 1. the base game ===");
const GAME = process.env.HOI4_ROOT || "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
if (!fs.existsSync(path.join(GAME, "map", "provinces.bmp")) || !fs.existsSync(path.join(GAME, "map", "buildings.txt"))) console.log("  SKIP: no Hearts of Iron IV install at " + GAME + " — section 1 did not run");
else {
  const buf = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
  const off = buf.readUInt32LE(10), GW = buf.readInt32LE(18), GH = buf.readInt32LE(22), rs = Math.floor((24 * GW + 31) / 32) * 4;
  const byColour = new Map(), type = new Map();
  for (const l of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 5 || !/^\d+$/.test(c[0]) || +c[0] === 0) continue;
    byColour.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0, +c[0]); type.set(+c[0], c[4].trim().toLowerCase());
  }
  const pidAt = (x, row) => { const o = off + (GH - 1 - row) * rs + (((x % GW) + GW) % GW) * 3; const id = byColour.get(((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]) >>> 0); return id == null ? -1 : id; };
  const first = new Map();
  for (let row = 0; row < GH; row++) for (let x = 0; x < GW; x++) {
    const p = pidAt(x, row);
    if (first.has(p) || type.get(p) !== "land") continue;
    if ([pidAt(x + 1, row), pidAt(x - 1, row), row > 0 ? pidAt(x, row - 1) : -1, row < GH - 1 ? pidAt(x, row + 1) : -1].some((q) => type.get(q) === "sea")) first.set(p, [x, row]);
  }
  let n = 0, onFirst = 0;
  for (const l of fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "latin1").split(/\r?\n/)) {
    const c = l.split(";");
    if (c.length < 7 || c[1] !== "naval_base_spawn") continue;
    const x = Math.floor(+c[2]), row = GH - 1 - Math.floor(+c[4]), f = first.get(pidAt(x, row));
    n++;
    if (f && f[0] === x && f[1] === row) onFirst++;
  }
  ok(n > 1000 && onFirst / n < 0.10, `the base game stands ${onFirst} of its ${n} ports (${(100 * onFirst / n).toFixed(1)}%) on their province's first raster coast pixel — under 10%`, { n, onFirst });
  const read = md.buildingModelReach ? md.buildingModelReach({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [], entities: md.PORT_MODEL_ENTITIES || [], fallback: null }) : null;
  ok(Array.isArray(md.PORT_MODEL_ENTITIES) && md.PORT_MODEL_ENTITIES.length > 0 && !!read && JSON.stringify(read) === JSON.stringify(md.PORT_REACH),
    "PORT_REACH is the reach of the harbour's models off the installed game (buildingModelReach over PORT_MODEL_ENTITIES)", { read, table: md.PORT_REACH });
}

// ── the fixture: rectangles [x0, y0, x1, y1) on a sea (province 1), rows top-down ──────────────────────────────────────────────────
const W = 48, H = 32, SEA = 1;
const RECT = {
  3: [4, 6, 12, 16],    // state 2 (BBB): the neighbour, west of the coast, with its own port
  2: [12, 6, 32, 16],   // state 1 (AAA): no port yet; its first raster coast pixel is (12, 6), beside state 2's land
};
const STATES = { 1: [2], 2: [3] }, OWNER = { 1: "AAA", 2: "BBB" };
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const stateOf = (p) => { for (const [s, L] of Object.entries(STATES)) if (L.includes(p)) return +s; return null; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const DEPOT = { px: 22, row: 11 }, FORT = { px: 22, row: 6 }, CORNER = { px: 12, row: 6 };
const zOf = (row) => H - 1 - row;
const NEIGHBOURS_PORT = `2;naval_base_spawn;6.00;9.50;${zOf(6)}.00;3.14;${SEA}`;
const ROWS = [`1;supply_node;${DEPOT.px}.00;10.00;${zOf(DEPOT.row)}.00;1.00;0`, `1;coastal_bunker;${FORT.px}.00;9.50;${zOf(FORT.row)}.00;3.14;0`, NEIGHBOURS_PORT];
function makeMod(dir) {
  write(dir, "descriptor.mod", 'name="harbour-coast"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(dir, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
    .concat(Object.keys(RECT).map((id) => `${id};${colour(+id).join(";")};land;true;plains;1`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(STATES)) write(dir, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${OWNER[s]}\n\t}\n}\n`);
  write(dir, "map/buildings.txt", ROWS.join("\n") + "\n");
}
const ports = (dir) => fs.readFileSync(path.join(dir, "map", "buildings.txt"), "utf8").split(/\r?\n/).filter((l) => l.split(";")[1] === "naval_base_spawn")
  .map((l) => { const c = l.split(";"); return { line: l, sid: +c[0], x: +c[2], z: +c[4], rot: +c[5], rotText: c[5], sea: +c[6], px: Math.floor(+c[2]), row: H - 1 - Math.floor(+c[4]) }; });
const seaAt = (x, row) => row >= 0 && row < H && provAt(((x % W) + W) % W, row) === SEA;
const isCoast = (px, row) => provAt(px, row) !== SEA && (seaAt(px + 1, row) || seaAt(px - 1, row) || seaAt(px, row - 1) || seaAt(px, row + 1));
/** this test's own sampler: the share of the model at (x, z) turned `a` counter-clockwise (x east, z north) on land of a state not `sid` */
const otherLand = (x, z, a, sid) => {
  const cs = Math.cos(a), sn = Math.sin(a), st = 0.1;
  let n = 0, k = 0;
  for (let u = -REACH.west + st / 2; u < REACH.east; u += st) for (let v = -REACH.south + st / 2; v < REACH.north; v += st) {
    const X = x + u * cs - v * sn, Z = z + u * sn + v * cs, row = H - 1 - Math.floor(Z), col = ((Math.floor(X) % W) + W) % W;
    n++;
    const p = row >= 0 && row < H ? provAt(col, row) : SEA;
    if (p !== SEA && stateOf(p) !== sid) k++;
  }
  return k / n;
};
const ex = { W, H, pidAt: (x, row) => provAt(x, row) }, typeOf = (id) => (id === SEA ? "sea" : "land");
const cheb = (a, b) => Math.max(Math.abs(a.px - b.px), Math.abs(a.row - b.row));

console.log("\n=== 2. the port stands on its coast near its depot, not on the corner ===");
const modA = path.join(ROOT, "a"), modB = path.join(ROOT, "b");
makeMod(modA); makeMod(modB);
const rootsA = { modRoot: modA, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
{
  // the fixture
  const cornerRot = md.coastFacing(ex, typeOf, CORNER.px, zOf(CORNER.row)) || 0;
  ok(isCoast(CORNER.px, CORNER.row) && provAt(CORNER.px - 1, CORNER.row) === 3 && otherLand(CORNER.px, zOf(CORNER.row), cornerRot, 1) > 0.05,
    "CONTROL: the province's first raster coast pixel is the corner beside state 2's land, and a port there, turned to its sea, holds more than 5% of that land", { share: otherLand(CORNER.px, zOf(CORNER.row), cornerRot, 1) });
  const dry = md.fixCoastalNoPort({ ...rootsA, dryRun: true });
  ok(dry && JSON.stringify(dry.targets) === "[2]", "(the rule names province 2 and not state 2's, which has its own port)", dry);
}
const r = md.fixCoastalNoPort(rootsA);
const all = ports(modA), mine = all.filter((p) => p.sid === 1);
ok(r && r.added === 1 && mine.length === 1, "Auto-fix adds one port to province 2", { r, ports: all.map((p) => p.line) });
const p = mine[0] || { px: -1, row: -1, x: -1, z: -1, rot: 0 };
ok(provAt(p.px, p.row) === 2 && isCoast(p.px, p.row) && p.sea === SEA && [[1, 0], [-1, 0], [0, -1], [0, 1]].some(([dx, dy]) => seaAt(p.px + dx, p.row + dy)),
  "the port stands on province 2's own coast pixel, its column 7 the sea beside it", p.line);
ok(p.rotText === (md.coastFacing(ex, typeOf, p.x, p.z) || 0).toFixed(2), "…turned to its sea (coastFacing)", { line: p.line, want: md.coastFacing(ex, typeOf, p.x, p.z) });
ok(!(p.px === CORNER.px && p.row === CORNER.row), "⭐⭐ not on the corner, the province's first raster coast pixel", p.line);
ok(otherLand(p.x, p.z, p.rot, 1) <= 0.05, "⭐⭐ its model holds 5% or less of another state's land", { share: otherLand(p.x, p.z, p.rot, 1), line: p.line });
ok(cheb(p, FORT) >= 3, "⭐ it stands 3 px or more off the province's fort", { line: p.line, fort: FORT });
ok(cheb(p, DEPOT) < cheb(CORNER, DEPOT), "⭐ …and nearer the depot than the corner is", { port: cheb(p, DEPOT), corner: cheb(CORNER, DEPOT) });

console.log("\n=== 3. the neighbour's own port stays as it is; the same click writes the same bytes ===");
{
  const lines = fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8").split(/\r?\n/);
  ok(lines[2] === NEIGHBOURS_PORT && ROWS.every((l, i) => lines[i] === l), "⭐⭐ state 2's own port and every row the file had, byte for byte, where they stood", lines.slice(0, 4));
  const r2 = md.fixCoastalNoPort({ modRoot: modB, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] });
  ok(r2 && r2.added === 1 && fs.readFileSync(path.join(modB, "map", "buildings.txt"), "utf8") === fs.readFileSync(path.join(modA, "map", "buildings.txt"), "utf8"),
    "⭐⭐ the same click on a second copy writes the same bytes", r2);
}

console.log("\n=== 4. a depot beside the corner: the coast pixel nearest it would reach over the neighbour, so the port goes on along the coast ===");
{
  const coast = [];
  for (let row = 0; row < H; row++) for (let x = 0; x < W; x++) {
    if (provAt(x, row) !== 2) continue;
    const seas = [[1, 0], [-1, 0], [0, -1], [0, 1]].filter(([dx, dy]) => seaAt(x + dx, row + dy)).map(([dx, dy]) => [dx, dy, SEA]);
    if (seas.length) coast.push({ x, row, seas });
  }
  const near = { x: 13, row: 9 };
  const nearest = coast.slice().sort((a, b) => ((a.x - near.x) ** 2 + (a.row - near.row) ** 2) - ((b.x - near.x) ** 2 + (b.row - near.row) ** 2) || a.row - b.row || a.x - b.x)[0];
  const nRot = md.coastFacing(ex, typeOf, nearest.x, zOf(nearest.row)) || 0;
  ok(otherLand(nearest.x, zOf(nearest.row), nRot, 1) > 0.05, "CONTROL: a port on the coast pixel nearest that depot, turned to its sea, holds more than 5% of state 2's land",
    { nearest, share: otherLand(nearest.x, zOf(nearest.row), nRot, 1) });
  const s = md.harbourSpot ? md.harbourSpot({ ex, typeOf, stateOf, sid: 1, coast, near, rows: [], reach: REACH }) : null;
  ok(!!s && provAt(s.x, s.row) === 2 && isCoast(s.x, s.row), "harbourSpot picks one of province 2's own coast pixels", s);
  ok(!!s && otherLand(s.x, zOf(s.row), s.rot == null ? 0 : s.rot, 1) <= 0.05, "⭐⭐ …whose model, turned to its sea, holds 5% or less of state 2's land",
    { s, share: s ? otherLand(s.x, zOf(s.row), s.rot == null ? 0 : s.rot, 1) : null });
  ok(!!s && Math.hypot(s.x - near.x, s.row - near.row) <= Math.hypot(nearest.x - near.x, nearest.row - near.row) + 2, "…and still beside the depot (within 2 px of the nearest pixel's distance)", s);
  const again = md.harbourSpot ? md.harbourSpot({ ex, typeOf, stateOf, sid: 1, coast: coast.slice().reverse(), near, rows: [], reach: REACH }) : null;
  ok(JSON.stringify(again) === JSON.stringify(s), "⭐ the same answer whatever order the coast pixels come in", { s, again });
}

console.log("\n=== 5. a short coast its own rows cover: the port stands beside the fort, not on its pixel ===");
{
  // a 7 x 8 province 2 of state 1 under a sea (province 1) on a 20 x 12 map, rows top-down: its coast is row 4, x 6..12, and its fort
  // (x 7) and supply hub (x 11) leave no coast pixel 3 px clear of both; its depot stands below the fort
  const SW = 20, SH = 12, SEA5 = 1;
  const prov5 = (x, row) => (row >= 4 && x >= 6 && x <= 12 ? 2 : SEA5);
  const ex5 = { W: SW, H: SH, pidAt: (x, row) => prov5(x, row) }, type5 = (id) => (id === SEA5 ? "sea" : "land"), state5 = (p) => (p === 2 ? 1 : null);
  const coast5 = [];
  for (let x = 6; x <= 12; x++) coast5.push({ x, row: 4, seas: [[0, -1, SEA5]] });
  const rows5 = [{ x: 7, row: 4 }, { x: 11, row: 4 }];
  const gap5 = (s) => Math.min(...rows5.map((q) => Math.max(Math.abs(q.x - s.x), Math.abs(q.row - s.row))));
  ok(coast5.every((c) => gap5(c) < md.BUILDING_RING_NEAR), "(the fixture: every coast pixel is within BUILDING_RING_NEAR px of one of the province's coast rows)", coast5.map(gap5));
  const near5 = { x: 7, row: 8 };
  const s5 = md.harbourSpot({ ex: ex5, typeOf: type5, stateOf: state5, sid: 1, coast: coast5, near: near5, rows: rows5, reach: REACH });
  ok(!!s5 && gap5(s5) >= 1, "⭐⭐ the port does not stand on a coast row's pixel where the coast has another (the fort's is the one nearest the depot)", s5);
  ok(!!s5 && gap5(s5) === 1 && Math.abs(s5.x - near5.x) === 1, "…but a pixel beside it, as near the depot as that allows", s5);
}

console.log("\n=== 6. a depot far from its province's middle: the port stands by the depot, its own state's, not by the middle ===");
{
  // province 2 (state 1) alone on a sea; its depot by its east end, and a stray depot row of state 2 standing on its west end, listed
  // first — the port is drawn to its OWN state's depot, the one on its province (review of the wave, F5: neither was pinned)
  const SW = 40, SH = 20, SEA6 = 1;
  const prov6 = (x, y) => (x >= 6 && x <= 33 && y >= 5 && y <= 14 ? 2 : SEA6);
  const z6 = (row) => SH - 1 - row;
  const mod6 = path.join(ROOT, "f");
  write(mod6, "descriptor.mod", 'name="harbour-depot"\nreplace_path="history/states"\nreplace_path="map"\n');
  write(mod6, "map/provinces.bmp", bmp24(SW, SH, (x, y) => colour(prov6(x, y))));
  write(mod6, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;true;plains;1`].join("\n") + "\n");
  write(mod6, "history/states/1-S.txt", "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
  const MINE = { x: 30, row: 9 }, STRAY = { x: 9, row: 9 };
  write(mod6, "map/buildings.txt", [`2;supply_node;${STRAY.x}.00;10.00;${z6(STRAY.row)}.00;0.00;0`, `1;supply_node;${MINE.x}.00;10.00;${z6(MINE.row)}.00;0.00;0`].join("\n") + "\n");
  const coast6 = [];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (prov6(x, y) === 2 && [[1, 0], [-1, 0], [0, -1], [0, 1]].some(([dx, dy]) => prov6(x + dx, y + dy) === SEA6)) coast6.push({ x, row: y });
  const nearestTo = (t) => coast6.slice().sort((a, b) => ((a.x - t.x) ** 2 + (a.row - t.row) ** 2) - ((b.x - t.x) ** 2 + (b.row - t.row) ** 2) || a.row - b.row || a.x - b.x)[0];
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) if (prov6(x, y) === 2) { sx += x; sy += y; n++; }
  const byDepot = nearestTo(MINE), byMiddle = nearestTo({ x: sx / n, row: sy / n }), byStray = nearestTo(STRAY);
  ok(Math.hypot(byDepot.x - byMiddle.x, byDepot.row - byMiddle.row) > 6 && Math.hypot(byDepot.x - byStray.x, byDepot.row - byStray.row) > 6,
    "CONTROL: the coast pixel nearest its depot stands far from the ones nearest its middle and nearest the stray row", { byDepot, byMiddle, byStray });
  const r6 = md.fixCoastalNoPort({ modRoot: mod6, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] });
  const q = ports(mod6).map((p6) => ({ ...p6, row: SH - 1 - Math.floor(p6.z) })).find((p6) => p6.sid === 1);
  ok(r6 && r6.added === 1 && !!q && q.px === byDepot.x && q.row === byDepot.row, "⭐⭐ the port stands on the coast pixel nearest its own state's depot", { r6, q: q && [q.px, q.row], byDepot });
}

console.log("\n=== 7. a pixel holding a little of the neighbour's land, 5% or less, still wins by the depot ===");
{
  // province 2 (state 1) x 12..31, rows 6..15 under a sea; province 3 (state 2) west of it from row 7 down. The coast pixel nearest the
  // depot, (13, 6), holds a sliver of province 3 under its turned model — more than none, PORT_OVER_NEIGHBOUR or less — and the next
  // one east holds none. The share is a limit, not a ranking: the port stands by the depot (review of the wave, F5)
  const SW = 40, SH = 24, SEA7 = 1;
  const prov7 = (x, y) => (y >= 6 && y <= 15 && x >= 12 && x <= 31 ? 2 : y >= 7 && y <= 15 && x >= 4 && x <= 11 ? 3 : SEA7);
  const z7 = (row) => SH - 1 - row;
  const ex7 = { W: SW, H: SH, pidAt: (x, row) => prov7(((x % SW) + SW) % SW, row) }, type7 = (id) => (id === SEA7 ? "sea" : "land"), state7 = (q) => (q === 2 ? 1 : q === 3 ? 2 : null);
  const coast7 = [];
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    if (prov7(x, y) !== 2) continue;
    const seas = [[1, 0], [-1, 0], [0, -1], [0, 1]].filter(([dx, dy]) => prov7(x + dx, y + dy) === SEA7).map(([dx, dy]) => [dx, dy, SEA7]);
    if (seas.length) coast7.push({ x, row: y, seas });
  }
  const share7 = (x, row) => {
    const a = md.coastFacing(ex7, type7, x, z7(row)) || 0, cs = Math.cos(a), sn = Math.sin(a), st = 0.1;
    let k = 0, m = 0;
    for (let u = -REACH.west + st / 2; u < REACH.east; u += st) for (let v = -REACH.south + st / 2; v < REACH.north; v += st) {
      const X = x + u * cs - v * sn, Z = z7(row) + u * sn + v * cs, rr = SH - 1 - Math.floor(Z);
      m++;
      if (rr >= 0 && rr < SH && prov7(((Math.floor(X) % SW) + SW) % SW, rr) === 3) k++;
    }
    return k / m;
  };
  const near7 = { x: 13, row: 10 };
  const first = coast7.slice().sort((a, b) => ((a.x - near7.x) ** 2 + (a.row - near7.row) ** 2) - ((b.x - near7.x) ** 2 + (b.row - near7.row) ** 2) || a.row - b.row || a.x - b.x)[0];
  ok(first.x === 13 && first.row === 6 && share7(13, 6) > 0 && share7(13, 6) <= 0.05 && share7(14, 6) === 0,
    "CONTROL: the coast pixel nearest the depot holds more than none and 5% or less of state 2's land; the next one east none", { first, here: share7(13, 6), next: share7(14, 6) });
  const s7 = md.harbourSpot({ ex: ex7, typeOf: type7, stateOf: state7, sid: 1, coast: coast7, near: near7, rows: [], reach: REACH });
  ok(!!s7 && s7.x === 13 && s7.row === 6, "⭐ the port stands on it", s7);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
