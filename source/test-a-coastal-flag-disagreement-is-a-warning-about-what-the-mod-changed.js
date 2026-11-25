// definition.csv's coastal column disagreeing with the bitmap is a WARNING, in both directions, about rows the
// mod itself changed. #a-province-says-coastal-with-no-sea #the-coastal-column-is-derived
//
// THE DEFECTS, all in coastal_province_has_no_sea:
//
//  1. IT CLAIMED A CRASH THE CRASH DUMPS DO NOT SUPPORT. It was an error whose message said the owner's map "went on
//     to crash with a divide-by-zero". HOI4's own text is "Bitmap and province definition disagree on whether or not
//     province … is coastal. Bitmap adjacency result will be prefered." — it logs, then uses the bitmap. The owner's
//     2026-09-09 crash folders: three EXCEPTION_INT_DIVIDE_BY_ZERO crashes (161141, 174556, 190730) share one stack
//     (+16987078, +16985574, +9674359, +9657036, +33692565); three access violations (153814, 173729, 200315) share
//     the same frames 2-5 and fault 117 bytes further on — the flag-atlas fault the minidumps resolved to, caused by
//     a country_tags filename. 200315 carries ZERO coastal lines and dies in that same routine. So the coastal lines
//     sat beside the crash, they did not make it. Novum Vexillum shipped three and launched (until its 2026-10-02
//     update corrected them — section 6 builds its full-size case out of the base game since).
//
//  2. IT HANDED A DEPENDENCY'S ROWS TO AN ADD-ON. The rule had no ownership gate at all: an empty add-on over Novum
//     Vexillum was told about NV's. A gate on "ships definition.csv" is not enough — one Terrain click copies the
//     whole file in — so it subtracts what the layer below already has wrong. And it deliberately does NOT also ask
//     "did the mod change the file", the way fractioned_naval_region does: that is asked of the base GAME, and an
//     add-on shipping vanilla's own definition.csv over a dependency with a different bitmap would be waved through
//     while every row is wrong for the map it loads over (section 7).
//
//  3. IT SAW ONE DIRECTION. The engine logs "disagree" both ways, and fixCoastalFlags already computes both — `lost`
//     (says coastal, touches no sea) and `gained` (touches sea, says not coastal) — and Auto-fix repairs both. Only
//     `lost` was reported. Sea only: lakes never make a land province coastal (counting them would call 361-722
//     land provinces per shipping map wrong). Sea and lake ROWS are not judged — nothing shows the engine checks them.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastwarn-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { flipCoastalColumn } = require("./testlib-flipped-coastal-column.js");
const tmps = [HOME];

// 1 | 2 | 3 (sea) | 4 — provinces 2 and 4 border the sea; province 1 does not.
const W = 16, H = 4;
const COL = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30], 4: [40, 40, 40] };
const provAtX = (x) => Math.min(4, Math.floor(x / 4) + 1);
function bmp(layout = provAtX) {
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H;
  const b = Buffer.alloc(54 + imageSize);
  b.write("BM", 0, "ascii");
  b.writeUInt32LE(54 + imageSize, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28); b.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[layout(x)]; b[o++] = c[2]; b[o++] = c[1]; b[o++] = c[0]; } }
  return b;
}
const row = (id, type, coastal) => `${id};${COL[id].join(";")};${type};${coastal};${type === "sea" ? "ocean" : "plains"};${type === "sea" ? 0 : 1}`;
// The honest column is 1:false 2:true 4:true. `over` flips entries.
const DEF = (over = {}) => ["0;0;0;0;land;false;unknown;0",
  row(1, "land", over[1] || "false"), row(2, "land", over[2] || "true"), row(3, "sea", "false"), row(4, "land", over[4] || "true")].join("\n") + "\n";

function dir(tag, files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coastwarn-" + tag + "-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}

const GAME = dir("game", { "map/provinces.bmp": bmp(), "map/definition.csv": DEF() });
// A dependency that ships a definition.csv whose column is wrong both ways, over the base game's bitmap —
// the Novum Vexillum shape.
const DEP = dir("dep", { "descriptor.mod": 'name="Dep"\n', "map/definition.csv": DEF({ 1: "true", 2: "false" }) });
const coastal = (modRoot, deps) => md.validateMapBitmap({ modRoot, gameRoot: GAME, dependencyRoots: deps })
  .filter((p) => p && p.rule === "coastal_province_has_no_sea");

