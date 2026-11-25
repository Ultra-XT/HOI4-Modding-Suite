// ⛔ #erase-leaves-the-land-standing, PER PIXEL — the fifth and last place the land/sea boundary moves.
//
// The other four change a province's TYPE, and each now moves the terrain with it: the erase brush sinks the
// province it drowns, Delete map sinks all 10,154 of them, Generate land raises what it builds, and the
// province inspector's type dropdown raises a sea province turned to land.
//
// PAINT SHAPE changes no type at all. It hands PIXELS from one province to another — which is exactly how a
// modder extends a peninsula or carves a bay — so a land province can gain pixels that still hold the sea
// floor, and a sea province can gain pixels that still hold a hillside. Measured on the real base map:
// 4 coastline pixels repainted from sea province 4722 to land province 13202 all stayed at height 89 against
// a sea level of 95. Land the game draws as water.
//
// ⭐⭐ THE THRESHOLD IS 89/90, NOT 95, AND THAT HAD TO BE MEASURED.
//
// The wiki gives 95 as the height at which the game starts drawing water. It is NOT where vanilla puts the
// boundary when authoring. Sampled over 1.28 million pixels of the base map:
//
//     SEA  provinces (826,423 px):  99.98% at or below 89
//     LAND provinces (450,664 px):  99.97% above 89 — 2.0% in 90-94, 0.2% at 95,
//                                   58.6% in 96-110, 39.3% above 110
//
// ⚠️ A CONVENTION, NOT A LAW, and the first version of this file said "100.0%" and "0%" because that is
// what one-decimal rounding printed. Sampled finer there are 16 sea pixels above 89 and 13 land pixels at
// or below it. The threshold is still right; the claim had to be written at the precision the data
// supports, which is what the last two checks in this file now assert.
//
// So a land province legitimately carries a thin 90-95 fringe that draws as water — that fringe IS the
// beach. Levelling against 95 would lift it to 106 every time a boundary pixel moved and turn real coastline
// into a cliff. Levelling against 89 follows vanilla's own convention and touches only pixels that genuinely
// changed side.
//
// ⚠️ Which is why the control matters more than the fix here: an ordinary land-to-land reshape must write
// NOTHING, or every paint stroke would drag an 11.5 MB heightmap into the mod.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 300) : "")); }
};
const tmps = [];
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const mk = () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-")); tmps.push(d);
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="Coast"\nsupported_version="1.19.*"\n');
  return d;
};

