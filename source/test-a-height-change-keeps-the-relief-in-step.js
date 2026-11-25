// A height Nova writes must be a height the world is LIT by.
// #the-new-continents-have-no-relief
//
// map/world_normal.bmp holds the surface normals HOI4 shades the terrain with, at HALF the map's
// resolution. Nova writes heightmap.bmp on both the sink and the raise, and had never written this one —
// outside the size rule beside MAP_BITMAPS_SCALED_FROM_PROVINCES, `world_normal` appeared nowhere in the
// tree. So after the owner's own sequence (Delete map → Generate land → Auto-fix) every continent Nova
// raised was lit by the ocean's FLAT normal, with no relief at all, and every mountain range Nova drowned
// kept its full relief UNDER THE WATER. The heightmap said one world; the lighting still said the other.
//
// ⭐ THE ENCODING WAS MEASURED BEFORE A BYTE WAS WRITTEN, because a wrong normal map is worse than a flat
// one. The first block below re-derives it from the shipping maps at run time rather than trusting the
// number in the source — a constant nobody re-measures is how the "server.js is CRLF" line in CLAUDE.md
// stayed wrong for weeks.
//
// ⛔ OLD WORLD BLUES IS A REAL COUNTEREXAMPLE ON THE X AXIS. An earlier draft of this file said it was not —
// "there is no relief in it to have a sign" — and that was the comfortable answer rather than the measured
// one. Re-measured: over OWB's steeply sloped ground its x byte moves the way this model says 2.9% of the
// time. It is consistently INVERTED, not noisy. What is true is that its relief is a THIRD as deep as anyone
// else's (mean deviation from flat 7.6 against 21.7–23.4) and 15.8% of its steep pixels are left exactly
// flat, so even fitted with its own sign it beats a flat sheet by 0.18 where this model beats it by 1.23 to
// 1.96 on the other four. One mod's generator with the x axis backwards, against vanilla's own reference.
// The block below MEASURES that rather than asserting it in prose, so nobody later rediscovers OWB and
// "fixes" the sign back. And a mod MAY ship a flat or inverted normal map and still load, which is why none
// of this becomes a validator rule.
//
// ⚠️ ONLY TWO OF THE FOUR AGREEING MAPS ARE INDEPENDENT WITNESSES. R56's world_normal.bmp differs from
// vanilla's in 0.71% of its bytes and RoN's in 0.65% — they ship vanilla's file with local edits. Millennium
// Dawn differs in 77.4%, with a heightmap 90.7% different, so it really did regenerate its own; it is the
// second witness, and it agrees with vanilla at 99.3%.
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
const MD_ROOT = "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649";
const tmps = [];

// ── readers, written here so the test does not lean on the code it is checking ──────────────────────
function openHeight(file) {
  const b = fs.readFileSync(file);
  const off = b.readUInt32LE(10), W = b.readInt32LE(18);
  let H = b.readInt32LE(22); const up = H > 0; H = Math.abs(H);
  const row = (W + 3) & ~3;
  return { W, H, at: (x, y) => b[off + (up ? (H - 1 - y) : y) * row
    + Math.max(0, Math.min(W - 1, x))] , clampY: (y) => Math.max(0, Math.min(H - 1, y)) };
}
function openNormal(file) {
  const b = fs.readFileSync(file);
  const off = b.readUInt32LE(10), W = b.readInt32LE(18);
  let H = b.readInt32LE(22); const up = H > 0; H = Math.abs(H);
  const bpp = b.readUInt16LE(28);
  const row = Math.floor((24 * W + 31) / 32) * 4;
  return { W, H, bpp, off, len: b.length,
    px: (x, y) => { const o = off + (up ? (H - 1 - y) : y) * row + x * 3; return { b: b[o], g: b[o + 1], r: b[o + 2] }; } };
}

