// ⛔ #a-restyled-map-keeps-its-own-colours — A MINIMAP THE MOD OWNS IS PAINTED IN ITS OWN COLOURS.
//
// repaintMinimap learnt its palette only from the layer BELOW. A mod that owns a restyled minimap — Millennium Dawn's navy,
// Old World Blues' green on grey, Hearts of Minecraft's pixel-art blue — was repainted in vanilla's paper wherever an erase,
// a raise or a stroke moved land or sea: beige land and brown sea in the middle of MD's blue (a round trip off MD's own
// bytes: 147/122/57 out per channel on its coast). An owned minimap is now learnt from itself, over the map it was drawn
// for, wherever that can be trusted:
//   · some of each kind: only when its points sit by their own kind's colour — a minimap drawn for ANOTHER map is not;
//     and only when its land and sea are apart — one drawn for far less land than its map has is not. Each half of that
//     guard is pinned by a minimap only it refuses;
//   · one kind only (Delete map leaves it all sea): only when even the worst blend it could hide is nearer than the layer
//     below's colour — true of a restyled sea with MD's own vignette and scan-lines, not of a minimap drawn for continents;
//     and never a kind with under 50 points of its own;
//   · otherwise the layer below's colours, and its grain too.
// ⛔ #a-partly-stale-minimap-keeps-its-paper — and a minimap that IS the layer below's paper (every Nova world owns a copy
// of vanilla's) is painted with the layer below's means even where it is trusted: a copy partly stale — its map changed
// where it was never repainted — still agrees, and its own means take the stale points in.
//
// Pinned on the small game of test-the-world-textures-follow-the-coast.js, with a minimap 28 x 10 so its points straddle
// province edges, driven through Nova's real writers (the erase, the retype, Delete map).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const dds = require("./dds-codec.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};
const roots = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-restyled-" + tag + "-")); roots.push(d); return d; };
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };

// ── the fixture's bitmaps (as test-the-world-textures-follow-the-coast.js draws them) ──────────────────────────
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
/** A 32-bit DDS, one level, painted by fn(x, y) → [r, g, b, a]. */
function makeDds(W, H, fn) {
  const h = Buffer.alloc(128);
  h.write("DDS ", 0, "latin1"); h.writeUInt32LE(124, 4); h.writeUInt32LE(0x1007 | 0x8, 8);
  h.writeUInt32LE(H, 12); h.writeUInt32LE(W, 16); h.writeUInt32LE(W * 4, 20); h.writeUInt32LE(1, 28); h.writeUInt32LE(32, 76);
  h.writeUInt32LE(0x41, 80); h.writeUInt32LE(32, 88); h.writeUInt32LE(0xff0000, 92); h.writeUInt32LE(0xff00, 96); h.writeUInt32LE(0xff, 100); h.writeUInt32LE(0xff000000, 104);
  h.writeUInt32LE(0x1000, 108);
  const buf = Buffer.alloc(128 + W * H * 4); h.copy(buf);
  const hdr = dds.parseDdsHeader(buf), rgba = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) rgba.set(fn(x, y).map((v) => Math.max(0, Math.min(255, Math.round(v)))), (y * W + x) * 4);
  dds.patchDdsLevel(buf, hdr, 0, rgba, new Uint8Array(W * H).fill(1));
  return buf;
}

// ── the small game: sea 1 to the west, the coast 2, land 3 with a city 4 and a desert 6, a lagoon 5, an islet 7 ─────
const W = 128, H = 64, TW = 64, TH = 32, MW = 28, MH = 10;
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 100, 200], 6: [100, 50, 0], 7: [50, 50, 50] };
const provAt = (x, y) => (x >= 20 && x < 24 && y >= 50 && y < 54 ? 7 : x >= 76 && x < 116 && y >= 6 && y < 34 ? 5 : x < 48 ? 1 : x < 64 ? 2 : y < 44 ? 3 : x >= 96 ? 4 : 6);
const DEF = "0;0;0;0;land;false;unknown;0\n1;0;0;200;sea;false;ocean;0\n2;200;0;0;land;true;plains;1\n3;0;200;0;land;true;plains;1\n4;200;200;0;land;false;urban;1\n5;0;100;200;sea;false;ocean;0\n6;100;50;0;land;false;desert;1\n7;50;50;50;land;true;plains;1\n";
const IDX = { plains: 0, urban: 13, ocean: 15, desert: 7 };
const TERRAIN = ["categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  desert = { color = { 210 180 110 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
  "terrain = {", "  plains = { type = plains color = { 0 } }", "  desert = { type = desert color = { 7 } }", "  urban = { type = urban color = { 13 } }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n");
