// ⛔ #a-raised-province-is-cut-to-land-size — the world the province-split tests generate on, and their own judges of it.
//
// ⚠️ NOT NAMED test-*.js ON PURPOSE — run-tests.js enumerates `test-*.js` and would execute a helper as a test file.
//
// The world is 512 x 256 and has no X-crossing anywhere, the date-line seam included:
//   · the west half (x < 256) is OCEAN below: 64 x 64 cells in brick rows (odd rows shifted 32 px) — the size of a sea province;
//   · the east half is LAND below: 16 x 16 bricks in rows starting at y = -8 (odd rows shifted 8 px) — the size of a land province;
//   · `big`: land rectangles drawn over the bricks, each one province (D's walls stand between two of them);
//   · `extras`: 4 x 4 provinces inside four bricks that only the layer BELOW has, numbered after the mod's last id — a mod whose
//     definition.csv ends below the one underneath it (Hearts of Minecraft's 12,706 under vanilla's 13,413). The first of them
//     can be given a colour of the test's choosing (`plantColour`).
// No two row boundaries meet (64k never equals 16j - 8), so every corner is a T and the bricks of two rows never cross.
// Ids run 1..N in the order the mod's own shapes are first met, row by row; colours are (id & 255, id >> 8, 77).
// The layer below: regions are 128 x 128 tiles (a province is in the tile of its first pixel); its land is owned by AAA (x < 384)
// and BBB, one state per brick row per tile, with categories, people, resources, factories, a capital each and an army each; an
// event names its highest state, so Generate land halves states to reach it (#a-generated-world-has-every-state-id-the-scripts-name).
// The mod is Delete map's: its own provinces.bmp and definition.csv, every row sea, and replace_path="history/states".
"use strict";
const fs = require("fs");
const path = require("path");

const W = 512, H = 256, SEA_W = 256;
const write = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };

function bmp24(w, h, rgbAt) {
  const rs = Math.floor((24 * w + 31) / 32) * 4, size = 54 + rs * h, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * h, 34);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = rgbAt(x, y), o = 54 + (h - 1 - y) * rs + x * 3; b[o] = c & 255; b[o + 1] = (c >> 8) & 255; b[o + 2] = (c >> 16) & 255; }
  return b;
}

/** The shape a pixel belongs to, before any override: an ocean cell or a land brick. */
function brickKey(x, y) {
  if (x < SEA_W) { const r = Math.floor(y / 64), off = r % 2 ? 32 : 0; return `o${r}_${Math.floor((x + off) / 64)}`; }
  const lx = x - SEA_W, r = Math.floor((y + 8) / 16), off = r % 2 ? 8 : 0;
  return `l${r}_${Math.floor((lx + off) / 16)}`;
}

/**
 * The world: { W, H, N, keyAt, idOf: Map(key → id), keyOf: Map(id → key), modIds: Int32Array, gameIds: Int32Array, colourOf(id),
 * typeOf(id), regionOf(id), extras: [ids], big: [ids] }. `big`: [{ x0, y0, w, h, key }] (land, x0 >= 256); `extras`: a count (≤ 4).
 */
function makeShapes({ big = [], extras = 0, plantColour = null } = {}) {
  const keyAt = new Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let k = brickKey(x, y);
    for (const b of big) if (x >= b.x0 && x < b.x0 + b.w && y >= b.y0 && y < b.y0 + b.h) k = b.key;
    keyAt[y * W + x] = k;
  }
  const idOf = new Map(), keyOf = new Map(), first = new Map();
  for (let i = 0; i < W * H; i++) { const k = keyAt[i]; if (!idOf.has(k)) { idOf.set(k, idOf.size + 1); keyOf.set(idOf.size, k); first.set(k, i); } }
  const N = idOf.size;
  const modIds = new Int32Array(W * H);
  for (let i = 0; i < W * H; i++) modIds[i] = idOf.get(keyAt[i]);
  const gameIds = Int32Array.from(modIds);
  // the extras: a 4 x 4 square 6 px into a whole brick of an odd row, far apart, none inside a `big` rectangle
  const hosts = ["l3_4", "l5_9", "l9_6", "l13_12"].slice(0, extras), extraIds = [];
  for (const h of hosts) {
    const i0 = first.get(h), x0 = (i0 % W) + 6, y0 = Math.floor(i0 / W) + 6, id = N + extraIds.length + 1;
    for (let y = y0; y < y0 + 4; y++) for (let x = x0; x < x0 + 4; x++) { if (keyAt[y * W + x] !== h) throw new Error(`fixture: extra ${id} leaves brick ${h}`); gameIds[y * W + x] = id; }
    keyOf.set(id, h + "+extra"); extraIds.push(id);
  }
  const pattern = (id) => (((id & 255) << 16) | (((id >> 8) & 255) << 8) | 77) >>> 0;
  const colourOf = (id) => (plantColour != null && id === extraIds[0] ? plantColour >>> 0 : pattern(id));
  const typeOf = (id) => (String(keyOf.get(id) || "").startsWith("o") ? "sea" : "land");
  const firstPx = (id) => { const k = keyOf.get(id); return k.endsWith("+extra") ? first.get(k.slice(0, -6)) : first.get(k); };
  const regionOf = (id) => { const i = firstPx(id), x = i % W, y = Math.floor(i / W); return Math.floor(x / 128) + 4 * Math.floor(y / 128) + 1; };
  const rowOf = (id) => { const k = keyOf.get(id).replace("+extra", ""); const m = /^l(\d+)_/.exec(k); return m ? +m[1] : -1; };
  return { W, H, N, keyAt, idOf, keyOf, modIds, gameIds, colourOf, pattern, typeOf, regionOf, rowOf, firstPx, extras: extraIds, big: big.map((b) => idOf.get(b.key)) };
}

