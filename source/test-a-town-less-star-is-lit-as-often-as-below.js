// ⛔ #a-town-less-star-is-lit-as-often-as-below — A VICTORY POINT WITH NO TOWN IS LIT AS OFTEN AS THE LAYER BELOW LIGHTS ONE.
//
// The night lights live in the colour map's alpha, and repaintWorldTextures lit nothing farther than 8 texels from a new
// city: TEST 31 and TEST 32 had no light at all more than 16 texels from city ground, where vanilla has 6,702 texels of it —
// and 96% of its light past 8 texels lies in blobs at victory points that have no town. How many of those light their own
// province depends on the state: wasteland 2.9%, pastoral 3.0%, rural 10.2%, town 13.5%, large_town 24.2%, city 23.5%; and it
// is a rate per map (Old World Blues 1.1%, Hearts of Minecraft 1.6%, Millennium Dawn 38.1%), so it is LEARNT (learnCityLights)
// and never typed in:
//   · a STAR is a land province with a victory point; it is TOWN-LESS when none of its ground is a city's, ASKED when the
//     texel nearest its middle lies more than 8 texels from city ground, and LIT when its OWN land holds a texel more than 8
//     from city ground brighter than the first ring of a city's glow — its core those texels. Not the lit blob round it
//     (review of 6cc15295): a blob below spans many provinces, and its share painted into one province lit 17 of TEST 32's 83
//     villages wider than its biggest city;
//   · a category is read by its own rate where 30 of its stars were asked, by the layer's pooled rate where fewer were, and a
//     layer that asked fewer than 30 in all lights none — an unknown is not a licence to paint;
//   · the writer lights a star whose whole land this write repainted, with no city ground of its own and its middle out of
//     EVERY city's glow — the ones the write kept as well as its new ones — when its id's hash falls under its state's rate: a
//     core of a size the layer below lights, drawn by another hash, grown from its middle through its own land and out of
//     every city's glow. No glow round it: the base game's far light has a dim fringe; that is not drawn (a cosmetic gap).
//
// Pinned on a small game whose layer below has one city and one town, lit at exactly 173 with a glow round them, and 65
// asked stars: 30 rural (10 lit, two of them each holding half of one blob, and 3 with a blob too dim to count), 30 pastoral
// (1 lit, and 1 dark whose only bright texels lie 8 from the city) and 5 enclave (3 lit, one of them with a blob that spills
// as much again into the plains below it, and 1 dark whose own land is dim beside a bright patch of those plains) — plus a
// star in the city's glow and a star that holds a town, neither of which counts. Over it a mod raises 160 stars of four
// categories round one city; every rate, pick and size is derived from the fixture's own counts with the hash the writer
// exports. A mod raising stars beside the layer below's town, and a province holding a town of its own, are lit by every
// city's glow. A layer below with 3 asked stars lights none; and a write that can light no star and makes no city (an erase,
// new land with no victory point) does not learn the lights at all.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-town-less-star-"));
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
//   below (texel y < 40) land: plains (2), the city 3 (x 1..4, y 1..4, VP 10), and slots of 6 x 6 texels, 21 a row, 6 rows:
//          slot (1,0) the star 4 in the city's glow; slots (16..20,5) the star 5, 30 texels long, a town of 2 x 2 at its east
//          end (VP 3) and its middle 13 texels from it; the slots round the city and the town plains; the rest in order the
//          65 asked stars 10.., each lit (a blob of 200 at its middle), dim (a blob of 30) or dark — or one of three that tell
//          a star's own light from the blob round it: "edge" (its only 200s on its top row, 8 from the city), "spill" (its
//          blob of 9 runs 9 more into the plains of the slot below), "rim" (its own 9 at 30, 9 of 200 in the plains below)
//   mod   (texel y >= 40, sea below) slots of 5 x 5, 25 a row, 8 rows: the city 300 (VP 5) in slot (12,3), and in order 160
//          stars 100.., 40 each of rural, pastoral, enclave and wasteland (a category the layer below has none of); the
//          first rural star of row 0 that its hash would light also takes the two texel rows of plains above it, land
//          already, so this write repaints only part of it
const W = 256, H = 160, TW = W / 2, TH = H / 2, N = TW * TH;
const LAND = 0, OCEAN = 15, CITY = 19, LIT = 173, HOT = 200, DIM = 30;
const GLOW = [0, 60, 30, 20, 15, 10, 8, 6, 5];   // round a city, by distance; the first ring is what "brighter" is measured by
const URBAN_RGB = [120, 110, 100], LAND_RGB = [150, 120, 60], SEA_RGB = [79, 102, 141];
const colour = (id) => [id & 255, 17 + (id >> 8) * 64, (id * 53 + 40) % 256];   // (one colour an id, to 1,023)
const S = 6, SCOLS = 21, SROWS = 6;
const CITY_BOX = [1, 5, 1, 5], TOWN_STAR = { id: 5, box: [96, 126, 30, 36], town: [124, 126, 32, 34], vp: 3, cat: "rural" };
const GLOW_STAR = { id: 4, slot: [1, 0], vp: 1, cat: "rural" };
const RESERVED = new Set(["0,0", "1,0", "0,1", "1,1", "16,5", "17,5", "18,5", "19,5", "20,5", "18,4", "19,4", "20,4"]);
const inBox = (X, Y, [x0, x1, y0, y1]) => X >= x0 && X < x1 && Y >= y0 && Y < y1;
/** The asked stars of a layer below, in slot order: [category, blob] — blob "hot9" | "hot4" | "dim" | "dark" | "pair" (the
 *  first of two neighbours whose one blob of 18 spans both, 9 in each) | "pair2" | "edge" | "spill" | "rim". The edge star is
 *  the one in slot (0,2), the spill and rim stars the last two of row 3, above plains. */