// ═══ 🈯 the encoding, re-derived from the maps that ship one ═══════════════════════════════════════
console.log("\n=== 🈯 what IS a HOI4 normal map? (measured, not assumed) ===");
const CORPUS = [["vanilla", GAME], ["Millennium Dawn", MD_ROOT]];
let measured = 0;
for (const [name, root] of CORPUS) {
  const hp = path.join(root, "map", "heightmap.bmp"), wp = path.join(root, "map", "world_normal.bmp");
  if (!fs.existsSync(hp) || !fs.existsSync(wp)) { console.log(`  ..   (${name} is not installed)`); continue; }
  measured++;
  const hm = openHeight(hp), wn = openNormal(wp);
  const DIV = hm.W / wn.W;
  const hAvg = (X, Y) => {
    let s = 0;
    for (let dy = 0; dy < DIV; dy++) for (let dx = 0; dx < DIV; dx++) s += hm.at(X * DIV + dx, hm.clampY(Y * DIV + dy));
    return s / (DIV * DIV);
  };
  const grad = (X, Y) => {   // plain central difference — deliberately NOT the Sobel the writer uses
    const cx = (v) => Math.max(0, Math.min(wn.W - 1, v)), cy = (v) => Math.max(0, Math.min(wn.H - 1, v));
    return [(hAvg(cx(X + 1), Y) - hAvg(cx(X - 1), Y)) / 2, (hAvg(X, cy(Y + 1)) - hAvg(X, cy(Y - 1))) / 2];
  };

  // (a) the FLAT value — the commonest triple in the file
  const tally = new Map();
  let n = 0;
  for (let Y = 0; Y < wn.H; Y += 7) for (let X = 0; X < wn.W; X += 7) {
    const p = wn.px(X, Y); const k = `${p.r},${p.g},${p.b}`;
    tally.set(k, (tally.get(k) || 0) + 1); n++;
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(`  ${name}: ${wn.W}x${wn.H}, ${wn.bpp}-bit, ${DIV}x under its heightmap; commonest triple ${top[0]} at ${(100 * top[1] / n).toFixed(1)}%`);
  ok(DIV === 2, `${name}: world_normal.bmp is half the heightmap in both axes`, DIV);
  ok(wn.bpp === 24, `${name}: it is 24-bit`, wn.bpp);
  // ⚠️ NEUTRAL IS NOT ONE TRIPLE ACROSS THE CORPUS. vanilla, Road to 56, Rise of Nations and Old World Blues
  // all write RGB(128,128,255); Millennium Dawn, which regenerated its file with its own tool, writes
  // RGB(127,127,255). Both mean the same vector — straight up — and differ only in where that encoder puts
  // zero. Nova writes vanilla's 128, because 128 + 127·1 lands on 255 exactly. So what is checked here is
  // that the commonest normal IS the vertical one, not that every map spells it the same way.
  const [tr, tg, tb] = top[0].split(",").map(Number);
  ok(tb === 255 && Math.abs(tr - 128) <= 1 && Math.abs(tg - 128) <= 1,
    `⭐⭐⭐ ${name}: the commonest normal is the vertical one — z at full 255, x and y at neutral`, top);

  // (b) the SIGN, over pixels whose own heightmap genuinely slopes
  // ⛔ EACH AXIS NEEDS ITS OWN DENOMINATOR, and an earlier cut of this block did not give it one: it counted
  // agreements on x but divided by every pixel sloped in EITHER axis, so a hillside running due north-south
  // — no x slope at all, nothing for x to agree with — was counted as an x disagreement. That reported 59%
  // on vanilla and 61% on Millennium Dawn for a relation that is really 96.7% and 99.3%, which reads as "a
  // weak tendency" for something that is in fact the file's own convention. The sums either side of it were
  // right, so the two sign checks passed and the wrong figure printed underneath them unchallenged.
  let sx = 0, sy = 0, nSlope = 0, agreeX = 0, agreeY = 0, nX = 0, nY = 0;
  for (let Y = 2; Y < wn.H - 2; Y += 5) for (let X = 2; X < wn.W - 2; X += 5) {
    const [gx, gy] = grad(X, Y);
    if (Math.abs(gx) < 3 && Math.abs(gy) < 3) continue;
    const p = wn.px(X, Y);
    nSlope++;
    sx += gx * (p.r - 128); sy += gy * (p.g - 128);
    if (Math.abs(gx) >= 3) { nX++; if ((gx > 0) === (p.r < 128)) agreeX++; }
    if (Math.abs(gy) >= 3) { nY++; if ((gy > 0) === (p.g > 128)) agreeY++; }
  }
  console.log(`     over ${nSlope} sloped pixels: sum(dh/dx · (R-128)) = ${sx.toFixed(0)}, sum(dh/dy · (G-128)) = ${sy.toFixed(0)}`
    + `; of the ${nX} sloped in x, R agrees ${(100 * agreeX / nX).toFixed(1)}%; of the ${nY} sloped in y, G agrees ${(100 * agreeY / nY).toFixed(1)}%`);
  ok(sx < 0, `⭐⭐⭐ ${name}: height rising EASTWARD pulls R BELOW 128 (nx = −s·dh/dx)`, sx);
  ok(sy > 0, `⭐⭐⭐ ${name}: height rising SOUTHWARD pushes G ABOVE 128 (ny = +s·dh/dy)`, sy);
  ok(agreeX / nX > 0.9 && agreeY / nY > 0.9,
    `⭐⭐ ${name}: and it is not a weak majority — each sign agrees on over 90% of the pixels sloped in ITS axis`,
    { x: agreeX / nX, y: agreeY / nY, nX, nY });

  // (c) does the constant in the source beat a flat sheet on this map's own shipped file?
  const S = md.WORLD_NORMAL_SLOPE_SCALE;
  const sobel = (X, Y) => {
    const KX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], KY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
    let gx = 0, gy = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const h = hAvg(Math.max(0, Math.min(wn.W - 1, X + i)), Math.max(0, Math.min(wn.H - 1, Y + j)));
      gx += KX[j + 1][i + 1] * h; gy += KY[j + 1][i + 1] * h;
    }
    return [gx / 8, gy / 8];
  };
  let errModel = 0, errFlat = 0, m = 0;
  for (let Y = 3; Y < wn.H - 3; Y += 13) for (let X = 3; X < wn.W - 3; X += 13) {
    const [gx, gy] = sobel(X, Y);
    let nx = -S * gx, ny = S * gy;
    const L = Math.sqrt(nx * nx + ny * ny + 1); nx /= L; ny /= L;
    const enc = (v) => Math.max(0, Math.min(255, Math.round(128 + 127 * v)));
    const p = wn.px(X, Y);
    errModel += Math.abs(enc(nx) - p.r) + Math.abs(enc(ny) - p.g) + Math.abs(enc(1 / L) - p.b);
    errFlat += Math.abs(128 - p.r) + Math.abs(128 - p.g) + Math.abs(255 - p.b);
    m++;
  }
  console.log(`     reconstructing the shipped file with WORLD_NORMAL_SLOPE_SCALE=${S}: mean abs error ${(errModel / (3 * m)).toFixed(2)} per channel, against ${(errFlat / (3 * m)).toFixed(2)} for a flat sheet`);
  ok(errModel < errFlat,
    `⭐⭐⭐ ${name}: the scale in map-data.js reproduces the shipped normal map BETTER than a flat sheet does`,
    { model: errModel / (3 * m), flat: errFlat / (3 * m) });
}
ok(measured > 0, "at least one shipping map was available to calibrate against", measured);