const defLine = (id, colour, type, terrain = "plains") => `${id};${(colour >> 16) & 255};${(colour >> 8) & 255};${colour & 255};${type};false;${type === "land" ? terrain : "ocean"};${type === "land" ? 1 : 0}`;
const regionText = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "REGION_${id}"\n\tprovinces = { ${provs.join(" ")} }\n\tweather = {}\n}\n`;
const BUILDINGS = { infrastructure: { stateMax: 5 }, industrial_complex: { shares: true, stateMax: 20 }, arms_factory: { shares: true, stateMax: 20 } };
// common/terrain with the land terrains Generate land chooses among (TERRAIN_HOPS_FROM_SEA's, less urban) and an ocean: without one
// every raised province is plains, and nothing about how the terrain lies can be seen
const TERRAINS = ["plains", "forest", "hills", "mountain", "marsh", "desert", "jungle"];
const TERRAIN_TXT = ["categories = {", ...TERRAINS.map((t) => `\t${t} = { color = { 100 100 100 } }`), "\tocean = { color = { 0 0 200 } is_water = yes }", "}", "terrain = {",
  ...TERRAINS.map((t, i) => `\t${t} = { type = ${t} color = { ${i} } }`), `\tocean = { type = ocean color = { 15 } }`, "}", ""].join("\n");

/**
 * The layer below at `root`. o.adjacencies: map/adjacencies.csv's text; o.rules: map/adjacency_rules.txt's; o.unitstacks: a map
 * of province → [x, z] Standstill (type 0) rows; o.terrain: it ships common/terrain (TERRAINS) and its land is of every one of them;
 * o.divisions: { tag: n } — that country's army is n divisions, one on each of its first n provinces below (six each, left out);
 * o.factories: { tag: n } — each of that country's states holds n levels of its one factory (1, left out).
 * → { root, states: [{ id, owner, provinces, ... }], capitalOf, oobOf }
 */
function makeGame(root, S, o = {}) {
  write(root, "hoi4.exe", "");
  const allIds = [...S.keyOf.keys()].sort((a, b) => a - b);
  write(root, "map/provinces.bmp", bmp24(W, H, (x, y) => S.colourOf(S.gameIds[y * W + x])));
  write(root, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...allIds.map((id) => defLine(id, S.colourOf(id), S.typeOf(id), o.terrain ? TERRAINS[id % TERRAINS.length] : "plains"))].join("\n") + "\n");
  const byRegion = new Map();
  for (const id of allIds) { const r = S.regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, p] of byRegion) write(root, `map/strategicregions/${r}-REGION.txt`, regionText(r, p));
  if (o.adjacencies != null) write(root, "map/adjacencies.csv", o.adjacencies);
  if (o.rules != null) write(root, "map/adjacency_rules.txt", o.rules);
  if (o.unitstacks) write(root, "map/unitstacks.txt", [...o.unitstacks].map(([p, [x, z]]) => `${p};0;${x.toFixed(2)};9.50;${z.toFixed(2)};0.00;0.00`).join("\n") + "\n");
  if (o.terrain) write(root, "common/terrain/00_terrain.txt", TERRAIN_TXT);
  write(root, "common/state_category/00_categories.txt", "state_categories = {\n\trural = { local_building_slots = 2 }\n\ttown = { local_building_slots = 4 }\n}\n");
  write(root, "common/buildings/00_buildings.txt", "buildings = {\n" + Object.entries(BUILDINGS).map(([k, d]) =>
    `\t${k} = {\n\t\tbase_cost = 1000\n\t\tlevel_cap = {\n${d.shares ? "\t\t\tshares_slots = yes\n" : ""}\t\t\tstate_max = ${d.stateMax}\n\t\t}\n\t}\n`).join("") + "}\n");
  // the states: one per brick row per tile, of the land below (an extra is in its brick's state)
  const groups = new Map();
  for (const id of allIds) {
    if (S.typeOf(id) !== "land") continue;
    const k = `${S.regionOf(id)}|${S.rowOf(id)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(id);
  }
  const states = [], capitalOf = {}, oobOf = {};
  let sid = 1;
  for (const [k, provs] of [...groups].sort((a, b) => a[1][0] - b[1][0])) {
    const owner = (S.firstPx(provs[0]) % W) < 384 ? "AAA" : "BBB";
    const capital = !capitalOf[owner];
    if (capital) capitalOf[owner] = sid;
    const s = { id: sid, owner, provinces: provs, category: sid % 2 ? "town" : "rural", manpower: 1000 * provs.length * (1 + (sid % 3)),
      resources: sid % 3 === 0 ? { steel: 2 + (sid % 4) } : {}, buildings: { infrastructure: 2, [sid % 2 ? "industrial_complex" : "arms_factory"]: (o.factories && o.factories[owner]) || 1 },
      vp: [provs[0], capital ? 20 : 5], region: +k.split("|")[0] };
    states.push(s);
    const res = Object.keys(s.resources).length ? `\tresources = { ${Object.entries(s.resources).map(([a, b]) => `${a} = ${b}`).join(" ")} }\n` : "";
    write(root, `history/states/${sid}-STATE_${sid}.txt`, `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = ${s.manpower}\n${res}\tstate_category = ${s.category}\n`
      + `\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t\tadd_core_of = ${owner}\n\t\tvictory_points = { ${s.vp[0]} ${s.vp[1]} }\n`
      + `\t\tbuildings = {\n${Object.entries(s.buildings).map(([a, b]) => `\t\t\t${a} = ${b}\n`).join("")}\t\t}\n\t}\n}\n`);
    sid++;
  }
  // an army each, one division on each of its first six provinces below (o.divisions: its first n)
  for (const t of Object.keys(capitalOf)) {
    const locs = states.filter((s) => s.owner === t).flatMap((s) => s.provinces).slice(0, (o.divisions && o.divisions[t]) || 6);
    oobOf[t] = locs;
    write(root, `history/units/${t}_1936.txt`, `division_template = {\n\tname = "Inf"\n\tregiments = {\n\t\tinfantry = { x = 0 y = 0 }\n\t}\n}\nunits = {\n`
      + locs.map((p, i) => `\tdivision = {\n\t\tname = "D${i + 1}"\n\t\tlocation = ${p}\n\t\tdivision_template = "Inf"\n\t}\n`).join("") + "}\n");
    write(root, `history/countries/${t} - Land of ${t}.txt`, `capital = ${capitalOf[t]}\noob = "${t}_1936"\n`);
  }
  // the scripts name the highest state below, so the generated world must reach it
  write(root, "events/base.txt", `namespace = base\ncountry_event = {\n\tid = base.1\n\toption = {\n\t\tname = base.1.a\n\t\t${sid - 1} = { add_core_of = ROOT }\n\t}\n}\n`);
  return { root, states, capitalOf, oobOf, lastState: sid - 1 };
}