const ASKED_FULL = [
  ["rural", "pair"], ["rural", "pair2"], ...Array(4).fill(["rural", "hot9"]), ...Array(4).fill(["rural", "hot4"]), ...Array(3).fill(["rural", "dim"]), ...Array(17).fill(["rural", "dark"]),
  ["pastoral", "hot9"], ...Array(7).fill(["pastoral", "dark"]), ["pastoral", "edge"], ...Array(21).fill(["pastoral", "dark"]),
  ["enclave", "hot4"], ["enclave", "hot9"], ["enclave", "dark"], ["enclave", "spill"], ["enclave", "rim"],
];
const ASKED_FEW = [["rural", "hot9"], ["rural", "dark"], ["rural", "dark"]];
// what each lit star's core is, as the fixture means it: the bright texels in its OWN province (the pair's blob of 18 is 9 in
// each; the spill star's blob is 18, of which 9 are its own) — a blob not listed is dark
const SIZE = { hot9: 9, hot4: 4, pair: 9, pair2: 9, spill: 9 };

function belowLayout(asked) {
  const slots = [];
  for (let sy = 0; sy < SROWS; sy++) for (let sx = 0; sx < SCOLS; sx++) if (!RESERVED.has(`${sx},${sy}`)) slots.push([sx, sy]);
  const stars = asked.map(([cat, blob], k) => ({ id: 10 + k, cat, blob, slot: slots[k], vp: 1 }));
  const slotOf = new Map(stars.map((s) => [s.slot.join(","), s]));
  const provT = (X, Y) => {
    if (Y >= 40) return 1;
    if (inBox(X, Y, CITY_BOX)) return 3;
    if (inBox(X, Y, TOWN_STAR.box)) return TOWN_STAR.id;
    const sx = Math.floor(X / S), sy = Math.floor(Y / S);
    if (sx >= SCOLS || sy >= SROWS) return 2;
    if (sx === GLOW_STAR.slot[0] && sy === GLOW_STAR.slot[1]) return GLOW_STAR.id;
    const s = slotOf.get(`${sx},${sy}`);
    return s ? s.id : 2;
  };
  const isUrban = (X, Y) => inBox(X, Y, CITY_BOX) || inBox(X, Y, TOWN_STAR.town);
  const urban = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (isUrban(i % TW, (i / TW) | 0)) urban[i] = 1;
  const dU = md.textureDistanceTo(TW, TH, (i) => urban[i] === 1);
  // the alpha: the cities at 173, their glow within 8, each star's blob round its middle, nothing else
  const alpha = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const Y = (i / TW) | 0; if (Y >= 40) continue; if (urban[i]) alpha[i] = LIT; else if (dU[i] <= 8) alpha[i] = GLOW[Math.round(dU[i])]; }
  const paint = (x0, x1, y0, y1, a) => { for (let Y = y0; Y < y1; Y++) for (let X = x0; X < x1; X++) alpha[Y * TW + X] = a; };
  for (const s of stars) {
    const X0 = s.slot[0] * S, Y0 = s.slot[1] * S;
    if (s.blob === "hot9") paint(X0 + 1, X0 + 4, Y0 + 1, Y0 + 4, HOT);
    else if (s.blob === "hot4") paint(X0 + 2, X0 + 4, Y0 + 2, Y0 + 4, HOT);
    else if (s.blob === "dim") paint(X0 + 1, X0 + 4, Y0 + 1, Y0 + 4, DIM);
    else if (s.blob === "pair") paint(X0 + 3, X0 + 9, Y0 + 1, Y0 + 4, HOT);
    else if (s.blob === "edge") paint(X0 + 1, X0 + 5, Y0, Y0 + 1, HOT);   // (slot (0,2): x 1..4 of its top row are 8 from the city)
    else if (s.blob === "spill") paint(X0 + 1, X0 + 4, Y0 + 3, Y0 + 9, HOT);
    else if (s.blob === "rim") { paint(X0 + 1, X0 + 4, Y0 + 3, Y0 + 6, DIM); paint(X0 + 1, X0 + 4, Y0 + 6, Y0 + 9, HOT); }
  }
  return { stars, provT, urban, dU, alpha, size: SIZE };
}

