// Land Nova raises must have RELIEF, not be a flat table at one height.
// #generated-land-is-a-plateau
//
// ⛔ THE FINDING, measured on the owner's own built world — new mod → own the map → Delete map → Generate
// land 35% → Auto-fix ×2 — by sampling heightmap.bmp under every land pixel, and doing the same to the base
// game's map for a yardstick:
//
//     vanilla        mean height 113.8   sd 21.29   29.2% of land has no slope in either direction
//     Nova's world   mean height 105.7   sd  1.64   94.7% has none — and 95.3% of ALL ITS LAND IS EXACTLY 106
//
// Every continent it grows was a featureless plateau with a coastline drawn round it. #new-land-needs-a-beach
// had already fixed the EDGE — 94 at the water, 97, and a measured climb eight pixels deep — and the interior
// behind it was one number.
//
// ⭐ IT IS ALSO WHY THE RELIEF LOOKED WRONG AND WAS NOT. 93.5% of that land was lit by a flat normal against
// vanilla's 2.26%, and the normal writer added the day before was right the whole time: a normal map is
// computed FROM the heightmap, and flat ground can only ever produce a flat normal. There was nothing to light.
//
// ⛔ AND THEN IT WENT TO 11.22% AND STAYED THERE — #the-low-ground-is-half-as-varied-as-vanillas, the whole
// of which is beside HEIGHTMAP_RELIEF_DETAIL_RMS in map-data.js. Every check in this file passed while that
// was true, for two reasons worth keeping in mind before adding another:
//   • the "no slope" count here reads ONE pixel; a normal map reads six. The base game's heightmap is
//     speckled at the pixel scale, so it scores 33.8% here while its six-pixel gradient is ordinary — the
//     field could match it here and be five times flatter where the lighting looks. The lighting is now
//     measured for itself, by running Nova's own writer and counting what comes out.
//   • every statistic here was taken over ALL heights. The field matched vanilla at 1.06× that way and was
//     0.46× on the LOW GROUND alone, which is where the flat lighting was. The low ground is its own
//     population now, and its own check.
//
// 🈯 THE SPECIFICATION IS THE SHIPPING MAP, NOT TASTE — and this test does not carry the numbers. It measures
// the installed game and the field Nova writes THE SAME WAY, over THE SAME BLOCKS of the map, and compares
// the two; if the game is not installed the comparison says it is skipped. So it moves when either moves.
//
// ⚠️ WHAT MUST NOT BE TRADED FOR IT, each checked below:
//   • no pixel of new land may sit at or below the render waterline of 95 except the beach's own steps, or
//     HOI4 draws sea on top of land;
//   • the beach must survive step for step — a plateau meeting the sea is a cliff, and that was the crash;
//   • the same map must give the same world, because the raise is a FIELD and a click has to settle
//     (#a-second-raise-must-not-re-cut-the-coast).
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const NOGAME = path.join(os.tmpdir(), "__no_game_relief__");
const SEA_LEVEL = md.HEIGHTMAP_SEA_LEVEL;
const RAMP = md.HEIGHTMAP_BEACH_RAMP;
const SIDE = 128;
const tmps = [];

// ⚠️ THE BOTTOM OF THE RANGE IS ITS OWN POPULATION, and it is the one that was wrong —
// #the-low-ground-is-half-as-varied-as-vanillas. "Low" is the curve's own bottom sixth rather than a number
// typed here, so it moves if HEIGHTMAP_RELIEF_CDF does.
const LOW_GROUND = (md.HEIGHTMAP_RELIEF_CDF.find(([q]) => q >= 0.15) || [0, 0])[1];
const LAGS = [1, 8];          // one pixel, and the width of the neighbourhood a normal map reads
const HALO = Math.max(...LAGS);

