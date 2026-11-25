// A naval region whose sea continues across the map's horizontal wrap seam is one region, not two — so the
// fractioned-region check does not report it and Auto-fix does not re-home half of it. #the-wrap-seam-joins-a-region
//
// THE DEFECT. fixFractionedRegions builds province adjacency from provinces.bmp by linking each pixel to the one on
// its left and the one above it, for x > 0. Column 0 was never linked to column W-1, so every naval region that
// straddles the date line was split in two at the seam. The same file already treats the map as a cylinder
// everywhere else: the coastal-column derivation reads `(x - 1 + W) % W`, the X-crossing scan tests the seam block
// (test-an-x-crossing-on-the-wrap-seam-is-found-and-fixed.js), and province_too_large exempts a province on it.
// fixFractionedRegions is both the detector (its dryRun feeds fractioned_naval_region) and the fixer Auto-fix runs.
//
// THE EVIDENCE (measured 2026-09-11, read-only dryRun, which returns before any write):
//   * On the base commit it flagged 76 provinces on vanilla, 76 on Millennium Dawn, 75 on Road to 56, Novum
//     Vexillum and Rise of Nations, 27 on Old World Blues — on vanilla all in the seven Pacific regions 88 Bering
//     Sea, 95 Western Pacific 2, 96 North West Pacific, 97 South West Pacific, 112 Far South Pacific, 178 West
//     Polynesia and 180 Micronesian Gap. All six maps launch.
//   * hoi4.exe logs "Naval strategic region … is fractioned!" with the separated provinces, and the owner's
//     Millennium Dawn error.log named 2 provinces where Nova named 76.
//   * Adding the seam link takes vanilla, MD, R56, NV and RoN to 0.
//   * THE DAMAGE: "Auto-fix all" on a brand-new vanilla add-on whose only problem was one empty state copied 12 of
//     vanilla's strategic-region files into the add-on and moved 82 provinces (76 sea, 6 land) between them.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regionseam-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regionseam-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const tmps = [HOME, APPDATA_DIR];
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// A 24-bit BMP. grid[y][x] is a province id; y = 0 is the TOP row.
function bmp(grid, colour) {
  const H = grid.length, W = grid[0].length;
  const rs = Math.floor((24 * W + 31) / 32) * 4, buf = Buffer.alloc(54 + rs * H);
  buf.write("BM", 0); buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = colour[grid[y][x]], o = 54 + (H - 1 - y) * rs + x * 3;
    buf[o] = b; buf[o + 1] = g; buf[o + 2] = r;
  }
  return buf;
}
const COLOUR = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200], 4: [0, 0, 120] };
const TYPE = { 1: "sea", 2: "land", 3: "sea", 4: "sea" };
// Provinces: 1 and 3 are the two halves of naval region 10; 2 is land (region 20); 4 is a second naval region (30)
// along the bottom, so a fragment of region 10 has somewhere to be re-homed — without one the fixer emits no move.
function writeMod(root, grid) {
  mk(path.join(root, "descriptor.mod"), 'name="Seam regions"\nreplace_path="map"\n');
  fs.mkdirSync(path.join(root, "map"), { recursive: true });
  fs.writeFileSync(path.join(root, "map", "provinces.bmp"), bmp(grid, COLOUR));
  mk(path.join(root, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(COLOUR).map((id) => {
    const [r, g, b] = COLOUR[id];
    return TYPE[id] === "sea" ? `${id};${r};${g};${b};sea;true;ocean;0` : `${id};${r};${g};${b};land;true;plains;1`;
  })).join("\r\n") + "\r\n");
  const rg = (id, provs) => `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs} }\n\tweather = {}\n}\n`;
  mk(path.join(root, "map", "strategicregions", "10-Seam.txt"), rg(10, "1 3"));
  mk(path.join(root, "map", "strategicregions", "20-Land.txt"), rg(20, "2"));
  mk(path.join(root, "map", "strategicregions", "30-South.txt"), rg(30, "4"));
}
const hashDir = (d) => {
  const h = crypto.createHash("sha1");
  for (const f of fs.readdirSync(d).sort()) h.update(f).update(fs.readFileSync(path.join(d, f)));
  return h.digest("hex");
};
const fracOf = (probs) => probs.filter((p) => p.rule === "fractioned_naval_region");