function makeGame(tag, asked) {
  const g = tmp(tag), L = belowLayout(asked);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(L.provT(x >> 1, y >> 1))));
  const rows = ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`, `2;${colour(2).join(";")};land;false;plains;1`,
    `3;${colour(3).join(";")};land;false;urban;1`, `4;${colour(4).join(";")};land;false;plains;1`, `5;${colour(5).join(";")};land;false;plains;1`];
  for (const s of L.stars) rows.push(`${s.id};${colour(s.id).join(";")};land;false;plains;1`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => (L.urban[(y >> 1) * TW + (x >> 1)] ? CITY : y >> 1 < 40 ? LAND : OCEAN)));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (y >> 1 < 40 ? 106 : 89)));
  write(g, "common/terrain/00_terrain.txt", [
    "categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }",
    `  terrain_city = { type = urban color = { ${CITY} } texture = 10 spawn_city = yes }`, "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  const landT = (X, Y) => Y < 40;
  write(g, "map/terrain/colormap_rgb_cityemissivemask_a.dds", makeDds(TW, TH, "RGB32", 1, (X, Y) => [...(L.urban[Y * TW + X] ? URBAN_RGB : landT(X, Y) ? LAND_RGB : SEA_RGB), L.alpha[Y * TW + X]]));
  for (const [n, s] of [["colormap_water_0.dds", 1], ["colormap_water_1.dds", 2], ["colormap_water_2.dds", 4]]) {
    write(g, "map/terrain/" + n, makeDds(TW / s, TH / s, "DXT5", 1, (X, Y) => (landT(X * s, Y * s) ? [60, 70, 60, 255] : [35, 59, 81, 255])));
  }
  write(g, "map/terrain/fow_rgb_waterspec_a.dds", makeDds(TW, TH, "DXT5", 6, (X, Y, l) => (landT(Math.min(TW - 1, X << l), Math.min(TH - 1, Y << l)) ? [140, 140, 140, 21] : [90, 90, 90, 40])));
  // one state a category: the city's, and each of the stars' (the star in the glow and the town's are rural)
  const st = (id, cat, provs, vps) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=${cat}\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=AAA\n${vps.map(([p, v]) => `\t\tvictory_points = { ${p} ${v} }\n`).join("")}\t}\n}\n`;
  write(g, "history/states/1-city.txt", st(1, "city", [2, 3], [[3, 10]]));
  const cats = [...new Set(["rural", ...L.stars.map((s) => s.cat)])];
  cats.forEach((cat, k) => {
    const mine = L.stars.filter((s) => s.cat === cat), extra = cat === "rural" ? [GLOW_STAR, TOWN_STAR] : [];
    write(g, `history/states/${k + 2}-${cat}.txt`, st(k + 2, cat, [...extra, ...mine].map((s) => s.id), [...extra, ...mine].map((s) => [s.id, s.vp])));
  });
  return { g, L };
}

// ── the mod ──
const MS = 5, MCOLS = 25, MROWS = 8, MY0 = 40, CITY_SLOT = [12, 3], MOD_CITY = 300, MOD_CITY_VP = 5;
const MOD_CATS = ["rural", "pastoral", "enclave", "wasteland"], PER_CAT = 40;
const modStars = (() => {
  const out = [];
  for (let sy = 0; sy < MROWS; sy++) for (let sx = 0; sx < MCOLS; sx++) {
    if (sx === CITY_SLOT[0] && sy === CITY_SLOT[1]) continue;
    if (out.length === MOD_CATS.length * PER_CAT) break;
    const k = out.length;
    out.push({ id: 100 + k, cat: MOD_CATS[Math.floor(k / PER_CAT)], X0: sx * MS, Y0: MY0 + sy * MS, row: sy });
  }
  return out;
})();
// the rates the layer below should teach, from the fixture's own counts: a category its own where CITY_LIGHT_STARS_MIN of it
// were asked, else the pooled one; none at all where fewer than that were asked in all
function ratesOf(asked) {
  const by = {}; let n = 0, lit = 0;
  for (const [cat, blob] of asked) { const e = by[cat] || (by[cat] = { asked: 0, lit: 0 }); e.asked++; n++; if (SIZE[blob]) { e.lit++; lit++; } }
  const MIN = md.CITY_LIGHT_STARS_MIN;
  return { by, asked: n, lit, rateOf: (cat) => (n < MIN ? 0 : by[cat] && by[cat].asked >= MIN ? by[cat].lit / by[cat].asked : lit / n) };
}
const FULL = ratesOf(ASKED_FULL), FEW = ratesOf(ASKED_FEW);
const coresOf = (asked) => { const L = belowLayout(asked); return L.stars.filter((s) => L.size[s.blob]).map((s) => L.size[s.blob]).sort((a, b) => a - b); };
const CORES = coresOf(ASKED_FULL);
const picked = (s, rateOf) => md.textureNoiseHash(s.id, 0, 401) < rateOf(s.cat);
// the first rural star of the mod's top row its hash lights: it also takes the two plains rows above it (west of the town,
// whose glow reaches those rows from x 116)
const PART = modStars.find((s) => s.row === 0 && s.cat === "rural" && s.X0 + MS < 100 && picked(s, FULL.rateOf));
const modProvT = (X, Y) => {
  if (Y >= MY0) {
    const sx = Math.floor(X / MS), sy = Math.floor((Y - MY0) / MS);
    if (sx === CITY_SLOT[0] && sy === CITY_SLOT[1]) return MOD_CITY;
    const s = modStars.find((m) => m.X0 === sx * MS && m.Y0 === MY0 + sy * MS);
    return s ? s.id : 1;
  }
  if (PART && Y >= MY0 - 2 && X >= PART.X0 && X < PART.X0 + MS) return PART.id;
  return null;   // the layer below's
};

