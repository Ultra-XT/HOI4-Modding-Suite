// Land raised out of the sea must meet the water with a BEACH, not a cliff.
// #new-land-needs-a-beach
//
// THE OWNER'S ISLAND CRASH, after four other faults were fixed and error.log came back COMPLETELY EMPTY:
// the game still died at main-menu paint with EXCEPTION_ACCESS_VIOLATION and not one logged line.
//
// Nova's raise wrote HEIGHTMAP_LAND_VALUE (106) to every pixel of the new island, right up to the water.
// Measured against the game's own coastline — height of a LAND pixel by its distance to the nearest SEA
// pixel, sampled over five vanilla coastlines:
//
//     sea touching land   89
//     distance 1          median 94   (5,693 of 9,612 are exactly 94)
//     distance 2          median 97
//     distance 3..8       97, 98, 100, 101, 102, 103 — a gentle climb
//
// Vanilla steps 89 → 94 → 97 and rises slowly. Nova stepped 89 → 106 in a single pixel: a seventeen-unit
// wall around the entire island. Across ~8,500 sampled coastal land pixels vanilla writes 106 at the
// waterline TWICE.
//
// ⚠️ THIS WAS ALREADY WRITTEN DOWN. The project's own notes say "vanilla's convention is 89/106, NOT the
// wiki's 95 — 90-95 is the BEACH, and levelling at 95 turns coastline into cliff." The beach was
// understood; the raise never built one. Knowing a fact and applying it are different things.
//
// The ramp is vanilla's measured medians, not an invented curve, and it only ever lowers a pixel the raise
// itself just wrote — it cannot touch land the modder already had.
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
const tmps = [];

