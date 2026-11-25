// A generated beach climbs from the water the way the base game's does: no ledge where the ramp ends.
// #a-beach-climbs-like-the-base-games
//
// TEST 33's rehearsal (Delete map → Generate land 35% seed 1 → Auto-fix → Redraw), audited against the base game: 452 one-pixel
// land steps of 20 or more, max 26, and 427 of them with their low side at depth 8 — the last step of HEIGHTMAP_BEACH_RAMP.
// Vanilla has 615 such steps over a map with far more coast, and 9 at depth 8. Miarer, inland out to the coast:
//
//     … 139 129 | 103 102 101 100 98 97 97 94
//
// The raise wrote the flat ramp 94 … 103 for depth 1..8 WHATEVER STOOD BEHIND IT, and from depth 9 the relief field, whose fade
// was sqrt((d − 8) / 24): already 0.204 of the way to full strength in its first pixel. 103 + 0.204 · (239 − 103) is 131 — a cliff
// one pixel past a beach. Vanilla's own beach rises with the ground behind it: a mountain coast reads 94.4 / 98.4 / 101.3 / 104.7 /
// 108.7 / 112.6 / 115.5 / 117.9 at depth 1..8.
//
// So the field owns the beach: HEIGHTMAP_COAST_FADE is the share of the way from the ramp to full strength the base game's coast
// has climbed at each depth (its p90 height there, by the writer's own depth rule), and the climb from the waterline is held to
// HEIGHTMAP_RAISE_RIM_SLOPE a pixel — 94 + S·(d − 1) — or the rim lift of a LATER raise next door fires on this beach and stands its
// waterline at 103 (#a-second-raise-must-not-re-cut-the-coast; 1,413 pixels at map width without it).
//
// Section A asks the field, section B the writer, at the full map width so the field reaches the heights it reaches on a real map.
// A5 reads the installed game and SKIPs, saying so, when it is not there.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 400) : "")); }
};
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const NOGAME = path.join(os.tmpdir(), "__no_game_beach_climb__");
const tmps = [];
// the writer's own numbers, read off the module rather than typed in
const RAMP = md.HEIGHTMAP_BEACH_RAMP;
const FADE = md.HEIGHTMAP_COAST_FADE || [];
const S = md.HEIGHTMAP_RAISE_RIM_SLOPE;
const Q90 = (md.HEIGHTMAP_RELIEF_CDF.find((p) => p[0] === 0.9) || [])[1];
const STEP4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ── A. the field ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
console.log("\n=== A. the field climbs from the water no faster than the base game's own steep ground ===");
{
  const W = 5632, H = 2048, GRID = 7, DMAX = Math.max(FADE.length + 2, 40);
  const relief = md.heightmapReliefField(W);
  let n = 0, notBeach = 0, firstNotBeach = null, climb = -Infinity, climbAt = null, past = 0, firstPast = null, lowest = 255;
  for (let y = 0; y < H; y += GRID) for (let x = 0; x < W; x += GRID) {
    n++;
    const at = [];
    for (let d = 0; d <= DMAX; d++) at.push(relief(x, y, d));
    if (at[1] !== RAMP[0]) { notBeach++; if (!firstNotBeach) firstNotBeach = { x, y, got: at[1] }; }
    for (let d = 1; d < DMAX; d++) { const c = at[d + 1] - at[d]; if (c > climb) { climb = c; climbAt = { x, y, d, from: at[d], to: at[d + 1], full: at[0] }; } }
    for (let d = 1; d <= DMAX; d++) if (at[d] < lowest) lowest = at[d];
    if (FADE.length && at[FADE.length + 1] !== at[0]) { past++; if (!firstPast) firstPast = { x, y, got: at[FADE.length + 1], full: at[0] }; }
  }
  console.log("     " + n + " samples, depth 0.." + DMAX + "; largest one-pixel climb " + climb + " " + JSON.stringify(climbAt) + "; lowest " + lowest);
  ok(notBeach === 0, "⭐⭐⭐ A1. one pixel from the water every sample is the ramp's first step — the waterline stays vanilla's 94", { notBeach, of: n, firstNotBeach, beach: RAMP[0] });
  ok(climb <= S, "⭐⭐⭐ A2. no depth climbs more than HEIGHTMAP_RAISE_RIM_SLOPE over the one before it — no ledge where the ramp used to end", { climb, S, climbAt });
  ok(FADE.length > 0 && past === 0, "⭐⭐ A3. past the fade the field is full strength, the same answer as land with no shore", { past, of: n, firstPast, fadeLength: FADE.length });
  ok(lowest >= RAMP[0], "⭐ …and nothing it answers for land is under the beach's own 94", { lowest, beach: RAMP[0] });
}