function makeMod(tag, game, L, owned) {
  const m = tmp(tag);
  write(m, "descriptor.mod", 'name="stars"\n');
  const at = (X, Y) => { const p = modProvT(X, Y); return p == null ? L.provT(X, Y) : p; };
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(at(x >> 1, y >> 1))));
  const rows = fs.readFileSync(path.join(game, "map", "definition.csv"), "utf8").trim().split("\n");
  rows.push(`${MOD_CITY};${colour(MOD_CITY).join(";")};land;false;urban;1`);
  for (const s of modStars) rows.push(`${s.id};${colour(s.id).join(";")};land;false;plains;1`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = at(x >> 1, y >> 1); return p === MOD_CITY || L.urban[(y >> 1) * TW + (x >> 1)] ? CITY : p === 1 ? OCEAN : LAND; }));
  write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => (at(x >> 1, y >> 1) === 1 ? 89 : 106)));
  const st = (id, cat, provs) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=${cat}\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=BBB\n${provs.map((p) => `\t\tvictory_points = { ${p} ${p === MOD_CITY ? MOD_CITY_VP : 1} }\n`).join("")}\t}\n}\n`;
  write(m, "history/states/90-city.txt", st(90, "city", [MOD_CITY]));
  MOD_CATS.forEach((cat, k) => write(m, `history/states/${91 + k}-${cat}.txt`, st(91 + k, cat, modStars.filter((s) => s.cat === cat).map((s) => s.id))));
  if (owned) for (const n of NAMES) write(m, "map/terrain/" + n, fs.readFileSync(path.join(game, "map", "terrain", n)));
  return m;
}
const NAMES = ["colormap_rgb_cityemissivemask_a.dds", "colormap_water_0.dds", "colormap_water_1.dds", "colormap_water_2.dds", "fow_rgb_waterspec_a.dds"];
// what this write moved across the waterline: the mod's land that is sea below (not the part-star's two rows: land already)
const crossedNew = () => { const mask = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const p = modProvT(x >> 1, y >> 1); if (p != null && p !== 1 && (y >> 1) >= MY0) mask[y * W + x] = 1; } return { W, H, mask }; };
const picture = (m) => { const b = fs.readFileSync(path.join(m, "map", "terrain", NAMES[0])), h = dds.parseDdsHeader(b); return dds.decodeDdsLevel(b, h, 0); };
const copyDir = (src) => { const d = tmp("copy"); fs.cpSync(src, d, { recursive: true }); return d; };
const hashTex = (m) => NAMES.map((n) => sha(fs.readFileSync(path.join(m, "map", "terrain", n))));
/** A state of the mod's: its provinces, each with a victory point of 1. */
const modState = (id, cat, provs) => `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=${cat}\n\tprovinces={ ${provs.join(" ")} }\n\thistory={\n\t\towner=BBB\n${provs.map((p) => `\t\tvictory_points = { ${p} 1 }\n`).join("")}\t}\n}\n`;
/** A mod over `game` whose provinces are at(X, Y) where it says (null: the layer below's), `ids` its new provinces, `states`
 *  their states (one file each), `town` the texels it paints city ground, `owned` — it holds copies of the five pictures. */
function editMod(tag, game, Lg, at, ids, states, { town = () => false, owned = false } = {}) {
  const m = tmp(tag), pv = (X, Y) => { const p = at(X, Y); return p == null ? Lg.provT(X, Y) : p; };
  write(m, "descriptor.mod", 'name="no star"\n');
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(pv(x >> 1, y >> 1))));
  write(m, "map/definition.csv", fs.readFileSync(path.join(game, "map", "definition.csv"), "utf8").trim() + "\n" + ids.map((id) => `${id};${colour(id).join(";")};land;false;plains;1\n`).join(""));
  write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (Lg.urban[(y >> 1) * TW + (x >> 1)] || town(x >> 1, y >> 1) ? CITY : pv(x >> 1, y >> 1) === 1 ? OCEAN : LAND)));
  write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => (pv(x >> 1, y >> 1) === 1 ? 89 : 106)));
  states.forEach((s, k) => write(m, `history/states/${99 - k}-new.txt`, s));
  if (owned) for (const n of NAMES) write(m, "map/terrain/" + n, fs.readFileSync(path.join(game, "map", "terrain", n)));
  return m;
}

// each mod star: its texels, its middle (a 5 x 5 slot's own middle), and how far that is from the new city
const dCity = md.textureDistanceTo(TW, TH, (i) => modProvT(i % TW, (i / TW) | 0) === MOD_CITY);
const texOf = (id) => { const out = []; for (let i = 0; i < N; i++) if (modProvT(i % TW, (i / TW) | 0) === id) out.push(i); return out; };
const middleOf = (s) => (s.Y0 + 2) * TW + s.X0 + 2;
/** What the writer should light over `asked` below: per star, lit or not, and the core size its second hash draws. */
const expectOver = (R, cores) => modStars.map((s) => {
  const lit = picked(s, R.rateOf) && dCity[middleOf(s)] > 8 && s !== PART && cores.length > 0;
  return { s, lit, k: lit ? cores[Math.floor(md.textureNoiseHash(s.id, 1, 401) * cores.length)] : 0 };
});
/** The lit texels of each star past the city's glow, in the rows this write raised, and whether each is the one 4-connected piece holding its middle. */
function starsIn(img, s) {
  const lit = texOf(s.id).filter((i) => i >= MY0 * TW && dCity[i] > 8 && img[i * 4 + 3] > 0), set = new Set(lit);
  const seen = new Set([middleOf(s)]), q = [middleOf(s)];
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % TW; for (const j of [x > 0 ? i - 1 : -1, x < TW - 1 ? i + 1 : -1, i - TW, i + TW]) if (set.has(j) && !seen.has(j)) { seen.add(j); q.push(j); } }
  return { n: lit.length, at: lit.every((i) => img[i * 4 + 3] === LIT), whole: set.has(middleOf(s)) && seen.size === lit.length };
}

console.log("\n-- the fixture --");
const { g: game, L } = makeGame("game", ASKED_FULL);
{
  const anchorD = (s) => { const list = []; for (let i = 0; i < N; i++) if (L.provT(i % TW, (i / TW) | 0) === s.id) list.push(i); return L.dU[md.textureNearestCentroid(list, TW)]; };
  const near = L.stars.filter((s) => !(anchorD(s) > 8));
  ok(L.stars.length === ASKED_FULL.length && !near.length, `the ${L.stars.length} stars of the layer below have their middle more than 8 texels from city ground: every one is asked`, near.map((s) => s.id));
  ok(!(anchorD(GLOW_STAR) > 8) && anchorD(TOWN_STAR) > 8, `…the star by the city has its middle ${anchorD(GLOW_STAR).toFixed(1)} from it (not asked); the town's star has its middle ${anchorD(TOWN_STAR).toFixed(1)} from its town — only holding a town keeps it out`);
  const lits = L.stars.filter((s) => L.size[s.blob]);
  ok(lits.every((s) => { const X0 = s.slot[0] * S, Y0 = s.slot[1] * S; return L.dU[(Y0 + 1) * TW + X0 + 1] > 8; }), `…every star's blob lies out of every city's glow (${lits.length} lit, ${L.stars.filter((s) => s.blob === "dim").length} dim)`);
  // what a star's OWN land holds past the glow brighter than the first ring, and what the blob round its brightest far texel
  // holds (8-connected far lit land, whoever's province) — the two readings the spill, rim and edge stars tell apart
  let s1 = 0, n1 = 0; for (let i = 0; i < N; i++) if ((i / TW | 0) < 40 && !L.urban[i] && Math.round(L.dU[i]) === 1) { s1 += L.alpha[i]; n1++; }
  const g1 = s1 / n1, far = (i) => (i / TW | 0) < 40 && L.dU[i] > 8 && L.alpha[i] > 0;
  const own = (s) => { const t = []; for (let i = 0; i < N; i++) if (L.provT(i % TW, (i / TW) | 0) === s.id) t.push(i); return t; };
  const blobHot = (s) => {
    let pk = -1; for (const i of own(s)) if (far(i) && (pk < 0 || L.alpha[i] > L.alpha[pk])) pk = i;
    if (pk < 0) return 0;
    const seen = new Set([pk]), q = [pk];
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % TW, y = (i - x) / TW; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy, j = yy * TW + xx; if (xx < 0 || xx >= TW || yy < 0 || yy >= TH || seen.has(j) || !far(j)) continue; seen.add(j); q.push(j); } }
    return q.filter((i) => L.alpha[i] > g1).length;
  };
  const off = L.stars.filter((s) => own(s).filter((i) => L.dU[i] > 8 && L.alpha[i] > g1).length !== (SIZE[s.blob] || 0));
  ok(!off.length, `…each star's own land holds as many texels brighter than the first ring (${g1}) past the glow as its core means`, off.map((s) => [s.id, s.blob]));
  const one = (b) => L.stars.find((s) => s.blob === b);
  const edgeHot = own(one("edge")).filter((i) => L.alpha[i] > g1);
  ok(blobHot(one("spill")) === 2 * SIZE.spill && blobHot(one("rim")) > 0 && edgeHot.length > 0 && edgeHot.every((i) => !(L.dU[i] > 8)),
    `…and the fixture can tell: the spill star's blob holds ${blobHot(one("spill"))} bright texels, the rim star's ${blobHot(one("rim"))}, and the edge star's ${edgeHot.length} bright texels all lie in the city's glow`);
  ok(FULL.by.rural.asked >= md.CITY_LIGHT_STARS_MIN && FULL.by.pastoral.asked >= md.CITY_LIGHT_STARS_MIN && FULL.by.enclave.asked < md.CITY_LIGHT_STARS_MIN && FEW.asked < md.CITY_LIGHT_STARS_MIN,
    `…rural and pastoral each have ${md.CITY_LIGHT_STARS_MIN} asked, enclave fewer, and the second layer below fewer than that in all`, { full: FULL.by, few: FEW.asked });
  const differ = modStars.filter((s) => picked(s, FULL.rateOf) !== (md.textureNoiseHash(s.id, 0, 401) < FULL.lit / FULL.asked));
  const thin = modStars.filter((s) => s.cat === "enclave" && picked(s, FULL.rateOf) !== (md.textureNoiseHash(s.id, 0, 401) < FULL.by.enclave.lit / FULL.by.enclave.asked));
  ok(differ.length > 0 && thin.length > 0, `…the mod's picks by category differ from the pooled rate's on ${differ.length} stars, and the enclave's from its own thin rate's on ${thin.length}`);
  const want = expectOver(FULL, CORES);
  const nearPicked = modStars.filter((s) => picked(s, FULL.rateOf) && !(dCity[middleOf(s)] > 8));
  ok(want.filter((w) => w.lit).length >= 3 && nearPicked.length > 0 && PART && want.some((w) => w.lit && w.k !== CORES[0]),
    `…the hash lights ${want.filter((w) => w.lit).length} of the mod's stars, and would light ${nearPicked.length} in the new city's glow and the part-repainted ${PART && PART.id}; the sizes drawn are not all one`);
  // (the writer refuses a star in ANY city's glow; the mod's are all far enough from the layer below's that the new city's
  // glow is the only one this section's stars can lie in — the kept town's has a section of its own, below)
  const dBelow = md.textureDistanceTo(TW, TH, (i) => L.urban[i] === 1), inKept = modStars.filter((s) => !(dBelow[middleOf(s)] > 8));
  ok(!inKept.length, "…and no star of the mod has its middle within 8 texels of the layer below's city ground", inKept.map((s) => s.id));
}

