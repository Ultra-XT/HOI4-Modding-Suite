// ⛔ THE TERRAIN TOOL'S CITY LOOK, AS THE MAP HAS IT — the review of cce7ff9a (the terrain tool paints a city look), R1, R2, R3, R4, R8.
//
//   R1 #the-terrain-brush-paints-its-towns-in-one-write — the map page's Save sent one POST /api/map/set-province-terrain per province of
//      a brush stroke, and each painted and relit the city look with a backup of terrain.bmp and the colour map (11.5 MB each on the
//      base game). On a copy of Road to 56, 80 plains provinces made urban: 200 backups, 1,555 MB, 72.2 s, an older map edit's backup
//      evicted and none of the Save's first copies of terrain.bmp, the colour map or definition.csv left. Now a run of the brush's writes
//      goes as ONE POST /api/map/set-province-terrains: 3 backups, 24 MB, 3.8 s, every original kept (fixer's brush-batch.js, 10-21).
//   R2 #a-city-terrain-is-what-the-map-paints — a terrain was a city only if its graphical entry is spawn_city, so urban → Millennium
//      Dawn's supercity (no graphical entry; its provinces carry the urban index 13) took the town off. A terrain is a city when its
//      graphical entry is spawn_city or when more than half its land provinces hold city ground.
//   R3 #a-town-is-the-provinces-own-ground — a province holding 1 px of its neighbour's core was kept as having "a town of its own".
//   R4 #taking-a-city-away-lights-nothing — taking off a city whose ground touches another city's lit the texel they share as a new city
//      and raised the light round it (vanilla 9620 → plains: 171 texels brighter, by up to 189).
//   R8 — the colour-only repaint's window (`colourOnly`) had no control: a mod that owns its colour map and inherits the water tints and
//      the fog is now held to the windowed path.
//
// Pinned on a world built for it: 8 x 4 provinces of 40 x 32 px over a layer below, with two towns whose ground touches across a
// jagged border, a town spilling 2 px into the province beside it, a modder's own 6 px speck, and a terrain with no graphical entry
// whose two provinces are painted with city ground. R1 runs the page's own flushMapSaves against the real server.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-city-look-map-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
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

