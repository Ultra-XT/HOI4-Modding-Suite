// A fleet or a division that a country starts where the mod's map no longer allows it is reported — as a warning, only
// when the mod's own map edit did it, and only for units the game actually starts. #a-unit-starts-where-the-map-no-longer-allows-it
//
// THE DEFECT. No Nova rule looked at unit locations. The owner's nova_torture_0917 build turned four North Sea provinces
// into land; that took the only sea beside Rosyth (province 6300) away, Auto-fix then removed Rosyth's naval base, and
// vanilla's ENG_1936_Naval.txt (and _Legacy, and both 1939 files) still start "Rosyth Escort Force" at location = 6300.
// The same build erased Basrah (2089) to sea while vanilla's IRQ_1939.txt still starts a division there. Nova reported
// neither: "0 errors, 1 warning". The Map editor's tools that take a sea or a land away (the Province inspector's type,
// the Erase brush, painting) said nothing either, and the Save's own re-check had no rule to find it with.
//
// WHAT THE GAME DOES (hoi4.exe 1.20.0.0, Operation Postern v1.20.0.0.8873, 56,556,664 bytes; dumpbin on earlier builds;
// section 0 re-reads the bytes):
//   * unit.cpp 0x140C5A350 reads a unit's `location` for divisions (army.cpp 0x140CEB2F0, its call at 0x140CEBD89) and task
//     forces (taskforce.cpp 0x140DDF0B0, its call at 0x140DDFDB7) alike — railway guns (0x140F02560) too. It tests only
//     whether the id is a province: an id in the province range with no province behind it is logged " has invalid
//     location at province ID '…'. Spawning at province ID=1." and replaced with province 1 (mov edx,1 at 0x140C5AB1F);
//     one outside the range is logged " has invalid location at province ID '…'." and handed to the placement call with
//     no province at all (test-an-order-of-battle-under-water-is-reported-in-full.js pins that branch, the one other
//     branch between the lookup and the null test — a gamestate byte only CCurrentGameState::Load sets — and the
//     enemy-territory line after it, which only logs). The reader has no land/sea test: it takes a fleet on land and a
//     division at sea alike.
//   * ⚠️ THE FIRST LAND TEST IS ONE CALL LATER, AND IT STOPS NOTHING. The reader's placement call lands in 0x140C5BE40
//     (CUnit's slot 0E8h; CArmy's 0x140CED500 and CTaskForce's 0x140DE18A0 call it too), which stores the location and
//     hands the unit to the province, 0x140EEE570 (0x140C5BFCD, its only caller). There a division's branch tests nothing.
//     A fleet's asks whether the province is LAND ([template+0D2h], 0x140EEE73E) and whether a table at [gamestate+698h]
//     holds its id (0x140EF28D0). On land with no entry, unless a save is loading ([gamestate+0A35h], 0x140EEE861), it
//     asserts behind a second switch (0x143695AA0, 0x140EEE8B1; the launch options that set the switch below set this
//     one too, and -debug_asserts), logs "Trying to move navy to land province with no port: <id> (<name>)" (0x140EEE8F6),
//     and then adds the fleet to the province all the same (0x140EEE9EC). Nothing on the way refuses or moves it:
//     CTaskForce's own two reads of that bit (0x140DE18CD, 0x140DE18FA) come after the placement and lead only to a
//     `ret 0`. Not an engine change: 1.19.3 held both strings (scratchpad vgeo-audit/units/verify-CR-3/strs1.out.txt).
//     This note's old "there is no land/sea test" stopped at the reader, which was as far as it had read.
//   * ⚠️⚠️ AND A NORMAL LAUNCH WRITES NONE OF THESE LINES. The reader's, the fleet's and mapbuildings' below all carry the
//     log flag word 0x10004. The logger is a table from flag word to file (CFilterLogger, 0x14228E230) that drops a word
//     with no entry, and 0x10004's one entry, the file 0x1000 writes (error.log), is registered (0x140125B36) only behind
//     the debug byte (0x140125AEB, [0x1433E3519]), which at launch only -debug and -crash_data_log set. So such a fleet
//     names itself in error.log under -debug and nowhere without it. MEASURED 2026-10-30, read-only, the game not started:
//     none of the 342 texts of 12 characters or more logged with that word occurs in the owner's 92 logs (26 crash folders,
//     the 2026-09-23 launches that died on stranded fleets among them, and two logs folders), while the same search does
//     find 0x1000's texts in error.log. Those launches passed `--debug_mode` at most, which hoi4.exe holds no string for.
//     Two older launches, on 1.19.2, control it from both sides: `--debug` on 2026-09-08 and 09-09 did write a MAP_ERROR
//     line through this word (test-a-state-without-an-air-base-site-is-not-a-refusal.js), and the launch recorded WITHOUT
//     -debug on 2026-09-16 wrote twelve lines (map-data.js #a-strategic-location-the-game-refuses), both kinds on 0x1000.
//   * taskforce.cpp 0x140DD3090 (finding a task force's naval base) reads the land province's port sea zone
//     ([template+0C8h], 0x140DD31F7 — the value mapbuildings.cpp stores from a port row, 0x141717FFF). When it is 0 it
//     asserts "!\"Current location is a land province without sea access\"" — behind the assert switch 0x143695AA1, so a
//     normal launch only returns null (0x140DD3261), and its three callers — image-wide, the only direct calls or jumps to
//     it — test for null (0x140DDC575, 0x140DDE2A1, 0x140DE12E4). The engine calls the state impossible and carries on.
//   * Neither path reaches the failed-load call 0x140202130 (its only two callers are the map check and strategicair).
// So the trace alone says a WARNING, never fatal — the fleet half moved to the FATAL set on launch evidence on 2026-09-24,
// and section 1 says why. (Re-derived 2026-10-30 on 1.19.4.1 from the strings outward, as it was on 2026-09-30 for 1.19.3.
// From 1.19.3, army.cpp moved +0x5CD50, taskforce.cpp's reader +0x66500 and its naval-base finder +0x66380, and
// mapbuildings.cpp +0xA1A30, every byte the 1.19.3 version asserted unchanged at the same offset inside its function but
// the two source paths it read there; unit.cpp's reader moved +0x55AB0 and was recompiled — see the next note.)
// (Re-derived again 2026-11-20 on 1.20.0.0, Operation Postern v1.20.0.0.8873, from the strings and the RTTI outward: every
// function section 0 reads was found again, the instructions it pins in the same order and spacing, at a new address.)
// ⚠️ 1.19.4 STRIPS THE SOURCE PATHS, and 1.20.0.0 still does. Every assert and log call in the image now passes one shared
// empty string (0x14279873D) as its file — "main.cpp (%d): RunGame" is the only ".cpp" left — so the module names above
// are 1.19.3's, carried over by code that is otherwise identical, and section 0 names the callers by the exe's own RTTI
// instead.
// The unit reader is the one function here that changed shape for it: its asserts keep that empty string in rsi, so the
// province object 1.19.3 kept in rsi lives in a stack slot, and its instructions sit 0x12..0x31 bytes later than in 1.19.3.
//
// MEASURED (scratchpad unit-census-loaded.js, the OOBs each effective history/countries starts): task forces started on
// land with no sea beside it — vanilla 0 of 664, Millennium Dawn 0/280, Road to 56 0/176, Old World Blues 0/36, Novum
// Vexillum 0/433, Rise of Nations 0/1,587; the torture build 4. Divisions started on sea or lake: vanilla 0 of 4,566, MD
// 3 of 4,967, R56 0 of 2,016, OWB 0 of 1,511, NV 0 of 3,513, RoN 7 of 11,429 (MD and RoN launch); the torture build 1.
// ⚠️ RoN's figure read 16 until 2026-09-16: that is the count over EVERY file in its history/units (26 today), not the
// ones its country histories start. Reading every file instead of the started ones would also have told Road to 56 about
// three vanilla Dutch files it never loads (its 13403 is Amazonas). The started figures now live in map-data.js's
// SHIPPING_DIVISIONS_ON_WATER, which the division rule quotes and
// test-an-order-of-battle-under-water-is-reported-in-full.js re-measures against the installed mods.
//
// THE GATE. Only units a country that owns land starts (history/countries oob / set_oob / set_naval_oob / set_air_oob /
// load_oob, any date, any DLC branch); only when the mod changed provinces.bmp or a province's land/sea type; and only
// where the layers below had the sea (for a fleet) or the land (for a division) that is gone now. What a mod inherits
// broken is not its to fix.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-units-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-units-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-units-mods-"));
process.env.HOI4_MODS_ROOT = MODS;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME, APPDATA_DIR, MODS];
const FLEET = "fleet_starts_on_land_with_no_sea";
const DIV = "division_starts_on_water";