// every province edge is on an even pixel, so each texel is one province: its class is its top-left pixel's
const provOfTexel = (X, Y) => provAt(2 * X, 2 * Y);
const isLand = (p) => p !== 1 && p !== 5;
const landT = (X, Y) => isLand(provOfTexel(X, Y));
/** The land share under a minimap point, as minimapLandShare counts it (texels, the same footprint). */
function share(u, v, land = landT) {
  const x0 = Math.floor(u * TW / MW), x1 = Math.max(x0 + 1, Math.floor((u + 1) * TW / MW));
  const y0 = Math.floor(v * TH / MH), y1 = Math.max(y0 + 1, Math.floor((v + 1) * TH / MH));
  let l = 0, n = 0; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { n++; if (land(x, y)) l++; } return l / n;
}
const MINI_SEA = [84, 78, 66], MINI_LAND = [170, 162, 147];          // the base game's paper
const MOD_SEA = [42, 69, 149], MOD_LAND = [31, 49, 98];              // Millennium Dawn's navy, measured off its own minimap
/** A minimap drawn for a map: the line from `sea` to `lnd` by the land share, and a light grain of its own. */
const paper = (sea, lnd, land = landT) => (u, v) => { const s = share(u, v, land), g = (u * 7 + v * 3) % 5; return [...sea.map((c, k) => c + s * (lnd[k] - c) + g), 255]; };
/** …and MD's own look: its scan-lines (every other row 10 lighter, 10 darker in blue) and the dark vignette at its west edge. */
const mdLike = (u, v) => { const c = paper(MOD_SEA, MOD_LAND)(u, v), sc = v % 2 ? 10 : -10, vig = u <= 2 ? 1 : 0; return [c[0], c[1] - 20 * vig + sc * 0.4, c[2] - 70 * vig + sc, 255]; };
function makeGame() {
  const g = tmp("game");
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => COL[provAt(x, y)]));
  write(g, "map/definition.csv", DEF);
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return p === 1 || p === 5 ? IDX.ocean : p === 4 ? IDX.urban : p === 6 ? IDX.desert : IDX.plains; }));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (isLand(provAt(x, y)) ? 106 : 89)));
  write(g, "common/terrain/00_terrain.txt", TERRAIN);
  write(g, "gfx/minimap/minimap.dds", makeDds(MW, MH, paper(MINI_SEA, MINI_LAND)));
  return g;
}
const MINI = "gfx/minimap/minimap.dds";
const readMini = (root) => { const b = fs.readFileSync(path.join(root, ...MINI.split("/"))); return dds.decodeDdsLevel(b, dds.parseDdsHeader(b), 0); };
const px = (img, i) => [img[i * 4], img[i * 4 + 1], img[i * 4 + 2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const fmt = (a) => a.map((v) => Math.round(v)).join(",");
const avg = (img, set) => [0, 1, 2].map((k) => set.reduce((s, i) => s + img[i * 4 + k], 0) / Math.max(1, set.length));
const points = (f) => { const o = []; for (let v = 0; v < MH; v++) for (let u = 0; u < MW; u++) if (f(u, v)) o.push(v * MW + u); return o; };
const lineAt = (sea, lnd, s) => sea.map((c, k) => c + s * (lnd[k] - c));
// after the erase of 2: the points that were all coast; after the raise of 2 on an empty sea: the ones it only partly covers
const coastOnly = points((u, v) => share(u, v, (X, Y) => provOfTexel(X, Y) === 2) === 1);
const partOf2 = points((u, v) => { const s = share(u, v, (X, Y) => provOfTexel(X, Y) === 2); return s > 0 && s < 1; });
const only = (id) => points((u, v) => share(u, v, (X, Y) => provOfTexel(X, Y) === id) === 1);
/** The two numbers the two-kind guard reads, worked out here over `land` (a texel → is it land): of the points all land
 *  or all sea, the share nearer their own kind's mean than the other's (a tie counts as land), and how far apart the two
 *  means are. */
function agreeSep(img, land) {
  const kind = { land: points((u, v) => share(u, v, land) === 1), sea: points((u, v) => share(u, v, land) === 0) };
  const mean = { land: avg(img, kind.land), sea: avg(img, kind.sea) };
  const good = kind.land.filter((i) => dist(px(img, i), mean.land) <= dist(px(img, i), mean.sea)).length
    + kind.sea.filter((i) => dist(px(img, i), mean.land) > dist(px(img, i), mean.sea)).length;
  return { agree: good / (kind.land.length + kind.sea.length), sep: dist(mean.land, mean.sea), mean, n: { land: kind.land.length, sea: kind.sea.length } };
}
/** definition.csv with some provinces retyped: an edit made outside Nova, which repaints nothing. */
const retype = (def, to) => {
  const eol = def.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
  return def.split(/\r?\n/).map((l) => { const f = l.split(";"); const t = to[f[0]]; if (!t || f.length < 8) return l; f[4] = t; f[6] = t === "land" ? "plains" : "ocean"; f[7] = t === "land" ? "1" : "0"; return f.join(";"); }).join(eol);
};
const HI_SEA = [56, 56, 225], HI_LAND = [112, 123, 58];             // Hearts of Minecraft's blue and green, off its own (182 apart)
const LOW_SEA = MOD_SEA, LOW_LAND = [42, 69, 109];                  // a navy restyle whose land is its sea 40 darker

try {
  const game = makeGame();
  const G = (m) => ({ modRoot: m, gameRoot: game, dependencyRoots: [] });
  /** A mod carrying the game's map as its own, and its own minimap drawn by `mini`. */
  const modWith = (tag, mini) => {
    const m = tmp(tag);
    write(m, "descriptor.mod", 'version="1.0"\nname="restyled"\n');
    for (const f of ["provinces.bmp", "definition.csv", "terrain.bmp", "heightmap.bmp"]) write(m, "map/" + f, fs.readFileSync(path.join(game, "map", f)));
    write(m, MINI, makeDds(MW, MH, mini));
    return m;
  };
  ok(coastOnly.length === 3 * MH && partOf2.length === MH, `CONTROL: ${coastOnly.length} points lie wholly on the coast province and ${partOf2.length} only partly`, { coastOnly: coastOnly.length, partOf2: partOf2.length });

  console.log("\n-- ⭐ an erase in a mod with its own restyled minimap paints the new sea in ITS colours --");
  {
    const m = modWith("restyled", paper(MOD_SEA, MOD_LAND));
    const mini0 = readMini(m);
    const r = md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    const mm = r && r.heightmap && r.heightmap.minimap;
    ok(mm && mm.changed && !mm.inherited, "province 2 was erased and the mod's own minimap repainted", r && (r.error || mm));
    const mini = readMini(m);
    const off = coastOnly.filter((i) => dist(px(mini, i), MOD_SEA) > 12);
    ok(!off.length, `⭐ the ${coastOnly.length} points that were all coast show the mod's own sea, not the base game's paper`, off.slice(0, 5).map((i) => px(mini, i)));
    const far = points((u) => u >= 20);
    ok(far.every((i) => [0, 1, 2, 3].every((k) => mini[i * 4 + k] === mini0[i * 4 + k])), `…and the ${far.length} points far from the erase keep their bytes`);

    const r2 = md.setProvinceDefinition({ ...G(m), provinceId: 5, type: "land", terrain: "plains", coastal: false, continent: 1 });
    ok(r2 && r2.changed, "the lagoon was raised", r2 && r2.error);
    const mini2 = readMini(m);
    const lagoon = points((u, v) => share(u, v, (X, Y) => provOfTexel(X, Y) === 5) === 1);
    const lOff = lagoon.filter((i) => dist(px(mini2, i), MOD_LAND) > 12);
    ok(lagoon.length >= 20 && !lOff.length, `⭐ the ${lagoon.length} points that were all lagoon show the mod's own land`, lOff.slice(0, 5).map((i) => px(mini2, i)));
  }

  console.log("\n-- a minimap drawn for ANOTHER map is not learnt from: the layer below's paper, and its grain --");
  {
    // the base game's paper, drawn for this map mirrored east–west: its land lies where this map has sea
    const m = modWith("mirror", paper(MINI_SEA, MINI_LAND, (X, Y) => landT(TW - 1 - X, Y)));
    md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    const mini = readMini(m), a = avg(mini, coastOnly);
    ok(dist(a, MINI_SEA) < 8, `⭐ the coast points are the layer below's sea on average (${fmt(a)}), not a blend of a minimap that disagrees with its map`, { got: fmt(a), want: MINI_SEA });
    const off = coastOnly.filter((i) => dist(px(mini, i), MINI_SEA) > 12);
    ok(!off.length, "…and each one carries the paper's grain, not the scatter of a minimap measured over the wrong coasts", off.slice(0, 5).map((i) => px(mini, i)));
  }

  console.log("\n-- ⭐ Delete map, then land raised on the empty sea: the new coast blends from the mod's own sea --");
  {
    const m = modWith("delete", paper(MOD_SEA, MOD_LAND));
    const b = md.blankMapToSea(G(m));
    ok(b && b.changed, "Delete map ran", b && b.error);
    const mini = readMini(m), notSea = points(() => true).filter((i) => dist(px(mini, i), MOD_SEA) > 12);
    ok(!notSea.length, "every point of the minimap now shows the mod's own sea", notSea.slice(0, 5).map((i) => px(mini, i)));
    const seaNow = avg(mini, points(() => true));
    const r = md.setProvinceDefinition({ ...G(m), provinceId: 2, type: "land", terrain: "plains", coastal: true, continent: 1 });
    ok(r && r.changed, "the coast was raised on the empty sea", r && r.error);
    const mm = readMini(m), s = share(partOf2[0] % MW, (partOf2[0] / MW) | 0, (X, Y) => provOfTexel(X, Y) === 2);
    // the land's own colour comes from below — the mod has no land left to learn it from
    const own = lineAt(seaNow, MINI_LAND, s), below = lineAt(MINI_SEA, MINI_LAND, s);
    const bad = partOf2.filter((i) => dist(px(mm, i), own) >= dist(px(mm, i), below));
    ok(!bad.length, `⭐ the ${partOf2.length} points the raised coast only partly covers (share ${s.toFixed(2)}) blend from the mod's sea, not the base game's`, bad.slice(0, 5).map((i) => ({ got: px(mm, i), own: fmt(own), below: fmt(below) })));
  }

  console.log("\n-- ⭐ …and so does a sea with Millennium Dawn's own scan-lines and vignette --");
  {
    const m = modWith("md-like", mdLike);
    const b = md.blankMapToSea(G(m));
    ok(b && b.changed, "Delete map ran", b && b.error);
    const mini = readMini(m), all = points(() => true), seaNow = avg(mini, all);
    const sdB = Math.sqrt(all.reduce((q, i) => q + (mini[i * 4 + 2] - seaNow[2]) ** 2, 0) / all.length);
    ok(sdB > 20, `CONTROL: its sea strays ${sdB.toFixed(1)} in blue over the whole minimap, as MD's own does after Delete map (20.6) — past a cap of 20 on it`, sdB);
    const r = md.setProvinceDefinition({ ...G(m), provinceId: 2, type: "land", terrain: "plains", coastal: true, continent: 1 });
    ok(r && r.changed, "the coast was raised on the empty sea", r && r.error);
    const mm = readMini(m), s = share(partOf2[0] % MW, (partOf2[0] / MW) | 0, (X, Y) => provOfTexel(X, Y) === 2);
    const own = lineAt(seaNow, MINI_LAND, s), below = lineAt(MINI_SEA, MINI_LAND, s);
    const bad = partOf2.filter((i) => dist(px(mm, i), own) >= dist(px(mm, i), below));
    ok(!bad.length, `⭐ the ${partOf2.length} partly covered points blend from the mod's own sea, vignette and scan-lines and all`, bad.slice(0, 5).map((i) => ({ got: px(mm, i), own: fmt(own), below: fmt(below) })));
  }

  console.log("\n-- a minimap still drawn for continents, over a mod whose map is all sea, is not learnt from --");
  {
    // Delete map, then a minimap drawn for the game's continents put back over it — one that was drawn for another map
    const m = modWith("stale", paper(MOD_SEA, MOD_LAND));
    md.blankMapToSea(G(m));
    write(m, MINI, fs.readFileSync(path.join(game, MINI)));
    const stale = readMini(m), staleSea = avg(stale, points(() => true));
    const r = md.setProvinceDefinition({ ...G(m), provinceId: 2, type: "land", terrain: "plains", coastal: true, continent: 1 });
    ok(r && r.heightmap && r.heightmap.minimap && r.heightmap.minimap.changed, "the coast was raised and the minimap repainted", r && (r.error || (r.heightmap && r.heightmap.minimap)));
    const mm = readMini(m), s = share(partOf2[0] % MW, (partOf2[0] / MW) | 0, (X, Y) => provOfTexel(X, Y) === 2);
    const blend = lineAt(staleSea, MINI_LAND, s), below = lineAt(MINI_SEA, MINI_LAND, s), a = avg(mm, partOf2);
    ok(dist(a, below) < dist(a, blend), `⭐ the partly covered points blend from the layer below's sea (${fmt(below)}), not the ${fmt(staleSea)} a blend of sea and continents averages to`, { got: fmt(a), below: fmt(below), blend: fmt(blend) });
    // that minimap already draws the game's coast on these very points: kept as their "grain", it is drawn a second time
    const twice = partOf2.filter((i) => dist(px(mm, i), px(stale, i).map((c, k) => c + s * (MINI_LAND[k] - MINI_SEA[k]))) < 8);
    ok(!twice.length, "…none of them is its old colour moved on by the land it gained — the coast that minimap drew there, drawn twice", twice.slice(0, 5).map((i) => ({ got: px(mm, i), was: px(stale, i) })));
    const off = partOf2.filter((i) => dist(px(mm, i), below) > 10);
    ok(!off.length, "…and each is within the paper's grain of that blend", off.slice(0, 5).map((i) => ({ got: px(mm, i), want: fmt(below) })));
  }

  console.log("\n-- …nor is one drawn for a continent somewhere else: land raised far from it is the layer below's --");
  {
    // a continent in the far west (texels x < 16), the lagoon raised in the east where that minimap draws plain sea
    const m = modWith("stale-west", paper(MOD_SEA, MOD_LAND));
    md.blankMapToSea(G(m));
    write(m, MINI, makeDds(MW, MH, paper(MINI_SEA, MINI_LAND, (X) => X < 16)));
    const r = md.setProvinceDefinition({ ...G(m), provinceId: 5, type: "land", terrain: "plains", coastal: false, continent: 1 });
    ok(r && r.heightmap && r.heightmap.minimap && r.heightmap.minimap.changed, "the lagoon was raised and the minimap repainted", r && (r.error || (r.heightmap && r.heightmap.minimap)));
    const mm = readMini(m), lag = (X, Y) => provOfTexel(X, Y) === 5;
    // the points the lagoon more than half covers turned land: the layer below's line at their share, not a stale blend's
    const landSide = points((u, v) => { const s = share(u, v, lag); return s >= 0.5 && s < 1; });
    const off = landSide.filter((i) => dist(px(mm, i), lineAt(MINI_SEA, MINI_LAND, share(i % MW, (i / MW) | 0, lag))) > 10);
    ok(landSide.length >= 3 && !off.length, `⭐ the ${landSide.length} points the lagoon more than half covers are the layer below's blend of sea and land`, off.slice(0, 5).map((i) => px(mm, i)));
    // …and the ones it covers a third of stay sea, each the line plus grain the size of the PAPER's, not of that western
    // continent's coasts measured as the sea's own
    const third = points((u, v) => Math.abs(share(u, v, lag) - 1 / 3) < 1e-9), want = lineAt(MINI_SEA, MINI_LAND, 1 / 3);
    const res = third.map((i) => px(mm, i).map((c, k) => c - want[k])), mres = [0, 1, 2].map((k) => res.reduce((q, r) => q + r[k], 0) / Math.max(1, res.length));
    const scatter = Math.sqrt(res.reduce((q, r) => q + r.reduce((w, c, k) => w + (c - mres[k]) ** 2, 0), 0) / Math.max(1, res.length));
    ok(third.length >= 5 && scatter < 6, `⭐ the ${third.length} points it covers a third of scatter ${scatter.toFixed(1)} about their colour — the paper's grain, not a continent's coasts`, { scatter, res: res.slice(0, 4) });
  }

  // the layer below's paper, as its own means over its own map: what 0c4e824 painted every minimap with
  const belowPaper = agreeSep(readMini(game), landT).mean;

  console.log("\n-- ⭐ a copy of the layer below's paper, partly stale, is painted with the layer below's means --");
  {
    // every Nova world's minimap: the base game's paper, owned. Its map changed where it was never repainted — the city went
    // under and the lagoon was filled in, by an edit outside Nova — so its own means take the stale points in
    const m = modWith("partly-stale", paper(MINI_SEA, MINI_LAND));
    write(m, "map/definition.csv", retype(DEF, { 4: "sea", 5: "land" }));
    const mapNow = (X, Y) => { const p = provOfTexel(X, Y); return p === 5 ? true : p === 4 ? false : isLand(p); };
    const g = agreeSep(readMini(m), mapNow);
    ok(g.agree >= 0.75 && g.sep >= 30 && dist(g.mean.sea, belowPaper.sea) > 12,
      `CONTROL: it still agrees ${g.agree.toFixed(3)} at ${g.sep.toFixed(0)} apart — it is trusted — and its own sea's mean is ${dist(g.mean.sea, belowPaper.sea).toFixed(1)} off the paper's`, g);
    const r = md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    ok(r && r.heightmap && r.heightmap.minimap && r.heightmap.minimap.changed, "province 2 was erased and the minimap repainted", r && (r.error || (r.heightmap && r.heightmap.minimap)));
    const a = avg(readMini(m), coastOnly);
    ok(dist(a, belowPaper.sea) < 4, `⭐ the ${coastOnly.length} points the erase turned to sea are the paper's sea (${fmt(belowPaper.sea)}) on average, not the stale mean of its own (${fmt(g.mean.sea)})`, { got: fmt(a), paper: fmt(belowPaper.sea), own: fmt(g.mean.sea) });
  }

  console.log("\n-- a restyle drawn for the map shifted is refused by its agreement alone --");
  {
    // Hearts of Minecraft's colours, drawn for this map shifted 12 texels east: far apart, but too many points by the wrong one
    const m = modWith("shifted", paper(HI_SEA, HI_LAND, (X, Y) => X >= 12 && landT(X - 12, Y)));
    const g = agreeSep(readMini(m), landT);
    ok(g.agree < 0.75 && g.sep >= 30, `CONTROL: it agrees ${g.agree.toFixed(3)} (under 0.75) at ${g.sep.toFixed(0)} apart (30 or more) — only the agreement refuses it`, g);
    md.flipProvinceToSea({ ...G(m), provinceId: 2 });
    const a = avg(readMini(m), coastOnly);
    ok(dist(a, belowPaper.sea) < 6 && dist(a, belowPaper.sea) < dist(a, g.mean.sea), `⭐ the ${coastOnly.length} points the erase turned to sea are the layer below's sea (${fmt(belowPaper.sea)}), not the ${fmt(g.mean.sea)} its sea's points average to`, { got: fmt(a) });
  }

  console.log("\n-- a restyle drawn for far less land than its map has is refused by the distance between its means alone --");
  {
    // a restyle 40 apart, drawn with land on provinces 3 and 4 only: the land of 2 and 6 was raised after it, and it was
    // never repainted. Its sea is all sea, so it agrees; its land's mean is most of the way to its sea
    const m = modWith("less-land", paper(LOW_SEA, LOW_LAND, (X, Y) => [3, 4].includes(provOfTexel(X, Y))));
    const g = agreeSep(readMini(m), landT);
    ok(g.agree >= 0.75 && g.sep < 30, `CONTROL: it agrees ${g.agree.toFixed(3)} (0.75 or more) at ${g.sep.toFixed(1)} apart (under 30) — only the distance refuses it`, g);
    const r = md.setProvinceDefinition({ ...G(m), provinceId: 5, type: "land", terrain: "plains", coastal: false, continent: 1 });
    ok(r && r.heightmap && r.heightmap.minimap && r.heightmap.minimap.changed, "the lagoon was raised and the minimap repainted", r && (r.error || (r.heightmap && r.heightmap.minimap)));
    const lag = only(5), a = avg(readMini(m), lag);
    ok(dist(a, belowPaper.land) < 6, `⭐ the ${lag.length} points of the raised lagoon are the layer below's land (${fmt(belowPaper.land)}), not the ${fmt(g.mean.land)} a land drawn mostly as sea averages to`, { got: fmt(a) });
  }

  console.log("\n-- a handful of land points of its own is not its own land --");
  {
    // Delete map leaves the restyled minimap all sea; then the city was typed land again outside Nova, its points left in the
    // sea's colour: a kind with under 50 points, flat enough to pass the one-kind bound
    const m = modWith("few-land", paper(MOD_SEA, MOD_LAND));
    const b = md.blankMapToSea(G(m));
    ok(b && b.changed, "Delete map ran", b && b.error);
    const defFile = path.join(m, "map", "definition.csv");
    write(m, "map/definition.csv", retype(fs.readFileSync(defFile, "utf8"), { 4: "land" }));
    const city = only(4);
    ok(city.length >= 10 && city.length < 50, `CONTROL: the city is ${city.length} points all land — fewer than 50`, city.length);
    const r = md.setProvinceDefinition({ ...G(m), provinceId: 5, type: "land", terrain: "plains", coastal: false, continent: 1 });
    ok(r && r.heightmap && r.heightmap.minimap && r.heightmap.minimap.changed, "the lagoon was raised and the minimap repainted", r && (r.error || (r.heightmap && r.heightmap.minimap)));
    const mini = readMini(m), lag = only(5), a = avg(mini, lag), stale = avg(mini, city);
    ok(dist(a, belowPaper.land) < 6, `⭐ the ${lag.length} points of the raised lagoon are the layer below's land (${fmt(belowPaper.land)}), not the ${fmt(stale)} the city's points are drawn in`, { got: fmt(a) });
  }

  console.log("\n-- a layer below too small to learn from --");
  {
    // the base game's minimap 8 x 4: 32 points, too few pure land or sea for minimapColours
    const small = tmp("game-small");
    fs.cpSync(game, small, { recursive: true });
    write(small, MINI, makeDds(8, 4, (u, v) => [...MINI_SEA, 255]));
    const S = (m) => ({ modRoot: m, gameRoot: small, dependencyRoots: [] });
    const m = tmp("over-small");
    write(m, "descriptor.mod", 'version="1.0"\nname="restyled"\n');
    for (const f of ["provinces.bmp", "definition.csv", "terrain.bmp", "heightmap.bmp"]) write(m, "map/" + f, fs.readFileSync(path.join(small, "map", f)));
    write(m, MINI, makeDds(MW, MH, paper(MOD_SEA, MOD_LAND)));
    md.flipProvinceToSea({ ...S(m), provinceId: 2 });
    const off = coastOnly.filter((i) => dist(px(readMini(m), i), MOD_SEA) > 12);
    ok(!off.length, `a minimap with some of each kind is still its own: the ${coastOnly.length} erased points show the mod's own sea`, off.slice(0, 5).map((i) => px(readMini(m), i)));
    const b = md.blankMapToSea(S(m));
    ok(b && b.changed, "Delete map ran", b && b.error);
    const was = readMini(m);
    const r = md.setProvinceDefinition({ ...S(m), provinceId: 2, type: "land", terrain: "plains", coastal: true, continent: 1 });
    const mm = r && r.heightmap && r.heightmap.minimap;
    ok(mm && !mm.changed && /too little pure land or sea/.test(mm.reason || "") && Buffer.compare(Buffer.from(was), Buffer.from(readMini(m))) === 0,
      "⭐ …but one of one kind is left as it was, and says why: nothing knows the colour of the kind it has none of", mm);
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
} finally {
  for (const r of roots) { try { fs.rmSync(r, { recursive: true, force: true }); } catch (_) { /* scratch only */ } }
}
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
