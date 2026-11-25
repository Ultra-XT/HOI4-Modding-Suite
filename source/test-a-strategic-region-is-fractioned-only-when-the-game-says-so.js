// A strategic region is reported as fractioned exactly when hoi4.exe would refuse it — and then it blocks Save.
// #a-fractioned-region-is-judged-the-way-the-game-judges-it
//
// WHAT THE GAME CHECKS (hoi4.exe 1.20.0.0, Operation Postern v1.20.0.0.8873, 56,556,664 bytes, read-only — first traced
// on 1.19.2 with dumpbin, re-derived on 1.19.3 on 2026-09-30, on 1.19.4.1 on 2026-10-30 and on 1.20.0.0 on 2026-11-20 from
// the strings and the call graph; section 7 re-reads the bytes):
//   * The map check 0x1401E40F0 calls 0x1401E6500, which tests a region only when qword [region+0A0h] > 0.
//     strategicregion.cpp 0x140E94E40 writes that field (0x140E956CB) as the share of the region's listed provinces
//     that are neither land (flags bit 0, the bit "The land province … has no state." tests) nor lake (bit 1): the SEA
//     share. So: every region that lists at least one sea province.
//   * 0x1401E5E00 flood-fills (0x1401F1300) from the region's first listed province through each province's neighbour
//     list, staying inside the region's WHOLE province list — land, sea and lake — and names every province it never
//     reached ("Naval strategic region … is fractioned! The following provinces are separated from the rest").
//   * The neighbour list is provinces.bmp's four pixel neighbours with the horizontal wrap (0x140AB117E..0x140AB1253)
//     plus EVERY adjacencies.csv row, impassable included (0x140AB5AF3..0x140AB5C92).
//   * A province not reached makes 0x1401E6500 return false; 0x1401E40F0 then calls 0x140202130 (0x1401E4A42):
//     IsMapInGoodState "no" and, unless launched with -debug, "Failed to load the map" and abort().
//   * ⚠️ One byte decides both halves of that (read 2026-10-30, pinned in section 7). The line naming the cut-off provinces
//     ("MAP_ERROR: …", 0x1401E642F) carries the log flag word 0x10004, which has a file only behind the debug byte 0x1433E3519
//     (test-a-unit-that-starts-where-the-map-took-its-sea-or-land-away-is-reported.js pins the chain), and 0x140202130 returns
//     without the abort on that same byte (0x14020223F). So the launch that refuses the map names no province in error.log,
//     and the launch that names them does not refuse it.
// (1.19.4 strips source paths, and 1.20.0.0 still does, so "strategicregion.cpp" is 1.19.3's name for 0x140E94E40: on
// 1.19.4 and 1.20.0.0 it is the function the map check calls at 0x1401E46C0 that logs "' added twice to strategic area "
// and tallies [province+0D2h] bits 0 and 1 into the land, sea and lake shares it writes at [region+98h], [+0A0h] and
// [+0A8h]. On 1.19.4.1 every address section 7 pins sat at the offset inside its function that it had in 1.19.3, except
// that write, 0xE bytes earlier in a function that changed around it; the provinces.bmp range was matched by what it does
// — and it is exactly as long as 1.19.3's. On 1.20.0.0, re-read 2026-11-20, every one of them, that write included, sits at
// its 1.19.4.1 offset, and both ranges were matched again by what they do.)
//
// THE DEFECTS, measured on the base commit 113d5b5:
//   1. Nova judged a region's SEA joined through sea alone, so a region whose sea is joined through its own coast (or a
//      lake) read as cut in two. Old World Blues, loaded by thousands of players, was told 27 provinces in regions 1 and
//      104 were cut off. Read the game's way, all six shipping maps (vanilla, MD, R56, OWB, NV, RoN) have 0.
//   2. It dropped `impassable` adjacencies.csv rows, which the game links.
//   3. A piece with no neighbouring region to move into was left out of the report with its move, though the game
//      refuses the map either way.
//   4. So the rule could not be trusted with the Save gate: fractioned_naval_region was not FATAL, and its message did
//      not say the game refuses the map.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fracgame-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fracgame-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME, APPDATA_DIR];
const RULE = "fractioned_naval_region";
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
const COLOUR = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200], 4: [0, 0, 120], 9: [120, 120, 0] };
function writeMod(root, { grid, types, regions, adjacencies }) {
  mk(path.join(root, "descriptor.mod"), 'name="Fractioned the game\'s way"\nreplace_path="map"\n');
  fs.mkdirSync(path.join(root, "map"), { recursive: true });
  fs.writeFileSync(path.join(root, "map", "provinces.bmp"), bmp(grid, COLOUR));
  const row = (id) => {
    const [r, g, b] = COLOUR[id], t = types[id];
    return t === "sea" ? `${id};${r};${g};${b};sea;true;ocean;0` : t === "lake" ? `${id};${r};${g};${b};lake;false;lakes;0` : `${id};${r};${g};${b};land;true;plains;1`;
  };
  mk(path.join(root, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(types).map(row)).join("\r\n") + "\r\n");
  for (const [id, provs] of Object.entries(regions)) {
    mk(path.join(root, "map", "strategicregions", `${id}-R.txt`), `strategic_region = {\n\tid = ${id}\n\tname = "R${id}"\n\tprovinces = { ${provs} }\n\tweather = {}\n}\n`);
  }
  if (adjacencies) mk(path.join(root, "map", "adjacencies.csv"), "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n" + adjacencies.join("\n") + "\n");
}
const hashDir = (d) => {
  const h = crypto.createHash("sha1");
  for (const f of fs.readdirSync(d).sort()) h.update(f).update(fs.readFileSync(path.join(d, f)));
  return h.digest("hex");
};
const fracOf = (probs) => probs.filter((p) => p.rule === RULE);
const newMod = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `nova-fracgame-${tag}-`)); tmps.push(d); return d; };