// A 4×4 grid of 64-px provinces: row 1 = 1-4, row 2 = 5-8, row 3 = 9-12, row 4 = 13-16 (sea in the base).
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const BMP = bmp24(256, 256, (x, y) => COL(provAt(x, y)));
function definition(typeOf) {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, g, b] = COL(p); const t = typeOf(p); rows.push(`${p};${r};${g};${b};${t};false;${t === "land" ? "plains" : "ocean"};${t === "land" ? 1 : 0}`); }
  return rows.join("\n") + "\n";
}
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
const ship = (n) => `ship = { name = "${n}" definition = destroyer equipment = { ship_hull_light_1 = { amount = 1 owner = AAA } } }`;

function writeGame(game, { coastGuardAt = 4 } = {}) {
  mk(game, "map/provinces.bmp", BMP);
  mk(game, "map/definition.csv", definition((p) => (p >= 13 ? "sea" : "land")));
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
  mk(game, "history/states/1.txt", st(1, "1 2 3 4", "AAA"));
  mk(game, "history/states/2.txt", st(2, "5 6 7 8", "AAA"));
  mk(game, "history/states/3.txt", st(3, "9 10 11 12", "BBB"));
  mk(game, "history/countries/AAA - Aland.txt", `capital = 1\noob = "AAA_1936"\nif = {\n\tlimit = { has_dlc = "Man the Guns" }\n\tset_naval_oob = "AAA_naval"\n\telse = { set_naval_oob = AAA_naval_legacy }\n}\n# oob = "AAA_unused"\n`);
  mk(game, "history/countries/BBB - Bland.txt", "capital = 3\n");
  // CCC owns no state: a country that does not exist at the start never spawns its order of battle.
  mk(game, "history/countries/CCC - Cland.txt", 'capital = 2\noob = "CCC_1936"\n');
  mk(game, "history/units/AAA_naval.txt", [
    "units = {", "\tfleet = {", '\t\tname = "Home Fleet"', "\t\tnaval_base = 10",
    "\t\ttask_force = {", '\t\t\tname = "Bay Squadron"', "\t\t\tlocation = 10", `\t\t\t${ship("S1")}`, "\t\t}",
    "\t\ttask_force = {", '\t\t\tname = "Old Hulk"', "\t\t\tlocation = 6", `\t\t\t${ship("S2")}`, "\t\t}",
    "\t}", "}", ""].join("\n"));
  mk(game, "history/units/AAA_naval_legacy.txt", [
    "units = {", "\tfleet = {", '\t\tname = "Legacy Fleet"', "\t\tnaval_base = 10",
    "\t\ttask_force = {", '\t\t\tname = "Legacy Bay Squadron"', "\t\t\tlocation = 10", `\t\t\t${ship("S3")}`, "\t\t}",
    "\t}", "}", ""].join("\n"));
  mk(game, "history/units/AAA_1936.txt", [
    'division_template = { name = "Inf" regiments = { infantry = { x = 0 y = 0 } } }', "units = {",
    `\tdivision = { name = "Coast Guard" location = ${coastGuardAt} division_template = "Inf" }`,
    '\tdivision = { name = "Home Guard" location = 2 division_template = "Inf" }',
    '\tdivision = { name = "Sailors" location = 16 division_template = "Inf" }', "}", ""].join("\n"));
  mk(game, "history/units/AAA_unused.txt", [
    "units = {", '\tdivision = { name = "Never Started" location = 4 division_template = "Inf" }',
    "\tfleet = {", '\t\tname = "Ghost Fleet"', "\t\tnaval_base = 11", "\t\ttask_force = {", '\t\t\tname = "Ghost Squadron"', "\t\t\tlocation = 11", "\t\t}", "\t}", "}", ""].join("\n"));
  mk(game, "history/units/CCC_1936.txt", "units = {\n\tdivision = { name = \"Exile Brigade\" location = 4 division_template = \"Inf\" }\n}\n");
}

