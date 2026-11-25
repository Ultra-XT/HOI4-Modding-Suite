// ⛔ #a-painted-coast-rises-like-the-generators — a ✏ Paint shape stroke that hands water to a land province raises it the way the
// generator raises land: one settle, settleRaisedHeights, called by both of Nova's heightmap writers.
//
// The paint's writer, levelPaintedPixels, lifted every painted land pixel at or under 89 to a flat 106, one pixel at a time, and
// left everything else as it was. Measured on the audit's fixture (G1): a band painted out from a coast came up as a 17-high cliff at
// its new waterline (89 → 106 in one pixel, where the base game's beach steps 89 → 94 → 97), and the land's old beach, the ring of 94
// that faced the water the band filled in, was left inside the land, under the waterline: a one-pixel trench HOI4 draws as water.
// And a lake bed at 90..95 painted to land was not lifted at all (M1): 11.6% of the base game's lake pixels read 90..95, 36.6% of
// Millennium Dawn's, and every one of them painted to land stayed land the game draws as water.
//
// So the paint now seeds the raise's own settle with the painted pixels that are land now and were water before the stroke at or
// under the waterline (or read at or under 89, as before), labels every other pixel by its province's kind, and lets the settle do
// what it does for Generate land, Auto-fix and the inspector: the beach at the waterline, the field behind it, the old ring taken
// in, the rim held to the land round it. A stroke that only moves land between land provinces seeds nothing and writes nothing.
//
// Small fixtures, 64 × 32, each painted ONCE through applyProvinceDiff as POST /api/map/paint-provinces calls it, and compared byte for
// byte with the generator's raise of the same pixels made a province of their own:
//   i    a band painted out into the sea (G1) · ii a band painted over a lake whose bed reads 89..94 (M1)
//   iii  THE CONTROL: land painted over land, its beach included, writes nothing · iv the sink is as it was
//   v    one stroke both ways: the settle measures from the water the stroke leaves · vi a model on the old beach is re-seated
//   vii  the wiring, read from the code
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};
const NOGAME = path.join(os.tmpdir(), "__no_game_painted_coast__");
const tmps = [];
const RAMP = md.HEIGHTMAP_BEACH_RAMP;
const SEA_VALUE = 89, WATERLINE = md.HEIGHTMAP_SEA_LEVEL;
const STEP4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const W = 64, H = 32;
const SEA = 1, L = 2, BAND = 3, LAKE = 4, LBAND = 5, M = 6;
const TYPE = { [SEA]: "sea", [L]: "land", [BAND]: "sea", [LAKE]: "lake", [LBAND]: "lake", [M]: "land" };
const col = (id) => [(id * 37) & 255, (id * 91 + 11) & 255, (id * 53 + 7) & 255];
const inBox = (x, y, x0, x1, y0, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
// the world as the paint finds it: L a block of land with M beside it to the west, a lake inside L, sea round them
const baseAt = (x, y) => inBox(x, y, 18, 27, 11, 20) ? LAKE : inBox(x, y, 12, 40, 6, 25) ? L : inBox(x, y, 4, 11, 6, 25) ? M : SEA;
const isBand = (x, y) => inBox(x, y, 41, 48, 10, 21);       // painted out into the sea, off L's east coast
const isLakeBand = (x, y) => inBox(x, y, 18, 21, 11, 20);   // painted over the lake's west part
// …and the same world with the painted pixels a province of their own, for the generator to raise
const withBand = (x, y) => (isBand(x, y) ? BAND : baseAt(x, y));
const withLakeBand = (x, y) => (isLakeBand(x, y) ? LBAND : baseAt(x, y));

function makeMod(idAt, tag, hmBytes = null) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-paintcoast-" + tag + "-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="PAINTCOAST"\nreplace_path="map"\n');
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii"); bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = col(idAt(x, y)); bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (const id of [SEA, L, BAND, LAKE, LBAND, M]) {
    const c = col(id), t = TYPE[id];
    rows.push(`${id};${c.join(";")};${t};false;${t === "sea" ? "ocean" : t === "lake" ? "lakes" : "plains"};${t === "land" ? 1 : 0}`);
  }
  fs.writeFileSync(path.join(d, "map", "definition.csv"), rows.join("\n") + "\n");
  const hrs = Math.floor((8 * W + 31) / 32) * 4, hsz = hrs * H;
  let hb;
  if (hmBytes) hb = Buffer.from(hmBytes);
  else {
    hb = Buffer.alloc(54 + 1024 + hsz, 89);
    hb.write("BM", 0, "ascii"); hb.writeUInt32LE(54 + 1024 + hsz, 2); hb.writeUInt32LE(54 + 1024, 10); hb.writeUInt32LE(40, 14);
    hb.writeInt32LE(W, 18); hb.writeInt32LE(H, 22); hb.writeUInt16LE(1, 26); hb.writeUInt16LE(8, 28); hb.writeUInt32LE(0, 30); hb.writeUInt32LE(hsz, 34);
    hb.writeUInt32LE(256, 46); hb.writeUInt32LE(256, 50);
    for (let i = 0; i < 256; i++) { const o = 54 + i * 4; hb[o] = i; hb[o + 1] = i; hb[o + 2] = i; hb[o + 3] = 0; }
  }
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), hb);
  return { d, hrs, idAt };
}
const hmPath = (f) => path.join(f.d, "map", "heightmap.bmp");
const grid = (f) => { const b = fs.readFileSync(hmPath(f)); const off = b.readUInt32LE(10); const g = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = b[off + (H - 1 - y) * f.hrs + x]; return g; };
const setHeights = (f, fn) => { const p = hmPath(f), b = fs.readFileSync(p), off = b.readUInt32LE(10); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const h = fn(x, y, b[off + (H - 1 - y) * f.hrs + x]); if (h != null) b[off + (H - 1 - y) * f.hrs + x] = h; } fs.writeFileSync(p, b); };
const toLand = (f, id) => { const p = path.join(f.d, "map", "definition.csv"); fs.writeFileSync(p, fs.readFileSync(p, "utf8").split("\n").map((l) => (l.split(";")[0] === String(id) ? l.replace(/;(sea|lake);false;(ocean|lakes);0$/, ";land;false;plains;1") : l)).join("\n")); };
// the paint, as POST /api/map/paint-provinces calls it (requireDefinedColours: true), with the page's diff: one { x, y, r, g, b } a pixel
const paint = (f, pixels, id) => { const c = col(id); return md.applyProvinceDiff({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], diff: pixels.map(([x, y]) => ({ x, y, r: c[0], g: c[1], b: c[2] })), requireDefinedColours: true }); };
// …and the generator's raise of a province, as Generate land, Auto-fix and the inspector run it
const raise = (f, ids) => md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: ids, raise: true });
const pixelsWhere = (pred) => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pred(x, y)) out.push([x, y]); return out; };
const touches = (idAt, x, y, ids) => STEP4.some(([dx, dy]) => { const ny = y + dy, nx = (x + dx + W) % W; return ny >= 0 && ny < H && ids.includes(idAt(nx, ny)); });
const sameGrid = (a, b) => { let n = 0, first = null; for (let i = 0; i < W * H; i++) if (a[i] !== b[i]) { n++; if (!first) first = { x: i % W, y: Math.floor(i / W), paint: a[i], generator: b[i] }; } return { n, first }; };

