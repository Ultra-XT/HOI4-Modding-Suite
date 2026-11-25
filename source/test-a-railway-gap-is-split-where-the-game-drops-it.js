// ⛔ #a-railway-gap-is-split-where-the-game-drops-it (B4-7, B1-32, B8-3) — Auto-fix repairs railway_link_not_neighbours by splitting the
// railway at each link the game drops, keeping every piece of 2 or more provinces.
//
// hoi4.exe's SetRailway stores a link only between neighbours (a pixel border or any adjacencies.csv row), so a link between two provinces
// that do not touch carries nothing in the game. Removing the Japan–Kyushu adjacency row under a railway, a paint stroke over the last
// border of two rail-linked provinces, or a railway queued before such a stroke left that warning, and no Auto-fix cleared it. The split
// writes down what the game already does — the one correct answer — and only for the links the rule calls the mod's: a gap the map below
// ships is never rewritten (B4-3). Malformed rows, comments and every other row keep their bytes.
//
// Fixture: a 12×4 provinces.bmp, two columns a province: 1 2 3 4 5 6 in a row (6 touches 1 across the wrap seam).
// Run: node test-a-railway-gap-is-split-where-the-game-drops-it.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-railsplit-home-"));
process.env.APPDATA = SANDBOX; process.env.XDG_CONFIG_HOME = SANDBOX; process.env.NOVA_APP_DATA_DIR = SANDBOX; process.env.NOVA_HOME_DIR = SANDBOX;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const tmps = [SANDBOX];

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
const COL = { 1: [10, 0, 0], 2: [20, 0, 0], 3: [30, 0, 0], 4: [40, 0, 0], 5: [50, 0, 0], 6: [60, 0, 0] };
const DEF = "0;0;0;0;land;false;unknown;0;\n" + [1, 2, 3, 4, 5, 6].map((i) => `${i};${COL[i].join(";")};land;false;plains;1;`).join("\n") + "\n";
const HDR = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const BMP = bmp24(12, 4, (x) => COL[1 + Math.floor(x / 2)]);
const mkRoot = (label, files) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `nova-railsplit-${label}-`)); tmps.push(root);
  for (const [rel, body] of Object.entries(files)) { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); }
  return root;
};
const rails = (root) => { const f = path.join(root, "map", "railways.txt"); return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null; };
const gapRule = (opts) => md.validateMapFiles(opts).find((p) => p.rule === "railway_link_not_neighbours") || null;