// The one measurement, run identically on the shipping map and on the field: over a square block of the
// map, the spread of the heights, the share of pixels whose immediate neighbourhood has no slope in either
// direction, and the STRUCTURE FUNCTION — the rms height difference between two pixels `lag` apart, which
// is a roughness with a SCALE attached.
//
// ⚠️ THE `flat` COUNT BELOW IS NOT WHAT THE NORMAL MAP READS, and this file said it was until
// #the-low-ground-is-half-as-varied-as-vanillas. A normal map is computed from the average of each 2×2
// block and a Sobel over three of those, so it reads a SIX-pixel neighbourhood; the count here reads one
// pixel. The two genuinely disagree — the base game's heightmap is speckled at the pixel scale, which makes
// this count high (33.8%) while the six-pixel gradient it carries is ordinary. So the field can match
// vanilla here and still be five times flatter where the lighting looks, which is exactly what happened.
// The lighting is measured for itself further down, by running Nova's own writer.
function measureBlocks(at, blocks) {
  let n = 0, sum = 0, sq = 0, flat = 0, lowest = 255, highest = 0;
  const all = LAGS.map(() => ({ s: 0, c: 0 })), low = LAGS.map(() => ({ s: 0, c: 0 }));
  const D = SIDE + 2 * HALO;
  for (const [bx, by] of blocks) {
    const buf = new Uint8Array(D * D);
    for (let j = 0; j < D; j++) for (let i = 0; i < D; i++) buf[j * D + i] = at(bx + i - HALO, by + j - HALO);
    for (let j = HALO; j < HALO + SIDE; j++) {
      for (let i = HALO; i < HALO + SIDE; i++) {
        const k = j * D + i, h = buf[k];
        n++; sum += h; sq += h * h;
        if (h < lowest) lowest = h;
        if (h > highest) highest = h;
        if (buf[k + 1] === buf[k - 1] && buf[k + D] === buf[k - D]) flat++;
        for (let li = 0; li < LAGS.length; li++) {
          const L = LAGS[li], d1 = buf[k + L] - h, d2 = buf[k + L * D] - h;
          all[li].s += d1 * d1 + d2 * d2; all[li].c += 2;
          if (h <= LOW_GROUND) { low[li].s += d1 * d1 + d2 * d2; low[li].c += 2; }
        }
      }
    }
  }
  const mean = sum / n;
  const rms = (a) => (a.c ? Math.sqrt(a.s / a.c) : 0);
  return { n, mean, sd: Math.sqrt(Math.max(0, sq / n - mean * mean)), flat: flat / n, lowest, highest,
    sf: LAGS.map((L, i) => rms(all[i])), lowSf: LAGS.map((L, i) => rms(low[i])), lowN: low[0].c / 2 };
}

