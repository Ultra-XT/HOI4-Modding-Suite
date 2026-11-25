// An X-crossing on the map's horizontal wrap seam is found, and Auto-fix repairs it without writing past the
// end of the row. #an-x-crossing-on-the-wrap-seam
//
// THE DEFECT. scanXCrossings looped `for (let x = 0; x < W - 1; x++)`, so the 2x2 block made of the right-most
// column and the left-most column — the pixels either side of the wrap — was never tested. Nova already treats
// the map as a cylinder elsewhere: the coastal-column derivation and the strait adjacency graph both read
// `(x - 1 + W) % W`, and province_too_large carries a seam exemption. Only the FATAL X-crossing check treated the
// map as a flat sheet. fixMapXCrossings inherited the bound, and its repair writes pixel `x + 1` — so a scan
// that did see a seam block would have had the fixer write at x = W, past the end of the row: into the row
// padding and the first pixel of the next row.
//
// THE EVIDENCE:
//   * HOI4 wiki, Map modding → Provinces, on "Map invalid X crossing. Please fix pixels at coords": "Keep in
//     mind that the map loops horizontally, so this X crossing may be right at the edge of the province bitmap."
//     hoi4.exe carries that exact message text.
//   * Re-measured 2026-09-11, vanilla and five workshop maps: 0 four-province corners on the seam, and 0 rows
//     where column 0 and column W-1 are the same province — the seam is a live boundary on every map, and the
//     wider scan fires 0 times on all six.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seam-home-"));
process.env.NOVA_HOME_DIR = HOME;
// The fixer writes through safeModWrite, which files a backup. Keep that inside this test's own temp dir, the
// way run-tests.js gives every run a private app-data directory.
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seam-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const tmps = [HOME, APPDATA_DIR];

// A 24-bit BMP. pixels[y][x] = [r,g,b], y = 0 is the TOP row. W = 5 makes each row 15 pixel bytes + 1 padding
// byte, so a write at x = W lands in the padding and the next row — which the byte comparison below would see.
function writeBmp(file, pixels) {
  const H = pixels.length, W = pixels[0].length;
  const rs = Math.floor((24 * W + 31) / 32) * 4, size = 54 + rs * H, buf = Buffer.alloc(size);
  buf.write("BM", 0); buf.writeUInt32LE(size, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, b] = pixels[y][x]; const o = 54 + (H - 1 - y) * rs + x * 3; buf[o] = b; buf[o + 1] = g; buf[o + 2] = r; }
  fs.writeFileSync(file, buf);
  return { W, H, rs };
}
const A = [255, 0, 0], B = [0, 255, 0], C = [0, 0, 255], D = [255, 255, 0], X = [128, 128, 128];
function mkMod(tag, grid) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seam-" + tag + "-")); tmps.push(root);
  fs.mkdirSync(path.join(root, "map"), { recursive: true });
  fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="Seam"\n');
  const dims = writeBmp(path.join(root, "map", "provinces.bmp"), grid);
  return { root, ...dims };
}

try {
  const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seam-game-")); tmps.push(game);

  // Across the seam at row 1: top-left A (x=4,y=0), top-right B (x=0,y=0), bottom-left C (x=4,y=1),
  // bottom-right D (x=0,y=1) — four different provinces meeting at the wrap. Every interior 2x2 block repeats X.
  const seamGrid = [
    [B, X, X, X, A],
    [D, X, X, X, C],
    [D, X, X, X, C],
    [D, X, X, X, C],
  ];

  console.log("1. ⛔ Four provinces meeting across the wrap seam");
  {
    const m = mkMod("find", seamGrid);
    const found = md.findMapXCrossings({ modRoot: m.root, gameRoot: game });
    rec("⭐⭐⭐ the seam crossing is found", found.length === 1, found);
    rec("…at the right-most column, the bottom-left pixel of the wrapped block", found.length === 1 && found[0].x === m.W - 1 && found[0].y === 1, found);
    const probs = md.validateMapBitmap({ modRoot: m.root, gameRoot: game, dependencyRoots: [] }) || [];
    const xc = probs.find((p) => p.rule === "map_x_crossing");
    rec("⭐⭐ …and the validator reports it", !!xc && xc.severity === "error", probs.map((p) => p.rule));
  }

  console.log("\n2. The control: the same colours on both edges, but no four-way corner");
  {
    const flat = [
      [B, X, X, X, A],
      [B, X, X, X, A],
      [D, X, X, X, A],
      [D, X, X, X, A],
    ];
    const m = mkMod("flat", flat);
    rec("no crossing is reported", md.findMapXCrossings({ modRoot: m.root, gameRoot: game }).length === 0);
  }

  console.log("\n3. ⭐ Auto-fix repairs it, touching exactly one pixel and nothing past the row");
  {
    const m = mkMod("fix", seamGrid);
    const file = path.join(m.root, "map", "provinces.bmp");
    const before = fs.readFileSync(file);
    const fx = md.fixMapXCrossings({ modRoot: m.root, gameRoot: game });
    rec("⭐⭐⭐ the fixer repairs the seam crossing", fx.fixed === 1, fx);
    rec("…reporting the pixel it changed, wrapped to column 0", Array.isArray(fx.coords) && fx.coords.length === 1 && fx.coords[0].x === 0 && fx.coords[0].y === 1, fx.coords);
    rec("no crossing remains", md.findMapXCrossings({ modRoot: m.root, gameRoot: game }).length === 0);
    const after = fs.readFileSync(file);
    rec("the file is the same size", after.length === before.length, [before.length, after.length]);
    const changed = [];
    for (let i = 0; i < Math.min(before.length, after.length); i++) if (before[i] !== after[i]) changed.push(i);
    // Pixel (0, 1) — image row 1 is buffer row H-1-1.
    const o = 54 + (m.H - 1 - 1) * m.rs + 0 * 3;
    rec("⭐⭐ exactly the three bytes of pixel (0,1) changed — no padding byte, no neighbouring row",
      changed.length === 3 && changed[0] === o && changed[1] === o + 1 && changed[2] === o + 2, { changed, expected: [o, o + 1, o + 2] });
    rec("…and it now carries the bottom-left province's colour", after[o] === C[2] && after[o + 1] === C[1] && after[o + 2] === C[0], [after[o + 2], after[o + 1], after[o]]);
  }

  console.log("\n4. The interior contract (test-map-x-crossing.js) still holds");
  {
    // One interior four-way corner, with a single border province down BOTH edges so nothing meets across
    // the wrap. (Without the border, a 4-wide A A B B / C C D D grid really does have a second crossing on the
    // seam — column 3 meets column 0 — which is exactly what this change teaches the scan to see.)
    const E = [40, 40, 40];
    const grid = [[E, A, A, B, B, E], [E, A, A, B, B, E], [E, C, C, D, D, E], [E, C, C, D, D, E]];
    const m = mkMod("interior", grid);
    const found = md.findMapXCrossings({ modRoot: m.root, gameRoot: game });
    rec("an interior crossing is still found exactly once", found.length === 1 && found[0].x === 2 && found[0].y === 2, found);
    const wrapped = mkMod("wrapped", [[A, A, B, B], [A, A, B, B], [C, C, D, D], [C, C, D, D]]);
    const both = md.findMapXCrossings({ modRoot: wrapped.root, gameRoot: game });
    rec("…and the borderless 4-wide grid shows its seam corner as well",
      both.length === 2 && both.some((c) => c.x === 1 && c.y === 2) && both.some((c) => c.x === 3 && c.y === 2), both);
  }

  console.log(`\n=== an X-crossing on the wrap seam is found and fixed: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