console.log("\n-- ⭐ the learn: how often the layer below lights a star, and how big --");
{
  const b = fs.readFileSync(path.join(game, "map", "terrain", NAMES[0])), img = dds.decodeDdsLevel(b, dds.parseDdsHeader(b), 0);
  const cls = new Uint8Array(N), idx = new Uint8Array(N), prov = new Int32Array(N), vpOf = new Map([[3, 10], [GLOW_STAR.id, GLOW_STAR.vp], [TOWN_STAR.id, TOWN_STAR.vp]]), catOf = new Map([[2, "city"], [3, "city"], [GLOW_STAR.id, "rural"], [TOWN_STAR.id, "rural"]]);
  for (const s of L.stars) { vpOf.set(s.id, s.vp); catOf.set(s.id, s.cat); }
  for (let i = 0; i < N; i++) { const Y = (i / TW) | 0; cls[i] = Y < 40 ? 1 : 2; idx[i] = L.urban[i] ? CITY : Y < 40 ? LAND : OCEAN; prov[i] = L.provT(i % TW, Y); }
  const sum = new Array(9).fill(0), cnt = new Array(9).fill(0);
  for (let i = 0; i < N; i++) { if (cls[i] !== 1 || L.urban[i]) continue; const d = Math.round(L.dU[i]); if (d > 8) continue; sum[d] += L.alpha[i]; cnt[d]++; }
  const glowAt = (d) => { const r = Math.round(d); return cnt[r] ? sum[r] / cnt[r] : 0; };
  const R = md.learnCityLights({ layer: { W: TW, H: TH, N, cls, idx }, prov, vpOf, catOf, colormap: img, urbanIdx: new Set([CITY]), glowAt });
  ok(R.stars.asked === FULL.asked && R.stars.lit === FULL.lit, `⭐⭐ ${FULL.asked} stars asked, ${FULL.lit} lit — the star in the glow and the one holding a town not among them`, R.stars);
  ok(["rural", "pastoral", "enclave"].every((c) => R.stars.byCategory[c] && R.stars.byCategory[c].asked === FULL.by[c].asked && R.stars.byCategory[c].lit === FULL.by[c].lit),
    "⭐ …each category's, a blob too dim to be brighter than a city's first ring counted dark", R.stars.byCategory);
  ok(R.stars.byCategory.pastoral.lit === FULL.by.pastoral.lit && R.stars.byCategory.enclave.lit === FULL.by.enclave.lit,
    `⭐⭐ a star is lit by its OWN land: the rim star, dim beside a bright patch of the plains below, is dark, and the edge star, bright only in the city's glow, is dark (pastoral ${R.stars.byCategory.pastoral.lit} lit, enclave ${R.stars.byCategory.enclave.lit})`, R.stars.byCategory);
  ok(["rural", "pastoral", "enclave", "wasteland"].every((c) => R.rateOf(c) === FULL.rateOf(c)),
    `⭐⭐ the rates: rural ${FULL.by.rural.lit}/${FULL.by.rural.asked}, pastoral ${FULL.by.pastoral.lit}/${FULL.by.pastoral.asked}, enclave (${FULL.by.enclave.asked} asked) and wasteland (none) the pooled ${FULL.lit}/${FULL.asked}`,
    ["rural", "pastoral", "enclave", "wasteland"].map((c) => [c, R.rateOf(c), FULL.rateOf(c)]));
  ok(JSON.stringify(R.starCores) === JSON.stringify(CORES), `⭐⭐ the core sizes are the bright texels in each lit star's own province — two stars holding one blob of 18 between them 9 each, and the star whose blob spills 9 into the plains below its own 9, not 18: ${JSON.stringify(CORES)}`, R.starCores);
}

