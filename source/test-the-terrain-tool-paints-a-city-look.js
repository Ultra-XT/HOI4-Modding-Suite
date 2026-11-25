// ⛔ #the-terrain-tool-paints-a-city-look — A PROVINCE THE TERRAIN TOOL MAKES URBAN GETS A TOWN TO LOOK AT, AND ONE IT TAKES URBAN
// FROM LOSES ITS TOWN.
//
// hoi4.exe draws a city from terrain.bmp alone: a mesh on every second pixel of spawn_city ground in a LAND province, whatever
// definition.csv's terrain column says (cities.cpp, 0x1416F2B60 in 1.19.4.1; the land gate is the type byte), and its night lights from
// the colour map's alpha (gfx/FX/pdxmap.shader: `CityLightsMask = TerrainColor.a`). The Terrain brush and the province inspector
// (POST /api/map/set-province-terrain → setProvinceDefinition) rewrote the terrain column and nothing else. Measured through the
// endpoint with the page's own bodies on a scratch mod over the base game (2026-10-21): 5121 (forest) → urban kept 0 of its 494 px
// city ground and no light, the only file the mod gained map/definition.csv; 650, Santiago (urban, 134 px of city ground) → plains
// kept its whole city standing. TEST 37's owner: "checking some cities, they did not have a city look".
//
// Pinned on a two-layer world (an add-on over a layer below that has towns of known sizes), with what the page sends:
//   1. the brush's {provinceId, terrain: "urban"} on a plains province grows ONE core of city ground, all on that province, the size
//      of a town of its state's kind below (the median of them, not the mean), from its victory point's marker — and changes no other
//      pixel of terrain.bmp; the colour map lights it, and changes nothing far from it;
//   2. with no marker, from its supply node; a province in a state of another kind gets that kind's size;
//   3. the inspector's {provinceId, terrain, type, coastal} gives the same bytes as the brush's body;
//   4. urban → plains takes every pixel of its city ground off and puts its light out round it — and, since
//      #the-terrain-tool-grows-what-its-terrain-grows, the whole province is then painted with the ground the map below paints on
//      plains, so what the city look laid over the town (the ground round it) is not what the province ends with;
//   5. a province holding a small town of its own has its city grown round it, not one pixel of it repainted (it was left as it is:
//      review F2), and a change between two ordinary terrains paints no town: only the new terrain's ground
//      (#the-terrain-tool-grows-what-its-terrain-grows; test-the-terrain-tool-grows-what-its-terrain-grows.js pins that pass on a world
//      of its own).
// The page's Save note says what was painted (terrainWriteNotes, run from public/map.js).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-terrain-city-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const dds = require("./dds-codec.js");
const P = require("./testlib-map-page.js");

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
function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}
const read8 = (file) => { const b = fs.readFileSync(file), W = b.readInt32LE(18), H = b.readInt32LE(22), off = b.readUInt32LE(10), rs = Math.floor((8 * W + 31) / 32) * 4; return (x, y) => b[off + (H - 1 - y) * rs + x]; };
/** A DDS of `format` (RGB32 | DXT5), `levels` mips, painted by fn(x, y, level) → [r, g, b, a]. */
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
const alphaOf = (file) => {
  // (a mod that has no colour map of its own shows the layer below's: ROOT/modN/map/terrain/x.dds → ROOT/game/map/terrain/x.dds)
  if (!fs.existsSync(file)) file = path.join(ROOT, "game", "map", "terrain", path.basename(file));
  const b = fs.readFileSync(file), h = dds.parseDdsHeader(b), img = dds.decodeDdsLevel(b, h, 0);
  return { W: h.lv[0].w, at: (X, Y) => img[(Y * h.lv[0].w + X) * 4 + 3], img };
};

