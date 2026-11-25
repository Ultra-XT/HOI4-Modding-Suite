// ⛔ #a-victory-point-has-a-town — A NAMED PLACE IS A TOWN TO LOOK AT: A SMALL TOWN OF CITY GROUND AT A VICTORY POINT, ITS TERRAIN LEFT AS IT IS.
//
// The owner, playing TEST 38 (10-23): "many did not have a city gfx … same old issues". The base game gives city ground to the victory-point
// province of 24.2% of its states, and a generated world matches it (TEST 38: 227 of 1,081) — four named places in five on bare ground.
// Millennium Dawn gives 65.8% of its top victory points city ground, most of the rest of the way by a SMALL town (median 10 px, 4-22 at its
// deciles) in a province it leaves plains or forest; the game builds on city ground in any land province (cities.cpp's land gate is the type
// byte, 0x141652422 in 1.19.3). So the ONE writer the terrain tool paints its city look with (paintCityLooksForTerrain) gives such a town:
// the generator to every star it leaves on bare ground, and the state panel's 🏘 Town box to a victory point given by hand.
//
// Pinned on a two-layer world (an add-on over a layer below with two cities and one modder's 6 px town), with what the page sends:
//   0. a map with too few small towns of its own sizes them as Millennium Dawn's are (the measured list, read off the export);
//   1. each asked land province with no town gets ONE town of that size, of city ground only (definition.csv untouched), at its victory
//      point's marker (unitstacks type 38), else its middle — and no other pixel of terrain.bmp changes;
//   2. a river past the marker: the town holds a point the game builds on — on the game's own grid, counted from the BOTTOM row as
//      hoi4.exe counts it (review F1), its rivers.bmp box clear — and its answer counts those points as the game does;
//  2b. the grid's frame on its own: a river three rows under the marker's block (it built nothing there), on an even and an odd height;
//  2c. the game's SECOND pass (review RTP-1): the rule against a replay written from hoi4.exe, city by city on random ground; a town is
//      re-seeded until a point survives; on one map, with one request: a town beside another's ground is pulled off its own, a cities.bmp
//      index no group names builds nothing, a province with no spot says so and is left, ground whose points all fail is no town to keep,
//      and no town ticked takes a mesh from one standing;
//   3. beside another town's ground it is grown apart from it (a town of its own; the other's ground is unchanged); a province holding a
//      town, a city, or water is left as it is, and says why;
//  3b. …but a speck, or a town of its own the game builds nothing on, or a town's worth of a neighbour's ground it builds nothing on, is
//      no town to keep: a town is painted beside it (review F5);
//  3c. the Terrain brush making such a province a city grows the city round the town, to a city's size, every pixel of the town kept
//      as it was (review F2: it kept a village);
//   4. lit at night as the base game lights a small named place — its own texels, no glow round them (a city's glow, the CONTROL, reaches out);
//      its first 2 x 2 one whole texel of the colour map, so even a 4 px town is lit;
//  4b. no wood on it: the trees.bmp blocks over a town that hold a declared tree are made bare, and no other block changes;
//  4c. no light put out (review F7): a town under a brighter light keeps it, and a texel that reads as water keeps its colour and its light;
//   5. a whole Save's towns are ONE write of terrain.bmp, ONE of the colour map and ONE of trees.bmp, each backed up once;
//  5b. a colour map or trees.bmp that cannot be written stops the whole request before terrain.bmp (review RTP-2: the town stayed dark for good);
//   6. a map with twenty small towns of its own or more (4-39 px: a city's edge is no small town) sizes the new ones by them (review F4);
//   7. the page: the 🏘 box on a new victory point row is ticked, on a row the state had is not unless a town is queued for it; staging
//      queues one write of the ticked provinces with the state's id, and staged again REPLACES the state's own (review F3), as a deleted
//      state drops them; the Save sends every town of a run in ONE request, through server.js's own handler, a run that only a state's own
//      write stands in (review F6: no town is painted ahead of a write queued before it); its line says what was painted; a town write
//      that cannot run (terrain.bmp unreadable, the colour map read-only) stops the Save there with every town still queued.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-vp-town-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const dds = require("./dds-codec.js");
const P = require("./testlib-map-page.js");
const { BACKUP_DIR } = require("./safe-write.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const read8 = (file) => { const b = fs.readFileSync(file), W = b.readInt32LE(18), H = b.readInt32LE(22), off = b.readUInt32LE(10), rs = Math.floor((8 * W + 31) / 32) * 4; return (x, y) => b[off + (H - 1 - y) * rs + x]; };
function makeDds(W, H, format, levels, fn) {
  const compressed = format !== "RGB32";
  const h = Buffer.alloc(128);
  h.write("DDS ", 0, "latin1"); h.writeUInt32LE(124, 4);
  h.writeUInt32LE(0x1007 | (levels > 1 ? 0x20000 : 0) | (compressed ? 0x80000 : 0x8), 8);
  h.writeUInt32LE(H, 12); h.writeUInt32LE(W, 16);
  h.writeUInt32LE(compressed ? Math.max(1, Math.ceil(W / 4)) * Math.max(1, Math.ceil(H / 4)) * 16 : W * 4, 20);
  h.writeUInt32LE(levels, 28); h.writeUInt32LE(32, 76);
  if (compressed) { h.writeUInt32LE(0x4, 80); h.write(format, 84, "latin1"); }
  else { h.writeUInt32LE(0x41, 80); h.writeUInt32LE(32, 88); h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0xff000000, 104); }
  h.writeUInt32LE(0x1000 | (levels > 1 ? 0x400008 : 0), 108);
  let size = 128, w = W, hh = H;
  for (let l = 0; l < levels; l++) { size += compressed ? Math.max(1, Math.ceil(w / 4)) * Math.max(1, Math.ceil(hh / 4)) * 16 : w * hh * 4; w = Math.max(1, w >> 1); hh = Math.max(1, hh >> 1); }
  const buf = Buffer.alloc(size); h.copy(buf);
  const hdr = dds.parseDdsHeader(buf);
  for (let l = 0; l < hdr.levels; l++) {
    const { w: lw, h: lh } = hdr.lv[l], rgba = new Uint8Array(lw * lh * 4);
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) rgba.set(fn(x, y, l), (y * lw + x) * 4);
    dds.patchDdsLevel(buf, hdr, l, rgba, new Uint8Array(lw * lh).fill(1));
  }
  return buf;
}
const sha = (f) => require("crypto").createHash("sha1").update(fs.readFileSync(f)).digest("hex");

// ── the world: 8 x 4 provinces of 40 x 32 px, id = row * 8 + col + 1; rows 0-2 land, row 3 sea; 2 px to a texel ─────────────────
const CW = 40, RH = 32, COLS = 8, ROWS = 4, W = CW * COLS, H = RH * ROWS, TW = W / 2, TH = H / 2;
const PLAINS = 0, FOREST = 1, SPAWN = 13, OCEAN = 15, RIVER = 3;
const idAt = (c, r) => r * COLS + c + 1;
// ⛔ (review F7) one pixel of province 24 (row 2's last) stands in the sea row: the colour-map texel holding it, (150, 48), is three
// quarters sea, so it reads as WATER — a harbour's texel, lit (HARBOUR_LIGHT) as a shipping map lights the water off its ports
const NOSE = { x: 301, y: 96 }, HARBOUR = idAt(7, 2), HARBOUR_TEXEL = { X: NOSE.x >> 1, Y: NOSE.y >> 1 }, HARBOUR_LIGHT = [60, 96, 150, 90];
const provAt = (x, y) => (x === NOSE.x && y === NOSE.y ? HARBOUR : idAt(Math.floor(x / CW), Math.floor(y / RH)));
const cellOf = (id) => [(id - 1) % COLS, Math.floor((id - 1) / COLS)];
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const isLand = (id) => cellOf(id)[1] < 3;
const U1 = idAt(0, 0), U2 = idAt(6, 0);                       // two cities of the layer below
const B2 = idAt(1, 0), A = idAt(1, 1), R = idAt(2, 1), N = idAt(3, 2), K = idAt(5, 1), S = idAt(1, 3), Q = idAt(4, 2);
// U1's core runs to its right edge (x 30-39), so B2 beside it touches city ground at x 40
const inCore = (x, y) => { const p = provAt(x, y), lx = x % CW, ly = y % RH; if (p === U1) return lx >= 30 && ly >= 10 && ly < 16; if (p === U2) return lx >= 16 && lx < 24 && ly >= 13 && ly < 19; return false; };
const K_TOWN = (x, y) => provAt(x, y) === K && x % CW >= 30 && x % CW < 33 && y % RH >= 3 && y % RH < 5;   // a modder's own 6 px town in K
const Q_TOWN = (x, y) => provAt(x, y) === Q && x % CW >= 10 && x % CW < 13 && y % RH >= 20 && y % RH < 23; // and a 9 px one in Q (only in §6)
const MARK = new Map([[A, { lx: 9, ly: 10 }], [R, { lx: 20, ly: 16 }], [B2, { lx: 1, ly: 12 }], [K, { lx: 31, ly: 3 }], [U1, { lx: 34, ly: 12 }], [HARBOUR, { lx: 20, ly: 31 }]]);   // N has none
// ⛔ (review F7) a light brighter than a town's over N's middle, where N's town is painted: a modder's own, or a star the layer below lit
const BRIGHT = (X, Y) => provAt(2 * X, 2 * Y) === idAt(3, 2) && X >= 62 && X < 78 && Y >= 34 && Y < 46;
const markPx = (id) => { const m = MARK.get(id), [c, r] = cellOf(id); return { x: c * CW + m.lx, y: r * RH + m.ly }; };
const RIVER_X = markPx(R).x;   // a river runs down R's column, through its marker
const isRiver = (x, y) => x === RIVER_X && y >= RH && y < 2 * RH;
const terrainBelow = (x, y) => { const p = provAt(x, y); if (!isLand(p)) return OCEAN; if (inCore(x, y) || K_TOWN(x, y)) return SPAWN; return p === U1 || p === U2 ? FOREST : PLAINS; };
const stateOf = (id) => Math.floor(cellOf(id)[0] / 2) + 1;
const URBAN_RGB = [120, 110, 100], LAND_RGB = [150, 120, 60], SEA_RGB = [79, 102, 141];
const TREE = 6, treeBlock = (bx, by) => { const p = provAt(bx * 4, by * 4); return isLand(p) && cellOf(p)[1] === 1 && cellOf(p)[0] <= 3 ? TREE : 0; };

