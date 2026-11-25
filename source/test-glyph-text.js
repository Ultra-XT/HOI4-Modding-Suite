// The research tree stamps its year labels in the GAME'S OWN bitmap font (hoi_36header = "Orator Std HoI
// Medium", size 36) so a year matches the in-game stamp pixel-for-pixel — no web font has these glyphs or
// their condensed metrics. /api/research/glyph-text blits the string out of the font's uncompressed 32-bit
// DDS atlas (coverage in the alpha channel), tints it, and returns a PNG. This pins the exact glyph metrics
// (a 4-digit year = 64×25 px, each digit xadvance 16) and the tint, so a regression in the blitter or the
// atlas/fnt parse is caught. Read-only: it touches only base-game font files, never a mod. #glyph-text
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// PNG IHDR dims (bytes 16..24, big-endian) — the response is a raw PNG buffer.
const pngDims = (b) => (b.length > 24 && b.slice(0, 8).toString("hex") === "89504e470d0a1a0a")
  ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null;

const app = createApp();
const server = http.createServer(app);
function getRaw(pathname) {
  return new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: server.address().port, path: pathname }, (res) => {
      const bufs = []; res.on("data", (c) => bufs.push(c));
      res.on("end", () => resolve({ status: res.statusCode, ctype: res.headers["content-type"], body: Buffer.concat(bufs) }));
    }).on("error", reject);
  });
}