for (const owned of [false, true]) {
  const way = owned ? "owned, windowed" : "inherited, whole map";
  console.log(`\n-- ⭐ the mod's stars: ${way} --`);
  const m = makeMod("mod", game, L, owned);
  let r;
  if (owned) {
    const twin = copyDir(m);
    r = md.repaintWorldTextures({ modRoot: m, gameRoot: game, crossed: crossedNew() });
    md.repaintWorldTextures({ modRoot: twin, gameRoot: game, crossed: crossedNew(), _wholeMap: true });
    const differ = NAMES.filter((n, k) => hashTex(m)[k] !== hashTex(twin)[k]);
    ok(r.changed && r.inherited === false && !differ.length, `${way}: the windowed repaint is the whole-map one, byte for byte`, { r, differ });
    // (the colour map, whose alpha is the lights: the fog map's kept coast, here the layer below's shore the new land now
    // touches, is blended from what it carries and moves again on a second call — the fog's business, not the lights')
    const snap = hashTex(m)[0], again = md.repaintWorldTextures({ modRoot: m, gameRoot: game, crossed: crossedNew() });
    ok(!(again.files || {})[NAMES[0]] && hashTex(m)[0] === snap, `${way}: a second repaint of the same write leaves the colour map as it was`, again);
  } else {
    r = md.repaintWorldTextures({ modRoot: m, gameRoot: game });
    ok(r.changed && r.inherited === true, `${way}: the repair repainted the pictures the mod inherits`, r);
  }
  const img = picture(m), want = expectOver(FULL, CORES);
  ok(texOf(MOD_CITY).every((i) => img[i * 4 + 3] === LIT), "the new city's own ground is lit at 173");
  const wrongLit = want.filter((w) => { const g = starsIn(img, w.s); return w.lit ? !(g.n === w.k && g.at && g.whole) : g.n !== 0; });
  ok(!wrongLit.length, `⭐⭐ exactly the ${want.filter((w) => w.lit).length} stars the hash puts under their state's rate are lit — each a core of the size its second hash draws, at 173, in one piece round its middle — and no other`,
    wrongLit.slice(0, 5).map((w) => ({ id: w.s.id, cat: w.s.cat, want: w.k, got: starsIn(img, w.s) })));
  const glow = [];
  for (let i = 0; i < N; i++) { const p = modProvT(i % TW, (i / TW) | 0); if (p == null || p === 1 || p === MOD_CITY || i < MY0 * TW || !(dCity[i] > 8)) continue; const a = img[i * 4 + 3]; if (a && a !== LIT) glow.push([i, a]); }
  ok(!glow.length, "⭐ …and nothing round them: past the city's glow every texel is a star's 173 or dark (the base game's far light has a dim fringe; the writer draws none — a cosmetic gap, pinned so a change to it is a choice)", glow.slice(0, 5));
  const near = modStars.filter((s) => picked(s, FULL.rateOf) && !(dCity[middleOf(s)] > 8)).filter((s) => texOf(s.id).some((i) => dCity[i] > 8 && img[i * 4 + 3] > 0));
  ok(!near.length, "⭐ a star the hash picks whose middle lies in the new city's glow is not lit", near.map((s) => s.id));
  ok(starsIn(img, PART).n === 0, `⭐ the star this write repainted only part of (${PART.id}) is left unlit`, starsIn(img, PART));
}

