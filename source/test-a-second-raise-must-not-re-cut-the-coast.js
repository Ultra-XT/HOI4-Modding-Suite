// A raise must SETTLE. Run it twice over the same provinces and the second run must write nothing.
// #a-second-raise-must-not-re-cut-the-coast
//
// MEASURED ON THE OWNER'S OWN WORLD (new mod -> Delete map -> Generate land 35% -> Auto-fix), batch 19:
// re-running the raise over the 4,654 land provinces of that map rewrote map/heightmap.bmp and moved 484
// pixels — 408 of them 94 -> 106. 94 is the beach the ramp itself writes, and it is at or below the
// waterline of 95, so the next raise read the writer's own beach back as sea floor.
//
// ⛔ THE SAME BLIND SPOT COST THE MODDER LAND UNDER THE WATERLINE, which is the half that matters more.
// Auto-fix fills an inland sea in by making it land, and that runs the raise for that one province. The
// raise looked at the land all around it, saw a beach reading 94, called it ocean, and built a beach
// against it — so the filled-in sea came out 94s and 97s inside a ring of 94. On his map that is province
// 6361: 29 pixels, 18 of them (62%) at or below the waterline — "land" in definition.csv that HOI4 draws
// as water. And the ring that used to face that water stayed at 94 once the water was gone: a one-pixel
// trench, under the waterline, through the middle of a continent. 484 of those survived his flow.
//
// ⚠️ QUOTE THE FRACTION. A first draft of this header said the province "never rose above the waterline at
// all"; 11 of its 29 pixels read 97, which is above it. What makes 62% a finding is vanilla's own spread:
// over its 7,523 land provinces of 100+ pixels the share of each at or below 95 has a median of 0.0%, a
// 90th percentile of 10.1% and a 99th of 36.3%. This project has had to correct exactly this shape of
// overclaim before, in the note beside HEIGHTMAP_SEA_VALUE.
//
// The fix is one idea, not two: WHETHER A PIXEL IS WATER IS A QUESTION FOR definition.csv, NOT FOR ITS
// HEIGHT. A land province's pixel is land however low it reads. So the raise settles a height FIELD — 106
// inland, vanilla's measured ramp where it still meets water — over its own submerged pixels plus any
// already-land pixel still under the waterline beside them, and every height it writes is a function of
// distance to water that is still water. Run it again and there is nothing to change.
//
// ⚠️ It must not do that by moving the numbers: #new-land-needs-a-beach measured vanilla's coastline at
// 89 -> 94 -> 97 and a coast with no ramp is a cliff wall. The beach below is checked here too.
//
// 📊 THE WHOLE FLOW, RUN TWICE WITH ONLY THE RAISE SWAPPED (new mod -> own the map -> Delete map ->
// Generate land 35% seed 1 -> Auto-fix x2, against the installed game). The two runs produce a
// BYTE-IDENTICAL map/definition.csv, map/provinces.bmp and map/terrain.bmp — the generator is deterministic
// and the heightmap is the only thing that moves:
//
//     the raise as it was   a second raise over all 4,721 land provinces reports 41,223 pixels and
//                           rewrites map/heightmap.bmp; it settles on the click after that
//     with this             that second raise reports changed:false, pixels:0, and never opens the file
//
// Both worlds end with the same 32,381 of 5,296,860 land pixels (0.61%) at or below the waterline — the
// beach. The old one needed two clicks to get there and still holds 18,183 pixels of beach ramp built
// against land rather than water; this one settles on the click that made the land.
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
const NOGAME = path.join(os.tmpdir(), "__no_game_settle__");
const tmps = [];

// The ramp and the waterline are the writer's own, read off the module rather than typed in here: a test
// that carries its own copy of the numbers stops moving when they do.
const SEA_LEVEL = md.HEIGHTMAP_SEA_LEVEL;
const RAMP_DEPTH = 8;   // asserted against the source below, never assumed

// ── the fixture: one big land province with a sea pocket inside it, and open sea at both edges ───────
//
//   x:  0..3   sea 1        4..35  land 2 (with province 3, a 4x4 sea pocket, at x 18..21 y 4..7)
//                           36..39 sea 9
const W = 40, H = 12;
const POCKET = { x0: 18, x1: 21, y0: 4, y1: 7 };
const idAt = (x, y) => (x < 4 ? 1 : x >= 36 ? 9 : (x >= POCKET.x0 && x <= POCKET.x1 && y >= POCKET.y0 && y <= POCKET.y1) ? 3 : 2);
const COL = { 1: [20, 5, 9], 2: [40, 10, 18], 3: [60, 15, 27], 9: [180, 45, 81] };