// ── ⛔ the counterexample, MEASURED rather than waved away ────────────────────────────────────────────
// Old World Blues ships an x-inverted normal map. That is a real disagreement and it is recorded here so it
// cannot be rediscovered later as a reason to flip the sign Nova writes. What makes vanilla's convention the
// right one is not a vote: vanilla's file is what hoi4.exe's own shader was written against, Millennium Dawn
// regenerated its file independently and agrees with it, and OWB's relief is a third as deep with a sixth of
// the margin over a flat sheet.
{
  const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";
  const hp = path.join(OWB, "map", "heightmap.bmp"), wp = path.join(OWB, "map", "world_normal.bmp");
  if (!fs.existsSync(hp) || !fs.existsSync(wp)) console.log("  ..   (Old World Blues is not installed)");
  else {
    const hm = openHeight(hp), wn = openNormal(wp), DIV = hm.W / wn.W;
    const hAvg = (X, Y) => { let s = 0; for (let dy = 0; dy < DIV; dy++) for (let dx = 0; dx < DIV; dx++) s += hm.at(X * DIV + dx, hm.clampY(Y * DIV + dy)); return s / (DIV * DIV); };
    let nSlope = 0, agreeX = 0, dev = 0, exactlyFlat = 0;
    for (let Y = 2; Y < wn.H - 2; Y += 5) for (let X = 2; X < wn.W - 2; X += 5) {
      const cx = (v) => Math.max(0, Math.min(wn.W - 1, v));
      const gx = (hAvg(cx(X + 1), Y) - hAvg(cx(X - 1), Y)) / 2;
      if (Math.abs(gx) < 3) continue;          // x-sloped pixels only, so the denominator is x's own
      const p = wn.px(X, Y);
      nSlope++;
      if ((gx > 0) === (p.r < 128)) agreeX++;
      dev += Math.abs(p.r - 128) + Math.abs(p.g - 128) + Math.abs(p.b - 255);
      if (p.r === 128 && p.g === 128 && p.b === 255) exactlyFlat++;
    }
    console.log(`  Old World Blues over ${nSlope} x-sloped pixels: x agrees with Nova's sign ${(100 * agreeX / nSlope).toFixed(1)}%, `
      + `mean deviation from flat ${(dev / (3 * nSlope)).toFixed(1)}, exactly flat ${(100 * exactlyFlat / nSlope).toFixed(1)}%`);
    ok(agreeX / nSlope < 0.2,
      "⛔ Old World Blues really does ship an x-INVERTED normal map — recorded, not explained away", agreeX / nSlope);
    ok(dev / (3 * nSlope) < 15,
      "⚠️ …over relief a third as deep as the maps that agree, which is why vanilla's convention wins", dev / (3 * nSlope));
  }
}

// ── the fixture: 40x8 provinces, a 20x4 world_normal, all of it sea floor ───────────────────────────
const W = 40, H = 8, NW = 20, NH = 4;
const idAtX = (x) => (x < 4 ? 1 : x < 32 ? 2 + Math.floor((x - 4) / 4) : 9);
const COL = {}; for (let i = 1; i <= 9; i++) COL[i] = [i * 20, i * 5, i * 9];
const nRow = Math.floor((24 * NW + 31) / 32) * 4;

