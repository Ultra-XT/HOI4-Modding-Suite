// ⛔ #the-biggest-city-shines-widest — THE GLOW ROUND A CITY IS THE ONE THE LAYER BELOW GIVES A CITY OF ITS SIZE.
//
// The night lights live in the colour map's alpha. The base game lights a city's own ground the same at every size (each
// urban province of vanilla carries 19–27 texels at 187–205, megalopolis and town alike), but the light round it is not the
// same: by the victory-point class of the nearest city, 83 one texel out round a 20+ city against 48–60 round the rest, and
// 4,718 round one 20+ city against 1,697 round a 2–4 one. repaintWorldTextures painted every city's ring with ONE pooled glow,
// so on TEST 32's flow a 20+ city's halo was 2,454 and a 2–4 one's 3,668. Now learnCityLights learns the glow per class
// (0–1 | 2–4 | 5–9 | 10–19 | 20+) from the layer below's own colour map over its own map, with the victory points of the states
// below, and each new city's ring takes its class's glow — the pooled one where the layer below has too few texels of that
// class to measure.
//
// Pinned on a small game whose layer below has two strips of city ground of VP 25 and two of VP 1, each ring painted by its
// own class's profile and the cities at exactly 173 (no spread), every bucket wide enough to measure and the 5–9 class absent,
// and a dark lake in a 20+ ring:
//   · the learn hands back those profiles to the bit — the lake's water not in them, for the paint lights only land by them —
//     and the pooled glow for the class it never saw; a texel as near a 20+ strip as a 0–1 one is the 20+ class's (a layer of
//     its own whose two strips' rings meet);
//   · a mod raising cities of VP 25, 1 and 7 lights each ring with its class's glow, the VP-7 one with the pooled glow, and where
//     a VP-25 city's ring meets a VP-1 one's the higher class keeps the tie, as the learn does — on the inherited path and the
//     owned, windowed one (windowed equal to whole-map, a second repaint changing nothing);
//   · ONLY WHERE THE LAYER BELOW SPEAKS FOR THIS MAP: a mod painting its own restyled colour map, and a mod whose dependency
//     ships the definition.csv the states below describe, come out byte for byte the same whatever the victory points below;
//   · the learn is kept apart from the pictures' own (#a-world-texture-learn-is-not-repeated): a second write on unchanged
//     files learns nothing again — it once sat in the pictures' 3-entry cache as a 4th, and every next write learnt all three
//     pictures again (1.15 s on vanilla).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-city-glow-"));
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