// ── the world: 8 x 4 provinces of 40 x 32 px, id = row * 8 + col + 1, rows 0-2 land, row 3 sea; 2 px to a texel ─────────────────────
const CW = 40, RH = 32, COLS = 8, ROWS = 4, W = CW * COLS, H = RH * ROWS, TW = W / 2, TH = H / 2;
const PLAINS = 0, FOREST = 1, SPAWN = 13, OCEAN = 15, HILLS = 17;
const idAt = (c, r) => r * COLS + c + 1;
const TA = idAt(0, 1), TB = idAt(1, 1);
// row 1's border between TA and TB is jagged: x = 40 is TA's on even rows, so the texel at x 40-41 holds 1 px of TA and 3 of TB
const provAt = (x, y) => (Math.floor(y / RH) === 1 && x === CW && y % 2 === 0 ? TA : idAt(Math.floor(x / CW), Math.floor(y / RH)));
const cellOf = (id) => [(id - 1) % COLS, Math.floor((id - 1) / COLS)];
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const isLand = (id) => cellOf(id)[1] < 3;
const U1 = idAt(0, 0), U2 = idAt(2, 0), SP = idAt(2, 1), NB = idAt(3, 1), OWN = idAt(5, 1), SC1 = idAt(0, 2), SC2 = idAt(1, 2), PL = idAt(2, 2);
const CORES = new Map([[U1, [6, 5]], [U2, [8, 5]], [SC1, [8, 5]], [SC2, [8, 5]]]);
const BAND = (x, y) => y >= RH + 12 && y < RH + 18 && x >= 30 && x < 50;              // TA's and TB's towns, touching across the border
const SPCORE = (x, y) => x >= 110 && x < 120 && y >= RH + 10 && y < RH + 15;           // SP's town at its east edge…
const SPILL = (x, y) => x === 120 && (y === RH + 11 || y === RH + 12);                 // …spilling 2 px into NB
const SPECK = (x, y) => x >= 220 && x < 223 && y >= RH + 5 && y < RH + 7;               // OWN's own 6 px, touching no other city
const isCityPx = (x, y) => {
  const p = provAt(x, y);
  if (!isLand(p)) return false;
  if (BAND(x, y) && (p === TA || p === TB)) return true;
  if (SPCORE(x, y) || SPILL(x, y) || SPECK(x, y)) return true;
  const c = CORES.get(p); if (!c) return false;
  const lx = x % CW, ly = y % RH, x0 = Math.floor((CW - c[0]) / 2), y0 = Math.floor((RH - c[1]) / 2);
  return lx >= x0 && lx < x0 + c[0] && ly >= y0 && ly < y0 + c[1];
};
const URBAN = new Set([U1, U2, TA, TB, SP]), SUPER = new Set([SC1, SC2]);
const terrainBelow = (x, y) => (!isLand(provAt(x, y)) ? OCEAN : isCityPx(x, y) ? SPAWN : PLAINS);
const URBAN_RGB = [120, 110, 100], LAND_RGB = [150, 120, 60], SEA_RGB = [79, 102, 141];
function makeGame() {
  const g = path.join(ROOT, "game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${isLand(id) ? `land;false;${URBAN.has(id) ? "urban" : SUPER.has(id) ? "supercity" : "plains"};1` : "sea;false;ocean;0"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, terrainBelow));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (isLand(provAt(x, y)) ? 106 : 89)));
  // `supercity` has NO graphical entry, as Millennium Dawn's has none: its provinces are painted with the urban index
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  forest = { color = { 0 120 0 } }", "  hills = { color = { 150 120 60 } }", "  urban = { color = { 120 110 100 } }",
    "  supercity = { color = { 140 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  forest = { type = forest color = { 1 } }", "  hills = { type = hills color = { 17 } }",
    "  forest_13 = { type = urban color = { 13 } texture = 10 spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  for (let s = 1; s <= 4; s++) {
    const provs = []; for (let r = 0; r < 3; r++) for (const c of [2 * s - 2, 2 * s - 1]) provs.push(idAt(c, r));
    write(g, `history/states/${s}-S.txt`, `state={\n\tid=${s}\n\tname="STATE_${s}"\n\tmanpower=100000\n\tstate_category=city\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${provs[0]} 5 }\n\t}\n}\n`);
  }
  // the night lights, painted FOR this map: each town's ground lit, a glow two texels round it, dark everywhere else
  const cityTexel = (X, Y) => [[0, 0], [1, 0], [0, 1], [1, 1]].some(([dx, dy]) => isCityPx(2 * X + dx, 2 * Y + dy));
  const nearCity = (X, Y) => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = X + dx, y = Y + dy; if (x >= 0 && y >= 0 && x < TW && y < TH && cityTexel(x, y)) return true; } return false; };
  const texel = (X, Y) => ({ land: isLand(provAt(2 * X, 2 * Y)), city: cityTexel(X, Y), glow: nearCity(X, Y) });
  write(g, CM, makeDds(TW, TH, "RGB32", 1, (X, Y) => { const t = texel(X, Y); return t.city ? [...URBAN_RGB, 173] : t.land ? [...LAND_RGB, t.glow ? 60 : 0] : [...SEA_RGB, 0]; }));
  for (const [n, s] of [["colormap_water_0.dds", 1], ["colormap_water_1.dds", 2], ["colormap_water_2.dds", 4]]) {
    write(g, "map/terrain/" + n, makeDds(TW / s, TH / s, "DXT5", 1, (X, Y) => (texel(X * s, Y * s).land ? [52 + ((X * 7 + Y * 13) % 17), 70, 60, 255] : [35, 59, 81, 255])));
  }
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 6, (X, Y, l) => (texel(Math.min(TW - 1, X << l), Math.min(TH - 1, Y << l)).land ? [132 + ((X * 5 + Y * 3) % 16), 132 + ((X * 5 + Y * 3) % 16), 132 + ((X * 5 + Y * 3) % 16), 21] : [90, 90, 90, 40])));
  return g;
}
const GAME = makeGame();
let modN = 0;
const freshMod = (own = []) => {
  const m = path.join(process.env.HOI4_MODS_ROOT, "mod" + (++modN));
  write(m, "descriptor.mod", 'name="city look reads the map"\n');
  for (const rel of own) write(m, rel, fs.readFileSync(path.join(GAME, rel)));   // the files the mod owns already, as its own copies
  return m;
};
const pick = (mod, rel) => (fs.existsSync(path.join(mod, rel)) ? path.join(mod, rel) : path.join(GAME, rel));
const below = read8(path.join(GAME, "map/terrain.bmp"));
const cityPxOf = (mod, id) => { const at = read8(pick(mod, "map/terrain.bmp")); let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (provAt(x, y) === id && at(x, y) === SPAWN) n++; return n; };
const changedPixels = (mod) => { const at = read8(pick(mod, "map/terrain.bmp")), out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) !== below(x, y)) out.push({ x, y, p: provAt(x, y), was: below(x, y), now: at(x, y) }); return out; };
const alphaOf = (file) => { const b = fs.readFileSync(file), h = dds.parseDdsHeader(b); return dds.decodeDdsLevel(b, h, 0); };
const call = (mod, body) => md.setProvinceDefinition({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], ...body });
const notesOf = vm.runInNewContext(P.withNoteHelpers(P.lift("function terrainWriteNotes(")) + "\nterrainWriteNotes;", {});

