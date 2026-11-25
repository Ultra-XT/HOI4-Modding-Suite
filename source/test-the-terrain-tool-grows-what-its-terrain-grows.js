// ⛔ #the-terrain-tool-grows-what-its-terrain-grows — A PROVINCE THE TERRAIN TOOL MAKES FOREST GROWS A FOREST ON THE MAP, AND ONE IT TAKES
// FOREST FROM LOSES ITS TREES (review of the tools' ground, M2).
//
// The 🏔 Terrain brush and the province inspector's terrain dropdown rewrote definition.csv's terrain column, and since the city look
// painted a town on or off, and nothing else the game DRAWS. hoi4.exe paints a province's ground from map/terrain.bmp and stands its
// trees from map/trees.bmp, never from the terrain column. Measured through POST /api/map/set-province-terrains with the brush's own body
// on a scratch mod over the base game: 15 plains provinces made forest answered 200, every row forest, and trees.bmp and terrain.bmp were
// byte for byte as they were — 22 of the 522 trees.bmp blocks wholly inside them carried a tree (4.2%), against 90.7% of the base game's
// own forest blocks; forest made plains kept its trees. Generate land paints a raised province's ground from the mix the map below paints
// under its terrain and plants its trees in the mix the map below grows there; the tool now does both, through the same two functions.
//
// Pinned on a world built for it: 8 x 4 provinces of 64 x 48 px over a layer below whose woods stand on low ground (painted with forest
// index 1) and on high ground (index 2), with a trace of trees on its plains, a town on one plains province, a jagged border between two
// forest provinces so trees.bmp blocks straddle them, and the five world pictures painted for that map. With what the page sends:
//   1. a brush stroke (the page's own flushMapSaves, POST /api/map/set-province-terrains) making three plains provinces forest: their
//      blocks grow the forest's mix, their ground is painted forest, the town on one of them stands with its block as it was, the colour
//      map is recoloured over them, and terrain.bmp, trees.bmp and the colour map are each written once for the stroke;
//   2. the inspector's body making a high plains province forest, on a mod that inherits its heights: painted with the forest the map
//      below paints on HIGH ground (the heightmap that loads decides the tercile);
//   3. the inspector's body making a forest province plains: its trees go, but on the blocks it shares with the forest beside it;
//   4. the controls: plains → hills paints hills and touches no tree; plains → urban is the city look's alone;
//   5. a coastal province made forest, its shore jagged so some of its pixels lie under texels the sea holds most of: those texels are
//      drawn as sea, so their colour and their harbour light stay as they were (on the base game, 15 coastal plains provinces made forest
//      repainted 8 such texels as open water and put out harbour lights as bright as 212), over a mod that inherits its colour map and
//      one that owns it;
//   6. #a-province-already-painted-its-new-terrain-keeps-its-ground — a province whose ground the modder painted forest (but for a
//      meadow) and planted a wood on while its column says plains (Millennium Dawn has 265 plains provinces painted forest, Old World
//      Blues 899): the inspector making it forest leaves every pixel, the meadow's too, and every tree as the modder made them, plants only
//      its bare blocks, and says so — and with a tree on every block, writes nothing and warns of nothing;
//   7. …and a province a third of whose ground is painted forest: made forest, that third keeps its paint and the rest is painted;
//   8. the review's own case (M2-roundtrip-lossy): a terrain change and its inverse do not cancel, because neither painter can tell a pixel or a
//      tree a modder put there from one the map came with, and the Save line says so outright: how many pixels of existing ground and how many
//      standing tree blocks a change replaced, and where the pictures as they were still are. A change that replaced nothing says nothing.
//   9. a texel holding three pixels of a modder's town and one of the ground the change repainted: dark before, dark after. Ground alone has a
//      value of its own in the mask repaintWorldTextures reads (4), since a small town at a victory point's is 3 (#a-victory-point-has-a-town),
//      and read as that town's, a change of a province's terrain lit up every such texel as a new town.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-terrain-grows-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const dds = require("./dds-codec.js");
const P = require("./testlib-map-page.js");
const { BACKUP_DIR } = require("./safe-write.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sha = (p) => crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
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
const CM = "map/terrain/colormap_rgb_cityemissivemask_a.dds";

// ── the world: 8 x 4 provinces of 64 x 48 px, id = row * 8 + col + 1; rows 0-2 land, row 3 sea; 2 px to a texel and to a trees block ──
const CW = 64, RH = 48, COLS = 8, ROWS = 4, W = CW * COLS, H = RH * ROWS, TW = W / 2, TH = H / 2;
const PLAINS = 0, FOREST_LO = 1, FOREST_HI = 2, SPAWN = 13, OCEAN = 15, HILLS = 17, BARE = 0;
const idAt = (c, r) => r * COLS + c + 1;
const F0 = idAt(0, 0), F1 = idAt(1, 0), F2 = idAt(0, 1), F3 = idAt(1, 1);   // the woods: F0, F1 on low ground, F2, F3 on high
// F0 and F1 meet on a jagged border: on the odd rows the pixel at x = 64 is F0's, so the blocks at x 64-65 hold both
// …and the coast of PC (column 1 of row 2) is jagged too: on the first sea row every fourth pixel is PC's land, so a texel there holds one
// pixel of PC's and three of the sea's, and is drawn as sea (section 5)
const PC = idAt(1, 2);
const provAt = (x, y) => (Math.floor(y / RH) === 0 && x === CW && y % 2 === 1 ? F0
  : y === 3 * RH && x >= CW && x < 2 * CW && x % 4 === 1 ? PC
  : idAt(Math.floor(x / CW), Math.floor(y / RH)));
const cellOf = (id) => [(id - 1) % COLS, Math.floor((id - 1) / COLS)];
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const isLand = (id) => cellOf(id)[1] < 3;
const P1 = idAt(4, 0), P2 = idAt(5, 0), PT = idAt(4, 1), PH = idAt(6, 1), PL = idAt(5, 2), PU = idAt(2, 2), H1 = idAt(6, 2), H2 = idAt(7, 2);
const PF = idAt(2, 0), PP = idAt(3, 0);   // plains below; a mod paints them forest, all of PF and a third of PP (sections 6 and 7)
const HIGH = new Set([F2, F3, PH]);
const FOREST = new Set([F0, F1, F2, F3]), HILLY = new Set([H1, H2]);
const terrainOfBelow = (id) => (!isLand(id) ? "ocean" : FOREST.has(id) ? "forest" : HILLY.has(id) ? "hills" : "plains");
// a town of 6 x 6 px in the middle of plains province PT
const inTown = (x, y) => provAt(x, y) === PT && x % CW >= 29 && x % CW < 35 && y % RH >= 21 && y % RH < 27;
const terrainIndexBelow = (x, y) => {
  const p = provAt(x, y), t = terrainOfBelow(p);
  if (t === "ocean") return OCEAN;
  if (inTown(x, y)) return SPAWN;
  return t === "forest" ? (HIGH.has(p) ? FOREST_HI : FOREST_LO) : t === "hills" ? HILLS : PLAINS;
};
const heightBelow = (x, y) => { const p = provAt(x, y); return !isLand(p) ? 89 : HIGH.has(p) ? 150 : 100; };
// what grows below: a forest's block is 6 ×8, 5 ×4, 28 ×2 and bare ×2 of every 16; a plains block carries a tree 1 time in 32
const FOREST_SLOT = (s) => (s < 8 ? 6 : s < 12 ? 5 : s < 14 ? 28 : BARE);
const blockProvinces = (bx, by) => new Set([provAt(2 * bx, 2 * by), provAt(2 * bx + 1, 2 * by), provAt(2 * bx, 2 * by + 1), provAt(2 * bx + 1, 2 * by + 1)]);
const treeBelow = (bx, by) => {
  const t = terrainOfBelow(provAt(2 * bx, 2 * by));
  if (t === "forest") return FOREST_SLOT((bx * 7 + by * 5) % 16);
  if (t === "plains") return (bx * 3 + by * 11) % 32 === 0 ? 6 : BARE;
  return BARE;
};
const TINT = { [PLAINS]: [150, 160, 90], [FOREST_LO]: [40, 90, 40], [FOREST_HI]: [40, 90, 40], [HILLS]: [140, 120, 80], [SPAWN]: [120, 110, 100], [OCEAN]: [79, 102, 141] };
// a star: 3 x 3 texels lit in the middle of P2, no city ground under them
const starTexel = (X, Y) => Math.abs(X - (cellOf(P2)[0] * CW + CW / 2) / 2) <= 1 && Math.abs(Y - (cellOf(P2)[1] * RH + RH / 2) / 2) <= 1;
// a harbour's light on the sea along PC's coast: the first three texel rows of the sea below it (the base game lights its sea by a port)
const harbourTexel = (X, Y) => X >= CW / 2 && X < CW && Y >= 3 * RH / 2 && Y < 3 * RH / 2 + 3;

function makeGame() {
  const g = path.join(ROOT, "game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${isLand(id) ? `land;false;${terrainOfBelow(id)};1` : "sea;false;ocean;0"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, terrainIndexBelow));
  write(g, "map/heightmap.bmp", bmp8(W, H, heightBelow));
  write(g, "map/trees.bmp", bmp8(TW, TH, treeBelow));
  write(g, "gfx/entities/trees.gfx", ["objectTypes = {",
    '\tpdxmesh = { name = "mapobject_5"  file = "gfx/models/a.mesh" }',
    '\tpdxmesh = { name = "mapobject_6"  file = "gfx/models/b.mesh" }',
    '\tpdxmesh = { name = "mapobject_28" file = "gfx/models/c.mesh" }', "}"].join("\n") + "\n");
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  forest = { color = { 0 120 0 } }", "  hills = { color = { 150 120 60 } }", "  urban = { color = { 120 110 100 } }",
    "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  forest = { type = forest color = { 1 } }", "  forest_high = { type = forest color = { 2 } }", "  hills = { type = hills color = { 17 } }",
    "  forest_13 = { type = urban color = { 13 } texture = 10 spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  // the pictures, painted FOR this map: each texel tinted by the ground under it; at night the town lit (173), a glow two texels round
  // it (60), and a star's light in P2 with no town under it (167), as the base game lights a victory point it draws no city for
  const idxAtTexel = (X, Y) => terrainIndexBelow(2 * X, 2 * Y);
  const townTexel = (X, Y) => idxAtTexel(X, Y) === SPAWN;
  const glow = (X, Y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = X + dx, y = Y + dy; if (x >= 0 && y >= 0 && x < TW && y < TH && townTexel(x, y)) return true; } return false; };
  write(g, CM, makeDds(TW, TH, "RGB32", 1, (X, Y) => { const i = idxAtTexel(X, Y); return [...TINT[i], i === SPAWN ? 173 : starTexel(X, Y) ? 167 : glow(X, Y) ? 60 : harbourTexel(X, Y) ? 90 : 0]; }));
  const landTexel = (X, Y) => isLand(provAt(2 * X, 2 * Y));
  for (const [n, s] of [["colormap_water_0.dds", 1], ["colormap_water_1.dds", 2], ["colormap_water_2.dds", 4]]) {
    write(g, "map/terrain/" + n, makeDds(TW / s, TH / s, "DXT5", 1, (X, Y) => (landTexel(X * s, Y * s) ? [52 + ((X * 7 + Y * 13) % 17), 70, 60, 255] : [35, 59, 81, 255])));
  }
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 6, (X, Y, l) => (landTexel(Math.min(TW - 1, X << l), Math.min(TH - 1, Y << l)) ? [132 + ((X * 5 + Y * 3) % 16), 132 + ((X * 5 + Y * 3) % 16), 132 + ((X * 5 + Y * 3) % 16), 21] : [90, 90, 90, 40])));
  return g;
}
const GAME = makeGame();
let modN = 0;
const freshMod = (own = []) => {
  const m = path.join(process.env.HOI4_MODS_ROOT, "mod" + (++modN));
  write(m, "descriptor.mod", 'name="the terrain tool grows what its terrain grows"\n');
  for (const rel of own) write(m, rel, fs.readFileSync(path.join(GAME, rel)));
  return m;
};
const pick = (mod, rel) => (fs.existsSync(path.join(mod, rel)) ? path.join(mod, rel) : path.join(GAME, rel));
const terrainAt = (mod) => read8(pick(mod, "map/terrain.bmp"));
const treesAt = (mod) => read8(pick(mod, "map/trees.bmp"));
const belowTerrain = read8(path.join(GAME, "map/terrain.bmp")), belowTrees = read8(path.join(GAME, "map/trees.bmp"));
const TREE = new Set([5, 6, 28]);
/** the trees.bmp blocks whose four pixels are all province `id`'s */
const pureBlocksOf = (id) => { const out = []; for (let by = 0; by < TH; by++) for (let bx = 0; bx < TW; bx++) { const s = blockProvinces(bx, by); if (s.size === 1 && s.has(id)) out.push([bx, by]); } return out; };
const vegetated = (at, blocks) => blocks.filter(([bx, by]) => TREE.has(at(bx, by))).length / Math.max(1, blocks.length);
const pixelsOf = (id) => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === id) out.push([x, y]); return out; };
// a pixel at least `d` from every edge of its province's cell
const interior = (id, d) => pixelsOf(id).filter(([x, y]) => x % CW >= d && x % CW < CW - d && y % RH >= d && y % RH < RH - d);
const share = (at, list, set) => list.filter(([x, y]) => set.has(at(x, y))).length / Math.max(1, list.length);
const changedOutside = (mod, ids) => { const at = terrainAt(mod), out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!ids.has(provAt(x, y)) && at(x, y) !== belowTerrain(x, y)) out.push([x, y, provAt(x, y)]); return out; };
const rgbOf = (file) => { const b = fs.readFileSync(file), h = dds.parseDdsHeader(b), img = dds.decodeDdsLevel(b, h, 0); return (X, Y) => [img[(Y * TW + X) * 4], img[(Y * TW + X) * 4 + 1], img[(Y * TW + X) * 4 + 2], img[(Y * TW + X) * 4 + 3]]; };
const meanTint = (at, id) => { const t = interior(id, 6).filter(([x, y]) => x % 2 === 0 && y % 2 === 0).map(([x, y]) => at(x / 2, y / 2)); const m = [0, 0, 0]; for (const c of t) for (let k = 0; k < 3; k++) m[k] += c[k] / t.length; return m.map((v) => Math.round(v)); };
const call = (mod, body) => md.setProvinceDefinition({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], ...body });
const notesOf = vm.runInNewContext(P.withNoteHelpers(P.lift("function terrainWriteNotes(")) + "\nterrainWriteNotes;", {});