// ── the world: 256 x 160 px, so every picture is 128 x 80 texels; every border on an even pixel, so every texel is pure ──
//   below  texel x < 64 land: plains (2) with four strips of city ground, x 8..55 and two texels tall — 3 and 4 of VP 25,
//          5 and 6 of VP 1 — whose rings (8 texels round each) never meet, and a lake (7) of 4 x 2 in strip 3's ring, 3 and 4
//          texels out, that the base game leaves dark; x >= 64 sea (1)
//   mod    raises three cities of 4 x 4 texels in the sea, each in a plains province of 20 x 20 that holds its whole ring:
//          10 (VP 25) in 20, 11 (VP 1) in 21, 12 (VP 7 — a class the layer below has none of) in 22; and a PAIR in one plains
//          province 23 (x 106.., y 2..21): 13 (VP 25) at x 110..113 and 14 (VP 1) at x 119..122, y 10..13, whose rings meet on
//          column 116, three texels from each
const W = 256, H = 160, TW = W / 2, TH = H / 2, N = TW * TH;
const STRIPS = { 3: { y: 8, vp: 25 }, 4: { y: 28, vp: 25 }, 5: { y: 48, vp: 1 }, 6: { y: 68, vp: 1 } };
const NEW_CITY = { 10: { y: 2, vp: 25, block: 20 }, 11: { y: 30, vp: 1, block: 21 }, 12: { y: 58, vp: 7, block: 22 } };
const LAKE = 7, PAIR = { 13: { x: 110, vp: 25 }, 14: { x: 119, vp: 1 } }, PAIR_BLOCK = 23;
const provT = (X, Y) => {
  for (const [id, c] of Object.entries(NEW_CITY)) if (X >= 80 && X < 100 && Y >= c.y && Y < c.y + 20) return X >= 88 && X < 92 && Y >= c.y + 8 && Y < c.y + 12 ? +id : c.block;
  if (X >= 106 && Y >= 2 && Y < 22) { for (const [id, c] of Object.entries(PAIR)) if (X >= c.x && X < c.x + 4 && Y >= 10 && Y < 14) return +id; return PAIR_BLOCK; }
  if (X >= 64) return 1;
  if (X >= 30 && X < 34 && Y >= 12 && Y < 14) return LAKE;
  for (const [id, s] of Object.entries(STRIPS)) if (X >= 8 && X < 56 && (Y === s.y || Y === s.y + 1)) return +id;
  return 2;
};
const provAt = (x, y) => provT(x >> 1, y >> 1);
const colour = (id) => [(id * 37) % 256, (id * 91) % 256, 40 + id];
const LAND = 0, OCEAN = 15, CITY = 19, LIT = 173;
const URBAN_RGB = [120, 110, 100], LAND_RGB = [150, 120, 60], SEA_RGB = [79, 102, 141];
const belowLand = (p) => p >= 2 && p <= 6, isStrip = (p) => !!STRIPS[p], isNewCity = (p) => !!NEW_CITY[p] || !!PAIR[p];
const isNew = (p) => isNewCity(p) || p === PAIR_BLOCK || Object.values(NEW_CITY).some((c) => c.block === p);

// the class of a victory point, as the ladder the writer exports reads: the highest step at or under it
const classOf = (vp) => md.CITY_LIGHT_CLASSES.reduce((c, lo, k) => (vp >= lo ? k : c), 0);
const NC = md.CITY_LIGHT_CLASSES.length, MIN = md.WORLD_TEXTURE_BUCKET_MIN;
const C25 = classOf(25), C1 = classOf(1), C7 = classOf(7);
// each class's ring, d = 1..8 (index 0 unused): a 20+ city shines wide, a small one does not
const RING = { [C25]: [0, 80, 50, 37, 28, 18, 11, 8, 7], [C1]: [0, 48, 23, 17, 12, 7, 5, 4, 3] };

// ── a layer's alpha, painted by the learn's own rule: a land texel within 8 of city ground (uc: its class, else -1) is its
// nearest class's (the higher on a tie — `lowerWins` the other way, so a fixture can show it tells), at the rounded distance
// to that class; water stays dark ──
function ringsOver(W, H, cls, uc, lowerWins = false) {
  const N = W * H, dU = md.textureDistanceTo(W, H, (i) => uc[i] >= 0), dB = [];
  for (let c = 0; c < NC; c++) dB.push(md.textureDistanceTo(W, H, (i) => uc[i] === c));
  const alpha = new Uint8Array(N), n = Array.from({ length: NC }, () => new Array(9).fill(0)), sum = new Array(9).fill(0), cnt = new Array(9).fill(0);
  let ties = 0;
  for (let i = 0; i < N; i++) {
    if (uc[i] >= 0) { alpha[i] = LIT; continue; }
    if (cls[i] !== 1 || dU[i] > 8.5) continue;
    let c = -1, bd = Infinity; for (let k = NC - 1; k >= 0; k--) if (dB[k][i] < bd || (lowerWins && dB[k][i] === bd)) { bd = dB[k][i]; c = k; }
    const d = Math.round(bd); if (d > 8) continue;
    if (dB.filter((f) => f[i] === bd).length > 1) ties++;
    alpha[i] = RING[c][d]; n[c][d]++; sum[d] += RING[c][d]; cnt[d]++;
  }
  // the pooled glow, as learnWorldTextureColours learns it: every land texel by its rounded distance to any city ground
  const pooled = (d) => { const r = Math.round(d); return cnt[r] ? sum[r] / cnt[r] : 0; };
  return { alpha, n, pooled, ties };
}
const below = (() => {
  const uc = new Int8Array(N).fill(-1), cls = new Uint8Array(N), idx = new Uint8Array(N), prov = new Int32Array(N);
  for (let Y = 0; Y < TH; Y++) for (let X = 0; X < TW; X++) {
    const i = Y * TW + X, p = provT(X, Y), land = belowLand(p);
    prov[i] = isNew(p) ? 1 : p; cls[i] = land ? 1 : 2; idx[i] = isStrip(p) ? CITY : land ? LAND : OCEAN;
    if (isStrip(p)) uc[i] = classOf(STRIPS[p].vp);
  }
  return { cls, idx, prov, uc, ...ringsOver(TW, TH, cls, uc) };
})();

