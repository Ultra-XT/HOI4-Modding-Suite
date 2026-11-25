// Every map bitmap HOI4 reads against provinces.bmp must be the same size as it, and 8-bit — and Nova must say
// so when it is not. #a-map-bitmap-must-be-the-size-of-provinces-bmp
//
// THE DEFECT. validateMapFiles read ONE bitmap header, provinces.bmp's, and checked that it was 24-bit, a
// multiple of 256 and under the pixel cap. Nothing ever opened heightmap.bmp, terrain.bmp, rivers.bmp or
// cities.bmp. So a modder who resized provinces.bmp to a perfectly legal 512x256 — which is what Nova's own
// bmp_bad_dimensions hint tells them to do — while inheriting the base game's other bitmaps got a clean bill of
// health from "Will it crash?". levelPaintedPixels and sinkProvincesInHeightmap already compute exactly this
// comparison, and hand the answer back as a `reason` string that nothing renders.
//
// THE EVIDENCE, re-measured 2026-09-11 from the BMP headers of vanilla and five workshop maps:
//   * the heightmap/terrain/rivers/cities.bmp each map actually LOADS (its own, or the one it inherits) is the
//     same width and height as its provinces.bmp — 24 of 24 — and 8-bit and uncompressed, 24 of 24. Three of
//     those maps inherit cities.bmp from the base game, and stay valid only because they kept vanilla's size;
//   * the one map that changed size (Old World Blues, 5632x2304) shipped every one of them re-cut to match;
//   * HOI4 wiki, Map modding: the heightmap "has the same image dimensions as the provinces bitmap and is saved
//     as a 8-bit greyscale/indexed greyscale image"; terrain.bmp "is a 8-bit indexed image with the same
//     dimensions as the provinces bitmap"; the river map "is a 8-bit indexed bitmap with the same dimensions";
//   * HOI4 wiki, Troubleshooting → Main Menu Loading, the crash that names gfx/models/supply/railroad.shader:
//     "Some causes include … the dimensions changing between different bitmaps (aside from trees.bmp…)";
//   * hoi4.exe carries the checks itself: "MAP_ERROR: Size of the world map [ … ] is not equal to the size of
//     rivers.bmp [" beside the assertion "pRiverBitmap->GetWidth() == WIDTH && pRiverBitmap->GetHeight() ==
//     HEIGHT", and "Cities mask bitmap has invalid size" / "Cities mask bitmap should be 8bpp depth", and
//     "MAP_ERROR: Bitdepth of rivers.bmp does not equal 8".
// Both are ERRORS, and neither goes in the curated FATAL set that gates a Save. A gate needs a crash, and none has
// been reproduced: the engine's checks log a MAP_ERROR, and the wiki's crash list is not proof on its own — the
// same sentence that names mismatched sizes also names a BITMAPV5HEADER as a cause, while vanilla's own
// terrain.bmp is a V5 header (measured 2026-09-11) and the game loads it.
//
// ⚠️ THE HEADER VERSION IS NOT A FORMAT ERROR. Vanilla's own terrain.bmp and trees.bmp carry a 124-byte
// BITMAPV5HEADER, and Millennium Dawn's cities.bmp a 108-byte V4 header — so the check reads only the fields every
// version shares, and a V4/V5 bitmap at the right size and depth must say nothing.
//
// ⚠️ A MOD IS AN OVERLAY. A pair is only the mod's problem if the mod ships one of its files; an add-on is not
// blamed for the bitmaps of the mod it sits on (#inherited-problem-not-yours).
//
// ── 2026-09-17: THE SAME DEFECT, ONE FILE FURTHER OUT ────────────────────────────────────────────────────────
// map/world_normal.bmp is the relief-lighting normal map, and until today `world_normal.bmp` appeared in exactly
// one place in all of Nova: the comment above MAP_BITMAPS_SIZED_LIKE_PROVINCES, saying "Deliberately NOT listed:
// world_normal.bmp (half the size, 24-bit, 6 of 6)". The relation was measured, written down, and then not
// checked — no reader, no writer, no rule. That is the signature terrain.bmp carried right up to the point it
// turned out to be the whole of what the owner saw on his screen.
//
// It is Nova's own hint that walks a modder into it: bmp_bad_dimensions says "resize provinces.bmp … and resize
// heightmap.bmp, terrain.bmp, rivers.bmp and cities.bmp to exactly the same size". Follow that to the letter and
// world_normal.bmp keeps the old shape, and Nova calls the map clean.
//
// THE EVIDENCE, measured 2026-09-17 from the BMP headers of vanilla and the five workshop maps:
//   vanilla / Millennium Dawn / Road to 56 / Rise of Nations   provinces 5632×2048   world_normal 2816×1024
//   Old World Blues                                            provinces 5632×2304   world_normal 2816×1152
//   Novum Vexillum ships none; the vanilla copy it inherits still halves its own provinces.bmp.
// Exactly half in BOTH axes, 5 of 5 that ship one and 6 of 6 effectively — and Old World Blues, the only map
// that ever had to decide, re-cut it rather than leaving it. 24-bit 5 of 5, so it must NOT be held to the 8-bit
// check the other four get. Old rule id on purpose: a new one would have to be added to every gate list that
// decides what Mod Health offers a fix button for.
//
// ⚠️ trees.bmp stays out, and that is a measurement too: its scale is uniform in all six (width/provinces.width
// equals height/provinces.height) but the FACTOR is the mod's own — 0.2930 in five, 0.5000 in Millennium Dawn —
// so there is no size to demand. The wiki's crash sentence excludes it by name.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bmpsize-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const tmps = [HOME];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bmpsize-" + tag + "-")); tmps.push(d); return d; };

