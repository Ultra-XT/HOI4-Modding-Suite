// ⛔ #a-kept-palette-keeps-no-picture — A PALETTE THE CACHE KEEPS HOLDS NO PICTURE, AND NO ARRAY A TEXEL LONG.
//
// learnWorldTextureColours keeps a palette per world picture (colour map, water tint, fog map: three a process) for as long
// as the files it was learnt from are unchanged — the life of the server, on a world that inherits the base game's pictures.
// Its readers are closures, and a closure keeps every variable of the call it was made in that ANY closure there reads. The
// grain commit (0609a3b1) learnt the land's grain in a closure over the colour map and measured the water's and the fog's in
// closures over theirs, so every kept palette kept the decoded picture it was learnt from; and the texel classes, the terrain
// index and the two distance fields, read by the learn's own helpers, had been kept by every palette since they were written.
// Measured at the base game's size (2816 x 1024), one kept learn of each picture (scratch wf-w4/grain-fix/probe-retain.js):
// 41.3 / 41.4 / 41.3 MB of array memory retained a palette at 0609a3b1, 27.5 at the commit before it, 0 / 0.1 / 0 now.
//
// Pinned here on a smaller map, through the learn itself, with the garbage collector run by the test:
//   · CONTROL: a palette the cache does NOT keep, held here, keeps its colour map until its land grain is asked — the measure
//     sees a kept picture, and a kept array a texel long;
//   · each of the three palettes the cache keeps lets go of the picture it was learnt from, and of the layer's classes, purity
//     and terrain index, and what the three keep all told is under one byte a texel of the map;
//   · …and every reader of each still answers, from its tables alone.
"use strict";
require("v8").setFlagsFromString("--expose-gc");
const gc = require("vm").runInNewContext("gc");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
// (a WeakRef's target stays alive to the end of the job that made or read it: collect on a later turn)
const settle = () => new Promise((r) => setImmediate(() => { gc(); gc(); gc(); r(); }));
const arrays = () => process.memoryUsage().arrayBuffers;

// a 1024 x 512 texel world: continents of land about two fifths of it, four land indices, every texel pure
const W = 1024, H = 512, N = W * H;
const idxCat = new Map([[0, "plains"], [1, "plains"], [2, "forest"], [3, "forest"], [15, "ocean"]]);
/** A layer and one picture of it, learnt as `kind` with `key` (null: not kept); every reader the repaint asks is asked, the
 *  land's grain unless `grain` is false. Hands back the palette and weak references to what it was learnt from — nothing
 *  here keeps the arrays themselves. */
function learn(kind, key, grain = true) {
  const cls = new Uint8Array(N), pure = new Uint8Array(N).fill(1), idx = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    cls[i] = Math.sin(x / 61) + Math.sin(y / 37) + Math.sin((x + y) / 97) > 0.6 ? 1 : 2;
    idx[i] = cls[i] === 1 ? ((x >> 5) ^ (y >> 5)) & 3 : 15;
  }
  const img = new Uint8Array(N * 4);
  for (let i = 0; i < N * 4; i++) img[i] = 40 + ((Math.imul(i, 2654435761) >>> 24) & 127);
  const pal = md.learnWorldTextureColours({ layer: { W, H, N, cls, pure, idx }, [kind]: img, urbanIdx: [], idxCat, key });
  try {
    if (pal.landColour) { pal.landColour(0, 10); pal.residSd(1); if (grain) pal.localSd(2); pal.cmAt(-3); }
    if (pal.fowAt) { pal.fowAt(3); pal.fowAt(-3); }
    if (pal.waterAt) { pal.waterAt(5, 10); pal.waterNoiseAt(5, 10); pal.waterGrainAt(5); pal.waterOverLand(10); }
  } catch (e) { threw.push(`${kind}: ${e.message}`); }
  return { pal, refs: { "the picture": new WeakRef(img), "the texel classes": new WeakRef(cls), "the purity": new WeakRef(pure), "the terrain index": new WeakRef(idx) } };
}
const threw = [];   // (a reader that threw when first asked, as the repaint asks it)
const alive = (refs) => Object.entries(refs).filter(([, r]) => r.deref() !== undefined).map(([k]) => k);

(async () => {
  // (every module-level table the readers fill — the noise's measured spreads, the patch field's scale — filled first, by
  // palettes nothing keeps: they are not what this measures)
  for (const k of ["colormap", "water0", "fow"]) learn(k, null);
  await settle();

  console.log("\n-- CONTROL: the measure sees a picture a palette keeps --");
  {
    let base = arrays(), held = learn("colormap", null, false);
    await settle();
    const kept = arrays() - base;
    ok(held.refs["the picture"].deref() !== undefined && kept >= 4 * N,
      `a palette the cache does not keep, held here before its land grain is asked, keeps its colour map to learn it from: alive, and ${(kept / 1048576).toFixed(1)} MB of arrays kept (the picture is ${(4 * N / 1048576).toFixed(1)})`, alive(held.refs));
    held = null;
    await settle();
  }

  console.log("\n-- ⭐ the three palettes the cache keeps keep none of what they were learnt from --");
  const base = arrays(), kept = {};
  for (const k of ["colormap", "water0", "fow"]) kept[k] = learn(k, `test-a-kept-palette-keeps-no-picture#${k}`);
  await settle();
  for (const k of ["colormap", "water0", "fow"]) {
    const left = alive(kept[k].refs);
    ok(!left.length, `⭐ the kept ${k} palette lets go of what it was learnt from${left.length ? ": it still keeps " + left.join(", ") : ": the picture, the texel classes, the purity and the terrain index"}`, left);
  }
  const all = arrays() - base;
  ok(all < N, `⭐ …and what the three keep all told — the distance fields the learn works out itself as well — is ${(all / 1048576).toFixed(2)} MB of arrays: under one byte a texel (${(N / 1048576).toFixed(1)} MB)`, all);

  console.log("\n-- ⭐ …and every reader of a kept palette answers from its tables alone --");
  {
    const C = kept.colormap.pal, Wt = kept.water0.pal, F = kept.fow.pal, bad = [...threw];
    const num = (v, what) => { const a = [].concat(v); if (!a.length || a.some((x) => typeof x !== "number" || !Number.isFinite(x))) bad.push(what); };
    try {
      // (readers and arguments the learn above never asked: an answer worked out now, after the arrays are gone)
      num(C.landColour(3, 400), "landColour"); num(C.residSd(2), "residSd"); num(C.localSd(3), "localSd"); num(C.localSd(9), "localSd of an index the map has none of");
      num(C.localSdOfCategory("forest"), "localSdOfCategory"); num(C.landColourOfCategory("forest", 300), "landColourOfCategory"); num(C.residSdOfCategory("plains"), "residSdOfCategory");
      num(C.cmAt(-27), "cmAt"); num(C.glowAt(3), "glowAt"); num(C.urbanMean, "urbanMean");
      num(Wt.waterAt(77, 400), "waterAt"); num(Wt.waterNoiseAt(33, 450), "waterNoiseAt"); num(Wt.waterGrainAt(140), "waterGrainAt"); num(Wt.waterOverLand(300), "waterOverLand"); num(Wt.kOf(9), "kOf");
      for (const sd of [-37, -11, 1, 14, 40]) { const p = F.fowAt(sd); num([p.g, p.a, p.gs, p.as, p.gg, p.ag], `fowAt(${sd})`); }
      num(F.landSpec, "landSpec");
    } catch (e) { bad.push("threw: " + e.message); }
    ok(!bad.length, "⭐ every reader of the three kept palettes answers, asked after the arrays they were learnt from are gone", bad);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