// ── 🈯 the shipping map, and the field measured over exactly the same ground ─────────────────────────
console.log("\n=== 🈯 the base game's own interior, and Nova's field over the same blocks ===");
let vanillaGround = null;   // …kept for the LIGHTING comparison further down, measured over the same ground
{
  const hp = path.join(GAME, "map", "heightmap.bmp"), pp = path.join(GAME, "map", "provinces.bmp"), dp = path.join(GAME, "map", "definition.csv");
  if (!fs.existsSync(hp) || !fs.existsSync(pp) || !fs.existsSync(dp)) console.log("  ..   (the base game is not installed — this comparison is skipped)");
  else {
    const hb = fs.readFileSync(hp);
    const hm = md.readIndexedBmp(hb);
    const pb = fs.readFileSync(pp);
    const poff = pb.readUInt32LE(10), VW = pb.readInt32LE(18), VH = pb.readInt32LE(22);
    const prow = Math.floor((24 * VW + 31) / 32) * 4;
    const landColour = new Set();
    for (const ln of fs.readFileSync(dp, "utf8").split(/\r?\n/)) {
      const c = ln.split(";");
      if (c.length < 8 || !/^[0-9]+$/.test(c[0])) continue;
      if ((c[4] || "").trim() === "land") landColour.add(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0);
    }
    const isLand = (x, y) => { const o = poff + (VH - 1 - y) * prow + x * 3; return landColour.has(((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0); };
    const vAt = (x, y) => hb[hm.pixelOffset(Math.max(0, Math.min(VW - 1, x)), Math.max(0, Math.min(VH - 1, y)))];

    // Every SIDE×SIDE block of the map with no water anywhere in it — WALKED, not a list of coordinates
    // typed in here. A block with no water is interior by construction, which is the population the relief
    // field is built for, and using the SAME blocks for both removes the one thing that would make the
    // comparison meaningless: vanilla's solid-land blocks are its continental interiors, and its coastal
    // plains are not in them.
    const blocks = [];
    for (let by = 1; by + SIDE < VH; by += SIDE) {
      for (let bx = 1; bx + SIDE < VW; bx += SIDE) {
        let all = true;
        for (let y = by; y < by + SIDE && all; y += 4) for (let x = bx; x < bx + SIDE; x += 4) if (!isLand(x, y)) { all = false; break; }
        if (all) blocks.push([bx, by]);
      }
    }
    vanillaGround = { blocks, VW, VH };
    const VANILLA = measureBlocks(vAt, blocks);
    const field = md.heightmapReliefField(VW);
    const MINE = measureBlocks((x, y) => field(x, y, 0), blocks);
    console.log(`     ${blocks.length} blocks of ${SIDE}×${SIDE} with no water in them, ${VANILLA.n} pixels each way`);
    const line = (m) => `mean ${m.mean.toFixed(1)}  sd ${m.sd.toFixed(2)}  no slope ${(100 * m.flat).toFixed(2)}%  range ${m.lowest}..${m.highest}`
      + `  rms difference ${LAGS.map((L, i) => L + "px " + m.sf[i].toFixed(2)).join(" / ")}`
      + `  [low ≤${LOW_GROUND}: ${m.lowN} px, ${LAGS.map((L, i) => L + "px " + m.lowSf[i].toFixed(2)).join(" / ")}]`;
    console.log(`     vanilla   ${line(VANILLA)}`);
    console.log(`     the field ${line(MINE)}`);
    ok(blocks.length > 20, "the base map gives enough solid-land blocks to calibrate on", blocks.length);
    ok(VANILLA.sd > 5, "⭐ …and its interior is nothing like flat — this is the yardstick", VANILLA.sd.toFixed(2));
    ok(Math.abs(MINE.mean - VANILLA.mean) < 8,
      "⭐⭐⭐ the field's mean height is the base game's, within 8", { field: MINE.mean.toFixed(1), vanilla: VANILLA.mean.toFixed(1) });
    ok(MINE.sd > VANILLA.sd * 0.6 && MINE.sd < VANILLA.sd * 1.6,
      "⭐⭐⭐ …and so is its spread, within a factor well under two — on the base commit this was 0",
      { field: MINE.sd.toFixed(2), vanilla: VANILLA.sd.toFixed(2) });
    // A roughness with a SCALE attached, at one pixel and at the six-ish the lighting reads, both sides
    // measured over the same ground by the same code.
    for (let i = 0; i < LAGS.length; i++) {
      ok(MINE.sf[i] > VANILLA.sf[i] * 0.5 && MINE.sf[i] < VANILLA.sf[i] * 2,
        `⭐⭐ …and two pixels ${LAGS[i]} apart differ by what they differ by on the base map, within a factor of two`,
        { field: MINE.sf[i].toFixed(2), vanilla: VANILLA.sf[i].toFixed(2) });
    }
    // ⛔ #the-low-ground-is-half-as-varied-as-vanillas — THE CHECK THE WHOLE-MAP ONES ABOVE CANNOT MAKE.
    // On the base commit the field matched vanilla at every lag TAKEN OVER ALL HEIGHTS (1.06× at 8 px) and
    // was HALF of it on the low ground alone (0.46× at 8 px), which is where the flat lighting was.
    // ⚠️ THE FLOOR IS TIGHTER THAN THE CEILING, on purpose. The failure mode was the field being SMOOTHER
    // than the base map, and a plain factor of two does not bite on it: over these blocks the base commit
    // read 0.59× at 8 px and 0.74× at one, both inside it. Too ROUGH is caught by the spread and the
    // whole-map lags above, so that side keeps the file's usual factor of two.
    ok(VANILLA.lowN > 10000 && MINE.lowN > 10000,
      "the base map and the field both give enough low ground to compare", { vanilla: VANILLA.lowN, field: MINE.lowN });
    for (let i = 0; i < LAGS.length; i++) {
      ok(MINE.lowSf[i] > VANILLA.lowSf[i] * 0.75 && MINE.lowSf[i] < VANILLA.lowSf[i] * 2,
        `⭐⭐⭐ …and the LOW GROUND is not the smoother half of it at ${LAGS[i]} px — the base commit read 0.59× at 8 px while the whole map read 1.06×`,
        { field: MINE.lowSf[i].toFixed(2), vanilla: VANILLA.lowSf[i].toFixed(2), ratio: (MINE.lowSf[i] / VANILLA.lowSf[i]).toFixed(2) });
    }
  }
}

// ── the fixture: a continent big enough to have an interior, in a sea frame ──────────────────────────
const W = 1024, H = 512, FRAME = 16;
const SEA = 1, LAND = 2;
const COL = { 1: [20, 5, 9], 2: [40, 10, 18] };
const idAt = (x, y) => (x < FRAME || x >= W - FRAME || y < FRAME || y >= H - FRAME ? SEA : LAND);

// …and the half-resolution normal map the lighting section reads. It starts NOT flat, so a pixel that comes
// back flat afterwards is one the writer wrote and not one it skipped — the positive control in the
// "nothing happened" check. The divisor is read off map-data's own declaration rather than typed.
const NDIV = (md.MAP_BITMAPS_SCALED_FROM_PROVINCES.find((b) => b.name === "world_normal.bmp") || {}).divisor;
const NW = W / NDIV, NH = H / NDIV, nRow = Math.floor((24 * NW + 31) / 32) * 4;
function writeNormalBmp(dir, triple) {
  const sz = nRow * NH, nb = Buffer.alloc(54 + sz);
  nb.write("BM", 0, "ascii");
  nb.writeUInt32LE(54 + sz, 2); nb.writeUInt32LE(54, 10); nb.writeUInt32LE(40, 14);
  nb.writeInt32LE(NW, 18); nb.writeInt32LE(NH, 22); nb.writeUInt16LE(1, 26);
  nb.writeUInt16LE(24, 28); nb.writeUInt32LE(sz, 34);
  for (let y = 0; y < NH; y++) for (let x = 0; x < NW; x++) {
    const o = 54 + (NH - 1 - y) * nRow + x * 3;
    nb[o] = triple[2]; nb[o + 1] = triple[1]; nb[o + 2] = triple[0];
  }
  fs.writeFileSync(path.join(dir, "map", "world_normal.bmp"), nb);
}
const normalTripleAt = (dir, X, Y) => {
  const b = fs.readFileSync(path.join(dir, "map", "world_normal.bmp"));
  const o = b.readUInt32LE(10) + (NH - 1 - Y) * nRow + X * 3;
  return [b[o + 2], b[o + 1], b[o]];
};

function makeMod() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-relief-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="RELIEF"\nreplace_path="map"\n');
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[idAt(x, y)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  const rows = ["0;0;0;0;land;false;unknown;0"];
  rows.push(`${SEA};${COL[1].join(";")};sea;false;ocean;0`);
  rows.push(`${LAND};${COL[2].join(";")};land;true;plains;0`);
  fs.writeFileSync(path.join(d, "map", "definition.csv"), rows.join("\n") + "\n");
  const hrs = Math.floor((8 * W + 31) / 32) * 4, hsz = hrs * H;
  const hb = Buffer.alloc(54 + 1024 + hsz, 89);
  hb.write("BM", 0, "ascii");
  hb.writeUInt32LE(54 + 1024 + hsz, 2); hb.writeUInt32LE(54 + 1024, 10); hb.writeUInt32LE(40, 14);
  hb.writeInt32LE(W, 18); hb.writeInt32LE(H, 22); hb.writeUInt16LE(1, 26);
  hb.writeUInt16LE(8, 28); hb.writeUInt32LE(0, 30); hb.writeUInt32LE(hsz, 34);
  hb.writeUInt32LE(256, 46); hb.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; hb[o] = i; hb[o + 1] = i; hb[o + 2] = i; hb[o + 3] = 0; }
  for (let i = 0; i < hsz; i++) hb[54 + 1024 + i] = 89;
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), hb);
  writeNormalBmp(d, [90, 150, 230]);   // plainly not flat, so "flat afterwards" means the writer wrote here
  return { d, hrs };
}
const readHeights = (f) => {
  const b = fs.readFileSync(path.join(f.d, "map", "heightmap.bmp"));
  const off = b.readUInt32LE(10);
  return (x, y) => b[off + (H - 1 - Math.max(0, Math.min(H - 1, y))) * f.hrs + Math.max(0, Math.min(W - 1, x))];
};

