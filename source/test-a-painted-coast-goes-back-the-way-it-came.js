// ⛔ #a-painted-coast-goes-back-the-way-it-came — a coast painted out and painted back is the coast it was.
//
// A band painted out from a coast is raised by the raise's own settle (#a-painted-coast-rises-like-the-generators), which takes the old
// beach in: the ring of 94 that faced the water is land inside the land then, settled to the field at its new depth. Painted back, the
// band went down to the sea floor's 89 and nothing else moved, so the old beach faced the water again from where the settle had lifted
// it. On a copy of the base game a plains coast painted 5 px out and back stood 36 of its 56 shore pixels at 104 where they had stood at
// 94, with steps of 15 into the water on 65 edges against a median of 5 before; before the paint's raise settled, the same round trip had
// put every byte back (review of the tools' ground, G1). Now the paint keeps what its raise moved, outside the mod — each pixel with the
// height it held and the height the raise wrote — and a later stroke puts back a pixel that still holds what the raise wrote: the water
// when it goes back under water, the old beach when a walk from the new water reaches it.
//   i    the round trip on the generator's own coast is byte for byte the map it started from, and the record is outside the mod
//   ii   …where the beach was two pixels deep · iii …on a coast that stands over 94 on its own, over a sea floor that is not 89
//   iv   painted back in two strokes: the beach still inside the land keeps the height that keeps it out of the water
//   v    a height written over since is never put back · vi THE CONTROL: a cut into land no paint raised moves only what it painted
//   vii  a record that cannot be read is left as it is · viii a building on the beach put back stands on it
//   ix   the normal map is lit from the beach put back · x the wiring
//   xi   ⛔ painted out in two Saves and back one at a time: each paint back leaves the coast the Save before it left
//   xii  a stroke that paints back and paints out at once · xiii water the raise left at its own height goes back to it
//   xiv  ⛔ painted back one stretch of the coast at a time: only the beach the water has come back to goes back with it
//   xv   a band one pixel thin: the coast behind it is not the coast in front of it
//   xvi  THE CONTROL: water repainted as other water brings no water back, and puts nothing back
//   xvii ⛔ a stroke that moves no height and brings no water back does not read the record: 3.1-3.4 s for one land-to-land pixel at 114 MB (F2)
//   xviii ⛔ the record holds so many pixels and no more, the oldest forgotten first (F2)
//   xix  a record that cannot be written leaves one temporary file, not one a stroke
//   xx   ⛔ Delete map and Generate land forget it: what a raise moved says nothing about the world after them (B1)
//   xxi  ⛔ a baseline carries the record of the map it holds, and a restore puts it back with that map (H1)
//   xxii ⛔ the Save line says what only the JSON said: a heightmap.bmp that could not be written (W2), a record that could not be read or written (N1)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-paintback-"));
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");   // the record of what a paint raised is kept here, outside every mod below
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 500) : "")); }
};
const NOGAME = path.join(os.tmpdir(), "__no_game_painted_coast_back__");
const RAMP = md.HEIGHTMAP_BEACH_RAMP;
const SEA_VALUE = 89, WATERLINE = md.HEIGHTMAP_SEA_LEVEL;
const STEP4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const W = 64, H = 32, NW = W / 2, NH = H / 2;
const SEA = 1, L = 2, LAKE = 4, M = 6;
const TYPE = { [SEA]: "sea", [L]: "land", [LAKE]: "lake", [M]: "land" };
const col = (id) => [(id * 37) & 255, (id * 91 + 11) & 255, (id * 53 + 7) & 255];
const inBox = (x, y, x0, x1, y0, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
// the world: L a block of land with M beside it to the west and a lake inside it, sea round them
const baseAt = (x, y) => inBox(x, y, 18, 27, 11, 20) ? LAKE : inBox(x, y, 12, 40, 6, 25) ? L : inBox(x, y, 4, 11, 6, 25) ? M : SEA;
const isBand = (x, y) => inBox(x, y, 41, 48, 10, 21);        // painted out into the sea off L's east coast, and back
const isCut = (x, y) => inBox(x, y, 33, 35, 14, 16);         // sea painted into L's ground east of the lake
const STALE_NORMAL = [230, 150, 90];                         // B, G, R: what world_normal.bmp holds before the stroke

let modN = 0;
function makeMod(tag, hmBytes = null) {
  const d = path.join(ROOT, "mods", `${++modN}-${tag}`);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="PAINTBACK"\nreplace_path="map"\n');
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii"); bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = col(baseAt(x, y)); bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (const id of [SEA, L, LAKE, M]) {
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
  return { d, hrs };
}
const hmPath = (f) => path.join(f.d, "map", "heightmap.bmp");
const grid = (f) => { const b = fs.readFileSync(hmPath(f)); const off = b.readUInt32LE(10); const g = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = b[off + (H - 1 - y) * f.hrs + x]; return g; };
const setHeights = (f, fn) => { const p = hmPath(f), b = fs.readFileSync(p), off = b.readUInt32LE(10); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const h = fn(x, y, b[off + (H - 1 - y) * f.hrs + x]); if (h != null) b[off + (H - 1 - y) * f.hrs + x] = h; } fs.writeFileSync(p, b); };
// the paint, as POST /api/map/paint-provinces calls it (requireDefinedColours: true), with the page's diff: one { x, y, r, g, b } a pixel
const paint = (f, pixels, id) => { const c = col(id); return md.applyProvinceDiff({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], diff: pixels.map(([x, y]) => ({ x, y, r: c[0], g: c[1], b: c[2] })), requireDefinedColours: true }); };
const raise = (f, ids) => md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: ids, raise: true });
const pixelsWhere = (pred) => { const out = []; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (pred(x, y)) out.push([x, y]); return out; };
const diffCount = (a, b) => { let n = 0, first = null; for (let i = 0; i < W * H; i++) if (a[i] !== b[i]) { n++; if (!first) first = { x: i % W, y: Math.floor(i / W), now: a[i], was: b[i] }; } return { n, first }; };
const at = (g, x, y) => g[y * W + x];
const row = (g, y, x0, x1) => { const o = []; for (let x = x0; x <= x1; x++) o.push(g[y * W + x]); return o.join(" "); };
const recordOf = (f) => { try { return JSON.parse(fs.readFileSync(md.paintedHeightsRecordPath(f.d), "utf8")); } catch (_) { return null; } };
const filesUnder = (dir) => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.push(path.relative(dir, p).split(path.sep).join("/")); } }; if (fs.existsSync(dir)) walk(dir); return out.sort(); };
const band = pixelsWhere(isBand);
const ring = pixelsWhere((x, y) => x === 40 && y >= 10 && y <= 21);
// no pixel of L at or under the waterline that touches no water: a trench the game would draw as water inside the land
const trenchIn = (g, isWater) => pixelsWhere((x, y) => baseAt(x, y) === L && !isWater(x, y) && at(g, x, y) <= WATERLINE
  && !STEP4.some(([dx, dy]) => { const ny = y + dy, nx = (x + dx + W) % W; return ny >= 0 && ny < H && (isWater(nx, ny) || baseAt(nx, ny) === LAKE); }));

// ── the world before any stroke: L and M raised by the generator itself, so their beaches are the ones Nova writes ──────────────────
const base = makeMod("base");
const rb = raise(base, [L, M]);
ok(rb.changed === true, "fixture: the generator raised L and M", { changed: rb.changed, pixels: rb.pixels });
const BASE_HM = fs.readFileSync(hmPath(base));
const g0 = grid(base);

