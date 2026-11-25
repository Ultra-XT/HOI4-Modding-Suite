// A state whose only air base or rocket site row stands off its own land is a map HOI4 refuses to load — it is reported
// once, as that state's missing site, and one Auto-fix click repairs it. #a-site-row-off-its-own-land
//
// THE DEFECT. findStatesWithoutSites counted a map/buildings.txt row by its state key alone. A state whose only air_base
// or rocket_site_spawn row stood in the sea, or on another state's land, read as having that site: no
// state_no_air_base_or_rocket_site (FATAL), only a building_not_over_land / building_wrong_state WARNING about the row.
// And when Auto-fix re-homed a stray on another state's land, the state it left had no row at all until a second click.
//
// WHAT hoi4.exe DOES (1.20.0.0, Operation Postern v1.20.0.0.8873, 56,556,664 bytes, capstone; section 6 re-reads the bytes
// when that build is installed. Read on 1.19.2 first; re-derived on 1.19.3 2026-09-30, on 1.19.4.0 2026-10-30 and on the
// 1.19.4.1 hotfix the same day, each time by finding each function again from its strings -- from 1.19.3 to 1.19.4.0 the
// map-building loader moved +0xA1670 and the site walk +0x5CDB0 as blocks, from 1.19.4.0 to 1.19.4.1 the loader +0x3C0 and the
// site walk not at all, every asserted instruction at the same offset inside its function, and each was re-read at its new
// address. Re-derived on 1.20.0.0 2026-11-20 the same way: the loader moved +0x3720 and the site walk +0x1DC0, every asserted
// instruction again at the same offset inside its function. 1.19.4 carries no source-file names (nor does 1.20.0) -- no
// literal in the image ends in .cpp, and its logger calls pass an empty file
// name -- so mapbuildings.cpp and strategicair.cpp are the names the earlier builds gave these two functions):
//   * mapbuildings.cpp 0x141716D60 drops a row whose pixel is not land (test [prov+0D2h],1), unless its type may stand on
//     water: ": map building location is not over the land - ignoring instance.", then jmp to the next row.
//   * strategicair.cpp 0x140CB89A0 walks EVERY entry of a state's air base / rocket site list. An empty list is "no …
//     site defined for state"; an entry whose province is 0, not land, or not in the state's own province list is "…
//     site province … is invalid for state". Either clears the ok-flag, and a cleared flag calls the failed-load path.
// So with no row of a kind on the state's own land the load fails whichever way the loader treats the others: dropped,
// the list is empty; kept under this state, the province is not the state's; kept under another state, this state's
// list is empty. A state that ALSO has a good row is left to the warnings — whether a stray beside a good row reaches
// the list is not established (section 3 pins that it stays a warning).
//
// Measured 2026-09-11 over the six shipping maps (vanilla, MD, R56, OWB, NV, RoN): 7,523 states, every air_base and
// rocket_site_spawn row on its own state's land. Section 5 re-asks the installed ones.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 280)));
  if (!ok) fails.push(label);
};

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-straysite-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-straysite-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const M = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME, APPDATA_DIR];
const RULE = "state_no_air_base_or_rocket_site";

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
// A 4x4 grid of 64-pixel provinces: 1-12 land, 13-16 sea along the bottom. y = 0 is the top row.
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COLOF = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const STATE_PROVS = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9, 10, 11, 12] };
const row = (state, type, x, y) => `${state};${type};${x.toFixed(2)};9.50;${(255 - y).toFixed(2)};0.00;0`;
const GOOD = [
  row(1, "air_base", 32, 32), row(1, "rocket_site_spawn", 36, 32),
  row(2, "air_base", 224, 32), row(2, "rocket_site_spawn", 228, 32),
  row(3, "air_base", 160, 96), row(3, "rocket_site_spawn", 164, 96),
];
const DESC = 'name="Stray sites"\nreplace_path="history/states"\nreplace_path="map"\n';
const mk = (root, rel, c) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const writeBitmap = (root, paint) => mk(root, "map/provinces.bmp", bmp24(256, 256, (x, y) => COLOF(paint ? paint(x, y) : provAt(x, y))));
function writeMap(root, buildings, descriptor) {
  if (descriptor != null) mk(root, "descriptor.mod", descriptor);
  writeBitmap(root, null);
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, g, b] = COLOF(p); const sea = p >= 13; rows.push(`${p};${r};${g};${b};${sea ? "sea" : "land"};${!sea && p >= 9 ? "true" : "false"};${sea ? "ocean" : "plains"};${sea ? 0 : 1}`); }
  mk(root, "map/definition.csv", rows.join("\n") + "\n");
  const st = (id, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${1000 * id}\n\tstate_category = rural\n\tprovinces = { ${STATE_PROVS[id].join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
  mk(root, "history/states/1.txt", st(1, "AAA"));
  mk(root, "history/states/2.txt", st(2, "BBB"));
  mk(root, "history/states/3.txt", st(3, "AAA"));
  mk(root, "history/countries/AAA.txt", "capital = 1\n");
  mk(root, "history/countries/BBB.txt", "capital = 2\n");
  const weather = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 30.11 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";
  mk(root, "map/strategicregions/1.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 1 2 3 4 5 6 7 8 9 10 11 12 }\n${weather}}\n`);
  mk(root, "map/strategicregions/2.txt", `strategic_region={\n\tid=2\n\tname="R2"\n\tprovinces={ 13 14 15 16 }\n${weather}}\n`);
  mk(root, "map/buildings.txt", buildings.join("\n") + "\n");
  mk(root, "map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
}
const newDir = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), `nova-straysite-${tag}-`)); tmps.push(d); return d; };
const rowsOf = (root) => fs.readFileSync(path.join(root, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const onOwnLand = (line, sid) => { const c = line.split(";"); const px = Math.floor(parseFloat(c[2])), py = 255 - Math.floor(parseFloat(c[4])); return px >= 0 && py >= 0 && px < 256 && py < 192 && STATE_PROVS[sid].includes(provAt(px, py)); };
const without = (rows, drop) => rows.filter((r) => r !== drop);
const namesRow = (p, sid, type) => (p.items || []).some((it) => it.stateId === sid && String(it.type) === type);

try {
  console.log("1. ⛔ State 3's only rocket site row stands in the sea");
  {
    const mod = newDir("sea");
    writeMap(mod, without(GOOD, row(3, "rocket_site_spawn", 164, 96)).concat([row(3, "rocket_site_spawn", 164, 224)]), DESC);
    const opts = { modRoot: mod, gameRoot: null, dependencyRoots: [] };
    const direct = M.findBuildingPlacementProblems({ modRoot: mod }).filter((x) => x.rule === "building_not_over_land");
    rec("THE CONTROL: Nova's placement scan does find that row over the sea", direct.some((x) => namesRow(x, 3, "rocket_site_spawn")), direct.map((x) => x.items));
    const probs = M.validateMapBitmap(opts);
    const p = probs.filter((x) => x.rule === RULE);
    rec("⭐⭐⭐ state 3 is reported as having no rocket site", p.length === 1 && (p[0].states || []).includes(3), p.map((x) => x.states));
    // Not FATAL since 2026-09-17: the engine's walk is real but seven of the owner's launches reached a 1936 game in
    // spite of it. Still an ERROR — 0 of the 7,523 states on the six shipping maps lack either row.
    rec("⭐⭐ …as an error, and NOT in the FATAL set", !!p[0] && p[0].severity === "error" && labels.isFatalRule(RULE) === false, p[0] && p[0].severity);
    rec("⭐⭐ …saying where that row stands", !!p[0] && /sea province 15/.test(String(p[0].message)), p[0] && String(p[0].message).slice(0, 260));
    rec("⭐ …and naming the row in its items", !!p[0] && (p[0].items || []).some((it) => it.stateId === 3 && (it.misplaced || []).some((m) => m.type === "rocket_site_spawn" && m.province === 15)), p[0] && p[0].items);
    const told = probs.filter((x) => x.rule === "building_not_over_land" && namesRow(x, 3, "rocket_site_spawn"));
    rec("⭐⭐ …and the same row is not told a second time as building_not_over_land", told.length === 0, told.map((x) => String(x.message).slice(0, 140)));
    rec("⭐ the fix hint says a site row must stand on the state's own land", /own land/i.test(labels.mapRuleFixHint(RULE)), labels.mapRuleFixHint(RULE));

    const r1 = M.autoFixMap(opts);
    rec("Auto-fix ran", !!r1 && r1.ok === true, r1 && r1.error);
    const after1 = M.validateMapBitmap(opts).filter((x) => x.rule === RULE);
    rec("⭐⭐⭐ ONE click: state 3 is no longer reported", after1.length === 0, after1.map((x) => String(x.message).slice(0, 200)));
    const rows1 = rowsOf(mod).filter((l) => l.startsWith("3;"));
    rec("⭐⭐ …state 3 has a rocket site row on its own land", rows1.some((l) => l.startsWith("3;rocket_site_spawn;") && onOwnLand(l, 3)), rows1);
    M.autoFixMap(opts);
    rec("⭐ a second click leaves state 3's rows as they were", JSON.stringify(rowsOf(mod).filter((l) => l.startsWith("3;"))) === JSON.stringify(rows1));
  }

  console.log("\n2. ⛔ State 3's only air base row stands on state 1's land");
  {
    const mod = newDir("land");
    const stray = row(3, "air_base", 40, 40);   // province 1, state 1's
    writeMap(mod, without(GOOD, row(3, "air_base", 160, 96)).concat([stray]), DESC);
    const opts = { modRoot: mod, gameRoot: null, dependencyRoots: [] };
    const direct = M.findBuildingPlacementProblems({ modRoot: mod }).filter((x) => x.rule === "building_wrong_state");
    rec("THE CONTROL: Nova's placement scan does find that row in the wrong state", direct.some((x) => x.stateId === 3 && x.provinceId === 1), direct.map((x) => [x.stateId, x.provinceId]));
    const probs = M.validateMapBitmap(opts);
    const p = probs.filter((x) => x.rule === RULE);
    rec("⭐⭐⭐ state 3 is reported as having no air base", p.length === 1 && (p[0].states || []).includes(3) && /an air base/.test(String(p[0].message)), p.map((x) => [x.states, String(x.message).slice(0, 120)]));
    rec("⭐⭐ …saying the row stands on a province that is not the state's", !!p[0] && /province 1, which is not in that state/.test(String(p[0].message)), p[0] && String(p[0].message).slice(0, 260));
    const told = probs.filter((x) => x.rule === "building_wrong_state" && x.stateId === 3 && x.provinceId === 1);
    rec("⭐⭐ …and the same row is not told a second time as building_wrong_state", told.length === 0, told.map((x) => String(x.message).slice(0, 140)));

    const r1 = M.autoFixMap(opts);
    rec("Auto-fix ran", !!r1 && r1.ok === true, r1 && r1.error);
    const after1 = M.validateMapBitmap(opts).filter((x) => x.rule === RULE);
    rec("⭐⭐⭐ ONE click: state 3 is no longer reported", after1.length === 0, after1.map((x) => String(x.message).slice(0, 200)));
    const rows1 = rowsOf(mod);
    rec("⭐⭐ …state 3 has an air base row on its own land", rows1.some((l) => l.startsWith("3;air_base;") && onOwnLand(l, 3)), rows1.filter((l) => l.startsWith("3;")));
    rec("⭐ …and the stray now belongs to state 1, whose land it stands on", rows1.some((l) => l === stray.replace(/^3;/, "1;")), rows1.filter((l) => l.startsWith("1;air_base")));
    M.autoFixMap(opts);
    rec("⭐ a second click leaves every site row as it was", JSON.stringify(rowsOf(mod).filter((l) => /;(air_base|rocket_site_spawn);/.test(l))) === JSON.stringify(rows1.filter((l) => /;(air_base|rocket_site_spawn);/.test(l))));
  }

  console.log("\n3. THE CONTROL: a state with a good row and a stray one is not reported — the stray stays a warning");
  {
    const mod = newDir("both");
    writeMap(mod, GOOD.concat([row(3, "rocket_site_spawn", 164, 224)]), DESC);
    const probs = M.validateMapBitmap({ modRoot: mod, gameRoot: null, dependencyRoots: [] });
    rec("⭐⭐ state 3 is not reported: it has a rocket site row on its own land", !probs.some((x) => x.rule === RULE), probs.filter((x) => x.rule === RULE).map((x) => x.states));
    rec("⭐ …and the stray is still named, as the warning it was", probs.some((x) => x.rule === "building_not_over_land" && namesRow(x, 3, "rocket_site_spawn")));
  }

  console.log("\n4. ⛔ An add-on whose PAINT strands a base state's site is told; one that inherits a clean base is not");
  {
    const game = newDir("game");
    writeMap(game, GOOD, null);
    const painter = newDir("painter");
    mk(painter, "descriptor.mod", 'name="Painter"\n');
    // Only provinces.bmp: an 8x8 block around state 3's air base (160, 96) repainted as province 6, which is state 2's.
    writeBitmap(painter, (x, y) => (x >= 156 && x < 164 && y >= 92 && y < 100 ? 6 : provAt(x, y)));
    const p = M.validateMapBitmap({ modRoot: painter, gameRoot: game, dependencyRoots: [] }).filter((x) => x.rule === RULE);
    rec("⭐⭐⭐ the painting add-on is told state 3 has no usable air base", p.length === 1 && (p[0].states || []).includes(3), p.map((x) => [x.states, String(x.message).slice(0, 160)]));
    const plain = newDir("plain");
    mk(plain, "descriptor.mod", 'name="Plain"\n');
    const q = M.validateMapBitmap({ modRoot: plain, gameRoot: game, dependencyRoots: [] }).filter((x) => x.rule === RULE);
    rec("⭐⭐ THE CONTROL: an add-on that changes nothing is told nothing", q.length === 0, q.map((x) => x.states));
  }

  console.log("\n5. Every shipping map installed here has a usable site of each kind in every state");
  {
    const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
    const ROOTS = { vanilla: VAN, MD: W + "2777392649", R56: W + "820260968", OWB: W + "2265420196", NV: W + "1827273767", RoN: W + "2026448968" };
    if (!fs.existsSync(path.join(VAN, "map", "buildings.txt"))) console.log("  SKIP  the base game is not installed here");
    else {
      let maps = 0, states = 0;
      for (const [key, root] of Object.entries(ROOTS)) {
        if (!fs.existsSync(path.join(root, "map"))) { console.log(`  SKIP  ${key} is not installed here`); continue; }
        const model = M.buildMapModel({ modRoot: root, gameRoot: VAN, dependencyRoots: [], cacheStableLayers: true });
        const found = M.findStatesWithoutSites({ modRoot: root, gameRoot: VAN, dependencyRoots: [], model });
        maps++; states += (model.states || []).length;
        rec(`⭐⭐ ${key}: no state reported (${(model.states || []).length} states)`, found.length === 0, found.slice(0, 5).map((f) => [f.stateId, f.missing, f.misplaced]));
      }
      rec("…a real corpus, not a vacuous pass", maps === 0 || states > 1000, { maps, states });
    }
  }

  console.log("\n6. The evidence, re-read from hoi4.exe (1.20.0.0) when it is installed");
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
        const jmpTo = (va) => { const b = bytes(va, 6); return b[0] === 0xe9 ? va + 5 + b.readInt32LE(1) : (b[0] === 0x0f && (b[1] & 0xf0) === 0x80) ? va + 6 + b.readInt32LE(2) : -1; };
        const leaText = (va) => { const b = bytes(va, 7); if ((b[0] & 0xfb) !== 0x48 || b[1] !== 0x8d) return null; return bytes(va + 7 + b.readInt32LE(3), 96).toString("latin1").split("\0")[0]; };
        const hex = (va, n) => bytes(va, n).toString("hex");
        rec("the buildings.txt loader tests the row's province for LAND (0x141717782: test byte [rcx+0D2h],1)", hex(0x141717782, 7) === "f681d200000001", hex(0x141717782, 7));
        rec("…and, unless the type may stand on water (0x141717791 -> 0x1406D1C50), logs the row as not over land", callTo(0x141717791) === 0x1406D1C50 && leaText(0x141717813) === ": map building location is not over the land - ignoring instance.", leaText(0x141717813));
        rec("⭐⭐ …then jumps to the next row: the row never becomes a building (0x1417178AD: jmp 0x1417183A2)", jmpTo(0x1417178AD) === 0x1417183A2);
        rec("strategicair.cpp tests each site entry's province for LAND (0x140CB909D: test byte [rax+0D2h],1)", hex(0x140CB909D, 7) === "f680d200000001", hex(0x140CB909D, 7));
        rec("…searches the state's own province list for it (0x140CB90C0: cmp [rax],ebx)", hex(0x140CB90C0, 2) === "3918", hex(0x140CB90C0, 2));
        rec("…and for a province that fails either logs \"air base site province … is invalid for state\" (0x140CB9107)", leaText(0x140CB9107) === "MAP_ERROR: air base site province ", leaText(0x140CB9107));
        rec("⭐⭐ …clearing the ok-flag (0x140CB916F: xor r12b,r12b)", hex(0x140CB916F, 3) === "4532e4", hex(0x140CB916F, 3));
        rec("⭐⭐ …for EVERY entry: the loop steps 4 bytes and goes back (0x140CB9179 add rdi,4 · 0x140CB9180 jne 0x140CB9070)", hex(0x140CB9179, 4) === "4883c704" && jmpTo(0x140CB9180) === 0x140CB9070, [hex(0x140CB9179, 4), jmpTo(0x140CB9180).toString(16)]);
        rec("⭐⭐ a cleared flag calls the failed-load path (0x140CB965F -> 0x140202130)", callTo(0x140CB965F) === 0x140202130);
      } finally { fs.closeSync(fd); }
    }
  }

  console.log(`\n=== a state whose only site row stands off its land is refused: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