function makeGame() {
  const g = path.join(ROOT, "game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${isLand(id) ? `land;false;${id === U1 || id === U2 ? "urban" : "plains"};1` : "sea;false;ocean;0"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, terrainBelow));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (isLand(provAt(x, y)) ? 106 : 89)));
  write(g, "map/rivers.bmp", bmp8(W, H, (x, y) => (isRiver(x, y) ? RIVER : isLand(provAt(x, y)) ? 254 : 255)));
  write(g, "map/cities.txt", 'types_source = "map/cities.bmp"\npixel_step_x = 2 #2\npixel_step_y = 2 #2\n');
  // the wood: trees.bmp a quarter the size (a block is 4 x 4 px), a declared tree over every block of the middle row's first four
  // provinces (A and R among them), bare (0, the open water's index) everywhere else
  write(g, "map/trees.bmp", bmp8(W / 4, H / 4, treeBlock));
  write(g, "gfx/entities/trees.gfx", 'objectTypes = {\n\tpdxmesh = {\n\t\tname = "mapobject_6"\n\t\tfile = "gfx/mapitems/tree.mesh"\n\t}\n}\n');
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  forest = { color = { 0 120 0 } }", "  urban = { color = { 120 110 100 } }",
    "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  forest = { type = forest color = { 1 } }",
    "  forest_13 = { type = urban color = { 13 } texture = 10 spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  const vps = new Map([[1, [U1, B2, A]], [2, [R, N]], [3, [K, Q]], [4, [U2]]]);
  for (let s = 1; s <= 4; s++) {
    const provs = []; for (let r = 0; r < 3; r++) for (const c of [2 * s - 2, 2 * s - 1]) provs.push(idAt(c, r));
    write(g, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=100000\n\tstate_category=town\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${vps.get(s).map((p) => `${p} 3`).join(" ")} }\n\t}\n}\n`);
  }
  write(g, "map/unitstacks.txt", [...MARK.keys()].map((id) => { const p = markPx(id); return `${id};38;${p.x}.50;10.00;${H - 1 - p.y}.50;0.00;0.00`; }).join("\n") + "\n");
  const coreTexel = (X, Y) => inCore(2 * X, 2 * Y) || K_TOWN(2 * X, 2 * Y);
  const nearCore = (X, Y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = X + dx, y = Y + dy; if (x >= 0 && y >= 0 && x < TW && y < TH && coreTexel(x, y)) return true; } return false; };
  const texel = (X, Y) => ({ land: isLand(provAt(2 * X, 2 * Y)), core: coreTexel(X, Y), glow: nearCore(X, Y) });
  write(g, "map/terrain/colormap_rgb_cityemissivemask_a.dds", makeDds(TW, TH, "RGB32", 1, (X, Y) => { const t = texel(X, Y); return t.core ? [...URBAN_RGB, 173] : t.land ? [...LAND_RGB, BRIGHT(X, Y) ? 240 : t.glow ? 60 : 0] : X === HARBOUR_TEXEL.X && Y === HARBOUR_TEXEL.Y ? HARBOUR_LIGHT : [...SEA_RGB, 0]; }));
  for (const [n, s] of [["colormap_water_0.dds", 1], ["colormap_water_1.dds", 2], ["colormap_water_2.dds", 4]]) {
    write(g, "map/terrain/" + n, makeDds(TW / s, TH / s, "DXT5", 1, (X, Y) => (texel(X * s, Y * s).land ? [52 + ((X * 7 + Y * 13) % 17), 70, 60, 255] : [35, 59, 81, 255])));
  }
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 6, (X, Y, l) => (texel(Math.min(TW - 1, X << l), Math.min(TH - 1, Y << l)).land ? [132 + ((X * 5 + Y * 3) % 16), 132 + ((X * 5 + Y * 3) % 16), 132 + ((X * 5 + Y * 3) % 16), 21] : [90, 90, 90, 40])));
  return g;
}
const GAME = makeGame();
const CM = "map/terrain/colormap_rgb_cityemissivemask_a.dds";
let modN = 0;
const freshMod = (own = []) => { const m = path.join(ROOT, "mod" + (++modN)); write(m, "descriptor.mod", 'name="vp towns"\n'); for (const rel of own) write(m, rel, fs.readFileSync(path.join(GAME, rel))); return m; };
const pick = (mod, rel) => (fs.existsSync(path.join(mod, rel)) ? path.join(mod, rel) : path.join(GAME, rel));
const below = read8(path.join(GAME, "map/terrain.bmp"));
const changedPixels = (mod) => { const at = read8(pick(mod, "map/terrain.bmp")), out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) !== below(x, y)) out.push({ x, y, p: provAt(x, y), was: below(x, y), now: at(x, y) }); return out; };
const oneBlob = (list) => {
  const px = new Set(list.map(({ x, y }) => y * W + x)); if (!px.size) return false;
  const first = px.values().next().value, seen = new Set([first]), q = [first];
  while (q.length) { const i = q.shift(), x = i % W; for (const d of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) { const j = i + d; if (Math.abs((j % W) - x) > 1 || !px.has(j) || seen.has(j)) continue; seen.add(j); q.push(j); } }
  return seen.size === px.size;
};
const has2x2 = (list) => { const s = new Set(list.map(({ x, y }) => y * W + x)); return [...s].some((i) => (i % W) + 1 < W && s.has(i + 1) && s.has(i + W) && s.has(i + W + 1)); };
// ⛔ (review F1) THE GAME'S OWN RULE FOR A BUILT POINT, IN THE GAME'S OWN FRAME — written here from hoi4.exe, not from map-data.js.
// cities.cpp's first pass steps x and z from 0 by map/cities.txt's pixel_step (2 x 2), and z is the row counted from the BOTTOM of the map
// (its second pass places the mesh at (x, height, z), unflipped; Nova's buildingZToPixelY is the same flip): the point at top-down (x, y) is
// a grid point when x and H - 1 - y are both even. Its box dx, dz in [-2, 2) must hold no rivers.bmp pixel under 0xFE — top-down columns
// x - 2 .. x + 1 and rows y - 1 .. y + 2 — and a point within a step of the map's edge (x <= 2, z <= 2, x >= W - 2, z >= H - 2) skips the
// box (the check function, 0x1416f3d00 in 1.19.4.0; 0x141652f90 in 1.19.3). Counted top-down, a 2 x 2 block's point was taken
// to be its top-left pixel and its box checked two rows too high: a river three rows under a block left it building nothing.
const engineFrame = (WW, HH, rv) => {
  const boxClearAt = (x, y) => { for (let dz = -2; dz < 2; dz++) for (let dx = -2; dx < 2; dx++) { const xx = x + dx, yy = y - dz; if (xx >= 0 && yy >= 0 && xx < WW && yy < HH && rv(xx, yy) < 0xFE) return false; } return true; };
  const builds = (x, y) => { const z = HH - 1 - y; if (x % 2 || z % 2) return false; if (x <= 2 || z <= 2 || x >= WW - 2 || z >= HH - 2) return true; return boxClearAt(x, y); };
  return { boxClearAt, builds, points: (list) => list.filter(({ x, y }) => builds(x, y)).length };
};
const riverAt = read8(path.join(GAME, "map/rivers.bmp"));
const ENGINE = engineFrame(W, H, riverAt);
// ⛔ (review RTP-1) …AND ITS SECOND PASS, WRITTEN HERE FROM hoi4.exe 1.19.4.1 AS WELL (the city code 0x1416F2B60, the check 0x1416F40C0). The check:
// inside the map, spawn_city ground, and unless told not to, no rivers.bmp pixel under 0xFE in dx, dz in [-2, 2) (a point within a step of
// the edge skips that). Pass 1: at every grid point the check passes and a city_group names its cities.bmp index, the level is the first
// square ring round it holding no city ground, and the group needs a building of distance <= level. Pass 2, unless density is 0: sum over
// the 8 grid neighbours with a record (x wraps, z does not) of (dx, dz) * their level, made a unit vector when not zero, times density /
// level, added to (x, z) in float32 and truncated; the check, river box and all, at that landing, or no mesh. `groupOf(x, y)` is
// { density, distances } | null, `isCity` and `rv` top-down, as the bitmaps are read here. `sx`, `sy`: map/cities.txt's pixel_step.
const enginePasses = (WW, HH, isCity, rv, groupOf, sx = 2, sy = 2) => {
  const fr = Math.fround;
  const check = (x, z, noRiver) => {
    if (x < 0 || z < 0 || x >= WW || z >= HH || !isCity(x, HH - 1 - z)) return false;
    if (noRiver || !rv || x <= sx || z <= sy || x >= WW - sx || z >= HH - sy) return true;
    for (let dx = -sx; dx < sx; dx++) for (let dz = -sy; dz < sy; dz++) if (rv(x + dx, HH - 1 - (z + dz)) < 0xFE) return false;
    return true;
  };
  const recs = new Map();
  for (let z = 0; z < HH; z += sy) for (let x = 0; x < WW; x += sx) {
    if (!check(x, z, false)) continue;
    const g = groupOf(x, HH - 1 - z);
    if (!g) continue;
    let level = 1;
    rings: for (; level < 100; level++) {
      for (let d = -level; d <= level; d++) if (!check(x + d, z - level, true) || !check(x + d, z + level, true)) break rings;
      for (let d = 1 - level; d < level; d++) if (!check(x - level, z + d, true) || !check(x + level, z + d, true)) break rings;
    }
    if (g.distances.some((d) => d <= level)) recs.set(z * WW + x, { x, z, level, density: fr(g.density) });
  }
  const placed = new Set();
  for (const [k, r] of recs) {
    if (r.density === 0) { placed.add(k); continue; }
    let gx = 0, gz = 0;
    for (const [dx, dz] of [[-sx, -sy], [0, -sy], [sx, -sy], [-sx, 0], [sx, 0], [-sx, sy], [0, sy], [sx, sy]]) {
      const nz = r.z + dz;
      if (nz < 0 || nz >= HH) continue;
      let nx = r.x + dx;
      if (nx < 0) nx += WW; else if (nx >= WW) nx -= WW;
      const q = recs.get(nz * WW + nx);
      if (q) { gx = fr(gx + fr(dx * q.level)); gz = fr(gz + fr(dz * q.level)); }
    }
    if (gx !== 0 || gz !== 0) { const n = fr(Math.sqrt(fr(fr(gx * gx) + fr(gz * gz)))); gx = fr(gx / n); gz = fr(gz / n); }
    const k2 = fr(r.density / r.level);
    if (check(Math.trunc(fr(r.x + fr(gx * k2))), Math.trunc(fr(r.z + fr(gz * k2))), false)) placed.add(k);
  }
  const at = (x, y) => (HH - 1 - y) * WW + x;
  return { record: (x, y) => recs.has(at(x, y)), mesh: (x, y) => placed.has(at(x, y)), meshes: (list) => list.filter(({ x, y }) => placed.has(at(x, y))).length, records: recs.size, placed: placed.size };
};
const alphaImg = (file) => { const b = fs.readFileSync(file), h = dds.parseDdsHeader(b); return dds.decodeDdsLevel(b, h, 0); };
const MEASURED = md.VICTORY_POINT_TOWN_SIZES_MEASURED;
const resultOf = (r, id) => (r.results || []).find((x) => x.provinceId === id) || {};

console.log("\n-- 0. the sizes: a map with too few small towns of its own (here one) takes Millennium Dawn's, measured --");
{
  ok(Array.isArray(MEASURED) && MEASURED.length >= 2 && MEASURED.every((n, i) => n > 0 && (!i || n >= MEASURED[i - 1])), "(the measured list, read off the export: ascending, every size above 0)", MEASURED);
  const mod = freshMod();
  const model = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  const spawn = md.spawnCityTerrainIndices({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  const cities = md.cityTerrainCategories({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] });
  const z = md.victoryPointTownSizes({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], model, spawn, cities });
  ok(z.from === "measured" && JSON.stringify(z.sizes) === JSON.stringify([...MEASURED]), "⭐ K's one 6 px town is not a sample: the new towns are sized as Millennium Dawn's are", z);
  ok(JSON.stringify(md.cityMeshStep({ modRoot: mod, gameRoot: GAME, dependencyRoots: [] })) === JSON.stringify({ x: 2, y: 2 }), "…and the mesh step is map/cities.txt's, 2 x 2");
}

console.log("\n-- ⭐ 1. a town of city ground at each victory point, its terrain left as it is, and nothing else moves --");
const modA = freshMod();
const resA = md.paintVictoryPointTowns({ modRoot: modA, gameRoot: GAME, dependencyRoots: [], provinces: [A, R, N, B2, K, S, U1] });
const chA = changedPixels(modA);
{
  ok(resA && resA.changed && resA.painted === 4 && resA.asked === 7, "THE CONTROL: four towns painted of the seven asked", resA && { painted: resA.painted, kept: resA.kept, skipped: resA.skipped, error: resA.error });
  ok(!fs.existsSync(path.join(modA, "map/definition.csv")), "⭐⭐ definition.csv is not touched: each province keeps its terrain (city ground ONLY)");
  ok(chA.length > 0 && chA.every((c) => [A, R, N, B2].includes(c.p) && c.now === SPAWN && c.was === PLAINS), "⭐⭐⭐ every changed pixel of terrain.bmp is new city ground in one of the four, painted over its plains", chA.filter((c) => ![A, R, N, B2].includes(c.p) || c.now !== SPAWN).slice(0, 5));
  for (const id of [A, R, N, B2]) {
    const mine = chA.filter((c) => c.p === id), r = resultOf(resA, id);
    ok(r.changed && r.size && MEASURED.includes(r.size.px) && r.size.from === "measured" && mine.length === r.size.px,
      `⭐ province ${id}: ONE town of ${r.size && r.size.px} px — a size of the measured list — and exactly that many pixels`, { n: mine.length, size: r.size });
    ok(oneBlob(mine) && has2x2(mine), `…in one patch, holding a 2 x 2 block (a point of the mesh grid whichever corner it is counted from)`, mine.length);
  }
  const a = chA.filter((c) => c.p === A), m = markPx(A);
  ok(a.some((c) => Math.abs(c.x - m.x) <= 1 && Math.abs(c.y - m.y) <= 1) && resultOf(resA, A).painted.seededAt === "victory point", "⭐⭐ A's town stands at its victory point's marker (unitstacks type 38, where the game draws the name)", { mark: m, seeded: resultOf(resA, A).painted });
  ok(resultOf(resA, N).painted && resultOf(resA, N).painted.seededAt === "middle", "…and N, with no marker and no station, in its middle", resultOf(resA, N).painted);
}

console.log("\n-- ⭐ 2. a river past the marker: the town stands where the game will build (its grid, counted from the bottom) --");
{
  const m = markPx(R), r = chA.filter((c) => c.p === R);
  ok(!ENGINE.boxClearAt(m.x, m.y), "THE CONTROL: R's marker stands on the river — nothing the game builds within 2 px of it", m);
  ok(r.length && ENGINE.points(r) >= 1, "⭐⭐⭐ R's town holds a point the game builds on, on the game's own grid (x and z = H - 1 - y even, its river box clear)", ENGINE.points(r));
  const nearest = Math.min(...r.map((c) => Math.abs(c.x - m.x) + Math.abs(c.y - m.y)));
  ok(nearest <= 4, "…and still stands by its name (the nearest clear block)", nearest);
  ok(resultOf(resA, R).painted.points === ENGINE.points(r), "⭐ …and the answer counts exactly the points the game builds", { said: resultOf(resA, R).painted.points, game: ENGINE.points(r) });
  // (review F1) every town of §1, counted the game's way: each builds, and its answer says how many
  const per = [A, R, N, B2].map((id) => { const mine = chA.filter((c) => c.p === id); return { id, game: ENGINE.points(mine), said: (resultOf(resA, id).painted || {}).points }; });
  ok(per.every((p) => p.game >= 1 && p.said === p.game), "⭐⭐ every town painted holds a point the game builds on, and its answer counts them as the game does", per);
}

console.log("\n-- ⭐⭐ 2b. the grid's frame (review F1): a river three rows under the marker's block, on a map of even and of odd height --");
{
  // a field of land with one river row; the marker's 2 x 2 block on even x and y
  const field = (gw, gh, riverRow) => {
    const list = []; for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) list.push(y * gw + x);
    const rv = (x, y) => (y === riverRow ? RIVER : 254);
    return { list, rv, frame: engineFrame(gw, gh, rv) };
  };
  const pxOf = (gw, set) => [...set].map((i) => ({ x: i % gw, y: (i - (i % gw)) / gw }));
  {
    // height 20: the game's point in the block (10..11, 10..11) is (10, 11), whose box reaches row 13 — the river
    const gw = 24, gh = 20, f = field(gw, gh, 13);
    const block = [{ x: 10, y: 10 }, { x: 11, y: 10 }, { x: 10, y: 11 }, { x: 11, y: 11 }];
    ok(f.frame.points(block) === 0, "THE CONTROL: the marker's own block builds nothing on the game's grid (its point (10, 11)'s box holds the river at row 13)", block.map((p) => f.frame.builds(p.x, p.y)));
    const g = md.growVictoryPointTown(f.list, gw, gh, 4, { x: 10.5, y: 10.5 }, { x: 2, y: 2 }, f.rv, null);
    const town = g ? pxOf(gw, g.core) : [];
    ok(g && f.frame.points(town) >= 1, "⭐⭐⭐ a 4 px town there holds a point the game builds on", g && { seed: [g.seed % gw, Math.floor(g.seed / gw)], points: f.frame.points(town) });
    ok(g && g.points === f.frame.points(town), "⭐ …and its answer counts the points as the game does (it counted one where the game builds none)", g && { said: g.points, game: f.frame.points(town) });
    ok(g && g.fromPoint <= 2.1, "…and it stands by its name: the nearest block that builds, one block up", g && g.fromPoint);
  }
  {
    // height 21: H - 1 - y is even on EVEN rows, so the block's point is (10, 10), and its box (rows 9-12) clears a river at row 8
    const gw = 24, gh = 21, f = field(gw, gh, 8);
    ok(f.frame.builds(10, 10), "THE CONTROL: on an odd height the marker's own block builds (its point (10, 10)'s box, rows 9-12, clears the river at row 8)");
    const g = md.growVictoryPointTown(f.list, gw, gh, 4, { x: 10.5, y: 10.5 }, { x: 2, y: 2 }, f.rv, null);
    ok(g && g.seed === 10 * gw + 10 && g.points === f.frame.points(pxOf(gw, g.core)) && g.points >= 1, "⭐⭐ …so the town is seeded on it, at its name: the grid is the game's, not a wider box", g && { seed: [g.seed % gw, Math.floor(g.seed / gw)], points: g.points });
  }
  {
    // …and the answer's count is the game's where counting from the top gives another: towns of 5-12 px on a field with no river, whose
    // rows the two frames split differently (on an even height the game's points stand on the ODD rows counted from the top)
    const gw = 24, gh = 20, f = field(gw, gh, -1);
    const topLeft = (list) => list.filter(({ x, y }) => !(x % 2) && !(y % 2)).length;
    const per = [];
    for (let size = 5; size <= 12; size++) {
      const g = md.growVictoryPointTown(f.list, gw, gh, size, { x: 10.5, y: 10.5 }, { x: 2, y: 2 }, f.rv, null);
      const town = g ? pxOf(gw, g.core) : [];
      per.push({ size, said: g ? g.points : null, game: f.frame.points(town), topLeft: topLeft(town) });
    }
    ok(per.some((p) => p.topLeft !== p.game), "THE CONTROL: for some of them, counting from the top gives another number of points than the game builds", per);
    ok(per.every((p) => p.said === p.game), "⭐⭐ …and each answer counts the points the game builds", per);
  }
}

console.log("\n-- ⭐⭐⭐ 2c. the game's second pass (review RTP-1): a town the Save calls built keeps a point through it --");
// the city groups of §2c's maps, as a map/cities.txt writes them: Western's 0.9, 1.0, the base game's 0.00001, a 0, and one that only builds two rings in
const GROUPS = new Map([[1, { density: 0.9, distances: [1, 2, 3] }], [2, { density: 1, distances: [1, 2] }], [3, { density: 0.00001, distances: [1] }], [4, { density: 0, distances: [1] }], [5, { density: 0.4, distances: [2, 3] }]]);
const groupForNova = (g) => (g ? { density: g.density, nearest: Math.min(...g.distances) } : null);
const citiesTxt = () => 'types_source = "map/cities.bmp"\npixel_step_x = 2 #2\npixel_step_y = 2 #2\n' + [...GROUPS].map(([i, g]) => `city_group = {\n\tcolor_index = ${i} # color index in bmp palette\n\tdensity = ${g.density} # 0.1 # in fraction of pixels\n` + g.distances.map((d) => `\tbuilding = {\n\t\tdistance = ${d}\n\t\tmesh = {\n\t\t\t"house_${d}"\n\t\t}\n\t}\n`).join("") + "}\n").join("");
const STEP = { x: 2, y: 2 };
{
  console.log("  (the reader)");
  const M = freshMod();
  write(M, "map/cities.txt", citiesTxt() + '# city_group = { color_index = 7 density = 0.5 building = { distance = 1 } }\ncity_group = { color_index = 1 density = 0.1 building = { distance = 9 } }\ncity_group = { color_index = 6 building = { distance = 0.5 } }\ncity_group = { color_index = 8 density = 0.3 }\n');
  write(M, "map/cities.bmp", bmp8(W, H, (x) => (x < 40 ? 1 : x < 80 ? 7 : x < 120 ? 5 : x < 160 ? 6 : x < 200 ? 8 : 9)));
  const g = md.cityMeshGroups({ modRoot: M, gameRoot: GAME, dependencyRoots: [] });
  ok(g && g.W === W && g.H === H, "the groups are read over the picture map/cities.txt names, at the map's size", g && { W: g.W, H: g.H });
  ok(JSON.stringify(g.at(10, 10)) === JSON.stringify({ density: 0.9, nearest: 1 }), "⭐ an index two groups name is the first's, as the game walks them, its density and its nearest building", g.at(10, 10));
  ok(g.at(50, 10) === null && g.at(250, 10) === null, "⭐ an index no group names has none, a group in a comment among them", [g.at(50, 10), g.at(250, 10)]);
  ok(g.at(100, 10).nearest === 2 && g.at(100, 10).density === 0.4, "…a group whose buildings start two rings in says so", g.at(100, 10));
  ok(g.at(150, 10).nearest === 0 && g.at(150, 10).density === 0, "…Old World Blues' distance = 0.5 is read as the game reads an integer; no density is 0", g.at(150, 10));
  ok(g.at(190, 10).nearest === Infinity, "…and a group with no building builds nothing", g.at(190, 10));
  ok(md.cityMeshGroups({ modRoot: freshMod(), gameRoot: GAME, dependencyRoots: [] }) === null, "THE CONTROL: a map/cities.txt that names no group says nothing of them (the first pass alone is asked)");
  const M2 = freshMod();
  write(M2, "map/cities.txt", citiesTxt().replace("map/cities.bmp", () => "map/other.bmp"));
  ok(md.cityMeshGroups({ modRoot: M2, gameRoot: GAME, dependencyRoots: [] }) === null, "…nor one whose picture no layer has");
  write(M2, "map/other.bmp", bmp8(W, H, () => 2));
  ok(md.cityMeshGroups({ modRoot: M2, gameRoot: GAME, dependencyRoots: [] }).at(0, 0).density === 1, "…and the picture is the one types_source names");
}
{
  console.log("  (the rule, against the replay written from the exe, on random ground: every group, rivers, the seam, an even and an odd height)");
  const noise = (seed) => () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  let asked = 0, mesh = 0, lost = 0, wrong = [], seam = 0;
  for (const [gw, gh, seed] of [[64, 32, 7], [64, 33, 11], [96, 48, 23], [96, 49, 31], [48, 48, 42]]) {
    const r = noise(seed), city = new Uint8Array(gw * gh), river = new Uint8Array(gw * gh), index = new Uint8Array(gw * gh);
    for (let b = 0; b < gw * gh / 18; b++) {
      const x0 = Math.floor(r() * gw), y0 = Math.floor(r() * gh), w = 1 + Math.floor(r() * 6), h = 1 + Math.floor(r() * 6);
      for (let y = y0; y < Math.min(gh, y0 + h); y++) for (let x = x0; x < Math.min(gw, x0 + w); x++) city[y * gw + x] = 1;
    }
    for (let b = 0; b < gw * gh / 120; b++) river[Math.floor(r() * gh) * gw + Math.floor(r() * gw)] = 1;
    for (let y = 0; y < gh; y += 8) for (let x = 0; x < gw; x += 8) { const v = [1, 1, 2, 3, 4, 5, 9][Math.floor(r() * 7)]; for (let dy = 0; dy < 8 && y + dy < gh; dy++) for (let dx = 0; dx < 8 && x + dx < gw; dx++) index[(y + dy) * gw + x + dx] = v; }
    const isCity = (x, y) => !!city[y * gw + x], rv = (x, y) => (x >= 0 && y >= 0 && x < gw && y < gh && river[y * gw + x] ? RIVER : 254), groupOf = (x, y) => GROUPS.get(index[y * gw + x]) || null;
    const eng = enginePasses(gw, gh, isCity, rv, groupOf);
    const nova = md.cityMeshPointTest(gw, gh, STEP, rv, { isCity, groupAt: (x, y) => groupForNova(groupOf(x, y)) });
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      if (!isCity(x, y)) continue;
      asked++;
      if (eng.mesh(x, y)) mesh++;
      if (eng.record(x, y) && !eng.mesh(x, y)) lost++;
      if (eng.record(x, y) && (x < 3 || x >= gw - 3)) seam++;
      if (nova(x, y) !== eng.mesh(x, y) && wrong.length < 8) wrong.push({ gw, gh, x, y, nova: nova(x, y), game: eng.mesh(x, y) });
    }
  }
  ok(asked > 3000 && mesh > 100 && lost > 20 && seam > 10, "THE CONTROL: ground with hundreds of points, among them those the second pass drops, some at the seam", { asked, mesh, lost, seam });
  ok(wrong.length === 0, "⭐⭐⭐ cityMeshPointTest answers as the game does at every pixel of it", wrong);
  // the float: a push under half a float32 step of the point is no push; in a double it would be
  const gw = 2048, gh = 16, on = new Set([[4, 9], [6, 9], [998, 9], [1000, 9]].map(([x, y]) => y * gw + x));
  const lone = (density) => {
    const isCity = (x, y) => on.has(y * gw + x), g = { density, distances: [1] };
    const eng = enginePasses(gw, gh, isCity, null, () => g), nova = md.cityMeshPointTest(gw, gh, STEP, null, { isCity, groupAt: () => groupForNova(g) });
    return { low: [nova(6, 9), eng.mesh(6, 9)], high: [nova(1000, 9), eng.mesh(1000, 9)], left: [nova(4, 9), eng.mesh(4, 9)] };
  };
  const tiny = lone(0.00001);
  ok(tiny.low.every((v) => v === false) && tiny.high.every((v) => v === true), "⭐ float32, as the game adds: the base game's density 0.00001 pulls a point at x 6 off its ground and does nothing at x 1000", tiny);
  const nine = lone(0.9), one = lone(1), zero = lone(0);
  ok(nine.left.every((v) => v === true) && nine.low.every((v) => v === false), "…0.9: the point pushed up truncates back onto itself, the one pulled down lands on x - 1", nine);
  ok(one.left.every((v) => v === false), "…1.0: a push of a whole pixel lands on x + 1, which is no city ground here", one);
  ok(zero.low.every((v) => v === true), "…0: no second pass, and nothing is pulled", zero);
  // the seam: a point between a neighbour on its left and one over the map's edge is pushed neither way; counted without the wrap, it lands on x - 1
  {
    const sw = 64, row = new Set([[60, 9], [62, 9], [0, 9]].map(([x, y]) => y * sw + x)), isCity = (x, y) => row.has(y * sw + x), g = { density: 0.9, distances: [1] };
    const eng = enginePasses(sw, 16, isCity, null, () => g), nova = md.cityMeshPointTest(sw, 16, STEP, null, { isCity, groupAt: () => groupForNova(g) });
    ok(eng.mesh(62, 9) === true && nova(62, 9) === true, "⭐ …the grid neighbours wrap at the seam in x", { game: eng.mesh(62, 9), nova: nova(62, 9) });
    ok(eng.mesh(0, 9) === true && nova(0, 9) === true, "…and a point at x 0 pulled further down truncates back to 0", { game: eng.mesh(0, 9), nova: nova(0, 9) });
  }
}
{
  console.log("  (a town is re-seeded until a point survives)");
  const gw = 40, gh = 40, list = []; for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) list.push(y * gw + x);
  const S = new Set([7, 8].flatMap((x) => [10, 11].map((y) => y * gw + x))), blocked = new Set();
  for (const i of list) if (S.has(i) || [i - 1, i + 1, i - gw, i + gw].some((n) => S.has(n))) blocked.add(i);
  const tp = { x: 10.5, y: 10.5 }, g = { density: 0.9, distances: [1] }, ground = { isCity: (x, y) => S.has(y * gw + x), groupAt: () => groupForNova(g) };
  const px = (set) => [...set].map((i) => ({ x: i % gw, y: Math.floor(i / gw) }));
  const replay = (core) => enginePasses(gw, gh, (x, y) => S.has(y * gw + x) || core.has(y * gw + x), null, () => g);
  const g0 = md.growVictoryPointTown(list, gw, gh, 4, tp, STEP, null, blocked, null);
  ok(g0 && g0.seed === 10 * gw + 10 && g0.points === 1 && replay(g0.core).meshes(px(g0.core)) === 0, "THE CONTROL: at the marker, one pixel off the other town's ground, the first pass counts a point and the game places no mesh: the other's record pulls it onto the gap", g0 && { seed: [g0.seed % gw, Math.floor(g0.seed / gw)], said: g0.points, game: replay(g0.core).meshes(px(g0.core)) });
  const g1 = md.growVictoryPointTown(list, gw, gh, 4, tp, STEP, null, blocked, ground);
  ok(g1 && g1.points === 1 && replay(g1.core).meshes(px(g1.core)) === 1, "⭐⭐⭐ asked the whole rule, the town stands where a point survives, and its answer counts it", g1 && { seed: [g1.seed % gw, Math.floor(g1.seed / gw)], said: g1.points, game: replay(g1.core).meshes(px(g1.core)) });
  ok(g1 && g1.seed === 10 * gw + 12 && g1.fromPoint === 2, "⭐ …the nearest block that does: above and below the marker are pulled as well, by the same record", g1 && { seed: [g1.seed % gw, Math.floor(g1.seed / gw)], from: g1.fromPoint });
  // the town's own points push each other too: two diagonal blocks' worth of a province, nothing else free; each lands off the other
  const two = new Set([[10, 10], [11, 10], [10, 11], [11, 11], [12, 12], [13, 12], [12, 13], [13, 13]].map(([x, y]) => y * gw + x));
  const none = md.growVictoryPointTown([...two], gw, gh, 8, tp, STEP, null, null, { isCity: () => false, groupAt: () => groupForNova(g) });
  const firstOnly = md.growVictoryPointTown([...two], gw, gh, 8, tp, STEP, null, null, null);
  ok(firstOnly && firstOnly.points === 2 && none === null, "⭐⭐ a province whose every town loses every point gets none: null, where the first pass counts two", { firstOnly: firstOnly && firstOnly.points, none });
  // …and a block on ground no group names is not one
  const named = md.growVictoryPointTown(list, gw, gh, 4, tp, STEP, null, null, { isCity: () => false, groupAt: (x) => (x >= 20 ? groupForNova(g) : null) });
  ok(named && named.seed % gw === 20 && named.points === 1, "⭐ the nearest block of ground a group names is taken", named && { seed: [named.seed % gw, Math.floor(named.seed / gw)] });
}
{
  console.log("  (one map, one request, through the painter)");
  const MP = freshMod();
  const T = idAt(6, 2), LEFT = idAt(5, 2), UNNAMED = idAt(3, 2), NO_GROUP = idAt(7, 0), DIAG = idAt(4, 2), WORTH = idAt(4, 0), P6A = idAt(3, 1), P6B = idAt(4, 1), SEAMP = idAt(7, 1);
  ok(provAt(240, 74) === T && provAt(239, 74) === LEFT && provAt(319, 40) === SEAMP && provAt(0, 40) === idAt(0, 1), "(the fixture's provinces)");
  // T holds 2 px of its neighbour's town (x 238-240), whose point (240, 75) stands one pixel off the block at T's marker
  const SPILL = (x, y) => x >= 238 && x <= 240 && (y === 74 || y === 75);
  // DIAG's own town of two blocks touching at a corner, each point landing off the other block; WORTH's the same, both joined to the provinces beside it along rows with no grid point
  const D1 = (x, y) => x >= 170 && x <= 171 && y >= 74 && y <= 75, D2 = (x, y) => x >= 172 && x <= 173 && y >= 76 && y <= 77;
  const W1 = (x, y) => (x >= 170 && x <= 171 && y >= 10 && y <= 11) || (y === 10 && x >= 150 && x <= 171), W2 = (x, y) => (x >= 172 && x <= 173 && y >= 12 && y <= 13) || (y === 12 && x >= 172 && x <= 205);
  const SEAM_GROUND = (x, y) => x <= 1 && (y === 40 || y === 41);
  const extra = (x, y) => SPILL(x, y) || D1(x, y) || D2(x, y) || W1(x, y) || W2(x, y) || SEAM_GROUND(x, y);
  write(MP, "map/terrain.bmp", bmp8(W, H, (x, y) => (extra(x, y) ? SPAWN : terrainBelow(x, y))));
  write(MP, "map/cities.txt", citiesTxt());
  // index 9 (no group): the west of UNNAMED, under its marker, and the whole of NO_GROUP
  write(MP, "map/cities.bmp", bmp8(W, H, (x, y) => (provAt(x, y) === NO_GROUP || (provAt(x, y) === UNNAMED && x < 136) ? 9 : 1)));
  const MARKS = new Map([[T, [243, 74]], [UNNAMED, [131, 74]], [P6A, [157, 40]], [P6B, [162, 40]], [SEAMP, [317, 40]]]);
  write(MP, "map/unitstacks.txt", [...MARKS].map(([id, [x, y]]) => `${id};38;${x}.50;10.00;${H - 1 - y}.50;0.00;0.00`).join("\n") + "\n");
  const engineOn = (mod, more = null) => {
    const t = read8(pick(mod, "map/terrain.bmp")), ci = read8(path.join(mod, "map/cities.bmp")), rv = read8(pick(mod, "map/rivers.bmp"));
    return enginePasses(W, H, (x, y) => t(x, y) === SPAWN || (more && more(x, y)), rv, (x, y) => GROUPS.get(ci(x, y)) || null);
  };
  const before = engineOn(MP);
  const rect = (x0, x1, y0, y1) => { const out = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ x, y }); return out; };
  const inR = (r) => (x, y) => r.some((p) => p.x === x && p.y === y);
  // THE CONTROLS, on the map before the Save: what the first pass alone called built
  const oldT = rect(242, 243, 74, 75), oldU = rect(130, 131, 74, 75);
  const eT = engineOn(MP, inR(oldT)), eU = engineOn(MP, inR(oldU));
  ok(ENGINE.points(oldT) === 1 && eT.meshes(oldT) === 0, "THE CONTROL: the block at T's marker holds a point of the grid, and the record of its neighbour's town one pixel off pulls it onto the gap: no mesh", { first: ENGINE.points(oldT), game: eT.meshes(oldT) });
  ok(ENGINE.points(oldU) === 1 && eU.meshes(oldU) === 0, "THE CONTROL: the block at UNNAMED's marker holds a point of the grid, on an index no group names: no record, no mesh", { first: ENGINE.points(oldU), game: eU.meshes(oldU) });
  const diag = [...rect(170, 171, 74, 75), ...rect(172, 173, 76, 77)], worth = [...rect(170, 171, 10, 11), ...rect(172, 173, 12, 13)];
  ok(ENGINE.points(diag) === 2 && before.meshes(diag) === 0 && before.record(170, 75) && before.record(172, 77), "THE CONTROL: DIAG's own 8 px town holds two records the first pass counts, and the game places no mesh on them: each landing is off the other's block", { first: ENGINE.points(diag), game: before.meshes(diag) });
  ok(ENGINE.points(worth) === 2 && before.meshes(worth) === 0, "THE CONTROL: …and so is WORTH's ground, joined to its neighbours'", { first: ENGINE.points(worth), game: before.meshes(worth) });
  const K_PX = rect(230, 232, 35, 36);
  ok(before.meshes(K_PX) === 2, "THE CONTROL: K's own 6 px town keeps both its points", before.meshes(K_PX));

  const ASK = [T, UNNAMED, NO_GROUP, DIAG, WORTH, P6A, P6B, SEAMP, K];
  const r = md.paintVictoryPointTowns({ modRoot: MP, gameRoot: GAME, dependencyRoots: [], provinces: ASK });
  const after = engineOn(MP), at = read8(path.join(MP, "map/terrain.bmp"));
  const townOf = (id) => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === id && at(x, y) === SPAWN && !extra(x, y) && !K_TOWN(x, y)) out.push({ x, y }); return out; };
  const clearOf = (list, other) => { let d = Infinity; for (const a of list) for (const b of other) { const dx = Math.min(Math.abs(a.x - b.x), W - Math.abs(a.x - b.x)); d = Math.min(d, Math.max(dx, Math.abs(a.y - b.y))); } return d; };
  const allPx = (fn) => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (fn(x, y)) out.push({ x, y }); return out; };

  const pT = resultOf(r, T), tT = townOf(T);
  ok(pT.changed && pT.size.px === 4 && tT.length === 4, "(T's town is the smallest there is, 4 px: one point, nothing to fall back on)", { size: pT.size, n: tT.length });
  ok(pT.painted && pT.painted.points === 1 && after.meshes(tT) === 1, "⭐⭐⭐ T's town keeps its point: the game places the mesh, and the answer counts it", { said: pT.painted && pT.painted.points, game: after.meshes(tT) });
  ok(clearOf(tT, allPx(SPILL)) >= 3 && pT.painted.besideSpill && pT.painted.besideSpill.pixels === 2, "⭐⭐ …2 clear pixels from the other's ground, so neither pulls the other", { clear: clearOf(tT, allPx(SPILL)), spill: pT.painted.besideSpill });
  ok(pT.painted.fromPoint <= 2.1, "…and still by its name", pT.painted.fromPoint);

  const pU = resultOf(r, UNNAMED), tU = townOf(UNNAMED);
  ok(pU.changed && tU.every((p) => p.x >= 136) && pU.painted.points === 1 && after.meshes(tU) === 1, "⭐⭐⭐ UNNAMED's town stands on ground a group names, the nearest there is to its marker, and the game places its mesh", { res: pU.painted, game: after.meshes(tU), px: tU.slice(0, 4) });

  const pN = resultOf(r, NO_GROUP);
  ok(!pN.changed && !pN.kept && /map\/cities\.bmp/.test(pN.reason || "") && !townOf(NO_GROUP).length, "⭐⭐ a province whose ground no group names gets no town, says why, and is not painted", pN);
  const notes = vm.runInNewContext(P.lift("function victoryPointTownsNote(") + "\nvictoryPointTownsNote", {})(JSON.parse(JSON.stringify(r)));
  ok(notes.some((n) => n.startsWith(`⚠ Province ${NO_GROUP} got no town: `) && /map\/cities\.bmp/.test(n) && /move the victory point/.test(n)), "⭐⭐ …and the Save says so, and what to do", notes);

  const pD = resultOf(r, DIAG), tD = townOf(DIAG);
  ok(pD.changed && pD.painted && pD.painted.besideOwn && pD.painted.besideOwn.pixels === 8 && pD.painted.besideOwn.points === 0, "⭐⭐⭐ DIAG's own town the game places nothing on is not kept: a town is painted beside it, and the answer says what it held", pD.kept || pD.painted);
  ok(pD.painted && pD.painted.points >= 1 && after.meshes(tD) === pD.painted.points && allPx((x, y) => D1(x, y) || D2(x, y)).every(({ x, y }) => at(x, y) === SPAWN), "⭐⭐ …its mesh placed, the modder's ground left as it was", { said: pD.painted && pD.painted.points, game: after.meshes(tD) });

  const pW = resultOf(r, WORTH), tW = townOf(WORTH);
  ok(pW.changed && pW.painted && pW.painted.besideSpill && !pW.kept && after.meshes(tW) === pW.painted.points && pW.painted.points >= 1, "⭐⭐⭐ WORTH's 44 px of ground joined to its neighbours is not \"a town's worth\" with no mesh on it: it gets one", pW.kept || pW.painted);

  ok(resultOf(r, K).kept && resultOf(r, K).kept.points === 2, "THE CONTROL: K's town, whose points the game keeps, is kept, and counted as the game counts them", resultOf(r, K).kept);

  const t6a = townOf(P6A), t6b = townOf(P6B);
  ok(t6a.length && t6b.length && clearOf(t6a, t6b) >= 3, "⭐⭐⭐ two towns of one Save, marked 5 px apart over a border, stand 2 clear pixels apart: neither can pull the other", { clear: clearOf(t6a, t6b), a: t6a.length, b: t6b.length });
  const tS = townOf(SEAMP);
  ok(tS.length && clearOf(tS, allPx(SEAM_GROUND)) >= 3 && tS.every((p) => p.x <= 317), "⭐ …and over the map's seam, where the game's grid neighbours wrap", { clear: clearOf(tS, allPx(SEAM_GROUND)), maxX: Math.max(...tS.map((p) => p.x)) });

  const painted = ASK.map((id) => resultOf(r, id)).filter((x) => x.changed);
  ok(painted.length === 7 && r.points && r.points.none === 0 && painted.every((x) => x.painted.points >= 1), "⭐⭐ every town of the answer holds a point, and the answer's total says so", r.points);
  const said = painted.reduce((a, x) => a + x.painted.points, 0), game = ASK.reduce((a, id) => a + after.meshes(townOf(id)), 0);
  ok(said === game, "⭐⭐⭐ the answer's points are the meshes the game places on them, once all are painted", { said, game });
  let took = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (before.mesh(x, y) && !after.mesh(x, y)) took++;
  ok(before.placed > 10 && took === 0, "⭐⭐ and no town painted took a mesh from one that stood", { placedBefore: before.placed, took });
  // a coarser grid keeps its towns a step of ITS grid apart: a record a step off is a grid neighbour, however many pixels that is. Each map: a neighbour's 4 px of ground
  // with one point on it, and the block at the marker holding the grid's next point, where a town would keep its own mesh (the pull is towards the ground and truncates
  // back) and take the ground's (the pull is a step away, off its 2 columns or rows). The rule cannot see this: it asks of the town, and the town is fine.
  for (const [sx, sy, ground, block, stood] of [
    [4, 2, rect(240, 241, 74, 75), rect(236, 237, 74, 75), [240, 75]],
    [2, 4, rect(220, 221, 62, 63), rect(220, 221, 66, 67), [220, 63]],
  ]) {
    const M = freshMod(), G = inR(ground);
    write(M, "map/terrain.bmp", bmp8(W, H, (x, y) => (G(x, y) ? SPAWN : terrainBelow(x, y))));
    write(M, "map/cities.txt", citiesTxt().replace("pixel_step_x = 2", () => `pixel_step_x = ${sx}`).replace("pixel_step_y = 2", () => `pixel_step_y = ${sy}`));
    write(M, "map/cities.bmp", bmp8(W, H, () => 1));
    write(M, "map/unitstacks.txt", `${LEFT};38;${block[0].x}.50;10.00;${H - 1 - block[0].y}.50;0.00;0.00\n`);
    const on = (more = null) => { const t = read8(path.join(M, "map/terrain.bmp")), rv = read8(pick(M, "map/rivers.bmp")); return enginePasses(W, H, (x, y) => t(x, y) === SPAWN || (more && more(x, y)), rv, () => GROUPS.get(1), sx, sy); };
    const stoodBefore = on(), wouldTake = on(inR(block));
    const nearest = wouldTake.meshes(block);
    ok(stoodBefore.mesh(...stood) && nearest === 1 && !wouldTake.mesh(...stood), `THE CONTROL: on a grid of ${sx} x ${sy}, a town on the block at the marker keeps its mesh and takes the ground's`, { stood: stoodBefore.mesh(...stood), town: nearest, after: wouldTake.mesh(...stood) });
    const res = resultOf(md.paintVictoryPointTowns({ modRoot: M, gameRoot: GAME, dependencyRoots: [], provinces: [LEFT] }), LEFT), now = read8(path.join(M, "map/terrain.bmp"));
    const town = allPx((x, y) => provAt(x, y) === LEFT && now(x, y) === SPAWN), end = on();
    ok(res.changed && clearOf(town, ground) > Math.max(sx, sy) && end.mesh(...stood) && end.meshes(town) === res.painted.points && res.painted.points > 0, `⭐⭐ on a grid of ${sx} x ${sy}, the town stands a whole step clear of other city ground, and both keep their meshes`, { clear: clearOf(town, ground), stood: end.mesh(...stood), said: res.painted && res.painted.points, game: end.meshes(town) });
  }
}