// Provinces 1 and 3 sit apart along the top; 2 fills the gap between them; 9 is a land column on the right edge (so
// column 0 meets land across the wrap seam, not 3); 4 is a sea along the bottom. No 2x2 block holds four provinces.
const G = [
  [1, 1, 2, 2, 2, 3, 3, 9],
  [1, 1, 2, 2, 2, 3, 3, 9],
  [4, 4, 4, 4, 4, 4, 4, 4],
];
const SEA = { 1: "sea", 2: "land", 3: "sea", 4: "sea", 9: "land" };

try {
  console.log("1. ⛔ A naval region whose sea is joined through its own coast is ONE piece to the game");
  for (const bridge of ["land", "lake"]) {
    const mod = newMod("coast-" + bridge);
    writeMod(mod, { grid: G, types: { ...SEA, 2: bridge }, regions: { 10: "1 2 3", 30: "4", 40: "9" } });
    rec(`(${bridge}) the fixture has no X-crossing, so nothing else about it is broken`, md.findMapXCrossings({ modRoot: mod }).length === 0);
    const dry = md.fixFractionedRegions({ modRoot: mod, dryRun: true });
    rec(`(${bridge}) the detector ran`, !!dry && !dry.error, dry && dry.error);
    rec(`⭐⭐⭐ (${bridge}) sea 1 and sea 3 are joined through the region's own ${bridge} 2 — no fragment`, !(dry.provinces || []).length, dry);
    const probs = md.validateMapBitmap({ modRoot: mod, dependencyRoots: [] }) || [];
    rec(`⭐⭐⭐ (${bridge}) …so ${RULE} is not reported`, fracOf(probs).length === 0, fracOf(probs).map((p) => p.message.slice(0, 120)));
    const dir = path.join(mod, "map", "strategicregions"), before = hashDir(dir);
    const r = md.fixFractionedRegions({ modRoot: mod });
    rec(`⭐⭐ (${bridge}) Auto-fix's region repair moves nothing`, !!r && !r.error && r.moved === 0, r);
    rec(`⭐⭐ (${bridge}) …and the region files are byte-identical`, hashDir(dir) === before);
  }

  console.log("\n2. An impassable adjacencies.csv row still joins two provinces for the game");
  {
    const mod = newMod("impassable");
    const regions = { 10: "1 3", 20: "2", 30: "4", 40: "9" };
    writeMod(mod, { grid: G, types: SEA, regions });
    const without = md.fixFractionedRegions({ modRoot: mod, dryRun: true });
    rec("THE CONTROL: with no row, 1 and 3 are two pieces", (without.provinces || []).length === 1, without);
    writeMod(mod, { grid: G, types: SEA, regions, adjacencies: ["1;3;impassable;-1;-1;-1;-1;-1;;test", "-1;-1;;-1;-1;-1;-1;-1;-1"] });
    const withRow = md.fixFractionedRegions({ modRoot: mod, dryRun: true });
    rec("⭐⭐ with an impassable row between them they are one piece, as hoi4.exe links every row", (withRow.provinces || []).length === 0, withRow);
  }

  console.log("\n3. ⛔ A region the game refuses is reported as a map it will not load — and Auto-fix repairs it");
  {
    const mod = newMod("refused");
    writeMod(mod, { grid: G, types: SEA, regions: { 10: "1 3", 20: "2", 30: "4", 40: "9" } });
    const dry = md.fixFractionedRegions({ modRoot: mod, dryRun: true });
    rec("⭐⭐ the detector names the one cut-off province", (dry.provinces || []).length === 1, dry);
    const probs = fracOf(md.validateMapBitmap({ modRoot: mod, dependencyRoots: [] }) || []);
    const p = probs[0] || {};
    rec("⭐⭐ the validator reports it once", probs.length === 1, probs.map((x) => x.provinces));
    rec("…as an error", p.severity === "error", p.severity);
    rec("⭐⭐⭐ …in the FATAL set, so Save puts its hard gate in front of it", labels.isFatalRule(RULE) === true);
    rec("⭐⭐ …saying the game will not load the map, and that -debug is what loads past it", /Failed to load the map/.test(String(p.message)) && /-debug/.test(String(p.message)), String(p.message).slice(0, 300));
    rec("⭐ …quoting what HOI4 logs", /is fractioned/.test(String(p.message)), String(p.message).slice(0, 200));
    const hint = labels.mapRuleFixHint(RULE);
    rec("⭐ the Save gate has a fix hint naming Auto-fix and the inspector's region dropdown", /Auto-fix all/.test(hint) && /Strat\. region/.test(hint), hint);

    const dir = path.join(mod, "map", "strategicregions"), before = hashDir(dir);
    const r1 = md.fixFractionedRegions({ modRoot: mod });
    rec("⭐⭐ click 1: Auto-fix's region repair moves the piece", !!r1 && !r1.error && r1.moved === 1, r1);
    const afterOne = hashDir(dir);
    rec("…and the region files changed", afterOne !== before);
    const m = md.buildMapModel({ modRoot: mod, cacheStableLayers: true });
    rec("…into the sea region it borders", [m.provinceToRegion[1], m.provinceToRegion[3]].filter((x) => x === 30).length === 1, { 1: m.provinceToRegion[1], 3: m.provinceToRegion[3] });
    const r2 = md.fixFractionedRegions({ modRoot: mod });
    rec("⭐⭐ click 2 moves nothing", !!r2 && !r2.error && r2.moved === 0, r2);
    rec("⭐⭐ …and leaves the files byte-identical to click 1", hashDir(dir) === afterOne);
    rec("…and the map is no longer reported", fracOf(md.validateMapBitmap({ modRoot: mod, dependencyRoots: [] }) || []).length === 0);
  }

  console.log("\n4. A piece with no neighbouring region to move into is still reported: the game refuses the map either way");
  {
    const mod = newMod("nowhere");
    // Sea 3 is walled in by land 2, which no region lists — so there is nowhere to re-home 3.
    const G4 = [
      [1, 1, 2, 2, 2, 3, 2, 9],
      [1, 1, 2, 2, 2, 2, 2, 9],
      [4, 4, 4, 4, 4, 4, 4, 4],
    ];
    writeMod(mod, { grid: G4, types: SEA, regions: { 10: "1 3", 30: "4", 40: "9" } });
    rec("the fixture has no X-crossing", md.findMapXCrossings({ modRoot: mod }).length === 0);
    const dry = md.fixFractionedRegions({ modRoot: mod, dryRun: true });
    rec("⭐⭐ the detector names sea 3", (dry.provinces || []).includes(3), dry);
    rec("⭐⭐ …and the validator reports it", fracOf(md.validateMapBitmap({ modRoot: mod, dependencyRoots: [] }) || []).length === 1);
    const dir = path.join(mod, "map", "strategicregions"), before = hashDir(dir);
    const r = md.fixFractionedRegions({ modRoot: mod });
    rec("the fixer, with nowhere to put it, moves nothing and writes nothing", !!r && !r.error && r.moved === 0 && hashDir(dir) === before, r);
  }

  console.log("\n5. THE CONTROL: a region with no sea is never judged — islands and exclaves are legal there");
  {
    const mod = newMod("landonly");
    writeMod(mod, { grid: G, types: SEA, regions: { 10: "1 3 4", 50: "2 9" } });
    const m = md.buildMapModel({ modRoot: mod, cacheStableLayers: true });
    rec("land region 50 really is two pieces (2 and 9 do not touch)", m.provinceToRegion[2] === 50 && m.provinceToRegion[9] === 50);
    const dry = md.fixFractionedRegions({ modRoot: mod, dryRun: true });
    rec("⭐ …and nothing is reported", !(dry.provinces || []).length, dry);
  }

  console.log("\n6. Old World Blues, which ships and loads, is not told its regions are cut in two");
  {
    const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const OWB = "D:/SteamLibrary/steamapps/workshop/content/394360/2265420196";
    if (!fs.existsSync(path.join(OWB, "map", "strategicregions")) || !fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
      console.log("  SKIP  Old World Blues or the base game is not installed here");
    } else {
      const r = md.fixFractionedRegions({ modRoot: OWB, gameRoot: GAME, dependencyRoots: [], dryRun: true });
      rec("⭐⭐⭐ the detector finds 0 separated provinces on Old World Blues (27 before)", !!r && !r.error && (r.provinces || []).length === 0, { n: (r.provinces || []).length, regions: [...new Set((r.details || []).map((d) => d.region))] });
    }
  }

  console.log("\n6b. ⛔ On an add-on to the base game, Auto-fix's region repair moves nothing and writes nothing");
  {
    const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const regionsDir = path.join(GAME, "map", "strategicregions");
    if (!fs.existsSync(regionsDir) || !fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
      console.log("  SKIP  the base game is not installed here");
    } else {
      const hashTree = (d) => {
        const h = crypto.createHash("sha1");
        const walk = (dir, rel) => {
          for (const f of fs.readdirSync(dir).sort()) {
            const p = path.join(dir, f), r = rel + "/" + f;
            if (fs.statSync(p).isDirectory()) walk(p, r); else h.update(r).update(fs.readFileSync(p));
          }
        };
        walk(d, "");
        return h.digest("hex");
      };
      // The add-on re-saves one of the base game's region files with a comment, so the rule's ownership gate opens
      // (modChangedMapFile) and the detector and the fixer both run over the whole base map, as Auto-fix runs them.
      const mod = newMod("vanilla-addon");
      mk(path.join(mod, "descriptor.mod"), 'name="A base-game add-on"\n');
      const first = fs.readdirSync(regionsDir).filter((f) => f.endsWith(".txt")).sort()[0];
      mk(path.join(mod, "map", "strategicregions", first), fs.readFileSync(path.join(regionsDir, first), "utf8") + "\n# re-saved by an add-on\n");
      const opts = { modRoot: mod, gameRoot: GAME, dependencyRoots: [] };
      const dry = md.fixFractionedRegions({ ...opts, dryRun: true });
      rec("the detector ran over the base map", !!dry && !dry.error, dry && dry.error);
      rec("⭐⭐ it finds no cut-off province", (dry.provinces || []).length === 0, { n: (dry.provinces || []).length, regions: [...new Set((dry.details || []).map((d) => d.region))] });
      rec("⭐⭐ …and the validator reports none", fracOf(md.validateMapBitmap(opts) || []).length === 0);
      const before = hashTree(mod);
      for (let click = 1; click <= 2; click++) {
        const r = md.fixFractionedRegions(opts);
        rec(`⭐⭐ click ${click}: the region repair moves nothing`, !!r && !r.error && r.moved === 0, r);
      }
      rec("⭐⭐⭐ …and the add-on is byte-identical: no region file copied in or rewritten", hashTree(mod) === before);
    }
  }

  console.log("\n7. The evidence, re-read from hoi4.exe (1.20.0.0) when it is installed");
  {
    const EXE = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/hoi4.exe";
    if (!fs.existsSync(EXE) || fs.statSync(EXE).size !== 56556664) {
      console.log("  SKIP  hoi4.exe 1.20.0.0 (56,556,664 bytes) is not installed here — the addresses belong to that build");
    } else {
      const fd = fs.openSync(EXE, "r");
      try {
        const head = Buffer.alloc(4096); fs.readSync(fd, head, 0, 4096, 0);
        const pe = head.readUInt32LE(0x3c), nSec = head.readUInt16LE(pe + 6), optSize = head.readUInt16LE(pe + 20), opt = pe + 24;
        const IB = Number(head.readBigUInt64LE(opt + 24));
        const secs = []; for (let i = 0; i < nSec; i++) { const s = opt + optSize + i * 40; secs.push({ va: head.readUInt32LE(s + 12), size: head.readUInt32LE(s + 16), raw: head.readUInt32LE(s + 20) }); }
        const bytes = (va, n) => { const rva = va - IB, s = secs.find((x) => rva >= x.va && rva < x.va + x.size), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, rva - s.va + s.raw); return b; };
        const callTo = (va) => { const b = bytes(va, 5); return b[0] === 0xe8 ? va + 5 + b.readInt32LE(1) : -1; };
        const hex = (b) => b.toString("hex");
        rec("the map check calls the region check (0x1401E4A1C -> 0x1401E6500)", callTo(0x1401E4A1C) === 0x1401E6500);
        rec("…and on failure the failed-load path (0x1401E4A42 -> 0x140202130)", callTo(0x1401E4A42) === 0x140202130);
        rec("the region check tests qword [region+0A0h] > 0 before each region (0x1401E657B)", hex(bytes(0x1401E657B, 8)) === "4883b9a000000000", hex(bytes(0x1401E657B, 8)));
        rec("…and calls the per-region test (0x1401E658A -> 0x1401E5E00)", callTo(0x1401E658A) === 0x1401E5E00);
        rec("the per-region test flood-fills (0x1401E5FA7 -> 0x1401F1300)", callTo(0x1401E5FA7) === 0x1401F1300);
        rec("strategicregion.cpp writes [region+0A0h] from its province tally (0x140E956CB: mov [rbp+0A0h],rax)", hex(bytes(0x140E956CB, 7)) === "488985a0000000", hex(bytes(0x140E956CB, 7)));
        rec("bit 0 of the province flags is LAND: the \"has no state\" check tests it (0x1401E47A6: test byte [rax+0D2h],1)", hex(bytes(0x1401E47A6, 7)) === "f680d200000001", hex(bytes(0x1401E47A6, 7)));
        const ripText = (va, len, dispAt) => bytes(va + len + bytes(va, len).readInt32LE(dispAt), 64).toString("latin1").split("\0")[0];
        rec("⚠️ the per-region test builds the line naming the cut-off provinces (\"\\nNaval strategic region \", 0x1401E61B9; \" is fractioned!…\", 0x1401E6140) and logs it as \"MAP_ERROR: …\" (0x1401E642F) on the log flag word 0x10004 (0x1401E640D, the fifth argument of the log entry 0x14254FD50 at 0x1401E6429), a word a normal launch has no file for",
          hex(bytes(0x1401E61B9, 3)) === "0f1005" && ripText(0x1401E61B9, 7, 3) === "\nNaval strategic region " && hex(bytes(0x1401E6140, 3)) === "0f2805" && ripText(0x1401E6140, 7, 3).startsWith(" is fractioned!")
            && hex(bytes(0x1401E640D, 8)) === "c744242004000100" && callTo(0x1401E6429) === 0x14254FD50 && hex(bytes(0x1401E642F, 3)) === "488d15" && ripText(0x1401E642F, 7, 3) === "MAP_ERROR: ",
          [ripText(0x1401E61B9, 7, 3), ripText(0x1401E6140, 7, 3), hex(bytes(0x1401E640D, 8)), ripText(0x1401E642F, 7, 3)]);
        rec("⚠️ …and the failed-load path returns without its error screen on the byte that word's file stands behind (0x14020223F cmp byte [0x1433E3519],0; 0x140202246 je 0x140202259 past the ret, to \"MAP_LOADING_ERROR_TITLE\", 0x14020225F): the launch that refuses the map does not name the provinces, and the launch that names them does not refuse it",
          hex(bytes(0x14020223F, 2)) === "803d" && 0x14020223F + 7 + bytes(0x14020223F, 7).readInt32LE(2) === 0x1433E3519 && hex(bytes(0x140202246, 1)) === "74" && 0x140202248 + bytes(0x140202246, 2).readInt8(1) === 0x140202259
            && hex(bytes(0x140202258, 1)) === "c3" && ripText(0x14020225F, 7, 3) === "MAP_LOADING_ERROR_TITLE",
          [hex(bytes(0x14020223F, 7)), hex(bytes(0x140202246, 2)), ripText(0x14020225F, 7, 3)]);
      } finally { fs.closeSync(fd); }
    }
  }

  console.log(`\n=== a strategic region is fractioned only when the game says so: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