function makeMod({ normalW = NW, normalH = NH, height = () => 89, normal = () => [128, 128, 255] } = {}) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-relief-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="RL"\nreplace_path="map"\n');

  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[idAtX(x)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);

  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let i = 1; i <= 9; i++) rows.push(`${i};${COL[i][0]};${COL[i][1]};${COL[i][2]};sea;false;ocean;0`);
  fs.writeFileSync(path.join(d, "map", "definition.csv"), rows.join("\n") + "\n");

  const hrs = Math.floor((8 * W + 31) / 32) * 4, hsz = hrs * H;
  const hb = Buffer.alloc(54 + 1024 + hsz);
  hb.write("BM", 0, "ascii");
  hb.writeUInt32LE(54 + 1024 + hsz, 2); hb.writeUInt32LE(54 + 1024, 10); hb.writeUInt32LE(40, 14);
  hb.writeInt32LE(W, 18); hb.writeInt32LE(H, 22); hb.writeUInt16LE(1, 26);
  hb.writeUInt16LE(8, 28); hb.writeUInt32LE(0, 30); hb.writeUInt32LE(hsz, 34);
  hb.writeUInt32LE(256, 46); hb.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; hb[o] = i; hb[o + 1] = i; hb[o + 2] = i; hb[o + 3] = 0; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) hb[54 + 1024 + (H - 1 - y) * hrs + x] = height(x, y);
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), hb);

  if (normalW > 0) {
    const r = Math.floor((24 * normalW + 31) / 32) * 4, sz = r * normalH;
    const nb = Buffer.alloc(54 + sz);
    nb.write("BM", 0, "ascii");
    nb.writeUInt32LE(54 + sz, 2); nb.writeUInt32LE(54, 10); nb.writeUInt32LE(40, 14);
    nb.writeInt32LE(normalW, 18); nb.writeInt32LE(normalH, 22); nb.writeUInt16LE(1, 26);
    nb.writeUInt16LE(24, 28); nb.writeUInt32LE(sz, 34);
    for (let y = 0; y < normalH; y++) for (let x = 0; x < normalW; x++) {
      const o = 54 + (normalH - 1 - y) * r + x * 3, c = normal(x, y);
      nb[o] = c[2]; nb[o + 1] = c[1]; nb[o + 2] = c[0];      // B,G,R
    }
    fs.writeFileSync(path.join(d, "map", "world_normal.bmp"), nb);
  }
  return d;
}
const normalAt = (d, X, Y) => {
  const b = fs.readFileSync(path.join(d, "map", "world_normal.bmp"));
  const off = b.readUInt32LE(10);
  const o = off + (NH - 1 - Y) * nRow + X * 3;
  return { r: b[o + 2], g: b[o + 1], b: b[o] };
};
const heightAt = (d, x, y) => {
  const b = fs.readFileSync(path.join(d, "map", "heightmap.bmp"));
  const off = b.readUInt32LE(10), hrs = Math.floor((8 * W + 31) / 32) * 4;
  return b[off + (H - 1 - y) * hrs + x];
};
const NOGAME = path.join(os.tmpdir(), "__no_game_relief__");