console.log("\n-- ⭐ 3. beside another town, a town of its own; a town, a city or the sea is left as it is --");
{
  const b = chA.filter((c) => c.p === B2);
  const touches = b.some((c) => [[c.x - 1, c.y], [c.x + 1, c.y], [c.x, c.y - 1], [c.x, c.y + 1]].some(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && below(x, y) === SPAWN));
  ok(b.length && !touches, "⭐⭐ B2's town does not touch U1's city ground over the border: it is a town of its own", b.length);
  const at = read8(path.join(modA, "map/terrain.bmp"));
  let coreKept = true; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((inCore(x, y) || K_TOWN(x, y)) && at(x, y) !== SPAWN) coreKept = false;
  ok(coreKept, "⭐⭐ every existing city's and town's ground is exactly as it was (the owner likes the city sizes)");
  ok(resultOf(resA, K).kept && resultOf(resA, K).kept.why === "own" && !chA.some((c) => c.p === K), "⭐ K, holding a town of its own, is left as it is", resultOf(resA, K));
  ok(resultOf(resA, U1).kept && !chA.some((c) => c.p === U1), "⭐ U1, a city, is left as it is", resultOf(resA, U1));
  ok(!resultOf(resA, S).changed && /land/.test(resultOf(resA, S).reason || ""), "⭐ S, a sea province, gets no town — the game builds only on land", resultOf(resA, S));
}