console.log("\n-- the wiring, read from the code --");
{
  const MD = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const body = (name) => { const a = MD.indexOf("function " + name + "("); return a < 0 ? "" : MD.slice(a, MD.indexOf("\nfunction ", a + 10)); };
  // the text of the first call of `name` in `src`, to its closing parenthesis
  const callIn = (src, name) => {
    const i = src.indexOf(name + "(");
    if (i < 0) return "";
    let depth = 0, j = i + name.length;
    for (; j < src.length; j++) { if (src[j] === "(") depth++; else if (src[j] === ")" && --depth === 0) break; }
    return src.slice(i, j + 1);
  };
  const looks = body("paintTerrainToolLooks"), ground = body("paintTerrainToolGround");
  ok(/paintTerrainToolLooks\(/.test(body("setProvinceTerrains")) && !/paintCityLooksForTerrain\(/.test(body("setProvinceTerrains")) && /paintTerrainToolLooks\(/.test(body("setProvinceDefinition")),
    "⭐ the brush's batch and the inspector's single write both go through paintTerrainToolLooks");
  ok(/relight: false/.test(callIn(looks, "paintCityLooksForTerrain")) && /paintTerrainToolGround\(/.test(looks) && /replant:/.test(callIn(looks, "plantProvincesInTreesBmp")) && (looks.match(/repaintWorldTextures\(/g) || []).length === 1,
    "⭐ …which paints the city look, the ground and the trees, and relights the colour map once for all of them", looks.length);
  ok(/crossed:/.test(callIn(ground, "paintProvincesInTerrainBmp")), "⭐ …the ground through the generator's own painter", ground.length);
}

console.log("\n-- the world below, as the readers see it --");
{
  const forestBlocks = [F0, F1, F2, F3].flatMap(pureBlocksOf), plainsBlocks = [P1, P2, PT].flatMap(pureBlocksOf);
  const vf = vegetated(belowTrees, forestBlocks), vp = vegetated(belowTrees, plainsBlocks);
  ok(vf > 0.8 && vp < 0.06, `THE CONTROL: the woods below carry a tree on ${(100 * vf).toFixed(1)}% of their blocks, its plains on ${(100 * vp).toFixed(1)}%`, { vf, vp });
  const sample = md.sampleTreesByTerrain(path.join(GAME, "map/trees.bmp"), path.join(GAME, "map/provinces.bmp"), path.join(GAME, "map/definition.csv"));
  ok(sample && JSON.stringify(sample.woody) === JSON.stringify(["forest"]) && sample.bare === BARE, "THE CONTROL: the sampler calls forest the one woody terrain, and 0 the bare index", sample && { woody: sample.woody, bare: sample.bare });
}

(async () => {
  process.env.HOI4_ROOT = GAME;
  const { createApp } = require("./server.js");
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;

    console.log("\n-- ⭐ 1. a brush stroke makes three plains provinces forest: their trees, their ground, their colours, once each --");
    const OWN = ["map/definition.csv", "map/provinces.bmp", "map/terrain.bmp", "map/trees.bmp", CM];
    const M = freshMod(OWN);
    const before = Object.fromEntries(OWN.map((rel) => [rel, sha(path.join(M, rel))]));
    const backups = () => { try { return fs.readdirSync(BACKUP_DIR); } catch (_) { return []; } };
    const pool0 = backups();
    const STROKE = [P1, P2, PT];
    const posted = [];
    const page = P.runPage([
      ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
      "function markSaveBoundary", "function queueWrite(url, body, meta)", "function terrainWriteNotes(",
      ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
      "async function mapCrashGate(", "async function load(doneMsg)", "function buildFromImage(img, doneMsg)",
    ], P.loadGlobals({
      console, JSON, Image: P.fakeImageClass({ width: W, height: H }),
      pendingWrites: [], paintDiff: new Map(), stateById: new Map(), model: { states: [] },
      window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: () => true },
      stagedRiverEdits: [], riversShow: false, loadRiversOverlay: () => {},
      undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
      setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => M,
      isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
      stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
      remapQueuedStateId: () => {}, remapLocalStateId: () => {},
      adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
      fetch: async (url, opts) => { posted.push({ url: String(url).split("?")[0], body: opts && opts.body ? JSON.parse(opts.body) : null }); return fetch(base + url, opts); },
    }));
    // as the brush queues them (paintTerrainAt): a terrain and nothing else
    for (const id of STROKE) page.sb.queueWrite("/api/map/set-province-terrain", { provinceId: id, terrain: "forest" });
    const labels = require("./public/map-rule-labels.js");
    const fatal = async () => ((await fetch(`${base}/api/map/validate?modPath=${encodeURIComponent(M)}`).then((x) => x.json())).problems || []).filter((p) => labels.isFatalRule(p.rule)).map((p) => p.rule).sort();
    const fatalBefore = await fatal();
    await page.sb.flushMapSaves(); await P.settle(150);
    const def = fs.readFileSync(path.join(M, "map/definition.csv"), "utf8").split(/\r?\n/).map((l) => l.split(";"));
    ok(page.sb.pendingWrites.length === 0 && STROKE.every((id) => (def.find((c) => +c[0] === id) || [])[6] === "forest") && posted.filter((p) => p.url === "/api/map/set-province-terrains").length === 1,
      "THE CONTROL: the Save sent the stroke as one request and wrote all three rows forest", { left: page.sb.pendingWrites.length, posted: posted.map((p) => p.url) });
    const tr = treesAt(M);
    const strokeBlocks = [P1, P2].flatMap(pureBlocksOf);
    const vBefore = vegetated(belowTrees, strokeBlocks), vAfter = vegetated(tr, strokeBlocks);
    ok(vBefore < 0.06 && vAfter > 0.8, `⭐⭐⭐ the blocks wholly inside P1 and P2 carry a tree on ${(100 * vAfter).toFixed(1)}% of them, where they carried one on ${(100 * vBefore).toFixed(1)}%`, { vBefore, vAfter, blocks: strokeBlocks.length });
    // the mix, index by index, against the woods below
    const hist = (at, blocks) => { const h = new Map(); for (const [bx, by] of blocks) h.set(at(bx, by), (h.get(at(bx, by)) || 0) + 1); return h; };
    const want = hist(belowTrees, [F0, F1, F2, F3].flatMap(pureBlocksOf)), got = hist(tr, strokeBlocks);
    const nW = [...want.values()].reduce((a, b) => a + b, 0), nG = strokeBlocks.length, drift = [];
    for (const [i, k] of want) { const a = 100 * k / nW, b = 100 * (got.get(i) || 0) / nG; if (Math.abs(a - b) > 4) drift.push(`${i}: below ${a.toFixed(1)}% here ${b.toFixed(1)}%`); }
    ok(drift.length === 0 && [...got.keys()].every((i) => i === BARE || TREE.has(i)), "⭐⭐ …in the mix the woods below grow, index by index, to within 4 points, and nothing the trees.gfx does not declare", { drift, got: [...got] });
    const tAt = terrainAt(M);
    const forestIdx = new Set([FOREST_LO, FOREST_HI]);
    ok([P1, P2].every((id) => share(tAt, interior(id, 6), forestIdx) > 0.95) && [P1, P2].every((id) => share(tAt, pixelsOf(id), forestIdx) > 0.8),
      "⭐⭐⭐ their ground is painted forest: every pixel 6 from the edge, and four in five of all of them (the rest is the plains round them, carried over the border)", [P1, P2].map((id) => [share(tAt, interior(id, 6), forestIdx), share(tAt, pixelsOf(id), forestIdx)]));
    ok([P1, P2].every((id) => share(tAt, interior(id, 6), new Set([FOREST_LO])) > 0.95), "⭐ …with the forest the map below paints on LOW ground, the ground they stand on (index 1)", [P1, P2].map((id) => share(tAt, interior(id, 6), new Set([FOREST_LO]))));
    const town = pixelsOf(PT).filter(([x, y]) => inTown(x, y));
    ok(town.length === 36 && town.every(([x, y]) => tAt(x, y) === SPAWN), "⭐⭐ the town on PT stands: its 36 px of city ground are still city ground", town.filter(([x, y]) => tAt(x, y) !== SPAWN).length);
    const townBlocks = []; for (let by = 0; by < TH; by++) for (let bx = 0; bx < TW; bx++) if ([[0, 0], [1, 0], [0, 1], [1, 1]].some(([dx, dy]) => inTown(2 * bx + dx, 2 * by + dy))) townBlocks.push([bx, by]);
    ok(townBlocks.length > 0 && townBlocks.every(([bx, by]) => tr(bx, by) === belowTrees(bx, by)), `⭐ …and the ${townBlocks.length} trees.bmp blocks holding it keep what they had`, townBlocks.filter(([bx, by]) => tr(bx, by) !== belowTrees(bx, by)).length);
    ok(vegetated(tr, pureBlocksOf(PT).filter(([bx, by]) => !townBlocks.some(([a, b]) => a === bx && b === by))) > 0.8, "…while the rest of PT grows the forest");
    const outside = changedOutside(M, new Set(STROKE));
    ok(outside.length === 0, "⭐⭐ no pixel of terrain.bmp outside the three changed", outside.slice(0, 5));
    let treesOutside = 0; for (let by = 0; by < TH; by++) for (let bx = 0; bx < TW; bx++) { const s = blockProvinces(bx, by); if (![...s].some((p) => STROKE.includes(p)) && tr(bx, by) !== belowTrees(bx, by)) treesOutside++; }
    ok(treesOutside === 0, "⭐ …and no trees.bmp block that holds none of them", treesOutside);
    const cmNow = rgbOf(path.join(M, CM)), cmWas = rgbOf(path.join(GAME, CM));
    const tintNow = meanTint(cmNow, P1), tintWas = meanTint(cmWas, P1), farNow = meanTint(cmNow, idAt(3, 2)), farWas = meanTint(cmWas, idAt(3, 2));
    const toward = (a, b, c) => { let num = 0, den = 0; for (let k = 0; k < 3; k++) { num += (a[k] - b[k]) * (c[k] - b[k]); den += (c[k] - b[k]) ** 2; } return num / den; };
    ok(toward(tintNow, tintWas, TINT[FOREST_LO]) > 0.7, `⭐⭐ the colour map over P1 is recoloured toward the woods' green (${tintWas} → ${tintNow}, the woods below ${TINT[FOREST_LO]})`, { tintWas, tintNow });
    ok(JSON.stringify(farNow) === JSON.stringify(farWas), "…and a province far from the stroke keeps its colour", { farWas, farNow });
    // the night: the ground changed, no city did, so no light may move — not the town's glow over PT's repainted ground, not P2's star
    const litOnGround = []; for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) if (cmWas(X, Y)[3] > 0 && STROKE.includes(provAt(2 * X, 2 * Y)) && tAt(2 * X, 2 * Y) !== SPAWN) litOnGround.push([X, Y]);
    ok(litOnGround.length >= 9 + 40, `THE CONTROL: ${litOnGround.length} lit texels stand on the stroke's ground, the town's glow and the star`, litOnGround.length);
    const alphaMoved = []; for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) if (cmNow(X, Y)[3] !== cmWas(X, Y)[3]) alphaMoved.push([X, Y, cmWas(X, Y)[3], cmNow(X, Y)[3]]);
    ok(alphaMoved.length === 0, "⭐⭐ …and every texel's night light is as it was: the glow round PT's town and the star in P2 shine on the forest as they did on the plains, and no light round them is put out", { moved: alphaMoved.length, sample: alphaMoved.slice(0, 6) });
    const mine = backups().filter((n) => !pool0.includes(n) && n.includes(path.basename(M)));
    const of = (rel) => mine.filter((n) => n.endsWith(rel.replace(/[\\/:]/g, "__")));
    const kept = (rel) => of(rel).length === 1 && sha(path.join(BACKUP_DIR, of(rel)[0])) === before[rel];
    ok(kept("map/terrain.bmp") && kept("map/trees.bmp") && kept(CM) && kept("map/definition.csv"),
      "⭐⭐⭐ terrain.bmp, trees.bmp, the colour map and definition.csv were each written ONCE for the stroke, and each one's backup is the file as it was", { terrain: of("map/terrain.bmp").length, trees: of("map/trees.bmp").length, cm: of(CM).length, def: of("map/definition.csv").length, all: mine.length });
    const last = String(page.statuses[page.statuses.length - 1] || "");
    ok(/3 provinces are forest now/.test(last) && /map\/terrain\.bmp/.test(last) && /map\/trees\.bmp/.test(last) && /planted/.test(last), "⭐ the Save line says the three are forest now and what was painted where", last.slice(0, 400));
    ok(/That replaced [\d,]+ px of existing ground, and giving them their old terrain back will not bring that back: map\/terrain\.bmp as it was is in Nova's backups, until newer backups push it out\./.test(last),
      "⭐⭐ …and, through the page's own Save, what the stroke replaced: its ground, and no standing tree, as woods only came", last);
    const fatalAfter = await fatal();
    ok(JSON.stringify(fatalAfter) === JSON.stringify(fatalBefore), "…and the Save added no problem Map Errors calls fatal (this small world's own are the same before and after)", { fatalBefore, fatalAfter });

    console.log("\n-- ⭐ 2. the inspector makes a HIGH plains province forest, on a mod that inherits its heights --");
    {
      const m = freshMod();
      const r = call(m, { provinceId: PH, terrain: "forest", type: "land", coastal: false });
      ok(r.changed && r.ground && r.ground.changed && !fs.existsSync(path.join(m, "map/heightmap.bmp")), "THE CONTROL: the inspector's body painted its ground, and the mod owns no heightmap", r.ground);
      const tm = terrainAt(m);
      ok(share(tm, interior(PH, 6), new Set([FOREST_HI])) > 0.95, "⭐⭐⭐ it is painted with the forest the map below paints on HIGH ground (index 2): the heightmap that loads decides the tercile", share(tm, interior(PH, 6), new Set([FOREST_HI])));
      const notes = notesOf(r, { url: "/api/map/set-province-terrain", body: { provinceId: PH, terrain: "forest", type: "land", coastal: false } });
      ok(notes.some((n) => new RegExp(`Province ${PH} is forest now, so Nova painted`).test(n) && /map\/terrain\.bmp/.test(n) && /map\/trees\.bmp/.test(n)), "⭐ …and its Save note says so", notes);
    }

    console.log("\n-- ⭐ 3. the inspector makes forest F1 plains: its trees go, but on the blocks it shares with the forest beside it --");
    {
      const m = freshMod();
      const r = call(m, { provinceId: F1, terrain: "plains", type: "land", coastal: false });
      const t = treesAt(m);
      const pure = pureBlocksOf(F1);
      const vb = vegetated(belowTrees, pure), va = vegetated(t, pure);
      ok(vb > 0.8 && va < 0.06, `⭐⭐⭐ the blocks wholly inside F1 carried a tree on ${(100 * vb).toFixed(1)}% of them and carry one on ${(100 * va).toFixed(1)}%: as much as plains grows there`, { vb, va, trees: r.ground && r.ground.trees });
      const shared = []; for (let by = 0; by < TH; by++) for (let bx = 0; bx < TW; bx++) { const s = blockProvinces(bx, by); if (s.has(F0) && s.has(F1)) shared.push([bx, by]); }
      ok(shared.length > 0 && shared.every(([bx, by]) => t(bx, by) === belowTrees(bx, by)) && vegetated(belowTrees, shared) > 0.5, `⭐⭐ …and the ${shared.length} blocks it shares with F0, still forest, keep their trees`, shared.filter(([bx, by]) => t(bx, by) !== belowTrees(bx, by)).length);
      const tm = terrainAt(m);
      ok(share(tm, interior(F1, 6), new Set([PLAINS])) > 0.95, "⭐⭐ its ground is painted plains", share(tm, interior(F1, 6), new Set([PLAINS])));
      ok(r.ground && r.ground.trees && r.ground.trees.replanted && r.ground.trees.replanted.cleared > 0, "…and the answer says how many blocks it cleared", r.ground && r.ground.trees);
    }

    console.log("\n-- 4. THE CONTROLS: plains → hills grows no tree, and plains → urban is the city look's alone --");
    {
      const m = freshMod();
      const r = call(m, { provinceId: PL, terrain: "hills" });
      const g = r.ground || {};
      ok(g.changed && share(terrainAt(m), interior(PL, 6), new Set([HILLS])) > 0.95, "plains → hills paints its ground hills", r.ground);
      ok(!fs.existsSync(path.join(m, "map/trees.bmp")) && g.trees && !g.trees.changed && g.trees.reason === "no woods came or went", "…and touches no tree: no trees.bmp in the mod", g.trees);
      const mu = freshMod();
      const ru = call(mu, { provinceId: PU, terrain: "urban" });
      ok(ru.changed && !ru.ground && !fs.existsSync(path.join(mu, "map/trees.bmp")), "a change into a city paints no ground and plants no tree of its own (the city look's)", { ground: ru.ground, cityLook: ru.cityLook });
    }

    console.log("\n-- ⭐ 5. a coastal province made forest: the sea its shore pixels lie under keeps its colour and its harbour light --");
    {
      // a texel is drawn as sea when most of its four pixels are sea (textureMapLayer's class); the ones holding a pixel of PC's shore
      const fourOf = (X, Y) => [[2 * X, 2 * Y], [2 * X + 1, 2 * Y], [2 * X, 2 * Y + 1], [2 * X + 1, 2 * Y + 1]];
      const seaTexels = [], shoreUnderSea = [], tied = [];
      for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) {
        const four = fourOf(X, Y), land = four.filter(([x, y]) => isLand(provAt(x, y))).length;
        if (land === 2) tied.push([X, Y]);
        if (land >= 2) continue;
        seaTexels.push([X, Y]);
        if (four.some(([x, y]) => provAt(x, y) === PC)) shoreUnderSea.push([X, Y]);
      }
      const cmWas = rgbOf(path.join(GAME, CM));
      ok(tied.length === 0 && shoreUnderSea.length === 16 && shoreUnderSea.every(([X, Y]) => cmWas(X, Y)[3] === 90),
        `THE CONTROL: ${shoreUnderSea.length} sea texels hold one pixel of PC's shore each, every one lit by the harbour, and no texel is half land`, { tied: tied.length, shore: shoreUnderSea.length, alpha: shoreUnderSea.map(([X, Y]) => cmWas(X, Y)[3]).slice(0, 4) });
      // the first write over the base game (the mod inherits its colour map) and a mod that owns its colour map (the relight works in a window)
      for (const [label, m] of [["a mod that inherits its colour map", freshMod()], ["a mod that owns its colour map", freshMod([CM])]]) {
        const r = call(m, { provinceId: PC, terrain: "forest" });
        const g = r.ground || {};
        ok(r.changed && g.changed && g.lights && g.lights.changed && share(terrainAt(m), interior(PC, 6), new Set([FOREST_LO])) > 0.95, `THE CONTROL (${label}): PC's ground is painted forest and the colour map relit`, g);
        const cmNow = rgbOf(pick(m, CM));
        const moved = seaTexels.filter(([X, Y]) => cmNow(X, Y).join() !== cmWas(X, Y).join());
        ok(moved.length === 0, `⭐⭐ (${label}) every sea texel is as it was, colour and light — the ${shoreUnderSea.length} over PC's shore keep their harbour light`,
          { moved: moved.length, sample: moved.slice(0, 4).map(([X, Y]) => [X, Y, cmWas(X, Y), cmNow(X, Y)]) });
        const was = meanTint(cmWas, PC), now = meanTint(cmNow, PC);
        ok(toward(now, was, TINT[FOREST_LO]) > 0.7, `…while PC's land is recoloured toward the woods' green (${was} → ${now})`, { was, now });
      }
    }

    console.log("\n-- ⭐ 6. a wood a modder painted and planted on a province whose column says plains: put right, it keeps every pixel and tree --");
    {
      // the mod paints PF forest with index 2 — forest the map below paints only on HIGH ground, so not what Nova would paint on PF's low
      // ground — but for a strip of meadow (plains) down its east side, plants a wood of its own on 3 of every 5 of PF's blocks (index
      // 28), and leaves its terrain column plains
      const isPF = (x, y) => provAt(x, y) === PF, meadow = (x) => x % CW >= 44;
      const paintedPF = (x, y) => (meadow(x) ? PLAINS : FOREST_HI);
      const pfBlocks = new Set(pureBlocksOf(PF).map(([bx, by]) => bx + "," + by));
      const hand = (bx, by) => (bx + 2 * by) % 5 < 3;
      const m = freshMod();
      write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (isPF(x, y) ? paintedPF(x, y) : terrainIndexBelow(x, y))));
      write(m, "map/trees.bmp", bmp8(TW, TH, (bx, by) => (pfBlocks.has(bx + "," + by) ? (hand(bx, by) ? 28 : BARE) : treeBelow(bx, by))));
      const tWas = terrainAt(m), trWas = treesAt(m);
      const pfPx = pixelsOf(PF), blocks = pureBlocksOf(PF), planted = blocks.filter(([bx, by]) => hand(bx, by));
      const meadowPx = pfPx.filter(([x]) => meadow(x));
      ok(pfPx.every(([x, y]) => tWas(x, y) === paintedPF(x, y)) && meadowPx.length > 0 && meadowPx.length * 2 < pfPx.length && planted.length > 0 && planted.every(([bx, by]) => trWas(bx, by) === 28) && blocks.some(([bx, by]) => trWas(bx, by) === BARE),
        `THE CONTROL: the mod paints ${pfPx.length - meadowPx.length} of PF's ${pfPx.length} px forest and ${meadowPx.length} meadow, plants a wood on ${planted.length} of its ${blocks.length} blocks, and its column says plains`);
      const body = { provinceId: PF, terrain: "forest", type: "land", coastal: false };
      const r = call(m, body);
      const tNow = terrainAt(m), trNow = treesAt(m);
      ok(r.changed && pfPx.every(([x, y]) => tNow(x, y) === paintedPF(x, y)) && r.ground && Array.isArray(r.ground.kept) && r.ground.kept.includes(PF),
        "⭐⭐⭐ its ground is left as the modder painted it, every pixel, its meadow too, and the answer says so (#a-province-already-painted-its-new-terrain-keeps-its-ground)",
        { ground: r.ground && { changed: r.ground.changed, kept: r.ground.kept, reason: r.ground.reason }, moved: pfPx.filter(([x, y]) => tNow(x, y) !== paintedPF(x, y)).length, meadowMoved: meadowPx.filter(([x, y]) => tNow(x, y) !== PLAINS).length });
      ok(planted.every(([bx, by]) => trNow(bx, by) === 28), `⭐⭐⭐ every one of the ${planted.length} trees the modder planted still stands`, planted.filter(([bx, by]) => trNow(bx, by) !== 28).length);
      ok(vegetated(trNow, blocks) > 0.9, `⭐ …and its bare blocks are planted: ${(100 * vegetated(trNow, blocks)).toFixed(1)}% of its blocks carry a tree, where ${(100 * vegetated(trWas, blocks)).toFixed(1)}% did`, r.ground && r.ground.trees);
      ok(!fs.existsSync(path.join(m, CM)), "…and as no ground changed, the colour map is not touched (the mod still inherits it)");
      const notes = notesOf(r, { url: "/api/map/set-province-terrain", body });
      ok(notes.some((n) => new RegExp(`Province ${PF} is forest now, so Nova planted`).test(n) && /ground in map\/terrain\.bmp was already painted forest, so Nova left it as it is/.test(n)),
        "⭐ the Save note says its trees were planted and its ground was already painted forest", notes);
      // …and where the modder's wood stands on every block, there is nothing to plant, and nothing is wrong
      const full = freshMod();
      write(full, "map/terrain.bmp", bmp8(W, H, (x, y) => (isPF(x, y) ? paintedPF(x, y) : terrainIndexBelow(x, y))));
      write(full, "map/trees.bmp", bmp8(TW, TH, (bx, by) => (pfBlocks.has(bx + "," + by) ? 28 : treeBelow(bx, by))));
      const treesWas = sha(path.join(full, "map/trees.bmp")), terrainWas = sha(path.join(full, "map/terrain.bmp"));
      const rf = call(full, body), nf = notesOf(rf, { url: "/api/map/set-province-terrain", body });
      const tf = (rf.ground && rf.ground.trees) || {};
      ok(sha(path.join(full, "map/trees.bmp")) === treesWas && sha(path.join(full, "map/terrain.bmp")) === terrainWas && !tf.changed && /already grow/.test(String(tf.reason || "")),
        "⭐⭐ a wood on every one of its blocks: trees.bmp and terrain.bmp are byte for byte as they were, and the answer says the trees already grow there", tf);
      ok(nf.length === 1 && !/⚠/.test(nf[0]) && new RegExp(`Province ${PF} is forest now: its ground in map/terrain\\.bmp was already painted forest`).test(nf[0]),
        "⭐ …and the Save note says only that its ground was already painted forest, with no warning", nf);
    }

    console.log("\n-- ⭐ 7. a plains province a third of whose ground the modder painted forest: made forest, that third keeps its paint --");
    {
      const third = (x, y) => provAt(x, y) === PP && x % CW < CW / 3;
      const m = freshMod();
      write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (third(x, y) ? FOREST_HI : terrainIndexBelow(x, y))));
      const tWas = terrainAt(m);
      const all = pixelsOf(PP), mine = all.filter(([x, y]) => third(x, y)), rest = interior(PP, 6).filter(([x, y]) => !third(x, y));
      ok(mine.length > 0 && mine.length * 2 < all.length && mine.every(([x, y]) => tWas(x, y) === FOREST_HI), `THE CONTROL: ${mine.length} of PP's ${all.length} px are painted forest, the rest plains`);
      const r = call(m, { provinceId: PP, terrain: "forest" });
      const tNow = terrainAt(m), forest = new Set([FOREST_LO, FOREST_HI]);
      ok(mine.every(([x, y]) => tNow(x, y) === FOREST_HI), "⭐⭐⭐ every pixel the modder painted forest keeps its paint", mine.filter(([x, y]) => tNow(x, y) !== FOREST_HI).length);
      ok(r.ground && r.ground.changed && !(r.ground.kept || []).includes(PP) && share(tNow, rest, forest) > 0.95, "⭐⭐ …and the rest of it is painted forest",
        { share: share(tNow, rest, forest), ground: r.ground && { changed: r.ground.changed, kept: r.ground.kept, pixels: r.ground.pixels } });
    }

    console.log("\n-- ⭐ 8. a terrain change says what it replaced, and where that still is (M2-roundtrip-lossy) --");
    {
      // the review's case, on the wood of section 6: a change that keeps it, and the change back that does not
      const isPF = (x, y) => provAt(x, y) === PF, paintedPF = (x) => (x % CW >= 44 ? PLAINS : FOREST_HI);
      const pfBlocks = new Set(pureBlocksOf(PF).map(([bx, by]) => bx + "," + by));
      const m = freshMod();
      write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (isPF(x, y) ? paintedPF(x) : terrainIndexBelow(x, y))));
      write(m, "map/trees.bmp", bmp8(TW, TH, (bx, by) => (pfBlocks.has(bx + "," + by) ? ((bx + 2 * by) % 5 < 3 ? 28 : BARE) : treeBelow(bx, by))));
      const say = (mod, body) => { const r = call(mod, body); return { r, notes: notesOf(r, { url: "/api/map/set-province-terrain", body }) }; };
      const replacedIn = (notes) => notes.join(" ").split(/(?<=[.])\s+/).filter((t) => /\breplaced\b/.test(t));
      const toForest = { provinceId: PF, terrain: "forest", type: "land", coastal: false };
      const first = say(m, toForest);
      ok(first.r.ground && first.r.ground.kept && first.r.ground.kept.includes(PF) && first.r.ground.trees && first.r.ground.trees.changed && first.notes.length === 1,
        "THE CONTROL: made forest, its ground is kept and only its bare blocks are planted", first.r.ground);
      ok(replacedIn(first.notes).length === 0, "⭐⭐ …which replaced nothing, so it says nothing of the sort", first.notes);

      const tOf = terrainAt(m), trOf = treesAt(m);
      const shaT = sha(path.join(m, "map/terrain.bmp")), shaTr = sha(path.join(m, "map/trees.bmp"));
      const pool = backups();
      const toPlains = { provinceId: PF, terrain: "plains", type: "land", coastal: false };
      const back = say(m, toPlains);
      const tNow = terrainAt(m), trNow = treesAt(m);
      let px = 0, blocks = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (tNow(x, y) !== tOf(x, y)) px++;
      for (let by = 0; by < TH; by++) for (let bx = 0; bx < TW; bx++) if (trOf(bx, by) !== BARE && trNow(bx, by) !== trOf(bx, by)) blocks++;
      ok(px > 0 && blocks > 0, `THE CONTROL: put back to plains, the change repainted ${px} px of the modder's ground and took ${blocks} standing tree blocks off the map`, { px, blocks });
      const said = replacedIn(back.notes);
      const countsAre = new RegExp(`That replaced ${px.toLocaleString()} px of existing ground and ${blocks.toLocaleString()} blocks of standing trees`);
      ok(said.length === 1 && countsAre.test(said[0]), "⭐⭐⭐ the Save note says outright how many pixels of existing ground and how many standing tree blocks it replaced, as counted off the two files", { px, blocks, said, trees: back.r.ground && back.r.ground.trees });
      ok(/giving it its old terrain back will not bring that back/.test(said[0]), "⭐⭐ …that the change back is not what brings them back", said);
      ok(/map\/terrain\.bmp and map\/trees\.bmp as they were are in Nova's backups, until newer backups push them out\./.test(said[0]) && !/map below/.test(said[0]), "⭐⭐ …and that the two pictures as they were are in Nova's backups", said);
      const copies = backups().filter((n) => !pool.includes(n) && n.includes(path.basename(m)));
      const copyOf = (rel) => copies.filter((n) => n.endsWith(rel.replace(/[\\/:]/g, "__")));
      ok(copyOf("map/terrain.bmp").length === 1 && sha(path.join(BACKUP_DIR, copyOf("map/terrain.bmp")[0])) === shaT && copyOf("map/trees.bmp").length === 1 && sha(path.join(BACKUP_DIR, copyOf("map/trees.bmp")[0])) === shaTr,
        "⭐⭐⭐ …which is true: the backups hold both files, byte for byte as the change found them", copies);

      // a mod that inherits both pictures: nothing of its own was overwritten, so no backup holds them, and the note must not promise one
      const shaGameT = sha(path.join(GAME, "map/terrain.bmp")), shaGameTr = sha(path.join(GAME, "map/trees.bmp"));
      const inherits = freshMod();
      const pool2 = backups();
      const b2 = { provinceId: F1, terrain: "plains", type: "land", coastal: false };
      const inh = say(inherits, b2), s2 = replacedIn(inh.notes);
      ok(inh.r.ground && inh.r.ground.materialized && inh.r.ground.trees && inh.r.ground.trees.materialized && backups().filter((n) => !pool2.includes(n) && n.includes(path.basename(inherits)) && /terrain\.bmp$|trees\.bmp$/.test(n)).length === 0,
        "THE CONTROL: a mod inheriting both took its own copies, and no backup of either was made", inh.r.ground && inh.r.ground.materialized);
      ok(s2.length === 1 && /the map below your mod still has map\/terrain\.bmp and map\/trees\.bmp as they were\./.test(s2[0]) && !/backups/.test(s2[0]),
        "⭐⭐⭐ …so its note says the map below still has them, and promises no backup that does not exist", s2);
      ok(sha(path.join(GAME, "map/terrain.bmp")) === shaGameT && sha(path.join(GAME, "map/trees.bmp")) === shaGameTr, "…which is true: the layer below is untouched");

      // one of each
      const oneOfEach = freshMod(["map/terrain.bmp"]);
      const s3 = replacedIn(say(oneOfEach, b2).notes);
      ok(s3.length === 1 && /map\/terrain\.bmp as it was is in Nova's backups, until newer backups push it out, and the map below your mod still has map\/trees\.bmp as it was\./.test(s3[0]),
        "⭐ a mod owning its ground and inheriting its trees: each file is said where it is", s3);

      // ground alone: no tree is named
      const hillsOwn = freshMod(["map/terrain.bmp"]);
      const s4 = replacedIn(say(hillsOwn, { provinceId: PL, terrain: "hills" }).notes);
      ok(s4.length === 1 && /That replaced [\d,]+ px of existing ground, and/.test(s4[0]) && !/tree/.test(s4[0]) && /map\/terrain\.bmp as it was is in Nova's backups, until newer backups push it out\./.test(s4[0]),
        "⭐ plains → hills replaces ground and no tree: it says the ground alone", s4);

      // trees alone: the ground already shows the new terrain, so it is kept, and the woods the old terrain grew go
      const treesAlone = freshMod();
      write(treesAlone, "map/terrain.bmp", bmp8(W, H, (x, y) => (provAt(x, y) === F1 ? PLAINS : terrainIndexBelow(x, y))));
      write(treesAlone, "map/trees.bmp", fs.readFileSync(path.join(GAME, "map/trees.bmp")));
      const ta = say(treesAlone, b2), s5 = replacedIn(ta.notes);
      ok(ta.r.ground && ta.r.ground.kept && ta.r.ground.kept.includes(F1) && ta.r.ground.trees && ta.r.ground.trees.changed, "THE CONTROL: column forest over ground painted plains: the ground is kept and the trees go", ta.r.ground);
      ok(s5.length === 1 && /That replaced [\d,]+ blocks? of standing trees, and/.test(s5[0]) && !/px of existing ground/.test(s5[0]) && /map\/trees\.bmp as it was is in Nova's backups, until newer backups push it out\./.test(s5[0]),
        "⭐ …and it says the trees alone", s5);

      // ⚠️ every block of a change that cleared and planted it again with the tree it had is no replacement, and woods that only came replace none
      const onlyCame = freshMod(["map/terrain.bmp", "map/trees.bmp"]);
      const oc = say(onlyCame, { provinceId: P1, terrain: "forest" }), s6 = replacedIn(oc.notes);
      const planted = (oc.r.ground && oc.r.ground.trees && oc.r.ground.trees.replanted) || {};
      ok(planted.planted > 0 && !planted.cleared && !planted.replaced && s6.length === 1 && !/tree/.test(s6[0]), "⭐ where woods only came, no standing tree was replaced, and the note names none", { planted, s6 });
      ok(!replacedIn(notesOf({ ground: { provinces: [PF], changed: false, pixels: 0, kept: [PF] } }, { url: "/api/map/set-province-terrain", body: toPlains })).length, "⭐ a change that painted nothing says nothing of the sort");
      ok(!/replaced/.test(notesOf({ ground: { provinces: [PF], changed: false, pixels: 0, error: "EPERM" } }, { url: "/api/map/set-province-terrain", body: toPlains }).join(" ")), "…nor does one whose write failed");
    }
    console.log("\n-- ⭐ 9. a town's texel one pixel of which is the ground the change repainted: no new town, and no new light --");
    {
      const X0 = (cellOf(P1)[0] * CW + CW / 2) / 2, Y0 = (cellOf(P1)[1] * RH + RH / 2) / 2;
      const key = (x, y) => x + "," + y, town = new Set([[0, 0], [1, 0], [0, 1]].map(([dx, dy]) => key(2 * X0 + dx, 2 * Y0 + dy)));
      const groundPixel = [2 * X0 + 1, 2 * Y0 + 1];
      const m = freshMod(OWN);
      write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (town.has(key(x, y)) ? SPAWN : belowTerrain(x, y))));
      const was = rgbOf(path.join(m, CM));
      ok(was(X0, Y0)[3] === 0, "THE CONTROL: the texel holding the modder's three pixels of town is dark before the change", was(X0, Y0));
      const r = call(m, { provinceId: P1, terrain: "forest" });
      const at = terrainAt(m), g = r.ground || {};
      ok(r.changed && g.changed && g.lights && g.lights.changed && [...town].every((k) => at(...k.split(",").map(Number)) === SPAWN) && at(...groundPixel) === FOREST_LO,
        "THE CONTROL: the colour map was relit, the three pixels are still city ground, and the fourth in the texel was painted forest", { lights: g.lights, fourth: at(...groundPixel) });
      const now = rgbOf(path.join(m, CM)), moved = [];
      for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) if (now(X, Y)[3] !== was(X, Y)[3]) moved.push([X, Y, was(X, Y)[3], now(X, Y)[3]]);
      ok(moved.length === 0, "⭐⭐ …and no texel's light moved: the ground alone changed there, and it is no new town (the mask's 4, not a town at a victory point's 3)", { moved: moved.length, sample: moved.slice(0, 6) });
    }

    console.log("\n-- ⭐ 10. one stroke takes a city off and makes plains forest: its one relight recolours both, and puts the city's light out --");
    {
      // The brush's batch with BOTH of the relight's masks in it: the city look's (2 on a pixel that became city ground, 1 on any other it
      // repainted) and the ground's (4 on every pixel it painted), which paintTerrainToolLooks ranks 2 over 1 over 4. Every section above
      // has one mask alone, so a rank that dropped the ground's 4 when the city look had a mask too, or put it over the city look's 1,
      // changed nothing any test read (review of the T39 merge, H-LOST-3). PU is made a city first; then one Save makes it forest (its city
      // taken off, its ground painted) and P1 forest (its ground alone), as the brush sends them: one POST of set-province-terrains.
      // PU is a city of the mod's own (this small world has no town to size one Nova would paint by): its row urban, a core of 8 x 8 px of
      // city ground in its middle, lit at night as the map below lights PT's town (173 over it, a glow of 60 two texels round it).
      const m = freshMod(OWN);
      const inPuCore = (x, y) => provAt(x, y) === PU && x % CW >= 28 && x % CW < 36 && y % RH >= 20 && y % RH < 28;
      write(m, "map/definition.csv", fs.readFileSync(path.join(GAME, "map/definition.csv"), "utf8").split("\n").map((l) => (l.split(";")[0] === String(PU) ? l.replace(";plains;", ";urban;") : l)).join("\n"));
      write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (inPuCore(x, y) ? SPAWN : terrainIndexBelow(x, y))));
      const cmBase = rgbOf(path.join(GAME, CM));
      const coreTexel = (X, Y) => X >= 0 && Y >= 0 && X < TW && Y < TH && inPuCore(2 * X, 2 * Y);
      const nearCore = (X, Y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (coreTexel(X + dx, Y + dy)) return true; return false; };
      write(m, CM, makeDds(TW, TH, "RGB32", 1, (X, Y) => (coreTexel(X, Y) ? [...TINT[SPAWN], 173] : nearCore(X, Y) ? [...cmBase(X, Y).slice(0, 3), 60] : cmBase(X, Y))));
      const cmCity = rgbOf(path.join(m, CM)), tCity = terrainAt(m);
      const lit = []; for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) if (cmCity(X, Y)[3] > cmBase(X, Y)[3]) lit.push([X, Y]);
      ok(lit.length === 64 && pixelsOf(PU).filter(([x, y]) => tCity(x, y) === SPAWN).length === 64, `THE CONTROL: PU's city stands on 64 px of city ground, and ${lit.length} texels are lit by it (its 16 and a glow of 48 round them)`, { lit: lit.length });
      const res = await fetch(`${base}/api/map/set-province-terrains`, { method: "POST", headers: { "Content-Type": "application/json", "X-Nova-Map-Save": "h-lost-3" },
        body: JSON.stringify({ modPath: m, changes: [{ provinceId: PU, terrain: "forest" }, { provinceId: P1, terrain: "forest" }] }) }).then((x) => x.json());
      const look = ((res.results || []).find((x) => x.provinceId === PU) || {}).cityLook || {}, g = res.ground || {};
      const tNow = terrainAt(m);
      ok(res.ok && look.changed && look.mode === "uncity" && g.changed && JSON.stringify(g.provinces) === JSON.stringify([P1, PU].sort((a, b) => a - b)) && g.lights && g.lights.changed
        && !pixelsOf(PU).some(([x, y]) => tNow(x, y) === SPAWN) && share(tNow, interior(P1, 6), new Set([FOREST_LO])) > 0.95,
        "THE CONTROL: one request took PU's city off and painted the ground of both, so the one relight had both masks", { ok: res.ok, error: res.error, look: { changed: look.changed, mode: look.mode }, ground: { changed: g.changed, provinces: g.provinces, lights: g.lights && g.lights.changed } });
      const cmNow = rgbOf(path.join(m, CM));
      const p1Was = meanTint(cmCity, P1), p1Now = meanTint(cmNow, P1);
      ok(toward(p1Now, p1Was, TINT[FOREST_LO]) > 0.7, `⭐⭐⭐ the colour map over P1, whose ground alone changed, is recoloured toward the woods' green (${p1Was} → ${p1Now}) in the relight it shared with a city look (the ground's 4 kept where the city look's mask is 0)`, { p1Was, p1Now });
      const puWas = meanTint(cmCity, PU), puNow = meanTint(cmNow, PU);
      ok(toward(puNow, puWas, TINT[FOREST_LO]) > 0.7, `⭐⭐ …and so is the colour map over PU's own ground round the city it lost (${puWas} → ${puNow})`, { puWas, puNow });
      const stillLit = lit.filter(([X, Y]) => cmNow(X, Y)[3] !== cmBase(X, Y)[3]);
      ok(stillLit.length === 0, `⭐⭐⭐ every one of the ${lit.length} texels the city lit is as dark as before it came: its ground taken off and painted forest is a city gone (the city look's 1 over the ground's 4), and its light goes with it`,
        { stillLit: stillLit.length, sample: stillLit.slice(0, 6).map(([X, Y]) => [X, Y, cmBase(X, Y)[3], cmCity(X, Y)[3], cmNow(X, Y)[3]]) });
      const litSet = new Set(lit.map(([X, Y]) => X + "," + Y)), away = [];
      for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) { const p = provAt(2 * X, 2 * Y); if (p !== PU && p !== P1 && !litSet.has(X + "," + Y) && cmNow(X, Y)[3] !== cmCity(X, Y)[3]) away.push([X, Y, p]); }
      ok(away.length === 0, "…and no other light off the two moved: the glow round PT's town and P2's star shine as they did", { away: away.length, sample: away.slice(0, 6) });
    }

  } catch (e) {
    ok(false, "the Saves ran", String((e && e.stack) || e).slice(0, 600));
  } finally {
    if (server) await new Promise((r) => server.close(r));
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
    process.exit(fail ? 1 : 0);
  }
})();