/** A game whose states put `vps` (province → VP) on the strips. `rgb` paints the colour map's colour (a restyle's own). */
function makeGame(tag, vps) {
  const g = tmp(tag);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;false;plains;1`];
  for (const id of Object.keys(STRIPS)) rows.push(`${id};${colour(+id).join(";")};land;false;urban;1`);
  for (const [id, c] of Object.entries(NEW_CITY)) for (const p of [+id, c.block]) rows.push(`${p};${colour(p).join(";")};sea;false;ocean;0`);
  for (const p of [...Object.keys(PAIR).map(Number), PAIR_BLOCK]) rows.push(`${p};${colour(p).join(";")};sea;false;ocean;0`);
  rows.push(`${LAKE};${colour(LAKE).join(";")};lake;false;lakes;0`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return isStrip(p) ? CITY : belowLand(p) ? LAND : OCEAN; }));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (belowLand(provAt(x, y)) ? 106 : 89)));
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }",
    `  terrain_city = { type = urban color = { ${CITY} } texture = 10 spawn_city = yes }`, "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  const at = (X, Y) => Y * TW + X;
  write(g, "map/terrain/colormap_rgb_cityemissivemask_a.dds", makeDds(TW, TH, "RGB32", 1, (X, Y) => {
    const i = at(X, Y), p = below.prov[i];
    return [...(isStrip(p) ? URBAN_RGB : belowLand(p) ? LAND_RGB : SEA_RGB), below.alpha[i]];
  }));
  for (const [n, s] of [["colormap_water_0.dds", 1], ["colormap_water_1.dds", 2], ["colormap_water_2.dds", 4]]) {
    write(g, "map/terrain/" + n, makeDds(TW / s, TH / s, "DXT5", 1, (X, Y) => (below.cls[at(X * s, Y * s)] === 1 ? [60, 70, 60, 255] : [35, 59, 81, 255])));
  }
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 6, (X, Y, l) => (below.cls[at(Math.min(TW - 1, X << l), Math.min(TH - 1, Y << l))] === 1 ? [140, 140, 140, 21] : [90, 90, 90, 40])));
  writeStatesBelow(g, vps);
  return g;
}
function writeStatesBelow(root, vps) {
  const vp = Object.entries(vps).map(([p, v]) => `\t\tvictory_points = { ${p} ${v} }\n`).join("");
  write(root, "history/states/1-below.txt", `state={\n\tid=1\n\tname="STATE_1"\n\tmanpower=1000\n\tstate_category=city\n\tprovinces={ 2 3 4 5 6 }\n\thistory={\n\t\towner=AAA\n${vp}\t}\n}\n`);
}
const VPS_AS_DRAWN = Object.fromEntries(Object.entries(STRIPS).map(([p, s]) => [p, s.vp]));
const VPS_ALL_SMALL = Object.fromEntries(Object.keys(STRIPS).map((p) => [p, 1]));
const NAMES = ["colormap_rgb_cityemissivemask_a.dds", "colormap_water_0.dds", "colormap_water_1.dds", "colormap_water_2.dds", "fow_rgb_waterspec_a.dds"];
/** The mod: the three cities raised. `owned` — it holds copies of the five pictures; `restyle` — its colour map is its own. */
function makeMod(tag, game, { owned = false, restyle = false } = {}) {
  const m = tmp(tag);
  write(m, "descriptor.mod", 'name="city glow"\n');
  const rows = fs.readFileSync(path.join(game, "map", "definition.csv"), "utf8").split("\n").map((l) => {
    const c = l.split(";"); const p = +c[0];
    return c.length >= 8 && isNew(p) ? `${c[0]};${c[1]};${c[2]};${c[3]};land;false;${isNewCity(p) ? "urban" : "plains"};1` : l;
  });
  write(m, "map/definition.csv", rows.join("\n"));
  write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return isNewCity(p) || isStrip(p) ? CITY : isNew(p) || belowLand(p) ? LAND : OCEAN; }));
  write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return isNew(p) || belowLand(p) ? 106 : 89; }));
  for (const [id, c] of Object.entries(NEW_CITY)) {
    write(m, `history/states/${id}-new.txt`, `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=city\n\tprovinces={ ${id} ${c.block} }\n\thistory={\n\t\towner=BBB\n\t\tvictory_points = { ${id} ${c.vp} }\n\t}\n}\n`);
  }
  for (const [id, c] of Object.entries(PAIR)) {
    write(m, `history/states/${id}-new.txt`, `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=city\n\tprovinces={ ${id}${id === Object.keys(PAIR)[0] ? " " + PAIR_BLOCK : ""} }\n\thistory={\n\t\towner=BBB\n\t\tvictory_points = { ${id} ${c.vp} }\n\t}\n}\n`);
  }
  if (owned) for (const n of NAMES) write(m, "map/terrain/" + n, fs.readFileSync(path.join(game, "map", "terrain", n)));
  // a restyle: the mod's own colours, drawn in another format (as Hearts of Minecraft's and Old World Blues' are) — the
  // layer below's lights, its own green land and dark sea
  if (restyle) write(m, "map/terrain/" + NAMES[0], makeDds(TW, TH, "DXT5", 1, (X, Y) => {
    const i = Y * TW + X, p = below.prov[i];
    return [...(isStrip(p) ? [90, 140, 90] : belowLand(p) ? [60, 160, 60] : [20, 40, 110]), below.alpha[i]];
  }));
  return m;
}
const crossedNew = () => { const mask = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isNew(provAt(x, y))) mask[y * W + x] = 1; return { W, H, mask }; };
const crossedOf = (ids) => { const mask = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ids.includes(provAt(x, y))) mask[y * W + x] = 1; return { W, H, mask }; };
const picture = (m) => { const b = fs.readFileSync(path.join(m, "map", "terrain", NAMES[0])), h = dds.parseDdsHeader(b); return dds.decodeDdsLevel(b, h, 0); };
const copyDir = (src) => { const d = tmp("copy"); fs.cpSync(src, d, { recursive: true }); return d; };
const hashTex = (m) => NAMES.map((n) => { const f = path.join(m, "map", "terrain", n); return fs.existsSync(f) ? sha(fs.readFileSync(f)) : null; });

// ── what each new city's ring must carry: its class's glow where the layer below has a bucket wide enough to measure, the
// pooled glow where it has not — at the distance the writer reads (≤ 8 lit, past it dark) ──
const cityTex = (id) => { const out = []; for (let i = 0; i < N; i++) if (provT(i % TW, (i / TW) | 0) === id) out.push(i); return out; };
const dNew = md.textureDistanceTo(TW, TH, (i) => isNewCity(provT(i % TW, (i / TW) | 0)));
const glowOf = (c, d) => { const r = Math.round(d); return below.n[c][r] >= MIN ? RING[c][r] : below.pooled(d); };
const ringOf = (id) => {
  const c = classOf(NEW_CITY[id].vp), out = [];
  for (let i = 0; i < N; i++) if (provT(i % TW, (i / TW) | 0) === NEW_CITY[id].block) out.push({ i, want: dNew[i] <= 8 ? Math.round(glowOf(c, dNew[i])) : 0 });
  return out;
};
// …and the pair's shared block: a texel takes its nearer city's class, the higher on a tie, at the distance to that city
const dPair = Object.keys(PAIR).map((id) => ({ c: classOf(PAIR[id].vp), d: md.textureDistanceTo(TW, TH, (i) => provT(i % TW, (i / TW) | 0) === +id) }));
const pairRing = () => {
  const out = [];
  for (let i = 0; i < N; i++) {
    if (provT(i % TW, (i / TW) | 0) !== PAIR_BLOCK) continue;
    let c = -1, bd = Infinity; for (const p of dPair) if (p.d[i] < bd || (p.d[i] === bd && p.c > c)) { bd = p.d[i]; c = p.c; }
    out.push({ i, tie: dPair.every((p) => p.d[i] === bd), want: bd <= 8 ? Math.round(glowOf(c, bd)) : 0 });
  }
  return out;
};

console.log("\n-- the fixture --");
{
  const thin = [];
  for (const c of [C25, C1]) for (let d = 1; d <= 8; d++) if (below.n[c][d] < MIN) thin.push([c, d, below.n[c][d]]);
  ok(C25 !== C1 && C7 !== C25 && C7 !== C1 && !thin.length, `the layer below has every ring of the VP-25 class (${C25}) and the VP-1 class (${C1}) at d = 1..8 at least ${MIN} texels wide`, thin);
  ok(below.n[C7].every((v) => v === 0), `…and none of the VP-7 class (${C7}): its city can only be lit with the pooled glow`);
  const apart = [1, 2, 3].every((d) => RING[C25][d] !== Math.round(below.pooled(d)) && RING[C1][d] !== Math.round(below.pooled(d)));
  ok(apart, "…and each class's first three rings differ from the pooled glow, so a ring tells which it was lit with",
    [1, 2, 3].map((d) => [RING[C25][d], RING[C1][d], +below.pooled(d).toFixed(2)]));
  const outside = [10, 11, 12].flatMap((id) => { const d = md.textureDistanceTo(TW, TH, (i) => provT(i % TW, (i / TW) | 0) === id); return cityTex(id).length && ringOf(id).some((r) => r.want > 0) ? [...d.keys()].filter((i) => d[i] > 0 && d[i] <= 8.5 && provT(i % TW, (i / TW) | 0) !== NEW_CITY[id].block).map((i) => [id, i]) : [[id, "no ring"]]; });
  ok(!outside.length, "…each new city's ring lies whole in its own raised province, away from the others'", outside.slice(0, 4));
  const dTwo = md.textureDistanceTo(TW, TH, (i) => !!PAIR[provT(i % TW, (i / TW) | 0)]);
  const strayPair = [...dTwo.keys()].filter((i) => { const p = provT(i % TW, (i / TW) | 0); return dTwo[i] > 0 && dTwo[i] <= 8.5 && (belowLand(p) || isNew(p)) && p !== PAIR_BLOCK && !PAIR[p]; });
  const ties = pairRing().filter((x) => x.tie && x.want > 0), tell = ties.filter((x) => { const d = dPair[0].d[x.i]; return Math.round(glowOf(C25, d)) !== Math.round(glowOf(C1, d)); });
  ok(!strayPair.length && ties.length > 0 && tell.length === ties.length && dPair.some((p) => p.c === C25) && dPair.some((p) => p.c === C1),
    `…the pair's rings lie whole in their own block and meet: ${ties.length} texels as near the VP-25 city as the VP-1 one, where the two classes' glow differs`, { stray: strayPair.slice(0, 4), ties: ties.length, tell: tell.length });
  const lake = []; for (let i = 0; i < N; i++) if (provT(i % TW, (i / TW) | 0) === LAKE) lake.push(i);
  const dS3 = md.textureDistanceTo(TW, TH, (i) => provT(i % TW, (i / TW) | 0) === 3);
  ok(lake.length > 0 && lake.every((i) => below.cls[i] === 2 && below.alpha[i] === 0 && RING[C25][Math.round(dS3[i])] > 0),
    `…and a lake of ${lake.length} texels lies dark in the 20+ ring, ${Math.min(...lake.map((i) => dS3[i]))}–${Math.max(...lake.map((i) => dS3[i]))} texels out: a learn that counted water would read that ring dimmer`);
}

console.log("\n-- ⭐ the learn: each class's glow from the layer below, to the bit --");
{
  const game = makeGame("game-learn", VPS_AS_DRAWN), b = fs.readFileSync(path.join(game, "map", "terrain", NAMES[0]));
  const L = md.learnCityLights({ layer: { W: TW, H: TH, N, cls: below.cls, idx: below.idx }, prov: below.prov,
    vpOf: new Map(Object.entries(VPS_AS_DRAWN).map(([p, v]) => [+p, v])), catOf: new Map([2, 3, 4, 5, 6].map((p) => [p, "city"])),
    colormap: dds.decodeDdsLevel(b, dds.parseDdsHeader(b), 0), urbanIdx: new Set([CITY]), glowAt: below.pooled });
  ok([25, 1, 7].every((v) => L.classOf(v) === classOf(v)), `the classes are the ladder's: VP 25 → ${C25}, VP 1 → ${C1}, VP 7 → ${C7}`);
  const off = [];
  for (const c of [C25, C1]) for (let d = 1; d <= 8; d++) if (L.glow[c][d].n !== below.n[c][d] || L.glow[c][d].mean !== RING[c][d] || L.glowOf(c, d) !== RING[c][d]) off.push([c, d, L.glow[c][d]]);
  ok(!off.length, "⭐⭐ the 20+ class's ring and the 0–1 class's come back exactly as the layer below paints them, texel counts and all", off.slice(0, 4));
  ok([1, 2, 3, 4, 5, 6, 7, 8].every((d) => L.glow[C7][d].n === 0 && L.glowOf(C7, d) === below.pooled(d)), "⭐ a class the layer below has no ring of is read as the pooled glow");
  ok(L.stars.asked === 0 && L.rateOf("city") === 0 && L.starCores.length === 0, "(no victory point without a town below: no star is asked, none is lit)", L.stars);
}