// ── the world before the stroke: L and M raised by the generator itself, so their beaches are the ones Nova writes ───────────────
const base = makeMod(baseAt, "base");
const rb = raise(base, [L, M]);
ok(rb.changed === true, "fixture: the generator raised L and M", { changed: rb.changed, pixels: rb.pixels });
// a lake bed as the base game's reads: mostly 89, some of it at 90..94 (11.6% of vanilla's lake pixels, 36.6% of Millennium Dawn's),
// and its west part — the shallows a stroke along the shore covers — all 90..94, so the old 89 rule raises none of it and no seed
// at 89 nearby can take it in for the settle
setHeights(base, (x, y) => (isLakeBand(x, y) ? 90 + ((x * 7 + y * 3) % 5) : baseAt(x, y) === LAKE ? 89 + ((x * 7 + y * 3) % 6) : null));
// …and M's beach shaped by hand, as the base game's is (2.0% of its land at 90..94): not the settle's own answer, so a stroke that
// settled it would show
setHeights(base, (x, y, h) => (baseAt(x, y) === M && h <= WATERLINE ? 92 : null));
const BASE_HM = fs.readFileSync(hmPath(base));
const g0 = grid(base);
const atBase = (x, y) => g0[y * W + x];

// ── i. a band painted out into the sea ───────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ i. a band painted out into the sea comes up with the generator's beach, and takes in the old one (G1) ===");
{
  const band = pixelsWhere(isBand);
  const p = makeMod(baseAt, "i-paint", BASE_HM), g = makeMod(withBand, "i-gen", BASE_HM);
  ok(band.every(([x, y]) => atBase(x, y) <= SEA_VALUE), `precondition: the ${band.length} band pixels are sea floor`, band.length);
  const ring = pixelsWhere((x, y) => x === 40 && y >= 10 && y <= 21);
  ok(ring.every(([x, y]) => atBase(x, y) <= WATERLINE), "precondition: L's coast facing the band is the generator's beach, at or under the waterline", ring.map(([x, y]) => atBase(x, y)));
  const r = paint(p, band, L);
  ok(r && r.ok === true, "the paint applies", r && r.error);
  const hm = (r && r.heightmap) || {};
  ok(hm.changed === true && hm.raised === band.length && hm.sunk === 0, `⭐ …and raises the ${band.length} painted pixels, sinks none`, { changed: hm.changed, raised: hm.raised, sunk: hm.sunk, pixels: hm.pixels });
  toLand(g, BAND);
  const rg = raise(g, [BAND]);
  ok(rg.changed === true, "the generator raises the same pixels as a province of their own", { changed: rg.changed, pixels: rg.pixels });
  const gp = grid(p), gg = grid(g);
  const water = (x, y) => [SEA].includes(withBand(x, y));
  const wl = band.filter(([x, y]) => touches(withBand, x, y, [SEA]));
  const cliff = wl.filter(([x, y]) => gp[y * W + x] > RAMP[0]);
  console.log("     the band's middle row, west to east: " + pixelsWhere((x, y) => y === 15 && x >= 36 && x <= 50).map(([x, y]) => gp[y * W + x]).join(" "));
  ok(cliff.length === 0, `⭐⭐ the band's ${wl.length} pixels at the new waterline are the beach's ${RAMP[0]}, not a cliff 17 above the sea`, { cliff: cliff.length, e: cliff.slice(0, 4).map(([x, y]) => [x, y, gp[y * W + x]]) });
  const trench = pixelsWhere((x, y) => withBand(x, y) === L && gp[y * W + x] <= WATERLINE && !STEP4.some(([dx, dy]) => { const ny = y + dy, nx = (x + dx + W) % W; return ny >= 0 && ny < H && (water(nx, ny) || withBand(nx, ny) === LAKE); }));
  ok(trench.length === 0, "⭐⭐ …and no pixel of L is left at or under the waterline away from the water: the old beach is taken into the land", { trench: trench.length, e: trench.slice(0, 4).map(([x, y]) => [x, y, gp[y * W + x]]) });
  const s = sameGrid(gp, gg);
  ok(s.n === 0, "⭐⭐⭐ the painted coast is, byte for byte, the generator's raise of the same pixels", s);
}