console.log("\n-- the world, as the readers see it --");
{
  const cats = md.cityTerrainCategories({ modRoot: freshMod(), gameRoot: GAME, dependencyRoots: [] });
  ok(cats.get("urban") && cats.get("urban").by === "declared", "THE CONTROL: urban is a city by its spawn_city entry", [...cats]);
  ok(cats.get("supercity") && cats.get("supercity").by === "ground" && cats.get("supercity").index === SPAWN && cats.get("supercity").holding === 2,
    "⭐⭐ supercity, with no graphical entry, is a city because both its provinces hold city ground (index 13)", cats.get("supercity"));
  ok(!cats.has("plains"), "…and plains, whose provinces mostly hold none (one holds a 6 px speck, one 2 px of a neighbour's town), is not", [...cats.keys()]);
  let straddle = false;
  for (let Y = 0; Y < TH && !straddle; Y++) { const X = CW / 2, px = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([dx, dy]) => [2 * X + dx, 2 * Y + dy]); if (px.every(([x, y]) => isCityPx(x, y)) && px.filter(([x, y]) => provAt(x, y) === TA).length === 1) straddle = true; }
  ok(straddle, "THE CONTROL: a texel holds 1 px of TA's city ground and 3 of TB's — the shape R4 was measured on");
}

console.log("\n-- ⭐ R2. a terrain the map paints with city ground is a city: moving a town into it keeps the town --");
{
  const m1 = freshMod();
  const r = call(m1, { provinceId: U2, terrain: "supercity" });
  ok(r.changed && !r.cityLook && cityPxOf(m1, U2) === 40 && !fs.existsSync(path.join(m1, "map/terrain.bmp")), "⭐⭐⭐ urban → supercity paints nothing and takes nothing off: the town's 40 px stand (it was 'uncity', 40 → 0)", { cityLook: r.cityLook, px: cityPxOf(m1, U2) });
  const m2 = freshMod();
  const r2 = call(m2, { provinceId: PL, terrain: "supercity" });
  const ch = changedPixels(m2);
  ok(r2.cityLook && r2.cityLook.changed && r2.cityLook.painted && r2.cityLook.painted.index === SPAWN && ch.length === r2.cityLook.painted.pixels && ch.length > 0 && ch.every((c) => c.p === PL && c.now === SPAWN),
    "⭐⭐ plains → supercity paints a town of city ground (index 13, the ground supercity's provinces hold) on that province alone", { cityLook: r2.cityLook, n: ch.length });
  const m3 = freshMod();
  const r3 = call(m3, { provinceId: SC1, terrain: "plains" });
  ok(r3.cityLook && r3.cityLook.mode === "uncity" && r3.cityLook.removed && r3.cityLook.removed.pixels === 40 && cityPxOf(m3, SC1) === 0, "⭐ …and supercity → plains takes its town off", r3.cityLook);
  const m4 = freshMod();
  const r4 = call(m4, { provinceId: SC2, terrain: "urban" });
  ok(r4.changed && !r4.cityLook && cityPxOf(m4, SC2) === 40, "…and supercity → urban, one city to another, leaves it as it is", r4.cityLook);
}