(async () => {
  try {
    console.log("\n=== 0. the engine's own code (hoi4.exe 1.20.0.0, read-only) ===");
    {
      const EXE = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/hoi4.exe";
      if (!fs.existsSync(EXE) || fs.statSync(EXE).size !== 56556664) {
        skip("hoi4.exe 1.20.0.0 (56,556,664 bytes) is not installed here — the engine facts did NOT run");
      } else {
        const fd = fs.openSync(EXE, "r");
        try {
          const head = Buffer.alloc(4096); fs.readSync(fd, head, 0, 4096, 0);
          const pe = head.readUInt32LE(0x3c), nSec = head.readUInt16LE(pe + 6), optSize = head.readUInt16LE(pe + 20), opt = pe + 24;
          const IB = Number(head.readBigUInt64LE(opt + 24));
          const secs = []; for (let i = 0; i < nSec; i++) { const s = opt + optSize + i * 40; secs.push({ va: head.readUInt32LE(s + 12), size: head.readUInt32LE(s + 16), raw: head.readUInt32LE(s + 20), flags: head.readUInt32LE(s + 36) }); }
          const bytes = (va, n) => { const rva = va - IB, s = secs.find((x) => rva >= x.va && rva < x.va + x.size), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, rva - s.va + s.raw); return b; };
          const hex = (va, n) => bytes(va, n).toString("hex");
          const callTo = (va) => { const b = bytes(va, 5); return b[0] === 0xe8 ? va + 5 + b.readInt32LE(1) : -1; };
          const leaText = (va) => { const b = bytes(va, 7); if ((b[0] & 0xfb) !== 0x48 || b[1] !== 0x8d) return null; return bytes(va + 7 + b.readInt32LE(3), 96).toString("latin1").split("\0")[0]; };
          // Where a `cmp byte [rip+disp32],reg` (44 38 xx, 7 bytes) or a short jcc points.
          const ripOf = (va) => va + 7 + bytes(va, 7).readInt32LE(3);
          const shortTo = (va) => va + 2 + bytes(va, 2).readInt8(1);
          const jccTo = (va) => { const b = bytes(va, 6); return b[0] === 0x0f && (b[1] & 0xf0) === 0x80 ? va + 6 + b.readInt32LE(2) : -1; };
          const u64 = (va) => Number(bytes(va, 8).readBigUInt64LE(0));
          // The class a vtable belongs to, off the exe's own RTTI: [vtable-8] is its complete object locator (x64: signature
          // 1, its own RVA at +20), and the RVA at +12 its type descriptor, whose name starts at +16.
          const classOf = (vt) => { const col = u64(vt - 8), b = bytes(col, 24); return b.readUInt32LE(0) === 1 && IB + b.readUInt32LE(20) === col ? bytes(IB + b.readUInt32LE(12) + 16, 64).toString("latin1").split("\0")[0] : null; };
          // Every E8 call / E9 jmp into `target` across the code sections — "its only callers" is counted, not assumed.
          let text = null;
          const codeSecs = () => text || (text = secs.filter((s) => s.flags & 0x20000000).map((s) => ({ va: IB + s.va, b: bytes(IB + s.va, s.size) })));
          const codeRefsTo = (target) => {
            const out = [];
            for (const { va, b } of codeSecs()) for (let i = 0; i + 5 <= b.length; i++) if ((b[i] === 0xe8 || b[i] === 0xe9) && va + i + 5 + b.readInt32LE(i + 1) === target) out.push(va + i);
            return out;
          };
          // Every four bytes of code that can address `target` as a rip-relative operand: whatever the instruction's
          // encoding, a read, a write or a lea of `target` is one of these. Who says a string and who touches a global are
          // counted, not assumed. Returns where the displacement sits. `orWithImmediate` also takes one followed by one or four
          // bytes of immediate, a form that can store to a global; it also takes in some loads of the bytes just before `target`
          // (a movzx from the tail of the previous string is what first showed that), so it is no use for counting a string.
          const addressedAt = (target, orWithImmediate) => {
            const out = [];
            for (const { va, b } of codeSecs()) for (let i = 0; i + 4 <= b.length; i++) {
              const imm = target - (va + i + 4 + b.readInt32LE(i));
              if (imm === 0 || (orWithImmediate && (imm === 1 || imm === 4))) out.push(va + i);
            }
            return out;
          };
          // Every byte write of `target` by its short forms: C6 05 disp32 imm8 (mov byte), 88 /r disp32 (mov from a register)
          // and 0F 9x /r disp32 (setcc).
          const byteWrites = (target) => {
            const out = [];
            for (const { va, b } of codeSecs()) for (let i = 0; i + 7 <= b.length; i++) {
              const form = b[i] === 0xc6 && b[i + 1] === 0x05 ? [i + 2, 7] : b[i] === 0x88 && (b[i + 1] & 0xc7) === 0x05 ? [i + 2, 6] : b[i] === 0x0f && (b[i + 1] & 0xf0) === 0x90 && (b[i + 2] & 0xc7) === 0x05 ? [i + 3, 7] : null;
              if (form && va + i + form[1] + b.readInt32LE(form[0]) === target) out.push(va + i);
            }
            return out;
          };
          // A global no section holds bytes for starts as zero: the loader hands it zeroed memory.
          const onDisk = (va) => secs.some((s) => va - IB >= s.va && va - IB < s.va + s.size);
          const H = (n) => "0x" + n.toString(16).toUpperCase();
          // A function's bounds from the exe's own exception directory (.pdata), so the ranges below are read, not typed.
          const excRva = head.readUInt32LE(opt + 112 + 3 * 8), excSize = head.readUInt32LE(opt + 112 + 3 * 8 + 4);
          const pdata = bytes(IB + excRva, excSize);
          const fnOf = (va) => {
            const rva = va - IB; let lo = 0, hi = pdata.length / 12 - 1;
            while (lo <= hi) { const m = (lo + hi) >> 1, b = pdata.readUInt32LE(m * 12), e = pdata.readUInt32LE(m * 12 + 4); if (rva < b) hi = m - 1; else if (rva >= e) lo = m + 1; else return [IB + b, IB + e]; }
            return null;
          };
          const UNIT_READ = 0x140C5A350, UNIT_READ_END = 0x140C5B6A6;   // .pdata bounds of unit.cpp's reader
          const TF_FIND = 0x140DD3090, TF_FIND_END = 0x140DD35AD;       // .pdata bounds of taskforce.cpp's naval-base finder
          const ASSERT_SWITCH = 0x143695AA1, FAIL_LOAD = 0x140202130;
          rec("THE CONTROL: the bounds this section uses are the exe's own — both log lines sit in the reader 0x140C5A350..0x140C5B6A6 and the sea-access assert in the finder 0x140DD3090..0x140DD35AD (.pdata)",
            [0x140C5ABB8, 0x140C5ABD3, 0x140C5AB1F].every((a) => String(fnOf(a)) === String([UNIT_READ, UNIT_READ_END]))
              && String(fnOf(0x140DD3244)) === String([TF_FIND, TF_FIND_END]),
            { reader: (fnOf(0x140C5ABB8) || []).map(H), finder: (fnOf(0x140DD3244) || []).map(H) });
          rec("unit.cpp: a location id inside the province range whose lookup comes back null (no province behind it) is logged (\" has invalid location at province ID '\", 0x140C5ABB8) …",
            leaText(0x140C5ABB8) === " has invalid location at province ID '", leaText(0x140C5ABB8));
          rec("…\"'. Spawning at province ID=1.\" (0x140C5ABD3) …", leaText(0x140C5ABD3) === "'. Spawning at province ID=1.", leaText(0x140C5ABD3));
          rec("…and replaced with province 1 (0x140C5AB1F: mov edx,1; 0x140C5AB24: call [rax+8])", hex(0x140C5AB1F, 5) === "ba01000000" && hex(0x140C5AB24, 3) === "ff5008", [hex(0x140C5AB1F, 5), hex(0x140C5AB24, 3)]);
          // ⚠️ 1.19.3 named the two callers by the source path their asserts pass ("…\army.cpp", "…\taskforce.cpp"). 1.19.4
          // strips every path: the same instruction (0x140CEBE75, 0x140DDFADC) now points at an empty string. A message does
          // not replace it by itself: "No matching template!" is said by four functions (counted below). The exe's own RTTI
          // names the callers; a message counts as a name only where the image-wide scan finds nobody else saying it.
          rec("⭐ …in the one reader divisions and task forces both go through: army.cpp's call (0x140CEBD89, in the function whose own assert reads \"No matching template!\", 0x140CEBE7C) and taskforce.cpp's (0x140DDFDB7, beside its log line \" in task force \", 0x140DDF52B) — the source path 1.19.3 named them by (0x140CEBE75, 0x140DDFADC) is an empty string in 1.19.4",
            callTo(0x140CEBD89) === UNIT_READ && callTo(0x140DDFDB7) === UNIT_READ && !!fnOf(0x140CEBD89) && !!fnOf(0x140DDFDB7)
              && leaText(0x140CEBE7C) === "No matching template!" && String(fnOf(0x140CEBE7C)) === String(fnOf(0x140CEBD89))
              && leaText(0x140DDF52B) === " in task force " && String(fnOf(0x140DDF52B)) === String(fnOf(0x140DDFDB7))
              && leaText(0x140CEBE75) === "" && leaText(0x140DDFADC) === "",
            [H(callTo(0x140CEBD89)), H(callTo(0x140DDFDB7)), leaText(0x140CEBE7C), leaText(0x140DDF52B), leaText(0x140CEBE75), leaText(0x140DDFADC)]);
          const ARMY_READ = 0x140CEB2F0, TF_READ = 0x140DDF0B0, RAIL_READ = 0x140F02560;
          const READERS = [[".?AVCUnit@@", 0x1429D48F8, UNIT_READ], [".?AVCArmy@@", 0x1429DBBA8, ARMY_READ], [".?AVCTaskForce@@", 0x1429E4830, TF_READ], [".?AVCRailwayGun@@", 0x1429F3930, RAIL_READ]];
          rec("⭐⭐ THE NAMES ARE THE EXE'S OWN: slot 4 of the +10h vtable of CUnit, CArmy, CTaskForce and CRailwayGun is the reader 0x140C5A350 and the three functions that call it, 0x140CEB2F0, 0x140DDF0B0 and 0x140F02560 (RTTI)",
            READERS.every(([name, vt, fn]) => classOf(vt) === name && u64(vt + 4 * 8) === fn), READERS.map(([, vt]) => [classOf(vt), H(u64(vt + 4 * 8))]));
          const readCallers = codeRefsTo(UNIT_READ);
          rec("⭐⭐ …and their calls (0x140CEBD89, 0x140DDFDB7, 0x140F02A8A) are ALL the reader's direct callers, each inside its own class's function: an image-wide scan finds no other",
            readCallers.length === 3 && [[0x140CEBD89, ARMY_READ], [0x140DDFDB7, TF_READ], [0x140F02A8A, RAIL_READ]].every(([c, fn]) => readCallers.includes(c) && fnOf(c)[0] === fn), readCallers.map(H));
          const ripText = (va) => bytes(va, 96).toString("latin1").split("\0")[0];
          const saying = (va) => [...new Set(addressedAt(va).map((a) => fnOf(a)[0]))];
          const ARMY_ONLY = ripOf(0x140CEB77E), TF_ONLY = ripOf(0x140DDF52B), SHARED = ripOf(0x140CEBE7C);
          rec("⭐ a message names a function only when nothing else says it: \"Army refers to a non existing division template\" (0x140CEB77E, a movups) is the army reader's alone, \" in task force \" the task-force reader's alone",
            ripText(ARMY_ONLY) === "Army refers to a non existing division template" && String(saying(ARMY_ONLY)) === String([ARMY_READ])
              && ripText(TF_ONLY) === " in task force " && String(saying(TF_ONLY)) === String([TF_READ]),
            [ripText(ARMY_ONLY), saying(ARMY_ONLY).map(H), ripText(TF_ONLY), saying(TF_ONLY).map(H)]);
          rec("THE CONTROL: that count can come out above one: \"No matching template!\", which names nothing by itself, is addressed 7 times in 4 functions",
            ripText(SHARED) === "No matching template!" && addressedAt(SHARED).length === 7 && saying(SHARED).length === 4 && saying(SHARED).includes(ARMY_READ),
            [addressedAt(SHARED).map(H), saying(SHARED).map(H)]);
          // ── WHAT THE READER HANDS A UNIT TO. Its own "no land/sea test" is true and ends at its placement call.
          const PLACE = 0x140C5BE40, ARMY_PLACE = 0x140CED500, TF_PLACE = 0x140DE18A0, PROV_ADD = 0x140EEE570, RET_STUB = 0x1401540C0, GAMESTATE = 0x1433E3B30, SECOND_SWITCH = 0x143695AA0;
          rec("THE PLACEMENT: the reader's call (0x140C5AD0E call [rax+0E8h]) lands, by RTTI, in CUnit's and CRailwayGun's 0x140C5BE40 and in CArmy's 0x140CED500 and CTaskForce's 0x140DE18A0, which both call that base (0x140CED5DB, 0x140DE18BC)",
            hex(0x140C5AD0E, 6) === "ff90e8000000"
              && classOf(0x1429D4720) === ".?AVCUnit@@" && u64(0x1429D4720 + 0xE8) === PLACE
              && classOf(0x1429F3758) === ".?AVCRailwayGun@@" && u64(0x1429F3758 + 0xE8) === PLACE
              && classOf(0x1429DB9C8) === ".?AVCArmy@@" && u64(0x1429DB9C8 + 0xE8) === ARMY_PLACE && callTo(0x140CED5DB) === PLACE
              && classOf(0x1429E4650) === ".?AVCTaskForce@@" && u64(0x1429E4650 + 0xE8) === TF_PLACE && callTo(0x140DE18BC) === PLACE,
            [H(u64(0x1429D4720 + 0xE8)), H(u64(0x1429F3758 + 0xE8)), H(u64(0x1429DB9C8 + 0xE8)), H(u64(0x1429E4650 + 0xE8)), H(callTo(0x140CED5DB)), H(callTo(0x140DE18BC))]);
          const addCallers = codeRefsTo(PROV_ADD);
          rec("…which stores the location (0x140C5BFBB mov [rdi+1F0h],rbx) and, when there is one (0x140C5BFC2 test rbx,rbx), hands the unit to the province (0x140C5BFCD call 0x140EEE570, image-wide its only caller)",
            hex(0x140C5BFBB, 7) === "48899ff0010000" && hex(0x140C5BFC2, 3) === "4885db" && hex(0x140C5BFC5, 1) === "74"
              && callTo(0x140C5BFCD) === PROV_ADD && String(addCallers) === String([0x140C5BFCD]), [hex(0x140C5BFBB, 7), addCallers.map(H)]);
          // Slots 38h and 48h answer "am I this kind of unit": the unit itself (mov rax,rcx; ret) or null (xor eax,eax; ret).
          const SELF = "488bc1c3", NULL = "33c0c3";
          const answer = (vt, slot) => (hex(u64(vt + slot), 4) === SELF ? SELF : hex(u64(vt + slot), 3));
          const KINDS = [[0x1429D4720, NULL, NULL], [0x1429DB9C8, SELF, NULL], [0x1429E4650, NULL, SELF], [0x1429F3758, NULL, NULL]];
          rec("the province tells a division from a fleet by [unit+8] (0x140EEE658): 0 goes on to slot 38h (0x140EEE66A), which of the four classes only CArmy answers with itself; 1 (0x140EEE72E) ends at slot 48h (0x140EEE9F2), which only CTaskForce does",
            hex(0x140EEE658, 4) === "418b4608" && jccTo(0x140EEE65E) === 0x140EEE72E && hex(0x140EEE66A, 3) === "ff5038" && hex(0x140EEE72E, 3) === "83f801" && jccTo(0x140EEE731) === 0x140EEEAB6 && hex(0x140EEE9F2, 3) === "ff5048"
              && KINDS.every(([vt, s38, s48]) => answer(vt, 0x38) === s38 && answer(vt, 0x48) === s48),
            KINDS.map(([vt]) => [classOf(vt), answer(vt, 0x38), answer(vt, 0x48)]));
          rec("⭐⭐ a fleet's branch asks whether the province is LAND (0x140EEE737 mov rax,[rbp+0B8h]; 0x140EEE73E test byte [rax+0D2h],1, the bytes of the finder's test at 0x140DD31EA) and whether a table at [gamestate+698h] holds its id (0x140EEE74E call 0x140EF28D0, which reads [province+0A4h] at 0x140EF29DB and that table at 0x140EF29F0)",
            hex(0x140EEE737, 7) === "488b85b8000000" && hex(0x140EEE73E, 7) === hex(0x140DD31EA, 7) && hex(0x140EEE73E, 7) === "f680d200000001"
              && callTo(0x140EEE74E) === 0x140EF28D0 && hex(0x140EEE753, 2) === "84c0" && hex(0x140EF29DB, 7) === "448b87a4000000" && hex(0x140EF29F0, 7) === "4c8b8898060000",
            [hex(0x140EEE73E, 7), H(callTo(0x140EEE74E)), hex(0x140EF29DB, 7), hex(0x140EF29F0, 7)]);
          rec("⭐⭐ …and on land with no entry, unless a save is loading (0x140EEE85A loads the gamestate; 0x140EEE861 cmp byte [rax+0A35h],r15b), it asserts \"Trying to move navy to land province with no port!\" (0x140EEE8B1), behind a second switch (0x140EEE86E cmp byte [0x143695AA0],r15b; 0x140EEE875 je over the assert call 0x140EEE8B8)",
            hex(0x140EEE85A, 3) === "488b05" && ripOf(0x140EEE85A) === GAMESTATE && hex(0x140EEE861, 7) === "4438b8350a0000"
              && hex(0x140EEE86E, 3) === "44383d" && ripOf(0x140EEE86E) === SECOND_SWITCH && hex(0x140EEE875, 1) === "74" && shortTo(0x140EEE875) === 0x140EEE8CE && shortTo(0x140EEE875) > 0x140EEE8B8
              && leaText(0x140EEE8B1) === "Trying to move navy to land province with no port!" && callTo(0x140EEE8B8) === callTo(0x140DD324B),
            [H(ripOf(0x140EEE85A)), hex(0x140EEE861, 7), H(ripOf(0x140EEE86E)), H(shortTo(0x140EEE875)), leaText(0x140EEE8B1), H(callTo(0x140EEE8B8))]);
          const OPTION_PARSER = 0x140126650;
          const secondWrites = byteWrites(SECOND_SWITCH);
          rec("THE CONTROL: that second switch starts clear, as the first does, and a normal launch leaves it so: it has no bytes on disk, and every write that can set it is in the option parser 0x140126650, bar the console command that flips both switches (\"Asserts(and smoothing) are now turned off.\", 0x140260FED; 0x140261015 sete al; 0x140261018 and 0x14026101E)",
            !onDisk(SECOND_SWITCH) && !onDisk(ASSERT_SWITCH) && secondWrites.length === 9
              && secondWrites.every((a) => (hex(a, 2) === "c605" ? bytes(a, 7)[6] === 0 || fnOf(a)[0] === OPTION_PARSER : a === 0x140261018))
              && leaText(0x140260FED) === "Asserts(and smoothing) are now turned off." && hex(0x140261015, 3) === "0f94c0" && hex(0x14026101E, 2) === "8805" && 0x14026101E + 6 + bytes(0x14026101E, 6).readInt32LE(2) === ASSERT_SWITCH,
            secondWrites.map((a) => [H(a), hex(a, 2), H(fnOf(a)[0])]));
          rec("⭐⭐ …then logs it (0x140EEE8F0 the log entry; 0x140EEE8F6 \"Trying to move navy to land province with no port: \"; 0x140EEE907 [province+0A4h], the id; 0x140EEE918 \" (\"; 0x140EEE92D the unit's name, slot 68h; 0x140EEE93E \")\")",
            callTo(0x140EEE8CE) === 0x14254F4B0 && callTo(0x140EEE8F0) === 0x14254FD50 && leaText(0x140EEE8F6) === "Trying to move navy to land province with no port: " && hex(0x140EEE907, 6) === "8b95a4000000"
              && leaText(0x140EEE918) === " (" && hex(0x140EEE92D, 3) === "ff5268" && leaText(0x140EEE93E) === ")",
            [H(callTo(0x140EEE8F0)), leaText(0x140EEE8F6), hex(0x140EEE907, 6), leaText(0x140EEE918), leaText(0x140EEE93E)]);
          rec("⭐⭐⭐ …AND ADDS THE FLEET ANYWAY: a sea province (0x140EEE745), an entry in the table (0x140EEE755), a save loading (0x140EEE868) and the end of the log (0x140EEE9EB nop, its two short branches 0x140EEE98B and 0x140EEE999 staying inside it) all reach the one append 0x140EEE9EC",
            jccTo(0x140EEE745) === 0x140EEE9EC && jccTo(0x140EEE755) === 0x140EEE9EC && jccTo(0x140EEE868) === 0x140EEE9EC
              && shortTo(0x140EEE98B) === 0x140EEE9AC && shortTo(0x140EEE999) === 0x140EEE9AC && hex(0x140EEE9EB, 1) === "90" && hex(0x140EEE9EC, 3) === "498b06",
            [H(jccTo(0x140EEE745)), H(jccTo(0x140EEE755)), H(jccTo(0x140EEE868)), H(shortTo(0x140EEE98B)), H(shortTo(0x140EEE999)), hex(0x140EEE9EB, 4)]);
          const [addFrom, addTo] = fnOf(PROV_ADD), addBody = bytes(addFrom, addTo - addFrom), landReads = [];
          for (let i = addBody.indexOf("f680d200000001", 0, "hex"); i !== -1; i = addBody.indexOf("f680d200000001", i + 1, "hex")) landReads.push(addFrom + i);
          rec("⭐ …and a division's branch has no such test: 0x140EEE73E is the only read of the land bit in the whole of 0x140EEE570, and it stands on the fleet's side",
            String(landReads) === String([0x140EEE73E]) && 0x140EEE73E > 0x140EEE72E, landReads.map(H));
          rec("⭐ CTaskForce's own two reads of that bit (0x140DE18CD, 0x140DE18FA) come after the base has placed the fleet (0x140DE18BC) and lead only to a `ret 0` (0x140DE18E9, 0x140DE1916 call 0x1401540C0): they neither refuse nor move it",
            0x140DE18BC < 0x140DE18CD && hex(0x140DE18CD, 7) === "f680d200000001" && hex(0x140DE18FA, 7) === "f680d200000001"
              && callTo(0x140DE18E9) === RET_STUB && callTo(0x140DE1916) === RET_STUB && hex(RET_STUB, 3) === "c20000",
            [hex(0x140DE18CD, 7), hex(0x140DE18FA, 7), H(callTo(0x140DE18E9)), H(callTo(0x140DE1916)), hex(RET_STUB, 3)]);
          // ── AND WHERE THOSE LINES GO. The log entry's flag word picks a file. A normal launch has no file for this word.
          const LOG_ENTRY = 0x14254FD50, FLAG_WORD = "c744242004000100", DEBUG_BYTE = 0x1433E3519, CHANNEL_ADD = 0x14228E490, FILTER_VT = 0x142BB6328, FALLBACK = 0x143506480;
          const LINES = [[0x140C5AB2F, 0x140C5AB4A], [0x140C5AC6B, 0x140C5AC86], [0x140C5AD1E, 0x140C5AD39], [0x140EEE8D3, 0x140EEE8F0], [0x141718014, 0x141718033]];
          rec("⚠️ every line above carries the log flag word 0x10004 (mov dword [rsp+20h],10004h, the log entry's fifth argument): the reader's three (0x140C5AB2F, 0x140C5AC6B, 0x140C5AD1E), the fleet's (0x140EEE8D3) and mapbuildings' (0x141718014)",
            LINES.every(([flag, call]) => hex(flag, 8) === FLAG_WORD && callTo(call) === LOG_ENTRY), LINES.map(([flag, call]) => [hex(flag, 8), H(callTo(call))]));
          rec("⚠️ the logger is a table from flag word to file: the start-up installs a CFilterLogger (0x140123F51 its constructor, which stores the vtable 0x142BB6328; 0x140125BD2 hands it to 0x142550050, the setter of the global the log calls read), and its slot 1, 0x14228E230, looks the word up (0x14228E255)",
            callTo(0x140123F51) === 0x14228E0B0 && hex(0x140123F56, 4) === "48894530" && ripOf(0x14228E0BE) === FILTER_VT && classOf(FILTER_VT) === ".?AVCFilterLogger@@" && u64(FILTER_VT + 8) === 0x14228E230
              && hex(0x140125BCE, 4) === "488b4d30" && callTo(0x140125BD2) === 0x142550050 && hex(0x142550057, 3) === "48890d" && ripOf(0x142550057) === 0x143695AF8 && hex(0x14254F4BC, 3) === "488b05" && ripOf(0x14254F4BC) === 0x143695AF8
              && hex(0x14228E255, 3) === "4c8b15" && ripOf(0x14228E255) === 0x143506478,
            [H(callTo(0x140123F51)), H(ripOf(0x14228E0BE)), classOf(FILTER_VT), H(u64(FILTER_VT + 8)), H(callTo(0x140125BD2)), H(ripOf(0x142550057)), H(ripOf(0x14228E255))]);
          const wholeExe = fs.readFileSync(EXE);
          const fallbackAt = addressedAt(FALLBACK, true), fallbackPtr = Buffer.alloc(8); fallbackPtr.writeBigUInt64LE(BigInt(FALLBACK));
          rec("⚠️ …and a word with no entry is dropped: it falls to [0x143506480], null-tested (0x14228E446, 0x14228E449 je out), a slot nothing fills: it has no bytes on disk, no pointer to it stands anywhere in the file, and all that addresses it in the code is three `mov rcx,[..]` reads",
            hex(0x14228E43F, 3) === "488b0d" && ripOf(0x14228E43F) === FALLBACK && hex(0x14228E446, 3) === "4885c9" && shortTo(0x14228E449) === 0x14228E45F
              && !onDisk(FALLBACK) && wholeExe.indexOf(fallbackPtr) === -1 && fallbackAt.length === 3 && fallbackAt.every((a) => hex(a - 3, 3) === "488b0d"),
            fallbackAt.map((a) => [H(a), hex(a - 3, 3)]));
          const channelCalls = codeRefsTo(CHANNEL_ADD), wordAdded = channelCalls.filter((a) => hex(a - 5, 5) === "b904000100");
          rec("⭐⭐⭐ 0x10004 gets its entry once, image-wide (0x140125B36, of the 24 calls of the table's adder 0x14228E490, each naming its word just before the call), for the file 0x1000 writes ([rbp+0B0h], 0x140125B2A), and only behind the debug byte: 0x140125AEB cmp byte [0x1433E3519],0; 0x140125AF2 je 0x140125B5C, past it",
            channelCalls.length === 24 && channelCalls.every((a) => hex(a - 5, 1) === "b9") && String(wordAdded) === String([0x140125B36]) && hex(0x140125B2A, 7) === "488b95b0000000"
              && hex(0x140125AEB, 2) === "803d" && 0x140125AEB + 7 + bytes(0x140125AEB, 7).readInt32LE(2) === DEBUG_BYTE && hex(0x140125AF2, 1) === "74" && shortTo(0x140125AF2) === 0x140125B5C && 0x140125B36 < 0x140125B5C,
            [channelCalls.length, wordAdded.map(H), hex(0x140125B2A, 7), H(0x140125AEB + 7 + bytes(0x140125AEB, 7).readInt32LE(2)), H(shortTo(0x140125AF2))]);
          rec("THE CONTROL: 0x1000, the word error.log's lines do carry on a normal launch, gets its entry ahead of that gate (0x14012595D mov ecx,1000h; 0x140125962), with that same file (0x140125956), the one the set-up opens as \"error\" (0x140124A5C) and keeps at [rbp+0B0h] (0x140124AF3)",
            hex(0x140125956, 7) === "488b95b0000000" && hex(0x14012595D, 5) === "b900100000" && callTo(0x140125962) === CHANNEL_ADD && 0x140125962 < 0x140125AEB
              && leaText(0x140124A5C) === "error" && hex(0x140124AF3, 7) === "488985b0000000" && 0x140124AF3 < 0x140125956,
            [hex(0x140125956, 7), hex(0x14012595D, 5), H(callTo(0x140125962)), leaText(0x140124A5C), hex(0x140124AF3, 7)]);
          const WORD_1000_LINES = [[0x14056F864, 0x14056F87C, 0x14056F881, "Strategic location for province %d is in wrong state scope."], [0x140EF5D7A, 0x140EF5D92, 0x140EF5DAF, "Building: %s did not exist or is invalid in the province: %d"]];
          rec("THE CONTROL: the two kinds of line a launch recorded WITHOUT -debug did write (2026-09-16, map-data.js #a-strategic-location-the-game-refuses) go out on that word, through the printf-style log entry 0x14254EBC0: 0x14056F864 mov r9d,1000h, 0x14056F87C, 0x14056F881 and 0x140EF5D7A, 0x140EF5D92, 0x140EF5DAF",
            WORD_1000_LINES.every(([word, entry, say, text]) => hex(word, 6) === "41b900100000" && callTo(entry) === 0x14254EBC0 && leaText(say) === text),
            WORD_1000_LINES.map(([word, entry, say]) => [hex(word, 6), H(callTo(entry)), leaText(say)]));
          const debugWrites = byteWrites(DEBUG_BYTE);
          rec("⭐⭐⭐ and at launch only -debug and -crash_data_log set that byte: it is zero on disk, and of its only writes image-wide two are the option parser's (0x140127D23, after \"crash_data_log\", 0x140127D07; 0x140127D5D, after \"debug\", 0x140127D48), and the parser runs before the log set-up (0x140128859, 0x140128973). The third, the console command that says \"Debug mode turned …\" (0x14026422E sete; 0x14026426D), comes after the entry is decided. `--debug_mode`, which the owner's launches pass, is no such option: that string occurs nowhere in the file",
            wholeExe.indexOf("debug_mode") === -1 && bytes(DEBUG_BYTE, 1)[0] === 0 && String(debugWrites) === String([0x140127D23, 0x140127D5D, 0x14026422E]) && bytes(0x140127D23, 7)[6] === 1 && bytes(0x140127D5D, 7)[6] === 1
              && fnOf(0x140127D23)[0] === OPTION_PARSER && fnOf(0x140127D5D)[0] === OPTION_PARSER
              && leaText(0x140127D07) === "crash_data_log" && leaText(0x140127D48) === "debug"
              && callTo(0x140128859) === OPTION_PARSER && callTo(0x140128973) === 0x140123EE0 && 0x140128859 < 0x140128973 && hex(0x14026422E, 3) === "0f9405" && hex(0x14026426D, 3) === "0f1005" && ripText(ripOf(0x14026426D)) === "Debug mode turned ",
            [bytes(DEBUG_BYTE, 1)[0], debugWrites.map(H), leaText(0x140127D07), leaText(0x140127D48), H(callTo(0x140128859)), H(callTo(0x140128973))]);
          rec("taskforce.cpp tests the location's land bit (0x140DD31EA) and reads its port sea zone [+0C8h] (0x140DD31F7)",
            hex(0x140DD31EA, 7) === "f680d200000001" && hex(0x140DD31F7, 6) === "8b90c8000000", [hex(0x140DD31EA, 7), hex(0x140DD31F7, 6)]);
          rec("…the zone mapbuildings.cpp stores from a port row (0x141717FFF: mov [rax+0C8h],r8d), which logs \" port building has invalid sea zone for province \" when it is not positive (0x141718054)",
            hex(0x141717FFF, 7) === "448980c8000000" && leaText(0x141718054) === " port building has invalid sea zone for province ",
            [hex(0x141717FFF, 7), leaText(0x141718054)]);
          rec("…with none it asserts \"Current location is a land province without sea access\" (0x140DD3244) …",
            leaText(0x140DD3244) === "!\"Current location is a land province without sea access\"", leaText(0x140DD3244));
          // The je is DERIVED as the instruction straight after the 7-byte cmp, and must jump over the assert call: pinned
          // only by opcode and target, the je at 0x140DD325E (after the call) passed too.
          const GATE = 0x140DD3201, GATE_JE = GATE + 7, GATE_CALL = 0x140DD324B;
          rec("…only behind the assert switch (0x140DD3201: cmp byte [0x143695AA1],r13b; the je straight after it, 0x140DD3208, jumps over the assert call at 0x140DD324B), then returns null (0x140DD3261: xor eax,eax)",
            hex(GATE, 3) === "44382d" && ripOf(GATE) === ASSERT_SWITCH && hex(GATE_JE, 1) === "74"
              && GATE_JE < GATE_CALL && shortTo(GATE_JE) > GATE_CALL && callTo(GATE_CALL) > 0
              && shortTo(GATE_JE) === 0x140DD3261 && hex(0x140DD3261, 2) === "33c0",
            [hex(GATE, 7), H(ripOf(GATE)), H(GATE_JE), H(shortTo(GATE_JE)), H(callTo(GATE_CALL)), hex(0x140DD3261, 2)]);
          rec("THE CONTROL: that byte IS the assert switch — the same function gates its \"pNavalLocation != nullptr\" assert on it (0x140DD327E, 0x140DD32C9), through the same assert handler (0x140DD324B, 0x140DD32D0)",
            hex(0x140DD327E, 3) === "44382d" && ripOf(0x140DD327E) === ASSERT_SWITCH && leaText(0x140DD32C9) === "pNavalLocation != nullptr"
              && callTo(0x140DD324B) > 0 && callTo(0x140DD324B) === callTo(0x140DD32D0),
            [H(ripOf(0x140DD327E)), leaText(0x140DD32C9), H(callTo(0x140DD324B)), H(callTo(0x140DD32D0))]);
          for (const [call, test] of [[0x140DDC568, 0x140DDC575], [0x140DDE28D, 0x140DDE2A1], [0x140DE12DC, 0x140DE12E4]]) {
            rec(`…and its caller at 0x${call.toString(16).toUpperCase()} tests the result for null (test rax,rax at 0x${test.toString(16).toUpperCase()})`,
              callTo(call) === TF_FIND && hex(test, 3) === "4885c0", [callTo(call).toString(16), hex(test, 3)]);
          }
          const tfCallers = codeRefsTo(TF_FIND);
          rec("⭐⭐ …and those three are ALL its direct callers: an image-wide scan of every call and jmp finds no other",
            tfCallers.length === 3 && [0x140DDC568, 0x140DDE28D, 0x140DE12DC].every((a) => tfCallers.includes(a)), tfCallers.map(H));
          const failCallers = codeRefsTo(FAIL_LOAD);
          rec("⭐⭐ neither path can fail the load: the failed-load routine 0x140202130 (it clears the map's good-state byte, 0x140202140) has exactly two callers image-wide — the map check 0x1401E4A42 and strategicair 0x140CB965F — and neither is in the unit reader or the naval-base finder",
            hex(0x140202140, 7) === "c6817909000000" && failCallers.length === 2 && failCallers.includes(0x1401E4A42) && failCallers.includes(0x140CB965F)
              && failCallers.every((a) => !(a >= UNIT_READ && a < UNIT_READ_END) && !(a >= TF_FIND && a < TF_FIND_END)),
            { byte: hex(0x140202140, 7), callers: failCallers.map(H) });
        } finally { fs.closeSync(fd); }
      }
    }

    console.log("\n=== 1. an add-on that takes a port's sea away and drowns a division's province ===");
    const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-units-game-")); tmps.push(game);
    writeGame(game);
    {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-units-mod-")); tmps.push(mod);
      mk(mod, "descriptor.mod", 'name="Units stranded"\n');
      // 13-15 become land (province 10 loses the only sea beside it, 14), 4 becomes sea (the division's province). 16 stays sea.
      mk(mod, "map/definition.csv", definition((p) => (p === 4 || p === 16 ? "sea" : "land")));
      const probs = md.validateMapBitmap({ modRoot: mod, gameRoot: game, dependencyRoots: [] }) || [];
      const fleet = probs.filter((p) => p.rule === FLEET);
      const div = probs.filter((p) => p.rule === DIV);
      const fmsg = String((fleet[0] || {}).message || ""), dmsg = String((div[0] || {}).message || "");
      rec("⭐⭐⭐ the fleet started on land with no sea left is reported", fleet.length === 1, probs.map((p) => p.rule));
      rec("⭐⭐ …naming the task force, its province and its file", /Bay Squadron/.test(fmsg) && /\b10\b/.test(fmsg) && /AAA_naval\.txt/.test(fmsg), fmsg);
      rec("⭐⭐ …both DLC branches' files, since either may be the one started", (fleet[0] && (fleet[0].items || []).some((i) => /AAA_naval_legacy\.txt/.test(i.file))), fleet[0] && fleet[0].items);
      // ⚓ MOVED 2026-09-24 with #a-coastless-navy-goes-to-sea: these said WARNING and "no crash promised", which was right
      // while Auto-fix could not repair every such fleet — a Save gate with no button strands the modder. It now can (a
      // harbour, or the nearest sea for a country with no coast), so the rule is an error in the FATAL set, "crashes", on
      // the evidence it states: eleven launches died on one, and the same world without them loaded.
      rec("⭐⭐ …as an ERROR in the FATAL set, now that Auto-fix can move every one", !!fleet[0] && fleet[0].severity === "error" && labels.isFatalRule(FLEET) === true && labels.fatalOutcome(FLEET) === "crashes", fleet[0] && fleet[0].severity);
      rec("⭐ …saying what the launches SHOWED, as evidence rather than a promise", /has crashed while loading on every fleet like this so far/.test(fmsg) && !/will crash/i.test(fmsg), fmsg);
      rec("⭐⭐ …and offering Auto-fix for it", !!fleet[0] && fleet[0].autoFix === true, fleet[0] && { autoFix: fleet[0].autoFix, movable: fleet[0].movable });
      rec("⭐⭐⭐ the division started on a province that became water is reported", div.length === 1, probs.map((p) => p.rule));
      rec("⭐⭐ …naming it, its province and its file", /Coast Guard/.test(dmsg) && /\b4\b/.test(dmsg) && /AAA_1936\.txt/.test(dmsg), dmsg);
      rec("⭐⭐ …as a WARNING, outside the FATAL set", !!div[0] && div[0].severity === "warning" && labels.isFatalRule(DIV) === false, div[0] && div[0].severity);
      rec("⭐ …without promising a crash", !!div[0] && !/crash/i.test(dmsg), dmsg);
      const all = JSON.stringify([fleet, div]);
      rec("THE CONTROL: a task force already on land with no sea in the base (Old Hulk, 6) is not the add-on's", !/Old Hulk/.test(all), all.slice(0, 300));
      rec("THE CONTROL: a division on land in both (Home Guard, 2) is not reported", !/Home Guard/.test(all));
      rec("THE CONTROL: a division already at sea in the base (Sailors, 16) is not the add-on's", !/Sailors/.test(all));
      rec("⭐⭐ THE CONTROL: an order of battle no country starts is never read (AAA_unused.txt, and the commented-out oob line)", !/Ghost|Never Started|AAA_unused/.test(all));
      rec("⭐ THE CONTROL: a country that owns no state starts nothing (CCC_1936.txt)", !/Exile Brigade|CCC_1936/.test(all));
      rec("both rules have a label", !!labels.LABELS[FLEET] && !!labels.LABELS[DIV], [labels.LABELS[FLEET], labels.LABELS[DIV]]);

      // ⭐⭐⭐ #the-fleet-half-never-adopted-what-the-division-half-has — THE TWO TWINS ARE HELD TO THE SAME SHAPE.
      //
      // Both are pushed from one `findUnitsStrandedByTheMap` result, forty lines apart. The division half counted
      // itself (`total` + `totalNoun`), gave its denominator, said whose order-of-battle files these are and declined
      // Auto-fix; the fleet half did none of it, so on the owner's rebuilt world map-rule-labels' problemScale — which
      // reads `total` and NEVER an array length — silently dropped 246 fleets from the summary and ranked them at 0.
      // Asserted for BOTH rules out of one loop, so neither half can be given something the other is not.
      const stranded = md.findUnitsStrandedByTheMap({ modRoot: mod, gameRoot: game, dependencyRoots: [] });
      const real = { [FLEET]: stranded.fleets.length, [DIV]: stranded.divisions.length };
      for (const [rule, p] of [[FLEET, fleet[0]], [DIV, div[0]]]) {
        const msg = String((p || {}).message || "");
        rec(`⭐⭐⭐ '${rule}' counts itself — total is the population, not the capped list`,
          !!p && p.total === real[rule] && real[rule] > 0, { total: p && p.total, real: real[rule], items: p && (p.items || []).length });
        rec(`⭐⭐ …with a noun, so map-rule-labels can add it to the summary`,
          !!p && typeof p.totalNoun === "string" && p.totalNoun.length > 2, p && p.totalNoun);
        rec(`⭐⭐ …and THE CONSUMER sees it: problemScale reports ${real[rule]}`,
          (labels.problemScale(p) || {}).n === real[rule], labels.problemScale(p));
        rec(`⭐⭐ '${rule}' says whose order-of-battle files these are`,
          /not your mod's/.test(msg) && /the base game supplies/.test(msg), msg.slice(-420));
        // ⚠️ This required "Auto-fix leaves them alone" and `autoFix === false`, which was true while both
        // repairs declined any file the mod did not already ship. That scope fixed 0 of 2,563 divisions and
        // 0 of 426 fleets on a world built by Nova's OWN flow, where every order-of-battle file is inherited.
        // Both were widened on 2026-09-24 to copy the file in — so what the message owes the modder is no
        // longer an explanation of a refusal but the COST, named before the click.
        //
        // ⭐ AND THE INVARIANT IS CONDITIONAL, not a blanket "there is now a button". A unit whose country
        // owns no land (or, for a fleet, no harbour) still cannot be moved anywhere honest, and must still
        // get no button. Demanding `autoFix === true` for every rule in this loop failed on exactly that
        // case — which is the affordance doing its job, not a regression.
        rec(`⭐⭐ …and the button follows what Nova can actually move (${p && p.movable} of ${p && p.total})`,
          !!p && (p.movable > 0
            ? p.autoFix === true && /frozen at this build of the game/.test(msg)
            : p.autoFix === false),
          { autoFix: p && p.autoFix, movable: p && p.movable, total: p && p.total });
      }
      rec("⭐⭐ the fleet warning gives its denominator, the way the division one does",
        !!fleet[0] && fleet[0].startedFleets >= fleet[0].total && new RegExp(`${fleet[0].total} of the ${fleet[0].startedFleets} fleet`).test(fmsg),
        [fleet[0] && fleet[0].total, fleet[0] && fleet[0].startedFleets, fmsg.slice(0, 90)]);
      // Derived from the fixture on disk, not typed: both DLC branches of AAA's naval oob are started, and the
      // denominator must count every task force in them — the inherited ones included, since the mod ships none.
      const startedOob = ["AAA_naval.txt", "AAA_naval_legacy.txt"]
        .reduce((n, f) => n + (fs.readFileSync(path.join(game, "history", "units", f), "utf8").match(/task_force\s*=\s*\{/g) || []).length, 0);
      rec("⭐ …and every task force the started orders of battle hold is counted in it, inherited ones included",
        !!fleet[0] && fleet[0].startedFleets === startedOob && startedOob > fleet[0].total,
        [fleet[0] && fleet[0].startedFleets, startedOob]);
      rec("⭐⭐ the summary clause names both, biggest first",
        /divisions?/.test(labels.scaleClause(probs)) && /fleets?/.test(labels.scaleClause(probs)), labels.scaleClause(probs));
    }

    console.log("\n=== 1b. …and when the order of battle IS the mod's own, it says so instead ===");
    {
      const own = fs.mkdtempSync(path.join(os.tmpdir(), "nova-units-own-")); tmps.push(own);
      mk(own, "descriptor.mod", 'name="Units mine"\n');
      mk(own, "map/definition.csv", definition((p) => (p === 4 || p === 16 ? "sea" : "land")));
      // A history/units file in the mod REPLACES the same-named one below it, so this one is the one read.
      mk(own, "history/units/AAA_naval.txt", fs.readFileSync(path.join(game, "history", "units", "AAA_naval.txt")));
      const p = (md.validateMapBitmap({ modRoot: own, gameRoot: game, dependencyRoots: [] }) || []).find((x) => x.rule === FLEET);
      const m = String((p || {}).message || "");
      rec("⭐⭐⭐ the file the mod ships is named as the mod's own",
        /history\/units\/AAA_naval\.txt/.test(m) && /your mod's own/.test(m), m.slice(-420));
      rec("⭐ …while the ones it does not ship are still named as inherited", /not your mod's/.test(m), m.slice(-420));
    }

    console.log("\n=== 2. THE CONTROL: an add-on that changes no province's land or sea ===");
    {
      const same = fs.mkdtempSync(path.join(os.tmpdir(), "nova-units-same-")); tmps.push(same);
      mk(same, "descriptor.mod", 'name="Units verbatim"\n');
      mk(same, "map/definition.csv", fs.readFileSync(path.join(game, "map", "definition.csv")));
      const p2 = (md.validateMapBitmap({ modRoot: same, gameRoot: game, dependencyRoots: [] }) || []).filter((p) => p.rule === FLEET || p.rule === DIV);
      rec("nothing is reported", p2.length === 0, p2);
    }

    console.log("\n=== 3. the owner's nova_torture_0917 over the installed base game (read-only) ===");
    {
      const TORTURE = path.join(os.homedir(), "OneDrive", "Documents", "Paradox Interactive", "Hearts of Iron IV", "mod", "nova_torture_0917");
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      if (!fs.existsSync(path.join(TORTURE, "map", "definition.csv")) || !fs.existsSync(path.join(VAN, "history", "units", "ENG_1936_Naval.txt"))) {
        skip("nova_torture_0917 or the base game is not installed here — the real case did NOT run");
      } else {
        const snap = () => { const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { const s = fs.statSync(p); out.push(`${p}|${s.size}|${s.mtimeMs}`); } } }; walk(TORTURE); return out.sort().join("\n"); };
        const before = snap();
        const real = md.validateMapBitmap({ modRoot: TORTURE, gameRoot: VAN, dependencyRoots: [] }) || [];
        rec("THE CONTROL: validating it wrote nothing into the owner's mod", snap() === before);
        const f = real.find((p) => p.rule === FLEET), d = real.find((p) => p.rule === DIV);
        const items = (f && f.items) || [];
        rec("⭐⭐⭐ Rosyth's fleet is reported at 6300", items.some((i) => i.province === 6300 && /Rosyth/.test(i.name)), items.slice(0, 6));
        rec("…from the four ENG naval files that start it", ["ENG_1936_Naval.txt", "ENG_1936_Naval_Legacy.txt", "ENG_1939_Naval.txt", "ENG_1939_Naval_Legacy.txt"].every((fn) => items.some((i) => i.file === fn && i.province === 6300)), items.map((i) => i.file));
        rec("…and nothing else of vanilla's 664 started task forces", items.every((i) => i.province === 6300), items.filter((i) => i.province !== 6300).slice(0, 6));
        const ditems = (d && d.items) || [];
        rec("⭐⭐ Basrah's division (IRQ_1939.txt, 2089) is reported", ditems.some((i) => i.province === 2089 && i.file === "IRQ_1939.txt"), ditems.slice(0, 6));
        rec("…and nothing else", ditems.every((i) => i.province === 2089), ditems.filter((i) => i.province !== 2089).slice(0, 6));
      }
    }

    console.log("\n=== 4. THROUGH THE CLIENT'S OWN CALLS: the editor's tools take the sea and the land away, and the Save's re-check says so ===");
    {
      // The base game is a fixture: HOI4_ROOT must name a folder holding hoi4.exe, so give it one (an empty file).
      const base = fs.mkdtempSync(path.join(os.tmpdir(), "nova-units-base-")); tmps.push(base);
      writeGame(base, { coastGuardAt: 12 });
      mk(base, "hoi4.exe", "");
      process.env.HOI4_ROOT = base;
      const MOD = path.join(MODS, "unitsaddon");
      mk(MOD, "descriptor.mod", 'name="Units addon"\nsupported_version="1.19.*"\n');
      const { createApp } = require("./server.js");
      const PORT = 54100 + Math.floor(Math.random() * 100);
      const server = await new Promise((resolve) => { const s = createApp().listen(PORT, () => resolve(s)); });
      try {
        const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
        // What the Save loop sends for the Province inspector's type change (terrain already swapped off ocean) and the Erase brush.
        const r1 = await post("/api/map/set-province-terrain", { modPath: MOD, provinceId: 14, terrain: "plains", type: "land", coastal: false });
        rec("THE CONTROL: turning sea 14 into land was accepted", r1.s === 200 && r1.b.ok === true, r1);
        const r2 = await post("/api/map/flip-province-sea", { modPath: MOD, provinceId: 12 });
        rec("THE CONTROL: erasing coastal 12 to sea was accepted", r2.s === 200 && r2.b.ok === true, r2);
        const v = await fetch(`http://127.0.0.1:${PORT}/api/map/validate?modPath=${encodeURIComponent(MOD)}`).then((r) => r.json());
        rec("THE CONTROL: the re-check answered", !!v && v.ok === true, v);
        const pf = ((v && v.problems) || []).find((p) => p.rule === FLEET), pd = ((v && v.problems) || []).find((p) => p.rule === DIV);
        rec("⭐⭐⭐ the validate the Save runs names the fleet the new land stranded (Bay Squadron, 10)", !!pf && /Bay Squadron/.test(pf.message) && /\b10\b/.test(pf.message), pf || (v.problems || []).map((p) => p.rule));
        rec("⭐⭐⭐ …and the division the erase drowned (Coast Guard, 12)", !!pd && /Coast Guard/.test(pd.message) && /\b12\b/.test(pd.message), pd || (v.problems || []).map((p) => p.rule));
        // Moved with #a-coastless-navy-goes-to-sea: the fleet is an error now (FATAL, "crashes"); the division stays a warning.
        rec("…the fleet counted as an error and the division as a warning", !!pf && !!pd && pf.severity === "error" && pd.severity === "warning" && v.errors >= 1 && v.warnings >= 1, v && { errors: v.errors, warnings: v.warnings });
        // The Map Errors popup the modder opens from that line — the real function, lifted from public/map.js.
        const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
        const s = MAP.indexOf("function openMapErrorsModal("), e = s < 0 ? -1 : MAP.indexOf("\n  }", s);
        rec("THE CONTROL: openMapErrorsModal was found in public/map.js", s >= 0 && e > s);
        if (s >= 0 && e > s) {
          const overlays = [];
          const el = () => ({ style: {}, value: "", disabled: false, textContent: "", innerHTML: "", title: "", dataset: {},
            addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, remove() {}, appendChild() {}, querySelector: () => el(), querySelectorAll: () => [] });
          const sandbox = {
            console, JSON, encodeURIComponent,
            window: { NovaMapRuleLabels: labels },
            document: { getElementById: () => null, createElement: () => { const o = el(); overlays.push(o); return o; }, body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
            setTimeout: () => 0, statusEl: { style: {} }, setStatus() {}, modPath: () => MOD,
            escHtml: (x) => String(x == null ? "" : x), hasPendingMapEdits: () => false, fetch: async () => ({ json: async () => ({}) }),
          };
          sandbox.globalThis = sandbox;
          vm.createContext(sandbox);
          try {
            vm.runInContext(`${MAP.slice(s, e + 4)}\nglobalThis.__open = openMapErrorsModal;`, sandbox);
            sandbox.__open(v);
          } catch (err) { rec("the popup ran", false, String(err && err.message)); }
          const html = overlays.map((o) => o.innerHTML).join("\n");
          rec("⭐⭐ the Map Errors popup lists the stranded fleet", /Bay Squadron/.test(html), html.slice(0, 200));
          rec("⭐⭐ …and the drowned division", /Coast Guard/.test(html), html.slice(0, 200));
        }
      } finally { await new Promise((resolve) => server.close(() => resolve())); }
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\n=== a unit that starts where the map took its sea or land away is reported: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
  if (fails.length) fails.forEach((x) => console.log("   FAILED: " + x));
  process.exit(fails.length ? 1 : 0);
})();