// a layer of its own whose two strips' rings meet: a VP-25 strip on row 4 and a VP-1 strip on row 14, so row 9 is five texels
// from each — the learn reads such a texel as the paint does, the higher class's
console.log("\n-- ⭐ the learn's tie: a texel as near a 20+ city as a 0–1 one is the 20+ class's --");
{
  const w = 40, h = 19, n = w * h, cls = new Uint8Array(n).fill(1), idx = new Uint8Array(n), prov = new Int32Array(n).fill(3), uc = new Int8Array(n).fill(-1);
  const strip = { 1: { y: 4, vp: 25 }, 2: { y: 14, vp: 1 } };
  for (const [p, s] of Object.entries(strip)) for (let x = 4; x < 36; x++) { const i = s.y * w + x; prov[i] = +p; idx[i] = CITY; uc[i] = classOf(s.vp); }
  const R = ringsOver(w, h, cls, uc), other = ringsOver(w, h, cls, uc, true);
  const img = new Uint8Array(n * 4); for (let i = 0; i < n; i++) img.set([...(uc[i] >= 0 ? URBAN_RGB : LAND_RGB), R.alpha[i]], i * 4);
  const L = md.learnCityLights({ layer: { W: w, H: h, N: n, cls, idx }, prov, vpOf: new Map(Object.entries(strip).map(([p, s]) => [+p, s.vp])),
    catOf: new Map([1, 2, 3].map((p) => [p, "city"])), colormap: img, urbanIdx: new Set([CITY]), glowAt: R.pooled });
  ok(R.ties > 0 && JSON.stringify(R.n) !== JSON.stringify(other.n), `(${R.ties} texels lie as near the VP-25 strip as the VP-1 one: read the other way, the tie fills other buckets)`);
  const off = [];
  for (const c of [C25, C1]) for (let d = 1; d <= 8; d++) if (L.glow[c][d].n !== R.n[c][d] || (R.n[c][d] && L.glow[c][d].mean !== RING[c][d])) off.push([c, d, L.glow[c][d], R.n[c][d]]);
  ok(!off.length, "⭐⭐ the learn reads every tie as the higher class's: each class's ring comes back with the texel counts and the glow the layer paints", off.slice(0, 4));
}

