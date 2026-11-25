// ⛔ #a-city-light-is-one-per-city — A CITY IS LIT, NOT A PATCH OF CITY GROUND.
//
// The night lights live in the colour map's alpha, and repaintWorldTextures lit new urban ground ONE core per 4-connected
// PATCH, capped at the base game's mean core (its urban texels over its urban provinces: 26 on vanilla). Neighbouring cities'
// cores touch, so on TEST 32 six megalopolis cities shared one 26-texel core: the patch's mean alpha was 49.6 against 204 for
// vanilla's largest city, and 8 of its 238 urban provinces peaked below 60 — the biggest cities were the dimmest. Two rules now:
//   · a city is a piece of new urban ground of ONE province (the colour most of a texel's four pixels carry), never a patch;
//   · its spawn_city ground — where hoi4.exe draws the city's meshes, and the ground the painter grows each city's core on — is
//     lit WHOLE, as the base game lights its own at every size; the cap stays for urban ground that is NOT spawn_city, which is
//     painted over a whole province.
//
// Pinned on two small games whose layer below lights its cities at exactly 173 (no spread, so a core is 173 to the bit) and
// nothing else, so every texel is 173 or 0 and the core size is derived from the layer below's own counts:
//   · S, whose urban ground is spawn_city (as on every installed map): A | A' | B, three cities touching (A and A' in one state,
//     B in another across an ODD pixel column, so the shared texels are mixed), D an isolated city twice the core, E three times;
//   · U, the same map whose urban ground is NOT spawn_city: A, A' and B each get their own whole core, D and E exactly one each;
//   · on the inherited path (a whole-map repair) and the owned, windowed one, windowed equal to whole-map byte for byte, and a
//     second repaint changes nothing.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-city-light-"));
// (on exit, so a test that throws part-way leaves no scratch behind either)
process.on("exit", () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ } });
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const dds = require("./dds-codec.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");
let nTmp = 0;
const tmp = (tag) => { const d = path.join(ROOT, `${tag}-${++nTmp}`); fs.mkdirSync(d, { recursive: true }); return d; };

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