try {
  console.log("\n=== THE CONTROL: the fixture's base game is honest, and the fixer sees both directions in the dependency ===");
  {
    const g = md.fixCoastalFlags({ modRoot: DEP, gameRoot: GAME, dependencyRoots: [], dryRun: true });
    rec("fixCoastalFlags reads the dependency: province 1 lost its sea claim is a lie", !!g && (g.lost || []).join() === "1", g);
    rec("…and province 2 touches sea but says it does not", !!g && (g.gained || []).join() === "2", g);
    const honest = dir("honest", { "descriptor.mod": 'name="Honest"\n', "map/definition.csv": DEF({ 4: "true" }) + "" });
    rec("a mod shipping the base game's own column is told nothing", coastal(honest, []).length === 0, coastal(honest, []));
  }

  console.log("\n=== 1. the mod that wrote the column is told — both ways, as a warning, without the crash ===");
  {
    const probs = coastal(DEP, []);
    const p = probs[0];
    rec("exactly one problem", probs.length === 1, probs.map((x) => x.message));
    rec("⭐⭐⭐ a WARNING — HOI4 logs it and uses the bitmap", !!p && p.severity === "warning", p && p.severity);
    rec("…not in the curated fatal set", labels.isFatalRule("coastal_province_has_no_sea") === false);
    rec("⭐⭐ it reports the `lost` direction (1: says coastal, touches no sea)", !!p && (p.lost || []).join() === "1", p && p.lost);
    rec("⭐⭐⭐ …AND the `gained` direction (2: touches sea, says not coastal)", !!p && (p.gained || []).join() === "2", p && p.gained);
    rec("…both in `provinces`, which the panel zooms to", !!p && (p.provinces || []).includes(1) && (p.provinces || []).includes(2), p && p.provinces);
    rec("⭐⭐⭐ the message no longer claims a divide-by-zero or any crash", !!p && !/divide/i.test(p.message) && !/crash/i.test(p.message), p && p.message);
    rec("…quotes what the engine does instead", !!p && /Bitmap adjacency result will be prefered/.test(p.message), p && p.message);
    rec("…and still says the column is derived, which is the fix", !!p && /derived/i.test(p.message), p && p.message);
  }

  console.log("\n=== 2. an add-on that ships no map file is told nothing about its dependency's column ===");
  {
    const a = dir("addon-empty", { "descriptor.mod": 'name="Addon"\n' });
    const probs = coastal(a, [DEP]);
    rec("⭐⭐⭐ an empty add-on over the dependency: nothing", probs.length === 0, probs.map((x) => x.message));
  }

  console.log("\n=== 3. …nor one holding the dependency's definition.csv byte-for-byte (what one Terrain click leaves) ===");
  {
    const a = dir("addon-copy", { "descriptor.mod": 'name="AddonCopy"\n', "map/definition.csv": fs.readFileSync(path.join(DEP, "map", "definition.csv")) });
    rec("THE CONTROL: the copy differs from the base game's, so a changed-file gate alone would let it through",
      !fs.readFileSync(path.join(a, "map", "definition.csv")).equals(fs.readFileSync(path.join(GAME, "map", "definition.csv"))));
    const probs = coastal(a, [DEP]);
    rec("⭐⭐⭐ a verbatim copy of the dependency's column: nothing", probs.length === 0, probs.map((x) => x.message));
  }

  console.log("\n=== 4. …but a row the add-on itself changed IS reported, and only that row ===");
  {
    const a = dir("addon-edit", { "descriptor.mod": 'name="AddonEdit"\n', "map/definition.csv": DEF({ 1: "true", 2: "false", 4: "false" }) });
    const probs = coastal(a, [DEP]);
    const p = probs[0];
    rec("⭐⭐⭐ the add-on's own flip (4: touches sea, says not coastal) is reported", probs.length === 1 && (p.gained || []).join() === "4", probs.map((x) => ({ lost: x.lost, gained: x.gained, provinces: x.provinces })));
    rec("⭐⭐ …without the dependency's two", !!p && !(p.provinces || []).includes(1) && !(p.provinces || []).includes(2), p && p.provinces);
  }

  console.log("\n=== 5. a mod straight on the base game is told about either direction ===");
  {
    const gainedOnly = dir("own-gained", { "descriptor.mod": 'name="OwnGained"\n', "map/definition.csv": DEF({ 4: "false" }) });
    const g = coastal(gainedOnly, []);
    rec("⭐⭐ a province that touches sea but says not coastal is reported on its own", g.length === 1 && (g[0].gained || []).join() === "4", g.map((x) => x.message));
    const lostOnly = dir("own-lost", { "descriptor.mod": 'name="OwnLost"\n', "map/definition.csv": DEF({ 1: "true" }) });
    const l = coastal(lostOnly, []);
    rec("…and so is one that says coastal with no sea", l.length === 1 && (l[0].lost || []).join() === "1", l.map((x) => x.message));
  }

  console.log("\n=== 7. an add-on shipping the base game's OWN column over a dependency with a different map is told ===");
  {
    // Why the rule asks the layer below and has no "did the mod change the file" gate: that question is asked of
    // the base GAME, and this add-on's definition.csv is byte-identical to the base game's — yet wrong for the map
    // it actually loads over. Dep2 moves the sea: 1 | 3 (sea) | 2 | 4, so 1 and 2 are coastal and 4 is not.
    const moved = (x) => [1, 3, 2, 4][Math.min(3, Math.floor(x / 4))];
    const DEP2 = dir("dep2", { "descriptor.mod": 'name="Dep2"\n', "map/provinces.bmp": bmp(moved), "map/definition.csv": DEF({ 1: "true", 2: "true", 4: "false" }) });
    rec("THE CONTROL: the dependency's own column is honest for its own bitmap", coastal(DEP2, []).length === 0, coastal(DEP2, []).map((x) => x.message));
    const a = dir("addon-vanilla-col", { "descriptor.mod": 'name="AddonVanillaColumn"\n', "map/definition.csv": fs.readFileSync(path.join(GAME, "map", "definition.csv")) });
    rec("THE CONTROL: the add-on's definition.csv is byte-identical to the base game's",
      fs.readFileSync(path.join(a, "map", "definition.csv")).equals(fs.readFileSync(path.join(GAME, "map", "definition.csv"))));
    const probs = coastal(a, [DEP2]);
    const p = probs[0];
    rec("⭐⭐⭐ …and it is still told: 4 says coastal with no sea, 1 touches sea and says not",
      probs.length === 1 && (p.lost || []).join() === "4" && (p.gained || []).join() === "1",
      probs.map((x) => ({ lost: x.lost, gained: x.gained })));
  }

  console.log("\n=== 6. the same at full size: the base game's definition.csv with three rows flipped, as a dependency (the game is only read) ===");
  {
    // ⚠️ THIS WAS THE REAL NOVUM VEXILLUM until 2026-10-08, and its control asked NV to still ship its three rows. NV's
    // 2026-10-02 update corrected exactly those three (7972 and 15485 now say not coastal, 14650 says coastal), so the
    // control went red while Nova was right. Measured that day, no installed map ships a disagreement of its own — vanilla,
    // MD, MDC, OWB, NV, RoN, R56, Hearts of Minecraft, TEST 31, TEST 32: 0 each — so the full-size case is BUILT, in NV's
    // shape (two rows that say coastal with no sea, one that touches sea and says not), out of the base game's own
    // column, with the rows picked from that file rather than typed (testlib-flipped-coastal-column.js).
    // Nova's rule: a test that needs the installed game FAILS when it is missing.
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    if (!fs.existsSync(path.join(VAN, "map", "definition.csv")) || !fs.existsSync(path.join(VAN, "map", "provinces.bmp"))) {
      rec("the base game is installed — this section reads its map, and a missing game is a failure, not a pass", false, VAN);
    } else {
      const coastalOverGame = (modRoot, deps) => md.validateMapBitmap({ modRoot, gameRoot: VAN, dependencyRoots: deps })
        .filter((p) => p && p.rule === "coastal_province_has_no_sea");
      const flipped = flipCoastalColumn(fs.readFileSync(path.join(VAN, "map", "definition.csv"), "utf8"), { lost: 2, gained: 1 });
      const ids = [...flipped.lost, ...flipped.gained], n = ids.length;
      const REAL = dir("dep-real", { "descriptor.mod": 'name="Full-size dependency"\n', "map/definition.csv": flipped.text });
      const self = coastalOverGame(REAL, []);
      rec(`THE CONTROL: the dependency itself is told, at full size — one warning, exactly the ${n} rows flipped, both ways (why the dependency axis matters)`,
        self.length === 1 && self[0].severity === "warning" && (self[0].lost || []).join() === flipped.lost.join() && (self[0].gained || []).join() === flipped.gained.join(),
        { reported: self.map((x) => ({ severity: x.severity, lost: x.lost, gained: x.gained })), flipped: { lost: flipped.lost, gained: flipped.gained } });
      const a = dir("addon-real", { "descriptor.mod": 'name="Full-size addon"\n' });
      const t0 = Date.now();
      const probs = coastalOverGame(a, [REAL]);
      rec(`⭐⭐⭐ an empty add-on over it is not handed the dependency's ${n} (${Date.now() - t0} ms)`, probs.length === 0, probs.map((x) => x.message));
      // The positive twin at the same size (section 4's, full-scale): a row the add-on flipped ITSELF is still reported.
      const mine = flipCoastalColumn(flipped.text, { lost: 1, skip: new Set(ids) });
      const b = dir("addon-real-own", { "descriptor.mod": 'name="Full-size addon, own row"\n', "map/definition.csv": mine.text });
      const own = coastalOverGame(b, [REAL]);
      rec("⭐⭐ …while the one row an add-on flipped itself IS reported, and only that row", own.length === 1 && (own[0].lost || []).join() === mine.lost.join()
        && !(own[0].gained || []).length && !ids.some((id) => (own[0].provinces || []).includes(id)),
        own.map((x) => ({ lost: x.lost, gained: x.gained, provinces: x.provinces })));
    }
  }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  fails.push("harness error");
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n=== a coastal flag disagreement is a warning about what the mod changed: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