/**
 * Delete map's mod at `root`: its own provinces.bmp (no extras), its own definition.csv with every row sea. o.ownRegions: it ships its
 * own strategic regions too, a file for each of the layer below's by the same name, naming its own provinces alone — as a map whose
 * definition.csv ends under the one beneath it does (Hearts of Minecraft ships its own), so no region that loads names an id it lacks.
 */
function makeMod(root, S, o = {}) {
  write(root, "descriptor.mod", `name="${o.name || "split world"}"\nreplace_path="history/states"\n`);
  if (o.ownRegions) {
    const byRegion = new Map();
    for (let id = 1; id <= S.N; id++) { const r = S.regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
    for (const [r, p] of byRegion) write(root, `map/strategicregions/${r}-REGION.txt`, regionText(r, p));
  }
  if (o.ownBmp !== false) write(root, "map/provinces.bmp", bmp24(W, H, (x, y) => S.colourOf(S.modIds[y * W + x])));
  if (o.ownDef !== false) {
    const ids = []; for (let id = 1; id <= S.N; id++) ids.push(id);
    write(root, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...ids.map((id) => defLine(id, S.colourOf(id), o.keepLand && o.keepLand.has(id) ? "land" : "sea"))].join(o.eol || "\n") + (o.eol || "\n"));
  }
  fs.mkdirSync(path.join(root, "history", "states"), { recursive: true });
  return root;
}

