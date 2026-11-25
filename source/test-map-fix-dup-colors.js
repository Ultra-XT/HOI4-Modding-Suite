// Unit test: fixDuplicateProvinceColors — repairs a province painted with the RESERVED black colour (0,0,0).
// Black is HOI4's dummy/no-province colour (province 0); a real province (id>0) sharing it has its pixels
// resolve to province 0, leaving it with ZERO pixels → HOI4 divides by zero computing its centre while loading
// the map (EXCEPTION_INT_DIVIDE_BY_ZERO, a silent ~5s CTD). The fixer assigns a unique colour, repaints the
// black pixels onto it, and replaces "unknown" terrain. Run: node test-map-fix-dup-colors.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, pixelFn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = pixelFn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
// columns: 1 (red) | 2 (BLACK offender) | 3 (blue)
const COL = { 1: [200, 0, 0], 2: [0, 0, 0], 3: [0, 0, 200] };
const provAtX = (x) => (x <= 2 ? 1 : x <= 5 ? 2 : 3);
const W = 9, H = 4;

(() => {
  console.log("=== fixDuplicateProvinceColors (a province painted reserved-black) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupcol-"));
  mk(path.join(mod, "descriptor.mod"), 'name="DupCol"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",        // dummy province 0 (legitimately black)
    "1;200;0;0;land;false;plains;1",
    "2;0;0;0;land;true;unknown;1",          // OFFENDER: real province sharing black + "unknown" terrain
    "3;0;0;200;sea;false;ocean;0",
  ].join("\r\n") + "\r\n");
  const lineOf = (id) => (fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "");
  const colorsPresent = () => { const b = fs.readFileSync(path.join(mod, "map", "provinces.bmp")); const dataOff = b.readUInt32LE(10), w = b.readInt32LE(18), h = b.readInt32LE(22), rs = Math.floor((24 * w + 31) / 32) * 4; const s = new Set(); let blk = 0; for (let y = 0; y < h; y++) { let o = dataOff + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const r = b[o + 2], g = b[o + 1], bl = b[o]; s.add(r + "," + g + "," + bl); if (!r && !g && !bl) blk++; o += 3; } } return { set: s, black: blk }; };

  try {
    const before = colorsPresent();
    ok("fixture has black pixels before the fix", before.black > 0, before.black);
    const r = md.fixDuplicateProvinceColors({ modRoot: mod });
    ok("recolors exactly 1 black province (id 2)", r.recolored.length === 1 && r.recolored[0].id === 2, r);
    ok("assigns a NON-black unique colour", r.recolored[0].color.some((v) => v !== 0), r.recolored);
    ok("repaints the black pixels", r.pixelsRepainted === before.black, r);
    ok("no leftover OTHER duplicate colour groups", r.otherDuplicates.length === 0, r.otherDuplicates);
    // definition.csv: province 2 recoloured + terrain repaired
    const c2 = lineOf(2).split(";");
    ok("disk: province 2 no longer black in definition.csv", !(c2[1] === "0" && c2[2] === "0" && c2[3] === "0"), c2);
    ok('disk: province 2 "unknown" terrain replaced with plains', c2[6] === "plains", c2);
    ok("disk: province 0 (the dummy) is still black", lineOf(0).startsWith("0;0;0;0;"), lineOf(0));
    // provinces.bmp: black gone, province 2's new colour present
    const after = colorsPresent();
    ok("bitmap has no black pixels left", after.black === 0, after.black);
    ok("bitmap now contains province 2's new colour", after.set.has(c2[1] + "," + c2[2] + "," + c2[3]), { want: c2.slice(1, 4), got: [...after.set] });
    // model: no duplicates, no id>0 black
    const m = md.buildMapModel({ modRoot: mod });
    const byColor = new Map(); for (const p of (m.provinces || [])) { const k = ((p.r << 16) | (p.g << 8) | p.b) >>> 0; if (!byColor.has(k)) byColor.set(k, []); byColor.get(k).push(p.id); }
    ok("model: zero duplicate colours remain", [...byColor.values()].every((ids) => ids.length === 1));
    ok("model: zero id>0 black provinces remain", !(m.provinces || []).some((p) => p.id > 0 && !p.r && !p.g && !p.b));
    ok("idempotent — a second pass recolors nothing", md.fixDuplicateProvinceColors({ modRoot: mod }).recolored.length === 0);

    console.log(`\ntest-map-fix-dup-colors: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// TWO black provinces — the case the fixer deliberately cannot finish.
//
// With one offender every black pixel is unambiguously its, so the bitmap is repainted and the province
// comes out whole. With two the fixer cannot tell whose pixel is whose: it gives both unique colours in
// definition.csv and leaves the pixels black. Those provinces now have NO pixels at all, and the map still
// will not load — province_no_pixels is in the curated FATAL set.
//
// It has always returned `needsManualPixels` to say so, and nothing ever read it: Auto-fix reported only
// "gave 2 blank/black province(s) a unique colour", which reads as done.
// #auto-fix-recoloured-a-crash-it-could-not-repaint
(() => {
  console.log("\n=== two black provinces: recoloured, but NOT repaintable ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dupcol2-"));
  mk(path.join(mod, "descriptor.mod"), 'name="DupCol2"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;200;0;0;land;false;plains;1",
    "2;0;0;0;land;false;unknown;0",
    "3;0;0;0;land;false;unknown;0",
  ].join("\n") + "\n");
  // Only province 1 is painted; 2 and 3 are black in the csv and have no pixels of their own.
  fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, () => [200, 0, 0]));

  try {
    // Read the province_no_pixels problem, which is the one that survives the fix. (province_reserved_black
    // is ownership-gated — #inherited-problem-not-yours — so it needs a resolvable base layer to speak
    // about; province_no_pixels is derived from this mod's own two files and is the honest anchor here.)
    const noPixels = () => md.validateMapBitmap({ modRoot: mod }).find((x) => x.rule === "province_no_pixels");
    const before = noPixels();
    ok("before: province_no_pixels is reported, so Save stops for it", !!before, before && before.message);
    ok("before: …blaming ONE province, because 2 and 3 share black and black resolves to the dummy",
      /\(3\)/.test(before.message), before.message);

    const r = md.fixDuplicateProvinceColors({ modRoot: mod });
    ok("recolors BOTH black provinces", r.recolored.length === 2, r.recolored);
    ok("⭐ …and says it could not repaint them", r.needsManualPixels === true, r);
    ok("⭐ …because with two offenders it repaints no pixel at all", r.pixelsRepainted === 0, r);
    const c2 = fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.startsWith("2;"));
    ok("disk: province 2 really was given a non-black colour", !/^2;0;0;0;/.test(c2), c2);

    // ⚠️ THE POINT. The colours are unique now and the crash is untouched: both provinces have zero pixels.
    const after = noPixels();
    ok("⭐⭐ the map is STILL fatally broken — province_no_pixels remains", !!after, after);
    ok("⭐⭐ …and now names BOTH provinces, where before it named one",
      /\(2, 3\)/.test(after.message), after.message);
    ok("…as an error, so the Save gate and Mod Health both still see it", after.severity === "error", after.severity);

    // …and the Auto-fix summary has to SAY so, or "gave 2 a unique colour" reads as done.
    // Comments masked (length-preserving): the claim is about what the modder reads, and a fix's own prose names what it removed.
    // The block starts at the Auto-fix click handler's own `let tail` — the first one in the file is regionRepairNote's.
    const MAP = require("./testlib-strip-comments.js").maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
    // ⚠️ MOVED WITH 🌍 Generate a world, which shows the same summary for its Auto-fix steps: the block left the click handler for
    // autoFixResultNote(fr), and the click hands its answer to that — so the block is read there, and the click held to calling it.
    const click = MAP.indexOf("ov.querySelector(\"#mapErrFix\")");
    ok("the popup's 🔧 Auto-fix all click builds its line with autoFixResultNote(fr)", click > 0 && /const summaryLine = autoFixResultNote\(fr\);/.test(MAP.slice(click, click + 4000)));
    const t = MAP.indexOf("let tail = \"\";", MAP.indexOf("function autoFixResultNote("));
    // Ends where the summary line is assembled. #the-auto-fix-summary-claims-no-failed-load-for-a-duplicate-state moved that line
    // from setStatus(…) into a const the reload keeps on screen, so the anchor is the expression both shapes share — and a missing
    // anchor fails here instead of slicing to the end of the file.
    // ⚠️ #auto-fix-says-it-found-nothing-after-refusing-216-states — the anchor was `(parts.length ? \`🔧 Auto-fixed`, which pinned
    // the SHAPE of that ternary as well as its place. Giving the empty-parts case a second branch ("it changed nothing" vs the
    // server's own nothingToFix) broke it across three lines, and this assertion — correctly — refused rather than slicing to the
    // end of the file. The declaration is the boundary; how the ternary is laid out is not this test's business.
    const tailEnd = t > 0 ? MAP.indexOf("const summaryLine =", t) : -1;
    ok("the Auto-fix summary's tail block was found", t > 0 && tailEnd > t, { t, tailEnd });
    const tailBlock = MAP.slice(t, tailEnd);
    ok("⭐⭐ the Auto-fix summary reads needsManualPixels", /dc\.needsManualPixels/.test(tailBlock), tailBlock.length);
    // Moved with #a-map-message-claims-only-what-the-engine-shows: this asserted the summary says the map "still fails to load".
    // province_no_pixels is FATAL but untested — hoi4.exe's GenerateBoundingBoxes (0x140AB0C60 in 1.19.4.1) logs " has no pixels in
    // provinces.bmp" and carries on, and no launch has shown more — so the summary says Save still stops for it instead.
    ok("…and tells the modder Save still stops for it, without claiming the map fails to load",
      /NO pixels in provinces\.bmp/.test(tailBlock) && /Save still stops for it/.test(tailBlock) && !/fails to load/.test(tailBlock));

    console.log(`\ntest-map-fix-dup-colors: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