try {
  // Region 10's sea is province 1 in column 0 and province 3 in column 7: on a flat sheet they are six land
  // columns apart, but the map is a cylinder and they are pixel neighbours across the seam. No 2x2 block holds
  // four provinces, so the fixture carries no X-crossing.
  const SEAM = [
    [1, 2, 2, 2, 2, 2, 2, 3],
    [1, 2, 2, 2, 2, 2, 2, 3],
    [4, 4, 4, 4, 4, 4, 4, 4],
  ];
  // THE CONTROL: the same two sea provinces, but province 3 moved in by one column so land meets the seam instead.
  const APART = [
    [1, 2, 2, 2, 2, 2, 3, 2],
    [1, 2, 2, 2, 2, 2, 3, 2],
    [4, 4, 4, 4, 4, 4, 4, 4],
  ];

  console.log("1. ⛔ A naval region that meets itself across the wrap seam");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regionseam-mod-")); tmps.push(mod);
    writeMod(mod, SEAM);
    const noCrossing = md.findMapXCrossings({ modRoot: mod }).length === 0;
    rec("the fixture has no X-crossing, so nothing else about it is broken", noCrossing);
    const dry = md.fixFractionedRegions({ modRoot: mod, dryRun: true });
    rec("the detector ran", !!dry && !dry.error, dry && dry.error);
    rec("⭐⭐⭐ the detector finds no fragment — column 0 and column W-1 are neighbours", !(dry.provinces || []).length, dry);
    const probs = md.validateMapBitmap({ modRoot: mod, dependencyRoots: [] }) || [];
    rec("⭐⭐⭐ …so fractioned_naval_region is not reported", fracOf(probs).length === 0, fracOf(probs).map((p) => p.message));

    const dir = path.join(mod, "map", "strategicregions");
    const before = hashDir(dir);
    const r = md.fixFractionedRegions({ modRoot: mod });
    rec("⭐⭐⭐ the fixer moves nothing", !!r && !r.error && r.moved === 0, r);
    rec("⭐⭐ …and the region files are byte-identical", hashDir(dir) === before);
    const m = md.buildMapModel({ modRoot: mod, cacheStableLayers: true });
    rec("…both halves are still in region 10", m.provinceToRegion[1] === 10 && m.provinceToRegion[3] === 10, { 1: m.provinceToRegion[1], 3: m.provinceToRegion[3] });
  }

  console.log("\n2. The control: the same region really cut in two is still found and still repaired");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-regionseam-apart-")); tmps.push(mod);
    writeMod(mod, APART);
    rec("the control fixture has no X-crossing either", md.findMapXCrossings({ modRoot: mod }).length === 0);
    const dry = md.fixFractionedRegions({ modRoot: mod, dryRun: true });
    rec("⭐⭐ the detector finds the fragment", (dry.provinces || []).length === 1, dry);
    const probs = md.validateMapBitmap({ modRoot: mod, dependencyRoots: [] }) || [];
    rec("⭐⭐ …and the validator reports it", fracOf(probs).length === 1, probs.map((p) => p.rule));
    const r = md.fixFractionedRegions({ modRoot: mod });
    rec("⭐ the fixer re-homes it", !!r && r.moved === 1, r);
    const m = md.buildMapModel({ modRoot: mod, cacheStableLayers: true });
    rec("…into the naval region beside it", [m.provinceToRegion[1], m.provinceToRegion[3]].filter((x) => x === 30).length === 1, { 1: m.provinceToRegion[1], 3: m.provinceToRegion[3] });
  }

  console.log(`\n=== a naval region that meets itself across the wrap seam is not fractioned: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