// OUT OF EVERY CITY'S GLOW MEANS EVERY CITY'S (review of 6cc15295): the learn asks a star from all city ground, so the writer
// must refuse a star raised with its middle in the glow of a city the write KEPT — here the layer below's town, at the east end
// of its star 5 — and grow no core into that glow; and a province holding a town of its own is a town, not a star, however far
// its middle lies from it. Raised in the sea under the town: A (its middle 7.3 texels from the town) and B (its middle 9.0, the
// texel above it 8.0 — the fourth a growth from the middle reaches); and far to the west T, 30 x 3, with a town of 2 x 2 at its
// east end and its middle 14 from it. The three ids are the first the writer's own hash picks under the rural rate.
console.log("\n-- ⭐ every city's glow, the kept town's too — and a province holding a town is no star --");
{
  const ids = [];
  for (let id = 600; ids.length < 3 && id < 1024; id++) if (md.textureNoiseHash(id, 0, 401) < FULL.rateOf("rural")) ids.push(id);
  const [A, B, T] = ids, BOX = { [A]: [126, 128, 40, 42], [B]: [118, 126, 40, 44], [T]: [10, 40, 60, 63] }, TOWN = [38, 40, 60, 62];
  const at = (X, Y) => { for (const id of ids) if (inBox(X, Y, BOX[id])) return id; return null; };
  const town = (X, Y) => inBox(X, Y, TOWN), atI = (i) => at(i % TW, (i / TW) | 0);
  const { g, L: Lg } = makeGame("game-kept", ASKED_FULL);
  const listOf = (id) => { const out = []; for (let i = 0; i < N; i++) if (atI(i) === id) out.push(i); return out; };
  const dTown = md.textureDistanceTo(TW, TH, (i) => Lg.urban[i] === 1 || town(i % TW, (i / TW) | 0));
  const mid = Object.fromEntries(ids.map((id) => [id, md.textureNearestCentroid(listOf(id), TW)]));
  const kB = CORES[Math.floor(md.textureNoiseHash(B, 1, 401) * CORES.length)], up = mid[B] - TW;
  ok(ids.length === 3 && !(dTown[mid[A]] > 8) && dTown[mid[B]] > 8 && atI(up) === B && !(dTown[up] > 8) && [mid[B] - 1, mid[B] + 1].every((q) => atI(q) === B && dTown[q] > 8) && kB >= 4 && dTown[mid[T]] > 8,
    `(A's middle is ${dTown[mid[A]].toFixed(2)} from the kept town; B's ${dTown[mid[B]].toFixed(2)}, the texel above it ${dTown[up].toFixed(2)}, and the core its hash draws ${kB} — a growth blind to the town takes that texel fourth; T's middle is ${dTown[mid[T]].toFixed(2)} from its own town)`);
  const crossedKept = () => { const mask = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x >> 1, y >> 1) != null) mask[y * W + x] = 1; return { W, H, mask }; };
  const states = [modState(99, "rural", [A]), modState(98, "rural", [B]), modState(97, "rural", [T])];
  for (const owned of [false, true]) {
    const way = owned ? "owned, windowed" : "inherited, whole map";
    const m = editMod("mod-kept", g, Lg, at, ids, states, { town, owned });
    if (owned) {
      const twin = copyDir(m);
      const r = md.repaintWorldTextures({ modRoot: m, gameRoot: g, crossed: crossedKept() });
      md.repaintWorldTextures({ modRoot: twin, gameRoot: g, crossed: crossedKept(), _wholeMap: true });
      const differ = NAMES.filter((n, k) => hashTex(m)[k] !== hashTex(twin)[k]);
      ok(r.changed && r.inherited === false && !differ.length, `${way}: the windowed repaint is the whole-map one, byte for byte`, { r, differ });
    } else {
      const r = md.repaintWorldTextures({ modRoot: m, gameRoot: g });
      ok(r.changed && r.inherited === true, `${way}: the repair repainted the pictures the mod inherits`, r);
    }
    const img = picture(m), a = (i) => img[i * 4 + 3];
    const litA = listOf(A).filter((i) => a(i) > 0);
    ok(!litA.length, `⭐⭐ ${way}: A, raised with its middle in the glow of the town the write kept, is not lit`, litA.map((i) => [i % TW, (i / TW) | 0, a(i)]));
    const litB = listOf(B).filter((i) => a(i) > 0), set = new Set(litB), seen = new Set([mid[B]]), q = [mid[B]];
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % TW; for (const j of [x > 0 ? i - 1 : -1, x < TW - 1 ? i + 1 : -1, i - TW, i + TW]) if (set.has(j) && !seen.has(j)) { seen.add(j); q.push(j); } }
    ok(litB.length === kB && litB.every((i) => a(i) === LIT && dTown[i] > 8) && set.has(mid[B]) && seen.size === litB.length,
      `⭐⭐ ${way}: B is lit, ${kB} texels at 173 in one piece round its middle, and none of them within 8 of the kept town`, litB.map((i) => [i % TW, (i / TW) | 0, a(i), +dTown[i].toFixed(2)]));
    const litT = listOf(T).filter((i) => dTown[i] > 8 && a(i) > 0);
    ok(listOf(T).filter((i) => town(i % TW, (i / TW) | 0)).every((i) => a(i) === LIT) && !litT.length,
      `⭐ ${way}: T, holding a town of its own, lights its town at 173 and nothing past that town's glow — it is no star`, litT.map((i) => [i % TW, (i / TW) | 0, a(i)]).slice(0, 6));
  }
}