// ── ⛔ the finding: what the RAISE writes, not just what the field could ──────────────────────────────
console.log("\n=== ⛔ a continent Nova raises is not one height ===");
const f = makeMod();
const r = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [LAND], raise: true });
ok(r.changed === true && r.pixels > 0, "the raise ran", { changed: r.changed, pixels: r.pixels });
const hAt = readHeights(f);

// The interior: everything further from the sea frame than the beach is deep plus the distance the relief
// fades in over — the ramp's own length and the writer's own fade, both read off the module rather than
// typed in here, so this moves when either does.
const IN = FRAME + RAMP.length + md.HEIGHTMAP_RELIEF_FADE_IN;
const inner = [];
for (let by = IN; by + SIDE < H - IN; by += SIDE) for (let bx = IN; bx + SIDE < W - IN; bx += SIDE) inner.push([bx, by]);
const MINE = measureBlocks(hAt, inner);
console.log(`     ${inner.length} interior blocks, ${MINE.n} pixels: mean ${MINE.mean.toFixed(1)}  sd ${MINE.sd.toFixed(2)}  no slope ${(100 * MINE.flat).toFixed(2)}%  range ${MINE.lowest}..${MINE.highest}`);
ok(MINE.sd > 5,
  "⭐⭐⭐ the interior has a spread — on the base commit every one of these pixels read 106 and the sd was 0",
  { sd: MINE.sd.toFixed(2), lowest: MINE.lowest, highest: MINE.highest });