// ── ii. a band painted over a lake ───────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ ii. a band painted over a lake whose bed reads 89..94 comes up out of the water (M1) ===");
{
  const band = pixelsWhere(isLakeBand);
  const p = makeMod(baseAt, "ii-paint", BASE_HM), g = makeMod(withLakeBand, "ii-gen", BASE_HM);
  const shallow = band.filter(([x, y]) => atBase(x, y) > SEA_VALUE && atBase(x, y) <= WATERLINE);
  ok(shallow.length === band.length, `precondition: all ${band.length} painted lake pixels read 90..95 — none at 89, which the old rule raised`, shallow.length);
  const r = paint(p, band, L);
  ok(r && r.ok === true, "the paint applies", r && r.error);
  const hm = (r && r.heightmap) || {};
  ok(hm.changed === true && hm.raised === band.length && hm.sunk === 0, `⭐ …and raises all ${band.length} of them, the shallow ones too`, { changed: hm.changed, raised: hm.raised, sunk: hm.sunk });
  toLand(g, LBAND);
  const rg = raise(g, [LBAND]);
  ok(rg.changed === true, "the generator raises the same pixels as a province of their own", { changed: rg.changed, pixels: rg.pixels });
  const gp = grid(p), gg = grid(g);
  // the lake that is left is withLakeBand's LAKE: the band was LAKE too before the stroke, so every band pixel touched the old lake
  const inland = band.filter(([x, y]) => !touches(withLakeBand, x, y, [LAKE]));
  const under = inland.filter(([x, y]) => gp[y * W + x] <= WATERLINE);
  ok(inland.length > 0 && under.length === 0, `⭐⭐ none of the ${inland.length} painted pixels away from the lake that is left is still under the waterline`, { inland: inland.length, under: under.length, e: under.slice(0, 4).map(([x, y]) => [x, y, atBase(x, y), gp[y * W + x]]) });
  const s = sameGrid(gp, gg);
  ok(s.n === 0, "⭐⭐⭐ the painted lake shore is, byte for byte, the generator's raise of the same pixels", s);
}