const game = makeGame("game", VPS_AS_DRAWN), gameSmall = makeGame("game-small", VPS_ALL_SMALL);
const G = (m, g = game, deps = []) => ({ modRoot: m, gameRoot: g, dependencyRoots: deps });
for (const owned of [false, true]) {
  const way = owned ? "owned, windowed" : "inherited, whole map";
  console.log(`\n-- ⭐ the new cities' rings: ${way} --`);
  const m = makeMod("mod", game, { owned });
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
  const img = picture(m), a = (i) => img[i * 4 + 3];
  ok([10, 11, 12].every((id) => cityTex(id).every((i) => a(i) === LIT)), "every new city's own ground is lit at the layer below's 173");
  const wrong = (id) => ringOf(id).filter((x) => a(x.i) !== x.want).map((x) => [x.i, a(x.i), x.want]);
  const d1 = (id) => ringOf(id).filter((x) => Math.round(dNew[x.i]) === 1 && dNew[x.i] <= 8).map((x) => a(x.i));
  ok(!wrong(10).length, `⭐⭐ the VP-25 city's ring is the 20+ class's glow (${RING[C25][1]} one texel out, ${RING[C25][2]} two), every texel of it`, { wrong: wrong(10).slice(0, 5), d1: d1(10).slice(0, 3) });
  ok(!wrong(11).length, `⭐⭐ the VP-1 city's ring is the 0–1 class's (${RING[C1][1]} one texel out, ${RING[C1][2]} two)`, { wrong: wrong(11).slice(0, 5), d1: d1(11).slice(0, 3) });
  ok(!wrong(12).length, `⭐ the VP-7 city, of a class the layer below never lit, has the pooled glow (${Math.round(below.pooled(1))} one texel out)`, { wrong: wrong(12).slice(0, 5), d1: d1(12).slice(0, 3) });
  const pr = pairRing(), wrongPair = pr.filter((x) => a(x.i) !== x.want);
  ok(Object.keys(PAIR).every((id) => cityTex(+id).every((i) => a(i) === LIT)) && !wrongPair.length,
    `⭐⭐ where the VP-25 city's ring meets the VP-1 city's, the ${pr.filter((x) => x.tie && x.want > 0).length} texels as near one as the other carry the 20+ class's glow, and every other its nearer city's class's`,
    wrongPair.slice(0, 5).map((x) => [x.i % TW, (x.i / TW) | 0, a(x.i), x.want, x.tie]));
}