// ── i. the round trip ────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ i. a band painted out from the generator's coast and painted back leaves the map as it found it (G1) ===");
{
  const f = makeMod("i", BASE_HM);
  ok(ring.every(([x, y]) => at(g0, x, y) === RAMP[0]), `precondition: L's coast facing the band is the generator's beach, ${RAMP[0]}`, ring.map(([x, y]) => at(g0, x, y)));
  const out = paint(f, band, L);
  ok(out && out.ok === true && out.heightmap && out.heightmap.raised === band.length, "the band painted out is raised", out && (out.error || out.heightmap));
  const g1 = grid(f);
  ok(ring.every(([x, y]) => at(g1, x, y) > WATERLINE), `precondition: the raise took the old beach in — all ${ring.length} of its pixels stand above the waterline now`, ring.map(([x, y]) => at(g1, x, y)));
  const recPath = md.paintedHeightsRecordPath(f.d), rec = recordOf(f);
  ok(!!rec && rec.entries.length === band.length + ring.length && rec.entries.filter((e) => e[2][0][0] === "b").length === ring.length,
    `⭐ the paint recorded what its raise moved: the ${band.length} band pixels it took from the water and the ${ring.length} of the old beach`, rec && { n: rec.entries.length, b: rec.entries.filter((e) => e[2][0][0] === "b").length });
  ok(path.resolve(recPath).toLowerCase().startsWith(path.resolve(process.env.NOVA_HOME_DIR, ".nova").toLowerCase() + path.sep)
    && !path.resolve(recPath).toLowerCase().startsWith(path.resolve(f.d).toLowerCase() + path.sep) && filesUnder(f.d).every((r) => !/painted|heights\.json/i.test(r)),
    "⭐ …outside the mod, under Nova's own folder: nothing of it ships with the mod", { recPath, mod: filesUnder(f.d) });
  const back = paint(f, band, SEA);
  ok(back && back.ok === true && back.heightmap && back.heightmap.sunk === band.length && back.heightmap.raised === 0, "…and painted back, it goes under, every pixel of it", back && (back.error || back.heightmap));
  const g2 = grid(f);
  console.log(`     row 15, x 36..44: before ${row(g0, 15, 36, 44)} · out ${row(g1, 15, 36, 44)} · back ${row(g2, 15, 36, 44)}`);
  ok(ring.every(([x, y]) => at(g2, x, y) === RAMP[0]), `⭐⭐ the old beach faces the water again at ${RAMP[0]}, not from where the raise had lifted it`, ring.map(([x, y]) => at(g2, x, y)));
  const s = diffCount(g2, g0);
  ok(s.n === 0, "⭐⭐⭐ the heightmap is, byte for byte, the one the stroke started from", s);
  ok(back.heightmap.pixels === band.length + ring.length && back.heightmap.putBack && back.heightmap.putBack.beach === ring.length,
    `…and the answer counts what moved: the band, and the ${ring.length} pixels of the old beach put back`, { pixels: back.heightmap.pixels, putBack: back.heightmap.putBack });
  const after = recordOf(f);
  ok(!!after && after.entries.length === 0, "…and the record holds nothing more for them: what it held has been put back", after && after.entries.length);
}

// ── ii. a two-pixel beach ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ii. where the old beach was two pixels deep, both come back ===");
{
  const f = makeMod("ii", BASE_HM);
  // a fringe behind the shore at the waterline, as 2.2% of the base game's land is: the raise takes it in with the 94 in front of it
  setHeights(f, (x, y) => (x === 39 && y >= 10 && y <= 21 ? WATERLINE : null));
  const before = grid(f);
  paint(f, band, L);
  const out = grid(f);
  ok(pixelsWhere((x, y) => x === 39 && y >= 10 && y <= 21).every(([x, y]) => at(out, x, y) > WATERLINE), "precondition: the paint-out lifted the fringe too");
  paint(f, band, SEA);
  const s = diffCount(grid(f), before);
  ok(s.n === 0, "⭐⭐ painted back, the heightmap is byte for byte the one it started from, the fringe at its 95 again", s);
}

// ── iii. a coast that stands over 94 on its own ──────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ iii. a coast that stands over 94 on its own, over a sea floor that is not 89, comes back as it was ===");
{
  const f = makeMod("iii", BASE_HM);
  // Millennium Dawn's mountain coast reads 93..99 at the waterline; its sea floor is not all 89 either
  const standing = (y) => y % 3 === 0;   // a third of the shore stands over the waterline, out of any raise's reach
  setHeights(f, (x, y) => (x === 40 && y >= 10 && y <= 21 ? (standing(y) ? 96 + (y % 4) : 93 + (y % 3)) : isBand(x, y) ? 92 : null));
  const before = grid(f);
  const tall = ring.filter(([, y]) => standing(y));
  ok(tall.length > 0 && tall.every(([x, y]) => at(before, x, y) > WATERLINE), `precondition: ${tall.length} of the shore's pixels stand over the waterline: land the game draws as land`);
  const out = paint(f, band, L);
  const g1 = grid(f);
  ok(out && out.ok === true && tall.every(([x, y]) => at(g1, x, y) === at(before, x, y)), "the paint-out leaves the shore that stands as it is: only the beach under the waterline is taken in");
  const back = paint(f, band, SEA);
  const g2 = grid(f);
  ok(tall.every(([x, y]) => at(g2, x, y) === at(before, x, y)), "⭐⭐ painted back, the shore that stood keeps every height: nothing brought it down to the base game's 94", tall.map(([x, y]) => [at(before, x, y), at(g2, x, y)]));
  ok(band.every(([x, y]) => at(g2, x, y) === 92) && back.heightmap && back.heightmap.putBack && back.heightmap.putBack.water === band.length,
    `⭐ …the band goes back down to the sea floor it had, 92, not to the 89 the sink writes for water that was land`, { putBack: back.heightmap && back.heightmap.putBack, e: band.slice(0, 3).map(([x, y]) => at(g2, x, y)) });
  const s = diffCount(g2, before);
  ok(s.n === 0, "⭐⭐⭐ …and the heightmap is byte for byte the one it started from", s);
}

// ── iv. painted back in two strokes ──────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== iv. painted back in two strokes: the beach still inside the land keeps the height that keeps it out of the water ===");
{
  const f = makeMod("iv", BASE_HM);
  paint(f, band, L);
  const g1 = grid(f);
  const outer = band.filter(([x]) => x >= 46), inner = band.filter(([x]) => x < 46);
  paint(f, outer, SEA);
  const g2 = grid(f);
  const isWater2 = (x, y) => baseAt(x, y) === SEA && !(isBand(x, y) && x < 46);
  ok(ring.every(([x, y]) => at(g2, x, y) === at(g1, x, y)) && inner.every(([x, y]) => at(g2, x, y) === at(g1, x, y)),
    "⭐ the old beach and the band still land keep the heights the raise gave them: neither faces the water yet");
  ok(trenchIn(g2, isWater2).length === 0, "⭐ …so no pixel of the land is under the waterline away from the water", trenchIn(g2, isWater2).slice(0, 4));
  ok(outer.every(([x, y]) => at(g2, x, y) === at(g0, x, y)), "…and the columns painted back are back on their sea floor");
  paint(f, inner, SEA);
  const s = diffCount(grid(f), g0);
  ok(s.n === 0, "⭐⭐ the second stroke takes the rest back, and the heightmap is byte for byte the one the first stroke started from", s);
}