console.log("\n=== A4. the fade table is a climb from the waterline to full strength ===");
{
  let rising = FADE.length > 0;
  for (let i = 1; i < FADE.length; i++) if (!(FADE[i] >= FADE[i - 1])) rising = false;
  console.log("     " + FADE.length + " entries: " + FADE.join(" "));
  ok(Array.isArray(md.HEIGHTMAP_COAST_FADE) && rising, "⭐⭐ A4. HEIGHTMAP_COAST_FADE is exported and never falls", FADE);
  ok(FADE[0] === 0, "⭐⭐ A4. its first entry is 0: the waterline pixel is the ramp's own 94, as #new-land-needs-a-beach measured", FADE[0]);
  ok(FADE[FADE.length - 1] >= 0.98 && FADE[FADE.length - 1] < 1, "⭐ A4. …and its last is within 2% of full strength, where the next would reach it", FADE[FADE.length - 1]);
  ok(md.HEIGHTMAP_RELIEF_FADE_IN === FADE.length - RAMP.length, "⭐ HEIGHTMAP_RELIEF_FADE_IN is the fade's reach past the ramp, derived, not a second number", { fadeIn: md.HEIGHTMAP_RELIEF_FADE_IN, fade: FADE.length, ramp: RAMP.length });
}

// ── A5. the table is the base game's, re-derived here by the writer's own depth rule ────────────────────────────────────────────
console.log("\n=== 🈯 A5. the fade is the base game's coast, re-derived by the writer's own depth rule ===");
{
  const hp = path.join(GAME, "map", "heightmap.bmp"), dp = path.join(GAME, "map", "definition.csv"), pp = path.join(GAME, "map", "provinces.bmp");
  if (!fs.existsSync(hp) || !fs.existsSync(dp) || !fs.existsSync(pp)) console.log("  SKIP A5: the base game is not installed at " + GAME + ", so the table cannot be re-derived");
  else {
    // depth: 4-neighbour from any pixel that is not a land province's, x wrapping, the rows off the top and bottom of the map water
    const pb = fs.readFileSync(pp), off = pb.readUInt32LE(10), W = pb.readInt32LE(18), H = pb.readInt32LE(22), rs = Math.floor((24 * W + 31) / 32) * 4;
    const landRgb = new Set();
    for (const l of fs.readFileSync(dp, "utf8").split(/\r?\n/)) { const c = l.split(";"); if (c.length >= 5 && /^\d+$/.test(c[0]) && c[0] !== "0" && c[4].trim().toLowerCase() === "land") landRgb.add(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0); }
    const N = W * H, land = new Uint8Array(N);
    for (let y = 0; y < H; y++) { let o = off + (H - 1 - y) * rs; for (let x = 0; x < W; x++, o += 3) land[y * W + x] = landRgb.has(((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0) ? 1 : 0; }
    const hm = md.readIndexedBmp(fs.readFileSync(hp)), hb = fs.readFileSync(hp);
    const CAP = FADE.length + 8, depth = new Uint16Array(N);
    let front = [];
    for (let i = 0; i < N; i++) {
      if (!land[i]) continue;
      const x = i % W, y = (i - x) / W;
      if (y === 0 || y === H - 1 || !land[y * W + (x + 1) % W] || !land[y * W + (x - 1 + W) % W] || !land[i - W] || !land[i + W]) { depth[i] = 1; front.push(i); }
    }
    for (let k = 2; front.length && k <= CAP; k++) {
      const next = [];
      for (const i of front) { const x = i % W, y = (i - x) / W; for (const j of [y * W + (x + 1) % W, y * W + (x - 1 + W) % W, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) if (j >= 0 && land[j] && !depth[j]) { depth[j] = k; next.push(j); } }
      front = next;
    }
    const hist = Array.from({ length: CAP + 1 }, () => new Float64Array(256));
    for (let i = 0; i < N; i++) if (depth[i]) { const x = i % W; hist[depth[i]][hb[hm.pixelOffset(x, (i - x) / W)]]++; }
    // the 90th percentile, each integer height spread evenly over its own unit
    const p90 = (h) => { let n = 0; for (const v of h) n += v; const t = 0.9 * n; let a = 0; for (let v = 0; v < 256; v++) { if (a + h[v] >= t) return v - 0.5 + (t - a) / h[v]; a += h[v]; } return 255; };
    const derived = []; let m = 0;
    for (let d = 1; d <= CAP; d++) {
      const r = RAMP[Math.min(d, RAMP.length) - 1];
      let v = (p90(hist[d]) - r) / (Q90 - r);
      v = Math.max(m, Math.min(1, v)); m = v;
      if (v >= 0.995) break;
      derived.push(+v.toFixed(3));
    }
    let worst = 0, worstAt = -1;
    for (let i = 1; i < Math.min(derived.length, FADE.length); i++) { const e = Math.abs(derived[i] - FADE[i]); if (e > worst) { worst = e; worstAt = i; } }
    console.log("     re-derived " + derived.length + " entries (entry 0 before the pin " + derived[0] + "): " + derived.join(" "));
    ok(Number.isFinite(Q90) && derived.length === FADE.length, "⭐⭐ A5. the base game gives a table of the same length, by the same rule", { derived: derived.length, shipped: FADE.length });
    ok(worst <= 0.005, "⭐⭐⭐ A5. …and every entry past the pinned waterline within 0.005 of the shipped one", { worst, at: worstAt, derived: derived[worstAt], shipped: FADE[worstAt] });
    ok(derived[0] > FADE[0], "⭐ A5. control: the base game's own first entry is above 0, so the pin at the waterline is a choice the test can see", { derived: derived[0], shipped: FADE[0] });
  }
}

// ── B. the writer ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The full map width, so the field reaches 240: all land in an 8-pixel sea frame, with a round sea hole where the field is highest.
// That coast is the steepest the field can make, and the one a second raise next to it lifted 1,413 pixels on without the cap.
function makeMod(W, H, idAt, tag) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-beachclimb-" + tag + "-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="BEACHCLIMB"\nreplace_path="map"\n');
  const COL = { 1: [20, 5, 9], 2: [40, 10, 18] };
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii"); bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[idAt(x, y)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  fs.writeFileSync(path.join(d, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0", `1;${COL[1].join(";")};sea;false;ocean;0`, `2;${COL[2].join(";")};land;false;plains;1`].join("\n") + "\n");
  const hrs = Math.floor((8 * W + 31) / 32) * 4, hsz = hrs * H;
  const hb = Buffer.alloc(54 + 1024 + hsz, 89);
  hb.write("BM", 0, "ascii"); hb.writeUInt32LE(54 + 1024 + hsz, 2); hb.writeUInt32LE(54 + 1024, 10); hb.writeUInt32LE(40, 14);
  hb.writeInt32LE(W, 18); hb.writeInt32LE(H, 22); hb.writeUInt16LE(1, 26); hb.writeUInt16LE(8, 28); hb.writeUInt32LE(0, 30); hb.writeUInt32LE(hsz, 34);
  hb.writeUInt32LE(256, 46); hb.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; hb[o] = i; hb[o + 1] = i; hb[o + 2] = i; hb[o + 3] = 0; }
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), hb);
  return { d, W, H, hrs };
}
const grid = (f) => { const b = fs.readFileSync(path.join(f.d, "map", "heightmap.bmp")); const off = b.readUInt32LE(10); const g = new Uint8Array(f.W * f.H); for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) g[y * f.W + x] = b[off + (f.H - 1 - y) * f.hrs + x]; return g; };