ok(MINE.highest - MINE.lowest > 20,
  "⭐⭐ …and there is high ground and low ground, not one plateau", { lowest: MINE.lowest, highest: MINE.highest });
ok(MINE.flat < 0.75,
  "⭐⭐ …so most of it has a slope for the normal map to light — it was 94.7% flat on the owner's world",
  (100 * MINE.flat).toFixed(2) + "%");
{
  // …and it is the same field the comparison above measured, not a second one that happens to vary.
  const field = md.heightmapReliefField(W);
  let checked = 0, same = 0;
  for (let y = IN; y < H - IN; y += 7) for (let x = IN; x < W - IN; x += 7) { checked++; if (hAt(x, y) === field(x, y, 0)) same++; }
  ok(checked > 1000 && same === checked,
    "⭐⭐⭐ every interior pixel is the relief field's own answer at full strength — the raise writes THIS field",
    { checked, same });
}

// ── ⛔ #the-low-ground-is-half-as-varied-as-vanillas — AND WHAT THE WORLD IS ACTUALLY LIT BY ──────────
//
// Everything above measures the heightmap. This measures the LIGHTING, which is what the owner sees:
// map/world_normal.bmp, half the map's resolution, one surface normal per pixel. Ground with no slope gets
// the same vertical normal the ocean does and is drawn with no shading at all.
//
// ⭐ IT IS THE CHECK THE HEIGHTMAP ONES ABOVE COULD NOT MAKE. On the base commit every one of them passed
// while 11.22% of a world built through the owner's own sequence was lit by a flat normal, against the base
// game's 2.26% — because a normal map reads a SIX-pixel neighbourhood and they read one.
//
// Neither side re-implements the maths. Vanilla's share is read out of the file the game ships; Nova's is
// read out of a file Nova's own writer produced. Even "what does no relief look like" is asked of the
// writer — hand it a heightmap with no slope anywhere and read back the triple it writes — and "flat" means
// within one byte of that, which is one step of the writer's own 128 + 127·n encoding and the smallest
// deviation from vertical it can represent.
console.log("\n=== ⛔ …and what the world is LIT by: the share of ground with no relief at all ===");
{
  const level = makeMod();
  const hb = fs.readFileSync(path.join(level.d, "map", "heightmap.bmp"));
  const hoff = hb.readUInt32LE(10);
  for (let i = hoff; i < hb.length; i++) hb[i] = 120;          // no slope anywhere
  fs.writeFileSync(path.join(level.d, "map", "heightmap.bmp"), hb);
  const wn = md.writeWorldNormalFromHeightmap({ modRoot: level.d, gameRoot: NOGAME, dependencyRoots: [],
    changed: { mask: new Uint8Array(W * H).fill(1), W, H } });
  ok(wn.changed === true && wn.pixels > 0, "the relief writer ran over a heightmap with no slope in it", wn);
  const FLAT = normalTripleAt(level.d, NW >> 1, NH >> 1);
  console.log("     level ground is lit by (" + FLAT.join(",") + ") — asked of the writer, not typed here");
  const isFlat = (t) => Math.abs(t[0] - FLAT[0]) <= 1 && Math.abs(t[1] - FLAT[1]) <= 1 && Math.abs(t[2] - FLAT[2]) <= 1;

  const vwn = path.join(GAME, "map", "world_normal.bmp");
  if (!vanillaGround || !fs.existsSync(vwn)) console.log("  ..   (the base game is not installed — the comparison is skipped)");
  else {
    // ⚠️ OVER VANILLA'S OWN BLOCKS, NOT THE LITTLE FIXTURE ABOVE. The largest octave's cell is 512 pixels,
    // so a 1024×512 fixture holds two of them across and one down and is a sample of the field, not the
    // field: its interior comes out mean 105.7 / sd 8.4 against the field's own 114.9 / 20.8. Measuring the
    // lighting there would compare one low-lying corner against a whole planet. So the heightmap here is
    // vanilla-SIZED and carries the field inside the same solid-land blocks the comparison above used —
    // and only those, because only they are measured and the writer is masked to them.
    const { blocks, VW, VH } = vanillaGround;
    const INSET = 2;   // half-res pixels dropped at each block edge: the Sobel there reads outside the block
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nova-relief-lit-")); tmps.push(dir);
    fs.mkdirSync(path.join(dir, "map"), { recursive: true });
    const hrs = Math.floor((8 * VW + 31) / 32) * 4;
    const buf = Buffer.alloc(54 + 1024 + hrs * VH, 120);
    buf.write("BM", 0, "ascii");
    buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54 + 1024, 10); buf.writeUInt32LE(40, 14);
    buf.writeInt32LE(VW, 18); buf.writeInt32LE(VH, 22); buf.writeUInt16LE(1, 26);
    buf.writeUInt16LE(8, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(hrs * VH, 34);
    buf.writeUInt32LE(256, 46); buf.writeUInt32LE(256, 50);
    for (let i = 0; i < 256; i++) { const o = 54 + i * 4; buf[o] = i; buf[o + 1] = i; buf[o + 2] = i; buf[o + 3] = 0; }
    const field = md.heightmapReliefField(VW);
    const mask = new Uint8Array(VW * VH);
    for (const [bx, by] of blocks) {
      for (let y = by; y < by + SIDE; y++) {
        const row = 54 + 1024 + (VH - 1 - y) * hrs;
        for (let x = bx; x < bx + SIDE; x++) { buf[row + x] = field(x, y, 0); mask[y * VW + x] = 1; }
      }
    }
    fs.writeFileSync(path.join(dir, "map", "heightmap.bmp"), buf);
    const VNW = VW / NDIV, VNH = VH / NDIV, vrow = Math.floor((24 * VNW + 31) / 32) * 4;
    const nb = Buffer.alloc(54 + vrow * VNH);
    nb.write("BM", 0, "ascii");
    nb.writeUInt32LE(nb.length, 2); nb.writeUInt32LE(54, 10); nb.writeUInt32LE(40, 14);
    nb.writeInt32LE(VNW, 18); nb.writeInt32LE(VNH, 22); nb.writeUInt16LE(1, 26);
    nb.writeUInt16LE(24, 28); nb.writeUInt32LE(vrow * VNH, 34);
    for (let y = 0; y < VNH; y++) for (let x = 0; x < VNW; x++) {
      const o = 54 + (VNH - 1 - y) * vrow + x * 3;
      nb[o] = 230; nb[o + 1] = 150; nb[o + 2] = 90;    // plainly not flat — the positive control below
    }
    fs.writeFileSync(path.join(dir, "map", "world_normal.bmp"), nb);
    const wn2 = md.writeWorldNormalFromHeightmap({ modRoot: dir, gameRoot: NOGAME, dependencyRoots: [],
      changed: { mask, W: VW, H: VH } });
    ok(wn2.changed === true && wn2.pixels > 0, "Nova's relief writer lit the field over those same blocks", wn2);

    const mb = fs.readFileSync(path.join(dir, "map", "world_normal.bmp"));
    const moff = mb.readUInt32LE(10);
    const vb = fs.readFileSync(vwn);
    const voff = vb.readUInt32LE(10);
    let VVNH = vb.readInt32LE(22); const up = VVNH > 0; VVNH = Math.abs(VVNH);
    const vvrow = Math.floor((24 * vb.readInt32LE(18) + 31) / 32) * 4;
    // ⚠️ THE BLOCKS START AT x = 1, so their half-resolution bounds are not integers — round them, or every
    // index below is a fraction, every byte read is `undefined`, and BOTH sides count zero while the
    // positive control on "nothing is still the starting fill" passes for the same reason. That happened.
    let n = 0, mineFlat = 0, vanFlat = 0, written = 0;
    for (const [bx, by] of blocks) {
      for (let Y = Math.ceil(by / NDIV) + INSET; Y < Math.floor((by + SIDE) / NDIV) - INSET; Y++) {
        for (let X = Math.ceil(bx / NDIV) + INSET; X < Math.floor((bx + SIDE) / NDIV) - INSET; X++) {
          const mo = moff + (VNH - 1 - Y) * vrow + X * 3;
          const mt = [mb[mo + 2], mb[mo + 1], mb[mo]];
          n++;
          if (isFlat(mt)) mineFlat++;
          if (Number.isInteger(mt[0]) && !(mt[0] === 90 && mt[1] === 150 && mt[2] === 230)) written++;
          const vo = voff + (up ? VVNH - 1 - Y : Y) * vvrow + X * 3;
          if (isFlat([vb[vo + 2], vb[vo + 1], vb[vo]])) vanFlat++;
        }
      }
    }
    console.log(`     over ${blocks.length} solid-land blocks, ${n} half-resolution pixels each way`);
    console.log(`     vanilla   ${vanFlat} = ${(100 * vanFlat / n).toFixed(2)}% lit by a flat normal`);
    console.log(`     the field ${mineFlat} = ${(100 * mineFlat / n).toFixed(2)}%`);
    ok(n > 0 && written === n,
      "⚠️ positive control: every pixel counted is a byte the writer wrote — it started at (90,150,230)",
      { pixels: n, written });
    ok(n > 100000, "enough pixels to compare", n);
    ok(vanFlat / n < 0.1,
      "⭐ the base game's own ground is almost all lit by something — this is the yardstick",
      (100 * vanFlat / n).toFixed(2) + "%");
    ok(mineFlat < vanFlat * 2,
      "⭐⭐⭐ …and Nova's is within a factor of two of it — on the base commit it was five times as flat",
      { field: (100 * mineFlat / n).toFixed(2), vanilla: (100 * vanFlat / n).toFixed(2) });
  }

  // …and the little fixture's own lighting is at least written, which is what the raise is responsible for.
  const mb2 = fs.readFileSync(path.join(f.d, "map", "world_normal.bmp"));
  const moff2 = mb2.readUInt32LE(10);
  let fixN = 0, fixUntouched = 0;
  for (const [bx, by] of inner) {
    for (let Y = by / NDIV; Y < (by + SIDE) / NDIV; Y++) for (let X = bx / NDIV; X < (bx + SIDE) / NDIV; X++) {
      const o = moff2 + (NH - 1 - Y) * nRow + X * 3;
      fixN++;
      if (mb2[o + 2] === 90 && mb2[o + 1] === 150 && mb2[o] === 230) fixUntouched++;
    }
  }
  ok(fixN > 1000 && fixUntouched === 0,
    "⭐⭐ the RAISE itself relit every interior pixel it moved — the field is not lit by whatever was there before",
    { pixels: fixN, stillTheStartingFill: fixUntouched });
}