console.log("\n-- the fixture can tell: the same mod over a layer below whose cities are all VP 1 --");
{
  const m = makeMod("mod-small", gameSmall, {});
  md.repaintWorldTextures(G(m, gameSmall));
  const img = picture(m), ring = ringOf(10).filter((x) => dNew[x.i] <= 8);
  ok(ring.every((x) => img[x.i * 4 + 3] === Math.round(below.pooled(dNew[x.i]))), "with no 20+ city below to learn it from, the VP-25 city's ring is the pooled glow — what the victory points below say is what lights it");
}

// ⚠️ ONLY WHERE THE LAYER BELOW SPEAKS FOR THIS MAP: each case is run over the two layers below (their cities VP 25 and 1, or
// all VP 1) and must come out the same, byte for byte — the victory points below are not this map's to light by
console.log("\n-- ⭐ a restyled colour map is lit by its own palette, not the layer below's classes --");
{
  const ma = makeMod("restyle-a", game, { owned: true, restyle: true }), mb = makeMod("restyle-b", gameSmall, { owned: true, restyle: true });
  md.repaintWorldTextures({ ...G(ma), crossed: crossedNew() });
  md.repaintWorldTextures({ ...G(mb, gameSmall), crossed: crossedNew() });
  const img = picture(ma), block = [];
  for (let i = 0; i < N; i++) if (provT(i % TW, (i / TW) | 0) === 20) block.push(i);
  const g = block.reduce((s, i) => s + img[i * 4 + 1], 0) / block.length, rd = block.reduce((s, i) => s + img[i * 4], 0) / block.length;
  ok(g > rd + 40, `(the new land is painted in the restyle's own green — mean R ${rd.toFixed(0)}, G ${g.toFixed(0)}: its own palette paints this map)`);
  ok(sha(fs.readFileSync(path.join(ma, "map", "terrain", NAMES[0]))) === sha(fs.readFileSync(path.join(mb, "map", "terrain", NAMES[0]))),
    "⭐⭐ its colour map comes out the same over either layer below: the classes learnt below are not its lights");
}
console.log("\n-- ⭐ a dependency's own definition.csv: the states below describe ITS map, not the one the colours were learnt over --");
{
  const out = [];
  for (const vps of [VPS_AS_DRAWN, VPS_ALL_SMALL]) {
    const dep = tmp("dep");
    write(dep, "descriptor.mod", 'name="a map of its own"\n');
    write(dep, "map/definition.csv", fs.readFileSync(path.join(game, "map", "definition.csv")));
    writeStatesBelow(dep, vps);
    const m = makeMod("mod-dep", game, {});
    const r = md.repaintWorldTextures(G(m, game, [dep]));
    out.push({ r, h: fs.existsSync(path.join(m, "map", "terrain", NAMES[0])) ? sha(fs.readFileSync(path.join(m, "map", "terrain", NAMES[0]))) : null });
  }
  ok(out.every((o) => o.r.changed && o.h), "(both repaints ran)", out.map((o) => o.r));
  ok(out[0].h === out[1].h, "⭐⭐ the colour map comes out the same whatever the victory points that dependency's states give");
}