// ── the tests' own judges (not Nova's) ───────────────────────────────────────────────────────────────────────────────────────
/** definition.csv → { rows: Map(id → { colour, type, line }), ids: [ascending], byColour: Map(colour → [ids]) } */
function readDef(file) {
  const rows = new Map(), byColour = new Map();
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const c = line.split(";");
    if (c.length < 5 || !/^\d+$/.test(c[0])) continue;
    const id = +c[0], colour = ((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0;
    rows.set(id, { colour, type: String(c[4]).trim(), line });
    if (!byColour.has(colour)) byColour.set(colour, []);
    byColour.get(colour).push(id);
  }
  return { rows, ids: [...rows.keys()].sort((a, b) => a - b), byColour };
}
/** provinces.bmp decoded with a definition: every pixel's id, -1 where its colour is no row's. */
function decode(bmpFile, def) {
  const buf = fs.readFileSync(bmpFile), off = buf.readUInt32LE(10), w = buf.readInt32LE(18), h = buf.readInt32LE(22), rs = Math.floor((24 * w + 31) / 32) * 4;
  const ids = new Int32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = off + (h - 1 - y) * rs + x * 3, c = ((buf[o + 2] << 16) | (buf[o + 1] << 8) | buf[o]) >>> 0, at = def.byColour.get(c);
    ids[y * w + x] = at && at.length === 1 ? at[0] : -1;
  }
  return { W: w, H: h, ids };
}
/** 2 x 2 blocks holding four different provinces, the x seam wrapped */
function xCrossings(ids, w, h) {
  let n = 0;
  for (let y = 0; y + 1 < h; y++) for (let x = 0; x < w; x++) {
    const xr = (x + 1) % w, a = ids[y * w + x], b = ids[y * w + xr], c = ids[(y + 1) * w + x], d = ids[(y + 1) * w + xr];
    if (a !== b && a !== c && a !== d && b !== c && b !== d && c !== d) n++;
  }
  return n;
}
/** px per id */
function areas(ids) { const m = new Map(); for (const p of ids) m.set(p, (m.get(p) || 0) + 1); return m; }
/** The regions that load for a mod over one game: the mod's file of a name replaces the game's of that name. → Map(province → [region ids]) */
function regionsOf(mod, game) {
  const files = new Map();
  for (const r of [game, mod]) { const d = path.join(r, "map", "strategicregions"); if (fs.existsSync(d)) for (const f of fs.readdirSync(d)) if (/\.txt$/i.test(f)) files.set(f.toLowerCase(), path.join(d, f)); }
  const out = new Map();
  for (const file of files.values()) {
    const t = fs.readFileSync(file, "utf8").replace(/#[^\n]*/g, "");
    for (const m of t.matchAll(/strategic_region\s*=\s*\{[\s\S]*?\bid\s*=\s*(\d+)[\s\S]*?\bprovinces\s*=\s*\{([^}]*)\}/g)) {
      for (const p of (m[2].match(/\d+/g) || []).map(Number)) { if (!out.has(p)) out.set(p, []); out.get(p).push(+m[1]); }
    }
  }
  return out;
}
/** The mod's states: { id, provinces, owner, category, manpower, res, keys (state-level buildings), vpValues } */
function readStates(mod) {
  const dir = path.join(mod, "history", "states");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
    const res = {};
    for (const m of ((/\bresources\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").matchAll(/([a-z_]+)\s*=\s*(\d+)/g)) res[m[1]] = +m[2];
    const bi = t.search(/\bbuildings\s*=\s*\{/);
    let body = "";
    if (bi >= 0) { let d = 0; const open = t.indexOf("{", bi); for (let j = open; j < t.length; j++) { if (t[j] === "{") d++; else if (t[j] === "}") { d--; if (!d) { body = t.slice(open + 1, j); break; } } } }
    const keys = {};
    for (const m of body.replace(/\d+\s*=\s*\{[^{}]*\}/g, " ").matchAll(/([a-z_]+)\s*=\s*(\d+)/g)) keys[m[1]] = +m[2];
    return { file: f, id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], provinces: ((((/\bprovinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g) || []).map(Number),
      owner: (/\bowner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1] || "", category: (/\bstate_category\s*=\s*(\w+)/.exec(t) || [])[1] || "",
      manpower: +((/\bmanpower\s*=\s*(\d+)/.exec(t) || [])[1] || 0), res, keys,
      vpValues: [...t.matchAll(/victory_points\s*=\s*\{\s*(\d+)\s+(\d+)\s*\}/g)].map((m) => +m[2]).sort((a, b) => a - b) };
  }).sort((a, b) => a.id - b.id);
}

module.exports = { W, H, SEA_W, TERRAINS, write, bmp24, brickKey, makeShapes, makeGame, makeMod, defLine, regionText, readDef, decode, xCrossings, areas, regionsOf, readStates };