// ── the world: 8 x 4 provinces of 40 x 32 px, id = row * 8 + col + 1; rows 0-2 land, row 3 sea; 2 px to a texel ─────────────────
const CW = 40, RH = 32, COLS = 8, ROWS = 4, W = CW * COLS, H = RH * ROWS, TW = W / 2, TH = H / 2;
const PLAINS = 0, FOREST = 1, SPAWN = 13, OCEAN = 15, HILLS = 17;
const idAt = (c, r) => r * COLS + c + 1;
const provAt = (x, y) => idAt(Math.floor(x / CW), Math.floor(y / RH));
const cellOf = (id) => [(id - 1) % COLS, Math.floor((id - 1) / COLS)];
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const isLand = (id) => cellOf(id)[1] < 3;
// the layer below's towns: a w x h core in the middle of each, forest round it inside the province. Two KINDS of state with towns of
// different sizes, so a town is sized by its kind; four metropolis towns whose median (50) is not their mean (46)
const CORE = new Map([[idAt(0, 0), [6, 5]], [idAt(1, 1), [8, 5]], [idAt(2, 0), [10, 5]], [idAt(3, 2), [8, 8]], [idAt(4, 0), [5, 4]], [idAt(6, 1), [6, 4]]]);
const inCore = (x, y) => { const id = provAt(x, y), c = CORE.get(id); if (!c) return false; const lx = x % CW, ly = y % RH, x0 = Math.floor((CW - c[0]) / 2), y0 = Math.floor((RH - c[1]) / 2); return lx >= x0 && lx < x0 + c[0] && ly >= y0 && ly < y0 + c[1]; };
const A = idAt(0, 1), B = idAt(2, 1), C = idAt(1, 1), D = idAt(3, 1), E = idAt(5, 1), F = idAt(5, 2);
const SPECK = (x, y) => provAt(x, y) === D && x % CW >= 30 && x % CW < 33 && y % RH >= 3 && y % RH < 5;   // a modder's own 6 px town in D
const A_MARK = { lx: 7, ly: 9 }, B_NODE = { lx: 30, ly: 22 };   // A's victory-point marker, B's supply node — both well off the middle
const HILLY = (id) => id === E;   // E stands in hills: its town's ground is what is round it
const terrainIndexBelow = (x, y) => { const p = provAt(x, y); if (!isLand(p)) return OCEAN; if (inCore(x, y) || SPECK(x, y)) return SPAWN; if (CORE.has(p)) return FOREST; return HILLY(p) ? HILLS : PLAINS; };
const stateOf = (id) => { const [c] = cellOf(id); return Math.floor(c / 2) + 1; };
const CAT = { 1: "metropolis", 2: "metropolis", 3: "town", 4: "town" };
const URBAN_RGB = [120, 110, 100], LAND_RGB = [150, 120, 60], SEA_RGB = [79, 102, 141];