// ── iii. THE CONTROL: land over land writes nothing ──────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⚠️⚠️ iii. THE CONTROL: land painted over land writes nothing, its beach included ===");
{
  const f = makeMod(baseAt, "iii", BASE_HM);
  const px = pixelsWhere((x, y) => x >= 9 && x <= 11 && y >= 6 && y <= 25);   // M's east columns, top and bottom rows its beach
  const beach = px.filter(([x, y]) => atBase(x, y) > SEA_VALUE && atBase(x, y) <= WATERLINE);
  ok(beach.length > 0, `precondition: ${beach.length} of the ${px.length} pixels are M's beach, at 90..95 and facing the sea`, beach.length);
  const mt = fs.statSync(hmPath(f)).mtimeMs;
  const r = paint(f, px, L);
  ok(r && r.ok === true, "the paint applies", r && r.error);
  ok(!!(r && r.heightmap && r.heightmap.changed === false), "⭐⭐ …and the heightmap writer reports nothing to write", r && r.heightmap);
  ok(Buffer.compare(fs.readFileSync(hmPath(f)), BASE_HM) === 0 && fs.statSync(hmPath(f)).mtimeMs === mt, "⭐⭐ …and heightmap.bmp is not touched");
}

// ── iv. the sink is as it was ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== iv. water painted over land goes down to the sea floor, and nothing else moves ===");
{
  const f = makeMod(baseAt, "iv", BASE_HM);
  const px = pixelsWhere((x, y) => x >= 36 && x <= 40 && y >= 6 && y <= 8);
  const r = paint(f, px, SEA);
  ok(r && r.ok === true, "the paint applies", r && r.error);
  const g = grid(f);
  const above = px.filter(([x, y]) => atBase(x, y) > SEA_VALUE).length;
  ok(!!(r && r.heightmap && r.heightmap.sunk === above && r.heightmap.raised === 0), `the ${above} painted pixels above 89 are sunk, none raised`, r && r.heightmap);
  ok(px.every(([x, y]) => g[y * W + x] === Math.min(atBase(x, y), SEA_VALUE)), "⭐ …each to 89, or kept where it was already lower");
  const moved = pixelsWhere((x, y) => !px.some(([a, b]) => a === x && b === y) && g[y * W + x] !== atBase(x, y));
  ok(moved.length === 0, "⭐ …and no pixel the stroke did not paint has moved", moved.slice(0, 4));
}

