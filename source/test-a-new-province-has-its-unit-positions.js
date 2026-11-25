// ⛔ #a-new-province-has-its-unit-positions — EVERY PROVINCE GENERATE LAND CUT GETS THE PLACES ITS UNITS ARE DRAWN, LAID OUT AS THE
// MAP BELOW LAYS OUT ITS OWN LAND, BEFORE THE NETWORK IS PLANNED ON THEM.
//
// The cut (#a-raised-province-is-cut-to-land-size) makes new ids, and map/unitstacks.txt had no row for one: on the owner's flow 6,813
// land provinces with nowhere for a division to stand, a station or a star to be drawn — the supply planner's stationOf answered null
// for each — while the cut parents' rows spilt over the pieces cut off them (land rows on their own province 73.1%, the base game
// 97.05%), and the 1,475 raised provinces kept every slot but 0 and 38 at the sea's offset. The ONE layout writer (layOutUnitPositions,
// asked by unitPositionsNeverLaidOut) now lays out, by the record of what Nova cut (readProvinceSplitRecord):
//   new   a recorded land province with no row — every slot of the layer below's land template added;
//   cut   a recorded land province with a row (but 20) off it that is still the layer below's — every row laid out again, but one
//         on the province the modder placed (named for ANY row off it, a modder's nudge across a border re-laid their whole province);
//   sea   land that was sea below, in the mod's own state, a row still the layer below's — its sea rows laid out as land;
//   port  one of those, laid out, with a harbour and no ship slot — 19 on the harbour, 20 beside it as the layer below puts its own;
//         and land with no coast below raised back whole, every row still the layer below's inland layout, with a harbour now
//         (412 of the owner's flow's 1,088 harbours had no ship slot); a harbour with a 19 and no 20 gets the 20 alone.
// Type 0 on the province's one supply_node row (else its town point), the star at the layer below's victory point offset, every other
// slot at the template's median offset stepped back by quarters onto the province, turned as the template turns it, the last column
// the province's own size's, sea-only slots dropped. A row-less province the record does not name gets NOTHING (vanilla ships 7).
//
// Part A: the finder, the writer and the rule on a hand-built world whose every expected place is derived here from the fixture's own
// files (the rule, written again). Part B: Generate land on testlib-split-world.js's world over a layer below with full unit rows — the
// rows are there for every piece when the network is written. Binds no port.
// Run: node test-a-new-province-has-its-unit-positions.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-new-province-rows-"));
// BEFORE map-data.js loads: app data, ~/.nova (the split record lives there) and the mods root are this test's
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");
const PAGE = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
const ok = (cond, label, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!cond) fails.push(label);
};
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");
const write = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const r2 = (v) => Math.round(v * 100) / 100;
const lowerMedian = (v) => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor((s.length - 1) / 2)]; };
const near = (a, b) => !!a && !!b && Math.abs(a.x - b.x) < 0.005 && Math.abs(a.z - b.z) < 0.005;
function bmp8(w, h, fn) {
  const rs = Math.floor((8 * w + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * h);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * h, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) b[off + (h - 1 - y) * rs + x] = fn(x, y);
  return b;
}
/** map/unitstacks.txt rows → Map(province → [{ type, x, y, z, rot, last, line }]) in file order */
const readStacks = (file) => {
  const by = new Map();
  for (const raw of fs.readFileSync(file, "latin1").split("\n")) {
    const c = raw.replace(/\r$/, "").split(";");
    if (c.length < 7 || !/^\d+$/.test(c[0].trim())) continue;
    const p = +c[0];
    if (!by.has(p)) by.set(p, []);
    by.get(p).push({ type: +c[1], x: +c[2], y: c[3].trim(), z: +c[4], rot: c[5].trim(), last: c[6].trim(), line: raw.replace(/\r$/, "") });
  }
  return by;
};

// ══ PART A — the world ═══════════════════════════════════════════════════════════════════════════════════════════════════════
//   GRID (10–29)  land below and in the mod: 5 x 4 provinces of 16 x 12, the ring of 14 on the coast, 6 inland. Their rows are the
//                 layer below's LAND layout, what the template is learnt from; three carry a victory point below.
//   X (30)        land below (its own land layout), raised again in the mod and CUT: X keeps a C round X1, X2 is its east end.
//   X1 (33)       a piece, 6 px wide and inland, walled in by X — the cut parent's rows stand on it, and a full offset leaves it.
//   X2 (34)       a piece on the coast, with no supply_node row: its Standstill goes to its town point.
//   R (31)        SEA below, raised whole: still the sea's rows, sea-only slots and all.
//   Z (32)        SEA below, raised, in the mod's own state — and with NO row at all, and never recorded: it is given nothing.
//   10            a grid province whose rows the mod's file lacks, as seven of vanilla's do: given nothing either.
const W = 128, H = 80, SEA = 1, X = 30, R = 31, Z = 32, X1 = 33, X2 = 34, BARE = 10;
const zOf = (y) => H - 1 - y;                    // pixelYToBuildingZ
const rowOfZ = (z) => H - 1 - Math.floor(z);     // buildingZToPixelY
const GRID = [];
for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) GRID.push({ id: 10 + 5 * r + c, x0: 8 + 16 * c, y0: 8 + 12 * r, w: 16, h: 12, coastal: r === 0 || r === 3 || c === 0 || c === 4 });
const inBox = (x, y, b) => x >= b.x0 && x < b.x0 + b.w && y >= b.y0 && y < b.y0 + b.h;
const BOX = { [X]: { x0: 8, y0: 60, w: 48, h: 16 }, [R]: { x0: 92, y0: 8, w: 32, h: 32 }, [Z]: { x0: 92, y0: 44, w: 32, h: 16 } };
const X1_BOX = { x0: 29, y0: 64, w: 6, h: 8 }, X2_BOX = { x0: 44, y0: 60, w: 12, h: 16 };
const belowAt = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return -1; for (const g of GRID) if (inBox(x, y, g)) return g.id; for (const id of [X, R, Z]) if (inBox(x, y, BOX[id])) return id; return SEA; };
const nowAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : inBox(x, y, X1_BOX) ? X1 : inBox(x, y, X2_BOX) ? X2 : belowAt(x, y));
const provOfRow = (p, at = nowAt) => at(Math.floor(p.x), rowOfZ(p.z));
const colour = (id) => [id, 255 - id, (id * 37) % 256];
const bmp24 = (at) => SW.bmp24(W, H, (x, y) => { const [r, g, b] = colour(at(x, y)); return (r << 16) | (g << 8) | b; });
const LAND_BELOW = GRID.map((g) => g.id).concat([X]);
const heightBelow = (x, y) => (LAND_BELOW.includes(belowAt(x, y)) ? 100 + ((x + y) % 12) : 89);
const heightNow = (x, y) => ([X, X1, X2, R, Z].includes(nowAt(x, y)) ? 104 + Math.floor(x / 8) : heightBelow(x, y));
const yAt = (p) => md.modelYForHeight(heightNow(Math.floor(p.x), rowOfZ(p.z))).toFixed(2);
const pixelsOf = (pid, at) => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === pid) out.push({ x, y }); return out; };