// ═══ ⛔ the finding: new land is lit by its own slope ═══════════════════════════════════════════════
console.log("\n=== ⛔ land raised out of the sea gets relief ===");
{
  const d = makeMod();
  const before = fs.readFileSync(path.join(d, "map", "world_normal.bmp"));
  // Raise provinces 2..8 → x = 4..31 becomes land. The beach ramp is eight pixels deep at each shore, so
  // this leaves x = 12..23 as a genuine flat plateau between them — which the assertions below need.
  // ⚠️ An earlier cut raised only 3..7 (x = 8..27) and there was no flat interior at all: two eight-pixel
  // ramps consumed sixteen of its twenty pixels, and the "plateau" pixel was a neighbour of the far ramp.
  // The test failed on its own arithmetic rather than on the code.
  const r = md.sinkProvincesInHeightmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [2, 3, 4, 5, 6, 7, 8], raise: true });
  ok(r.changed === true && r.pixels > 0, "the raise ran", { pixels: r.pixels });
  ok(!!r.normal && r.normal.changed === true && r.normal.pixels > 0,
    "⭐⭐⭐ …and it rewrote world_normal.bmp, which nothing in Nova had ever written", r.normal);

  console.log(`     heightmap west→east: ${[2, 3, 4, 5, 6, 8, 12, 16, 20, 23, 26, 29, 30, 31, 32].map((x) => `x${x}=${heightAt(d, x, 4)}`).join(" ")}`);
  const halves = [0, 1, 2, 3, 4, 6, 8, 9, 10, 13, 14, 15, 16, 17].map((X) => ({ X, ...normalAt(d, X, 2) }));
  console.log("     world_normal across it: " + halves.map((h) => `X${h.X}=(${h.r},${h.g},${h.b})`).join(" "));

  // West shore: height rises eastward, so R must fall below 128. East shore: it falls, so R rises above.
  const west = normalAt(d, 2, 2);      // covers x = 4,5 — the beach climbing inland
  const east = normalAt(d, 15, 2);     // covers x = 30,31 — the far beach, height falling eastward
  ok(west.r < 128, "⭐⭐⭐ on the west shore, where height climbs eastward, R is below 128", west);
  ok(east.r > 128, "⭐⭐⭐ on the east shore, where height falls eastward, R is above 128", east);
  ok(west.b < 255 && east.b < 255, "⭐⭐ …and both are tilted off vertical (B below 255)", { west: west.b, east: east.b });
  ok(west.r < 128 && east.r > 128 && (128 - west.r) > 8 && (east.r - 128) > 8,
    "⭐⭐ …and the tilt is a real one, not a rounding wobble", { west: west.r, east: east.r });

  // Level ground HAS a vertical normal — physics, not a gap — so the writer must leave it alone.
  //
  // ⚠️ THIS USED TO ASK THE RAISED INTERIOR, and the raise stopped making level ground underneath it. The
  // continent's middle was one height when this was written; #generated-land-is-a-plateau gave it a spread
  // and #the-low-ground-is-half-as-varied-as-vanillas gave it another, so x = 18,19 now reads 103 and 104
  // and its normal is correctly NOT vertical. The claim is about level ground, so it is asked of level
  // ground: a heightmap with no slope anywhere, lit by the same writer.
  {
    const flatMod = makeMod({ height: () => 120, normal: () => [90, 150, 230] });
    const wn = md.writeWorldNormalFromHeightmap({ modRoot: flatMod, gameRoot: NOGAME, dependencyRoots: [],
      changed: { mask: new Uint8Array(W * H).fill(1), W, H } });
    ok(wn.changed === true && wn.pixels > 0, "the writer ran over a heightmap with no slope in it", wn);
    const mid = normalAt(flatMod, NW >> 1, NH >> 1);
    ok(mid.r === 128 && mid.g === 128 && mid.b === 255,
      "⚠️ level ground keeps a vertical normal — a flat normal on flat ground is RIGHT, not a miss", mid);
  }

  // Header and file length carried byte for byte.
  const after = fs.readFileSync(path.join(d, "map", "world_normal.bmp"));
  ok(after.length === before.length, "⚠️ the file is the same length — only pixel bytes were rewritten", { before: before.length, after: after.length });
  ok(before.subarray(0, 54).equals(after.subarray(0, 54)),
    "⭐⭐ …and its 54-byte header is byte-for-byte what it was, the discipline paintProvincesInTerrainBmp uses");
  const n2 = openNormal(path.join(d, "map", "world_normal.bmp"));
  ok(n2.W === NW && n2.H === NH, "⚠️ …at the half resolution the file itself declares, so bmp_size_mismatch cannot start firing", { W: n2.W, H: n2.H });
}

// ═══ ⛔ the mirror: drowned land loses its relief ═══════════════════════════════════════════════════
console.log("\n=== ⛔ land Nova drowns stops being shaded ===");
{
  // A world of sloped LAND — a ridge climbing eastward — carrying the relief that slope earns.
  const d = makeMod({
    height: (x) => 100 + Math.min(40, x),
    normal: () => [90, 150, 230],       // "the old world's relief", plainly not flat
  });
  const r = md.sinkProvincesInHeightmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [3, 4, 5, 6, 7], raise: false });
  ok(r.changed === true && r.pixels > 0, "the sink ran", { pixels: r.pixels });
  ok(!!r.normal && r.normal.changed === true, "…and rewrote world_normal.bmp with it", r.normal);

  const drowned = [6, 7, 8, 9, 10, 11].map((X) => ({ X, ...normalAt(d, X, 2) }));
  console.log("     under the drowned ground: " + drowned.map((h) => `X${h.X}=(${h.r},${h.g},${h.b})`).join(" "));
  const flatEverywhere = drowned.every((p) => p.r === 128 && p.g === 128 && p.b === 255);
  ok(flatEverywhere,
    "⭐⭐⭐ every half-res pixel inside the drowned region is RGB(128,128,255) — the sea's own flat normal", drowned);

  // Ground the write did NOT touch keeps the relief it had. Nova must not flatten a modder's own mountains.
  const untouched = normalAt(d, 17, 2);   // x = 34,35 — province 9, never sunk
  ok(untouched.r === 90 && untouched.g === 150 && untouched.b === 230,
    "⭐⭐⭐ land outside the change keeps the relief it shipped with — byte for byte", untouched);
}

