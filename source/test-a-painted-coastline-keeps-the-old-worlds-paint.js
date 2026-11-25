// ⛔ #a-painted-coastline-keeps-the-old-worlds-paint — THE PAINT BRUSH TOOK TWO OF THE FOUR BITMAP WRITERS.
//
// Nova has TWO heightmap writers. writeProvinceHeightmap moves a whole province across the waterline, and
// everything that calls it goes through sinkProvincesInHeightmap, which calls all four of the files the
// renderer reads for those pixels side by side — heightmap.bmp, terrain.bmp, trees.bmp, world_normal.bmp —
// with a comment saying that is deliberate, "so no caller can take one without the others".
//
// levelPaintedPixels is the OTHER one. Paint shape changes no province's type; it hands PIXELS from one
// province to another, which is how a modder extends a peninsula or carves a bay, so the question is per
// pixel rather than per province. It had adopted two of the four: the height moved and the relief followed
// it, while terrain.bmp and trees.bmp went on drawing the world the paint had just replaced. The dominant
// bug shape on this project — "the fix already exists next door and one caller never adopted it".
//
// ⚠️ THE GUARD THAT SHOULD HAVE CAUGHT IT PASSED. test-a-height-change-keeps-the-relief-in-step derives both
// heightmap writers out of map-data.js and insists each one is paired with the relief write — and that is
// all it asks. applyProvinceDiff called writeWorldNormalFromHeightmap, so it satisfied that guard while two
// of the four files stayed stale. The first block below is therefore derived from sinkProvincesInHeightmap
// itself rather than from a list typed here: whatever THAT path calls, the paint path must call too, so a
// fifth writer cannot be added to one and forgotten in the other.
//
// 📊 MEASURED by driving /api/map/paint-provinces with the body public/map.js sends, on a copy of Millennium
// Dawn and on a fresh mod over the base game (2026-09-17):
//   • sea→land, brush r=14 on the fresh mod: 165 of 425 new-land pixels (38.8%) were left carrying
//     terrain.bmp's OCEAN index — land the game draws as open water. Afterwards: 0.
//   • land→sea, brush r=30 on the Millennium Dawn copy: ONE stroke left 367 more vegetated trees.bmp blocks
//     standing entirely over open water (6,488 → 6,855). Afterwards the same stroke leaves −1.
//
// ⚠️ CRY-WOLF, MEASURED BOTH WAYS. A SEA pixel carrying a LAND index is the shoreline blend every shipping
// map paints on purpose — about 3.7% of vanilla's sea pixels — so that direction is deliberately left alone
// and this file MEASURES it rather than asserting it. A LAND pixel carrying a WATER index is the rare one,
// and the block at the end re-derives both rates from the installed maps instead of trusting these numbers.
//
// ⚠️ The control matters as much as the fix: an ordinary LAND-TO-LAND reshape is the common case by far and
// must still write nothing at all, or every paint stroke would drag 11.5 MB bitmaps into the mod.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};
const tmps = [];
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const mk = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oldpaint-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="OldPaint"\nsupported_version="1.19.*"\n');
  return d;
};