// ── v. a height written over since ───────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== v. a height written over since the raise is never put back ===");
{
  const f = makeMod("v", BASE_HM);
  paint(f, band, L);
  const edited = ring.filter(([, y]) => y >= 14 && y <= 16);   // the modder's own edit to three pixels of the old beach, after the raise
  setHeights(f, (x, y) => (edited.some(([a, b]) => a === x && b === y) ? 120 : null));
  paint(f, band, SEA);
  const g = grid(f);
  ok(edited.every(([x, y]) => at(g, x, y) === 120), "⭐⭐ the three pixels written over since keep what they were written: the record only puts back what still holds the raise's height", edited.map(([x, y]) => at(g, x, y)));
  ok(ring.filter(([, y]) => y < 14 || y > 16).every(([x, y]) => at(g, x, y) === RAMP[0]), "…and the rest of the old beach is put back");
  // …nor is the band's own: a pixel of it written over since goes under as any land does, to the sink's 89, not to the 92 the raise found
  const f3 = makeMod("v3", BASE_HM);
  setHeights(f3, (x, y) => (isBand(x, y) ? 92 : null));
  paint(f3, band, L);
  setHeights(f3, (x, y) => (x === 44 && y === 15 ? 120 : null));
  paint(f3, band, SEA);
  const g3b = grid(f3);
  ok(at(g3b, 44, 15) === SEA_VALUE && at(g3b, 45, 15) === 92, `⭐ …and a pixel of the band written over since goes under to the sink's ${SEA_VALUE}, its neighbour back to the 92 it had`, [at(g3b, 44, 15), at(g3b, 45, 15)]);
  // …nor is a pixel recorded under a province it no longer belongs to: L's beach is M's now, at the height the raise gave it
  const f2 = makeMod("v2", BASE_HM);
  paint(f2, band, L);
  const g1 = grid(f2);
  paint(f2, ring, M);                 // the old beach handed to M, land to land, which moves no height
  paint(f2, band, SEA);
  const g3 = grid(f2);
  ok(ring.every(([x, y]) => at(g3, x, y) === at(g1, x, y)), "⭐ …and a pixel recorded under one province and painted another's since keeps its height", ring.map(([x, y]) => at(g3, x, y)));
}

// ── vi. THE CONTROL: a cut into land no paint raised ─────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⚠️⚠️ vi. THE CONTROL: a cut into land no paint raised moves what it painted and nothing else ===");
{
  const f = makeMod("vi", BASE_HM);
  const cut = pixelsWhere(isCut);
  const r = paint(f, cut, SEA);
  ok(r && r.ok === true && r.heightmap && r.heightmap.sunk === cut.length && !r.heightmap.putBack, "the cut goes under, and nothing is put back", r && (r.error || r.heightmap));
  const g = grid(f);
  const moved = pixelsWhere((x, y) => !isCut(x, y) && at(g, x, y) !== at(g0, x, y));
  ok(moved.length === 0, "⭐⭐ …and no pixel the stroke did not paint has moved: the ground beside it is not a beach any raise took in", moved.slice(0, 4));
  ok(recordOf(f) === null, "…and no record is written for a stroke that raised nothing and put nothing back", recordOf(f));
}

// ── vii. a record that cannot be read ────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== vii. a record that cannot be read is left as it is, and the paint still works ===");
{
  const f = makeMod("vii", BASE_HM);
  const p = md.paintedHeightsRecordPath(f.d);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "{ not json");
  const out = paint(f, band, L), back = paint(f, band, SEA);
  ok(out && out.ok === true && back && back.ok === true && back.heightmap && back.heightmap.sunk === band.length, "both strokes apply");
  ok(fs.readFileSync(p, "utf8") === "{ not json", "⭐ the record that could not be read is byte for byte as it was: nothing wrote over it");
  ok(!!(out.heightmap.heightsRecord && out.heightmap.heightsRecord.unreadable && back.heightmap.heightsRecord && back.heightmap.heightsRecord.unreadable), "…and each answer says the record could not be read", [out.heightmap.heightsRecord, back.heightmap.heightsRecord]);
}

// ── viii. a building on the beach put back ───────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== viii. a building standing on the old beach is re-seated when the beach is put back ===");
{
  const f = makeMod("viii", BASE_HM);
  const on = [40, 15], still = [30, 8];
  const zOf = (y) => md.pixelYToBuildingZ(H, y) + 0.5;
  const line = ([x, y], h) => `1;industrial_complex;${(x + 0.5).toFixed(2)};${md.modelYForHeight(h).toFixed(2)};${zOf(y).toFixed(2)};0.00;0`;
  fs.writeFileSync(path.join(f.d, "map", "buildings.txt"), line(on, at(g0, on[0], on[1])) + "\r\n" + line(still, at(g0, still[0], still[1])) + "\r\n");
  paint(f, band, L);
  const y1 = parseFloat(fs.readFileSync(path.join(f.d, "map", "buildings.txt"), "utf8").split("\r\n")[0].split(";")[3]);
  ok(Math.abs(y1 - md.modelYForHeight(at(grid(f), on[0], on[1]))) < 0.006, "precondition: on the beach the raise lifted, it stood on the lifted ground");
  paint(f, band, SEA);
  const lines = fs.readFileSync(path.join(f.d, "map", "buildings.txt"), "utf8").split("\r\n");
  const y2 = parseFloat(lines[0].split(";")[3]);
  ok(Math.abs(y2 - md.modelYForHeight(RAMP[0])) < 0.006 && lines[0].split(";").filter((_, i) => i !== 3).join(";") === line(on, RAMP[0]).split(";").filter((_, i) => i !== 3).join(";"),
    `⭐ …and with the beach put back it stands on the beach's ${RAMP[0]} again`, { line: lines[0], ground: md.modelYForHeight(RAMP[0]) });
  ok(lines[1] === line(still, at(g0, still[0], still[1])), "…and the one inland is as it was", lines[1]);
}

// ── ix. the normal map ───────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ix. the normal map is lit from a deep beach put back, as far in as it went ===");
{
  const f = makeMod("ix", BASE_HM);
  // a beach four pixels deep, all of it under the waterline, so the raise takes it in four pixels back from the band
  setHeights(f, (x, y) => (x >= 37 && x <= 39 && y >= 10 && y <= 21 ? WATERLINE : null));
  const before = grid(f);
  const wrs = NW * 3, wn = Buffer.alloc(54 + wrs * NH);
  wn.write("BM", 0, "ascii"); wn.writeUInt32LE(wn.length, 2); wn.writeUInt32LE(54, 10); wn.writeUInt32LE(40, 14);
  wn.writeInt32LE(NW, 18); wn.writeInt32LE(NH, 22); wn.writeUInt16LE(1, 26); wn.writeUInt16LE(24, 28); wn.writeUInt32LE(wrs * NH, 34);
  for (let i = 0; i < NW * NH; i++) { wn[54 + i * 3] = STALE_NORMAL[0]; wn[54 + i * 3 + 1] = STALE_NORMAL[1]; wn[54 + i * 3 + 2] = STALE_NORMAL[2]; }
  const wnPath = path.join(f.d, "map", "world_normal.bmp");
  paint(f, band, L);
  fs.writeFileSync(wnPath, wn);          // the normal map as a stale one, between the strokes, so what the paint-back lights shows
  const back = paint(f, band, SEA);
  ok(back && back.ok === true && diffCount(grid(f), before).n === 0, "the deep beach is put back, byte for byte");
  const nb = fs.readFileSync(wnPath);
  const stale = (X, Y) => { const o = 54 + (NH - 1 - Y) * wrs + X * 3; return nb[o] === STALE_NORMAL[0] && nb[o + 1] === STALE_NORMAL[1] && nb[o + 2] === STALE_NORMAL[2]; };
  // half-resolution column 18 holds x 36..37: two columns in from the band's own (20..24), past the one ring its pixels light
  const deep = [];
  for (let Y = 5; Y <= 10; Y++) deep.push([18, Y]);
  ok(deep.every(([X, Y]) => !stale(X, Y)), "⭐⭐ the normal map over the beach put back four pixels in from the band is lit from it", deep.filter(([X, Y]) => stale(X, Y)));
  ok(stale(3, 3) && stale(30, 14), "…and a pixel far from anything that moved keeps what it had");
}

