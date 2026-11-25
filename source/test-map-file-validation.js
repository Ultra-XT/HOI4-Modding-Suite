// Guard the file-level + bitmap-shape map checks (validateMapFiles) for the wiki's fatal/warning classes Nova
// was blind to: 24-bit + ×256 provinces.bmp, contiguous definition.csv ids, every colour present in the bitmap,
// no <8px or pixels-spread-too-far provinces, adjacencies.csv BOM + -1 terminator, non-empty buildings.txt.
// Plus fixAdjacenciesFile (strip BOM + append terminator). Builds real little BMP/CSV fixtures.
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const NOGAME = path.join(os.tmpdir(), "nova-no-game-dir");

function buildBmp(W, H, px, bpp) {                 // px[y][x] = [r,g,b]; 24-bit unless bpp overridden in header
  const rs = Math.floor((24 * W + 31) / 32) * 4, ds = rs * H, buf = Buffer.alloc(54 + ds);
  buf.write("BM", 0); buf.writeUInt32LE(54 + ds, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(bpp || 24, 28); buf.writeUInt32LE(ds, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = px[y][x]; const o = 54 + (H - 1 - y) * rs + x * 3; buf[o] = b; buf[o + 1] = g; buf[o + 2] = r; }
  return buf;
}
// 256×256 tiled into 64 blocks of 32×32 — each a distinct province (id 1..64, colour = id in R), clean by every rule.
const W = 256, H = 256, BS = 32, GX = W / BS;
const blockId = (x, y) => (Math.floor(y / BS) * GX + Math.floor(x / BS)) + 1;
function basePixels() { const p = []; for (let y = 0; y < H; y++) { p[y] = []; for (let x = 0; x < W; x++) { const id = blockId(x, y); p[y][x] = [id, 0, 0]; } } return p; }
function defRows(ids) { return ["0;0;0;0;land;false;unknown;0"].concat(ids.map((id) => `${id};${id};0;0;land;false;plains;1`)).join("\n") + "\n"; }
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), "nova-mapfile-"));
const wf = (root, rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
const rulesOf = (probs) => new Set(probs.map((p) => p.rule));
const trash = [];
function newMod(files) { const root = mk(); trash.push(root); for (const [rel, body] of Object.entries(files)) wf(root, rel, body); return root; }

try {
  // ── CLEAN map → none of the new rules fire (no false positives). adjacencies.csv has NO -1 terminator,
  //    exactly like real Millennium Dawn, to prove we don't flag that. ──
  {
    const ids = []; for (let i = 1; i <= 64; i++) ids.push(i);
    const root = newMod({
      "map/provinces.bmp": buildBmp(W, H, basePixels()),
      "map/definition.csv": defRows(ids),
      "map/adjacencies.csv": "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n2;3;sea;-1;-1;-1;-1;-1;;note\n",
      "map/buildings.txt": "1;arms_factory;1;2;3;0.0;4;0\n",
    });
    const r = rulesOf(md.validateMapFiles({ modRoot: root, gameRoot: NOGAME }));
    const newRules = ["bmp_not_24bit", "bmp_bad_dimensions", "province_id_gap", "province_no_pixels", "province_too_small", "province_too_large", "adjacency_bom", "buildings_empty"];
    ok(newRules.every((x) => !r.has(x)), "clean map fires none of the new rules (incl. no terminator-required false positive)", [...r]);
  }
  // ── MANGLED: too-large(1), too-small(65), no-pixels(66), id gap(67) ──
  {
    const px = basePixels();
    px[250][250] = [1, 0, 0];                                          // id 1 also far away → bbox spans map → too-large
    px[100][100] = px[100][101] = px[100][102] = [65, 0, 0];           // 3 px of a new id 65 → too-small
    const ids = []; for (let i = 1; i <= 66; i++) ids.push(i); ids.push(68); // define 65,66; 66 painted nowhere; skip 67 → gap
    const root = newMod({ "map/provinces.bmp": buildBmp(W, H, px), "map/definition.csv": defRows(ids) });
    const probs = md.validateMapFiles({ modRoot: root, gameRoot: NOGAME }); const r = rulesOf(probs);
    const big = probs.find((p) => p.rule === "province_too_large"), small = probs.find((p) => p.rule === "province_too_small"),
      nopx = probs.find((p) => p.rule === "province_no_pixels"), gap = probs.find((p) => p.rule === "province_id_gap");
    ok(big && big.provinces.includes(1), "too-large flags province 1 (pixels spread across the map)", big);
    // Q3 (review of B1-30): a warning Auto-fix leaves names the Map-tool step that clears it — and names no Auto-fix, or the Map
    // Errors popup offers a 🔧 that does nothing for it (autoFixOffers offers any warning whose text names Auto-fix without autoFix:false)
    const offers = require("./public/map-rule-labels.js").autoFixOffers;
    ok(big && /To clear it, click 🎨 Paint shape, pick the province around the stray pixels as the brush, paint over them, and 💾 Save/.test(big.message) && offers([big]).length === 0,
      "too-large names the Paint shape step that clears it, and the popup offers no Auto-fix for it", big && { autoFix: big.autoFix, message: big.message });
    ok(small && small.provinces.includes(65), "too-small flags province 65 (3 pixels)", small);
    ok(nopx && nopx.provinces.includes(66), "no-pixels flags province 66 (defined, never painted)", nopx);
    ok(gap && gap.missing.includes(67), "id-gap flags missing province 67", gap);
  }
  // ── a province that legitimately spans the horizontal map-wrap seam (pixels in column 0 AND W-1) must NOT
  //    be flagged too-large for its raw bounding-box width (this is how a Pacific ocean province looks) ──
  {
    const px = basePixels();
    for (let y = 200; y < 216; y++) { px[y][0] = [65, 0, 0]; px[y][W - 1] = [65, 0, 0]; } // 32px split across both edges → bbox spans full width
    const ids = []; for (let i = 1; i <= 65; i++) ids.push(i);
    const root = newMod({ "map/provinces.bmp": buildBmp(W, H, px), "map/definition.csv": defRows(ids) });
    const probs = md.validateMapFiles({ modRoot: root, gameRoot: NOGAME });
    const big = probs.find((p) => p.rule === "province_too_large");
    ok(!big || !big.provinces.includes(65), "a seam-spanning (both-edge) wide province is NOT flagged too-large", big);
  }
  // ── 32-bit bitdepth ──
  {
    const root = newMod({ "map/provinces.bmp": buildBmp(W, H, basePixels(), 32), "map/definition.csv": defRows([1]) });
    ok(rulesOf(md.validateMapFiles({ modRoot: root, gameRoot: NOGAME })).has("bmp_not_24bit"), "32-bit provinces.bmp flagged bmp_not_24bit");
  }
  // ── dimensions not multiples of 256 ──
  {
    const w = 200, h = 200, p = []; for (let y = 0; y < h; y++) { p[y] = []; for (let x = 0; x < w; x++) p[y][x] = [1, 0, 0]; }
    const root = newMod({ "map/provinces.bmp": buildBmp(w, h, p), "map/definition.csv": defRows([1]) });
    ok(rulesOf(md.validateMapFiles({ modRoot: root, gameRoot: NOGAME })).has("bmp_bad_dimensions"), "200×200 provinces.bmp flagged bmp_bad_dimensions");
  }
  // ── adjacencies.csv: BOM → detected, then auto-fixed (terminator is intentionally NOT checked) ──
  {
    const root = newMod({ "map/adjacencies.csv": "﻿From;To;Type\n2;3;sea;-1;-1;-1;-1;-1;;\n" });   // leading BOM
    const r1 = rulesOf(md.validateMapFiles({ modRoot: root, gameRoot: NOGAME }));
    ok(r1.has("adjacency_bom"), "BOM in adjacencies.csv flagged");
    const fx = md.fixAdjacenciesFile({ modRoot: root, gameRoot: NOGAME });
    ok(fx.fixed === 1 && fx.changes.includes("removed BOM"), "fixAdjacenciesFile removed BOM", fx);
    const raw = fs.readFileSync(path.join(root, "map/adjacencies.csv"));
    ok(!(raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF), "BOM is gone from the file");
    ok(raw.toString("utf8").startsWith("From;To;Type"), "the rest of the file is preserved after stripping the BOM");
    ok(!rulesOf(md.validateMapFiles({ modRoot: root, gameRoot: NOGAME })).has("adjacency_bom"), "re-validate after fix is clean");
  }
  // ── empty buildings.txt ──
  {
    const root = newMod({ "map/buildings.txt": "   \n" });
    ok(rulesOf(md.validateMapFiles({ modRoot: root, gameRoot: NOGAME })).has("buildings_empty"), "empty buildings.txt flagged");
  }
} catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
finally { for (const d of trash) try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