function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, size = 54 + rs * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
// An 8-bit greyscale-palette BMP. `dib` is the DIB header length: 40 is BITMAPINFOHEADER; 108 and 124 are the V4
// and V5 headers the shipping corpus also uses.
function bmp8(W, H, dib = 40) {
  const pal = 14 + dib, rs = (W + 3) & ~3, off = pal + 256 * 4, size = off + rs * H, b = Buffer.alloc(size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(size, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(dib, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(0, 30);
  b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[pal + i * 4] = i; b[pal + 1 + i * 4] = i; b[pal + 2 + i * 4] = i; }
  b.fill(96, off);
  return b;
}
const DEF = ["0;0;0;0;land;false;unknown;0", "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1"].join("\r\n") + "\r\n";
const halves = (W, H) => bmp24(W, H, (x) => (x < W / 2 ? [200, 0, 0] : [0, 200, 0]));
const rulesOf = (probs) => probs.map((p) => p.rule);
const validate = (modRoot, gameRoot, deps) => md.validateMapBitmap({ modRoot, gameRoot, dependencyRoots: deps || [] });

try {
  console.log("0. The list comes from the source, and covers every bitmap Nova itself touches");
  const LIST = md.MAP_BITMAPS_SIZED_LIKE_PROVINCES;
  rec("map-data.js exports the bitmaps it holds to provinces.bmp's size", Array.isArray(LIST) && LIST.length > 0, LIST);
  // …and the ones it holds to a FRACTION of that size, each carrying its own divisor so this test reads the
  // relation out of the source instead of typing 2.
  const SCALED = md.MAP_BITMAPS_SCALED_FROM_PROVINCES;
  rec("map-data.js exports the bitmaps it holds to a fraction of provinces.bmp's size",
    Array.isArray(SCALED) && SCALED.length > 0 && SCALED.every((s) => s && typeof s.name === "string" && Number.isInteger(s.divisor) && s.divisor > 1), SCALED);
  const SCALED_NAMES = (Array.isArray(SCALED) ? SCALED : []).map((s) => s.name);
  // …and the ones held to NO size, which is a third answer and not a gap: trees.bmp sets vegetation density
  // over an area rather than describing a province pixel for pixel, its scale is the mod's own choice (five of
  // the six shipping maps 1650x600, Millennium Dawn 2816x1024, Old World Blues 1650x675), and the wiki's crash
  // sentence excludes it by name. #drowned-land-keeps-its-forests opened it in code; a size rule still has
  // nothing to say about it. Naming the exemption is what keeps the derived check below biting.
  const NO_SIZE = md.MAP_BITMAPS_HELD_TO_NO_SIZE;
  rec("map-data.js exports the bitmaps it holds to NO size, and says which",
    Array.isArray(NO_SIZE) && NO_SIZE.length > 0 && NO_SIZE.every((n) => typeof n === "string" && n.endsWith(".bmp")), NO_SIZE);
  const NO_SIZE_NAMES = Array.isArray(NO_SIZE) ? NO_SIZE : [];
  rec("⚠️ no bitmap is in more than one list — a file has one relation, not two",
    SCALED_NAMES.every((n) => !(LIST || []).includes(n))
    && NO_SIZE_NAMES.every((n) => !(LIST || []).includes(n) && !SCALED_NAMES.includes(n)),
    { LIST, SCALED_NAMES, NO_SIZE_NAMES });
  const SRC = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  // Every "<name>.bmp" string literal in the CODE (comments masked) other than provinces.bmp itself. If one of
  // these is ever a bitmap with a different documented size, it belongs in this test's reasoning, not in a
  // silent skip.
  const named = [...new Set([...SRC.matchAll(/"([a-z_]+\.bmp)"/g)].map((m) => m[1]))].filter((f) => f !== "provinces.bmp");
  // ⚠️ THIS CHECK HAS ENCODED THE OLD BEHAVIOUR TWICE, IN THE SAME WAY BOTH TIMES. It read "…is one of them"
  // against the exact-size list alone, so the day world_normal.bmp stopped being a comment and became a string
  // literal in the code, the test that exists to notice an unheld bitmap would have failed FOR THE FIX. Judged
  // against both SIZE relations it bit again the day clearProvincesInTreesBmp opened trees.bmp
  // (#drowned-land-keeps-its-forests) — a file that legitimately has no size rule at all. The answer is not to
  // narrow what it looks at: it is to make "held to no size" a relation that has to be declared and justified
  // in the source, so this still fails for a bitmap nobody has reasoned about.
  const HELD = [...new Set([...(Array.isArray(LIST) ? LIST : []), ...SCALED_NAMES, ...NO_SIZE_NAMES])];
  rec("⭐ every bitmap Nova's own code reads or writes is held to one of the three relations",
    named.length > 0 && named.every((f) => HELD.includes(f)), { named, HELD });
  // The fixtures use the union, so the scenarios below exercise real files even against a source with no list.
  // The scaled ones are built at their own fraction, and never at provinces.bmp's size; the unsized ones are
  // kept out entirely and get their own scenario below, where NOT reporting them is the thing being checked.
  const FILES = [...new Set([...(Array.isArray(LIST) ? LIST : []), ...named])]
    .filter((f) => !SCALED_NAMES.includes(f) && !NO_SIZE_NAMES.includes(f));
  const sizedBy = (W, H) => (f) => { const s = SCALED.find((x) => x.name === f); return s ? [W / s.divisor, H / s.divisor] : [W, H]; };

  // The base game: 256x256 provinces.bmp and every other bitmap at the same size, 8-bit.
  const GAME = tmp("game");
  mk(path.join(GAME, "map", "provinces.bmp"), halves(256, 256));
  mk(path.join(GAME, "map", "definition.csv"), DEF);
  for (const f of FILES) mk(path.join(GAME, "map", f), bmp8(256, 256));
  // world_normal.bmp is 24-bit in all five shipping copies, and it is half: 128×128 under a 256×256 world.
  for (const f of SCALED_NAMES) { const [w, h] = sizedBy(256, 256)(f); mk(path.join(GAME, "map", f), bmp24(w, h, () => [128, 128, 255])); }

  console.log("\n1. ⛔ A resized provinces.bmp over the base game's other bitmaps");
  {
    const mod = tmp("resized");
    mk(path.join(mod, "descriptor.mod"), 'name="Resized"\n');
    mk(path.join(mod, "map", "provinces.bmp"), halves(512, 256));
    mk(path.join(mod, "map", "definition.csv"), DEF);
    const probs = validate(mod, GAME);
    rec("the resize itself is legal — no bmp_bad_dimensions", !rulesOf(probs).includes("bmp_bad_dimensions"), rulesOf(probs));
    const p = probs.find((x) => x.rule === "bmp_size_mismatch");
    rec("⭐⭐⭐ the size mismatch is reported", !!p, rulesOf(probs));
    const q = p || {};
    rec("…naming every bitmap that no longer matches", Array.isArray(q.items) && [...FILES, ...SCALED_NAMES].every((f) => q.items.some((i) => i.file === "map/" + f)), q.items);
    // Each file is judged against the size the FIXTURE gave it, derived through the same divisors — a scaled
    // bitmap is 128×128 here where the others are 256×256, and a check that typed 256 would have missed it.
    rec("…with the size each one really is", Array.isArray(q.items) && q.items.length > 0 && q.items.every((i) => {
      const [w, h] = sizedBy(256, 256)(i.file.slice(4)); return i.width === w && i.height === h;
    }), q.items);
    rec("⭐⭐⭐ …and the size HOI4 reads THAT file at, not one size for all of them", Array.isArray(q.items) && q.items.length > 0 && q.items.every((i) => {
      const [w, h] = sizedBy(512, 256)(i.file.slice(4)); return i.expectedWidth === w && i.expectedHeight === h;
    }), q.items);
    rec("…and that it is inherited, not the mod's copy", Array.isArray(q.items) && q.items.length > 0 && q.items.every((i) => i.inherited === true), q.items);
    rec("…as an error", q.severity === "error", q.severity);
    rec("⚠️ …but NOT in the FATAL set: the engine checks it, no crash has been reproduced", labels.isFatalRule("bmp_size_mismatch") === false);
    rec("…and the message gives both sizes", /512×256/.test(String(q.message)) && /256×256/.test(String(q.message)), String(q.message).slice(0, 220));
  }

  console.log("\n1b. ⛔ THE SCALED BITMAP: right in every other way, half of the wrong world");
  for (const s of SCALED) {
    // The mod re-cut the four same-size bitmaps exactly as Nova's own bmp_bad_dimensions hint tells it to,
    // and left world_normal.bmp alone. Before this fix that mod was told the map was clean.
    const mod = tmp("scaled");
    mk(path.join(mod, "descriptor.mod"), 'name="Scaled"\n');
    mk(path.join(mod, "map", "provinces.bmp"), halves(512, 256));
    mk(path.join(mod, "map", "definition.csv"), DEF);
    for (const f of FILES) mk(path.join(mod, "map", f), bmp8(512, 256));
    const probs = validate(mod, GAME);
    const p = probs.find((x) => x.rule === "bmp_size_mismatch");
    rec(`⭐⭐⭐ ${s.name} left at the old shape is reported`, !!p && p.items.some((i) => i.file === "map/" + s.name), rulesOf(probs));
    const it = (p && p.items || []).find((i) => i.file === "map/" + s.name) || {};
    rec("…and it is the ONLY one, because the mod re-cut the rest", !!p && p.items.length === 1, p && p.items);
    rec(`…saying it should be ${512 / s.divisor}×${256 / s.divisor}, not 512×256`,
      it.expectedWidth === 512 / s.divisor && it.expectedHeight === 256 / s.divisor, it);
    rec("…and the message names that size rather than provinces.bmp's",
      !!p && new RegExp(`${512 / s.divisor}×${256 / s.divisor}`).test(String(p.message)) && !/Resize it to 512×256/.test(String(p.message)), String(p && p.message).slice(0, 300));
    rec("…as an error, and still not FATAL", !!p && p.severity === "error" && labels.isFatalRule("bmp_size_mismatch") === false, p && p.severity);

    // THE CONTROL that matters most: the same mod with it re-cut to the half says NOTHING. Without this a rule
    // that reported every world_normal.bmp on earth would pass every check above.
    const good = tmp("scaledok");
    mk(path.join(good, "descriptor.mod"), 'name="ScaledOk"\n');
    mk(path.join(good, "map", "provinces.bmp"), halves(512, 256));
    mk(path.join(good, "map", "definition.csv"), DEF);
    for (const f of FILES) mk(path.join(good, "map", f), bmp8(512, 256));
    mk(path.join(good, "map", s.name), bmp24(512 / s.divisor, 256 / s.divisor, () => [128, 128, 255]));
    const rg = rulesOf(validate(good, GAME));
    rec(`⭐⭐ THE CONTROL: ${s.name} at exactly half says nothing`, !rg.includes("bmp_size_mismatch"), rg);
    rec("⚠️ …and a 24-bit one is NOT reported as wrong format — five of five shipping copies are 24-bit",
      !rg.includes("bmp_not_8bit"), rg);

    // …and it is not the mod's problem when the mod ships neither file. #inherited-problem-not-yours
    const addon = tmp("scaledaddon");
    mk(path.join(addon, "descriptor.mod"), 'name="ScaledAddon"\n');
    mk(path.join(addon, "common", "characters", "c.txt"), "characters = {\n}\n");
    const DEPS = tmp("scaleddep");
    mk(path.join(DEPS, "descriptor.mod"), 'name="ScaledDep"\n');
    mk(path.join(DEPS, "map", "provinces.bmp"), halves(512, 256));
    mk(path.join(DEPS, "map", "definition.csv"), DEF);
    for (const f of FILES) mk(path.join(DEPS, "map", f), bmp8(512, 256));
    rec("THE CONTROL: the dependency is told about its own", rulesOf(validate(DEPS, GAME)).includes("bmp_size_mismatch"));
    const ra = rulesOf(validate(addon, GAME, [DEPS]));
    rec("⭐⭐ an add-on that ships no bitmap is not blamed for it", !ra.includes("bmp_size_mismatch"), ra);

    // ⚠️ An odd provinces.bmp has no integer half. Nova must not invent a rounded size to demand.
    const odd = tmp("scaledodd");
    mk(path.join(odd, "descriptor.mod"), 'name="Odd"\n');
    mk(path.join(odd, "map", "provinces.bmp"), halves(255, 255));
    mk(path.join(odd, "map", "definition.csv"), DEF);
    for (const f of FILES) mk(path.join(odd, "map", f), bmp8(255, 255));
    const po = validate(odd, GAME).find((x) => x.rule === "bmp_size_mismatch");
    rec(`⚠️ a provinces.bmp with no integer half says nothing about ${s.name}`,
      !po || !po.items.some((i) => i.file === "map/" + s.name), po && po.items);
  }

  console.log("\n2. The controls: the same mod at the base game's size says nothing");
  {
    const mod = tmp("same");
    mk(path.join(mod, "descriptor.mod"), 'name="Same"\n');
    mk(path.join(mod, "map", "provinces.bmp"), halves(256, 256));
    mk(path.join(mod, "map", "definition.csv"), DEF);
    const r = rulesOf(validate(mod, GAME));
    rec("no bmp_size_mismatch", !r.includes("bmp_size_mismatch"), r);
    rec("no bmp_not_8bit", !r.includes("bmp_not_8bit"), r);

    // ⚠️ THE CORPUS CONTROL: vanilla's terrain.bmp is a V5 header and Millennium Dawn's cities.bmp a V4 one.
    // A reader that assumed the 40-byte header, or judged its length, would cry wolf on both.
    const v5 = tmp("v5");
    mk(path.join(v5, "descriptor.mod"), 'name="V5"\n');
    mk(path.join(v5, "map", "provinces.bmp"), halves(256, 256));
    mk(path.join(v5, "map", "definition.csv"), DEF);
    mk(path.join(v5, "map", FILES[0]), bmp8(256, 256, 124));
    if (FILES[1]) mk(path.join(v5, "map", FILES[1]), bmp8(256, 256, 108));
    const rv = rulesOf(validate(v5, GAME));
    rec("V4 and V5-header bitmaps at the right size and depth are not reported", !rv.includes("bmp_size_mismatch") && !rv.includes("bmp_not_8bit"), rv);
  }

  console.log("\n3. A mod that re-cut SOME of them is told only about the rest");
  {
    const mod = tmp("partial");
    mk(path.join(mod, "descriptor.mod"), 'name="Partial"\n');
    mk(path.join(mod, "map", "provinces.bmp"), halves(512, 256));
    mk(path.join(mod, "map", "definition.csv"), DEF);
    const own = FILES[0];
    mk(path.join(mod, "map", own), bmp8(512, 256));
    const p = validate(mod, GAME).find((x) => x.rule === "bmp_size_mismatch") || {};
    rec("still reported", Array.isArray(p.items), p.rule);
    rec(`…not naming ${own}, which the mod re-cut to match`, Array.isArray(p.items) && !p.items.some((i) => i.file === "map/" + own), p.items);
    rec("…while still naming every one it did not", Array.isArray(p.items) && FILES.slice(1).every((f) => p.items.some((i) => i.file === "map/" + f)), p.items);
  }

  console.log("\n3b. ⚠️ …and the bitmaps held to NO size are not reported, which is the point of the third list");
  {
    // A silent exemption is a skip, and a skip reads as a pass. So the exemption is DRIVEN: every unsized
    // bitmap is shipped at a size that would be a mismatch for any of the others, on a map that IS reported
    // for the rest — and the rule must still not name it. That is the cry-wolf floor: all six shipping maps
    // carry a trees.bmp that is neither provinces.bmp's size nor half of it, and telling them to resize it
    // would be a rule firing on maps that launch.
    if (!NO_SIZE_NAMES.length) {
      rec("there is an unsized bitmap to exercise", false, NO_SIZE_NAMES);
    } else {
      const mod = tmp("unsized");
      mk(path.join(mod, "descriptor.mod"), 'name="Unsized"\n');
      mk(path.join(mod, "map", "provinces.bmp"), halves(512, 256));
      mk(path.join(mod, "map", "definition.csv"), DEF);
      // 150x75 is neither 512x256 nor any integer fraction of it in both axes — the shape a real trees.bmp has.
      for (const f of NO_SIZE_NAMES) mk(path.join(mod, "map", f), bmp8(150, 75));
      const probs = validate(mod, GAME);
      const p = probs.find((x) => x.rule === "bmp_size_mismatch") || {};
      rec("the mod is still told about the bitmaps that DO have a size", Array.isArray(p.items) && p.items.length > 0, rulesOf(probs));
      rec(`⭐⭐ …and about none of ${NO_SIZE_NAMES.join(", ")}, at a size that fits no relation`,
        !probs.some((x) => Array.isArray(x.items) && x.items.some((i) => NO_SIZE_NAMES.includes(String(i.file || "").replace(/^map[/\\]/, "")))),
        probs.map((x) => [x.rule, (x.items || []).map((i) => i.file)]));
    }
  }

  console.log("\n4. A bitmap the mod ships in the wrong format");
  {
    const mod = tmp("format");
    mk(path.join(mod, "descriptor.mod"), 'name="Format"\n');
    mk(path.join(mod, "map", "provinces.bmp"), halves(256, 256));
    mk(path.join(mod, "map", "definition.csv"), DEF);
    const own = FILES[0];
    mk(path.join(mod, "map", own), bmp24(256, 256, () => [96, 96, 96]));
    const probs = validate(mod, GAME);
    const p = probs.find((x) => x.rule === "bmp_not_8bit");
    rec(`⭐⭐ a 24-bit ${own} is reported`, !!p, rulesOf(probs));
    rec("…naming it, with its bit depth", !!p && Array.isArray(p.items) && p.items.length === 1 && p.items[0].file === "map/" + own && p.items[0].bpp === 24, p && p.items);
    rec("…as an error", !!p && p.severity === "error", p && p.severity);
    rec("⚠️ …but NOT fatal: no source names a crash for it", labels.isFatalRule("bmp_not_8bit") === false);
    rec("…and it is the right size, so no size mismatch rides along", !rulesOf(probs).includes("bmp_size_mismatch"), rulesOf(probs));
  }

  console.log("\n5. ⚠️ An inherited bitmap is not the mod's to answer for");
  {
    // The base layer ships a wrong-format bitmap; a mod that ships only provinces.bmp did not put it there.
    const G2 = tmp("game2");
    mk(path.join(G2, "map", "provinces.bmp"), halves(256, 256));
    mk(path.join(G2, "map", "definition.csv"), DEF);
    for (const f of FILES) mk(path.join(G2, "map", f), bmp8(256, 256));
    mk(path.join(G2, "map", FILES[0]), bmp24(256, 256, () => [96, 96, 96]));
    const mod = tmp("inhfmt");
    mk(path.join(mod, "descriptor.mod"), 'name="InheritsFormat"\n');
    mk(path.join(mod, "map", "provinces.bmp"), halves(256, 256));
    const r = rulesOf(validate(mod, G2));
    rec("a base layer's wrong-format bitmap is not reported to the mod", !r.includes("bmp_not_8bit"), r);

    // A dependency that resized its own provinces.bmp over the base game's bitmaps, and an add-on shipping none.
    const DEP = tmp("dep");
    mk(path.join(DEP, "descriptor.mod"), 'name="Dep"\n');
    mk(path.join(DEP, "map", "provinces.bmp"), halves(512, 256));
    mk(path.join(DEP, "map", "definition.csv"), DEF);
    const ADDON = tmp("addon");
    mk(path.join(ADDON, "descriptor.mod"), 'name="Addon"\n');
    mk(path.join(ADDON, "common", "characters", "c.txt"), "characters = {\n}\n");
    rec("THE CONTROL: the dependency is told about its own mismatch", rulesOf(validate(DEP, GAME)).includes("bmp_size_mismatch"), rulesOf(validate(DEP, GAME)));
    const ra = rulesOf(validate(ADDON, GAME, [DEP]));
    rec("⭐⭐ an add-on that ships no bitmap is not blamed for it", !ra.includes("bmp_size_mismatch"), ra);
  }

  console.log("\n6. Nothing to compare against is nothing to report");
  {
    // test-map-file-validation.js and friends build a lone provinces.bmp with no base game at all.
    const mod = tmp("alone");
    mk(path.join(mod, "map", "provinces.bmp"), halves(512, 256));
    mk(path.join(mod, "map", "definition.csv"), DEF);
    const r = rulesOf(validate(mod, path.join(os.tmpdir(), "nova-no-game-dir")));
    rec("a mod with no other bitmap anywhere gets no mismatch", !r.includes("bmp_size_mismatch") && !r.includes("bmp_not_8bit"), r);
  }

  console.log("\n7. Labels, and a fix hint that no longer walks the modder into the trap");
  for (const rule of ["bmp_size_mismatch", "bmp_not_8bit"]) {
    rec(`'${rule}' has a friendly label`, !!labels.LABELS[rule], labels.LABELS[rule]);
    rec(`'${rule}' has a fix hint`, labels.mapRuleFixHint(rule).length > 15, labels.mapRuleFixHint(rule));
  }
  // "Resize provinces.bmp so both dimensions are multiples of 256", followed literally over inherited bitmaps,
  // produces exactly the mismatch above. The hint has to say the other bitmaps go with it.
  rec("⭐ bmp_bad_dimensions' hint says the other bitmaps must be resized with it",
    /heightmap/.test(labels.mapRuleFixHint("bmp_bad_dimensions")), labels.mapRuleFixHint("bmp_bad_dimensions"));
  // ⭐⭐⭐ THE HINT IS A HAND-TYPED FILE LIST, AND THAT IS EXACTLY WHAT GOES STALE. It named four bitmaps while
  // the code held five, so a modder who followed it exactly produced the defect Nova could not see. The names
  // are DERIVED from the two exported lists here, so the next bitmap added to either fails this instead of
  // shipping a hint that leaves it out. (The hints cannot require map-data.js — public/ is browser code.)
  // ⚠️ Derived from the two SIZE relations, NOT from HELD: a hint that told the modder to resize trees.bmp
  // would be wrong advice, because it has no size to match — see MAP_BITMAPS_HELD_TO_NO_SIZE. So the unsized
  // ones are required to be ABSENT, in the same loop, off the same source of truth.
  const SIZED_HELD = [...new Set([...(Array.isArray(LIST) ? LIST : []), ...SCALED_NAMES])];
  for (const rule of ["bmp_bad_dimensions", "bmp_too_big", "bmp_size_mismatch"]) {
    const hint = labels.mapRuleFixHint(rule);
    const missing = SIZED_HELD.filter((f) => !hint.includes(f));
    rec(`'${rule}' names every bitmap the code holds to provinces.bmp`, missing.length === 0, { missing, hint });
    const wrongly = NO_SIZE_NAMES.filter((f) => hint.includes(f));
    rec(`⚠️ '${rule}' does NOT tell the modder to resize a bitmap with no size to match`, wrongly.length === 0, { wrongly, hint });
  }
  // …and says HALF for the scaled ones, because "resize them to the same size" is wrong advice for those.
  for (const rule of ["bmp_bad_dimensions", "bmp_too_big", "bmp_size_mismatch"]) {
    rec(`'${rule}' says the scaled bitmaps are a fraction, not the same size`,
      SCALED_NAMES.length === 0 || /half/i.test(labels.mapRuleFixHint(rule)), labels.mapRuleFixHint(rule));
  }

  console.log(`\n=== every map bitmap is the size of provinces.bmp: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