// ── xi. painted out in two Saves ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ xi. painted out in two Saves and back one at a time: each paint back leaves the coast the Save before it left ===");
{
  const band2 = pixelsWhere((x, y) => inBox(x, y, 49, 56, 10, 21));
  const edge1 = pixelsWhere((x, y) => x === 48 && y >= 10 && y <= 21);   // the first band's own coast, which the second raise takes in
  const f = makeMod("xi", BASE_HM);
  paint(f, band, L);
  const g1 = grid(f);
  ok(edge1.every(([x, y]) => at(g1, x, y) === RAMP[0]), `precondition: the first band's coast is the generator's beach, ${RAMP[0]}`, edge1.map(([x, y]) => at(g1, x, y)));
  paint(f, band2, L);
  const g2 = grid(f);
  const inner1 = edge1.filter(([, y]) => y > 10 && y < 21);   // the two at its ends still face the water north and south of the second band
  ok(inner1.every(([x, y]) => at(g2, x, y) > WATERLINE), "precondition: the second raise took that coast in, as the first took in the old beach", edge1.map(([x, y]) => at(g2, x, y)));
  const back2 = paint(f, band2, SEA);
  const g3 = grid(f);
  ok(back2 && back2.ok === true && edge1.every(([x, y]) => at(g3, x, y) === RAMP[0]), `⭐⭐ the second band painted back: the first band's coast faces the water at ${RAMP[0]} again, not from where the second raise lifted it`, edge1.map(([x, y]) => at(g3, x, y)));
  const s3 = diffCount(g3, g1);
  ok(s3.n === 0, "⭐⭐⭐ …and the heightmap is byte for byte the one the second stroke started from", s3);
  paint(f, band, SEA);
  const s4 = diffCount(grid(f), g0);
  ok(s4.n === 0, "⭐⭐⭐ …and the first band painted back leaves the one the first stroke started from", s4);
  ok(recordOf(f).entries.length === 0, "…with nothing left in the record", recordOf(f).entries.length);
  // …both bands back in one Save
  const f2 = makeMod("xi2", BASE_HM);
  paint(f2, band, L); paint(f2, band2, L);
  paint(f2, band.concat(band2), SEA);
  const s5 = diffCount(grid(f2), g0);
  ok(s5.n === 0, "⭐⭐ both bands back in one Save: byte for byte the map before either", s5);
  // …the first band back while the second stands: a channel, and the second band's own ground stays as it is until its turn comes
  const f3 = makeMod("xi3", BASE_HM);
  paint(f3, band, L); paint(f3, band2, L);
  const g6 = grid(f3);
  paint(f3, band, SEA);
  const g7 = grid(f3);
  ok(ring.every(([x, y]) => at(g7, x, y) === RAMP[0]), "⭐ the first band back while the second stands: the old beach faces its water again", ring.map(([x, y]) => at(g7, x, y)));
  ok(band2.every(([x, y]) => at(g7, x, y) === at(g6, x, y)), "⭐ …and the second band, land still, keeps every height");
  paint(f3, band2, SEA);
  const s8 = diffCount(grid(f3), g0);
  ok(s8.n === 0, "⭐⭐ …and the second band after it: byte for byte the map before either", s8);
}

// ── xii. a stroke that does both ─────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== xii. one Save that paints a band back and paints another out beside it raises against the ground it put back ===");
{
  const south = pixelsWhere((x, y) => inBox(x, y, 41, 48, 22, 25));   // the coast just south of the band, with the same old beach behind it
  const painted = (px, id) => { const c = col(id); return px.map(([x, y]) => ({ x, y, r: c[0], g: c[1], b: c[2] })); };
  const f = makeMod("xii", BASE_HM);
  paint(f, band, L);
  const r = md.applyProvinceDiff({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], diff: painted(band, SEA).concat(painted(south, L)), requireDefinedColours: true });
  ok(r && r.ok === true && r.heightmap && r.heightmap.sunk === band.length && r.heightmap.raised === south.length, "the band goes under and the other comes up, in one answer", r && (r.error || r.heightmap));
  const alone = makeMod("xii-alone", BASE_HM);
  paint(alone, south, L);
  const s = diffCount(grid(f), grid(alone));
  ok(s.n === 0, "⭐⭐ …and the map is byte for byte what the second band alone makes of the map the first stroke started from", s);
  paint(f, south, SEA);
  const b = diffCount(grid(f), g0);
  ok(b.n === 0, "⭐⭐ …and that band painted back leaves the map the first stroke started from", b);
}

// ── xiii. water the raise left where it stood ────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== xiii. a pixel of the band the raise left at the height it had goes back to it too ===");
{
  const f = makeMod("xiii", BASE_HM);
  // the band's outer column reads the base game's own shallows at 94, which is what the raise writes on a shore: it does not move
  setHeights(f, (x, y) => (isBand(x, y) && x === 48 ? RAMP[0] : null));
  const before = grid(f);
  paint(f, band, L);
  const g1 = grid(f);
  const edge = band.filter(([x, y]) => x === 48 && y > 10 && y < 21);
  ok(edge.every(([x, y]) => at(g1, x, y) === RAMP[0]), `precondition: the raise left those pixels at ${RAMP[0]}`, edge.map(([x, y]) => at(g1, x, y)));
  paint(f, band, SEA);
  const s = diffCount(grid(f), before);
  ok(s.n === 0, `⭐⭐ painted back they are the water they were, at ${RAMP[0]}, not the sink's ${SEA_VALUE}: byte for byte`, s);
  // …and a sea pixel that stands over the waterline, which the raise never starts from: the base game has 16 in 91,937
  const f2 = makeMod("xiii2", BASE_HM);
  const tall = band.filter(([x, y]) => x === 44 && y === 15);
  setHeights(f2, (x, y) => (x === 44 && y === 15 ? 96 : null));
  const before2 = grid(f2);
  paint(f2, band, L);
  ok(tall.every(([x, y]) => at(grid(f2), x, y) === 96), "precondition: the sea pixel standing at 96 is left where it stands by the raise");
  paint(f2, band, SEA);
  const s2 = diffCount(grid(f2), before2);
  ok(s2.n === 0, "⭐ …and painted back it stands at 96 again, not the sink's 89: byte for byte", s2);
}

// ── xiv. one stretch of the coast at a time ──────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ xiv. painted back one stretch of the coast at a time: only the beach the water has come back to goes back with it ===");
{
  const f = makeMod("xiv", BASE_HM);
  paint(f, band, L);
  const g1 = grid(f);
  const north = band.filter(([, y]) => y <= 15), south = band.filter(([, y]) => y > 15);
  const faced = ring.filter(([, y]) => y <= 15), behind = ring.filter(([, y]) => y > 15);
  const back = paint(f, north, SEA);
  const g2 = grid(f);
  const isWater2 = (x, y) => baseAt(x, y) === SEA && !(isBand(x, y) && y > 15);
  ok(back && back.ok === true && faced.every(([x, y]) => at(g2, x, y) === RAMP[0]), `⭐ the stretch of old beach the water came back to is at ${RAMP[0]} again`, faced.map(([x, y]) => at(g2, x, y)));
  ok(behind.every(([x, y]) => at(g2, x, y) === at(g1, x, y)), "⭐⭐ …and the stretch still behind the band keeps the height that keeps it out of the water: the walk along the beach does not take it", behind.map(([x, y]) => [at(g1, x, y), at(g2, x, y)]));
  ok(trenchIn(g2, isWater2).length === 0, "⭐⭐ …so no pixel of the land is under the waterline away from the water", trenchIn(g2, isWater2).slice(0, 6));
  paint(f, south, SEA);
  const s = diffCount(grid(f), g0);
  ok(s.n === 0, "⭐⭐ …and the other stretch after it: byte for byte the map the first stroke started from", s);
}