// ═══ 🔎 whatever the province-level path writes, the PAINT path writes too — derived from the source ═══
//
// Not a list typed here. The writers are read out of sinkProvincesInHeightmap's own body, so adding a fifth
// there and forgetting it in applyProvinceDiff fails HERE rather than shipping a half-drawn world.
console.log("\n=== 🔎 the paint path calls every bitmap writer the province path calls ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  // Masked, not stripped: this file's own prose names every one of these functions, and the offsets have to
  // survive because the answer is WHICH function body a call sits in.
  const stripped = require("./testlib-strip-comments.js").maskJsComments(SRC);
  const bodyOf = (name) => {
    const at = stripped.indexOf(`function ${name}(`);
    if (at < 0) return "";
    // walk the parameter list first — every writer here takes a destructured options object, so the first
    // "{" after the name is the PARAMETERS, not the body.
    let pd = 0, afterParams = -1;
    for (let i = stripped.indexOf("(", at); i < stripped.length; i++) {
      if (stripped[i] === "(") pd++;
      else if (stripped[i] === ")") { pd--; if (!pd) { afterParams = i; break; } }
    }
    if (afterParams < 0) return "";
    const open = stripped.indexOf("{", afterParams);
    let depth = 0;
    for (let i = open; i < stripped.length; i++) {
      if (stripped[i] === "{") depth++;
      else if (stripped[i] === "}") { depth--; if (!depth) return SRC.slice(at, i + 1); }
    }
    return "";
  };
  const sinkBody = bodyOf("sinkProvincesInHeightmap");
  const paintBody = bodyOf("applyProvinceDiff");
  ok(sinkBody.length > 200, "sinkProvincesInHeightmap was found in the source", sinkBody.length);
  ok(paintBody.length > 200, "applyProvinceDiff was found in the source", paintBody.length);

  // every map-data function the province-level path calls whose name says it writes one of the map bitmaps
  const called = new Set();
  const re = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  const sinkMasked = require("./testlib-strip-comments.js").maskJsComments(sinkBody);
  while ((m = re.exec(sinkMasked)) !== null) {
    const n = m[1];
    if (n === "sinkProvincesInHeightmap") continue;
    // …RiversBmp since #erased-land-takes-its-rivers: rivers.bmp is drawn over the same pixels, and the sink now clears it
    if (/(TerrainBmp|TreesBmp|RiversBmp|WorldNormal|Heightmap)$/.test(n)) called.add(n);
  }
  console.log(`     bitmap writers sinkProvincesInHeightmap calls: ${[...called].join(", ") || "(none)"}`);
  ok(called.size >= 4, "⭐ the province-level path really does call four bitmap writers", [...called]);

  const paintMasked = require("./testlib-strip-comments.js").maskJsComments(paintBody);
  for (const n of called) {
    // the paint path has its OWN heightmap writer (levelPaintedPixels) in place of writeProvinceHeightmap —
    // that substitution is the whole point of the function, so it is the one allowed difference.
    if (n === "writeProvinceHeightmap") {
      ok(/levelPaintedPixels\s*\(/.test(paintMasked),
        "⚠️ …and the paint path substitutes its own per-pixel heightmap writer for the per-province one");
      continue;
    }
    ok(new RegExp(`\\b${n}\\s*\\(`).test(paintMasked),
      `⭐⭐⭐ applyProvinceDiff also calls ${n} — the paint cannot leave that file showing the old world`,
      { writer: n });
  }
  // …and BOTH trees writers, because a paint can go both ways in one flush where a province flip cannot.
  ok(/clearProvincesInTreesBmp\s*\(/.test(paintMasked) && /plantProvincesInTreesBmp\s*\(/.test(paintMasked),
    "⭐⭐ …and it calls BOTH trees writers, since one stroke can drown some pixels and raise others");
}

if (!fs.existsSync(path.join(GAME, "map", "terrain.bmp"))) {
  console.log("\n  ..   (the base game is not installed — the measuring half cannot run)");
} else {
  // ── shared setup: the real base map, indexed once ──────────────────────────────────────────────────
  const pbuf = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
  const dataOff = pbuf.readUInt32LE(10), W = pbuf.readInt32LE(18), H = pbuf.readInt32LE(22);
  const rowSize = Math.floor((24 * W + 31) / 32) * 4;
  const at = (x, y) => { const o = dataOff + (H - 1 - y) * rowSize + x * 3; return ((pbuf[o + 2] << 16) | (pbuf[o + 1] << 8) | pbuf[o]) >>> 0; };
  const model = md.buildMapModel({ modRoot: mk(), gameRoot: GAME, dependencyRoots: [] });
  const provOf = new Map();
  for (const p of model.provinces || []) provOf.set(((p.r << 16) | (p.g << 8) | p.b) >>> 0, p);

  // terrain.bmp's palette indices by category, and which of them are WATER — both asked of the game's own
  // files through the same helpers the writer uses, never typed here.
  const declared = md.graphicalTerrainIndices({ modRoot: mk(), gameRoot: GAME, dependencyRoots: [] });
  const catOfIndex = new Map();
  for (const [cat, list] of declared) for (const idx of list) if (!catOfIndex.has(idx)) catOfIndex.set(idx, cat);
  const waterCats = md.waterTerrainCategories({ modRoot: mk(), gameRoot: GAME, dependencyRoots: [] });
  const isWaterIdx = (i) => { const c = catOfIndex.get(i); return !!c && waterCats.has(c); };
  ok(catOfIndex.size > 3 && waterCats.size > 0, "terrain.bmp's palette and its water categories were read from the game",
    { indices: catOfIndex.size, water: [...waterCats] });

  const terrainAt = (root, x, y) => {
    const f = fs.existsSync(path.join(root, "map", "terrain.bmp")) ? path.join(root, "map", "terrain.bmp") : path.join(GAME, "map", "terrain.bmp");
    const b = fs.readFileSync(f); const i = md.readIndexedBmp(b); return b[i.pixelOffset(x, y)];
  };
  const treesReader = (root) => {
    const f = fs.existsSync(path.join(root, "map", "trees.bmp")) ? path.join(root, "map", "trees.bmp") : path.join(GAME, "map", "trees.bmp");
    const b = fs.readFileSync(f); const i = md.readIndexedBmp(b);
    return { at: (x, y) => b[i.pixelOffset(Math.min(i.width - 1, Math.floor(x * i.width / W)), Math.min(i.height - 1, Math.floor(y * i.height / H)))] };
  };

  const RUN = 7;
  const hbufG = fs.readFileSync(path.join(GAME, "map", "heightmap.bmp"));
  const hidxG = md.readIndexedBmp(hbufG);
  const heightG = (x, y) => hbufG[hidxG.pixelOffset(x, y)];
  // Two coastline points FAR APART, so one diff can raise at one and sink at the other without the two
  // brush runs overlapping.
  //
  // ⚠️ THE TARGET MUST MEET THE PRECONDITIONS, NOT JUST BE A COASTLINE. The first version took the first
  // sea/land boundary the scan hit; that was a 2-pixel sliver of sea already painted `hills` — vanilla's
  // shoreline blend — and already above the 89 sea floor, so three preconditions and a count failed at once
  // and read like four defects. It was one badly chosen pixel. A usable target needs a real run of open sea:
  // RUN pixels deep, every one at or below the sea floor, and at least one of them actually painted as water.
  const coasts = [];
  outer:
  for (let y = 300; y < H - 300; y += 5) for (let x = 300; x < W - 300; x += 5) {
    const a = provOf.get(at(x, y)), b = provOf.get(at(x + 1, y));
    if (!a || !b || a.type !== "sea" || b.type !== "land") continue;
    if (coasts.some((c) => Math.abs(c.x - x) < 200 && Math.abs(c.y - y) < 200)) continue;
    let deep = true, anyWater = false;
    for (let dx = 0; dx < RUN; dx++) {
      const px = x - dx;
      if (provOf.get(at(px, y)) !== a || heightG(px, y) > md.HEIGHTMAP_SEA_VALUE) { deep = false; break; }
      if (isWaterIdx(terrainAt(GAME, px, y))) anyWater = true;
    }
    if (!deep || !anyWater) continue;
    // …and land the other way, for the sink half of the same test
    let solidLand = true;
    for (let dx = 1; dx <= RUN; dx++) if (provOf.get(at(x + dx, y)) !== b) { solidLand = false; break; }
    if (!solidLand) continue;
    coasts.push({ x, y, sea: a, land: b });
    if (coasts.length === 2) break outer;
  }
  ok(coasts.length === 2, "found two coastlines far enough apart to paint in opposite directions",
    coasts.map((c) => [c.x, c.y, c.sea.id, c.land.id]));

  const seaRun = (c, n) => { const out = []; for (let dx = 0; dx < n; dx++) { const px = c.x - dx; if (provOf.get(at(px, c.y)) === c.sea) out.push(px); } return out; };
  const landRun = (c, n) => { const out = []; for (let dx = 1; dx <= n; dx++) { const px = c.x + dx; if (provOf.get(at(px, c.y)) === c.land) out.push(px); } return out; };

  console.log("\n=== ⭐ painting the coast OUTWARD: the new land is no longer PAINTED as ocean ===");
  {
    const c = coasts[0];
    const d = mk();
    const xs = seaRun(c, RUN);
    ok(xs.length > 2, `${xs.length} sea pixels to hand to land province ${c.land.id}`, xs.length);
    const before = xs.map((px) => terrainAt(d, px, c.y));
    const wasWater = before.filter(isWaterIdx).length;
    ok(wasWater > 0, "⚠️ they really are painted as water to begin with — otherwise this proves nothing",
      { before, cats: before.map((i) => catOfIndex.get(i)) });

    const diff = xs.map((px) => ({ x: px, y: c.y, r: c.land.r, g: c.land.g, b: c.land.b }));
    const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff });
    ok(r && r.ok === true, "the paint applies", r && r.error);
    ok(!!(r.heightmap && r.heightmap.raised === xs.length), `⭐ every one of the ${xs.length} is raised`, r.heightmap);
    ok(!!(r.heightmap && r.heightmap.terrain && r.heightmap.terrain.changed === true),
      "⭐⭐⭐ …and map/terrain.bmp was repainted in the same call", r.heightmap && r.heightmap.terrain);

    const after = xs.map((px) => terrainAt(d, px, c.y));
    const stillWater = after.filter(isWaterIdx).length;
    ok(stillWater === 0,
      `⭐⭐⭐ not one of the ${xs.length} new-land pixels is still painted as water (was ${wasWater})`,
      { before, after, cats: after.map((i) => catOfIndex.get(i)) });
    ok(after.every((i) => catOfIndex.get(i) === String(c.land.terrain || "").toLowerCase()),
      `…and each carries the land province's OWN category (${c.land.terrain})`,
      { want: c.land.terrain, got: after.map((i) => catOfIndex.get(i)) });
  }

  console.log("\n=== ⭐ painting the coast INWARD: the drowned ground loses its vegetation ===");
  {
    const c = coasts[1];
    const d = mk();
    const xs = landRun(c, RUN);
    ok(xs.length > 2, `${xs.length} land pixels to hand to sea province ${c.sea.id}`, xs.length);
    const diff = xs.map((px) => ({ x: px, y: c.y, r: c.sea.r, g: c.sea.g, b: c.sea.b }));
    const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff });
    ok(!!(r.heightmap && r.heightmap.sunk === xs.length), `⭐ every one of the ${xs.length} is sunk`, r.heightmap);
    // trees.bmp is coarser than the map and a block is only cleared when nothing is left standing under it,
    // so a 7px stroke on a coastline may legitimately clear none. What must be true is that the writer RAN
    // and reported, rather than never being asked — the silent half is the defect.
    ok(!!(r.heightmap && r.heightmap.trees && typeof r.heightmap.trees.changed === "boolean"),
      "⭐⭐⭐ …and the trees writer was asked, and answered", r.heightmap && r.heightmap.trees);
    ok(!!(r.heightmap && r.heightmap.terrain && r.heightmap.terrain.changed === true),
      "⭐ …and terrain.bmp followed the water in this direction too", r.heightmap && r.heightmap.terrain);
    const after = xs.map((px) => terrainAt(d, px, c.y));
    ok(after.every(isWaterIdx),
      "⭐⭐ every drowned pixel is now painted as water", { after, cats: after.map((i) => catOfIndex.get(i)) });
  }

  console.log("\n=== 🌱 BOTH WAYS IN ONE FLUSH — one Save can carry pixels into a land province AND a sea one ===");
  {
    const d = mk();
    const up = seaRun(coasts[0], RUN).map((px) => ({ x: px, y: coasts[0].y, r: coasts[0].land.r, g: coasts[0].land.g, b: coasts[0].land.b }));
    const down = landRun(coasts[1], RUN).map((px) => ({ x: px, y: coasts[1].y, r: coasts[1].sea.r, g: coasts[1].sea.g, b: coasts[1].sea.b }));
    const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff: up.concat(down) });
    const hm = r.heightmap || {};
    ok(hm.raised === up.length && hm.sunk === down.length,
      `⭐ one call raised ${up.length} and sank ${down.length}`, { raised: hm.raised, sunk: hm.sunk });
    const cats = Object.keys((hm.terrain && hm.terrain.byCategory) || {});
    const water = cats.filter((c) => waterCats.has(c)), land = cats.filter((c) => !waterCats.has(c));
    ok(water.length > 0 && land.length > 0,
      "⭐⭐⭐ …and terrain.bmp was repainted with BOTH a water category and a land one in that single call",
      { byCategory: hm.terrain && hm.terrain.byCategory });
  }

  console.log("\n=== 🈯 the note tells the modder what actually happened to the vegetation ===");
  {
    // ⚠️ LIFTED WITH A LINE-ENDING-TOLERANT ANCHOR. public/map.js is CRLF in a fresh worktree and LF in the
    // main checkout; a bare-"\n  }\n" anchor finds nothing in the CRLF copy, slices to indexOf's −1 and
    // reports an EMPTY body — which reads exactly like a passing check with nothing in it.
    const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
    const s0 = MAP.indexOf("function heightmapNote(hm) {");
    const body = s0 < 0 ? "" : MAP.slice(s0, MAP.indexOf("\n  }\n", s0) + 4);
    ok(body.length > 200, "heightmapNote was lifted out of public/map.js", body.length);
    let note = null;
    try { note = new Function(body + "\nreturn heightmapNote;")(); } catch (_) { note = null; }
    ok(typeof note === "function", "…and it runs");
    const call = (trees) => (typeof note === "function"
      ? note({ pixels: 122, raised: 12, sunk: 110, materialized: true, terrain: { pixels: 122, materialized: true }, trees }) : "");
    const both = call({ changed: true, planted: true, cleared: true, pixels: 37, plantedPixels: 9, clearedPixels: 28, materialized: true });
    ok(/planted/.test(both) && /cleared/.test(both),
      "⭐⭐⭐ a stroke that did BOTH is reported as both, not as one standing for the other", both);
    ok(/\b9\b/.test(both) && /\b28\b/.test(both), "…with the count that belongs to each half", both);
    // and the two single-direction shapes still read exactly as they did
    const planted = call({ changed: true, planted: true, pixels: 129032, materialized: true });
    ok(/129,032/.test(planted) && /planted/.test(planted) && !/cleared/.test(planted),
      "⚠️ …while a plant-only click is still reported as planting alone", planted);
    const cleared = call({ changed: true, pixels: 99005, materialized: true });
    ok(/99,005/.test(cleared) && /cleared/.test(cleared) && !/planted/.test(cleared),
      "⚠️ …and a clear-only click as clearing alone", cleared);
  }

  console.log("\n=== ⚠️⚠️ THE CONTROL: a land-to-land reshape STILL writes nothing ===");
  {
    // The common case by far, and the reason the writers are gated on the crossed mask rather than on the
    // province. If this fired, every paint stroke would drag 11.5 MB bitmaps into the mod.
    let pair = null;
    outer2:
    for (let y = 300; y < H - 300; y += 11) for (let x = 300; x < W - 300; x += 11) {
      const a = provOf.get(at(x, y)), b = provOf.get(at(x + 1, y));
      if (a && b && a !== b && a.type === "land" && b.type === "land") { pair = { x, y, from: a, to: b }; break outer2; }
    }
    ok(!!pair, "found two adjacent land provinces", pair && [pair.from.id, pair.to.id]);
    const d = mk();
    const diff = [];
    for (let dx = -4; dx <= 0; dx++) { const px = pair.x + dx; if (provOf.get(at(px, pair.y)) === pair.from) diff.push({ x: px, y: pair.y, r: pair.to.r, g: pair.to.g, b: pair.to.b }); }
    ok(diff.length > 0, `${diff.length} pixels moving from land province ${pair.from.id} to ${pair.to.id}`, diff.length);
    const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff });
    ok(r && r.ok === true, "the reshape applies", r && r.error);
    ok(!(r.heightmap && r.heightmap.pixels), "⚠️ …and levels not one pixel", r.heightmap);
    ok(!(r.heightmap && r.heightmap.terrain && r.heightmap.terrain.changed), "⚠️ …repaints not one pixel of terrain.bmp", r.heightmap && r.heightmap.terrain);
    ok(!(r.heightmap && r.heightmap.trees && r.heightmap.trees.changed), "⚠️ …and touches no vegetation", r.heightmap && r.heightmap.trees);
    for (const f of ["heightmap.bmp", "terrain.bmp", "trees.bmp", "world_normal.bmp"]) {
      ok(!fs.existsSync(path.join(d, "map", f)),
        `⚠️⚠️ …and the mod does NOT acquire map/${f} for an ordinary paint stroke`);
    }
  }

  console.log("\n=== 🈯 CRY-WOLF: what the SHIPPING maps do, re-derived here ===");
  {
    // A rule that fires on a shipping map is a bug in the rule. Both directions are measured, because they
    // are NOT symmetric: sea painted with a land index is the shoreline blend every map ships on purpose,
    // and it is precisely why the writer repaints only what CROSSED instead of the whole province.
    const MAPS = [["vanilla", GAME],
      ["Millennium Dawn", "D:/SteamLibrary/steamapps/workshop/content/394360/2777392649"]];
    const STEP = 9;
    let measured = 0;
    for (const [name, root] of MAPS) {
      if (!fs.existsSync(path.join(root, "map", "terrain.bmp")) || !fs.existsSync(path.join(root, "map", "provinces.bmp"))) {
        console.log(`  ..   (${name} is not installed)`); continue;
      }
      measured++;
      const pb = fs.readFileSync(path.join(root, "map", "provinces.bmp"));
      const off = pb.readUInt32LE(10), w = pb.readInt32LE(18), h = pb.readInt32LE(22);
      const rs = Math.floor((24 * w + 31) / 32) * 4;
      const tb = fs.readFileSync(path.join(root, "map", "terrain.bmp"));
      const ti = md.readIndexedBmp(tb);
      const dec = md.graphicalTerrainIndices({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
      const cat = new Map();
      for (const [c, list] of dec) for (const i of list) if (!cat.has(i)) cat.set(i, c);
      const wc = md.waterTerrainCategories({ modRoot: root, gameRoot: GAME, dependencyRoots: [] });
      const rows = new Map();
      for (const line of fs.readFileSync(path.join(root, "map", "definition.csv"), "utf8").split(/\r?\n/)) {
        const cc = line.split(";");
        if (cc.length < 8 || !/^\d+$/.test(cc[0])) continue;
        rows.set(((+cc[1] << 16) | (+cc[2] << 8) | +cc[3]) >>> 0, cc[4].trim());
      }
      let land = 0, landWater = 0, sea = 0, seaLand = 0;
      for (let y = 0; y < h; y += STEP) for (let x = 0; x < w; x += STEP) {
        const o = off + (h - 1 - y) * rs + x * 3;
        const t = rows.get(((pb[o + 2] << 16) | (pb[o + 1] << 8) | pb[o]) >>> 0);
        if (t !== "land" && t !== "sea") continue;
        const c = cat.get(tb[ti.pixelOffset(x, y)]);
        if (!c) continue;
        if (t === "land") { land++; if (wc.has(c)) landWater++; }
        else { sea++; if (!wc.has(c)) seaLand++; }
      }
      const lp = 100 * landWater / Math.max(1, land), sp = 100 * seaLand / Math.max(1, sea);
      console.log(`     ${name}: land painted as water ${lp.toFixed(4)}% (${landWater}/${land}) · sea painted as land ${sp.toFixed(3)}% (${seaLand}/${sea})`);
      ok(land > 5000 && lp < 1,
        `⭐⭐ ${name} paints under 1% of its LAND as water (${lp.toFixed(4)}%) — so leaving a painted coastline ocean-textured is a real defect, not a rule crying wolf`,
        { land, landWater, pct: lp });
      ok(sea > 5000 && sp > 0.5,
        `⚠️ …while it paints ${sp.toFixed(2)}% of its SEA with a land texture on purpose — which is why that direction is left alone`,
        { sea, seaLand, pct: sp });
    }
    ok(measured > 0, "at least one shipping map was available to hold the rule to");
  }
}

tmps.forEach((t) => { try { fs.rmSync(t, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a painted coastline keeps the old world's paint: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