console.log("\n=== the levelling exists and is wired into the paint ===");
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  ok(/function levelPaintedPixels\(/.test(SRC), "levelPaintedPixels was found");
  const a = SRC.indexOf("function applyProvinceDiff");
  const body = a < 0 ? "" : SRC.slice(a, SRC.indexOf("\nfunction ", a + 10));
  ok(/levelPaintedPixels\(/.test(body), "⭐ applyProvinceDiff calls it after writing the bitmap", body.length);
  const lp = SRC.indexOf("function levelPaintedPixels");
  const lb = lp < 0 ? "" : require("./testlib-strip-comments.js").maskJsComments(SRC.slice(lp, SRC.indexOf("\n}", SRC.indexOf("return { changed: true, pixels", lp))));
  // ⛔ #a-painted-coast-rises-like-the-generators — a pixel the stroke took from the WATER is raised from the waterline (a lake bed at
  // 90..95 painted to land was left there, M1); every other test of the waterline would lift the 90..95 beach of land that only moved
  // between land provinces, which is what this check has always been for
  const waterline = (lb.match(/<=\s*HEIGHTMAP_SEA_LEVEL/g) || []).length, fromWater = (lb.match(/wasWater\s*&&\s*h\s*<=\s*HEIGHTMAP_SEA_LEVEL/g) || []).length;
  ok(/HEIGHTMAP_SEA_VALUE/.test(lb) && waterline === fromWater && fromWater === 1,
    "⭐ …and it tests a pixel that was land against the 89 sea VALUE, not the 95 render waterline — only one the stroke took from the water against that", { waterline, fromWater, head: lb.slice(0, 120) });
}

if (!fs.existsSync(path.join(GAME, "map", "heightmap.bmp"))) {
  console.log("\n  ..   (the base game is not installed — the measuring half cannot run)");
} else {
  // Shared setup: read the real bitmaps once and index the province colours.
  const pbuf = fs.readFileSync(path.join(GAME, "map", "provinces.bmp"));
  const hbuf = fs.readFileSync(path.join(GAME, "map", "heightmap.bmp"));
  const hm = md.readIndexedBmp(hbuf);
  const dataOff = pbuf.readUInt32LE(10), W = pbuf.readInt32LE(18), H = pbuf.readInt32LE(22);
  const rowSize = Math.floor((24 * W + 31) / 32) * 4;
  const at = (x, y) => { const o = dataOff + (H - 1 - y) * rowSize + x * 3; return ((pbuf[o + 2] << 16) | (pbuf[o + 1] << 8) | pbuf[o]) >>> 0; };
  const model = md.buildMapModel({ modRoot: mk(), gameRoot: GAME, dependencyRoots: [] });
  const provOf = new Map();
  for (const p of model.provinces || []) provOf.set(((p.r << 16) | (p.g << 8) | p.b) >>> 0, p);
  const heightAt = (buf, x, y) => { const i = md.readIndexedBmp(buf); return buf[i.pixelOffset(x, y)]; };

  // Find a coastline pixel pair: sea province immediately left of a land province.
  let coast = null;
  outer:
  for (let y = 200; y < H - 200; y += 7) for (let x = 200; x < W - 200; x += 7) {
    const a = provOf.get(at(x, y)), b = provOf.get(at(x + 1, y));
    if (a && b && a.type === "sea" && b.type === "land") { coast = { x, y, sea: a, land: b }; break outer; }
  }
  ok(!!coast, "found a coastline to paint across", coast && { at: [coast.x, coast.y], sea: coast.sea.id, land: coast.land.id });

  console.log("\n=== ⭐ painting the coast OUTWARD: new land comes up out of the water ===");
  {
    const d = mk();
    const targets = [];
    for (let dx = -6; dx <= 0; dx++) { const px = coast.x + dx; if (provOf.get(at(px, coast.y)) === coast.sea) targets.push(px); }
    ok(targets.length > 0, `${targets.length} sea pixels to hand to the land province`, targets.length);
    const before = targets.map((px) => heightAt(hbuf, px, coast.y));
    ok(before.every((h) => h <= 89), "⚠️ they really are sea floor to begin with (all ≤ 89)", before);

    const diff = targets.map((px) => ({ x: px, y: coast.y, r: coast.land.r, g: coast.land.g, b: coast.land.b }));
    const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff });
    ok(r && r.ok === true, "the paint applies", r && r.error);
    ok(!!(r.heightmap && r.heightmap.raised === targets.length && r.heightmap.sunk === 0),
      `⭐ …and every one of the ${targets.length} is raised, none sunk`, r.heightmap);

    const hmFile = path.join(d, "map", "heightmap.bmp");
    const hAfter = fs.readFileSync(fs.existsSync(hmFile) ? hmFile : path.join(GAME, "map", "heightmap.bmp"));
    const after = targets.map((px) => heightAt(hAfter, px, coast.y));
    // ⛔ #a-painted-coast-rises-like-the-generators — the raise is the generator's settle now, not a flat 106 a pixel: a painted pixel
    // with water beside it is the new waterline and takes the base game's beach, 94, as Generate land's would (here every one of them:
    // a one-row stroke has the sea above and below it); one with no water beside it stands above the waterline. This read "every one
    // above 95" while the writer lifted each to 106 — a 17-high cliff over the sea next to it.
    const isTarget = (a, b) => b === coast.y && targets.includes(a);
    const waterAt = (a, b) => !isTarget(a, b) && ((provOf.get(at(a, b)) || {}).type !== "land");
    const shore = targets.map((px) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => waterAt(px + dx, coast.y + dy)));
    ok(after.every((h, i) => h > 89 && (shore[i] ? h === md.HEIGHTMAP_BEACH_RAMP[0] : h > 95)),
      "⭐ …so none of them is still the sea floor: the new waterline is the beach's 94, not a cliff, and land behind it stands above the water", { before, after, shore });
  }

  console.log("\n=== ⭐ painting the coast INWARD: drowned land goes down to the sea floor ===");
  {
    const d = mk();
    const targets = [];
    for (let dx = 1; dx <= 5; dx++) { const px = coast.x + dx; if (provOf.get(at(px, coast.y)) === coast.land) targets.push(px); }
    ok(targets.length > 0, `${targets.length} land pixels to hand to the sea province`, targets.length);
    const before = targets.map((px) => heightAt(hbuf, px, coast.y));
    // ⚠️ These are SHORELINE pixels — vanilla's 90-95 fringe — not mountains. That is the interesting case:
    // they already draw as water, yet a sea province in the base game almost never holds a pixel above 89.
    ok(before.every((h) => h > 89), "⚠️ they are above the 89 sea floor to begin with", before);

    const diff = targets.map((px) => ({ x: px, y: coast.y, r: coast.sea.r, g: coast.sea.g, b: coast.sea.b }));
    const r = md.applyProvinceDiff({ modRoot: d, gameRoot: GAME, dependencyRoots: [], diff });
    ok(!!(r.heightmap && r.heightmap.sunk === targets.length && r.heightmap.raised === 0),
      `⭐ …and every one of the ${targets.length} is sunk, none raised`, r.heightmap);
    const hmFile = path.join(d, "map", "heightmap.bmp");
    const hAfter = fs.readFileSync(fs.existsSync(hmFile) ? hmFile : path.join(GAME, "map", "heightmap.bmp"));
    const after = targets.map((px) => heightAt(hAfter, px, coast.y));
    ok(after.every((h) => h <= 89),
      "⭐ …so the sea province holds no pixel above 89, which is vanilla's own invariant", { before, after });
  }

  console.log("\n=== ⚠️⚠️ THE CONTROL: a land-to-land reshape writes NOTHING ===");
  {
    // The common case by far. If this fired, every paint stroke would drag 11.5 MB into the mod.
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
    ok(!fs.existsSync(path.join(d, "map", "heightmap.bmp")),
      "⚠️⚠️ …and the mod does NOT acquire an 11.5 MB heightmap.bmp for an ordinary paint stroke");
  }

  console.log("\n=== 🈯 the measurement the 89 threshold rests on ===");
  {
    // Derived here rather than trusted, because the whole rule turns on it.
    const type = new Map();
    for (const p of model.provinces || []) type.set(((p.r << 16) | (p.g << 8) | p.b) >>> 0, p.type);
    let seaN = 0, seaAbove = 0, landN = 0, landAtOrBelow = 0;
    for (let y = 0; y < H; y += 9) for (let x = 0; x < W; x += 9) {
      const t = type.get(at(x, y));
      if (t !== "sea" && t !== "land") continue;
      const h = hbuf[hm.pixelOffset(x, y)];
      if (t === "sea") { seaN++; if (h > 89) seaAbove++; }
      else { landN++; if (h <= 89) landAtOrBelow++; }
    }
    // ⚠️ NOT absolute, and this assertion is written at the precision the data actually supports. A first
    // pass printed "100.0%" and "0%" — that was one-decimal rounding. Sampled finer: 16 of 91,937 sea
    // pixels sit above 89 and 13 of 50,178 land pixels sit at or below it, about 0.02% each way. The rule
    // is a 99.98% convention, not a law, and stating it as a law would be the kind of overclaim that turns
    // into a cried-wolf rule later.
    const seaPct = 100 * seaAbove / Math.max(1, seaN);
    const landPct = 100 * landAtOrBelow / Math.max(1, landN);
    ok(seaN > 10000 && seaPct < 0.1,
      `⭐ ${(100 - seaPct).toFixed(2)}% of ${seaN.toLocaleString()} sampled SEA pixels are at or below 89`,
      { seaN, seaAbove, seaPct: seaPct.toFixed(3) + "%" });
    ok(landN > 10000 && landPct < 0.1,
      `⭐ and ${(100 - landPct).toFixed(2)}% of ${landN.toLocaleString()} sampled LAND pixels are above it`,
      { landN, landAtOrBelow, landPct: landPct.toFixed(3) + "%" });
    ok(seaPct > 0 || landPct > 0,
      "⚠️ …and there ARE exceptions, so this is a convention and not a law", { seaAbove, landAtOrBelow });
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// …and the modder has to be TOLD. Every other path that levels the heightmap says so on the post-save
// warning line; the paint save read res.warnings and dropped res.heightmap on the floor, so a coastline
// paint pulled 11.5 MB into the mod in silence — exactly what that note exists to prevent.
//
// ⚠️ The note itself is worth a test and not just a grep, because the two paths report DIFFERENT SHAPES:
// a province flip sends `raised` as a boolean, a paint sends `raised`/`sunk` as counts. Read one as the
// other and the sentence says "raised" over a save that lowered most of it. So LIFT the client function
// and RUN it — a source-shape assertion would pass against a version that never looks at `sunk`.
console.log("\n=== 🈯 the save says the mod just took its own heightmap ===");
{
  const MAP = require("./testlib-map-page.js").readSource("public", "map.js");   // LF whatever the checkout: #a-lift-reads-lf

  // The wiring: the paint branch has to consult it at all.
  const p = MAP.indexOf('fetch("/api/map/paint-provinces"');
  const branch = p < 0 ? "" : MAP.slice(p, MAP.indexOf("paintDiff.clear();", p));
  ok(p > 0 && /res\.heightmap/.test(branch),
    "⭐ the paint save reads res.heightmap, not just res.warnings", branch.slice(0, 120));
  ok(/heightmapNote\(/.test(branch), "…and turns it into a note for the modder");

  // The behaviour: lift the pure helper out and run it on all three real shapes.
  const s = MAP.indexOf("function heightmapNote(hm) {");
  const body = s < 0 ? "" : MAP.slice(s, MAP.indexOf("\n  }\n", s) + 4);
  ok(body.length > 100 && /return/.test(body), "heightmapNote was lifted out of the page", body.length);
  let note = null;
  try { note = new Function(body + "\nreturn heightmapNote;")(); } catch (e) { ok(false, "it evaluates", e.message); }
  if (typeof note === "function") {
    ok(true, "…and evaluates standalone, so this is the real function and not a paraphrase");
    // Shape 1 — a whole province flipped DOWN (sinkProvincesInHeightmap: raised is a boolean).
    const down = note({ pixels: 1703, raised: false, materialized: true });
    ok(/1,703/.test(down) && /lowered below sea level/.test(down) && !/raised above/.test(down),
      "⭐ a drowned province reads as lowered", down);
    // Shape 2 — a whole province flipped UP.
    const up = note({ pixels: 1817, raised: true, materialized: true });
    ok(/1,817/.test(up) && /raised above sea level/.test(up) && !/lowered below/.test(up),
      "⭐ a raised province reads as raised", up);
    // Shape 3 — THE ONE THAT WAS WRONG. A paint save carrying pixels for two provinces, one land and one
    // sea, levels in BOTH directions at once. `raised` is 2 here, which is truthy, so reading it as a
    // boolean printed "5 pixels were raised above sea level" over a save that lowered three of them.
    const both = note({ pixels: 5, raised: 2, sunk: 3, materialized: true });
    ok(/raised above sea level/.test(both) && /lowered below it/.test(both),
      "⭐⭐ a paint that did both says both", both);
    ok(/\b2\b/.test(both) && /\b3\b/.test(both) && !/\b5 pixels were raised\b/.test(both),
      "⭐⭐ …with the real counts, not the total attributed to one direction", both);
    // And the counted shape one-way round, which is the ordinary coastline paint.
    const onlySunk = note({ pixels: 3, raised: 0, sunk: 3, materialized: true });
    ok(/lowered below sea level/.test(onlySunk) && !/raised above/.test(onlySunk),
      "a paint that only sank reads as lowered", onlySunk);
    ok(note({ pixels: 0 }) === "" && note(null) === "",
      "…and nothing levelled produces no sentence at all");
  }
}

tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
console.log(`\n=== a painted coastline takes its terrain with it: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