// ── the world: 128 x 64 px, so every picture is 64 x 32 texels ────────────────────────────────────────────────────────────
//   below    x < 64 land (2, plains) with four cities 3..6 of 8 x 4 px each — the layer the lights are learnt from;
//            x >= 64 sea (1), in which the provinces the mod raises are sea too
//   mod      raises A (10), A' (11), B (12), D (13) and E (14) as cities:
//              A  x 72..77,  y 8..11   6 x 4 px                     ┐ one state
//              A' x 78..84,  y 8..11   7 x 4 px                     ┘
//              B  x 85..93,  y 8..11   9 x 4 px — another state, from an ODD column: texel 42 holds two pixels of A', two of B
//              D  x 104..111, y 8..15  8 x 8 px — isolated, twice the core
//              E  x 104..115, y 20..27 12 x 8 px — isolated, three times the core
const W = 128, H = 64, TW = W / 2, TH = H / 2;
const BELOW_CITY = [[8, 8], [24, 8], [8, 24], [24, 24]];   // the top-left pixel of each 8 x 4 city of 3..6
const NEW = { 10: [72, 78, 8, 12], 11: [78, 85, 8, 12], 12: [85, 94, 8, 12], 13: [104, 112, 8, 16], 14: [104, 116, 20, 28] };
const STATE_OF = { 10: 1, 11: 1, 12: 2, 13: 3, 14: 4 };
const inBox = (x, y, [x0, x1, y0, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1;
const provAt = (x, y) => {
  for (const [id, b] of Object.entries(NEW)) if (inBox(x, y, b)) return +id;
  if (x >= 64) return 1;
  for (let k = 0; k < 4; k++) { const [cx, cy] = BELOW_CITY[k]; if (x >= cx && x < cx + 8 && y >= cy && y < cy + 4) return 3 + k; }
  return 2;
};
const colour = (id) => [(id * 37) % 256, (id * 91) % 256, 40 + id];
const LAND = 0, OCEAN = 15, LIT = 173;
const URBAN_RGB = [120, 110, 100], LAND_RGB = [150, 120, 60], SEA_RGB = [79, 102, 141];
const belowLand = (p) => p >= 2 && p <= 6;

/** A game whose urban ground is index `city`, declared spawn_city (`spawn`) or not. */
function makeGame(tag, { city, spawn }) {
  const g = tmp(tag);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;false;plains;1`];
  for (let id = 3; id <= 6; id++) rows.push(`${id};${colour(id).join(";")};land;false;urban;1`);
  for (const id of Object.keys(NEW)) rows.push(`${id};${colour(+id).join(";")};sea;false;ocean;0`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return p >= 3 && p <= 6 ? city : belowLand(p) ? LAND : OCEAN; }));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (belowLand(provAt(x, y)) ? 106 : 89)));
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }",
    `  terrain_city = { type = urban color = { ${city} }${spawn ? " texture = 10 spawn_city = yes" : ""} }`, "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  const texel = (X, Y) => { const p = provAt(2 * X, 2 * Y); return { land: belowLand(p), city: p >= 3 && p <= 6 }; };
  write(g, "map/terrain/colormap_rgb_cityemissivemask_a.dds", makeDds(TW, TH, "RGB32", 1, (X, Y) => { const t = texel(X, Y); return t.city ? [...URBAN_RGB, LIT] : t.land ? [...LAND_RGB, 0] : [...SEA_RGB, 0]; }));
  for (const [n, s] of [["colormap_water_0.dds", 1], ["colormap_water_1.dds", 2], ["colormap_water_2.dds", 4]]) {
    write(g, "map/terrain/" + n, makeDds(TW / s, TH / s, "DXT5", 1, (X, Y) => (texel(X * s, Y * s).land ? [60, 70, 60, 255] : [35, 59, 81, 255])));
  }
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 6, (X, Y, l) => (texel(Math.min(TW - 1, X << l), Math.min(TH - 1, Y << l)).land ? [140, 140, 140, 21] : [90, 90, 90, 40])));
  write(g, "history/states/1-below.txt", `state={\n\tid=1\n\tname="STATE_1"\n\tmanpower=1000\n\tstate_category=city\n\tprovinces={ 2 3 4 5 6 }\n\thistory={\n\t\towner=AAA\n\t}\n}\n`);
  return g;
}
const NAMES = ["colormap_rgb_cityemissivemask_a.dds", "colormap_water_0.dds", "colormap_water_1.dds", "colormap_water_2.dds", "fow_rgb_waterspec_a.dds"];
/** The mod: A, A', B, D, E raised as cities on the game's city ground; `owned` — it holds copies of the five pictures. */
function makeMod(tag, game, city, owned) {
  const m = tmp(tag);
  write(m, "descriptor.mod", 'name="city lights"\n');
  const rows = fs.readFileSync(path.join(game, "map", "definition.csv"), "utf8").split("\n").map((l) => {
    const c = l.split(";"); return c.length >= 8 && NEW[c[0]] ? `${c[0]};${c[1]};${c[2]};${c[3]};land;false;urban;1` : l;
  });
  write(m, "map/definition.csv", rows.join("\n"));
  write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return NEW[p] ? city : p >= 3 && p <= 6 ? city : belowLand(p) ? LAND : OCEAN; }));
  write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return NEW[p] || belowLand(p) ? 106 : 89; }));
  for (const [s, ids] of Object.entries({ 1: [10, 11], 2: [12], 3: [13], 4: [14] })) {
    write(m, `history/states/${s}0-new.txt`, `state={\n\tid=${s}0\n\tname="STATE_${s}0"\n\tmanpower=1000\n\tstate_category=city\n\tprovinces={ ${ids.join(" ")} }\n\thistory={\n\t\towner=BBB\n\t}\n}\n`);
  }
  if (owned) for (const n of NAMES) write(m, "map/terrain/" + n, fs.readFileSync(path.join(game, "map", "terrain", n)));
  return m;
}
const crossedNew = () => { const mask = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (NEW[provAt(x, y)]) mask[y * W + x] = 1; return { W, H, mask }; };
const alphaOf = (m) => { const b = fs.readFileSync(path.join(m, "map", "terrain", NAMES[0])), h = dds.parseDdsHeader(b), rgba = dds.decodeDdsLevel(b, h, 0); return (i) => rgba[i * 4 + 3]; };
/** Each new city's texels — the texels whose four pixels mostly carry it (the earliest of a tie, as the writer reads them). */
const texelsOf = (id) => {
  const out = [];
  for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) {
    const a = provAt(2 * X, 2 * Y), b = provAt(2 * X + 1, 2 * Y), c = provAt(2 * X, 2 * Y + 1), d = provAt(2 * X + 1, 2 * Y + 1);
    if (md.textureMostOf4(a, b, c, d) === id) out.push(Y * TW + X);
  }
  return out;
};
const copyDir = (src) => { const d = tmp("copy"); fs.cpSync(src, d, { recursive: true }); return d; };
const hashTex = (m) => NAMES.map((n) => sha(fs.readFileSync(path.join(m, "map", "terrain", n))));

// the core size, derived from the layer below as the writer derives it: its city texels over its urban provinces
const CORE = (() => { let n = 0; for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) { const p = provAt(2 * X, 2 * Y); if (p >= 3 && p <= 6) n++; } return n / 4; })();
const T = Object.fromEntries(Object.keys(NEW).map((id) => [id, texelsOf(+id)]));
console.log("\n-- the fixture --");
{
  const mixed = T[11].filter((i) => i % TW === 42);
  ok(CORE === 8 && T[10].length <= CORE && T[11].length <= CORE && T[10].length + T[11].length > CORE && T[12].length <= CORE,
    `the core the layer below gives is ${CORE} texels; A (${T[10].length}) and A' (${T[11].length}) are each at most that and more together, B (${T[12].length}) at most`, Object.fromEntries(Object.entries(T).map(([k, v]) => [k, v.length])));
  ok(mixed.length === 2 && provAt(84, 8) === 11 && provAt(85, 8) === 12, "…A' and B meet on an odd pixel column: texel 42 holds two pixels of each, and is A''s", mixed);
  ok(T[13].length === 2 * CORE && T[14].length === 3 * CORE, `…D is twice the core (${T[13].length}), E three times (${T[14].length})`);
}

for (const [label, city, spawn] of [["S — city ground that is spawn_city (every installed map's)", 19, true], ["U — urban ground that is NOT spawn_city", 13, false]]) {
  const game = makeGame(spawn ? "game-s" : "game-u", { city, spawn });
  const G = (m) => ({ modRoot: m, gameRoot: game, dependencyRoots: [] });
  ok(md.spawnCityTerrainIndices(G(game)).has(city) === spawn, `${label}: the game's table says so`);
  for (const owned of [false, true]) {
    const way = owned ? "owned, windowed" : "inherited, whole map";
    console.log(`\n-- ⭐ ${label}: ${way} --`);
    const m = makeMod(spawn ? "mod-s" : "mod-u", game, city, owned);
    let r;
    if (owned) {
      const twin = copyDir(m);
      r = md.repaintWorldTextures({ ...G(m), crossed: crossedNew() });
      md.repaintWorldTextures({ ...G(twin), crossed: crossedNew(), _wholeMap: true });
      const differ = NAMES.filter((n, k) => hashTex(m)[k] !== hashTex(twin)[k]);
      ok(r.changed && r.inherited === false && !differ.length, `${way}: the windowed repaint is the whole-map one, byte for byte`, { r, differ });
      const snap = hashTex(m), again = md.repaintWorldTextures({ ...G(m), crossed: crossedNew() });
      ok(!again.changed && JSON.stringify(hashTex(m)) === JSON.stringify(snap), `${way}: a second repaint of the same write changes nothing`, again);
    } else {
      r = md.repaintWorldTextures(G(m));
      ok(r.changed && r.inherited === true, `${way}: the repair repainted the pictures the mod inherits`, r);
    }
    const a = alphaOf(m);
    const lit = (id) => T[id].filter((i) => a(i) === LIT).length, dark = (id) => T[id].filter((i) => a(i) === 0).length;
    const allLit = (id) => lit(id) === T[id].length;
    // every texel is the core's 173 or nothing: the layer below lights nothing round its cities
    const other = [10, 11, 12, 13, 14].flatMap((id) => T[id].filter((i) => a(i) !== LIT && a(i) !== 0));
    ok(!other.length, "(every new city texel is 173 or 0: the layer below's cities are 173 with no spread, and nothing round them is lit)", other.slice(0, 5).map((i) => [i, a(i)]));
    if (spawn) {
      ok(allLit(10) && allLit(11) && allLit(12), `⭐⭐ A, A' and B, three cities touching across two states, are every one of their ${T[10].length + T[11].length + T[12].length} texels lit — not one capped core between them`, { A: lit(10), A2: lit(11), B: lit(12) });
      ok(allLit(13) && allLit(14), `⭐⭐ D and E, cities twice and three times the core, are lit whole (${lit(13)} of ${T[13].length}, ${lit(14)} of ${T[14].length}): city ground is lit as the base game lights its own`, { D: lit(13), E: lit(14) });
    } else {
      ok(allLit(10) && allLit(11), `⭐⭐ A and A', two cities of one state touching, each carry their own core — all ${T[10].length + T[11].length} texels lit, not one core of ${CORE} between them`, { A: lit(10), A2: lit(11) });
      ok(allLit(12), "⭐ B, across the odd column in another state, carries its own", { B: lit(12) });
      ok(lit(13) === CORE && dark(13) === T[13].length - CORE && lit(14) === CORE && dark(14) === T[14].length - CORE,
        `⭐⭐ D and E, urban ground painted whole, each get ONE core of exactly ${CORE} texels — the cap is for ground that is not a city's`, { D: [lit(13), dark(13)], E: [lit(14), dark(14)] });
    }
  }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