console.log("\n-- ⭐ a layer below that asked too few stars lights none --");
{
  const { g, L: Lf } = makeGame("game-few", ASKED_FEW), m = makeMod("mod-few", g, Lf, false);
  const r = md.repaintWorldTextures({ modRoot: m, gameRoot: g });
  const img = picture(m), lit = modStars.filter((s) => starsIn(img, s).n > 0);
  const would = modStars.filter((s) => md.textureNoiseHash(s.id, 0, 401) < FEW.lit / FEW.asked && dCity[middleOf(s)] > 8 && s !== PART);
  ok(r.changed && would.length > 0, `(its ${FEW.asked} asked stars, ${FEW.lit} lit, would light ${would.length} of the mod's at their own rate)`);
  ok(!lit.length, `⭐⭐ with ${FEW.asked} asked below — fewer than ${md.CITY_LIGHT_STARS_MIN} — not one star is lit`, lit.map((s) => s.id).slice(0, 8));
}

// The learn reads the layer below's whole province map and colour map: seconds on vanilla. A write that can light no star and
// makes no city — Delete map's erase, a stroke of the height brush — must not pay it. Each case over a layer below of its own
// (the learn is kept against the files it read, one entry, so a case learnt once would hide the next).
console.log("\n-- ⭐ a write that can light no star, and makes no city, learns nothing --");
{
  const NEW = [40, 50, 44, 50];   // texels of sea below that the raises take
  const runs = [
    ["erase", (X, Y) => (Y >= 36 && Y < 40 ? 1 : null), [], []],   // the plains under the stars' rows, sunk
    ["plain", (X, Y) => (inBox(X, Y, NEW) ? 400 : null), [400], []],   // new land in no state
    ["star", (X, Y) => (inBox(X, Y, NEW) ? 401 : null), [401], [modState(99, "rural", [401])]],
  ].map(([tag, at, ids, states]) => {
    const { g, L: Lg } = makeGame("game-" + tag, ASKED_FULL), m = editMod("mod-" + tag, g, Lg, at, ids, states);
    const c0 = md.worldTextureLearnCounters.lights, r = md.repaintWorldTextures({ modRoot: m, gameRoot: g });
    return { tag, changed: r.changed, learnt: md.worldTextureLearnCounters.lights - c0 };
  });
  ok(runs.every((x) => x.changed), "(each of the three writes repainted the pictures)", runs);
  ok(runs[0].learnt === 0, "⭐⭐ sea where there was land — an erase — learns no lights", runs[0]);
  ok(runs[1].learnt === 0, "⭐⭐ new land of a province with no victory point learns no lights", runs[1]);
  ok(runs[2].learnt === 1, "…and new land of a province that has one learns them, once: the count can tell", runs[2]);
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