console.log("\n-- ⭐ 3b. a speck, or a town the game builds nothing on, is not a town to keep (review F5) --");
{
  // P1 holds a 1 px speck of city ground of its own; P2 a 6 px town of its own that a river pixel 1 px off leaves building nothing.
  // K's 6 px town, which the game does build on, is the CONTROL.
  const P1 = idAt(3, 1), P2 = idAt(4, 1);
  const SPECK = (x, y) => x === 3 * CW + 20 && y === RH + 15;
  const P2_TOWN = (x, y) => x >= 4 * CW + 18 && x < 4 * CW + 21 && y >= RH + 14 && y < RH + 16;
  const P2_RIVER = (x, y) => x === 4 * CW + 19 && y === RH + 16;
  const M = freshMod();
  write(M, "map/terrain.bmp", bmp8(W, H, (x, y) => (SPECK(x, y) || P2_TOWN(x, y) ? SPAWN : terrainBelow(x, y))));
  write(M, "map/rivers.bmp", bmp8(W, H, (x, y) => (isRiver(x, y) || P2_RIVER(x, y) ? RIVER : isLand(provAt(x, y)) ? 254 : 255)));
  const E5 = engineFrame(W, H, read8(path.join(M, "map/rivers.bmp")));
  const p2town = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (P2_TOWN(x, y)) p2town.push({ x, y });
  const ktown = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (K_TOWN(x, y)) ktown.push({ x, y });
  ok(p2town.length === 6 && E5.points(p2town) === 0 && E5.points(ktown) >= 1, "THE CONTROL: P2's 6 px town builds nothing on the game's grid (a river within 2 px of each point), K's 6 px builds", { p2: E5.points(p2town), k: E5.points(ktown) });
  const r = md.paintVictoryPointTowns({ modRoot: M, gameRoot: GAME, dependencyRoots: [], provinces: [P1, P2, K] });
  const at = read8(path.join(M, "map/terrain.bmp"));
  const mine = (id) => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === id && at(x, y) === SPAWN && !SPECK(x, y) && !P2_TOWN(x, y)) out.push({ x, y }); return out; };
  const n1 = mine(P1), n2 = mine(P2);
  ok(resultOf(r, P1).changed && n1.length > 1 && E5.points(n1) >= 1, "⭐⭐ P1's 1 px speck is not a town: P1 gets one, which the game builds on", { res: resultOf(r, P1).kept || resultOf(r, P1).painted, n: n1.length });
  ok(resultOf(r, P2).changed && E5.points(n2) >= 1, "⭐⭐ P2's town the game builds nothing on is not kept as one: P2 gets a town the game builds on", { res: resultOf(r, P2).kept || resultOf(r, P2).painted, n: n2.length, points: E5.points(n2) });
  let keptOwn = true; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if ((SPECK(x, y) || P2_TOWN(x, y)) && at(x, y) !== SPAWN) keptOwn = false;
  const touches = (list, other) => list.some((c) => [[c.x - 1, c.y], [c.x + 1, c.y], [c.x, c.y - 1], [c.x, c.y + 1]].some(([x, y]) => other(x, y)));
  ok(keptOwn && !touches(n1, SPECK) && !touches(n2, P2_TOWN), "⭐ …each beside the modder's own ground, which is left exactly as it was", { keptOwn });
  ok(resultOf(r, P2).painted && resultOf(r, P2).painted.besideOwn && resultOf(r, P2).painted.besideOwn.pixels === 6 && resultOf(r, P2).painted.besideOwn.points === 0, "…and the answer says what it was painted beside", resultOf(r, P2).painted);
  ok(resultOf(r, K).kept && resultOf(r, K).kept.why === "own" && !mine(K).some((c) => !K_TOWN(c.x, c.y)), "THE CONTROL: K, whose own town the game builds on, is kept as it is", resultOf(r, K));
  // …and so is a town's worth of a NEIGHBOUR'S city ground the game builds nothing on: P3 holds a 1 px wide strip of 24 px at an odd x (no
  // point of the game's grid), joined to U2's core above it — kept as "a town's worth" where the game draws no town
  const P3 = idAt(6, 1), SX = 6 * CW + 21;
  const STRIP = (x, y) => x === SX && y >= 19 && y < RH + 24;   // 13 px in U2 down from its core (its rows 13-18), then 24 in P3
  const M3 = freshMod();
  write(M3, "map/terrain.bmp", bmp8(W, H, (x, y) => (STRIP(x, y) ? SPAWN : terrainBelow(x, y))));
  const strip3 = []; for (let y = RH; y < RH + 24; y++) strip3.push({ x: SX, y });
  ok(provAt(SX, RH) === P3 && provAt(SX, 18) === U2 && inCore(SX, 18) && ENGINE.points(strip3) === 0 && MEASURED.every((n) => n <= strip3.length),
    "THE CONTROL: P3's 24 px of city ground are joined to U2's core, hold no point the game builds on, and are a town's worth at any measured size", { points: ENGINE.points(strip3) });
  const r3 = md.paintVictoryPointTowns({ modRoot: M3, gameRoot: GAME, dependencyRoots: [], provinces: [P3] });
  const p3 = resultOf(r3, P3), at3 = read8(path.join(M3, "map/terrain.bmp"));
  const n3 = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === P3 && at3(x, y) === SPAWN && !STRIP(x, y)) n3.push({ x, y });
  ok(p3.changed && p3.painted && p3.painted.besideSpill && p3.painted.besideSpill.pixels === 24 && ENGINE.points(n3) >= 1 && !touches(n3, STRIP) && strip3.every(({ x, y }) => at3(x, y) === SPAWN),
    "⭐⭐ …so it is not kept as a town: P3 gets one the game builds on, beside the strip, which is left as it was", { res: p3.kept || p3.painted, points: ENGINE.points(n3) });
  const note = vm.runInNewContext(P.lift("function victoryPointTownsNote(") + "\nvictoryPointTownsNote", {})(Object.assign({}, r, { results: r.results }));
  ok(note.some((n) => /builds nothing/.test(n) && /\b12\b/.test(n) && /\b13\b/.test(n)), "⭐ the Save line says why a town was painted beside a province's own ground", note);
}