// ── 🈯 vanilla's own coastline, re-measured so the ramp cannot drift from it ─────────────────────────
console.log("\n=== 🈯 what height does vanilla give land at the water's edge? ===");
{
  const hp = path.join(GAME, "map", "heightmap.bmp"), pp = path.join(GAME, "map", "provinces.bmp");
  if (!fs.existsSync(hp) || !fs.existsSync(pp)) console.log("  ..   (the base game is not installed)");
  else {
    const hb = fs.readFileSync(hp);
    const hoff = hb.readUInt32LE(10), W = hb.readInt32LE(18), H = hb.readInt32LE(22);
    const hrs = Math.floor((8 * W + 31) / 32) * 4;
    const hAt = (x, y) => hb[hoff + (H - 1 - y) * hrs + x];
    const type = new Map(), col = new Map();
    for (const ln of fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
      const c = ln.split(";");
      if (c.length < 8) continue;
      const id = parseInt(c[0], 10);
      if (!Number.isFinite(id)) continue;
      type.set(id, (c[4] || "").trim());
      col.set(((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0, id);
    }
    const pb = fs.readFileSync(pp);
    const poff = pb.readUInt32LE(10), prs = Math.floor((24 * W + 31) / 32) * 4;
    const pid = (x, y) => { const o = poff + (H - 1 - y) * prs + x * 3; const v = col.get(((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0); return v === undefined ? 0 : v; };
    const isSea = (x, y) => { const p = pid(x, y); return p > 0 && type.get(p) === "sea"; };
    const isLand = (x, y) => { const p = pid(x, y); return p > 0 && type.get(p) === "land"; };
    const shore = new Map();
    let n = 0;
    for (const [x0, y0] of [[2700, 300], [800, 700], [3000, 900], [1500, 400]]) {
      for (let y = y0; y < y0 + 200 && y < H - 1; y++) {
        for (let x = x0; x < x0 + 350 && x < W - 1; x++) {
          if (!isLand(x, y)) continue;
          if (!(isSea(x + 1, y) || isSea(x - 1, y) || isSea(x, y + 1) || isSea(x, y - 1))) continue;
          const h = hAt(x, y);
          shore.set(h, (shore.get(h) || 0) + 1); n++;
        }
      }
    }
    const ranked = [...shore.entries()].sort((a, b) => b[1] - a[1]);
    console.log(`     ${n} shoreline land pixels; most common heights: ${ranked.slice(0, 5).map(([h, c]) => h + "x" + c).join("  ")}`);
    ok(n > 2000, "the sample is big enough to calibrate on", n);
    ok(ranked.length > 0 && ranked[0][0] >= 92 && ranked[0][0] <= 96,
      `⭐⭐⭐ vanilla's shoreline sits at ${ranked[0][0]} — just under the waterline of 95, i.e. a beach`, ranked[0]);
    const at106 = shore.get(106) || 0;
    ok(at106 * 200 < n,
      `⭐⭐ …and 106 (the flat land value) appears at the shoreline only ${at106} time(s) in ${n}`, { at106, n });
  }
}

// ── the fixture: a strip of ocean, four provinces of which become land ──────────────────────────────
function makeMod() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-beach-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="BE"\nreplace_path="map"\n');
  // 40x8. Columns 0-3 sea(1), 4-31 the island(2..8, 4px each), 32-39 sea(9).
  const W = 40, H = 8;
  const idAtX = (x) => (x < 4 ? 1 : x < 32 ? 2 + Math.floor((x - 4) / 4) : 9);
  const COL = {}; for (let i = 1; i <= 9; i++) COL[i] = [i * 20, i * 5, i * 9];
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
  // an 8-bit heightmap, all sea floor
  const hrs = Math.floor((8 * W + 31) / 32) * 4;
  const hsz = hrs * H;
  const hb = Buffer.alloc(54 + 1024 + hsz, 89);
  hb.write("BM", 0, "ascii");
  hb.writeUInt32LE(54 + 1024 + hsz, 2); hb.writeUInt32LE(54 + 1024, 10); hb.writeUInt32LE(40, 14);
  hb.writeInt32LE(W, 18); hb.writeInt32LE(H, 22); hb.writeUInt16LE(1, 26);
  hb.writeUInt16LE(8, 28); hb.writeUInt32LE(0, 30); hb.writeUInt32LE(hsz, 34);
  hb.writeUInt32LE(256, 46); hb.writeUInt32LE(256, 50);
  for (let i = 0; i < 256; i++) { const o = 54 + i * 4; hb[o] = i; hb[o + 1] = i; hb[o + 2] = i; hb[o + 3] = 0; }
  for (let i = 0; i < hsz; i++) hb[54 + 1024 + i] = 89;
  fs.writeFileSync(path.join(d, "map", "heightmap.bmp"), hb);
  return { d, W, H, hrs };
}
const hAtOf = (f, x, y) => { const b = fs.readFileSync(path.join(f.d, "map", "heightmap.bmp")); const off = b.readUInt32LE(10); return b[off + (f.H - 1 - y) * f.hrs + x]; };
// How far each pixel of the raised provinces is from water, by the writer's own rule: 4-neighbour, the rows off the top and bottom
// of the map count as water (#a-raise-knows-where-the-map-ends), x wraps. Walked here, not typed, so the field can be asked.
const depthsOf = (f, isLand) => {
  const depth = new Int32Array(f.W * f.H), STEP4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let front = [];
  for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) {
    if (!isLand(x)) continue;
    if (STEP4.some(([dx, dy]) => y + dy < 0 || y + dy >= f.H || !isLand((x + dx + f.W) % f.W))) { depth[y * f.W + x] = 1; front.push(y * f.W + x); }
  }
  for (let d = 2; front.length; d++) {
    const next = [];
    for (const i of front) { const x = i % f.W, y = (i - x) / f.W; for (const [dx, dy] of STEP4) { const b = y + dy; if (b < 0 || b >= f.H) continue; const a = (x + dx + f.W) % f.W, j = b * f.W + a; if (!isLand(a) || depth[j]) continue; depth[j] = d; next.push(j); } }
    front = next;
  }
  return (x, y) => depth[y * f.W + x];
};
const NOGAME = path.join(os.tmpdir(), "__no_game_beach__");

// ── ⛔ the finding ───────────────────────────────────────────────────────────────────────────────────
console.log("\n=== ⛔ raising land out of the sea builds a beach, not a wall ===");
{
  const f = makeMod();
  // raise the middle of the island (provinces 3..7), leaving 2 and 8 as sea so there is a shoreline
  const r = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [3, 4, 5, 6, 7], raise: true });
  ok(r.changed && r.pixels > 0, "the raise ran", r);

  // province 3 occupies x=8..11; province 2 (x=4..7) stays sea, so x=8 is the shoreline
  const shore = hAtOf(f, 8, 4);
  const second = hAtOf(f, 9, 4);
  const inland = hAtOf(f, 18, 4);
  console.log(`     x=8 (shore) ${shore}   x=9 ${second}   x=18 (inland) ${inland}`);
  ok(shore === 94, "⭐⭐⭐ the shoreline pixel is 94 — vanilla's beach, not 106", shore);
  // ⚠️ "=== 97, vanilla's second step" until #a-beach-climbs-like-the-base-games: the flat ramp, written whatever stood behind it,
  // ended in a one-pixel cliff where the relief took over (TEST 33: 427 steps of 20+ at depth 8). The field owns the beach now and
  // climbs from the ramp as vanilla's coast does with the ground behind it, so what is pinned is WHICH answer it takes: the field,
  // two pixels from the water, never under the ramp's own 97.
  const relief = md.heightmapReliefField(f.W), depthAt = depthsOf(f, (x) => x >= 8 && x < 28);
  ok(depthAt(9, 4) === 2 && second === relief(9, 4, 2) && second >= md.HEIGHTMAP_BEACH_RAMP[1],
    "⭐⭐ …the next one in is the field two pixels from the water, from vanilla's second step up", { second, field: relief(9, 4, 2), depth: depthAt(9, 4) });
  // ⚠️ THIS LINE ASSERTED inland === 106 UNTIL #generated-land-is-a-plateau, and that was the bug one
  // layer up: the beach fixed the EDGE and left every continent a flat table at one height. Past the
  // ramp the raise now writes vanilla's own interior relief, so what can be pinned here is the ramp
  // itself — read off the module rather than typed in, so it cannot drift from the writer.
  // ⚠️ …and then the field at each pixel's own depth (#a-beach-climbs-like-the-base-games), the rows off the map counted as water
  // (#a-raise-knows-where-the-map-ends): on this eight-row strip row 4 is four from the bottom edge, so the depth stops at 4.
  const transect = [], want = [];
  for (let k = 0; k < md.HEIGHTMAP_BEACH_RAMP.length; k++) { transect.push(hAtOf(f, 8 + k, 4)); want.push(relief(8 + k, 4, depthAt(8 + k, 4))); }
  ok(JSON.stringify(transect) === JSON.stringify(want),
    "⭐⭐⭐ the eight pixels in from the shore are the field at their own depth, step for step",
    { transect, want, ramp: md.HEIGHTMAP_BEACH_RAMP });
  ok(inland > 95 && inland !== md.HEIGHTMAP_BEACH_RAMP[0],
    "⭐⭐ …and the interior past it stands above the waterline and is not beach", inland);
  ok(shore < 95 && inland > 95,
    "⚠️ …so the coast sits BELOW the render waterline of 95 and the interior above it", { shore, inland });

  // the sea it meets is untouched
  ok(hAtOf(f, 5, 4) === 89, "⚠️ the sea beside it is still the sea floor", hAtOf(f, 5, 4));
}