// ── v. both ways in one stroke ───────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ v. one stroke that sinks and raises: the settle measures from the water the stroke leaves ===");
{
  // the cut is carved into L's standing ground one pixel behind its beach: its pixels stand above the waterline until the stroke
  // sinks them, so the beach between it and the band is a shore only once they have gone down
  const band = pixelsWhere(isBand), cut = pixelsWhere((x, y) => x >= 35 && x <= 39 && y >= 14 && y <= 24);
  ok(cut.every(([x, y]) => atBase(x, y) > WATERLINE), `precondition: the ${cut.length} pixels the stroke cuts stand above the waterline`, cut.filter(([x, y]) => atBase(x, y) <= WATERLINE).length);
  const p = makeMod(baseAt, "v-paint", BASE_HM), g = makeMod(withBand, "v-gen", BASE_HM);
  const cc = col(SEA), lc = col(L);
  const r = md.applyProvinceDiff({ modRoot: p.d, gameRoot: NOGAME, dependencyRoots: [], requireDefinedColours: true,
    diff: [...band.map(([x, y]) => ({ x, y, r: lc[0], g: lc[1], b: lc[2] })), ...cut.map(([x, y]) => ({ x, y, r: cc[0], g: cc[1], b: cc[2] }))] });
  ok(r && r.ok === true && r.heightmap && r.heightmap.raised === band.length && r.heightmap.sunk > 0, "the stroke raises the band and sinks the cut", r && r.heightmap);
  // the generator's answer: the cut first, then the band raised against it
  const rc = paint(g, cut, SEA);
  toLand(g, BAND);
  const rg = raise(g, [BAND]);
  ok(rc.ok === true && rg.changed === true, "the generator's fixture: the cut, then the band raised", { cut: rc.ok, raise: rg.changed });
  const s = sameGrid(grid(p), grid(g));
  ok(s.n === 0, "⭐⭐ the band beside the cut is the generator's raise against the water the cut left", s);
}

// ── vi. a model on the old beach ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== vi. a building standing on the old beach the settle moved is re-seated on the ground it stands on now ===");
{
  const p = makeMod(baseAt, "vi", BASE_HM);
  const at = [40, 15], still = [30, 8];
  const zOf = (y) => (md.pixelYToBuildingZ ? md.pixelYToBuildingZ(H, y) : H - 1 - y) + 0.5;
  const row = ([x, y]) => `1;industrial_complex;${(x + 0.5).toFixed(2)};${md.modelYForHeight(atBase(x, y)).toFixed(2)};${zOf(y).toFixed(2)};0.00;0`;
  fs.writeFileSync(path.join(p.d, "map", "buildings.txt"), row(at) + "\r\n" + row(still) + "\r\n");
  const r = paint(p, pixelsWhere(isBand), L);
  ok(r && r.ok === true, "the paint applies", r && r.error);
  const g = grid(p);
  ok(g[at[1] * W + at[0]] !== atBase(at[0], at[1]), "precondition: the old beach under the first row moved", { before: atBase(at[0], at[1]), after: g[at[1] * W + at[0]] });
  const lines = fs.readFileSync(path.join(p.d, "map", "buildings.txt"), "utf8").split("\r\n");
  const y0 = parseFloat(lines[0].split(";")[3]), y1 = parseFloat(lines[1].split(";")[3]);
  ok(Math.abs(y0 - md.modelYForHeight(g[at[1] * W + at[0]])) < 0.006, "⭐ the building on the moved beach stands on the ground it has now", { y: y0, ground: md.modelYForHeight(g[at[1] * W + at[0]]) });
  ok(lines[1] === row(still), "…and the one inland, whose ground did not move, is as it was", lines[1]);
}

// ── vii. the wiring ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== vii. one settle for both writers, read from the code ===");
{
  const SRC = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const body = (name) => { const a = SRC.indexOf("function " + name + "("); return a < 0 ? "" : SRC.slice(a, SRC.indexOf("\nfunction ", a + 10)); };
  const lp = body("levelPaintedPixels"), wp = body("writeProvinceHeightmap"), ad = body("applyProvinceDiff");
  ok(/settleRaisedHeights\(/.test(lp) && /settleRaisedHeights\(/.test(wp), "⭐ levelPaintedPixels and writeProvinceHeightmap both call settleRaisedHeights", { paint: /settleRaisedHeights\(/.test(lp), raise: /settleRaisedHeights\(/.test(wp) });
  ok(lp.length > 0 && !/HEIGHTMAP_LAND_VALUE/.test(lp), "⭐ …and the paint no longer writes the flat land value", lp.length);
  ok(/levelPaintedPixels\(\{[^}]*\bbefore\b/.test(ad), "applyProvinceDiff hands the paint's writer what each pixel was before the stroke");
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n${fails.length ? "FAILED" : "PASSED"} ${pass}/${pass + fails.length}`);
if (fails.length) { for (const f of fails) console.log("  ✗ " + f); process.exit(1); }