// ═══ ⛔ an edit in the MIDDLE of sloped ground reads its real neighbours ════════════════════════════
//
// ⛔ THIS BLOCK EXISTS BECAUSE A BACK-OUT DID NOT BITE. The writer keeps two boxes: the half-res pixels it
// RECOMPUTES (the changed pixels grown by one, because Sobel reads ±1) and the box it DOWNSAMPLES the
// heightmap over (grown by two, because computing Sobel on the far edge of that ring reads one further out
// again). Growing both by one is a real bug and a quiet one — the outermost ring then reads its own clamped
// height in place of its neighbour's and gets a gradient that is wrong rather than absent, which would show
// as a faint seam around every edited region with nothing reporting it.
//
// Every other case in this file changes ground that reaches the edge of the fixture, where clamping is the
// correct answer either way, so reverting the fix left them all green. This one raises a province in the
// MIDDLE of a long ramp and compares the result against an independent full recomputation.
console.log("\n=== ⛔ the outer ring of a local edit is computed from real neighbours ===");
{
  // Land everywhere, climbing steadily eastward, except province 5 (x = 16..19) which sits on the sea floor.
  const d = makeMod({ height: (x) => (x >= 16 && x < 20 ? 89 : 100 + x) });
  const r = md.sinkProvincesInHeightmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [5], raise: true });
  ok(r.changed === true && r.normal && r.normal.changed === true, "the raise ran and rebuilt relief", r.normal);

  // An independent reference: block-average the FINAL heightmap on disk, Sobel it, encode it. Deliberately
  // written out again here rather than imported, so it cannot agree with the writer by sharing its mistake.
  const hf = openHeight(path.join(d, "map", "heightmap.bmp"));
  const DIV = 2;
  const hAvg = (X, Y) => {
    const cx = Math.max(0, Math.min(NW - 1, X)), cy = Math.max(0, Math.min(NH - 1, Y));
    let s = 0;
    for (let dy = 0; dy < DIV; dy++) for (let dx = 0; dx < DIV; dx++) s += hf.at(cx * DIV + dx, hf.clampY(cy * DIV + dy));
    return s / (DIV * DIV);
  };
  const S = md.WORLD_NORMAL_SLOPE_SCALE;
  const KX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], KY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
  const reference = (X, Y) => {
    let gx = 0, gy = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const h = hAvg(X + i, Y + j);
      gx += KX[j + 1][i + 1] * h; gy += KY[j + 1][i + 1] * h;
    }
    gx /= 8; gy /= 8;
    let nx = -S * gx, ny = S * gy;
    const L = Math.sqrt(nx * nx + ny * ny + 1);
    const enc = (v) => Math.max(0, Math.min(255, Math.round(128 + 127 * v)));
    return { r: enc(nx / L), g: enc(ny / L), b: enc(1 / L) };
  };

  // Province 5 covers half-res X = 8,9; the ring Sobel can reach is X = 7..10.
  const RING = [7, 8, 9, 10];
  const wrong = [];
  for (const X of RING) for (let Y = 0; Y < NH; Y++) {
    const got = normalAt(d, X, Y), want = reference(X, Y);
    if (got.r !== want.r || got.g !== want.g || got.b !== want.b) wrong.push({ X, Y, got, want });
  }
  console.log("     ring X=7..10: " + RING.map((X) => { const p = normalAt(d, X, 0); return `X${X}=(${p.r},${p.g},${p.b})`; }).join(" "));
  console.log("     reference:    " + RING.map((X) => { const p = reference(X, 0); return `X${X}=(${p.r},${p.g},${p.b})`; }).join(" "));
  ok(wrong.length === 0,
    "⭐⭐⭐ every recomputed pixel matches an independent full recomputation — including the OUTER ring, which only has real neighbours to read if the downsample box is grown by two",
    wrong.slice(0, 4));

  // …and the edit really is interior, so the assertion above is not passing on clamping at the map edge.
  ok(RING[0] > 0 && RING[RING.length - 1] < NW - 1,
    "⚠️ …and the ring is strictly inside the bitmap, so nothing here is satisfied by edge clamping", RING);

  // Ground far from the edit keeps the flat normal it shipped with: a local edit stays local.
  const far = normalAt(d, 1, 0);
  ok(far.r === 128 && far.g === 128 && far.b === 255,
    "⚠️ sloped ground the edit never reached is left exactly as it was — a local edit does not repaint the world", far);
}