console.log("\n-- ⭐ R3. a neighbour's town spilling over the border is not the province's own --");
{
  const m = freshMod();
  ok(cityPxOf(m, NB) === 2, "THE CONTROL: NB holds 2 px of city ground, joined to SP's town next door", cityPxOf(m, NB));
  const r = call(m, { provinceId: NB, terrain: "urban" });
  const cl = r.cityLook || {};
  ok(cl.changed && cl.painted && cl.painted.pixels >= 40 && cityPxOf(m, NB) >= 48, "⭐⭐⭐ NB made urban grows a town of its own (a town of its kind below is 50 px), not a 2 px one", { cityLook: cl, px: cityPxOf(m, NB) });
  ok(cl.painted && cl.painted.besideSpill && cl.painted.besideSpill.pixels === 2 && JSON.stringify(cl.painted.besideSpill.of) === JSON.stringify([SP]), "⭐ …and the answer names whose ground the 2 px were: SP's", cl.painted);
  const notes = notesOf(r, { url: "/api/map/set-province-terrain", body: { provinceId: NB, terrain: "urban" } });
  ok(notes.some((n) => /painted a town of/.test(n) && new RegExp(`edge of the town of province ${SP}`).test(n)) && !notes.some((n) => /of its own/.test(n) && !/not a town of its own/.test(n)), "⭐⭐ the Save note says the 2 px were the edge of SP's town, never 'of its own'", notes);
  // ⚠️ MOVED WITH #a-city-grows-round-the-town-it-holds (review F2): a town of its own smaller than a town of its kind was left as it is —
  // so a province made urban over the village Generate land gives every star stayed a village. It is grown round now, kept whole.
  const mo = freshMod();
  const ro = call(mo, { provinceId: OWN, terrain: "urban" });
  const ocl = (ro && ro.cityLook) || {};
  let speckKept = true; { const at = read8(pick(mo, "map/terrain.bmp")); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (SPECK(x, y) && at(x, y) !== SPAWN) speckKept = false; }
  ok(ro.changed && ocl.changed && ocl.mode === "city" && ocl.painted && ocl.painted.grownFrom && ocl.painted.grownFrom.pixels === 6 && !ocl.painted.besideSpill && speckKept && cityPxOf(mo, OWN) === ocl.painted.size,
    "THE CONTROL: OWN's 6 px touching no other town is its own — made urban, its city is grown round it to a town of its kind, every pixel of it kept, and no spill is said", ocl);
  const on = notesOf(ro, { url: "/api/map/set-province-terrain", body: { provinceId: OWN, terrain: "urban" } });
  ok(on.some((n) => /round the 6 px town it held/.test(n)) && !on.some((n) => /edge of the town/.test(n)), "…and its note says it grew round its own town, not round a neighbour's edge", on);
}