// ── xv. a band one pixel thin ────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== xv. a band one pixel thin, a second one out from it, and the second back: the coast behind the first stays behind it ===");
{
  const thin = pixelsWhere((x, y) => x === 41 && y >= 10 && y <= 21), rest = pixelsWhere((x, y) => x >= 42 && x <= 48 && y >= 10 && y <= 21);
  const f = makeMod("xv", BASE_HM);
  paint(f, thin, L);
  const g1 = grid(f);
  paint(f, rest, L);
  paint(f, rest, SEA);
  const g3 = grid(f);
  const isWater3 = (x, y) => baseAt(x, y) === SEA && !(x === 41 && y >= 10 && y <= 21);
  ok(ring.filter(([, y]) => y > 10 && y < 21).every(([x, y]) => at(g3, x, y) === at(g1, x, y)), "⭐⭐ the old beach behind the thin band keeps what the first raise gave it: the water has come back to the band, not to it", ring.map(([x, y]) => [at(g1, x, y), at(g3, x, y)]));
  ok(trenchIn(g3, isWater3).length === 0, "⭐ …and no pixel of the land is under the waterline away from the water", trenchIn(g3, isWater3).slice(0, 6));
  const s = diffCount(g3, g1);
  ok(s.n === 0, "⭐⭐ …and the heightmap is byte for byte the one the second stroke started from", s);
  paint(f, thin, SEA);
  const b = diffCount(grid(f), g0);
  ok(b.n === 0, "⭐⭐ …and the thin band back: byte for byte the one the first stroke started from", b);
}

// ── xvi. water repainted as other water ──────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== xvi. THE CONTROL: water repainted as other water brings no water back, so it puts nothing back ===");
{
  const f = makeMod("xvi", BASE_HM);
  // a shore pixel at the band's north end that faces the sea and stands at 93 on its own: the raise takes it to the beach's 94
  setHeights(f, (x, y) => (x === 40 && y === 9 ? 93 : null));
  paint(f, band, L);
  const g1 = grid(f);
  ok(at(g1, 40, 9) === RAMP[0], `precondition: the raise took the pixel facing the sea north of the band to ${RAMP[0]}`, at(g1, 40, 9));
  const r = paint(f, [[41, 9]], LAKE);   // the sea in front of it, handed to the lake
  ok(r && r.ok === true && at(grid(f), 40, 9) === RAMP[0], "⭐ a sea pixel in front of it repainted as a lake moves nothing: the water it faces is where it was", at(grid(f), 40, 9));
  ok(diffCount(grid(f), g1).n === 0, "…and nothing else moves", diffCount(grid(f), g1));
  paint(f, band, SEA);
  ok(at(grid(f), 40, 9) === 93, "⭐ …and the band painted back, it is put back to the 93 it stood at", at(grid(f), 40, 9));
}