// ── ⚠️ a raise with no shoreline at all is still flat land ──────────────────────────────────────────
console.log("\n=== ⚠️ land with no water beside it needs no beach ===");
{
  const f = makeMod();
  // raise EVERYTHING, so no pixel touches water
  md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [1, 2, 3, 4, 5, 6, 7, 8, 9], raise: true });
  // ⚠️ "the flat land value" until #generated-land-is-a-plateau. With nothing to build a beach against,
  // every pixel takes the interior relief at full strength. What has to hold is that NO pixel is beach:
  // the relief curve's own floor is two above the waterline, so nothing here can read as water.
  // ⚠️ …but the top and bottom of the map ARE a shore (#a-raise-knows-where-the-map-ends): land raised against the edge of the
  // world used to stand there at full strength, where vanilla's row 0 reads 95.6 and climbs. So the rows inside are not beach, and
  // the two edge rows are the beach's 94. Until then this said "every pixel stands above the waterline".
  let lowest = 255, highest = 0, edgeOff = 0;
  for (let y = 0; y < f.H; y++) for (let x = 0; x < f.W; x++) {
    const h = hAtOf(f, x, y);
    if (y === 0 || y === f.H - 1) { if (h !== md.HEIGHTMAP_BEACH_RAMP[0]) edgeOff++; continue; }
    if (h < lowest) lowest = h; if (h > highest) highest = h;
  }
  ok(lowest > 95, "⭐⭐ with no shoreline there is no beach — every pixel inside the map's edge rows stands above the waterline", { lowest, highest });
  ok(edgeOff === 0, "⭐⭐ …and the edge rows, where the world ends, are the beach's 94", edgeOff);
  ok(highest > lowest, "⭐⭐ …and it is relief, not a table: the heights are not all one number", { lowest, highest });
}

// ── ⚠️ the SINK direction is unchanged — vanilla's sea floor is flat 89 ─────────────────────────────
console.log("\n=== ⚠️ sinking is untouched: vanilla's sea floor really is flat ===");
{
  const f = makeMod();
  // make it all land first, then sink the middle
  md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [1, 2, 3, 4, 5, 6, 7, 8, 9], raise: true });
  const r = md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: [4, 5], raise: false });
  ok(r.changed, "the sink ran", r);
  // ⚠️ x=13 is province 4 and x=16 is province 5 — the two that were sunk. An early cut checked x=20,
  // which is province 6 and was never sunk, so the test failed on its own arithmetic rather than the code.
  ok(hAtOf(f, 13, 4) === 89 && hAtOf(f, 16, 4) === 89,
    "⭐⭐ every sunk pixel is 89 — no ramp, because vanilla's sea floor is flat (823,969 of its sea pixels)",
    { p4: hAtOf(f, 13, 4), p5: hAtOf(f, 16, 4), untouchedNeighbour: hAtOf(f, 20, 4) });
}

tmps.forEach((t) => { try { fs.rmSync(t.d || t, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== new land needs a beach: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