console.log("\n-- ⭐ R4. taking off a town whose ground touches another town's lights nothing --");
{
  const m = freshMod();
  const was = alphaOf(path.join(GAME, CM));
  const r = call(m, { provinceId: TA, terrain: "plains" });
  const now = alphaOf(path.join(m, CM));
  let brighter = 0, darker = 0; const up = [];
  for (let i = 0; i < TW * TH; i++) { const d = now[i * 4 + 3] - was[i * 4 + 3]; if (d > 0) { brighter++; if (up.length < 6) up.push({ X: i % TW, Y: (i / TW) | 0, was: was[i * 4 + 3], now: now[i * 4 + 3] }); } else if (d < 0) darker++; }
  ok(r.cityLook && r.cityLook.mode === "uncity" && r.cityLook.removed && r.cityLook.removed.pixels === 63 && cityPxOf(m, TA) === 0 && cityPxOf(m, TB) === 57, "THE CONTROL: TA's 63 px of city ground are taken off, TB's 57 stand", { cityLook: r.cityLook, ta: cityPxOf(m, TA), tb: cityPxOf(m, TB) });
  ok(brighter === 0, "⭐⭐⭐ no texel of the colour map gets brighter: the texel TA shared with TB is not lit as a new town, and nothing round it is raised", { brighter, up });
  ok(darker > 0 && r.cityLook.lights && r.cityLook.lights.round && r.cityLook.lights.round.raised === 0, "⭐ …while TA's own lights go out", { darker, round: r.cityLook.lights && r.cityLook.lights.round });
  const shared = (Y) => ((Y * TW + CW / 2) * 4 + 3);
  const keptLit = []; for (let Y = 0; Y < TH; Y++) if ([[0, 0], [1, 0], [0, 1], [1, 1]].every(([dx, dy]) => isCityPx(CW + dx, 2 * Y + dy))) keptLit.push(now[shared(Y)] === was[shared(Y)]);
  ok(keptLit.length > 0 && keptLit.every(Boolean), "⭐ …and the texel still TB's city ground keeps the light it had", keptLit);
  const mc = freshMod();
  const rc = call(mc, { provinceId: U1, terrain: "plains" });
  const nc = alphaOf(path.join(mc, CM));
  let up2 = 0; for (let i = 0; i < TW * TH; i++) if (nc[i * 4 + 3] > was[i * 4 + 3]) up2++;
  ok(rc.cityLook && rc.cityLook.removed && up2 === 0, "THE CONTROL: a town that touches none (U1) goes dark the same way", { up2, cityLook: rc.cityLook && rc.cityLook.removed });
}

console.log("\n-- ⭐ R8. a mod that owns its colour map and inherits the water tints and the fog: the colour map alone, in a window --");
{
  const own = freshMod([CM]);
  const r = call(own, { provinceId: PL, terrain: "urban" });
  const lights = (r.cityLook && r.cityLook.lights) || {};
  const pics = fs.readdirSync(path.join(own, "map/terrain"));
  ok(r.cityLook && r.cityLook.changed && lights.changed && JSON.stringify(lights.files) === JSON.stringify(["colormap_rgb_cityemissivemask_a.dds"]) && pics.length === 1, "THE CONTROL: the city is painted and lit, and only the colour map is written", { lights, pics });
  ok(lights.windowed === true, "⭐⭐ …worked in the window round it: the pictures it inherits do not send a colour-only repaint over the whole map", lights);
  const inh = freshMod();
  const ri = call(inh, { provinceId: PL, terrain: "urban" });
  ok(ri.cityLook && ri.cityLook.lights && ri.cityLook.lights.windowed === false, "THE CONTROL: a mod that inherits its colour map is repaired over the whole map, as it always was", ri.cityLook && ri.cityLook.lights);
  ok(sha(path.join(own, CM)) === sha(path.join(inh, CM)), "⭐ …and both write the same colour map", { own: sha(path.join(own, CM)), inherited: sha(path.join(inh, CM)) });
}