// ── x. the wiring ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== x. the wiring, read from the code ===");
{
  const SRC = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const body = (name) => { const a = SRC.indexOf("function " + name + "("); return a < 0 ? "" : SRC.slice(a, SRC.indexOf("\nfunction ", a + 10)); };
  const lp = body("levelPaintedPixels"), ad = body("applyProvinceDiff");
  const readAt = lp.indexOf("readPaintedHeightsRecord("), firstWriteAt = lp.indexOf("hbuf[ho] ="), settleAt = lp.indexOf("settleRaisedHeights("), writeAt = lp.indexOf("saveHeightsRecord()", lp.indexOf("safeModWrite(modHm")), hmWriteAt = lp.indexOf("safeModWrite(modHm");
  ok(readAt > 0 && readAt < firstWriteAt, "⭐ levelPaintedPixels reads the record before it writes a height", { readAt, firstWriteAt });
  ok(settleAt > 0 && lp.indexOf("pushHeightLayer(", settleAt) > settleAt, "⭐ …records what the raise's settle moved", settleAt);
  ok(writeAt > hmWriteAt && hmWriteAt > 0, "⭐ …and writes the record only once the heights it describes are written", { hmWriteAt, writeAt });
  ok(/_novaModScopedDir\(modRoot, "painted_heights"\)/.test(body("paintedHeightsRecordPath")), "the record is kept under Nova's own folder for the mod");
  ok(/writeWorldNormalFromHeightmap\(\{[^}]*changed:\s*settledGround\s*\|\|\s*painted/.test(ad), "applyProvinceDiff lights the normal map over every height that moved");
}

// ── xvii. a stroke that cannot use the record does not read it ───────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ xvii. a stroke that moves no height and brings no water back does not read the record (F2) ===");
{
  const f = makeMod("xvii", BASE_HM);
  paint(f, band, L);
  const p = md.paintedHeightsRecordPath(f.d), bytes = fs.readFileSync(p);
  const realRead = fs.readFileSync;
  let reads = 0;
  fs.readFileSync = function (file, ...rest) { if (String(file) === p) reads++; return realRead.call(fs, file, ...rest); };
  try {
    const l2l = paint(f, [[30, 8]], M);
    ok(l2l && l2l.ok === true && reads === 0, "⭐⭐⭐ one pixel of land handed to other land reads nothing of the record", { reads, hm: l2l && l2l.heightmap });
    reads = 0;
    const w2w = paint(f, [[60, 2]], LAKE);
    ok(w2w && w2w.ok === true && reads === 0, "⭐⭐ …nor does a pixel of the sea floor handed to a lake", { reads, hm: w2w && w2w.heightmap });
    ok(fs.readFileSync(p).equals(bytes), "…and the record is byte for byte as it was");
    reads = 0;
    setHeights(f, (x, y) => (x === 31 && y === 8 ? SEA_VALUE : null));
    const low = paint(f, [[31, 8]], M);
    ok(low && low.ok === true && low.heightmap.raised === 1 && reads === 1, "THE CONTROL: land handed to other land that stands on the sea floor is raised, and that stroke reads it", { reads, hm: low && low.heightmap });
    reads = 0;
    paint(f, band, SEA);
    ok(reads === 1, "THE CONTROL: the band painted back reads it, once", reads);
    const out = diffCount(grid(f), g0);
    ok(out.n <= 2, "⭐ …and goes back as it would have (the two pixels the strokes above moved by hand aside)", out);
  } finally { fs.readFileSync = realRead; }
  // …so a record it does not read, it has nothing to say about
  const g = makeMod("xvii-bad", BASE_HM);
  const q = md.paintedHeightsRecordPath(g.d);
  fs.mkdirSync(path.dirname(q), { recursive: true });
  fs.writeFileSync(q, "{ not json");
  const quiet = paint(g, [[30, 8]], M);
  ok(quiet && quiet.ok === true && !quiet.heightmap.heightsRecord, "⭐ a record that cannot be read costs a land-to-land stroke nothing, and it says nothing of it", quiet && quiet.heightmap);
  const stands = makeMod("xvii-standing", BASE_HM);
  fs.mkdirSync(path.dirname(md.paintedHeightsRecordPath(stands.d)), { recursive: true });
  fs.writeFileSync(md.paintedHeightsRecordPath(stands.d), "{ not json");
  setHeights(stands, (x, y) => (x === 50 && y === 15 ? 96 : null));
  const still = paint(stands, [[50, 15]], L);
  ok(still && still.ok === true && still.heightmap.pixels === 0 && !!(still.heightmap.heightsRecord && still.heightmap.heightsRecord.unreadable),
    "⭐ …while a stroke that needed it and moved no height says it could not be read", still && still.heightmap);
}

// ── xviii. the cap ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ xviii. the record holds so many pixels and no more, and forgets the oldest first (F2) ===");
{
  const CAP = md.PAINTED_HEIGHTS_MAX_ENTRIES;
  ok(Number.isInteger(CAP) && CAP >= 100000 && CAP <= 1000000, "the cap is a number of pixels: enough for many Saves, and little enough that a stroke reading it stays quick", CAP);
  // a world with room for the cap and more: open sea round one block of land, on a sea floor of 92 so that a pixel put back from the record shows
  const bH = Math.ceil(Math.sqrt((CAP + 6000) / 2)), bW = 2 * bH;
  const d = path.join(ROOT, "mods", "xviii");
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="PAINTBACK"\nreplace_path="map"\n');
  const isLand = (x, y) => x >= 10 && x < 20 && y >= 10 && y < 20;
  const rowSize = (bW * 3 + 3) & ~3, bmp = Buffer.alloc(54 + rowSize * bH);
  bmp.write("BM", 0, "ascii"); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(bW, 18); bmp.writeInt32LE(bH, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(rowSize * bH, 34);
  for (let y = 0; y < bH; y++) { let o = 54 + (bH - 1 - y) * rowSize; for (let x = 0; x < bW; x++) { const c = col(isLand(x, y) ? L : SEA); bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  fs.writeFileSync(path.join(d, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0", `${SEA};${col(SEA).join(";")};sea;false;ocean;0`, `${L};${col(L).join(";")};land;false;plains;1`].join("\n") + "\n");
  const hrs = Math.floor((8 * bW + 31) / 32) * 4, hsz = hrs * bH, hb = Buffer.alloc(54 + 1024 + hsz, 92);
  hb.write("BM", 0, "ascii"); hb.writeUInt32LE(hb.length, 2); hb.writeUInt32LE(54 + 1024, 10); hb.writeUInt32LE(40, 14);
  hb.writeInt32LE(bW, 18); hb.writeInt32LE(bH, 22); hb.writeUInt16LE(1, 26); hb.writeUInt16LE(8, 28); hb.writeUInt32LE(0, 30); hb.writeUInt32LE(hsz, 34); hb.writeUInt32LE(256, 46); hb.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; hb[o] = i; hb[o + 1] = i; hb[o + 2] = i; hb[o + 3] = 0; }
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), hb);
  const heightsNow = () => { const b = fs.readFileSync(path.join(d, "map", "heightmap.bmp")), off = b.readUInt32LE(10); return (x, y) => b[off + (bH - 1 - y) * hrs + x]; };
  // the stroke: the last row but two of the map, a band out at sea. Its first pixel is the record's oldest entry, a raise of an earlier paint that holds.
  const strokeRow = bH - 3, stroke = [];
  for (let x = 100; x < 1100 && x < bW; x++) stroke.push([x, strokeRow]);
  const colSea = ((col(SEA)[0] << 16) | (col(SEA)[1] << 8) | col(SEA)[2]) >>> 0;
  const layer = [["s", 92, 92, 0]];
  const keyOf = (x, y) => y * bW + x, strokeKeys = new Set(stroke.map(([x, y]) => keyOf(x, y)));
  const entries = [[keyOf(stroke[0][0], stroke[0][1]), colSea, layer]];
  for (let y = 0; y < bH && entries.length < CAP + 1000; y++) for (let x = 0; x < bW && entries.length < CAP + 1000; x++) { if (strokeKeys.has(keyOf(x, y)) || isLand(x, y)) continue; entries.push([keyOf(x, y), colSea, layer]); }
  ok(entries.length === CAP + 1000, "THE CONTROL: a record over the cap, every entry of it holding: the sea it says it left where it stood", entries.length);
  const recPath = md.paintedHeightsRecordPath(d);
  fs.mkdirSync(path.dirname(recPath), { recursive: true });
  fs.writeFileSync(recPath, JSON.stringify({ version: 1, width: bW, height: bH, entries }));
  const c = col(L);
  const r = md.applyProvinceDiff({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], diff: stroke.map(([x, y]) => ({ x, y, r: c[0], g: c[1], b: c[2] })), requireDefinedColours: true });
  ok(r && r.ok === true && r.heightmap && r.heightmap.raised === stroke.length, "the stroke is raised", r && (r.error || { raised: r.heightmap.raised, pixels: r.heightmap.pixels, rec: r.heightmap.heightsRecord }));
  const after = JSON.parse(fs.readFileSync(recPath, "utf8"));
  ok(after.entries.length === CAP, `⭐⭐⭐ the record comes out at the cap, ${CAP} pixels`, after.entries.length);
  const inIt = new Map(after.entries.map((e) => [e[0], e]));
  ok(!inIt.has(entries[1][0]) && !inIt.has(entries[500][0]) && inIt.has(entries[entries.length - 1][0]), "⭐⭐ …by forgetting the oldest: the second entry the file held is gone, its last is there");
  ok(stroke.every(([x, y]) => inIt.has(keyOf(x, y))), "⭐⭐ …and every pixel of the stroke itself is there");
  const firstEntry = inIt.get(keyOf(stroke[0][0], stroke[0][1]));
  ok(!!firstEntry && firstEntry[2].length === 2, "⭐ …among them the pixel that was the oldest entry: a new layer makes it new, the two layers both held", firstEntry);
  const back = md.applyProvinceDiff({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], diff: stroke.map(([x, y]) => ({ x, y, r: col(SEA)[0], g: col(SEA)[1], b: col(SEA)[2] })), requireDefinedColours: true });
  const h = heightsNow();
  ok(back && back.ok === true && stroke.every(([x, y]) => h(x, y) === 92), "⭐⭐ …so painted back it stands on the sea floor of 92 it had, not the sink's 89", stroke.slice(0, 4).map(([x, y]) => h(x, y)));
  // ⛔ what was forgotten costs a pixel only its going back exactly
  const lost = [entries[1][0] % bW, Math.floor(entries[1][0] / bW)];
  const m1 = md.applyProvinceDiff({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], diff: [{ x: lost[0], y: lost[1], r: c[0], g: c[1], b: c[2] }], requireDefinedColours: true });
  const m2 = md.applyProvinceDiff({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], diff: [{ x: lost[0], y: lost[1], r: col(SEA)[0], g: col(SEA)[1], b: col(SEA)[2] }], requireDefinedColours: true });
  ok(m1.ok === true && m2.ok === true && heightsNow()(lost[0], lost[1]) === 92, "…and a pixel it forgot, painted out and back, is an ordinary paint: it was recorded anew", heightsNow()(lost[0], lost[1]));
}

// ── xix. a record that cannot be written ─────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== xix. a record that cannot be written leaves one temporary file however many strokes fail, as its siblings' do ===");
{
  const f = makeMod("xix", BASE_HM);
  const p = md.paintedHeightsRecordPath(f.d);
  const realRename = fs.renameSync;
  fs.renameSync = function (from, to, ...rest) { if (String(to) === p) { const e = new Error("EPERM: a held file"); e.code = "EPERM"; throw e; } return realRename.call(fs, from, to, ...rest); };
  let one, two;
  try { one = paint(f, band, L); two = paint(f, pixelsWhere((x, y) => inBox(x, y, 41, 48, 22, 25)), L); } finally { fs.renameSync = realRename; }
  ok(one && one.ok === true && two && two.ok === true && !!(one.heightmap.heightsRecord && one.heightmap.heightsRecord.error) && !!(two.heightmap.heightsRecord && two.heightmap.heightsRecord.error), "both strokes stand, and each answer says the record could not be written", [one && one.heightmap.heightsRecord, two && two.heightmap.heightsRecord]);
  const left = fs.readdirSync(path.dirname(p)).filter((n) => /\.tmp-/.test(n));
  ok(left.length === 1, "⭐⭐ …and the folder holds one temporary file, not one a stroke", left);
}