// the layer below's rows. A LAND province: its Standstill in its middle, the rest at offsets a little different province to
// province (so a median is a choice); the ring's ship slots 19 and 20 on its edge, 20 the same distance and angle from 19 every
// time. A SEA province: the sea's layout, a fleet's length across.
const INLAND = { 0: [0, 0, 0], 1: [-0.5, -3.5, -0.16], 2: [1, -2.5, 0.41], 9: [-3.25, 0, 1.57], 10: [3.25, 0, -1.57], 21: [-3, 0, 0], 22: [-0.5, -3.5, -0.16], 23: [1, -2.5, 0.41], 38: [-2.88, 0, 1.57] };
const COASTAL = { 0: [0, 0, 0], 1: [-0.5, -2.5, 0], 9: [-2.88, 0, 1.57], 10: [2.88, 0, -1.57], 21: [-3, 0, 0], 38: [-2.36, 0, 1.57] };
const SEA_LAYOUT = { 0: [0, 0], 1: [-4, -4], 2: [4, -4], 9: [-8, 0], 10: [8, 0], 11: [-4, 4], 12: [4, 4], 21: [-6, 0], 22: [0, -6], 23: [6, 0], 30: [0, 6], 31: [-6, -6], 38: [-8, 0] };
const SEA_ONLY = new Set([11, 12, 30, 31]);
const SHIP_D = 1.75, SHIP_TURN = -Math.PI / 2;
const middleOf = (b) => ({ x: b.x0 + b.w / 2, z: zOf(b.y0 + Math.floor(b.h / 2)) + 0.5 });
const fmt = (pid, t, p, y, rot, last) => `${pid};${t};${p.x.toFixed(2)};${y};${p.z.toFixed(2)};${Number(rot).toFixed(2)};${last}`;
function rowsBelow() {
  const out = [];
  const land = (pid, b, coastal) => {
    const t0 = middleOf(b), jit = ((pid % 3) - 1) * 0.25, area = b.w * b.h, last = (Math.round(0.0229 * Math.sqrt(area) * 50) / 50 + (pid % 2) * 0.02).toFixed(2);
    const tpl = coastal ? COASTAL : INLAND;
    for (const [t, [dx, dz, rot]] of Object.entries(tpl)) {
      const p = { x: t0.x + dx + (t === "1" || t === "9" ? jit : 0), z: t0.z + dz };
      out.push(fmt(pid, t, p, md.modelYForHeight(heightBelow(Math.floor(p.x), rowOfZ(p.z))).toFixed(2), rot + (t === "1" ? jit : 0), last));
    }
    if (coastal && pid !== X) {
      // 19 on the edge pixel nearest the sea's side, turned a little differently each time; 20 beside it
      const p19 = { x: b.x0 + 1.5, z: zOf(b.y0 + 1) + 0.5 }, rot = 0.8 + (pid % 5) * 0.1;
      const p20 = { x: p19.x + SHIP_D * Math.cos(rot + SHIP_TURN), z: p19.z + SHIP_D * Math.sin(rot + SHIP_TURN) };
      out.push(fmt(pid, 19, p19, "9.50", rot, last), fmt(pid, 20, p20, "9.50", rot, last));
    }
    if (coastal && [11, 13, 25].includes(pid)) out.push(fmt(pid, 2, { x: t0.x + 1, z: t0.z - 1.5 }, "11.00", 0.58, last));   // 3 of 15: not the template's
    if (!coastal && pid === 17) out.push(fmt(pid, 7, { x: t0.x + 0.5, z: t0.z + 4 }, "11.00", 3.02, last));                 // 1 of 6: not the template's
  };
  for (const g of GRID) land(g.id, g, g.coastal);
  land(X, BOX[X], true);
  for (const [pid, b] of [[SEA, { x0: 0, y0: 0, w: 8, h: 8 }], [R, BOX[R]], [Z, BOX[Z]]]) {
    const t0 = middleOf(b);
    for (const [t, [dx, dz]] of Object.entries(SEA_LAYOUT)) out.push(fmt(pid, t, { x: t0.x + dx, z: t0.z + dz }, "9.50", 0, "1.00"));
  }
  return out;
}
const STACKS_BELOW = rowsBelow();
const VPS_BELOW = [[11, 5], [17, 3], [18, 1]];
const stateTxt = (id, provs, vps, owner = "AAA") => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=10000\n\tstate_category=rural\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=${owner}\n`
  + vps.map(([p, v]) => `\t\tvictory_points = { ${p} ${v} }\n`).join("") + "\t}\n}\n";
const region = (id, provs, sea) => `strategic_region={\n\tid=${id}\n\tname="REGION_${id}"\n\tprovinces={ ${provs.join(" ")} }\n${sea ? "\tnaval_terrain = water_deep_ocean\n" : ""}\tweather={}\n}\n`;
const defLine = (id, type, coastal) => `${id};${colour(id).join(";")};${type};${coastal};${type === "land" ? "plains" : "ocean"};${type === "land" ? 1 : 0}`;

const game = path.join(ROOT, "game");
write(game, "hoi4.exe", "");
write(game, "map/provinces.bmp", bmp24(belowAt));
write(game, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", defLine(SEA, "sea", false), ...GRID.map((g) => defLine(g.id, "land", g.coastal)), defLine(X, "land", true), defLine(R, "sea", false), defLine(Z, "sea", false)].join("\n") + "\n");
write(game, "map/heightmap.bmp", bmp8(W, H, heightBelow));
write(game, "map/unitstacks.txt", STACKS_BELOW.join("\n") + "\n");
write(game, "map/buildings.txt", "");
write(game, "map/default.map", 'definitions = "definition.csv"\nprovinces = "provinces.bmp"\n');
write(game, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
write(game, "map/continent.txt", "continents = {\n\tfixture\n}\n");
write(game, "map/supply_nodes.txt", "");
write(game, "map/railways.txt", "");
write(game, "map/strategicregions/1-Land.txt", region(1, LAND_BELOW, false));
write(game, "map/strategicregions/2-Sea.txt", region(2, [SEA, R, Z], true));
write(game, "history/states/1-Grid.txt", stateTxt(1, GRID.map((g) => g.id), VPS_BELOW));
write(game, "history/states/2-X.txt", stateTxt(2, [X], []));
write(game, "history/countries/AAA - A.txt", "capital = 1\n");

// the mod: Delete map, Generate land and the cut have been, Auto-fix's unit-stack repair took the layer below's rows in (sea-only
// slots on R left, to be the layout's to drop), and the record names X's two pieces
const RAISED = [X, X1, X2, R, Z];
const HUB = { [X]: { x: 14.5, z: zOf(68) + 0.5 }, [X1]: { x: 31.5, z: zOf(67) + 0.5 }, [R]: { x: 100.5, z: zOf(20) + 0.5 }, [Z]: { x: 100.5, z: zOf(52) + 0.5 } };
const PORT = { [X]: { x: 8.3, z: zOf(66) + 0.5, rot: 2.0 }, [X2]: { x: 55.2, z: zOf(70) + 0.5, rot: 0.3 }, [R]: { x: 123.4, z: zOf(20) + 0.5, rot: 1.2 }, [Z]: { x: 100.5, z: zOf(59) + 0.5, rot: 1.6 } };
// INLAND (21): a grid province with no coast below (its coastal column false), raised back whole by a world whose new sea now meets it
const INLAND_PORT = 21, INLAND_HARBOUR = { x: 24.6, z: zOf(37) + 0.5, rot: 2.5 };
const buildingRows = (ports, inland) => [...Object.entries(HUB).map(([p, h]) => `2;supply_node;${h.x.toFixed(2)};11.00;${h.z.toFixed(2)};0.00;0`),
  ...(ports ? Object.entries(PORT).map(([p, h]) => `2;naval_base_spawn;${h.x.toFixed(2)};9.50;${h.z.toFixed(2)};${h.rot.toFixed(2)};${SEA}`) : []),
  ...(inland ? [`1;naval_base_spawn;${INLAND_HARBOUR.x.toFixed(2)};9.50;${INLAND_HARBOUR.z.toFixed(2)};${INLAND_HARBOUR.rot.toFixed(2)};${SEA}`] : [])];
const RECORD = { version: 1, definitionMaxBefore: Z, families: [{ parent: X, pieces: [X1, X2] }] };
/** o.ports: harbours on X, X2, R and Z; o.inlandPort: one on INLAND too; o.over: "pid;type" → { x, z } — rows the modder moved;
 *  o.bare: its unitstacks.txt ends without a line ending; o.record: the record to write (RECORD, left out; false, none);
 *  o.vps: the grid state's victory points in the mod (VPS_BELOW, left out) */
function makeMod(name, o = {}) {
  const m = path.join(process.env.HOI4_MODS_ROOT, name);
  write(m, "descriptor.mod", `name="${name}"\nsupported_version="1.19.*"\n`);
  write(m, "map/provinces.bmp", bmp24(nowAt));
  write(m, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", defLine(SEA, "sea", false), ...GRID.map((g) => defLine(g.id, "land", g.coastal)),
    ...RAISED.map((id) => defLine(id, "land", id !== X1))].join("\n") + "\n");
  write(m, "map/heightmap.bmp", bmp8(W, H, heightNow));
  write(m, "map/buildings.txt", buildingRows(!!o.ports, !!o.inlandPort).join("\n") + "\n");
  write(m, "map/strategicregions/1-Land.txt", region(1, LAND_BELOW.concat([R, Z, X1, X2]), false));
  write(m, "map/strategicregions/2-Sea.txt", region(2, [SEA], true));
  write(m, "history/states/1-Grid.txt", stateTxt(1, GRID.map((g) => g.id), o.vps || VPS_BELOW));
  write(m, "history/states/2-X.txt", stateTxt(2, RAISED, []));
  // its own unitstacks.txt, CRLF, a copy of the layer below's less Z's rows and the bare grid province's (o.zRows: Z's, as a
  // modder laid it out)
  const rows = STACKS_BELOW.filter((l) => { const p = +l.split(";")[0]; return p !== Z && p !== BARE; }).concat(o.zRows || [])
    .map((l) => { const c = l.split(";"), to = (o.over || {})[`${c[0]};${c[1]}`]; if (to) { c[2] = to.x.toFixed(2); c[4] = to.z.toFixed(2); } return c.join(";"); });
  write(m, "map/unitstacks.txt", Buffer.from(rows.join("\r\n") + (o.bare ? "" : "\r\n"), "latin1"));
  if (o.record !== false) { fs.mkdirSync(path.dirname(md.provinceSplitRecordPath(m)), { recursive: true }); fs.writeFileSync(md.provinceSplitRecordPath(m), JSON.stringify(o.record || RECORD)); }
  return m;
}
const G = (mod) => ({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
const stacksFile = (m) => path.join(m, "map", "unitstacks.txt");

// ── the rule, written again: how the layer below lays out its land, read back off its own files ───────────────────────────────
const stacksBelow = readStacks(path.join(game, "map", "unitstacks.txt"));
const template = (coastal) => {
  const ids = LAND_BELOW.filter((p) => (p === X ? true : GRID.find((g) => g.id === p).coastal) === coastal && (stacksBelow.get(p) || []).some((r) => r.type === 0));
  const at = new Map();
  for (const p of ids) {
    const rows = stacksBelow.get(p), t0 = rows.find((r) => r.type === 0), seen = new Set();
    for (const r of rows) {
      if (seen.has(r.type)) continue;
      seen.add(r.type);
      if (!at.has(r.type)) at.set(r.type, { n: 0, dx: [], dz: [], rot: [] });
      const e = at.get(r.type); e.n++; e.dx.push(r.x - t0.x); e.dz.push(r.z - t0.z); e.rot.push(+r.rot);
    }
  }
  const off = new Map([...at].map(([t, e]) => [t, { dx: r2(lowerMedian(e.dx)), dz: r2(lowerMedian(e.dz)), rot: r2(lowerMedian(e.rot)) }]));
  return { n: ids.length, types: [...at].filter(([, e]) => e.n * 2 >= ids.length).map(([t]) => t).sort((a, b) => a - b), off };
};
const T_IN = template(false), T_CO = template(true);
const areaBelow = (p) => pixelsOf(p, belowAt).length;
const PER_PX = lowerMedian(LAND_BELOW.map((p) => +(stacksBelow.get(p).find((r) => r.type === 0).last) / Math.sqrt(areaBelow(p))));
const lastFor = (pid) => Math.max(0.02, Math.round(PER_PX * Math.sqrt(pixelsOf(pid, nowAt).length) * 50) / 50).toFixed(2);
const vpOff = (() => { const d = VPS_BELOW.map(([p]) => { const rs = stacksBelow.get(p); const a = rs.find((r) => r.type === 0), b = rs.find((r) => r.type === 38); return { dx: b.x - a.x, dz: b.z - a.z }; }); return { dx: r2(lowerMedian(d.map((e) => e.dx))), dz: r2(lowerMedian(d.map((e) => e.dz))) }; })();
const ship = (() => { const d = [], a = []; for (const g of GRID) { const rs = stacksBelow.get(g.id) || [], p = rs.find((r) => r.type === 19), q = rs.find((r) => r.type === 20); if (!p || !q) continue; d.push(Math.hypot(q.x - p.x, q.z - p.z)); a.push(Math.atan2(q.z - p.z, q.x - p.x) - +q.rot); } return { d: r2(lowerMedian(d)), angle: r2(lowerMedian(a)) }; })();
/** where a slot stands: `o` from `t0`, back towards it by quarters until it is on `pid`; on `t0` itself with no quarter on it */
const beside = (pid, t0, o) => { for (const k of [1, 0.75, 0.5, 0.25]) { const q = { x: r2(t0.x + o.dx * k), z: r2(t0.z + o.dz * k) }; if (provOfRow(q) === pid) return { ...q, step: k }; } return { x: t0.x, z: t0.z, step: 0 }; };
const touchesSea = (pid) => pixelsOf(pid, nowAt).some(({ x, y }) => [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([a, b]) => nowAt(a, b) === SEA));
/** the province's own pixel nearest its centroid whose 3x3 is all of it, the first in the raster on a tie: its town point */
const townPoint = (pid) => {
  const px = pixelsOf(pid, nowAt), c = { x: px.reduce((a, p) => a + p.x, 0) / px.length, y: px.reduce((a, p) => a + p.y, 0) / px.length };
  let best = null, d = Infinity;
  for (const p of px) { let full = true; for (let dy = -1; dy <= 1 && full; dy++) for (let dx = -1; dx <= 1; dx++) if (nowAt(p.x + dx, p.y + dy) !== pid) { full = false; break; } if (!full) continue; const e = (p.x - c.x) ** 2 + (p.y - c.y) ** 2; if (e < d) { d = e; best = p; } }
  return { x: best.x, z: zOf(best.y) };
};
/** a province laid out as land round `t0`: Map(type → { x, z, rot, last }) — its template's slots and `own` (the slots it already
 *  had), but 19, 20 and the sea's own; the star at the victory point offset */
const laidOut = (pid, t0, own = []) => {
  const cls = touchesSea(pid) ? T_CO : T_IN, other = cls === T_CO ? T_IN : T_CO, last = lastFor(pid), out = new Map();
  const rot = (t) => (cls.off.get(t) || other.off.get(t)).rot.toFixed(2);
  out.set(0, { x: r2(t0.x), z: r2(t0.z), rot: rot(0), last });
  const star = beside(pid, { x: r2(t0.x), z: r2(t0.z) }, vpOff);
  out.set(38, { x: star.x, z: star.z, rot: rot(38), last, step: star.step });
  for (const t of [...new Set(cls.types.concat(own))].sort((a, b) => a - b)) {
    if (t === 0 || t === 38 || t === 19 || t === 20 || SEA_ONLY.has(t)) continue;
    const o = cls.off.get(t) || other.off.get(t);
    if (!o) continue;
    const q = beside(pid, { x: r2(t0.x), z: r2(t0.z) }, o);
    out.set(t, { x: q.x, z: q.z, rot: o.rot.toFixed(2), last, step: q.step });
  }
  return out;
};
const typesOf = (pid) => [...new Set((stacksBelow.get(pid) || []).map((r) => r.type))];
const WANT = new Map([
  [X, laidOut(X, HUB[X], typesOf(X))],       // cut: every row again, round its own supply_node row
  [X1, laidOut(X1, HUB[X1])],                // new, inland: round its supply_node row
  [X2, laidOut(X2, townPoint(X2))],          // new, on the coast, no supply_node row: round its town point
  [R, laidOut(R, HUB[R], typesOf(R))],       // sea: its Standstill and star both still the sea's, so all of it
]);
const KIND = { [X]: "cut", [X1]: "new", [X2]: "new", [R]: "sea" };
const LAID = [X, X1, X2, R];

try {
  console.log("\n-- the fixture can tell right from wrong --");
  {
    ok(T_IN.n === 6 && T_CO.n === 15 && JSON.stringify(T_IN.types) !== JSON.stringify(T_CO.types) && T_CO.types.includes(19) && T_CO.types.includes(20) && !T_IN.types.includes(19),
      "(the layer below's land: 6 inland and 15 coastal provinces whose slots differ — the coast carries the ship slots 19 and 20)", { inland: T_IN.types, coastal: T_CO.types });
    ok(!T_CO.types.includes(2) && T_CO.off.has(2) && !T_IN.types.includes(7) && T_IN.off.has(7), "(a slot only some of its land carries — 2 on the coast, 7 inland — is not the template's, though it has a place)");
    ok(touchesSea(X) && touchesSea(X2) && touchesSea(R) && !touchesSea(X1), "(X, X2 and R stand on the coast in the mod's bitmap, X1 inland, walled in by X)");
    const xRows = stacksBelow.get(X);
    ok(xRows.some((r) => r.type !== 20 && provOfRow(r) !== X) && provOfRow(xRows.find((r) => r.type === 0)) === X1, "(X's own land rows stand on the pieces cut off it now: its Standstill on X1)", xRows.map((r) => [r.type, provOfRow(r)]));
    const step = [...WANT.get(X1).values()].some((e) => e.step > 0 && e.step < 1);
    ok(step, "(the full offset of a slot leaves X1, six pixels wide: the layout steps it back)", [...WANT.get(X1)].map(([t, e]) => [t, e.step]));
    ok([...WANT.get(R)].some(([t, e]) => { const s = stacksBelow.get(R).find((r) => r.type === t); return s && !near(s, e); }) && typesOf(R).some((t) => SEA_ONLY.has(t)),
      "(R's sea rows stand elsewhere than the land layout puts them, and it carries slots only a sea uses)");
    ok(provOfRow(townPoint(X2)) === X2 && !Object.values(HUB).some((h) => provOfRow(h) === X2) && !stacksBelow.get(X).some((r) => near(r, townPoint(X2))),
      "(X2 has no supply_node row, and its town point — its own pixel nearest its middle with a full 3x3 — is no row's place already)", townPoint(X2));
    ok(new Set(LAID.map((p) => lastFor(p))).size > 1 && LAID.every((p) => lastFor(p) !== "1.00"), "(the last column grows with the province: the four are given more than one value, none of them the sea's)", LAID.map((p) => lastFor(p)));
    ok(ship.d > 1 && Math.abs(ship.angle) > 1, "(the layer below's 20 stands its own distance from 19, at its own angle)", ship);
  }

  console.log("\n-- ⭐⭐ the finder, asked directly --");
  const main = makeMod("mod");
  const f = md.unitPositionsNeverLaidOut(G(main)), by = new Map((f.provinces || []).map((e) => [e.province, e]));
  {
    ok(JSON.stringify([...by.keys()]) === JSON.stringify(LAID.slice().sort((a, b) => a - b)) && f.newProvinces === 2 && f.cutProvinces === 1 && f.exSea === 1 && f.ports === 0 && f.total === 4,
      "⭐⭐ it names X (cut), X1 and X2 (new) and R (sea) — not Z, not the grid, not the bare grid province", { ids: [...by.keys()], f: { total: f.total, n: f.newProvinces, c: f.cutProvinces, s: f.exSea, p: f.ports, reason: f.reason } });
    ok(LAID.every((p) => (by.get(p) || {}).kind === KIND[p]), "…each of the kind it is", LAID.map((p) => [p, (by.get(p) || {}).kind]));
    ok(!by.has(Z) && !by.has(BARE), "⭐⭐ a land province with no row that the record does not name is given nothing: Z, raised from the sea in the mod's own state, and the bare grid province");
  }

  console.log("\n-- ⭐⭐⭐ the writer --");
  const before = fs.readFileSync(stacksFile(main));
  const res = md.layOutUnitPositions(G(main));
  const after = readStacks(stacksFile(main));
  {
    ok(res.changed === true && res.provinces === 4 && res.newProvinces === 2 && res.cutProvinces === 1 && res.exSea === 1, "it laid out the four", res);
    const wantAdded = WANT.get(X1).size + WANT.get(X2).size + [...WANT.get(X).keys()].filter((t) => !typesOf(X).includes(t)).length + [...WANT.get(R).keys()].filter((t) => !typesOf(R).includes(t)).length;
    ok(res.rowsAdded === wantAdded && res.rowsDropped === typesOf(R).filter((t) => SEA_ONLY.has(t)).length, "⭐ …adding the slots each lacked and dropping R's sea-only ones, no more", { added: res.rowsAdded, wantAdded, dropped: res.rowsDropped });
    for (const p of LAID) {
      const rows = after.get(p) || [], want = WANT.get(p);
      const types = rows.map((r) => r.type).sort((a, b) => a - b);
      ok(JSON.stringify(types) === JSON.stringify([...want.keys()].sort((a, b) => a - b)), `⭐⭐⭐ ${p} (${KIND[p]}) carries every slot of its template, once — and no sea-only slot`, { types, want: [...want.keys()] });
      const wrong = rows.filter((r) => { const w = want.get(r.type); return !w || !near(r, w) || r.rot !== w.rot || r.last !== w.last || r.y !== yAt(r); });
      ok(wrong.length === 0, `⭐⭐⭐ …each where the layer below lays out its own land, turned as it turns it, the last column ${p}'s own size's, standing on the ground under it`, wrong.slice(0, 3).map((r) => ({ line: r.line, want: want.get(r.type), y: yAt(r) })));
      ok(rows.every((r) => provOfRow(r) === p), `⭐⭐ …and every row on ${p} itself`, rows.filter((r) => provOfRow(r) !== p).map((r) => r.line));
    }
    ok(near((after.get(X) || []).find((r) => r.type === 0), HUB[X]) && near((after.get(X1) || []).find((r) => r.type === 0), HUB[X1]) && near((after.get(R) || []).find((r) => r.type === 0), HUB[R]),
      "⭐⭐ type 0 stands on the province's own supply_node row (X, X1, R)");
    ok(near((after.get(X2) || []).find((r) => r.type === 0), townPoint(X2)), "⭐ …and on its town point where it has none (X2)", { got: ((after.get(X2) || []).find((r) => r.type === 0) || {}).line, want: townPoint(X2) });
    ok(LAID.every((p) => { const a = after.get(p).find((r) => r.type === 0), s = after.get(p).find((r) => r.type === 38); return near(s, beside(p, a, vpOff)); }) && LAID.some((p) => beside(p, after.get(p).find((r) => r.type === 0), vpOff).step === 1),
      "⭐⭐ the star beside it, at the victory point offset the layer below writes, stepped back onto the province", vpOff);
    ok(!(after.get(R) || []).some((r) => SEA_ONLY.has(r.type)), "⭐⭐ R's sea-only rows are gone");
    ok(!after.has(Z) && !after.has(BARE), "⭐⭐ Z and the bare grid province still have no row");
    // every other province's rows: the same lines in the same order, and the file still CRLF throughout
    const others = (buf) => buf.toString("latin1").split("\n").filter((l) => { const p = +l.split(";")[0]; return l && !LAID.includes(p); });
    const now = fs.readFileSync(stacksFile(main));
    ok(JSON.stringify(others(now)) === JSON.stringify(others(before)), "⭐⭐ every row of every other province is the line it was, in the order it was");
    ok(!/[^\r]\n/.test(now.toString("latin1")) && now.toString("latin1").endsWith("\r\n"), "…and every line, the ones added among them, ends as the file's own do (CRLF)");
    const again = md.unitPositionsNeverLaidOut(G(main)), h = sha(now), res2 = md.layOutUnitPositions(G(main));
    ok(again.total === 0 && res2.changed === false && sha(fs.readFileSync(stacksFile(main))) === h, "⭐⭐ a second look names nothing, and a second click writes nothing", { total: again.total, ids: (again.provinces || []).map((e) => e.province) });
    const line = PAGE.autoFixSummary({ ok: true, fixes: { unitPositions: res } });
    ok(/laid out 4 province\(s\) in map\/unitstacks\.txt/.test(line) && /2 that Nova cut out of a raised ocean province/.test(line) && /1 that Nova cut down to the size of land/.test(line) && new RegExp(`${res.rowsAdded} added`).test(line),
      "⭐ the Auto-fix summary says what it laid out, and why", line.slice(line.indexOf("laid out"), line.indexOf("laid out") + 500));
  }

  console.log("\n-- ⭐⭐ the harbours, once there are some: 19 on the harbour, 20 beside it --");
  {
    write(main, "map/buildings.txt", buildingRows(true).join("\n") + "\n");
    const fp = md.unitPositionsNeverLaidOut(G(main)), ids = (fp.provinces || []).map((e) => e.province);
    ok(JSON.stringify(ids) === JSON.stringify([X, R, X2].sort((a, b) => a - b)) && fp.ports === 3 && fp.total === 3, "⭐⭐ X, X2 and R, laid out and now with a harbour, are named for their ship slots — Z, row-less and not recorded, is not", { ids, ports: fp.ports });
    const rp = md.layOutUnitPositions(G(main)), st = readStacks(stacksFile(main));
    ok(rp.changed === true && rp.ports === 3 && rp.rowsAdded === 6 && rp.rowsMoved === 0, "…the writer adds the two slots to each, and moves nothing", rp);
    for (const p of [X, X2, R]) {
      const s19 = st.get(p).find((r) => r.type === 19), s20 = st.get(p).find((r) => r.type === 20), port = PORT[p];
      const w20 = { x: r2(r2(port.x) + ship.d * Math.cos(port.rot + ship.angle)), z: r2(r2(port.z) + ship.d * Math.sin(port.rot + ship.angle)) };
      ok(near(s19, { x: r2(port.x), z: r2(port.z) }) && s19.rot === port.rot.toFixed(2) && near(s20, w20) && s20.rot === port.rot.toFixed(2) && s19.last === st.get(p).find((r) => r.type === 0).last,
        `⭐⭐⭐ ${p}: 19 stands on its naval_base_spawn row, turned as the harbour is; 20 ${ship.d} px from it as the layer below puts its own`, { s19: s19 && s19.line, s20: s20 && s20.line, w20 });
    }
    ok(!st.has(Z), "⭐⭐ Z, with a harbour and no row, is still given none");
    ok(md.unitPositionsNeverLaidOut(G(main)).total === 0, "…and nothing is left to name");
    // a harbour with no ship slot is the base game's own habit (126 of its 2,362) and Old World Blues lays out 505 of its own so:
    // Z laid out by its modder — sea below, the mod's own state, no row the layer below's, none where this layout puts it
    const t0 = { x: 99.5, z: zOf(51) + 0.5 }, mine = [0, 1, 9, 10, 21, 38].map((t, i) => fmt(Z, t, { x: t0.x + (i % 3) * 2, z: t0.z - Math.floor(i / 3) * 2 }, "11.00", 0, "0.40"));
    const own = makeMod("mod-z-modders-own", { ports: true, zRows: mine });
    const fz = md.unitPositionsNeverLaidOut(G(own)), zLaid = laidOut(Z, HUB[Z]);
    ok(mine.every((l) => { const c = l.split(";"), t = +c[1]; return provOfRow({ x: +c[2], z: +c[4] }) === Z && !near({ x: +c[2], z: +c[4] }, zLaid.get(t)); }) && provOfRow(PORT[Z]) === Z,
      "(the fixture: Z's rows are its modder's — on Z, none where the land layout puts it — and it has a harbour)");
    ok(!(fz.provinces || []).some((e) => e.province === Z), "⭐⭐⭐ a harbour with no ship slot in a province its MODDER laid out is not named: only one this layout laid out waits for its ship slots", (fz.provinces || []).map((e) => [e.province, e.kind]));
  }

  console.log("\n-- ⭐⭐ the rule, and the record it is told by --");
  {
    const m = makeMod("mod-rule"), lost = makeMod("mod-no-record", { record: false });
    const rule = (mod) => (md.validateMapBitmap(G(mod)) || []).find((p) => p.rule === "unit_positions_never_laid_out_for_land");
    const p = rule(m), q = rule(lost);
    ok(!!p && p.severity === "warning" && p.autoFix === true && p.total === 4 && JSON.stringify(p.provinces) === JSON.stringify(LAID.slice().sort((a, b) => a - b)) && /2 that Nova cut out of a raised ocean province/.test(p.message) && /1 that Nova cut down/.test(p.message),
      "⭐⭐ the warning names the four, and says which Nova cut", p && { total: p.total, provinces: p.provinces, message: p.message.slice(0, 400) });
    const fq = md.unitPositionsNeverLaidOut(G(lost));
    ok(!!q && q.total === 1 && JSON.stringify(q.provinces) === JSON.stringify([R]) && fq.newProvinces === 0 && fq.cutProvinces === 0,
      "⭐⭐⭐ without the record nothing tells a piece from a province the modder drew: only R, which was sea below, is named", q && { total: q.total, provinces: q.provinces });
    md.layOutUnitPositions(G(m));
    ok(!rule(m), "⭐ …and after the layout the warning is gone");
    // a re-roll (Generate land, Delete map, Generate land) appends a family that cuts the same parent again: the record names X
    // twice, X1 under the first click and X2 under the second — the same provinces, told the same
    const reroll = makeMod("mod-reroll", { record: { version: 1, definitionMaxBefore: Z, families: [{ parent: X, pieces: [X1], definitionMaxBefore: Z }, { parent: X, pieces: [X2], definitionMaxBefore: X1 }] } });
    const fr = md.unitPositionsNeverLaidOut(G(reroll));
    ok(JSON.stringify((fr.provinces || []).map((e) => [e.province, e.kind])) === JSON.stringify(LAID.slice().sort((a, b) => a - b).map((p) => [p, KIND[p]])),
      "⭐ a record naming a parent twice — a re-roll's — is read as the one family it is: X cut, X1 and X2 new, R sea", (fr.provinces || []).map((e) => [e.province, e.kind]));
  }

  console.log("\n-- ⭐⭐⭐ a row the modder placed on a province Nova cut is theirs --");
  {
    // (a) before any layout X's rows are the layer below's, spilt onto X1 — but its 9 the modder has placed on X itself
    const MINE9 = { x: 20.5, z: zOf(70) + 0.5 };
    const own9 = makeMod("mod-cut-own-9", { over: { [`${X};9`]: MINE9 } });
    const below9 = stacksBelow.get(X).find((r) => r.type === 9);
    ok(provOfRow(MINE9) === X && !near(MINE9, below9) && !near(MINE9, WANT.get(X).get(9)),
      "(the fixture: the modder's 9 stands on X, where neither the layer below nor the layout puts it)");
    const f9 = md.unitPositionsNeverLaidOut(G(own9)), e9 = (f9.provinces || []).find((e) => e.province === X) || {};
    ok(e9.kind === "cut" && !(e9.rows || []).some((r) => r.type === 9), "⭐⭐ X is still named for the rows the cut spilt off it — and its 9, the modder's, is not in the plan", (e9.rows || []).map((r) => r.type));
    const line9 = fs.readFileSync(stacksFile(own9), "latin1").split("\r\n").find((l) => l.startsWith(`${X};9;`));
    md.layOutUnitPositions(G(own9));
    const st9 = readStacks(stacksFile(own9)), x9 = st9.get(X) || [];
    ok(x9.find((r) => r.type === 9).line === line9, "⭐⭐⭐ …and after the layout the modder's 9 is the line it was, byte for byte", { now: (x9.find((r) => r.type === 9) || {}).line, was: line9 });
    ok(x9.filter((r) => r.type !== 9).every((r) => { const w = WANT.get(X).get(r.type); return w && near(r, w) && r.rot === w.rot && r.last === w.last; }) && x9.length === WANT.get(X).size,
      "⭐⭐ …while every other row of X is laid out round its supply_node row, as it would be", x9.filter((r) => r.type !== 9).filter((r) => { const w = WANT.get(X).get(r.type); return !w || !near(r, w); }).map((r) => r.line));
    // (b) after the layout, the modder nudges: X's 1 across the border onto X1, its Standstill and star a little, on X
    const nudged = makeMod("mod-cut-nudged");
    md.layOutUnitPositions(G(nudged));
    const laid = readStacks(stacksFile(nudged)).get(X), at0 = laid.find((r) => r.type === 0), at38 = laid.find((r) => r.type === 38);
    const MOVED = { 1: { x: 31.5, z: zOf(66) + 0.5 }, 0: { x: at0.x + 0.4, z: at0.z }, 38: { x: at38.x + 0.4, z: at38.z } };
    const f = stacksFile(nudged), text = fs.readFileSync(f, "latin1").split("\r\n").map((l) => { const c = l.split(";"); const to = +c[0] === X && MOVED[+c[1]]; if (to) { c[2] = to.x.toFixed(2); c[4] = to.z.toFixed(2); } return c.join(";"); }).join("\r\n");
    fs.writeFileSync(f, Buffer.from(text, "latin1"));
    ok(provOfRow(MOVED[1]) === X1 && provOfRow(MOVED[0]) === X && provOfRow(MOVED[38]) === X, "(the fixture: X's 1 now stands on X1, its Standstill and star still on X — every one of them a place the modder chose)");
    const fn = md.unitPositionsNeverLaidOut(G(nudged)), h = sha(fs.readFileSync(f)), rn = md.layOutUnitPositions(G(nudged));
    ok(!(fn.provinces || []).some((e) => e.province === X) && rn.changed === false && sha(fs.readFileSync(f)) === h,
      "⭐⭐⭐ a province Nova cut and laid out, whose rows the modder moved — one across a border — is not named, and Auto-fix writes nothing over them", (fn.provinces || []).map((e) => [e.province, e.kind]));
  }

  console.log("\n-- ⭐⭐ a harbour on land that had no coast below: raised back whole, still the layer below's inland layout --");
  {
    const m = makeMod("mod-inland-port", { inlandPort: true });
    const rowsBelow16 = stacksBelow.get(INLAND_PORT) || [], mine16 = readStacks(stacksFile(m)).get(INLAND_PORT) || [];
    ok(!GRID.find((g) => g.id === INLAND_PORT).coastal && rowsBelow16.length > 0 && !rowsBelow16.some((r) => r.type === 19 || r.type === 20)
      && mine16.length === rowsBelow16.length && mine16.every((r) => rowsBelow16.some((b) => b.type === r.type && b.line === r.line)) && provOfRow(INLAND_HARBOUR) === INLAND_PORT,
      "(the fixture: INLAND had no coast below and no ship slot there; the mod's rows are the layer below's, line for line; and it has a harbour now)");
    const asNew = laidOut(INLAND_PORT, townPoint(INLAND_PORT));
    ok(mine16.some((r) => { const w = asNew.get(r.type); return !w || !near(r, w); }),
      "(…and its rows are Paradox's layout, not where this layout would lay it out: the fingerprint of a province this layout laid out does not name it)");
    const fi = md.unitPositionsNeverLaidOut(G(m)), ei = (fi.provinces || []).find((e) => e.province === INLAND_PORT) || {};
    const w20 = { x: r2(r2(INLAND_HARBOUR.x) + ship.d * Math.cos(INLAND_HARBOUR.rot + ship.angle)), z: r2(r2(INLAND_HARBOUR.z) + ship.d * Math.sin(INLAND_HARBOUR.rot + ship.angle)) };
    ok(ei.kind === "port" && (ei.rows || []).length === 2 && near((ei.rows || []).find((r) => r.type === 19).to, { x: r2(INLAND_HARBOUR.x), z: r2(INLAND_HARBOUR.z) }) && near((ei.rows || []).find((r) => r.type === 20).to, w20),
      "⭐⭐⭐ it is named for its ship slots, and only them: 19 on its harbour, 20 beside it as the layer below puts its own", ei);
    md.layOutUnitPositions(G(m));
    ok(!(md.unitPositionsNeverLaidOut(G(m)).provinces || []).some((e) => e.province === INLAND_PORT) && (readStacks(stacksFile(m)).get(INLAND_PORT) || []).filter((r) => r.type === 19 || r.type === 20).length === 2,
      "…laid out, it is not named again");
    // ⚠ CRY WOLF: the base game leaves 126 of its 2,362 harbours with no ship slot — on its COAST. X, with no record to name it, is land
    // below on the coast with no 19 or 20 there, its rows the layer below's, and a harbour: Paradox's own habit, not named
    const noRec = makeMod("mod-coast-port-no-record", { ports: true, record: false });
    const xBelow = stacksBelow.get(X) || [], xDef = fs.readFileSync(path.join(game, "map", "definition.csv"), "utf8").split("\n").find((l) => l.startsWith(`${X};`)).split(";");
    ok(xDef[4] === "land" && xDef[5] === "true" && !xBelow.some((r) => r.type === 19 || r.type === 20) && provOfRow(PORT[X]) === X, "(the fixture: X is land on the coast below, with no ship slot there, and has its harbour)", xDef);
    ok(!(md.unitPositionsNeverLaidOut(G(noRec)).provinces || []).some((e) => e.province === X), "⭐⭐ a harbour on land that was COAST below, with no ship slot as the base game leaves 126 of its own, is not named",
      (md.unitPositionsNeverLaidOut(G(noRec)).provinces || []).map((e) => [e.province, e.kind]));
    // …nor one whose rows the modder moved: no longer the layer below's layout
    const mod1 = makeMod("mod-inland-port-modders", { inlandPort: true, over: { [`${INLAND_PORT};1`]: { x: 30.5, z: zOf(36) + 0.5 } } });
    ok(!(md.unitPositionsNeverLaidOut(G(mod1)).provinces || []).some((e) => e.province === INLAND_PORT), "⭐⭐ …nor one whose rows are no longer all the layer below's: the modder's layout is theirs");

    // …but its STAR moved alone is: Nova's own victory-point layout moves the star and nothing else (F-land-VP), and the 12 of the
    // owner's flow's 412 it had moved kept no ship slot. A ship slot added beside a harbour moves nothing that is there.
    const star = (stacksBelow.get(INLAND_PORT) || []).find((r) => r.type === 38), movedStar = { x: star.x + 1, z: star.z };
    const ms = makeMod("mod-inland-port-star-moved", { inlandPort: true, over: { [`${INLAND_PORT};38`]: movedStar } });
    ok(provOfRow(movedStar) === INLAND_PORT && (readStacks(stacksFile(ms)).get(INLAND_PORT) || []).some((r) => r.type === 38 && near(r, movedStar)),
      "(the fixture: INLAND's star moved a pixel east, still on it)");
    const es = (md.unitPositionsNeverLaidOut(G(ms)).provinces || []).find((e) => e.province === INLAND_PORT) || {};
    ok(es.kind === "port" && JSON.stringify((es.rows || []).map((r) => r.type).sort((a, b) => a - b)) === "[19,20]",
      "⭐⭐ a harbour whose star alone was moved is named for its ship slots, and only them — the star stays where it is", es);

    // ⭐⭐⭐ …and a harbour that is a victory point's province too, its star in the layer below's default slot (on its 9) and already as
    // good a place as the layout would give it: the star's checks left the whole province, its ship slots with them — 80 of the owner's
    // flow's 1,088 harbours. A copy of the layer below with INLAND's star on its 9, and the mod a victory point there.
    const game2 = path.join(ROOT, "game-star-on-its-9");
    fs.cpSync(game, game2, { recursive: true });
    const nine = (stacksBelow.get(INLAND_PORT) || []).find((r) => r.type === 9);
    fs.writeFileSync(path.join(game2, "map", "unitstacks.txt"), STACKS_BELOW.map((l) => { const c = l.split(";"); if (+c[0] === INLAND_PORT && +c[1] === 38) { c[2] = nine.x.toFixed(2); c[4] = nine.z.toFixed(2); } return c.join(";"); }).join("\n") + "\n");
    const vpOpts = { vps: VPS_BELOW.concat([[INLAND_PORT, 2]]), over: { [`${INLAND_PORT};38`]: { x: nine.x, z: nine.z } } };
    const vpPort = makeMod("mod-inland-port-vp", { inlandPort: true, ...vpOpts }), vpNoPort = makeMod("mod-inland-vp-no-port", vpOpts);
    const G2 = (mod) => ({ modRoot: mod, gameRoot: game2, dependencyRoots: [] });
    const s21 = md.unitStandstills({ ...G2(vpPort), provinces: [INLAND_PORT] }).get(INLAND_PORT) || {};
    ok(s21.markerNeverLaidOut === true && s21.landNow === true && s21.landBelow === true && !VPS_BELOW.some(([p]) => p === INLAND_PORT),
      "(the fixture: INLAND's star is the layer below's, in its default slot, and the victory point is the mod's alone — a victory point the layout asks about)", s21);
    ok(!(md.unitPositionsNeverLaidOut(G2(vpNoPort)).provinces || []).some((e) => e.province === INLAND_PORT),
      "(…whose star is left where it is: with no harbour, INLAND is not named at all)");
    const ev = (md.unitPositionsNeverLaidOut(G2(vpPort)).provinces || []).find((e) => e.province === INLAND_PORT) || {};
    ok(ev.kind === "port" && JSON.stringify((ev.rows || []).map((r) => r.type).sort((a, b) => a - b)) === "[19,20]",
      "⭐⭐⭐ a harbour on a victory point's province whose star needs no move is named for its ship slots all the same", ev);
  }

  console.log("\n-- ⭐⭐ a harbour with one ship slot, and a file that ends without a line ending --");
  {
    // after the harbours' phase X2 has 19 and 20; the modder deletes its 20: only the 20 is missing, and only it is added
    const m = makeMod("mod-one-ship-slot", { ports: true });
    md.layOutUnitPositions(G(m)); md.layOutUnitPositions(G(m));
    const f = stacksFile(m), lines = fs.readFileSync(f, "latin1").split("\r\n");
    const s19 = lines.find((l) => l.startsWith(`${X2};19;`)), had = lines.filter((l) => !l.startsWith(`${X2};20;`));
    ok(!!s19 && had.length === lines.length - 1, "(the fixture: X2 laid out with its harbour's 19, and its 20 taken away)");
    fs.writeFileSync(f, Buffer.from(had.join("\r\n"), "latin1"));
    const c19 = s19.split(";"), r19 = { x: +c19[2], z: +c19[4], rot: +c19[5] };
    const f1 = md.unitPositionsNeverLaidOut(G(m)), e1 = (f1.provinces || []).find((e) => e.province === X2) || {};
    const w20 = { x: r2(r19.x + ship.d * Math.cos(r19.rot + ship.angle)), z: r2(r19.z + ship.d * Math.sin(r19.rot + ship.angle)) };
    ok(f1.total === 1 && e1.kind === "port" && JSON.stringify((e1.rows || []).map((r) => r.type)) === JSON.stringify([20]) && near(e1.rows[0].to, w20) && e1.rows[0].rot === r19.rot.toFixed(2),
      "⭐⭐ a harbour with its 19 and no 20 is named for the 20 alone, beside the 19 it has, turned as it is", { total: f1.total, e1 });
    // the same layout over two copies of the main mod, one whose file ends with its last line's CRLF and one that ends bare: the bare
    // one's bytes are the other's without the final CRLF — every added row after the last line, and still no ending at the end
    const end = makeMod("mod-ends-crlf"), bare = makeMod("mod-ends-bare", { bare: true });
    ok(fs.readFileSync(stacksFile(end)).equals(Buffer.concat([fs.readFileSync(stacksFile(bare)), Buffer.from("\r\n")])), "(the fixture: the two files differ by the final CRLF alone)");
    const re = md.layOutUnitPositions(G(end)), rb = md.layOutUnitPositions(G(bare));
    const be = fs.readFileSync(stacksFile(end)), bb = fs.readFileSync(stacksFile(bare));
    ok(re.rowsAdded > 0 && rb.rowsAdded === re.rowsAdded && bb.equals(be.slice(0, be.length - 2)) && !bb.toString("latin1").endsWith("\n"),
      "⭐⭐ a file that ends without a line ending gets the same rows, after its last line, and still ends without one", { added: [re.rowsAdded, rb.rowsAdded], tail: bb.toString("latin1").slice(-60) });
  }

  // ══ PART B — Generate land ══════════════════════════════════════════════════════════════════════════════════════════════════
  console.log("\n-- ⭐⭐⭐ Generate land lays out what it cut, before the network is planned on it --");
  {
    const S = SW.makeShapes();
    const game2 = path.join(ROOT, "game-split");
    SW.makeGame(game2, S);
    // the layer below's unit rows, every province: a land brick laid out as land round its middle, an ocean cell as a sea
    const rows = [], firstPx = new Map(), sum = new Map();
    for (let i = 0; i < S.W * S.H; i++) { const id = S.gameIds[i], x = i % S.W, y = Math.floor(i / S.W); const e = sum.get(id) || [0, 0, 0]; e[0] += x; e[1] += y; e[2]++; sum.set(id, e); if (!firstPx.has(id)) firstPx.set(id, i); }
    for (const [id, [sx, sy, n]] of [...sum].sort((a, b) => a[0] - b[0])) {
      const t0 = { x: Math.floor(sx / n) + 0.5, z: S.H - 1 - Math.floor(sy / n) + 0.5 }, land = S.typeOf(id) === "land";
      const tpl = land ? INLAND : Object.fromEntries(Object.entries(SEA_LAYOUT).map(([t, [dx, dz]]) => [t, [dx, dz, 0]]));
      for (const [t, [dx, dz, rot]] of Object.entries(tpl)) rows.push(fmt(id, t, { x: t0.x + dx, z: t0.z + dz }, land ? "11.00" : "9.50", rot, land ? "0.36" : "1.00"));
    }
    write(game2, "map/unitstacks.txt", rows.join("\n") + "\n");
    const mod = SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, "split-world"), S, { name: "unit rows" });
    const ctl = SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, "split-world-ctl"), S, { name: "unit rows ctl" });
    const COUNT = Math.max(1, Math.round(S.N * 35 / 100));
    const gen = (m, extra = {}) => md.generateLand(Object.assign({ modRoot: m, gameRoot: game2, dependencyRoots: [], count: COUNT, seed: 1, ownerMode: "inherit", owner: "" }, extra));
    // what the network is written over: the mod's unitstacks.txt at the moment map/railways.txt goes down (every Nova write is a
    // rename over the file), read as the planner reads it
    const realRename = fs.renameSync, atNetwork = [];
    fs.renameSync = function (from, to) {
      if (/[\\/]map[\\/](railways|supply_nodes)\.txt$/i.test(String(to)) && path.resolve(String(to)).toLowerCase().startsWith(path.resolve(mod).toLowerCase() + path.sep)) {
        const f = stacksFile(mod);
        atNetwork.push(fs.existsSync(f) ? readStacks(f) : null);
      }
      return realRename.apply(this, arguments);
    };
    let r;
    try { r = gen(mod); } finally { fs.renameSync = realRename; }
    const rc = gen(ctl, { splitLargeProvinces: false });
    const rec = md.readProvinceSplitRecord(mod), pieces = rec.families.flatMap((fm) => fm.pieces), parents = rec.families.map((fm) => fm.parent);
    ok(r.changed === true && r.provinceSplit && r.provinceSplit.changed === true && pieces.length > 0, "(the click cut its raised ocean into pieces)", { split: r.provinceSplit && { changed: r.provinceSplit.changed, newIds: r.provinceSplit.newIds, why: r.provinceSplit.why } });
    const u = r.unitRows || {};
    ok(u.changed === true && u.materialised === true && u.newProvinces === pieces.length && !u.error && fs.existsSync(stacksFile(mod)), "⭐⭐ it took the layer below's unitstacks.txt in, and laid out every piece", u);
    const st = readStacks(stacksFile(mod)), def = SW.readDef(path.join(mod, "map", "definition.csv"));
    const dec = SW.decode(path.join(mod, "map", "provinces.bmp"), def), at = (p) => { const px = Math.floor(p.x), row = S.H - 1 - Math.floor(p.z); return px < 0 || row < 0 || px >= S.W || row >= S.H ? -1 : dec.ids[row * S.W + px]; };
    const landNow = def.ids.filter((id) => (def.rows.get(id).type || "").toLowerCase() === "land" && id > 0);
    ok(landNow.every((p) => (st.get(p) || []).some((x) => x.type === 0 && at(x) === p)), "⭐⭐⭐ every land province, each piece among them, has a Standstill on itself", landNow.filter((p) => !(st.get(p) || []).some((x) => x.type === 0 && at(x) === p)).slice(0, 10));
    const off = [];
    for (const p of pieces.concat(parents)) for (const x of (st.get(p) || [])) if (x.type !== 20 && at(x) !== p) off.push(x.line);
    ok(off.length === 0, "⭐⭐ …and every row of a piece or a cut parent stands on its own province", off.slice(0, 5));
    ok(atNetwork.length > 0 && atNetwork.every((s) => s && pieces.every((p) => (s.get(p) || []).some((x) => x.type === 0))), "⭐⭐⭐ when the network was written, every piece already had its Standstill — the station the planner draws its rail to",
      { writes: atNetwork.length, missing: atNetwork.map((s) => (s ? pieces.filter((p) => !(s.get(p) || []).some((x) => x.type === 0)).length : "no unitstacks.txt")) });
    ok(rc.provinceSplit && rc.provinceSplit.changed === false && rc.unitRows && rc.unitRows.changed === false && !fs.existsSync(stacksFile(ctl)),
      "⭐ nothing cut, nothing laid out here: the twin that does not cut copies no unitstacks.txt in", rc.unitRows);
    // …and the page says it, in the line that says what was cut: the page's own function, lifted out of public/map.js, on this real
    // answer and on the one a throw in the layout leaves
    let note = null;
    try { note = PAGE.runPage(["function generatedProvinceSplitNote("]).sb.generatedProvinceSplitNote; } catch (_) { note = null; }
    const said = note ? note(r) : "", saidErr = note ? note({ ...r, unitRows: { changed: false, error: "EBUSY: the file is locked" } }) : "";
    ok(typeof note === "function" && said.includes(`Their unit positions were laid out as the map below lays out its own land's: ${Number(u.provinces).toLocaleString()} province`) && !said.includes("⚠ Their unit positions"),
      "⭐ the Generate land line says the provinces it cut were laid out, and how many", said);
    ok(saidErr.includes("⚠ Their unit positions could not all be laid out (EBUSY: the file is locked)") && saidErr.includes("Auto-fix all lays them out"),
      "⭐ …and, when the layout threw, says so and what lays them out", saidErr);
  }
} catch (e) {
  checks++;
  fails.push("HARNESS ERROR");
  console.log("HARNESS ERROR " + (e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e));
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
  console.log("\n" + (fails.length ? `FAILED ${fails.length}/${checks}` : `PASSED ${checks}/${checks}`));
  process.exitCode = fails.length ? 1 : 0;
}