console.log("\n-- ⭐ R1. a brush stroke's Save writes definition.csv, terrain.bmp and the colour map once each, and every original is kept --");
(async () => {
  process.env.HOI4_ROOT = GAME;
  const { createApp } = require("./server.js");
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const M = freshMod(["map/definition.csv", "map/terrain.bmp", CM, "map/provinces.bmp"]);
    const before = { def: sha(path.join(M, "map/definition.csv")), terrain: sha(path.join(M, "map/terrain.bmp")), cm: sha(path.join(M, CM)) };
    // an older map edit's backup, as the reviewer's sentinel
    write(M, "map/railways.txt", "");
    require("./safe-write.js").safeModWrite(path.join(M, "map/railways.txt"), "1 2 1 2\n", "map-writeRailway");
    const backups = () => { try { return fs.readdirSync(BACKUP_DIR); } catch (_) { return []; } };
    const sentinel = backups();
    // the stroke: every plains land province that holds no city ground, made urban, queued as paintTerrainAt queues it
    const stroke = []; for (let id = 1; id <= COLS * ROWS; id++) if (isLand(id) && !URBAN.has(id) && !SUPER.has(id) && id !== NB && id !== OWN) stroke.push(id);
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
      fetch: async (url, opts) => { posted.push(String(url).split("?")[0]); return fetch(base + url, opts); },
    }));
    for (const id of stroke) page.sb.queueWrite("/api/map/set-province-terrain", { provinceId: id, terrain: "urban" });
    const labels = require("./public/map-rule-labels.js");
    const fatal = async () => ((await fetch(`${base}/api/map/validate?modPath=${encodeURIComponent(M)}`).then((x) => x.json())).problems || []).filter((p) => labels.isFatalRule(p.rule)).map((p) => p.rule).sort();
    const fatalBefore = await fatal();
    await page.sb.flushMapSaves(); await P.settle(150);
    const lines = page.statuses.join("\n");
    const defNow = fs.readFileSync(path.join(M, "map/definition.csv"), "utf8").split(/\r?\n/).map((l) => l.split(";"));
    ok(stroke.length >= 10 && page.sb.pendingWrites.length === 0 && stroke.every((id) => (defNow.find((c) => +c[0] === id) || [])[6] === "urban") && !/Save stopped/.test(lines),
      `THE CONTROL: the Save wrote all ${stroke.length} provinces urban and stopped nowhere`, { left: page.sb.pendingWrites.length, last: page.statuses.slice(-2) });
    ok(posted.filter((u) => u === "/api/map/set-province-terrains").length === 1 && posted.filter((u) => u === "/api/map/set-province-terrain").length === 0,
      "⭐⭐ the page sent the stroke as ONE request", { terrains: posted.filter((u) => u === "/api/map/set-province-terrains").length, single: posted.filter((u) => u === "/api/map/set-province-terrain").length });
    const towns = stroke.filter((id) => cityPxOf(M, id) > 0);
    ok(towns.length === stroke.length, "⭐⭐ …and every one of them got a town on map/terrain.bmp", { towns: towns.length, of: stroke.length });
    const mine = backups().filter((n) => !sentinel.includes(n));
    const of = (file) => mine.filter((n) => n.endsWith(file.replace(/[\\/:]/g, "__")));
    const kept = (file, want) => of(file).length === 1 && sha(path.join(BACKUP_DIR, of(file)[0])) === want;
    ok(kept("map/definition.csv", before.def) && kept("map/terrain.bmp", before.terrain) && kept(CM, before.cm),
      "⭐⭐⭐ ONE backup each of definition.csv, terrain.bmp and the colour map — each the file as it was before the Save", { def: of("map/definition.csv").length, terrain: of("map/terrain.bmp").length, cm: of(CM).length, all: mine.length });
    ok(sentinel.every((n) => backups().includes(n)), "⭐ …and the older map edit's backup is still there");
    // (the line shows three of a Save's own notes and counts the rest, as it always has: mapCrashGate)
    const last = String(page.statuses[page.statuses.length - 1] || "");
    ok(new RegExp(`Province ${stroke[0]} is urban now, so Nova painted a town of`).test(last) && new RegExp(`…and ${stroke.length - 3} more\\.`).test(last), "…and the Save line says what it painted, a note a province, as it did province by province", last.slice(0, 300));
    const fatalAfter = await fatal();
    ok(JSON.stringify(fatalAfter) === JSON.stringify(fatalBefore), "…and the Save added no problem Map Errors calls fatal (this small world's own are the same before and after)", { fatalBefore, fatalAfter });
  } catch (e) {
    ok(false, "R1 ran", String((e && e.stack) || e).slice(0, 600));
  } finally {
    if (server) await new Promise((r) => server.close(r));
    try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
    console.log(`\n${fail ? "FAILED" : "PASSED"} ${pass}/${pass + fail}`);
    process.exit(fail ? 1 : 0);
  }
})();