console.log("\n-- ⭐⭐ 3c. the brush makes a city of a province holding a town: the city grows round the town (review F2) --");
{
  const M = freshMod();
  md.paintVictoryPointTowns({ modRoot: M, gameRoot: GAME, dependencyRoots: [], provinces: [A] });
  const town = changedPixels(M).filter((c) => c.p === A);
  ok(town.length === 10, "THE CONTROL: A holds the 10 px town Nova gave it", town.length);
  const r = md.setProvinceDefinition({ modRoot: M, gameRoot: GAME, dependencyRoots: [], provinceId: A, terrain: "urban" });
  const cl = (r && r.cityLook) || {}, now = changedPixels(M).filter((c) => c.p === A);
  ok(cl.changed && cl.mode === "city" && cl.painted && now.length === cl.painted.size, "⭐⭐⭐ made urban, A holds a city of the core size — not the village it had", { mode: cl.mode, kept: cl.kept, painted: cl.painted, px: now.length });
  ok(town.every((t) => now.some((c) => c.x === t.x && c.y === t.y)) && oneBlob(now), "⭐⭐ …grown round the town, every pixel of which it keeps, in one patch", { lost: town.filter((t) => !now.some((c) => c.x === t.x && c.y === t.y)).length });
  ok(cl.painted && cl.painted.grownFrom && cl.painted.grownFrom.pixels === 10 && cl.painted.pixels === cl.painted.size - 10, "⭐ …and the answer says it grew round the town (only the new ground painted)", cl.painted);
  const notes = vm.runInNewContext(P.withNoteHelpers(P.lift("function terrainWriteNotes(")) + "\nterrainWriteNotes", {})(r, { url: "/api/map/set-province-terrain", body: { provinceId: A, terrain: "urban" } });
  ok(notes.some((n) => /round the 10 px town it held/.test(n)), "⭐ the Save line says so", notes);
  // THE CONTROL: a town of its own of a city's size already — the core size just painted — is left as it is
  const SIZE = cl.painted && cl.painted.size, M2 = freshMod();
  write(M2, "map/terrain.bmp", bmp8(W, H, (x, y) => { const lx = x % CW, ly = y % RH, k = (ly - 8) * 20 + (lx - 10); return provAt(x, y) === A && lx >= 10 && lx < 30 && ly >= 8 && k >= 0 && k < SIZE ? SPAWN : terrainBelow(x, y); }));
  const tb2 = sha(path.join(M2, "map/terrain.bmp"));
  const r2 = md.setProvinceDefinition({ modRoot: M2, gameRoot: GAME, dependencyRoots: [], provinceId: A, terrain: "urban" });
  ok(SIZE > 10 && r2.cityLook && !r2.cityLook.changed && r2.cityLook.kept && r2.cityLook.kept.why === "own" && r2.cityLook.kept.own === SIZE && sha(path.join(M2, "map/terrain.bmp")) === tb2,
    "THE CONTROL: a province holding a town of its own of a city's size already is left as it is", { size: SIZE, cityLook: r2.cityLook });
  // …and grown round, the town keeps its own ground, index and all, where that is not the city's: a mod whose terrain declares a second
  // city ground (14), A's 10 px town painted with it; the city grown round it is urban's (13, the index urban's provinces hold below)
  const M3 = freshMod();
  write(M3, "common/terrain/00_terrain.txt", fs.readFileSync(path.join(GAME, "common/terrain/00_terrain.txt"), "utf8")
    .replace("  ocean = { type = ocean color = { 15 } }", () => "  city_14 = { type = urban color = { 14 } spawn_city = yes }\n  ocean = { type = ocean color = { 15 } }"));
  const T14 = new Set(town.map(({ x, y }) => y * W + x));
  write(M3, "map/terrain.bmp", bmp8(W, H, (x, y) => (T14.has(y * W + x) ? 14 : terrainBelow(x, y))));
  const r3 = md.setProvinceDefinition({ modRoot: M3, gameRoot: GAME, dependencyRoots: [], provinceId: A, terrain: "urban" });
  const at3 = read8(path.join(M3, "map/terrain.bmp")), cl3 = (r3 && r3.cityLook) || {}, size3 = cl3.painted ? cl3.painted.size : -1;
  const city3 = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === A && (at3(x, y) === SPAWN || at3(x, y) === 14)) city3.push({ x, y, v: at3(x, y) });
  ok(cl3.changed && cl3.painted && cl3.painted.index === SPAWN && cl3.painted.grownFrom && cl3.painted.grownFrom.pixels === 10,
    "THE CONTROL: on a map with a second city ground, the city grown round A's 10 px town of it is painted with urban's", cl3.painted);
  ok(town.every((t) => at3(t.x, t.y) === 14) && city3.length === size3 && city3.filter((c) => c.v === SPAWN).length === size3 - 10,
    "⭐ …and the town's 10 px keep their own ground: not one of them is repainted", { kept14: town.filter((t) => at3(t.x, t.y) === 14).length, city: city3.length, size: size3 });
}

console.log("\n-- ⭐ 4. lit at night as a small named place: its own texels, no glow round them --");
{
  const now = alphaImg(path.join(modA, CM)), was = alphaImg(path.join(GAME, CM));
  const townTex = new Set(chA.map(({ x, y }) => (y >> 1) * TW + (x >> 1)));
  // a texel reads as city ground when most of its four pixels are (the colour map's own rule, textureMostOf4)
  const at = read8(path.join(modA, "map/terrain.bmp"));
  const urbanTex = [...townTex].filter((i) => { const X = i % TW, Y = (i - X) / TW; let n = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (at(2 * X + dx, 2 * Y + dy) === SPAWN) n++; return n >= 3; });
  ok(urbanTex.length >= 4 && urbanTex.every((i) => now[i * 4 + 3] > 0), `⭐⭐ the towns' texels that read as city ground are lit (${urbanTex.length})`, urbanTex.map((i) => now[i * 4 + 3]));
  // a 4 px town on a block straddling four texels gives each a quarter: none reads as city ground, and it stays dark (TEST 39a, 28 of 826)
  const perTown = [A, R, N, B2].map((id) => urbanTex.filter((i) => { const X = i % TW, Y = (i - X) / TW; return provAt(2 * X, 2 * Y) === id && now[i * 4 + 3] > 0; }).length);
  ok(perTown.every((n) => n >= 1), "⭐⭐ …and every town has one: its first 2 x 2 is one whole texel of the colour map, so even the smallest is lit", perTown);
  const seeds = [A, R, N, B2].map((id) => { const s = resultOf(resA, id).painted || {}; return s.seed; });
  ok(seeds.every((s) => Number.isInteger(s) && !((s % W) % 2) && !(Math.floor(s / W) % 2)), "…seeded on even x and y", seeds.map((s) => [s % W, Math.floor(s / W)]));
  const outside = []; for (let i = 0; i < TW * TH; i++) if (!townTex.has(i) && now[i * 4 + 3] !== was[i * 4 + 3]) outside.push(i);
  ok(outside.length === 0, "⭐⭐ …and no texel off them changed its light: no glow round a village", outside.slice(0, 8));
  // THE CONTROL: the terrain brush's city look on the same province glows round its core
  const modC = freshMod();
  md.setProvinceDefinition({ modRoot: modC, gameRoot: GAME, dependencyRoots: [], provinceId: A, terrain: "urban" });
  const cNow = alphaImg(path.join(modC, CM)), cCh = changedPixels(modC);
  const cTex = new Set(cCh.map(({ x, y }) => (y >> 1) * TW + (x >> 1)));
  let glow = 0; for (let i = 0; i < TW * TH; i++) if (!cTex.has(i) && cNow[i * 4 + 3] > was[i * 4 + 3]) glow++;
  ok(glow > 0, "THE CONTROL: a CITY the terrain brush paints on A does light the land round it (its glow) — the town does not", glow);
}