try {
  console.log("1. ⭐⭐⭐ A map the mod owns: each gap is split, every piece of 2 or more kept, nothing else touched");
  {
    const RAIL = [
      "# the lines of the test",
      "1 4 1 2 4 5",                      // 2 → 4 do not touch: [1 2] and [4 5]
      "2 2 3 5",                          // 3 → 5 do not touch: nothing of 2 is left, so it goes
      "1 2 1 3",                          // 1 → 3 joined by an adjacencies.csv row: a link, kept
      "3 3 4 5 6 # east",                 // neighbours all along: kept byte for byte
      "2 3 1 2",                          // malformed (a count of 3, two ids): railway_malformed_row's, left as it is
      "",
    ].join("\r\n");
    const mod = mkRoot("own", { "descriptor.mod": 'name="Own"\nreplace_path="map"\n', "map/provinces.bmp": BMP, "map/definition.csv": DEF,
      "map/adjacencies.csv": [HDR, "1;3;sea;2;-1;-1;-1;-1;;ferry", "-1;-1;;-1;-1;-1;-1;-1;;", ""].join("\n"), "map/railways.txt": RAIL });
    const opts = { modRoot: mod, gameRoot: path.join(SANDBOX, "no-game"), dependencyRoots: [] };
    const before = gapRule(opts);
    rec("CONTROL: the rule reports the two gaps before the click", before && JSON.stringify(before.items.map((i) => `${i.from}-${i.to}`)) === '["2-4","3-5"]', before && before.items);
    rec("⭐⭐ …and its message names Auto-fix, so the popup offers it", before && /Auto-fix splits the railway/.test(before.message) && labels.autoFixOffered([before]), before && before.message);
    const r = md.fixRailwayLinksNotNeighbours(opts);
    rec("⭐⭐⭐ the repair cuts 2 links", r.fixed === 2, r);
    rec("…and names each: line, level, the link, what is left", JSON.stringify(r.splits.map((s) => [s.line, s.level, s.from, s.to, s.pieces, s.removed])) === JSON.stringify([[2, 1, 2, 4, [2, 2], false], [3, 2, 3, 5, [], true]]), r.splits);
    const want = [
      "# the lines of the test",
      "1 2 1 2",
      "1 2 4 5",
      "1 2 1 3",
      "3 3 4 5 6 # east",
      "2 3 1 2",
      "",
    ].join("\r\n");
    rec("⭐⭐⭐ disk: the pieces in place, every other row (comments too) byte for byte, CRLF kept", rails(mod) === want, rails(mod));
    rec("⭐⭐ the rule is clear after the click", !gapRule(opts), gapRule(opts));
    const r2 = md.fixRailwayLinksNotNeighbours(opts);
    rec("a second click cuts nothing and writes nothing", r2.fixed === 0 && rails(mod) === want, r2);
  }

  console.log("\n2. ⭐⭐⭐ An add-on: the gap ITS edit made is split; the map below's own gap is never rewritten");
  {
    const game = mkRoot("game", { "map/provinces.bmp": BMP, "map/definition.csv": DEF,
      "map/adjacencies.csv": [HDR, "3;5;sea;4;-1;-1;-1;-1;;the strait", "-1;-1;;-1;-1;-1;-1;-1;;", ""].join("\n"),
      "map/railways.txt": "1 2 4 6\n1 2 3 5\n1 3 1 2 3\n" });          // 4 → 6 is the base's own gap; 3 → 5 crosses the strait row
    // the add-on removed the strait row (🔗 Remove): its own adjacencies.csv has none
    const addon = mkRoot("addon", { "descriptor.mod": 'name="Addon"\n', "map/adjacencies.csv": [HDR, "-1;-1;;-1;-1;-1;-1;-1;;", ""].join("\n") });
    const opts = { modRoot: addon, gameRoot: game, dependencyRoots: [] };
    const before = gapRule(opts);
    rec("CONTROL: the rule reports the add-on's gap 3 → 5 and not the base's 4 → 6", before && JSON.stringify(before.items.map((i) => `${i.from}-${i.to}`)) === '["3-5"]', before && before.items);
    const r = md.fixRailwayLinksNotNeighbours(opts);
    rec("⭐⭐⭐ the repair cuts only 3 → 5", r.fixed === 1 && r.splits.length === 1 && r.splits[0].from === 3 && r.splits[0].to === 5, r);
    rec("⭐⭐⭐ …writing railways.txt into the add-on with the base's gap row as it was", rails(addon) === "1 2 4 6\n1 3 1 2 3\n", rails(addon));
    rec("…and says it copied the file in", JSON.stringify(r.materialised) === '["map/railways.txt"]', r.materialised);
    rec("the rule is clear after the click", !gapRule(opts), gapRule(opts));
  }

  console.log("\n3. An add-on whose only gap is the base's: the repair writes nothing");
  {
    const game = mkRoot("game2", { "map/provinces.bmp": BMP, "map/definition.csv": DEF, "map/railways.txt": "1 2 4 6\n" });
    const addon = mkRoot("addon2", { "descriptor.mod": 'name="Addon2"\n', "map/adjacencies.csv": [HDR, ""].join("\n") });
    const r = md.fixRailwayLinksNotNeighbours({ modRoot: addon, gameRoot: game, dependencyRoots: [] });
    rec("⭐⭐ nothing cut, and no railways.txt copied into the add-on", r.fixed === 0 && rails(addon) === null, { r, rails: rails(addon) });
  }

  console.log("\n4. The click runs it, and the Auto-fix summary names each split (public/map.js, comments masked)");
  {
    const src = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const at = src.indexOf("function autoFixMap(");
    rec("autoFixMap calls fixRailwayLinksNotNeighbours into fixes.railGaps", at > 0 && /fixes\.railGaps = fixRailwayLinksNotNeighbours\(/.test(src.slice(at, src.indexOf("\nfunction ", at + 10))));
    const page = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
    rec("the summary reads fixes.railGaps and names each split's link and line", /fr\.fixes\.railGaps/.test(page) && /\$\{s\.from\} → \$\{s\.to\} \(line \$\{s\.line\}/.test(page));
  }

  console.log(`\n=== a railway gap is split where the game drops it: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