// ═══ ⚠️ the controls ═══════════════════════════════════════════════════════════════════════════════
console.log("\n=== ⚠️ controls: nothing moved, nothing written ===");
{
  // (1) A heightmap that does not change must not make the mod acquire a world_normal.bmp.
  const d = makeMod({ normalW: 0 });     // no world_normal of its own; nothing underneath either
  const r = md.sinkProvincesInHeightmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [3], raise: false });
  ok(r.changed === false, "sinking ground that is already the sea floor changes nothing", r);
  ok(!fs.existsSync(path.join(d, "map", "world_normal.bmp")),
    "⭐⭐⭐ …and the mod does not acquire an 8.6 MB world_normal.bmp for a click that moved no height");
}
{
  // (2) The same, with a world_normal present: a no-op raise must leave it byte-identical.
  const d = makeMod({ height: () => 106 });    // already land everywhere
  const before = fs.readFileSync(path.join(d, "map", "world_normal.bmp"));
  const r = md.sinkProvincesInHeightmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [3, 4], raise: true });
  ok(r.changed === false, "raising ground that is already above sea level changes nothing", r);
  ok(before.equals(fs.readFileSync(path.join(d, "map", "world_normal.bmp"))),
    "⭐⭐ …and world_normal.bmp is byte-identical afterwards");
}
{
  // (3) A world_normal that is NOT half the heightmap is REFUSED, not filled in with garbage. That shape is
  //     what bmp_size_mismatch exists to report, and writing normals across the wrong canvas makes it worse.
  const d = makeMod({ normalW: NW, normalH: NH });
  fs.copyFileSync(path.join(d, "map", "world_normal.bmp"), path.join(d, "map", "__keep.bmp"));
  const wrong = makeMod({ normalW: 13, normalH: 3 });
  const before = fs.readFileSync(path.join(wrong, "map", "world_normal.bmp"));
  const r = md.sinkProvincesInHeightmap({ modRoot: wrong, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [3, 4, 5], raise: true });
  ok(r.pixels > 0, "the heightmap write still ran", { pixels: r.pixels });
  ok(r.normal && r.normal.changed === false && /not 2x it|is 13x3/.test(String(r.normal.reason || "")),
    "⭐⭐⭐ a world_normal.bmp that is not half the heightmap is refused, and says why", r.normal);
  ok(before.equals(fs.readFileSync(path.join(wrong, "map", "world_normal.bmp"))),
    "⭐⭐ …and it is left byte-identical rather than written across the wrong canvas");
}
{
  // (4) Running it twice writes nothing the second time — the relief already matches.
  const d = makeMod();
  md.sinkProvincesInHeightmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [3, 4, 5, 6, 7], raise: true });
  const after1 = fs.readFileSync(path.join(d, "map", "world_normal.bmp"));
  const r2 = md.sinkProvincesInHeightmap({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [3, 4, 5, 6, 7], raise: true });
  ok(after1.equals(fs.readFileSync(path.join(d, "map", "world_normal.bmp"))),
    "⭐⭐ a second identical raise leaves world_normal.bmp byte-identical", r2.normal);
}

// ═══ 🈯 the modder is TOLD their mod just took a copy of it ════════════════════════════════════════
//
// heightmapNote's own comment says to "name every file the mod has just taken a copy of, because each is
// ~11.5 MB on vanilla and is what the game reads from then on". world_normal.bmp is now a third such file
// (8.6 MB on vanilla), so leaving it out of that sentence would silently acquire it.
console.log("\n=== 🈯 the note names world_normal.bmp when the mod acquires one ===");
{
  // ⚠️ LIFTED WITH A LINE-ENDING-TOLERANT ANCHOR. public/map.js is CRLF in a fresh worktree and LF in the
  // main checkout, and the neighbouring test's bare-"\n  }\n" anchor finds nothing in the CRLF copy — then
  // slices to indexOf's −1 and reports an EMPTY body, which reads like a passing check with nothing in it.
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const s = MAP.indexOf("function heightmapNote(hm) {");
  const endRe = /\r?\n {2}\}\r?\n/g; endRe.lastIndex = s;
  const hit = s < 0 ? null : endRe.exec(MAP);
  const body = hit ? MAP.slice(s, hit.index + hit[0].length) : "";
  ok(s >= 0 && body.length > 400, "heightmapNote was lifted out of the page", { s, len: body.length });
  let note = null;
  try { note = new Function(body + "\nreturn heightmapNote;")(); } catch (e) { ok(false, "it evaluates", e.message); }
  if (typeof note === "function") {
    const withNormal = note({ pixels: 1817, raised: true, materialized: true,
      terrain: { materialized: true, pixels: 1200 }, normal: { materialized: true, pixels: 480 } });
    console.log("     " + withNormal);
    ok(/map\/world_normal\.bmp/.test(withNormal),
      "⭐⭐⭐ the sentence names map/world_normal.bmp, so an 8.6 MB file is not acquired in silence", withNormal);
    ok(/480/.test(withNormal), "⭐⭐ …and says how much relief was rebuilt", withNormal);
    ok(/map\/heightmap\.bmp, map\/terrain\.bmp and map\/world_normal\.bmp/.test(withNormal),
      "⚠️ three files read as a list, not \"a and b and c\"", withNormal);

    // …and the shapes that predate this item are untouched: no `normal`, no extra clause, no extra file.
    const old = note({ pixels: 1703, raised: false, materialized: true });
    ok(!/world_normal/.test(old) && /1,703/.test(old) && /lowered below sea level/.test(old),
      "⚠️ a note with no relief write is exactly what it was before", old);
    ok(note({ pixels: 0 }) === "" && note(null) === "", "…and nothing levelled still produces no sentence");
  }
}