console.log("\n-- ⭐⭐ 4c. a town's light puts out no light that was there (review F7) --");
{
  const now = alphaImg(path.join(modA, CM)), was = alphaImg(path.join(GAME, CM));
  const townTex = [...new Set(chA.map(({ x, y }) => (y >> 1) * TW + (x >> 1)))];
  const nTex = townTex.filter((i) => provAt(2 * (i % TW), 2 * Math.floor(i / TW)) === N);
  ok(nTex.length >= 1 && nTex.every((i) => was[i * 4 + 3] === 240), "THE CONTROL: N's town is painted under a light brighter than a town's (240)", nTex.map((i) => was[i * 4 + 3]));
  const dimmed = townTex.filter((i) => now[i * 4 + 3] < was[i * 4 + 3]);
  ok(dimmed.length === 0, "⭐⭐ no texel of a town is darker than it was: a town lit at a town's brightness keeps a brighter light standing", dimmed.map((i) => ({ X: i % TW, Y: Math.floor(i / TW), was: was[i * 4 + 3], now: now[i * 4 + 3] })));
  // a town whose 8-neighbour growth takes the one pixel of its province standing in a texel that is three quarters sea
  const M = freshMod();
  const r = md.paintVictoryPointTowns({ modRoot: M, gameRoot: GAME, dependencyRoots: [], provinces: [HARBOUR] });
  const at = read8(path.join(M, "map/terrain.bmp"));
  ok(resultOf(r, HARBOUR).changed && at(NOSE.x, NOSE.y) === SPAWN, "THE CONTROL: the harbour province's town reaches its pixel in the sea row", { res: resultOf(r, HARBOUR).painted, nose: at(NOSE.x, NOSE.y) });
  const cm = fs.readFileSync(path.join(M, CM)), cmWas = fs.readFileSync(path.join(GAME, CM)), h = dds.parseDdsHeader(cm);
  const px = (b, i) => Array.from(dds.decodeDdsLevel(b, dds.parseDdsHeader(b), 0).slice(i * 4, i * 4 + 4));
  const ti = HARBOUR_TEXEL.Y * TW + HARBOUR_TEXEL.X;
  ok(!h.error && JSON.stringify(px(cmWas, ti)) === JSON.stringify(HARBOUR_LIGHT) && JSON.stringify(px(cm, ti)) === JSON.stringify(HARBOUR_LIGHT),
    "⭐⭐ the water texel it touched keeps its colour and its harbour light: a town on land repaints no sea", { was: px(cmWas, ti), now: px(cm, ti) });
  const land = [...new Set(changedPixels(M).filter((c) => c.p === HARBOUR).map(({ x, y }) => (y >> 1) * TW + (x >> 1)))].filter((i) => i !== ti);
  ok(land.length >= 1 && land.some((i) => px(cm, i)[3] > 0), "…while the town's own texels on land are lit", land.map((i) => px(cm, i)[3]));
}

console.log("\n-- ⭐⭐ 4d. a town painted in a pool of light puts none of it out: a town is no city taken away (review of the T39 merge, H-LOST-4) --");
{
  // The relight puts out the light on land within 8 texels of ground a CITY LEFT where no city ground is within 8 (dGoneAt: a texel
  // holding a pixel the city look repainted, its mask's 1 or 2, that does not read as city ground now and was lit). A small town's pixels
  // are the mask's 3, and a town is no city leaving, so its texels are not that ground: a town painted under a light (the layer below's
  // star over its victory point, a modder's own) puts out none of it. 4c's light over N ends before 8 texels past the town, where the
  // difference shows, so taking the town's texels for ground a city left changed no light a test read. Here every land texel is lit, and
  // the town is A's (10 px: N's 4 fill one texel, and a town with no texel short of city ground has no edge to measure from).
  const M = freshMod();
  write(M, CM, makeDds(TW, TH, "RGB32", 1, (X, Y) => (isLand(provAt(2 * X, 2 * Y)) ? [...LAND_RGB, 240] : [...SEA_RGB, 0])));
  const was = alphaImg(path.join(M, CM));
  const r = md.paintVictoryPointTowns({ modRoot: M, gameRoot: GAME, dependencyRoots: [], provinces: [A] });
  const at = read8(path.join(M, "map/terrain.bmp"));
  const townTex = [...new Set(changedPixels(M).filter((c) => c.p === A).map(({ x, y }) => (y >> 1) * TW + (x >> 1)))];
  // a texel reads as the index most of its four pixels carry, the top-left's on a tie (textureMostOf4's rule)
  const mostOf4 = (a, b, c, d) => (a === b || a === c || a === d ? a : b === c || b === d ? b : c === d ? c : a);
  const readsCity = (i) => { const X = i % TW, Y = (i - X) / TW; return mostOf4(at(2 * X, 2 * Y), at(2 * X + 1, 2 * Y), at(2 * X, 2 * Y + 1), at(2 * X + 1, 2 * Y + 1)) === SPAWN; };
  const edge = townTex.filter((i) => !readsCity(i)), city = townTex.filter(readsCity);
  const allCity = []; for (let i = 0; i < TW * TH; i++) if (readsCity(i)) allCity.push(i);
  // the lit land 8 or fewer texels from the town's edge and more than 8 from any city ground (U1's and U2's cores, K's town, its own),
  // as the relight measures it (chamfer 3-4)
  const dist = (i, j) => { const dx = Math.abs((i % TW) - (j % TW)), dy = Math.abs(Math.floor(i / TW) - Math.floor(j / TW)); return (3 * Math.max(dx, dy) + Math.min(dx, dy)) / 3; };
  const band = [];
  for (let i = 0; i < TW * TH; i++) if (isLand(provAt(2 * (i % TW), 2 * Math.floor(i / TW))) && was[i * 4 + 3] > 0 && edge.some((j) => dist(i, j) <= 8) && allCity.every((j) => dist(i, j) > 8)) band.push(i);
  ok(resultOf(r, A).changed && city.length > 0 && edge.length > 0 && band.length > 0,
    `THE CONTROL: A's town is painted under the light: ${city.length} of its texels read as city ground and ${edge.length} do not, and ${band.length} lit texels stand 8 or fewer from those and more than 8 from any city ground`,
    { painted: resultOf(r, A).painted, city: city.length, edge: edge.length, band: band.length });
  const now = alphaImg(path.join(M, CM)), dimmed = [];
  for (let i = 0; i < TW * TH; i++) if (now[i * 4 + 3] < was[i * 4 + 3]) dimmed.push(i);
  ok(dimmed.length === 0, `⭐⭐⭐ no texel is darker than it was, not one of the ${band.length} past the town's edge: a town's pixels are no ground a city left`,
    { dimmed: dimmed.length, band: dimmed.filter((i) => band.includes(i)).length, sample: dimmed.slice(0, 6).map((i) => [i % TW, Math.floor(i / TW), was[i * 4 + 3], now[i * 4 + 3]]) });
}

console.log("\n-- ⭐ 4b. no wood stands on a town: the trees.bmp blocks over it are cleared, and no other --");
{
  const tr = read8(pick(modA, "map/trees.bmp")), TRW = W / 4, TRH = H / 4;
  const under = new Set(chA.map(({ x, y }) => (y >> 2) * TRW + (x >> 2)));
  const wooded = [...under].filter((b) => treeBlock(b % TRW, Math.floor(b / TRW)) === TREE);
  ok(wooded.length >= 2 && chA.some((c) => c.p === A) && chA.some((c) => c.p === R), "(the fixture: A's and R's towns are painted under declared trees)", wooded.length);
  ok(wooded.every((b) => tr(b % TRW, Math.floor(b / TRW)) === 0), "⭐⭐ every block over a town that held a tree is bare now (the open water's index, as the map underneath paints it)", wooded.map((b) => tr(b % TRW, Math.floor(b / TRW))));
  let others = 0, stillWood = 0;
  for (let by = 0; by < TRH; by++) for (let bx = 0; bx < TRW; bx++) {
    if (under.has(by * TRW + bx)) continue;
    if (tr(bx, by) !== treeBlock(bx, by)) others++;
    if (treeBlock(bx, by) === TREE) stillWood++;
  }
  ok(others === 0 && stillWood > 0, "⭐ …and every other block is as it was: the wood round the towns stands", { others, stillWood });
  ok(resA.trees && resA.trees.cleared === wooded.length, "…and the answer counts them", resA.trees);
}

console.log("\n-- ⭐ 5. a Save's towns are ONE write of terrain.bmp and ONE of the colour map --");
{
  const M = freshMod(["map/terrain.bmp", CM, "map/trees.bmp"]);
  const before = { terrain: sha(path.join(M, "map/terrain.bmp")), cm: sha(path.join(M, CM)), trees: sha(path.join(M, "map/trees.bmp")) };
  const backups = () => { try { return fs.readdirSync(BACKUP_DIR); } catch (_) { return []; } };
  const was = backups();
  const r = md.paintVictoryPointTowns({ modRoot: M, gameRoot: GAME, dependencyRoots: [], provinces: [A, R, N, B2] });
  const mine = backups().filter((n) => !was.includes(n));
  const of = (file) => mine.filter((n) => n.endsWith(file.replace(/[\\/:]/g, "__")));
  ok(r.painted === 4, "THE CONTROL: four towns", r.painted);
  ok(of("map/terrain.bmp").length === 1 && of(CM).length === 1 && sha(path.join(BACKUP_DIR, of("map/terrain.bmp")[0])) === before.terrain && sha(path.join(BACKUP_DIR, of(CM)[0])) === before.cm,
    "⭐⭐ ONE backup of terrain.bmp and ONE of the colour map, each the file as it was", { terrain: of("map/terrain.bmp").length, cm: of(CM).length, all: mine });
  ok(of("map/trees.bmp").length === 1 && sha(path.join(BACKUP_DIR, of("map/trees.bmp")[0])) === before.trees && sha(path.join(M, "map/trees.bmp")) !== before.trees,
    "⭐ …and ONE of trees.bmp, the wood over the towns cleared in one write", of("map/trees.bmp").length);
  const pics = fs.readdirSync(path.join(M, "map/terrain"));
  ok(pics.length === 1, "…and no picture it does not change (the water tints, the fog) is copied into the mod", pics);
}

console.log("\n-- ⭐⭐ 5b. a picture a town goes on to write that cannot be written stops it before terrain.bmp (review RTP-2) --");
{
  for (const [name, rel] of [["the colour map", CM], ["trees.bmp", "map/trees.bmp"]]) {
    const M = freshMod(["map/terrain.bmp", CM, "map/trees.bmp"]);
    const target = path.join(M, rel), files = ["map/terrain.bmp", CM, "map/trees.bmp"].map((f) => path.join(M, f));
    const shas = () => files.map(sha).join();
    const was = shas();
    fs.chmodSync(target, 0o444);
    let r;
    try { r = md.paintVictoryPointTowns({ modRoot: M, gameRoot: GAME, dependencyRoots: [], provinces: [A, N] }); }
    finally { fs.chmodSync(target, 0o644); }
    ok(r && !r.changed && r.painted === 0 && /^No town was painted: /.test(r.error || "") && (r.error || "").includes(path.basename(rel)) && /try again/.test(r.error || ""), `⭐⭐ ${name} read-only: no town is painted, and the answer says why, to the file`, r && { painted: r.painted, error: r.error });
    ok(shas() === was, "⭐⭐⭐ …and terrain.bmp is untouched: nothing stands that a second tick would refuse", name);
    const r2 = md.paintVictoryPointTowns({ modRoot: M, gameRoot: GAME, dependencyRoots: [], provinces: [A, N] });
    const lit = alphaImg(path.join(M, CM)), town = changedPixels(M).filter((c) => c.p === A && !(c.x & 1) && !(c.y & 1));
    ok(r2.painted === 2 && r2.lit === true && !r2.error, "⭐ writable again, the same request paints them, and lights them", { painted: r2.painted, lit: r2.lit, error: r2.error });
    ok(town.some(({ x, y }) => lit[((y >> 1) * TW + (x >> 1)) * 4 + 3] > 0), "…so no town stays dark", town.length);
  }
  // a tick that writes nothing is not stopped by a file it would not have written; a file the mod does not own yet is made, as ever
  const M = freshMod(["map/terrain.bmp", CM]);
  const cm = path.join(M, CM);
  fs.chmodSync(cm, 0o444);
  let kept;
  try { kept = md.paintVictoryPointTowns({ modRoot: M, gameRoot: GAME, dependencyRoots: [], provinces: [K] }); }
  finally { fs.chmodSync(cm, 0o644); }
  ok(kept && !kept.error && kept.kept === 1, "THE CONTROL: with the colour map read-only, a province that already holds a town is kept and nothing stops: nothing was to be written", kept && { kept: kept.kept, error: kept.error });
  const M2 = freshMod();
  const made = md.paintVictoryPointTowns({ modRoot: M2, gameRoot: GAME, dependencyRoots: [], provinces: [A] });
  ok(made.painted === 1 && made.lit === true && fs.existsSync(path.join(M2, CM)), "THE CONTROL: a colour map the mod does not own yet is no refusal: the write makes its copy", { painted: made.painted, lit: made.lit });
}