// ── ⚠️ and none of it was bought with land the game draws as sea ─────────────────────────────────────
console.log("\n=== ⚠️ nothing it writes is land under the waterline, beyond the beach's own steps ===");
{
  const floor = Math.min(...md.HEIGHTMAP_RELIEF_CDF.map(([, h]) => h));
  ok(floor > SEA_LEVEL,
    "⭐⭐⭐ the relief curve's own floor is above the render waterline, so the field cannot drown land",
    { floor, SEA_LEVEL });
  // ⚠️ THE CURVE'S FLOOR IS NO LONGER THE FIELD'S. #the-low-ground-is-half-as-varied-as-vanillas adds a
  // detail term on top of the curve in height units, and added and left alone an rms of
  // HEIGHTMAP_RELIEF_DETAIL_RMS reaches about −12 — which would put land ten below the waterline. It is
  // reflected at the curve's floor instead, so the promise above is a promise about the FIELD; checked
  // here as one, over a full map's worth of it, because the line above cannot see the detail at all.
  {
    const field = md.heightmapReliefField(5632);
    let lowest = 255, highest = 0;
    for (let y = 0; y < 2048; y += 3) for (let x = 0; x < 5632; x += 3) {
      const h = field(x, y, 0);
      if (h < lowest) lowest = h;
      if (h > highest) highest = h;
    }
    ok(lowest >= floor,
      "⭐⭐⭐ …and the FIELD's own lowest answer is the curve's floor too — the detail is reflected there, not clipped through it",
      { lowest, floor, highest, detailRms: md.HEIGHTMAP_RELIEF_DETAIL_RMS });
  }
  let under = 0, notRamp = 0;
  const rampValues = new Set(RAMP);
  for (let y = FRAME; y < H - FRAME; y++) for (let x = FRAME; x < W - FRAME; x++) {
    const h = hAt(x, y);
    if (h > SEA_LEVEL) continue;
    under++;
    if (!rampValues.has(h)) notRamp++;
  }
  ok(notRamp === 0,
    "⭐⭐⭐ every land pixel at or below the waterline is one of the beach's own steps — nothing else is under",
    { under, notRamp });
  ok(MINE.lowest > SEA_LEVEL, "⭐⭐ …and not one interior pixel is under it at all", MINE.lowest);
}

