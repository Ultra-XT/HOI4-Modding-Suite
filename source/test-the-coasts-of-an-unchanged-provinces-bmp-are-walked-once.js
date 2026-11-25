// The coasts of an unchanged provinces.bmp are walked once, and walked again when the bitmap or a province's type changes.
// #a-coast-walk-is-shared-until-its-inputs-change
//
// THE DEFECT. landProvincesTouchingSea — which land provinces touch sea on the bitmap — walks every pixel of provinces.bmp. One
// GET /api/map/validate asks it four times for the same map, each rule with a model of its own: coastal_province_has_no_sea
// (fixCoastalFlags' dry run), state_naval_building_without_coast, dated_naval_building_without_coast and, since batch 6, the unit
// check. Measured 2026-09-15 with every map-data.js function timed (scratchpad batch7/speed), a warm validate: 4 walks, 700 ms on
// Millennium Dawn, 642 on Road to 56, 790 on Old World Blues, 704 on Novum Vexillum, 625 on Rise of Nations — the fourth walk is
// most of what the unit check added to a warm validate.
//
// The answer depends on the bitmap's pixels and on each province's id, colour and land/sea type, and on nothing else. So it may be
// remembered — but only under exactly those inputs, and a change to any of them must be walked again.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastwalk-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastwalk-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const tmps = [HOME, APPDATA_DIR];
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

const W = 256, H = 256;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
function bmp24(fn) {
  const rs = (W * 3 + 3) & ~3, is = rs * H; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rs; for (let x = 0; x < W; x++) { const [r, g, bl] = COL(fn(x, y)); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// THE REFERENCE, computed from the fixture's own drawing and never through Nova: a land province touches sea when a pixel of it
// shares an edge with a pixel of a SEA province — left/right wrapping round the map, as the game's map does — and a lake never counts.
function reference(fn, typeOf) {
  const out = new Set();
  const note = (a, b) => { if (typeOf(a) === "land" && typeOf(b) === "sea") out.add(a); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = fn(x, y), l = fn((x - 1 + W) % W, y);
    if (a !== l) { note(a, l); note(l, a); }
    if (y > 0) { const u = fn(x, y - 1); if (a !== u) { note(a, u); note(u, a); } }
  }
  return [...out].sort((p, q) => p - q);
}
const grid = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;                   // 4x4, provinces 1-16
const repainted = (x, y) => { const p = grid(x, y); return p === 13 || p === 14 ? 9 : p; };  // 13 and 14 painted as 9
function definition(typeOf, coastalOf) {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, g, b] = COL(p), t = typeOf(p); rows.push(`${p};${r};${g};${b};${t};${coastalOf(p) ? "true" : "false"};${t === "land" ? "plains" : t === "lake" ? "lakes" : "ocean"};${t === "land" ? 1 : 0}`); }
  return rows.join("\n") + "\n";
}
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
const sorted = (s) => (s ? [...s].sort((p, q) => p - q) : s);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