console.log("\n-- ⭐ 6. a map with small towns of its own sizes the new ones by them — when it has enough of them, and only its SMALL ones --");
{
  const sizesOf = (M) => {
    const model = md.buildMapModel({ modRoot: M, gameRoot: GAME, dependencyRoots: [] });
    const spawn = md.spawnCityTerrainIndices({ modRoot: M, gameRoot: GAME, dependencyRoots: [] });
    return md.victoryPointTownSizes({ modRoot: M, gameRoot: GAME, dependencyRoots: [], model, spawn, cities: md.cityTerrainCategories({ modRoot: M, gameRoot: GAME, dependencyRoots: [] }) });
  };
  // (review F4) two samples are not a map's towns: Rise of Nations' 16 victory points with city ground of their own are 20-194 px, its
  // cities' edges, and a map of two would size every new town by two
  const M0 = freshMod();
  write(M0, "map/terrain.bmp", bmp8(W, H, (x, y) => (Q_TOWN(x, y) ? SPAWN : terrainBelow(x, y))));
  const z0 = sizesOf(M0);
  ok(z0.from === "measured" && JSON.stringify(z0.sizes) === JSON.stringify([...MEASURED]), "⭐⭐ two victory points of its own with a town (K 6 px, Q 9 px) are too few to learn from: Millennium Dawn's measured sizes", z0);
  // a mod whose every ordinary land province is a victory point, 20 of them holding a small town of their own (K's 6 px and nineteen
  // of 4-39 px), one a 50 px town (a city's size: not a small town) and A a 3 px speck (no town at all)
  const ordinary = []; for (let id = 1; id <= COLS * ROWS; id++) if (isLand(id) && id !== U1 && id !== U2) ordinary.push(id);
  const others = ordinary.filter((id) => id !== K && id !== A);
  const BIG = others[19], SPECK3 = A;
  const sizeFor = new Map(others.slice(0, 19).map((id, k) => [id, 4 + 2 * k]));   // 4, 6, … 40 px is one too many: 19 of them, 4-39
  sizeFor.set(others[18], 39);
  const own = (x, y) => {
    const id = provAt(x, y), lx = x % CW, ly = y % RH;
    const n = id === BIG ? 50 : id === SPECK3 ? 3 : sizeFor.get(id) || 0;
    if (!n) return false;
    const k = (ly - 8) * 10 + (lx - 8);   // a block 10 px wide from (8, 8) of the province, row by row
    return lx >= 8 && lx < 18 && ly >= 8 && k >= 0 && k < n;
  };
  const mkStates = (M, vpIds) => {
    for (let s = 1; s <= 4; s++) {
      const provs = []; for (let r2 = 0; r2 < 3; r2++) for (const c of [2 * s - 2, 2 * s - 1]) provs.push(idAt(c, r2));
      const vps = provs.filter((p) => vpIds.includes(p));
      write(M, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=100000\n\tstate_category=town\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${vps.map((p) => `${p} 3`).join(" ")} }\n\t}\n}\n`);
    }
  };
  // …on a map whose plains are not mostly towns, as no real map's are: cityTerrainCategories calls a terrain a CITY when more than half
  // of its land provinces hold city ground, and over a generated world with a town at every star no ordinary terrain comes near it
  // (TEST 39a: marsh 14.3% the most). So this mod draws the lower half of each land province as a province of its own, bare plains — a
  // map has many more provinces than victory points — and the 22 provinces holding city ground are fewer than half of its 46 plains.
  const HALF = COLS * ROWS;
  const halved = (M) => {
    write(M, "map/provinces.bmp", bmp24(W, H, (x, y) => { const p = provAt(x, y); return colour(isLand(p) && y % RH >= RH / 2 ? p + HALF : p); }));
    const rows = ["0;0;0;0;land;false;unknown;0"];
    for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${isLand(id) ? `land;false;${id === U1 || id === U2 ? "urban" : "plains"};1` : "sea;false;ocean;0"}`);
    for (let id = 1; id <= COLS * ROWS; id++) if (isLand(id)) rows.push(`${id + HALF};${colour(id + HALF).join(";")};land;false;plains;1`);
    write(M, "map/definition.csv", rows.join("\n") + "\n");
  };
  const M20 = freshMod();
  write(M20, "map/terrain.bmp", bmp8(W, H, (x, y) => (own(x, y) ? SPAWN : terrainBelow(x, y))));
  halved(M20);
  mkStates(M20, [...ordinary, U1, U2]);
  ok(!md.cityTerrainCategories({ modRoot: M20, gameRoot: GAME, dependencyRoots: [] }).has("plains"), "(the fixture: its plains are an ordinary terrain, not a city one)");
  const want = [6, ...[...sizeFor.values()]].sort((a, b) => a - b);
  const z20 = sizesOf(M20);
  ok(z20.from === "this map" && z20.towns === 20 && JSON.stringify(z20.sizes) === JSON.stringify(want), "⭐⭐ twenty victory points of its own with a small town (4-39 px): those are the sizes — the 50 px town and the 3 px speck are not among them", { z: z20, want });
  const M19 = freshMod();
  write(M19, "map/terrain.bmp", bmp8(W, H, (x, y) => (own(x, y) && provAt(x, y) !== others[0] ? SPAWN : terrainBelow(x, y))));
  halved(M19);
  mkStates(M19, [...ordinary, U1, U2]);
  ok(sizesOf(M19).from === "measured", "THE CONTROL: nineteen are too few: Millennium Dawn's", sizesOf(M19).from);
  const r = md.paintVictoryPointTowns({ modRoot: M20, gameRoot: GAME, dependencyRoots: [], provinces: [A] });
  const n = changedPixels(M20).filter((c) => c.p === A && !own(c.x, c.y)).length;
  ok(r.painted === 1 && want.includes(n) && r.from === "this map", "⭐ …and A, whose 3 px speck is no town, gets one of them", { n, from: r.from, res: resultOf(r, A) });
}