// ═══ 🔎 BOTH heightmap writers keep the relief in step — derived from the source ════════════════════
//
// The dominant bug shape here is "the fix already exists next door and one caller never adopted it". This
// reads map-data.js for every safeModWrite that targets heightmap.bmp and insists each one's function is
// paired with the normal write, so adding a third writer without wiring it fails here rather than shipping.
console.log("\n=== 🔎 every heightmap writer is paired with the relief write ===");
{
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  // Masked, not stripped: the answer here is a LOCATION (which declaration precedes which write), so the
  // offsets have to survive. And it must be masked at all — this file's own prose names every one of these
  // functions, which is the trap testlib-strip-comments.js exists for.
  const stripped = require("./testlib-strip-comments.js").maskJsComments(src);
  // Every `function NAME(` in the file, with the span of its body, so a write can be attributed to the
  // function it sits in. ⚠️ The attribution is NOT taken from safeModWrite's third argument: in
  // writeProvinceHeightmap that argument is a TERNARY, not a string literal, so a regex reading the label
  // silently skipped the very writer this item is about and reported one writer where there are two.
  const fns = [];
  const fnRe = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let f;
  while ((f = fnRe.exec(stripped)) !== null) {
    // ⚠️ THE FIRST `{` AFTER THE NAME IS THE PARAMETER LIST, NOT THE BODY. Every writer in this file takes a
    // destructured options object — `function writeProvinceHeightmap({ modRoot, … })` — so brace-matching
    // from the first `{` matched the PARAMETERS and gave every function a body a few characters long. The
    // scan then attributed no write to any function and reported zero heightmap writers, which reads exactly
    // like "the check passed with nothing to check". Walk the parentheses first.
    let pd = 0, afterParams = -1;
    for (let i = f.index + f[0].length - 1; i < stripped.length; i++) {
      if (stripped[i] === "(") pd++;
      else if (stripped[i] === ")") { pd--; if (!pd) { afterParams = i; break; } }
    }
    if (afterParams === -1) continue;
    const open = stripped.indexOf("{", afterParams);
    if (open === -1) continue;
    let depth = 0, end = -1;
    for (let i = open; i < stripped.length; i++) {
      if (stripped[i] === "{") depth++;
      else if (stripped[i] === "}") { depth--; if (!depth) { end = i; break; } }
    }
    if (end > f.index) fns.push({ name: f[1], start: f.index, end });
  }
  ok(fns.length > 50, "the source scan really did find the file's functions", fns.length);
  const enclosing = (at) => {
    let best = null;
    for (const fn of fns) if (fn.start <= at && at <= fn.end && (!best || fn.start > best.start)) best = fn;
    return best;
  };

  const writers = new Map();
  const re = /safeModWrite\(\s*([A-Za-z_$][\w$]*)\s*,/g;
  let m;
  while ((m = re.exec(stripped)) !== null) {
    const fn = enclosing(m.index);
    if (!fn) continue;
    const body = stripped.slice(fn.start, m.index);
    // the destination variable must have been built as a heightmap.bmp path inside this function
    if (!new RegExp(`${m[1]}\\s*=[^;]*heightmap\\.bmp`).test(body)) continue;
    writers.set(fn.name, fn);
  }
  console.log(`     functions in map-data.js that write heightmap.bmp: ${[...writers.keys()].join(", ") || "(none)"}`);
  ok(writers.size >= 2, "the source really does hold more than one heightmap writer", [...writers.keys()]);

  // Each must either call the relief write itself, or hand its changed-pixel mask out as `_crossed` for a
  // caller that does. Both are wirings a future writer could forget; neither is assumed.
  for (const [name, fn] of writers) {
    const body = stripped.slice(fn.start, fn.end);
    const emits = /_crossed\s*:\s*\{/.test(body);
    const calls = /writeWorldNormalFromHeightmap\s*\(/.test(body);
    ok(emits === true || calls === true,
      `⭐⭐⭐ ${name} hands its changed-pixel mask on, so the relief cannot silently go stale`, { name, emits, calls });
  }

  // …and every mask a writer emits must be consumed by a relief write somewhere. The definition of
  // writeWorldNormalFromHeightmap is excluded from the call count — otherwise declaring it would "consume"
  // a mask nobody passes it, which is precisely the hole this check exists to catch.
  const consumers = (stripped.match(/(?<!function\s)writeWorldNormalFromHeightmap\s*\(/g) || []).length;
  const emitters = (stripped.match(/_crossed\s*:\s*\{/g) || []).length;
  console.log(`     ${emitters} writer(s) emit a pixel mask; the relief write is CALLED ${consumers} time(s)`);
  ok(emitters >= writers.size - 0 && consumers >= emitters,
    "⭐⭐ every heightmap writer that emits a mask has a relief write to consume it", { emitters, consumers, writers: writers.size });
}

tmps.forEach((t) => { try { fs.rmSync(t, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a height change keeps the relief in step: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