try {
  const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastwalk-game-")); tmps.push(GAME);
  const seaRow = (p) => (p >= 13 ? "sea" : "land");
  const coast0 = new Set(reference(grid, seaRow));
  mk(GAME, "map/provinces.bmp", bmp24(grid));
  mk(GAME, "map/definition.csv", definition(seaRow, (p) => coast0.has(p)));
  const MOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastwalk-mod-")); tmps.push(MOD);
  mk(MOD, "descriptor.mod", 'name="Coast walk"\n');
  const BMP = mk(MOD, "map/provinces.bmp", bmp24(grid));
  const DEF = mk(MOD, "map/definition.csv", definition(seaRow, (p) => coast0.has(p)));
  const opts = { modRoot: MOD, gameRoot: GAME, dependencyRoots: [] };

  let bmpReads = 0;
  const origRead = fs.readFileSync;
  const target = path.resolve(BMP).toLowerCase();
  fs.readFileSync = function (p, ...rest) {
    if (typeof p === "string" && path.resolve(p).toLowerCase() === target) bmpReads++;
    return origRead.call(this, p, ...rest);
  };
  const ask = () => md.landProvincesTouchingSea({ ...opts, model: md.buildMapModel({ ...opts, cacheStableLayers: true }) });

  console.log("\n=== 1. the first question walks the bitmap ===");
  bmpReads = 0;
  const a1 = ask();
  rec("THE CONTROL: it reads provinces.bmp", bmpReads === 1, { bmpReads });
  rec("THE CONTROL: …and answers the coast the fixture draws", same(sorted(a1), reference(grid, seaRow)), { got: sorted(a1), want: reference(grid, seaRow) });

  console.log("\n=== 2. the same question again, from a model of its own ===");
  bmpReads = 0;
  const a2 = ask();
  rec("⭐⭐⭐ an unchanged bitmap and province table are not walked again", bmpReads === 0, { bmpReads });
  rec("⭐⭐ …and the answer is the same", same(sorted(a2), sorted(a1)), { a1: sorted(a1), a2: sorted(a2) });

  console.log("\n=== 3. each caller gets its own answer ===");
  a2.add(999); a2.delete(sorted(a1)[0]);
  const a3 = ask();
  rec("⭐⭐ changing one caller's set does not change the next caller's", same(sorted(a3), sorted(a1)), { a3: sorted(a3) });

  console.log("\n=== 4. a province's type changes in definition.csv, the bitmap does not ===");
  pause(30);
  const lake14 = (p) => (p === 14 ? "lake" : seaRow(p));
  fs.writeFileSync(DEF, definition(lake14, (p) => coast0.has(p)));
  const a4 = ask();
  rec("⭐⭐⭐ turning sea 14 into a lake moves the answer to what the fixture now draws", same(sorted(a4), reference(grid, lake14)) && !same(sorted(a4), sorted(a1)), { got: sorted(a4), want: reference(grid, lake14) });
  fs.writeFileSync(DEF, definition(seaRow, (p) => coast0.has(p)));
  const a4b = ask();
  rec("…and turning it back moves it back", same(sorted(a4b), sorted(a1)), { got: sorted(a4b) });

  console.log("\n=== 5. provinces.bmp rewritten in place, the same size ===");
  pause(30);
  fs.writeFileSync(BMP, bmp24(repainted));
  bmpReads = 0;
  const a5 = ask();
  rec("⭐⭐⭐ a repainted bitmap is walked again", bmpReads === 1, { bmpReads });
  rec("⭐⭐⭐ …and the answer is the repainted coast", same(sorted(a5), reference(repainted, seaRow)) && !same(sorted(a5), sorted(a1)), { got: sorted(a5), want: reference(repainted, seaRow) });

  console.log("\n=== 6. provinces.bmp replaced by a rename, as a Save writes it ===");
  pause(30);
  const tmp = BMP + ".nova-tmp";
  fs.writeFileSync(tmp, bmp24(grid));
  fs.renameSync(tmp, BMP);
  bmpReads = 0;
  const a6 = ask();
  rec("⭐⭐ a bitmap replaced by a rename is walked again", bmpReads === 1, { bmpReads });
  rec("⭐⭐ …and the answer is the restored coast", same(sorted(a6), sorted(a1)), { got: sorted(a6) });

  console.log("\n=== 7. THROUGH THE VALIDATOR: two validates in one process, the bitmap repainted between them ===");
  fs.readFileSync = origRead;
  const rule = (probs) => (probs || []).find((p) => p.rule === "coastal_province_has_no_sea");
  const v1 = md.validateMapBitmap(opts);
  rec("THE CONTROL: the mod's coastal flags agree with its bitmap, so nothing is reported", !rule(v1), rule(v1));
  pause(30);
  fs.writeFileSync(BMP, bmp24(repainted));
  const v2 = md.validateMapBitmap(opts);
  const want = reference(grid, seaRow).filter((p) => !reference(repainted, seaRow).includes(p));
  const got = rule(v2);
  rec("⭐⭐⭐ after the repaint the second validate reports the land that lost its sea", !!got && same([...(got.lost || [])].sort((p, q) => p - q), want) && want.length > 0, { lost: got && got.lost, want });
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 8).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== the coasts of an unchanged provinces.bmp are walked once: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
process.exit(fails.length ? 1 : 0);
