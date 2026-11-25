// A state with no air base or rocket site position is worth reporting and is NOT a refusal: it is an ERROR, outside the
// FATAL set, and the Save gate does not stop for it. #a-state-without-an-air-base-site-fails-the-map-load
//
// ⭐⭐⭐ THE GAME IS THE ORACLE, AND IT OUTRANKS A TRACE OF THE BINARY. This rule was moved INTO the fatal set on the trace
// re-read in section 3, which is correct instruction for instruction. Its consequence never happened. SEVEN of the owner's
// own launches reached a 1936 game on maps carrying this, and hoi4.exe logged nothing about an air base:
//   * nova_torture_0912, launched 2026-09-09 15:38 (crash folder hoi4_20260909_153814; "Active Mod Count: 1"; --debug).
//     Its state 1083 is owned by FRA, owns two LAND provinces (1302 and 4379), carries a victory point and 22
//     buildings.txt rows -- naval_headquarters, arms_factory, industrial_complex, supply_node -- and has NEITHER an
//     air_base row NOR a rocket_site_spawn row. Its map/buildings.txt is dated 14:23, before that launch, and has not
//     been touched since. The run reached 1936.01.01.12; its error.log is 15 lines and holds no MAP_ERROR at all.
//   * the same shape in nova_torture_0913, nova_torture_0914, nova_island, nova_island2 and nova_island3 (states 1082
//     and 1083), and in nova_flow2_b16 on 2026-09-16, which had 293 of them.
// ⭐⭐ THE POSITIVE CONTROL, so the silence means something: the same launcher with the same --debug DID write
// "MAP_ERROR: The land province … has no state." to error.log on 2026-09-08 and 2026-09-09 09:55. That message is raised
// from behind the SAME gate (0x1402057C0, whose condition the map check carries inline) through the same logger call with
// the same flag word (0x10004). So --debug neither shuts the gate nor suppresses MAP_ERROR. The gate was open on its own
// terms too: it returns "run" when the debug byte is set OR the active-mod count is non-zero, and [0x1434FE838] is the
// mod list -- 0x1420E2E70 feeds 0x1420E2650, which builds the "Mods: %s" line of a crash meta.yml (0x140122AA0 prints it).
// Every one of those launches had a mod. (Those launches ran 1.19.2, whose trace read this same gate; the addresses are
// 1.20.0.0's.)
// Every proposed gate dies with it: not landless-ness (state 1083 owns two land provinces), not an owner (FRA), not a
// controller or a country's state list (cored to FRA, with a VP). WHY the branch does not bite is unresolved.
// The rule STAYS an error with its Auto-fix: 0 of the 7,523 states on the six shipping maps lack either row, so it
// cannot cry wolf on shipping content. It is simply not a refusal. #a-validator-must-not-cry-wolf
//
// The trace that was read, and that section 3 still re-reads from the bytes (hoi4.exe 1.20.0.0, Operation Postern
// v1.20.0.0.8873, 56,556,664 bytes, capstone; read on 1.19.2 first, re-derived on 1.19.3 2026-09-30, on 1.19.4.0 2026-10-30
// and on the 1.19.4.1 hotfix the same day from the strings -- from 1.19.3 to 1.19.4.0 the site walk moved +0x5CDB0 as a
// block, every asserted instruction at the same offset inside it, and from 1.19.4.0 to 1.19.4.1 neither it, the failed-load
// path, the map check nor the gate moved; re-derived on 1.20.0.0 2026-11-20 from the strings, the site walk moved +0x1DC0,
// the failed-load path +0x1A0, the map check +0x180 and the gate +0x210, every asserted instruction at the same offset inside
// each; 1.19.4 carries no source-file names (nor does 1.20.0), so "strategicair.cpp" is the name the earlier builds gave it):
//   * strategicair.cpp 0x140CB89A0 builds, per state, the lists of air base / rocket site / gun emplacement positions
//     from map/buildings.txt, then walks every state. "MAP_ERROR: no air base site defined for state " (0x140CB8FEE),
//     "MAP_ERROR: no rocket site defined for state " (0x140CB91E1) and "MAP_ERROR: no gun emplacement defined for state "
//     (0x140CB93B1) — and the three "site province … is invalid for state" beside them — each clear its ok-flag with
//     xor r12b,r12b.
//   * After the walk, test r12b,r12b (0x140CB9551); a cleared flag reaches call 0x140202130 (0x140CB965F) — the path the
//     map check uses: IsMapInGoodState "no", and unless the game runs with -debug, "Failed to load the map" (the dialog
//     MAP_LOADING_ERROR_TITLE) then abort().
//   * The walk only runs when 0x1402057C0 says so — the same list-and-virtual condition that gates the map check in
//     0x1401E40F0 — and it is reached from CInGameIdler::InitData (a game session starting), the save loader, and a staged
//     loader not yet identified (0x1401DF260), so the message names only a game starting and a save loading. (All three
//     reach it through one wrapper, 0x1401F7580, whose tail jmp is the walk's only direct reference.)
// Measured on the six shipping maps (2026-09-11): 7,523 states, 0 lacking either row, so the gate cannot fire on shipping
// content.
// The rule stays ownership-gated (a state the mod ships, or the mod's own buildings.txt) and keeps its Auto-fix.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sitefatal-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sitefatal-appdata-"));
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
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COLOF = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const row = (state, type, x, y) => `${state};${type};${x.toFixed(2)};9.50;${(255 - y).toFixed(2)};0.00;0`;
// States 1 and 2 each have an air base and a rocket site on their own land; state 3 = { 7 8 9 } has an air base only.
const ROWS = [
  row(1, "air_base", 32, 32), row(1, "rocket_site_spawn", 36, 32),
  row(2, "air_base", 224, 32), row(2, "rocket_site_spawn", 228, 32),
  row(3, "air_base", 160, 96),
];
function writeMap(root, buildings) {
  const mk = (rel, c) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  fs.writeFileSync(path.join(root, "descriptor.mod"), 'name="Sites fatal"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk("map/provinces.bmp", bmp24(256, 256, (x, y) => COLOF(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, g, b] = COLOF(p); const sea = p >= 13; rows.push(`${p};${r};${g};${b};${sea ? "sea" : "land"};${!sea && p >= 9 ? "true" : "false"};${sea ? "ocean" : "plains"};${sea ? 0 : 1}`); }
  mk("map/definition.csv", rows.join("\n") + "\n");
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${1000 * id}\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
  mk("history/states/1.txt", st(1, "1 2 3", "AAA"));
  mk("history/states/2.txt", st(2, "4 5 6", "BBB"));
  mk("history/states/3.txt", st(3, "7 8 9 10 11 12", "AAA"));
  mk("history/countries/AAA.txt", "capital = 1\n");
  mk("history/countries/BBB.txt", "capital = 2\n");
  const weather = "\tweather={\n\t\tperiod={\n\t\t\tbetween={ 0.0 30.11 }\n\t\t\ttemperature={ -5.0 25.0 }\n\t\t\tno_phenomenon=0.700\n\t\t}\n\t}\n";
  mk("map/strategicregions/1.txt", `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 1 2 3 4 5 6 7 8 9 10 11 12 }\n${weather}}\n`);
  mk("map/strategicregions/2.txt", `strategic_region={\n\tid=2\n\tname="R2"\n\tprovinces={ 13 14 15 16 }\n${weather}}\n`);
  mk("map/buildings.txt", buildings.join("\n") + "\n");
  mk("map/adjacencies.csv", "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n");
}

try {
  console.log("1. A state of the mod's own with no rocket site is reported, as an error Save does not stop for");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sitefatal-mod-")); tmps.push(mod);
    writeMap(mod, ROWS);
    const found = M.validateMapBitmap({ modRoot: mod, gameRoot: null, dependencyRoots: [] }).filter((p) => p.rule === RULE);
    const p = found[0] || {};
    rec("the validator reports state 3", found.length === 1 && Array.isArray(p.states) && p.states.includes(3), found.map((x) => x.states));
    rec("⭐⭐⭐ …as an ERROR", p.severity === "error", p.severity);
    rec("⭐⭐⭐ …and NOT in the FATAL set, so Save does not put its hard gate in front of it", labels.isFatalRule(RULE) === false);
    rec("⭐⭐⭐ …and the message does not tell the modder the game refuses the map", !/(HOI4|the game) refuses|refuses such a map|refuses to load/.test(String(p.message)), String(p.message).slice(0, 400));
    rec("⭐⭐ …it still names the engine's own log line, so the modder can search for it", /MAP_ERROR: no air base site defined for state/.test(String(p.message)), String(p.message).slice(0, 200));
    rec("⭐⭐ …and says the game has been seen to play on regardless", /played on|has not been seen to happen/.test(String(p.message)), String(p.message).slice(0, 400));
    rec("⭐ …and still says every shipping state has both, so it is worth fixing", /7,523 of 7,523/.test(String(p.message)), String(p.message).slice(-160));
    const hint = labels.mapRuleFixHint(RULE);
    rec("⭐ its fix hint names Auto-fix and does not promise a refusal", /Auto-fix all/.test(hint) && !/stops with/.test(hint), hint);
    const fix = M.fixStatesWithoutBuildingSlots({ modRoot: mod, gameRoot: null, dependencyRoots: [] });
    rec("…Auto-fix's site repair gives state 3 its missing row", (fix.states || []).includes(3), fix);
    rec("…after which it is not reported", !M.validateMapBitmap({ modRoot: mod, gameRoot: null, dependencyRoots: [] }).some((x) => x.rule === RULE));
  }

  console.log("\n2. THE CONTROL: every state with both rows is never reported");
  {
    const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sitefatal-full-")); tmps.push(mod);
    writeMap(mod, ROWS.concat([row(3, "rocket_site_spawn", 164, 96)]));
    rec("nothing reported", !M.validateMapBitmap({ modRoot: mod, gameRoot: null, dependencyRoots: [] }).some((x) => x.rule === RULE));
  }

  console.log("\n3. The trace is REAL -- re-read from hoi4.exe (1.20.0.0) when it is installed. Only its consequence is withdrawn.");
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
        const leaText = (va) => { const b = bytes(va, 7); if ((b[0] & 0xfb) !== 0x48 || b[1] !== 0x8d) return null; return bytes(va + 7 + b.readInt32LE(3), 96).toString("latin1").split("\0")[0]; };
        const hex = (b) => b.toString("hex");
        const SITES = [
          [0x140CB8FEE, "MAP_ERROR: no air base site defined for state ", 0x140CB902A],
          [0x140CB91E1, "MAP_ERROR: no rocket site defined for state ", 0x140CB9229],
          [0x140CB93B1, "MAP_ERROR: no gun emplacement defined for state ", 0x140CB93F9],
        ];
        for (const [site, text, clear] of SITES) {
          rec(`"${text.trim()}" is loaded at ${"0x" + site.toString(16).toUpperCase()}`, leaText(site) === text, leaText(site));
          rec(`…and clears the ok-flag after it (xor r12b,r12b at ${"0x" + clear.toString(16).toUpperCase()})`, hex(bytes(clear, 3)) === "4532e4", hex(bytes(clear, 3)));
        }
        rec("the flag is tested after the walk (0x140CB9551: test r12b,r12b)", hex(bytes(0x140CB9551, 3)) === "4584e4", hex(bytes(0x140CB9551, 3)));
        rec("⭐⭐ …and a cleared flag calls the failed-load path (0x140CB965F -> 0x140202130)", callTo(0x140CB965F) === 0x140202130);
        rec("the map check calls that same path (0x1401E4A42 -> 0x140202130)", callTo(0x1401E4A42) === 0x140202130);
        rec("the walk is gated by 0x1402057C0 (0x140CB8F01)", callTo(0x140CB8F01) === 0x1402057C0);
      } finally { fs.closeSync(fd); }
    }
  }

  console.log(`\n=== a state without an air base site is not a refusal: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