console.log("\n=== B. the writer puts the field's answer on every raised pixel, beach included, and settles ===");
{
  const W = 5632, H = 160, FRAME = 8, R0 = 12, SEA = 1, LAND = 2;
  const relief = md.heightmapReliefField(W);
  let top = { v: -1 };
  for (let y = FRAME + R0 + 4; y < H - FRAME - R0 - 4; y++) for (let x = FRAME + R0 + 4; x < W - FRAME - R0 - 4; x += 2) { const v = relief(x, y, 0); if (v > top.v) top = { v, x, y }; }
  const idAt = (x, y) => (x < FRAME || x >= W - FRAME || y < FRAME || y >= H - FRAME || (x - top.x) ** 2 + (y - top.y) ** 2 <= R0 * R0 ? SEA : LAND);
  const f = makeMod(W, H, idAt, "steep");
  const r1 = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [LAND], raise: true });
  const g = grid(f);
  // the depth, by the test's own walk: from any pixel that is not the land's, x wrapping, the rows off the map water
  const N = W * H, depth = new Int32Array(N);
  let front = [];
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i - x) / W;
    if (idAt(x, y) !== LAND) continue;
    if (STEP4.some(([dx, dy]) => { const b = y + dy; return b < 0 || b >= H || idAt((x + dx + W) % W, b) !== LAND; })) { depth[i] = 1; front.push(i); }
  }
  for (let d = 2; front.length; d++) {
    const next = [];
    for (const i of front) { const x = i % W, y = (i - x) / W; for (const [dx, dy] of STEP4) { const b = y + dy; if (b < 0 || b >= H) continue; const j = b * W + (x + dx + W) % W; if (idAt(j % W, b) !== LAND || depth[j]) continue; depth[j] = d; next.push(j); } }
    front = next;
  }
  let raised = 0, mism = 0, firstMism = null, beachMism = 0, notRamp = 0;
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i - x) / W;
    if (idAt(x, y) !== LAND) continue;
    raised++;
    const want = relief(x, y, depth[i]);
    if (g[i] !== want) { mism++; if (!firstMism) firstMism = { x, y, depth: depth[i], got: g[i], want }; if (depth[i] >= 2 && depth[i] <= RAMP.length) beachMism++; }
    if (depth[i] >= 2 && depth[i] <= RAMP.length && want !== RAMP[depth[i] - 1]) notRamp++;
  }
  // the climb the fade alone would give two pixels in from the hole, against the most a beach may stand over its 94 there
  const d2 = RAMP[1] + (FADE[1] || 0) * (top.v - RAMP[1]);
  console.log("     hole at x " + top.x + " y " + top.y + " where the field reads " + top.v + "; " + raised + " px raised; the fade alone puts depth 2 at " + d2.toFixed(1));
  ok(r1.changed === true && r1.pixels === raised, "the raise lifted every pixel of the land", { changed: r1.changed, pixels: r1.pixels, raised });
  ok(d2 > RAMP[0] + S, "precondition: the fade alone stands depth 2 more than S over the waterline here, so a later raise's rim lift WOULD fire on it", { d2, waterline: RAMP[0], S });
  ok(notRamp > 0, "precondition: on the beach the field's answer is not the old flat ramp somewhere, so a writer that kept the ramp shows", notRamp);
  ok(mism === 0, "⭐⭐⭐ B1. every raised pixel is the field's answer at its own depth — the beach included, not the flat ramp", { mism, beachMism, firstMism });

  const hp = path.join(f.d, "map", "heightmap.bmp"), b0 = fs.readFileSync(hp), mt = fs.statSync(hp).mtimeMs;
  const r2 = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [LAND], raise: true });
  const g2 = grid(f);
  let shoreOff = 0, shore = 0;
  for (let i = 0; i < N; i++) if (depth[i] === 1) { shore++; if (g2[i] !== RAMP[0]) shoreOff++; }
  ok(r2.changed === false && r2.pixels === 0 && Buffer.compare(b0, fs.readFileSync(hp)) === 0 && fs.statSync(hp).mtimeMs === mt,
    "⭐⭐⭐ B2. a second raise over the same land writes nothing — the rim lift does not fire on the raise's own beach (#a-second-raise-must-not-re-cut-the-coast)",
    { changed: r2.changed, pixels: r2.pixels });
  ok(shore > 0 && shoreOff === 0, "⭐⭐ B2. …and every pixel one from the water still reads 94, under the render waterline, as vanilla's does", { shore, shoreOff });
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp dir */ } }
console.log(`\n=== a beach climbs like the base game's: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((l) => console.log("   FAILED: " + l));
process.exit(fails.length ? 1 : 0);