function makeGame() {
  const g = path.join(ROOT, "game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${isLand(id) ? `land;false;${CORE.has(id) ? "urban" : HILLY(id) ? "hills" : "plains"};1` : "sea;false;ocean;0"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, terrainIndexBelow));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (isLand(provAt(x, y)) ? 106 : 89)));
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  forest = { color = { 0 120 0 } }", "  hills = { color = { 150 120 60 } }", "  urban = { color = { 120 110 100 } }",
    "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  forest = { type = forest color = { 1 } }", "  hills = { type = hills color = { 17 } }",
    "  forest_13 = { type = urban color = { 13 } texture = 10 spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  for (let s = 1; s <= 4; s++) {
    const provs = []; for (let r = 0; r < 3; r++) for (const c of [2 * s - 2, 2 * s - 1]) provs.push(idAt(c, r));
    write(g, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=100000\n\tstate_category=${CAT[s]}\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=${s <= 2 ? "AAA" : "BBB"}\n\t\tvictory_points = { ${provs[0]} 5 }\n\t}\n}\n`);
  }
  // A's victory-point marker and B's supply node (rows are x;y;z with z counted from the bottom)
  const z = (ly, id) => H - 1 - (cellOf(id)[1] * RH + ly);
  const ax = cellOf(A)[0] * CW + A_MARK.lx, bx = cellOf(B)[0] * CW + B_NODE.lx;
  write(g, "map/unitstacks.txt", `${A};38;${ax}.50;10.00;${z(A_MARK.ly, A)}.50;0.00;0.00\n`);
  write(g, "map/buildings.txt", `${stateOf(B)};supply_node;${bx}.00;10.00;${z(B_NODE.ly, B)}.00;0.00;0\n`);
  // the night lights, painted FOR this map: each town's core lit, a glow two texels round it, dark everywhere else
  const coreTexel = (X, Y) => inCore(2 * X, 2 * Y) || SPECK(2 * X, 2 * Y);
  const nearCore = (X, Y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = X + dx, y = Y + dy; if (x >= 0 && y >= 0 && x < TW && y < TH && coreTexel(x, y)) return true; } return false; };
  const texel = (X, Y) => ({ land: isLand(provAt(2 * X, 2 * Y)), core: coreTexel(X, Y), glow: nearCore(X, Y) });
  write(g, "map/terrain/colormap_rgb_cityemissivemask_a.dds", makeDds(TW, TH, "RGB32", 1, (X, Y) => { const t = texel(X, Y); return t.core ? [...URBAN_RGB, 173] : t.land ? [...LAND_RGB, t.glow ? 60 : 0] : [...SEA_RGB, 0]; }));
  for (const [n, s] of [["colormap_water_0.dds", 1], ["colormap_water_1.dds", 2], ["colormap_water_2.dds", 4]]) {
    // (the land in the water tints and the fog carries a grain, as the base game's does: a repaint of it would show)
    write(g, "map/terrain/" + n, makeDds(TW / s, TH / s, "DXT5", 1, (X, Y) => (texel(X * s, Y * s).land ? [52 + ((X * 7 + Y * 13) % 17), 70, 60, 255] : [35, 59, 81, 255])));
  }
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 6, (X, Y, l) => (texel(Math.min(TW - 1, X << l), Math.min(TH - 1, Y << l)).land ? [132 + ((X * 5 + Y * 3) % 16), 132 + ((X * 5 + Y * 3) % 16), 132 + ((X * 5 + Y * 3) % 16), 21] : [90, 90, 90, 40])));
  return g;
}
const GAME = makeGame();
let modN = 0;
const freshMod = () => { const m = path.join(ROOT, "mod" + (++modN)); write(m, "descriptor.mod", 'name="terrain city"\n'); return m; };
const pick = (mod, rel) => (fs.existsSync(path.join(mod, rel)) ? path.join(mod, rel) : path.join(GAME, rel));
const terrainNow = (mod) => read8(pick(mod, "map/terrain.bmp"));
const below = read8(path.join(GAME, "map/terrain.bmp"));
const changedPixels = (mod) => { const at = terrainNow(mod), out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) !== below(x, y)) out.push({ x, y, p: provAt(x, y), was: below(x, y), now: at(x, y) }); return out; };
const pixelsOf = (id) => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === id) out.push({ x, y }); return out; };
const texelsOf = (list) => new Set(list.map(({ x, y }) => (y >> 1) * TW + (x >> 1)));
const oneBlob = (list) => {
  const px = new Set(list.map(({ x, y }) => y * W + x)); if (!px.size) return false;
  const first = px.values().next().value, seen = new Set([first]), q = [first];
  while (q.length) { const i = q.shift(), x = i % W; for (const d of [-1, 1, -W, W, -W - 1, -W + 1, W - 1, W + 1]) { const j = i + d; if (Math.abs((j % W) - x) > 1 || !px.has(j) || seen.has(j)) continue; seen.add(j); q.push(j); } }
  return seen.size === px.size;
};
const texelDistance = (i, set) => { const X = i % TW, Y = (i - X) / TW; let best = Infinity; for (const j of set) { const x = j % TW, y = (j - x) / TW; best = Math.min(best, Math.max(Math.abs(x - X), Math.abs(y - Y))); } return best; };
const colormapChanges = (mod) => {
  const f = path.join(mod, "map/terrain/colormap_rgb_cityemissivemask_a.dds");
  if (!fs.existsSync(f)) return null;
  const now = alphaOf(f).img, was = alphaOf(path.join(GAME, "map/terrain/colormap_rgb_cityemissivemask_a.dds")).img, out = [];
  for (let i = 0; i < TW * TH; i++) for (let k = 0; k < 4; k++) if (now[i * 4 + k] !== was[i * 4 + k]) { out.push(i); break; }
  return out;
};
const call = (mod, body) => md.setProvinceDefinition({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], ...body });

console.log("\n-- the layer below, as the readers see it --");
{
  const g = md.cityGroundBeneath({ modRoot: path.join(ROOT, "nothing"), gameRoot: GAME });
  const metro = g && g.coreSizesByCategory.get("metropolis"), town = g && g.coreSizesByCategory.get("town");
  ok(g && JSON.stringify(metro) === "[30,40,50,64]" && JSON.stringify(town) === "[20,24]", "THE CONTROL: the layer below's towns are 30/40/50/64 px in its metropolis states and 20/24 in its town states", g && { metro, town });
  ok(g && g.coreArea === Math.round((30 + 40 + 50 + 64 + 20 + 24) / 6) && g.coreArea !== 50, "THE CONTROL: …so the mean town (the painter's default) is not the metropolis median", g && g.coreArea);
}

console.log("\n-- ⭐ 1. the brush makes plains province A urban: ONE town of its kind's size, round its victory point, and nothing else moves --");
const modA = freshMod();
const resA = call(modA, { provinceId: A, terrain: "urban" });
{
  const def = fs.readFileSync(path.join(modA, "map/definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(A)) || "";
  ok(resA.changed && def.split(";")[6] === "urban", "THE CONTROL: definition.csv says urban", def);
  const ch = changedPixels(modA);
  const want = md.townCoreSizes({ urban: [{ id: A, category: "metropolis", area: 0 }], sizesOf: () => [30, 40, 50, 64] }).get(A);
  ok(want === 50, "(the size a metropolis town is below, by townCoreSizes for one province: the median, 50)", want);
  ok(ch.length === want && ch.every((c) => c.p === A && c.now === SPAWN && c.was === PLAINS), `⭐⭐⭐ terrain.bmp gained exactly ${want} px of city ground, every one in A, and no other pixel changed`, { n: ch.length, sample: ch.filter((c) => c.p !== A || c.now !== SPAWN).slice(0, 5) });
  ok(oneBlob(ch), "⭐ …in ONE patch: a town with rings, not scattered blocks", ch.length);
  const mx = cellOf(A)[0] * CW + A_MARK.lx, my = cellOf(A)[1] * RH + A_MARK.ly;
  ok(ch.some((c) => c.x === mx && c.y === my), "⭐⭐ …grown round A's victory-point marker (unitstacks type 38, where the game draws the town's name), not its middle", { mark: [mx, my] });
  ok(resA.cityLook && resA.cityLook.painted && resA.cityLook.painted.seededAt === "victory point" && resA.cityLook.size && resA.cityLook.size.category === "metropolis", "…and the answer says so: seeded at the victory point, sized by a metropolis town below", resA.cityLook);
  const cm = colormapChanges(modA), a = alphaOf(path.join(modA, "map/terrain/colormap_rgb_cityemissivemask_a.dds"));
  const coreTex = [...texelsOf(ch)].filter((i) => { const X = i % TW, Y = (i - X) / TW; return [[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => ch.some((c) => c.x === 2 * X + dx && c.y === 2 * Y + dy)); });
  ok(coreTex.length > 0 && coreTex.every((i) => a.img[i * 4 + 3] > 0), `⭐⭐ the colour map lights the new town at night (${coreTex.length} texels wholly on it, all lit)`, coreTex.map((i) => a.img[i * 4 + 3]));
  const aTex = texelsOf(pixelsOf(A));
  ok(cm && cm.length > 0 && cm.every((i) => texelDistance(i, texelsOf(ch)) <= 9), "⭐ …and changed no texel farther than 9 from it (its light and glow, nothing else of the world)", cm && { n: cm.length, far: cm.filter((i) => texelDistance(i, texelsOf(ch)) > 9).slice(0, 5) });
  const ring = [...aTex].filter((i) => !texelsOf(ch).has(i) && texelDistance(i, texelsOf(ch)) <= 2);
  ok(ring.length > 0 && ring.some((i) => a.img[i * 4 + 3] > 0), "…with a glow round it on the land the tool left as it was, as round the towns below", ring.map((i) => a.img[i * 4 + 3]).slice(0, 12));
  const pics = fs.existsSync(path.join(modA, "map/terrain")) ? fs.readdirSync(path.join(modA, "map/terrain")) : [];
  ok(pics.length === 1 && ["water_0", "water_1", "water_2", "fow_rgb"].every((n) => !pics.some((f) => f.includes(n))), "…and copied none of the pictures it does not change into the mod (the water tints, the fog)", pics);
}

console.log("\n-- ⭐ 2. with no marker, round its supply node; in a state of another kind, that kind's size --");
{
  const modB = freshMod();
  const r = call(modB, { provinceId: B, terrain: "urban" });
  const ch = changedPixels(modB);
  const nx = cellOf(B)[0] * CW + B_NODE.lx, ny = cellOf(B)[1] * RH + B_NODE.ly;
  ok(ch.length === 50 && ch.every((c) => c.p === B) && ch.some((c) => c.x === nx && c.y === ny), "⭐⭐ B (no marker) grows its 50 px town round its supply node in buildings.txt", { n: ch.length, node: [nx, ny], seeded: r.cityLook && r.cityLook.painted });
  const modE = freshMod();
  const rE = call(modE, { provinceId: E, terrain: "urban" });
  const chE = changedPixels(modE);
  ok(chE.length === 24 && chE.every((c) => c.p === E && c.was === HILLS), "⭐ E, in a TOWN state, gets a town state's town: 24 px (the median of 20 and 24 by townCoreSizes), not a metropolis's 50", { n: chE.length, size: rE.cityLook && rE.cityLook.size });
  ok(rE.cityLook && rE.cityLook.painted && rE.cityLook.painted.seededAt === "middle", "…and with neither a marker nor a node, from its middle", rE.cityLook && rE.cityLook.painted);
}

console.log("\n-- ⭐ 3. the inspector's body gives the brush's result, byte for byte --");
{
  const modI = freshMod();
  const r = call(modI, { provinceId: A, terrain: "urban", type: "land", coastal: false });
  ok(r.changed && r.cityLook && r.cityLook.changed, "THE CONTROL: the inspector's {provinceId, terrain, type, coastal} painted too", r.cityLook);
  const same = (rel) => fs.existsSync(path.join(modA, rel)) && fs.existsSync(path.join(modI, rel)) && Buffer.compare(fs.readFileSync(path.join(modA, rel)), fs.readFileSync(path.join(modI, rel))) === 0;
  ok(same("map/terrain.bmp") && same("map/terrain/colormap_rgb_cityemissivemask_a.dds"), "⭐⭐ terrain.bmp and the colour map are byte-identical to the brush's", { terrain: same("map/terrain.bmp"), colormap: same("map/terrain/colormap_rgb_cityemissivemask_a.dds") });
}

console.log("\n-- ⭐ 4. urban → plains takes the town off, and its light with it, and paints the province's ground as plains --");
{
  const modC = freshMod();
  const was = pixelsOf(C).filter(({ x, y }) => below(x, y) === SPAWN);
  ok(was.length === 40, "THE CONTROL: C carries a 40 px town below", was.length);
  // what the map below paints on plains, its city ground aside (D's speck is a town, not ground): the mix C is painted from
  const plainsBelow = new Set();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = provAt(x, y); if (isLand(p) && !CORE.has(p) && !HILLY(p) && below(x, y) !== SPAWN) plainsBelow.add(below(x, y)); }
  ok(plainsBelow.size === 1 && plainsBelow.has(PLAINS), "THE CONTROL: the map below paints its plains with index 0 alone", [...plainsBelow]);
  const r = call(modC, { provinceId: C, terrain: "plains" });
  const ch = changedPixels(modC), at = terrainNow(modC);
  ok(was.every(({ x, y }) => at(x, y) !== SPAWN) && ch.filter((c) => c.was === SPAWN).length === 40, "⭐⭐⭐ every pixel of C's city ground is taken off terrain.bmp", { left: was.filter(({ x, y }) => at(x, y) === SPAWN).length });
  ok(ch.length > 0 && ch.every((c) => c.p === C) && pixelsOf(C).every(({ x, y }) => at(x, y) === PLAINS), "⭐⭐ …and the whole of C is painted with the ground the map below paints on plains, the forest round its old town with it, and no pixel outside C changed (#the-terrain-tool-grows-what-its-terrain-grows)", { n: ch.length, outside: ch.filter((c) => c.p !== C).length, notPlains: ch.filter((c) => c.now !== PLAINS).slice(0, 3) });
  const a = alphaOf(path.join(modC, "map/terrain/colormap_rgb_cityemissivemask_a.dds")), before = alphaOf(path.join(GAME, "map/terrain/colormap_rgb_cityemissivemask_a.dds"));
  const tex = texelsOf(was), round = [];
  for (let i = 0; i < TW * TH; i++) if (!tex.has(i) && texelDistance(i, tex) <= 2 && before.img[i * 4 + 3] > 0) round.push(i);
  ok([...tex].every((i) => a.img[i * 4 + 3] === 0), "⭐⭐ its city texels are dark at night", [...tex].map((i) => a.img[i * 4 + 3]).filter((v) => v));
  ok(round.length > 0 && round.every((i) => a.img[i * 4 + 3] === 0), `⭐ …and the glow round it is put out too (${round.length} texels), not left as a ring round a dark hole`, round.map((i) => a.img[i * 4 + 3]).filter((v) => v).slice(0, 10));
  ok(r.cityLook && r.cityLook.mode === "uncity" && r.cityLook.removed && r.cityLook.removed.pixels === 40, "…and the answer says what it took off", r.cityLook);
  ok(r.ground && r.ground.changed && Array.isArray(r.ground.provinces) && r.ground.provinces.includes(C), "…and that it painted C's ground", r.ground);
}

console.log("\n-- ⭐ 5. a modder's own small town is grown round and never repainted, and two ordinary terrains paint no town, only the new terrain's ground --");
{
  // ⚠️ MOVED WITH #a-city-grows-round-the-town-it-holds (review F2): D's 6 px of its own were left as they were, so a province made urban
  // over a village stayed a village. Its city is grown round them now, to a town of its kind below, and not one of the 6 is repainted.
  const modD = freshMod();
  const r = call(modD, { provinceId: D, terrain: "urban" });
  const at = terrainNow(modD), ch = changedPixels(modD);
  const kept6 = pixelsOf(D).filter(({ x, y }) => SPECK(x, y) && at(x, y) === SPAWN).length, dCity = pixelsOf(D).filter(({ x, y }) => at(x, y) === SPAWN).length;
  const cl = (r && r.cityLook) || {};
  ok(r.changed && cl.changed && cl.painted && cl.painted.grownFrom && cl.painted.grownFrom.pixels === 6 && cl.painted.size === 50 && kept6 === 6 && dCity === 50,
    "⭐⭐ D holds 6 px of city ground of its own: made urban, its city is grown round them to a metropolis town's 50 px, every one of the 6 kept", { cityLook: cl, kept6, dCity });
  ok(ch.length === 44 && ch.every((c) => c.p === D && c.now === SPAWN && !SPECK(c.x, c.y)), "…and the only pixels it changes are the 44 of new city ground round them, in D", ch.filter((c) => c.p !== D || c.now !== SPAWN || SPECK(c.x, c.y)).slice(0, 5));
  const modF = freshMod();
  const rF = call(modF, { provinceId: F, terrain: "forest" });
  ok(rF.changed && !rF.cityLook, "⭐ plains → forest says nothing about a city: no city look", rF.cityLook);
  // the map below grows no forest province to take a mix from (its forest is the ground round its towns, in urban provinces), so
  // the painter's own index for forest: its graphical entry's, 1
  const chF = changedPixels(modF), atF = terrainNow(modF);
  ok(chF.length === pixelsOf(F).length && chF.every((c) => c.p === F && c.was === PLAINS && c.now === FOREST) && !pixelsOf(F).some(({ x, y }) => atF(x, y) === SPAWN),
    "⭐ …and paints F's ground forest, every pixel of it and nothing else, and no city ground (#the-terrain-tool-grows-what-its-terrain-grows)", { n: chF.length, odd: chF.filter((c) => c.p !== F || c.now !== FOREST).slice(0, 3), ground: rF.ground });
}

console.log("\n-- ⭐ the page's Save note says what was painted (terrainWriteNotes, run from public/map.js) --");
{
  const fn = vm.runInNewContext(P.withNoteHelpers(P.lift("function terrainWriteNotes(")) + "\nterrainWriteNotes;", {});
  const w = { url: "/api/map/set-province-terrain", body: { provinceId: A, terrain: "urban" } };
  const notes = fn(resA, w);
  ok(notes.some((n) => /painted a town of 50 px of city ground round its victory point/.test(n) && /terrain\.bmp/.test(n) && /lit it at night/.test(n)), "⭐ the Save line names the town, its size, where it stands and that it was lit", notes);
  const off = fn({ cityLook: { changed: true, mode: "uncity", removed: { pixels: 40 }, lights: { changed: true } } }, { url: w.url, body: { provinceId: C, terrain: "plains" } });
  ok(off.some((n) => /took its 40 px of city ground off map\/terrain\.bmp/.test(n) && /put its lights out/.test(n)), "…and the one that took a town off says so", off);
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