// ── xx. a whole-map write ────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ xx. Delete map and Generate land forget the record: what a raise moved says nothing about the world after them (B1) ===");
{
  const f = makeMod("xx", BASE_HM);
  paint(f, band, L);
  const p = md.paintedHeightsRecordPath(f.d);
  ok(fs.existsSync(p), "THE CONTROL: the record is there");
  const b = md.blankMapToSea({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [] });
  ok(b && b.changed === true && !fs.existsSync(p), "⭐⭐⭐ Delete map forgets it", b && { changed: b.changed, error: b.error });
  // a Delete map that refuses changes no map, and keeps it: this mod owns no provinces.bmp, and the layer below has one
  const below = path.join(ROOT, "below-xx"); fs.mkdirSync(path.join(below, "map"), { recursive: true });
  const src = makeMod("xx-src", BASE_HM);
  for (const n of ["provinces.bmp", "definition.csv", "heightmap.bmp"]) fs.copyFileSync(path.join(src.d, "map", n), path.join(below, "map", n));
  const onlyDesc = path.join(ROOT, "mods", "xx-overlay"); fs.mkdirSync(onlyDesc, { recursive: true });
  fs.writeFileSync(path.join(onlyDesc, "descriptor.mod"), 'name="OVERLAY"\n');
  const q = md.paintedHeightsRecordPath(onlyDesc);
  fs.mkdirSync(path.dirname(q), { recursive: true }); fs.writeFileSync(q, "{}");
  const no = md.blankMapToSea({ modRoot: onlyDesc, gameRoot: below, dependencyRoots: [] });
  ok(no && !no.changed && no.refusedNoOwnBitmap === true && fs.existsSync(q), "⭐ …while one that refuses changed no map, and keeps it", no && { changed: no.changed, refused: no.refusedNoOwnBitmap });
  // Generate land, on the split world its own tests generate on, through the export every caller uses
  const SW = require("./testlib-split-world.js");
  const gameRoot = path.join(ROOT, "game-xx"), S = SW.makeShapes({});
  SW.makeGame(gameRoot, S, {});
  const mod = path.join(ROOT, "mods", "xx-world");
  SW.makeMod(mod, S, { name: "xx world" });
  const r = md.paintedHeightsRecordPath(mod);
  fs.mkdirSync(path.dirname(r), { recursive: true }); fs.writeFileSync(r, "{}");
  const refused = md.generateLand({ modRoot: mod, gameRoot: mod, dependencyRoots: [], count: 40, seed: 1 });
  ok(refused && !refused.changed && fs.existsSync(r), "⭐ a Generate land that refused changed no map, and keeps it", refused && { changed: refused.changed, error: refused.error });
  const made = md.generateLand({ modRoot: mod, gameRoot, dependencyRoots: [], count: 40, seed: 1, provincesPerState: 8 });
  ok(made && made.changed === true && !fs.existsSync(r), "⭐⭐⭐ Generate land forgets it", made && { changed: made.changed, error: made.error, provinces: made.provinces });
}

// ── xxi. a baseline ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ xxi. a baseline carries the record of the map it holds, and a restore puts it back with that map (H1) ===");
{
  // saved with the band out, painted back since: restored, the band is up again and the record that says what it raised is back with it
  const f = makeMod("xxi", BASE_HM);
  paint(f, band, L);
  const gOut = grid(f), recOut = recordOf(f);
  const saved = md.saveMapBaseline({ modRoot: f.d });
  ok(saved && saved.ok === true, "THE CONTROL: the baseline is saved with the band out", saved);
  paint(f, band, SEA);
  ok(diffCount(grid(f), g0).n === 0 && recordOf(f).entries.length === 0, "THE CONTROL: painted back, the map is the one before the band, and the record has nothing left of it");
  const restored = md.restoreMapBaseline({ modRoot: f.d, gameRoot: NOGAME });
  ok(restored && restored.ok === true && diffCount(grid(f), gOut).n === 0, "THE CONTROL: restored, the band is up again", restored && (restored.error || restored.restored));
  ok(JSON.stringify(recordOf(f)) === JSON.stringify(recOut), "⭐⭐⭐ …and the record is the one the baseline's map was saved with", recordOf(f) && recordOf(f).entries.length);
  paint(f, band, SEA);
  const s = diffCount(grid(f), g0);
  ok(s.n === 0, "⭐⭐⭐ …so painted back again, the heightmap is byte for byte the map before the band: no cliff where the raise left the old beach", s);
  // saved with no record: what the record says now is of another map
  const g = makeMod("xxi-none", BASE_HM);
  md.saveMapBaseline({ modRoot: g.d });
  paint(g, band, L);
  const q = md.paintedHeightsRecordPath(g.d);
  ok(fs.existsSync(q), "THE CONTROL: a paint since the baseline wrote a record");
  const r2 = md.restoreMapBaseline({ modRoot: g.d, gameRoot: NOGAME });
  ok(r2 && r2.ok === true && !fs.existsSync(q), "⭐⭐ a baseline saved with no record: the restore forgets the one the map it replaced had", r2 && (r2.error || "kept"));
  // a baseline saved before it carried one
  const h = makeMod("xxi-old", BASE_HM);
  paint(h, band, L);
  const savedH = md.saveMapBaseline({ modRoot: h.d });
  const dir = path.dirname(md.paintedHeightsRecordPath(h.d));
  const metaFile = path.join(savedH.baselinePath, "_baseline.json"), meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
  delete meta.paintedHeights;
  fs.writeFileSync(metaFile, JSON.stringify(meta));
  paint(h, band, SEA); paint(h, band, L);
  const r3 = md.restoreMapBaseline({ modRoot: h.d, gameRoot: NOGAME });
  ok(r3 && r3.ok === true && !fs.existsSync(path.join(dir, "heights.json")), "⭐ a baseline saved before it carried the record: forgotten at the restore too", r3 && (r3.error || "kept"));
}