console.log("\n-- ⭐ 7. the page: the 🏘 box, the staged write, ONE request a Save, through server.js's own handler, and what the Save says --");
{
  // fake rows of the state panel's victory-point list, read through the page's own functions
  const row = (prov, val, town) => { const els = { ".mi-vp-prov": { value: String(prov) }, ".mi-vp-val": { value: String(val) }, ".mi-vp-town": { checked: town } }; return { querySelector: (s) => els[s] || null }; };
  const panel = (rows) => ({ querySelectorAll: () => rows });
  ok(/class="mi-vp-town" type="checkbox"/.test(P.lift("function vpRowHtml(")) && !/\son[a-z]+=/i.test(P.lift("function vpRowHtml(")), "the victory-point row carries a 🏘 Town checkbox (and no inline handler: CSP)");
  // addVpRow ticks a new row's box; renderVpRows leaves the rows the state had unticked
  const list = { rows: [], insertAdjacentHTML() { const r = P.element("div"); r.querySelector = (s) => { r.kids = r.kids || {}; if (!r.kids[s]) r.kids[s] = P.element("input"); return r.kids[s]; }; this.rows.push(r); }, get lastElementChild() { return this.rows[this.rows.length - 1]; }, set innerHTML(v) { this.rows = []; } };
  const rp = P.runPage(["function addVpRow(", "function renderVpRows("], { $: () => list, wireVpDel() {}, updateSaveButton() {}, vpRowHtml: () => "", pendingWrites: [] });
  rp.sb.renderVpRows([{ province: 5, value: 3 }]); rp.sb.addVpRow(9);
  ok(list.rows.length === 2 && list.rows[0].querySelector(".mi-vp-town").checked === false && list.rows[1].querySelector(".mi-vp-town").checked === true,
    "⭐⭐ a victory point added by hand has its box ticked; one the state already had does not", list.rows.map((r) => r.querySelector(".mi-vp-town").checked));
  // (review F3) …unless a town is queued for it: the panel shows what the Save will paint
  const rq = P.runPage(["function addVpRow(", "function renderVpRows("], { $: () => list, wireVpDel() {}, updateSaveButton() {}, vpRowHtml: () => "",
    pendingWrites: [{ url: "/api/map/victory-point-towns", body: { stateId: 1, provinces: [5] }, meta: {} }] });
  rq.sb.renderVpRows([{ province: 5, value: 3 }, { province: 6, value: 1 }]);
  ok(list.rows.length === 2 && list.rows[0].querySelector(".mi-vp-town").checked === true && list.rows[1].querySelector(".mi-vp-town").checked === false,
    "⭐⭐ a row whose victory point has a town queued shows its box ticked; one with none, unticked", list.rows.map((r) => r.querySelector(".mi-vp-town").checked));
  // staging the panel: set-state, then ONE town write of the ticked provinces; staged again, a province is asked once
  const pending = [];
  const ids = { miNameInp: "x", miOwnerSel: "", miCoresInp: "", miManpowerInp: "1", miCategoryInp: "town", miNavalBase: "0" };
  let rows = [row(A, 3, true), row(N, 3, false), row(R, 3, true)];
  // (⛔ #a-panel-edit-sends-what-the-modder-changed — the panel stages what changed since it was shown: shown here as a state with none of these
  // victory points, and shown again as staged after each staging, as the page's rebaselineStateForm does)
  const st = P.runPage(["function collectVps(", "function readStateForm(", "function stageStateWrite(", "async function saveState("], {
    $: (id) => (id === "miVpList" ? panel(rows) : { value: ids[id] || "" }), document: { querySelectorAll: () => [] },
    selected: null, recolorAll() {}, draw() {}, showInfo() {},
    pendingWrites: pending, pushUndo() { st.sb.undos = (st.sb.undos || 0) + 1; }, stateFormBaseline: null, rebaselineStateForm() { st.sb.stateFormBaseline = { stateId: 1, provinceId: undefined, shown: st.sb.readStateForm() }; },
    stateById: new Map([[1, { id: 1, name: "S1", provinces: [] }]]), provinceToOwner: {},
    countrySelect: { options: [] }, queueWrite: (url, body) => pending.push({ url, body, meta: {} }),
  });
  { const added = rows; rows = []; st.sb.rebaselineStateForm(); rows = added; }
  st.sb.stageStateWrite(1, undefined);
  ok(pending.length === 2 && pending[0].url === "/api/map/set-state" && pending[1].url === "/api/map/victory-point-towns" && JSON.stringify(pending[1].body.provinces) === JSON.stringify([A, R]) && pending[1].body.stateId === 1,
    "⭐⭐ staging the panel queues the state's write, then one town write of the ticked victory points, the state's own", pending.map((w) => [w.url, w.body.stateId, w.body.provinces]));
  ok(JSON.stringify(pending[0].body.fields.victoryPoints) === JSON.stringify([{ province: A, value: 3 }, { province: N, value: 3 }, { province: R, value: 3 }]),
    "⭐ …and the state's own write sends every victory point as a province and a value, as it always has (the box is not a field of it)", pending[0].body.fields.victoryPoints);
  // (review F3) staged again with A's row deleted and Q's added: the state's towns are the panel's as it stands — no town for A is left
  rows = [row(R, 3, true), row(Q, 3, true)];
  st.sb.stageStateWrite(1, undefined);
  const townW = () => pending.filter((w) => w.url === "/api/map/victory-point-towns");
  ok(townW().length === 1 && JSON.stringify(townW()[0].body.provinces) === JSON.stringify([R, Q]) && townW()[0].body.stateId === 1,
    "⭐⭐⭐ …and staged again, the state's queued towns are the boxes as they stand: a row deleted since leaves no town queued for it", townW().map((w) => [w.body.stateId, w.body.provinces]));
  rows = [row(R, 3, false), row(Q, 3, true)];
  st.sb.stageStateWrite(1, undefined);
  ok(townW().length === 1 && JSON.stringify(townW()[0].body.provinces) === JSON.stringify([Q]), "⭐⭐ …a box unticked since leaves none", townW().map((w) => w.body.provinces));
  ok(pending.filter((w) => w.url === "/api/map/set-state").length === 2, "⭐⭐ …and a box alone is an edit of the panel's: its towns are staged again, and no state write, for no field of the state changed (#a-panel-edit-sends-what-the-modder-changed)", pending.map((w) => w.url));
  rows = [row(R, 3, false), row(Q, 3, false)];
  st.sb.stageStateWrite(1, undefined);
  ok(townW().length === 0, "⭐ …and with every box unticked, the state has no town write left", townW().map((w) => w.body.provinces));
  // another state's queued town for a province this panel now lists (moved here since) is the panel's to decide
  pending.push({ url: "/api/map/victory-point-towns", body: { stateId: 2, provinces: [N, K] }, meta: {} });
  rows = [row(N, 3, false), row(R, 3, true)];
  st.sb.stageStateWrite(1, undefined);
  ok(JSON.stringify(townW().map((w) => [w.body.stateId, w.body.provinces])) === JSON.stringify([[2, [K]], [1, [R]]]), "⭐ …and a province of this panel queued by another state's write is the panel's: unticked here, it is taken off that one", townW().map((w) => [w.body.stateId, w.body.provinces]));
  // ⛔ #a-save-walks-the-queue — …while a Save runs a click only adds (test-an-edit-made-while-a-save-runs.js section 6): a town queued earlier may be on its way, and only the Save
  // takes a write out. The boxes ticked now are queued behind it, none asked twice; a box unticked stays queued, as the panel shows when it refills (above), until the Save has painted it.
  pending.length = 0;
  rows = [row(A, 3, true), row(R, 3, true)];
  st.sb.stageStateWrite(1, undefined);
  const inFlight = townW()[0];
  st.sb.flushMapSaves = Object.assign(function () {}, { running: Promise.resolve() });
  rows = [row(A, 3, false), row(R, 3, true), row(Q, 3, true)];
  st.sb.stageStateWrite(1, undefined);
  ok(townW().length === 2 && townW()[0] === inFlight && JSON.stringify(inFlight.body.provinces) === JSON.stringify([A, R]) && JSON.stringify(townW()[1].body.provinces) === JSON.stringify([Q]),
    "⭐⭐⭐ with a Save running, staging the panel takes no town write out and asks no province twice: the box ticked now is queued behind it", townW().map((w) => [w.body.stateId, w.body.provinces]));
  rows = [row(A, 3, false), row(R, 3, false), row(Q, 3, true)];
  st.sb.stageStateWrite(1, undefined);
  ok(townW().length === 2 && pending.filter((w) => w.url === "/api/map/set-state").length === 2, "⭐ …with every box ticked already on its way, nothing more is queued: no town, and no state write, for no field of the state changed (#a-panel-edit-sends-what-the-modder-changed)", pending.map((w) => [w.url, w.body.provinces || null]));
  st.sb.flushMapSaves.running = null;
  rows = [row(A, 3, false), row(R, 3, true), row(Q, 3, true)];
  st.sb.stageStateWrite(1, undefined);
  ok(townW().length === 1 && JSON.stringify(townW()[0].body.provinces) === JSON.stringify([R, Q]), "THE CONTROL: with the Save ended, the state's queued towns are the boxes as they stand again", townW().map((w) => [w.body.stateId, w.body.provinces]));
  // (review of the T39 merge, S-untick) …and what the click says, through the panel's own Save state button: a box unticked while a Save
  // runs stages nothing, so it is no "edited" and no Undo step, and the line says the Save paints that town all the same; with a field
  // changed too, the field is staged and the line says both
  pending.length = 0; st.sb.selected = { stateId: 1, provinceId: undefined };
  const lineNow = () => st.statuses[st.statuses.length - 1] || "", queueNow = () => JSON.stringify(pending.map((w) => [w.url, w.body]));
  rows = [row(A, 3, true), row(R, 3, true)];
  st.sb.saveState();
  ok(townW().length === 1 && JSON.stringify(townW()[0].body.provinces) === JSON.stringify([A, R]) && lineNow() === "State 1 edited — click 💾 Save to write it to your mod.",
    "THE CONTROL: with no Save running, the button stages the state's two towns and says the state was edited", { towns: townW().map((w) => w.body.provinces), line: lineNow() });
  st.sb.flushMapSaves = Object.assign(function () {}, { running: Promise.resolve() });
  const undos0 = st.sb.undos || 0, queue0 = queueNow();
  rows = [row(A, 3, false), row(R, 3, true)];
  st.sb.saveState();
  ok(queueNow() === queue0 && (st.sb.undos || 0) === undos0 && !/edited/.test(lineNow()) && lineNow().includes(`The 🏘 town of province ${A} is in the Save that is running, so it is painted all the same`),
    "⭐⭐⭐ with a Save running, a box unticked stages nothing and says so: not \"edited\", no Undo step, and that the Save paints its town all the same",
    { queueKept: queueNow() === queue0, undos: (st.sb.undos || 0) - undos0, line: lineNow() });
  st.sb.flushMapSaves.running = null; pending.length = 0;
  rows = [row(A, 3, true), row(R, 3, true)];
  st.sb.saveState();
  st.sb.flushMapSaves.running = Promise.resolve();
  ids.miManpowerInp = "7";
  rows = [row(A, 3, false), row(R, 3, true)];
  st.sb.saveState();
  ok(pending.filter((w) => w.url === "/api/map/set-state").length === 1 && townW().length === 1 && JSON.stringify(townW()[0].body.provinces) === JSON.stringify([A, R])
    && lineNow().startsWith("State 1 edited — click 💾 Save to write it to your mod. ") && lineNow().includes(`The 🏘 town of province ${A} is in the Save that is running`),
    "⭐⭐ …and with a field changed too, the field is staged, the town stays queued, and the line says both", { queue: pending.map((w) => [w.url, w.body.provinces || null]), line: lineNow() });
  ids.miManpowerInp = "1";
  // …and the line of the panel going away with that box unticked — Inspect another state, a tool, nothing selected: the review's own click
  // (showInfo's staging of it, run as the page has it)
  {
    const { stripJsComments } = require("./testlib-strip-comments.js");
    const MAPJS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
    const head = "if (!stagingStateForm && panelIsGoingAway && stateFormDirty()) {", tail = "} finally { stagingStateForm = false; }";
    const g0 = MAPJS.indexOf(head), g1 = g0 < 0 ? -1 : MAPJS.indexOf(tail, g0), g2 = g1 < 0 ? -1 : MAPJS.indexOf("}", g1 + tail.length);
    const goingAway = g0 >= 0 && g1 > g0 && g2 > g1 && MAPJS.indexOf(head, g0 + 1) < 0 ? MAPJS.slice(g0, g2 + 1) : "";
    ok(!!goingAway && /stageStateWrite\(b\.stateId, b\.provinceId\)/.test(goingAway), "(showInfo's staging of a panel going away is found, once)", goingAway.slice(0, 200));
    st.sb.flushMapSaves.running = null; pending.length = 0;
    rows = [row(A, 3, true), row(R, 3, true)];
    st.sb.saveState();
    st.sb.flushMapSaves.running = Promise.resolve();
    rows = [row(A, 3, false), row(R, 3, true)];
    const n0 = st.statuses.length, queue1 = queueNow();
    if (goingAway) vm.runInContext("var stagingStateForm = false, panelIsGoingAway = true, stateFormDirty = () => true;\n" + goingAway, st.sb);
    const said = st.statuses.slice(n0);
    ok(said.length === 1 && !/edited/.test(said[0]) && said[0].includes(`The 🏘 town of province ${A} is in the Save that is running, so it is painted all the same`) && queueNow() === queue1,
      "⭐⭐⭐ …and the panel going away with that box unticked says the same, where it said \"State 1 edited — click 💾 Save to write it to your mod.\" with nothing staged", said);
  }
  st.sb.flushMapSaves.running = null;
  // a deleted state takes its queued towns with it (the Delete button's real-state branch, run as the page has it)
  {
    const { stripJsComments } = require("./testlib-strip-comments.js");
    const MAPJS = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
    // (the last `} else {` before the line that says the state is marked for deletion: a tempered match, so it cannot start at an earlier one)
    // (…set directly, or through the const the click hands on to warnOfScriptNamedState: #an-id-the-scripts-name-goes-back-to-its-country)
    const del = /\} else \{((?:(?!\} else \{)[\s\S])*?)(?:setStatus\(|const \w+ = )`State \$\{sid\} marked for deletion/.exec(MAPJS);
    ok(!!del && /queueWrite\("\/api\/map\/delete-state", \{ stateId: sid \}\)/.test(del[1]), "(the Delete button's real-state branch is found)", del && del[1].slice(0, 300));
    const ctx = { sid: 1, pendingWrites: [{ url: "/api/map/set-state", body: { stateId: 1, fields: {} }, meta: {} }, { url: "/api/map/victory-point-towns", body: { stateId: 1, provinces: [A] }, meta: {} },
      { url: "/api/map/victory-point-towns", body: { stateId: 2, provinces: [N] }, meta: {} }], queueWrite(url, body) { ctx.pendingWrites.push({ url, body, meta: {} }); }, setStatus() {} };
    if (del) vm.runInNewContext(del[1], ctx);
    ok(del && JSON.stringify(ctx.pendingWrites.map((w) => [w.url, w.body.stateId, w.body.provinces || null])) === JSON.stringify([["/api/map/set-state", 1, null], ["/api/map/victory-point-towns", 2, [N]], ["/api/map/delete-state", 1, null]]),
      "⭐⭐ a state deleted takes its queued towns with it; another state's stay", ctx.pendingWrites.map((w) => [w.url, w.body.stateId, w.body.provinces || null]));
  }
  // the Save: every town write of it in ONE request, through server.js's own handler (no port bound)
  const SERVER = fs.readFileSync(path.join(__dirname, "server.js"), "utf8").replace(/\r\n/g, "\n");
  const at = SERVER.indexOf('app.post("/api/map/victory-point-towns"'), end = at < 0 ? -1 : SERVER.indexOf("\n  app.", at + 10);
  ok(at >= 0 && end > at, "(server.js's /api/map/victory-point-towns handler is found)", { at, end });
  const routes = {};
  if (at >= 0 && end > at) vm.runInNewContext(SERVER.slice(at, end), {
    app: { post: (url, mw, fn) => { routes[url] = fn; } }, express: { json: () => null }, mapData: md, DEV_ROOT: "<dev>",
    getActiveRoot: () => "", checkActiveRootNotGameRoot() {}, resolveHoi4GameRoot: () => GAME, resolveDependencyRootsForAssets: () => [],
  });
  // one Save of `queue` into `mod`, through the page's own flushMapSaves: what it posted, and the page (its queue, what it said)
  const saveThrough = (queue, mod) => {
    const posted = [];
    const fetchFake = async (url, opts) => {
      const body = JSON.parse(opts.body); posted.push({ url, body });
      if (url !== "/api/map/victory-point-towns") return { json: async () => ({ ok: true }) };
      let status = 200, json = null;
      routes[url]({ body }, { status(c) { status = c; return this; }, json(j) { json = j; return this; } });
      return { json: async () => Object.assign({ httpStatus: status }, JSON.parse(JSON.stringify(json))) };
    };
    const page = P.runPage([
      ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
      "function markSaveBoundary", "function terrainWriteNotes(",
      ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
    ], P.loadGlobals({
      console, JSON, pendingWrites: queue, paintDiff: new Map(), stateById: new Map(), model: { states: [] },
      window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: () => true },
      setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => mod, isVanillaTarget: () => false, renderCheckpoints: () => {},
      stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {}, remapQueuedStateId: () => {}, remapLocalStateId: () => {},
      adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {},
      mapCrashGate: async ({ writeWarnings, stopped }) => { page.said = { writeWarnings, stopped }; return ""; },
      fetch: fetchFake,
    }));
    return await0(page.sb.flushMapSaves()).then(() => ({ posted, page }));
  };
  const M = freshMod();
  const queue = [{ url: "/api/map/victory-point-towns", body: { provinces: [A] }, meta: {} }, { url: "/api/map/set-state", body: { stateId: 2, fields: {} }, meta: {} }, { url: "/api/map/victory-point-towns", body: { provinces: [R, N] }, meta: {} }];
  // a mod whose terrain.bmp cannot be read (a folder stands where the file goes): the town write cannot run
  const MF = freshMod();
  fs.mkdirSync(path.join(MF, "map", "terrain.bmp"), { recursive: true });
  const queueF = [{ url: "/api/map/set-state", body: { stateId: 2, fields: {} }, meta: {} }, { url: "/api/map/victory-point-towns", body: { provinces: [A] }, meta: {} }, { url: "/api/map/victory-point-towns", body: { provinces: [R] }, meta: {} }];
  // (review F6) a town queued, then a write the towns after it may need (province 300 made land), then another state's town: each town
  // goes where it was queued — the run of them that only a state's own write stands between goes as one, and no further
  const M6 = freshMod();
  const queue6 = [{ url: "/api/map/set-state", body: { stateId: 1, fields: {} }, meta: {} }, { url: "/api/map/victory-point-towns", body: { stateId: 1, provinces: [A] }, meta: {} },
    { url: "/api/map/set-province-terrain", body: { provinceId: 300, terrain: "plains", type: "land" }, meta: {} },
    { url: "/api/map/set-state", body: { stateId: 2, fields: {} }, meta: {} }, { url: "/api/map/victory-point-towns", body: { stateId: 2, provinces: [R] }, meta: {} }];
  // (review RTP-2) a mod whose colour map is read-only: the Save stops at the town, which stays queued
  const ML = freshMod([CM]), queueL = [{ url: "/api/map/victory-point-towns", body: { stateId: 1, provinces: [A] }, meta: {} }];
  let failed = null, six = null, darkStop = null, darkAgain = null;
  fs.chmodSync(path.join(ML, CM), 0o444);
  saveThrough(queueL, ML).then((l) => { darkStop = l; darkStop.terrainWritten = fs.existsSync(path.join(ML, "map/terrain.bmp")); fs.chmodSync(path.join(ML, CM), 0o644); return saveThrough(queueL, ML); }).then((l2) => { darkAgain = l2; return saveThrough(queueF, MF); }).then((f) => { failed = f; return saveThrough(queue6, M6); }).then((s6) => { six = s6; return saveThrough(queue, M); }).then(({ posted, page }) => {
    {
      const said = (darkStop.page.said || {}).stopped || "";
      ok(/^Save stopped at step 1: No town was painted: /.test(said) && said.includes("colormap_rgb_cityemissivemask_a.dds") && !darkStop.terrainWritten, "⭐⭐ the colour map read-only: the Save STOPS at the town, says which file, and map/terrain.bmp is not written", said);
      ok(darkStop.posted.length === 1 && darkAgain.posted.length === 1, "(each Save sent the one request)", [darkStop.posted.length, darkAgain.posted.length]);
      ok(fs.existsSync(path.join(ML, "map/terrain.bmp")) && darkAgain.page.sb.pendingWrites.length === 0 && ((darkAgain.page.said || {}).writeWarnings || []).some((n) => /lit at night/.test(n)), "⭐⭐ …and Save again, the file writable, paints it and lights it, from the queue the first Save left", (darkAgain.page.said || {}).writeWarnings);
    }
    {
      const order = six.posted.map((p) => (p.url === "/api/map/victory-point-towns" ? "towns " + p.body.provinces.join(",") : p.url.replace("/api/map/", "") + (p.body.stateId != null ? " " + p.body.stateId : p.body.provinceId != null ? " " + p.body.provinceId : "")));
      ok(JSON.stringify(order) === JSON.stringify(["set-state 1", `towns ${A}`, "set-province-terrain 300", "set-state 2", `towns ${R}`]) && six.page.sb.pendingWrites.length === 0,
        "⭐⭐⭐ every write keeps its place in the order: a town is not painted ahead of a write queued before it (the province made land)", order);
    }
    // a town write that could not run stops the Save there, every town of it still queued, as any write that fails does
    {
      const fp = failed.posted.filter((p) => p.url === "/api/map/victory-point-towns"), said = failed.page.said || {}, left = failed.page.sb.pendingWrites;
      ok(fp.length === 1 && JSON.stringify(fp[0].body.provinces) === JSON.stringify([A, R]), "(a Save into a mod whose terrain.bmp cannot be read sends its towns in one request)", fp.map((p) => p.body.provinces));
      ok(/^Save stopped at step 2: No town was painted: /.test(String(said.stopped || "")), "⭐⭐ a town write that could not run STOPS the Save there, and says why", said.stopped);
      ok(left.length === 2 && left.every((w) => w.url === "/api/map/victory-point-towns"), "⭐⭐ …with every town of it still queued, so Save again paints them (the state's write before it is done)", left.map((w) => [w.url, w.body.provinces]));
      ok(!fs.existsSync(path.join(MF, CM)) && !fs.existsSync(path.join(MF, "map/trees.bmp")), "…and nothing was written in its place");
    }
    const towns = posted.filter((p) => p.url === "/api/map/victory-point-towns");
    ok(towns.length === 1 && JSON.stringify(towns[0].body.provinces) === JSON.stringify([A, R, N]) && page.sb.pendingWrites.length === 0,
      "⭐⭐⭐ the Save sends every town of it in ONE request, and the queue empties", { towns: towns.map((p) => p.body.provinces), left: page.sb.pendingWrites.length, posted: posted.map((p) => p.url) });
    const ch = changedPixels(M);
    ok([A, R, N].every((id) => ch.some((c) => c.p === id)), "⭐⭐ …and server.js's handler painted all three", [A, R, N].map((id) => ch.filter((c) => c.p === id).length));
    const notes = (page.said && page.said.writeWarnings) || [];
    ok(notes.some((n) => /painted a small town of city ground at 3 victory points/.test(n) && /map\/terrain\.bmp/.test(n) && /lit at night/.test(n) && /Millennium Dawn/.test(n) && /keeps its terrain/.test(n)),
      "⭐ the Save line says what it painted, how big, that it is lit, and that the terrain is kept", notes);
    ok(notes.some((n) => /^🌲 \d+ blocks? of map\/trees\.bmp over the new towns (was|were) cleared/.test(n)), "⭐ …and that the trees over them were cleared", notes);
    // the Generate land line says the towns too (generatedCitiesNote, run from public/map.js)
    const note = vm.runInNewContext(P.lift("function generatedCitiesNote(") + "\ngeneratedCitiesNote", {});
    const said = note({ cities: { provinces: 2, fromLayerBelow: true, towns: { changed: true, asked: 5, painted: 4, kept: 1, skipped: 0, px: { min: 4, median: 10, max: 22 }, from: "measured" } }, heightmap: { terrain: { cities: { coreArea: 40 } } } });
    ok(/4 other victory points have a small town at their names \(4–22 px of city ground, the size Millennium Dawn gives its smaller places\)/.test(said) && /their provinces' terrain left as it is/.test(said), "⭐ Generate land's line says how many small towns it gave the other victory points", said);
    const said1 = note({ cities: { provinces: 2, fromLayerBelow: true, towns: { changed: true, asked: 1, painted: 1, kept: 0, skipped: 0, px: { min: 8, median: 8, max: 8 }, from: "measured" } }, heightmap: { terrain: { cities: { coreArea: 40 } } } });
    ok(/1 other victory point has a small town at its name \(8–8 px/.test(said1) && /the province's terrain left as it is/.test(said1), "…in the singular for one", said1);
  }).catch((e) => ok(false, "the Save ran", String((e && e.stack) || e).slice(0, 600))).finally(() => {
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
    process.exit(fail ? 1 : 0);
  });
}
function await0(p) { return Promise.resolve(p); }