// ── ⚠️ the beach survives, step for step ─────────────────────────────────────────────────────────────
console.log("\n=== ⚠️ the coast is still vanilla's beach and not a cliff ===");
{
  // ⚠️ "are the ramp, step for step" until #a-beach-climbs-like-the-base-games: the flat ramp ended in a one-pixel cliff where the
  // relief took over, and the field owns the beach now — from the ramp's 94 at the waterline, climbing with the ground behind it.
  const transect = [], want = [];
  const beachField = md.heightmapReliefField(W);
  for (let k = 0; k < RAMP.length; k++) { transect.push(hAt(FRAME + k, H / 2)); want.push(beachField(FRAME + k, H / 2, k + 1)); }
  console.log("     " + transect.join(" ") + "   (the field at depth 1.." + RAMP.length + " is " + want.join(" ") + "; the ramp is " + RAMP.join(" ") + ")");
  ok(JSON.stringify(transect) === JSON.stringify(want) && transect[0] === RAMP[0],
    "⭐⭐⭐ the pixels in from the shore are the field at their depth, from the ramp's 94 — #new-land-needs-a-beach still holds", { transect, want });
  ok(hAt(FRAME - 1, H / 2) === 89, "⚠️ …and the sea beside it is still the sea floor", hAt(FRAME - 1, H / 2));
  // …and it is not a wall at the far side of the ramp either, which is the same bug one pixel further in.
  let worst = 0;
  for (let y = FRAME + 2; y < H - FRAME - 2; y++) {
    const step = Math.abs(hAt(FRAME + RAMP.length, y) - hAt(FRAME + RAMP.length - 1, y));
    if (step > worst) worst = step;
  }
  ok(worst <= 8,
    "⭐⭐ …and the relief meets the ramp's last step all the way down the coast rather than standing up against it",
    { worstStep: worst });
}