// ── xxii. the Save line ──────────────────────────────────────────────────────────────────────────────────────────────────────────
const P = require("./testlib-map-page.js");
/** 💾 the page's own Save (flushMapSaves, mapCrashGate, the page's notes) of a painted stroke or of queued writes, with each request answered by what the writer answers. */
const saveThroughThePage = async (f, { pixels = null, id = 0, writes = [] }) => {
  const posted = [];
  const paintDiff = new Map();
  const c = col(id);
  for (const [x, y] of pixels || []) paintDiff.set(x + "," + y, { x, y, r: c[0], g: c[1], b: c[2] });
  const roots = { modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [] };
  const page = P.runPage([
    ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
    "function markSaveBoundary", "function queueWrite(url, body, meta)", "function terrainWriteNotes(",
    ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
    "async function mapCrashGate(",
  ], P.loadGlobals({
    console, JSON, load: async () => {}, pendingWrites: [], paintDiff, stateById: new Map(), model: { states: [] },
    window: { NovaMapRuleLabels: require("./public/map-rule-labels.js"), confirm: () => true },
    stagedRiverEdits: [], riversShow: false, loadRiversOverlay: () => {},
    undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
    setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => f.d,
    isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
    stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
    remapQueuedStateId: () => {}, remapLocalStateId: () => {},
    adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
    fetch: async (url, opts) => {
      const u = String(url).split("?")[0], body = opts && opts.body ? JSON.parse(opts.body) : {};
      posted.push(u);
      let json = { ok: true, errors: 0, warnings: 0, problems: [] };
      if (u === "/api/map/paint-provinces") json = md.applyProvinceDiff({ ...roots, diff: body.diff, requireDefinedColours: true });
      if (u === "/api/map/flip-province-sea") json = { ok: true, ...md.flipProvinceToSea({ ...roots, provinceId: body.provinceId }) };
      if (u === "/api/map/blank-to-sea") json = { ok: true, ...md.blankMapToSea({ ...roots }) };
      return { ok: true, status: 200, json: async () => json };
    },
  }));
  for (const [url, body] of writes) page.sb.queueWrite(url, body);
  await page.sb.flushMapSaves();
  await P.settle(30);
  return { line: String(page.statuses[page.statuses.length - 1] || ""), posted };
};
/** a world whose L stands on the shore, for the writers that take a province under */
const coastalWorld = (tag) => { const m = makeMod(tag, BASE_HM); fs.writeFileSync(path.join(m.d, "map", "definition.csv"), fs.readFileSync(path.join(m.d, "map", "definition.csv"), "utf8").replace(new RegExp("^(" + L + ";[^;]*;[^;]*;[^;]*;land;)false", "m"), "$1true")); return m; };
const savesThatSpeak = async () => {
  console.log("\n=== ⛔ xxii. the Save line says what only the JSON said: a heightmap that could not be written (W2), a record that could not be read or written (N1) ===");
  const LEFT_WORD = /map\/heightmap\.bmp \(|record of what/;   // this fixture ships no colour map, so a stroke over the coast warns of that, as it should
  const HM_WORD = /⚠ The ground did not move with this change: Nova could not write map\/heightmap\.bmp \(Couldn't write heightmap\.bmp — the file is read-only or in use by another program\)\. What the change took across the coast stands at its old height, so the game draws it on the wrong side of the water\. Once the file can be written, paint or erase that ground again, and the heights follow\./;
  {
    const f = makeMod("xxii-hm", BASE_HM);
    paint(f, band, L);
    const g1 = grid(f);
    fs.chmodSync(hmPath(f), 0o444);
    let said;
    try { said = await saveThroughThePage(f, { pixels: band, id: SEA }); } finally { fs.chmodSync(hmPath(f), 0o666); }
    ok(said.posted.includes("/api/map/paint-provinces") && diffCount(grid(f), g1).n === 0, "THE CONTROL: the Save posted the stroke, with heightmap.bmp read-only, and no height moved", said.posted);
    ok(/Saved 1 change/.test(said.line) && HM_WORD.test(said.line), "⭐⭐⭐ the Save line says the ground did not move, why, what that does, and what to do", said.line);
    ok(!/Nothing was changed/.test(said.line), "⭐ …with no \"Nothing was changed\" over shapes that were saved", said.line);
    const again = await saveThroughThePage(f, { pixels: band, id: SEA });
    ok(!LEFT_WORD.test(again.line) && band.every(([x, y]) => at(grid(f), x, y) <= SEA_VALUE), "⭐⭐ …and it is true: the same pixels painted again, the file writable, go under, and the line has none of it", again.line);
  }
  {
    const f = makeMod("xxii-unread", BASE_HM);
    const p = md.paintedHeightsRecordPath(f.d);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, "{ not json");
    const said = await saveThroughThePage(f, { pixels: band, id: L });
    ok(/⚠ Nova could not read its record of what earlier paints raised/.test(said.line) && said.line.includes(p) && /Move that file out of the way and Nova starts a new record\./.test(said.line),
      "⭐⭐⭐ a record that cannot be read is said on the Save line, with the file and what to do", said.line);
    ok(fs.readFileSync(p, "utf8") === "{ not json", "…and left as it is");
    fs.renameSync(p, p + ".moved-by-the-modder");
    const fresh = await saveThroughThePage(f, { pixels: pixelsWhere((x, y) => inBox(x, y, 41, 48, 22, 25)), id: L });
    ok(!LEFT_WORD.test(fresh.line) && fs.existsSync(p), "⭐ …and it is true: moved out of the way, the next stroke says nothing of it and a new record is kept", fresh.line);
  }
  {
    const f = makeMod("xxii-unwrit", BASE_HM);
    const p = md.paintedHeightsRecordPath(f.d);
    const realRename = fs.renameSync;
    fs.renameSync = function (from, to, ...rest) { if (String(to) === p) { const e = new Error("EPERM: a held file"); e.code = "EPERM"; throw e; } return realRename.call(fs, from, to, ...rest); };
    let said;
    try { said = await saveThroughThePage(f, { pixels: band, id: L }); } finally { fs.renameSync = realRename; }
    ok(/⚠ Nova could not write its record of what this paint raised \(EPERM: a held file\)/.test(said.line), "⭐⭐⭐ a record that cannot be written is said on the Save line", said.line);
  }
  {
    const f = makeMod("xxii-quiet", BASE_HM);
    const out = await saveThroughThePage(f, { pixels: band, id: L });
    const back = await saveThroughThePage(f, { pixels: band, id: SEA });
    const l2l = await saveThroughThePage(f, { pixels: [[30, 8]], id: M });
    ok(![out, back, l2l].some((s) => LEFT_WORD.test(s.line)) && /Saved 1 change/.test(l2l.line) && !/⚠/.test(l2l.line), "⭐⭐ THE CONTROLS: a stroke out, a stroke back, and a land-to-land stroke say none of it", [out.line, back.line, l2l.line]);
    // …and the answer says nothing either: `heightsRecord` there means something went wrong, and that is all the page's two gates ask before they
    // call heightmapLeftNote, so a page lift that supplies no such note (nine tests lift flushMapSaves) never meets it on a healthy Save
    const g = makeMod("xxii-quiet-answer", BASE_HM), c = col(L);
    const answer = md.applyProvinceDiff({ modRoot: g.d, gameRoot: NOGAME, dependencyRoots: [], diff: band.map(([x, y]) => ({ x, y, r: c[0], g: c[1], b: c[2] })), requireDefinedColours: true });
    ok(answer && answer.ok === true && answer.heightmap.pixels > 0 && fs.existsSync(md.paintedHeightsRecordPath(g.d)) && !("heightsRecord" in answer.heightmap),
      "⭐⭐ …and a record kept as it should be puts nothing on the answer", answer && answer.heightmap.heightsRecord);
  }
  {
    // the writers beside it answer through the same gate: an erase, and a Delete map through the page's own note for it
    const f = coastalWorld("xxii-erase");
    fs.chmodSync(hmPath(f), 0o444);
    let said;
    try { said = await saveThroughThePage(f, { writes: [["/api/map/flip-province-sea", { provinceId: L }]] }); } finally { fs.chmodSync(hmPath(f), 0o666); }
    ok(said.posted.includes("/api/map/flip-province-sea") && HM_WORD.test(said.line), "⭐⭐ an erase that could not write heightmap.bmp says it the same way", said.line);
    const f2 = makeMod("xxii-blank", BASE_HM);
    fs.chmodSync(hmPath(f2), 0o444);
    let blank, viaSave;
    try { blank = md.blankMapToSea({ modRoot: f2.d, gameRoot: NOGAME, dependencyRoots: [] }); } finally { fs.chmodSync(hmPath(f2), 0o666); }
    const notes = P.runPage(["function blankWriteNotes("], {}).sb.blankWriteNotes(blank);
    ok(blank.heightmap && blank.heightmap.error && notes.some((n) => HM_WORD.test(n.text)), "⭐⭐ …and so does a Delete map, in the notes 🌍 Generate a world shows", notes.map((n) => n.key));
    const f3 = makeMod("xxii-blank-save", BASE_HM);
    fs.chmodSync(hmPath(f3), 0o444);
    try { viaSave = await saveThroughThePage(f3, { writes: [["/api/map/blank-to-sea", {}]] }); } finally { fs.chmodSync(hmPath(f3), 0o666); }
    ok(HM_WORD.test(viaSave.line), "⭐⭐ …and through the Save", viaSave.line);
  }
};

savesThatSpeak().catch((e) => ok(false, "the Saves ran", String((e && e.stack) || e).slice(0, 600))).finally(() => {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  console.log(`\n${fails.length ? "FAILED" : "PASSED"} ${pass}/${pass + fails.length}`);
  if (fails.length) { for (const f of fails) console.log("  ✗ " + f); process.exit(1); }
  process.exit(0);
});