console.log("\n-- ⭐ #a-world-texture-learn-is-not-repeated: a second write on unchanged files learns nothing again --");
{
  const g2 = makeGame("game-cache", VPS_AS_DRAWN), m = makeMod("mod-cache", g2, { owned: true });
  const c0 = { ...md.worldTextureLearnCounters };
  const r1 = md.repaintWorldTextures({ ...G(m, g2), crossed: crossedOf([10, 20]) });
  const c1 = { ...md.worldTextureLearnCounters };
  const r2 = md.repaintWorldTextures({ ...G(m, g2), crossed: crossedOf([11, 21]) });
  const c2 = { ...md.worldTextureLearnCounters };
  const img = picture(m), d1 = ringOf(10).filter((x) => dNew[x.i] <= 8);
  ok(r1.changed && r2.changed && d1.every((x) => img[x.i * 4 + 3] === x.want), "(two writes, each raising a city, the first city's ring its class's glow)", { r1, r2 });
  ok(c1.pictures - c0.pictures === 3 && c1.lights - c0.lights === 1, `the first write learns the three pictures below and their lights once (${c1.pictures - c0.pictures}, ${c1.lights - c0.lights})`, { c0, c1 });
  ok(c2.pictures === c1.pictures && c2.lights === c1.lights, `⭐⭐ the second learns nothing again (pictures +${c2.pictures - c1.pictures}, lights +${c2.lights - c1.lights})`, { c1, c2 });
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