// ── ⚠️ the same map gives the same world ─────────────────────────────────────────────────────────────
console.log("\n=== ⚠️ it is a field: the same map raises to the same bytes ===");
{
  const g = makeMod();
  md.sinkProvincesInHeightmap({ modRoot: g.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [LAND], raise: true });
  const a = fs.readFileSync(path.join(f.d, "map", "heightmap.bmp"));
  const b = fs.readFileSync(path.join(g.d, "map", "heightmap.bmp"));
  ok(Buffer.compare(a, b) === 0,
    "⭐⭐⭐ two mods built the same way raise to a byte-identical heightmap — no seed, nothing random", { bytes: a.length });

  const before = fs.readFileSync(path.join(f.d, "map", "heightmap.bmp"));
  const again = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [LAND], raise: true });
  ok(again.changed === false && Buffer.compare(before, fs.readFileSync(path.join(f.d, "map", "heightmap.bmp"))) === 0,
    "⭐⭐ …and a second click still settles, which the relief must not cost", { changed: again.changed, pixels: again.pixels });
}

// ── ⚠️ the map is a cylinder ─────────────────────────────────────────────────────────────────────────
console.log("\n=== ⚠️ east meets west: no wall down the dateline ===");
{
  const field = md.heightmapReliefField(W);
  let seam = 0, ordinary = 0;
  for (let y = 0; y < H; y++) {
    seam += Math.abs(field(0, y, 0) - field(W - 1, y, 0));
    ordinary += Math.abs(field(100, y, 0) - field(99, y, 0));
  }
  console.log(`     |h(0) - h(W-1)| averages ${(seam / H).toFixed(2)}; an ordinary neighbouring pair ${(ordinary / H).toFixed(2)}`);
  ok(seam / H <= ordinary / H + 0.2,
    "⭐⭐ the field's east edge meets its west edge like any other neighbouring pair",
    { seam: (seam / H).toFixed(2), ordinary: (ordinary / H).toFixed(2) });
}

tmps.forEach((t) => { try { fs.rmSync(t, { recursive: true, force: true }); } catch (_) { /* a temp dir */ } });
console.log(`\n=== generated land is not a plateau: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((x) => console.log("   FAILED: " + x));
process.exit(fails.length ? 1 : 0);