function makeMod() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-settle-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="SETTLE"\nreplace_path="map"\n');
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(54 + imageSize, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[idAt(x, y)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  // everything starts as sea, exactly as Delete map leaves it
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (const i of [1, 2, 3, 9]) rows.push(`${i};${COL[i][0]};${COL[i][1]};${COL[i][2]};sea;false;ocean;0`);
  fs.writeFileSync(path.join(d, "map", "definition.csv"), rows.join("\n") + "\n");
  // an 8-bit heightmap, all sea floor
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
  return { d, hrs };
}
const hAt = (f, x, y) => { const b = fs.readFileSync(path.join(f.d, "map", "heightmap.bmp")); const off = b.readUInt32LE(10); return b[off + (H - 1 - y) * f.hrs + x]; };
const heights = (f) => { const b = fs.readFileSync(path.join(f.d, "map", "heightmap.bmp")); const off = b.readUInt32LE(10); const g = []; for (let y = 0; y < H; y++) { const r = []; for (let x = 0; x < W; x++) r.push(b[off + (H - 1 - y) * f.hrs + x]); g.push(r); } return g; };
const retype = (f, id, type) => {
  const p = path.join(f.d, "map", "definition.csv");
  const out = fs.readFileSync(p, "utf8").split("\n").map((l) => {
    const c = l.split(";");
    return c[0] === String(id) ? c.map((v, i) => (i === 4 ? type : i === 6 ? (type === "land" ? "plains" : "ocean") : i === 7 ? (type === "land" ? "1" : "0") : v)).join(";") : l;
  });
  fs.writeFileSync(p, out.join("\n"));
};
const raise = (f, ids) => md.sinkProvincesInHeightmap({ modRoot: f.d, gameRoot: NOGAME, dependencyRoots: [], provinceIds: ids, raise: true });

// ── 🈯 the ramp the fix must not move ────────────────────────────────────────────────────────────────
console.log("\n=== 🈯 the beach is still vanilla's, and the waterline has not moved ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const m = SRC.match(/HEIGHTMAP_BEACH_RAMP\s*=\s*\[([^\]]*)\]/);
  const ramp = m ? m[1].split(",").map((s) => parseInt(s, 10)) : [];
  console.log("     sea level " + SEA_LEVEL + ", ramp " + JSON.stringify(ramp));
  ok(SEA_LEVEL === 95, "the render waterline is still 95 — the fix did not move it", SEA_LEVEL);
  ok(ramp.length === RAMP_DEPTH && ramp[0] === 94 && ramp[1] === 97,
    "⭐ …and the beach is still vanilla's measured 94 then 97, eight deep", ramp);
  ok(ramp[0] <= SEA_LEVEL,
    "⚠️ …which is the whole trap: the beach the writer itself puts down reads BELOW the waterline", { beach: ramp[0], SEA_LEVEL });
}

// ── ⛔ the finding, first half: filling an inland sea in must not build a beach against land ─────────
console.log("\n=== ⛔ land raised inside land is solid land, not a bowl ===");
{
  const f = makeMod();
  // 1. the continent, as Generate land makes it: province 2 becomes land while 1, 3 and 9 are still sea.
  retype(f, 2, "land");
  const r1 = raise(f, [2]);
  ok(r1.changed === true && r1.pixels > 0, "the continent was raised", { changed: r1.changed, pixels: r1.pixels });
  ok(hAt(f, 17, 5) === 94, "…with a beach facing the inland sea, as it should have while that sea was water", hAt(f, 17, 5));

  // 2. Auto-fix fills that inland sea in: province 3 becomes land, and the raise runs for it alone.
  retype(f, 3, "land");
  const r2 = raise(f, [3]);
  ok(r2.changed === true, "filling the inland sea in ran the raise", { changed: r2.changed, pixels: r2.pixels });

  let below = [];
  for (let y = POCKET.y0; y <= POCKET.y1; y++) for (let x = POCKET.x0; x <= POCKET.x1; x++) if (hAt(f, x, y) <= SEA_LEVEL) below.push([x, y, hAt(f, x, y)]);
  ok(below.length === 0,
    "⭐⭐⭐ every pixel of the filled-in sea is ABOVE the waterline — no bowl the game would still draw as water",
    { below: below.slice(0, 8), of: 16 });
  // ⚠️ "the flat land value" until #generated-land-is-a-plateau. Nothing beside it is water any more, so
  // there is no shore to fade in from and the filled-in pocket takes the interior relief at FULL strength
  // — which is precisely what a distance-from-shore of 0 means to the field. Asked of the field itself,
  // not typed in, because the point being pinned is WHICH answer it takes, not what that answer is.
  // ⚠️ …within what the land around it lets it stand: #a-raise-stands-on-the-land-around-it holds it to the
  // land beside it, HEIGHTMAP_RAISE_RIM_SLOPE a pixel above or below. This fixture's field reads 102-106 beside the
  // 97..103 beach that stays, inside both, so the full-strength answer still stands here; test-a-raise-stands-on-the-land-around-it.js has the walls.
  const relief = md.heightmapReliefField(W);
  ok(hAt(f, 19, 5) === relief(19, 5, 0) && hAt(f, 20, 6) === relief(20, 6, 0),
    "⭐⭐ …it is the interior relief at full strength, because nothing beside it is water any more — within what the land around it lets it stand (#a-raise-stands-on-the-land-around-it)",
    { got: [hAt(f, 19, 5), hAt(f, 20, 6)], field: [relief(19, 5, 0), relief(20, 6, 0)] });

  // 3. …and the beach that used to face it is not a beach any more.
  const ring = [];
  for (let y = POCKET.y0 - 1; y <= POCKET.y1 + 1; y++) for (let x = POCKET.x0 - 1; x <= POCKET.x1 + 1; x++) {
    if (x >= POCKET.x0 && x <= POCKET.x1 && y >= POCKET.y0 && y <= POCKET.y1) continue;
    if (hAt(f, x, y) <= SEA_LEVEL) ring.push([x, y, hAt(f, x, y)]);
  }
  ok(ring.length === 0,
    "⭐⭐⭐ …and the ring that faced it is lifted with it — no one-pixel trench left under the waterline",
    { stillUnder: ring.slice(0, 8) });

  // 4. the real coast, fourteen pixels away, is untouched — the fix did not flatten the world's shoreline.
  // ⚠️ "then 97" until #a-beach-climbs-like-the-base-games: past the waterline the field owns the beach, so the second pixel is the
  // field two from the water (x 5 is two from the sea at x 3, and further than that from the map's top and bottom).
  const next = relief(5, 5, 2);
  ok(hAt(f, 4, 5) === 94 && hAt(f, 5, 5) === next,
    "⭐⭐ the open coast still steps 94 then the field two from the water — #new-land-needs-a-beach still holds", { shore: hAt(f, 4, 5), next: hAt(f, 5, 5), field: next });
  ok(hAt(f, 35, 5) === 94 && hAt(f, 3, 5) === 89,
    "…on the far side too, and the sea beside it is still the sea floor", { far: hAt(f, 35, 5), sea: hAt(f, 3, 5) });
}

// ── ⛔ the finding, second half: a click has to SETTLE ────────────────────────────────────────────────
console.log("\n=== ⛔ a second raise over the same land writes nothing at all ===");
{
  const f = makeMod();
  retype(f, 2, "land"); raise(f, [2]);
  retype(f, 3, "land"); raise(f, [3]);

  const hmPath = path.join(f.d, "map", "heightmap.bmp");
  const before = fs.readFileSync(hmPath);
  const mtime = fs.statSync(hmPath).mtimeMs;
  const again = raise(f, [2, 3]);
  const after = fs.readFileSync(hmPath);

  ok(Buffer.compare(before, after) === 0,
    "⭐⭐⭐ map/heightmap.bmp is byte-for-byte what it was", { bytes: before.length });
  ok(again.changed === false && again.pixels === 0,
    "⭐⭐ …and the writer says so rather than reporting a change it did not make", { changed: again.changed, pixels: again.pixels });
  ok(fs.statSync(hmPath).mtimeMs === mtime,
    "⭐⭐ …and the file was never written, so the click does not spend a backup slot on nothing", { mtime, now: fs.statSync(hmPath).mtimeMs });

  const third = raise(f, [2, 3]);
  ok(third.changed === false, "a third click is the same", third);
}

// ── ⚠️ …without stopping the raise doing its job ─────────────────────────────────────────────────────
console.log("\n=== ⚠️ a real change is still a real change ===");
{
  const f = makeMod();
  retype(f, 2, "land");
  const r = raise(f, [2]);
  const g = heights(f);
  // ⚠️ counted against the SEA FLOOR it all started at, not against 106: past #generated-land-is-a-plateau
  // the interior is a relief field and no single number is the interior any more.
  let moved = 0, beach = 0, interior = 0;
  for (let y = 0; y < H; y++) for (let x = 4; x < 36; x++) {
    if (idAt(x, y) !== 2) continue;
    if (g[y][x] !== 89) moved++;
    if (g[y][x] === md.HEIGHTMAP_BEACH_RAMP[0]) beach++; else if (g[y][x] > SEA_LEVEL) interior++;
  }
  console.log("     " + moved + " pixels moved: " + beach + " at the shoreline step, " + interior + " standing above the waterline");
  ok(beach > 0 && interior > 0, "the continent has both an interior and a shoreline", { beach, interior });
  ok(r.pixels === moved,
    "⭐⭐ the count it reports is the number of pixels that actually MOVED, not the number it looked at", { reported: r.pixels, moved });
  ok(hAt(f, 18, 5) === 89, "⚠️ the inland sea it has NOT been asked to fill is untouched", hAt(f, 18, 5));
}

// ── 🈯 THE CRY-WOLF CONTROL, on the shipping map itself ──────────────────────────────────────────────
console.log("\n=== 🈯 on the base game: the blast radius is the beach, and the second click is silent ===");
{
  const hp = path.join(GAME, "map", "heightmap.bmp"), pp = path.join(GAME, "map", "provinces.bmp");
  if (!fs.existsSync(hp) || !fs.existsSync(pp)) console.log("  ..   (the base game is not installed)");
  else {
    // 209 is a real vanilla SEA province with a real coastline beside it. Retype it to land in a scratch
    // mod — the same edit the province inspector makes — and raise it.
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-settle-van-")); tmps.push(d);
    fs.mkdirSync(path.join(d, "map"), { recursive: true });
    fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="SETTLE2"\n');
    const def = fs.readFileSync(path.join(GAME, "map", "definition.csv"), "utf8");
    const rows = def.split(/\r?\n/);
    const idx = rows.findIndex((l) => l.split(";")[0] === "209");
    rows[idx] = rows[idx].split(";").map((v, i) => (i === 4 ? "land" : i === 6 ? "plains" : i === 7 ? "1" : v)).join(";");
    fs.writeFileSync(path.join(d, "map", "definition.csv"), rows.join("\n"));

    const vanillaH = fs.readFileSync(hp);
    const r = md.sinkProvincesInHeightmap({ modRoot: d, gameRoot: GAME, dependencyRoots: [], provinceIds: [209], raise: true });
    ok(r.changed === true && r.pixels > 0, "raising a real vanilla sea province ran", { changed: r.changed, pixels: r.pixels });

    const mine = fs.readFileSync(path.join(d, "map", "heightmap.bmp"));
    ok(mine.length === vanillaH.length, "the mod's heightmap is the same shape as the one it materialised from", { a: mine.length, b: vanillaH.length });

    // Where it wrote: province 209's own pixels, or a pixel that was AT OR BELOW the waterline before.
    // Both derived from the bitmaps, not typed in — a pixel vanilla had standing above water is untouched.
    const hm = md.readIndexedBmp(vanillaH);
    const pbuf = fs.readFileSync(pp);
    const off = pbuf.readUInt32LE(10), VW = pbuf.readInt32LE(18), VH = pbuf.readInt32LE(22);
    const prow = Math.floor((24 * VW + 31) / 32) * 4;
    const c209 = (() => { const c = rows[idx].split(";"); return ((+c[1] << 16) | (+c[2] << 8) | +c[3]) >>> 0; })();
    let moved = 0, own = 0, wasUnder = 0, standingLandTouched = 0;
    for (let y = 0; y < VH; y++) {
      for (let x = 0; x < VW; x++) {
        const o = hm.pixelOffset(x, y);
        if (mine[o] === vanillaH[o]) continue;
        moved++;
        const po = off + (VH - 1 - y) * prow + x * 3;
        if ((((pbuf[po + 2] << 16) | (pbuf[po + 1] << 8) | pbuf[po]) >>> 0) === c209) { own++; continue; }
        if (vanillaH[o] <= SEA_LEVEL) wasUnder++; else standingLandTouched++;
      }
    }
    console.log(`     ${moved} pixels moved: ${own} in province 209 itself, ${wasUnder} beach beside it, ${standingLandTouched} standing above water`);
    ok(moved > 0, "it wrote something", moved);
    ok(standingLandTouched === 0,
      "⭐⭐⭐ NOT ONE pixel vanilla had standing above the waterline was touched — the modder's land is safe",
      standingLandTouched);
    ok(own > 0 && wasUnder > 0,
      "…and what it did touch is the province itself plus the beach that faced it", { own, wasUnder });
    ok(wasUnder * 3 < own,
      "⚠️ the beach it reaches into is a fringe, not the map — the reach outside the province is the ramp's own depth",
      { wasUnder, own });

    const b1 = fs.readFileSync(path.join(d, "map", "heightmap.bmp"));
    const again = md.sinkProvincesInHeightmap({ modRoot: d, gameRoot: GAME, dependencyRoots: [], provinceIds: [209], raise: true });
    const b2 = fs.readFileSync(path.join(d, "map", "heightmap.bmp"));
    ok(again.changed === false && again.pixels === 0 && Buffer.compare(b1, b2) === 0,
      "⭐⭐⭐ …and a second click on the shipping map writes nothing", { changed: again.changed, pixels: again.pixels });
  }
}

tmps.forEach((t) => { try { fs.rmSync(t, { recursive: true, force: true }); } catch (_) { /* a temp dir */ } });
console.log(`\n=== a second raise must not re-cut the coast: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