server.listen(0, "127.0.0.1", async () => {
  try {
    // Guard: this test needs the base game's font atlas. Skip cleanly on a machine without HOI4 installed.
    const probe = await getRaw(`/api/research/glyph-text?text=1965`);
    if (probe.status !== 200 && /atlas|ENOENT|font/i.test(probe.body.toString())) {
      console.log("  SKIP glyph-text (base-game font atlas not found on this machine)");
      console.log(`\nGLYPH-TEXT TEST: skipped`);
      server.close(); process.exit(0); return;
    }

    check("glyph-text returns a PNG (200 image/png)", probe.status === 200 && /image\/png/.test(probe.ctype || ""), probe.status + " " + probe.ctype);
    const d1965 = pngDims(probe.body);
    // "1965" = 4 digits × xadvance 16 = 64px wide; digit glyphs are ~24-25px tall in hoi_36header.
    check("4-digit year renders at the game's exact 64×25 px", d1965 && d1965.w === 64 && d1965.h >= 23 && d1965.h <= 27, JSON.stringify(d1965));

    // Width scales with digit count: "36" is exactly half of "1965" (2 digits × 16 = 32).
    const two = pngDims((await getRaw(`/api/research/glyph-text?text=36`)).body);
    check("2-digit string is 32px wide (advance 16/glyph)", two && two.w === 32, JSON.stringify(two));

    // Tint: request a pure-red year and confirm the opaque glyph pixels are actually red, not white.
    let sharp = null; try { sharp = require("sharp"); } catch (_) {}
    if (sharp) {
      const red = await getRaw(`/api/research/glyph-text?text=1&color=ff0000`);
      const { data, info } = await sharp(red.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let redOpaque = 0, nonRedOpaque = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 128) continue; // transparent
        if (data[i] > 200 && data[i + 1] < 60 && data[i + 2] < 60) redOpaque++; else nonRedOpaque++;
      }
      check("color= tints the glyphs (opaque pixels are the requested red)", redOpaque > 0 && nonRedOpaque === 0, `red=${redOpaque} other=${nonRedOpaque} dims=${info.width}x${info.height}`);
    } else {
      console.log("  (sharp unavailable — skipping tint assertion)");
    }

    // hoi_33 (section-label font) stores its glyph in the RED channel (alphaChnl=1), unlike hoi_36header
    // (alpha). The blitter must read the right channel per-font or a label comes out BLANK. Assert non-empty.
    const lab = await getRaw(`/api/research/glyph-text?text=SMALL%20ARMS&font=hoi_33`);
    const labDims = pngDims(lab.body);
    if (sharp && labDims) {
      const { data } = await sharp(lab.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let opaque = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 40) opaque++;
      check("hoi_33 label renders from the RED channel (non-blank)", opaque > 200, `opaque=${opaque} dims=${JSON.stringify(labDims)}`);
    }
    // maxWidth WORD-WRAP: a long label with maxWidth is NARROWER and TALLER (more lines) than unwrapped.
    const noWrap = pngDims((await getRaw(`/api/research/glyph-text?text=NUCLEAR%20REACTORS&font=hoi_33`)).body);
    const wrapped = pngDims((await getRaw(`/api/research/glyph-text?text=NUCLEAR%20REACTORS&font=hoi_33&maxWidth=200`)).body);
    check("maxWidth wraps: narrower + taller than one line", noWrap && wrapped && wrapped.w < noWrap.w && wrapped.h > noWrap.h, `noWrap=${JSON.stringify(noWrap)} wrapped=${JSON.stringify(wrapped)}`);

    // A bogus/absent font name must fall back to hoi_36header (never crash), still yielding the 64px year.
    const bogus = pngDims((await getRaw(`/api/research/glyph-text?text=1965&font=does_not_exist!!`)).body);
    check("invalid font name falls back to hoi_36header (still 64px)", bogus && bogus.w === 64, JSON.stringify(bogus));

    // Empty text is a client error, not a blank image.
    const empty = await getRaw(`/api/research/glyph-text?text=`);
    check("empty text → 400", empty.status === 400, empty.status);

    // The endpoint must not depend on (or write) any mod path — same result with a junk modPath.
    const noMod = pngDims((await getRaw(`/api/research/glyph-text?text=1965&modPath=${encodeURIComponent("Z:/nope")}`)).body);
    check("read-only: renders regardless of modPath (base-game font)", noMod && noMod.w === 64, JSON.stringify(noMod));

    // BOX MODE (#text-box-raster): the game anchors the authored position at the TEXTBOX's top-left and insets
    // the glyphs by borderSize + the font's own yoffset — it does NOT pin a tight ink crop there. Ground truth
    // from the in-game debug overlay: airtech_year3 = maxWidth 170 x (hoi_36header lineHeight 36 + 2*borderY 4)
    // = 170x44, where the tight crop is only 64x25. Regressing this puts every year/label stamp ~10px too high
    // with a far-too-small footprint (which also corrupts the section-label de-overlap obstacle rects).
    const boxed = pngDims((await getRaw(`/api/research/glyph-text?text=1965&font=hoi_36header&maxWidth=170&format=left&box=1&borderX=0&borderY=4`)).body);
    check("box=1 emits the authored textbox 170x44 (game-exact)", boxed && boxed.w === 170 && boxed.h === 44, JSON.stringify(boxed));
    const tight = pngDims((await getRaw(`/api/research/glyph-text?text=1965&font=hoi_36header&maxWidth=170&format=left`)).body);
    check("no box → still the tight 64x25 ink crop (default unchanged)", tight && tight.w === 64 && tight.h === 25, JSON.stringify(tight));
    // borderY widens the box vertically by exactly 2*borderY; borderX horizontally by 2*borderX.
    const b0 = pngDims((await getRaw(`/api/research/glyph-text?text=1965&font=hoi_36header&maxWidth=170&box=1&borderY=0`)).body);
    check("box borderY=0 → height is one lineHeight (36)", b0 && b0.h === 36, JSON.stringify(b0));
    const bx = pngDims((await getRaw(`/api/research/glyph-text?text=1965&font=hoi_36header&maxWidth=170&box=1&borderX=5&borderY=4`)).body);
    check("box borderX=5 → width 170+2*5=180", bx && bx.w === 180, JSON.stringify(bx));
    // A LARGE borderSize is real authoring, not a typo to clamp away (#border-size-layout). Road to 56 pushes
    // its 1936 industry year down into the next row with borderSize={x=0 y=154} instead of moving the box, so
    // the glyphs must sit 154px below the box top. The old 64 cap silently rewrote that to 64 and the year
    // landed 90px high — 1930 and 1936 rendered as one stacked blob, which is exactly what the user
    // photographed. Corpus-wide, 863 year textboxes carry a borderSize.y: 861 are 4, one is 5, one is this 154.
    const bBig = pngDims((await getRaw(`/api/research/glyph-text?text=1936&font=hoi_36header&maxWidth=130&box=1&borderX=0&borderY=154`)).body);
    check("box borderY=154 (R56 industry) → height 36+2*154=344, NOT clamped to 64", bBig && bBig.h === 344, JSON.stringify(bBig));
    const bClamp = pngDims((await getRaw(`/api/research/glyph-text?text=1936&font=hoi_36header&maxWidth=130&box=1&borderX=0&borderY=99999`)).body);
    check("borderY is still bounded (99999 → clamped, raster stays finite)", bClamp && bClamp.h === 36 + 2 * 512, JSON.stringify(bClamp));
    // VERTICAL ANCHOR (#textbox-top-anchor). The box is ALWAYS top-anchored at the authored y and its height
    // is ALWAYS lines*lineHeight + 2*borderSize.y. borderSize.y is pure padding, NOT an anchor selector, and
    // maxHeight is the wrap/clip envelope — never the height, never a position. Four in-game debug-overlay
    // readings pin it across both fonts, both borderY values, and maxHeight both above and below the result:
    //   airtech_year3              border{0,4} maxHeight 32 -> 170x44 = 36 + 2*4
    //   infantry_year2             border{0,0} maxHeight 32 -> 170x36 = 36 + 0
    //   naval_subtitle_battleships border{0,4} maxHeight 74 -> 600x41 = 33 + 2*4
    //   infantry_subtitle_weapons  border{0,0} maxHeight 74 -> 600x33 = 33 + 0
    // The last one killed an earlier "borderY==0 bottom-anchors in maxHeight" rule, which inflated that box
    // to 74 and drew the label 41px too low — swallowing the gap the game leaves under a year.
    const anch0 = pngDims((await getRaw(`/api/research/glyph-text?text=SMALL%20ARMS&font=hoi_33&maxWidth=600&box=1&borderY=0&maxHeight=74`)).body);
    check("borderY=0 + maxHeight=74 → maxHeight IGNORED, 600x33 (in-game overlay reading)", anch0 && anch0.h === 33 && anch0.w === 600, JSON.stringify(anch0));
    const anch4 = pngDims((await getRaw(`/api/research/glyph-text?text=CORVETTES&font=hoi_33&maxWidth=200&box=1&borderY=4&maxHeight=74`)).body);
    check("borderY=4 + maxHeight=74 → maxHeight IGNORED, top-anchored 41 (naval rule)", anch4 && anch4.h === 41, JSON.stringify(anch4));
    const anchYr = pngDims((await getRaw(`/api/research/glyph-text?text=1965&font=hoi_36header&maxWidth=170&box=1&borderY=4&maxHeight=32`)).body);
    check("borderY=4 + maxHeight=32 (air year) → still 170x44, maxHeight ignored", anchYr && anchYr.w === 170 && anchYr.h === 44, JSON.stringify(anchYr));
    // maxHeight-INDEPENDENCE: the same text/font/border at wildly different maxHeight must be byte-identical
    // in size. This is the assertion that would have caught the old rule immediately.
    const mhA = pngDims((await getRaw(`/api/research/glyph-text?text=SMALL%20ARMS&font=hoi_33&maxWidth=600&box=1&borderY=0&maxHeight=0`)).body);
    const mhB = pngDims((await getRaw(`/api/research/glyph-text?text=SMALL%20ARMS&font=hoi_33&maxWidth=600&box=1&borderY=0&maxHeight=500`)).body);
    check("maxHeight never changes the box (0 vs 74 vs 500 all → 600x33)",
      mhA && mhB && mhA.h === 33 && mhB.h === 33 && mhA.w === 600 && mhB.w === 600, JSON.stringify([mhA, anch0, mhB]));
    // HARD LINE BREAKS (#hard-newline): a HOI4 loc value can carry an authored newline — MD writes
    // CRUISE_MISSILES_TITLE_GLCM = "GROUND-LAUNCHED\nCRUISE MISSILES" and the loc parser delivers a real
    // 0x0A here. The engine breaks there unconditionally, THEN word-wraps each segment inside maxWidth.
    // Splitting on spaces alone welded "GROUND-LAUNCHED\nCRUISE" into one 368px token that no maxWidth can
    // split: the line overran its 300px box, format=center clamped the shift to 0 (sliding the ink off its
    // centered span into the root tech box), and labels that collapsed to one line under-reported their
    // height by a whole lineHeight (MD's SAM label rendered 41px where the game draws 74).
    const nl = (s) => encodeURIComponent(s);
    const hard2 = pngDims((await getRaw(`/api/research/glyph-text?text=${nl("GROUND-LAUNCHED\nCRUISE MISSILES")}&font=hoi_33&maxWidth=300&format=center&box=1&borderY=4&maxHeight=74`)).body);
    check("authored \\n → 2 lines (300x74), not one welded line", hard2 && hard2.w === 300 && hard2.h === 74, JSON.stringify(hard2));
    const hardSam = pngDims((await getRaw(`/api/research/glyph-text?text=${nl("SURFACE-TO-AIR\nMISSILES")}&font=hoi_33&maxWidth=320&format=center&box=1&borderY=4&maxHeight=74`)).body);
    check("short authored \\n still breaks (was collapsing to 41px)", hardSam && hardSam.h === 74, JSON.stringify(hardSam));
    // Each segment wraps INDEPENDENTLY inside maxWidth: a long 2nd segment adds further lines.
    const hard3 = pngDims((await getRaw(`/api/research/glyph-text?text=${nl("SHORT\nNUCLEAR REACTORS AND POWER")}&font=hoi_33&maxWidth=200&format=left&box=1&borderY=4&maxHeight=74`)).body);
    check("segments wrap independently (1 + n lines)", hard3 && hard3.h > 74, JSON.stringify(hard3));
    // A string with NO newline must be unchanged by the hard-break pass (soft wrap only).
    const soft = pngDims((await getRaw(`/api/research/glyph-text?text=CORVETTES&font=hoi_33&maxWidth=200&format=left&box=1&borderY=4&maxHeight=74`)).body);
    check("no-newline label unchanged (single line 41px)", soft && soft.w === 200 && soft.h === 41, JSON.stringify(soft));

    // maxHeight smaller than one line with borderY=0 degrades to top-anchoring (topPad floors at 0).
    const anchSm = pngDims((await getRaw(`/api/research/glyph-text?text=1965&font=hoi_36header&maxWidth=170&box=1&borderY=0&maxHeight=32`)).body);
    check("borderY=0 + maxHeight(32) < lineHeight(36) → still one lineHeight (36); maxHeight is not a clamp", anchSm && anchSm.h === 36, JSON.stringify(anchSm));
  } catch (e) {
    fail++; console.log("  FAIL harness threw →", e && e.stack || e);
  } finally {
    server.close();
    console.log(`\nGLYPH-TEXT TEST: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
});
