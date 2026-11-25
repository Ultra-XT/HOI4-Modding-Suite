// Auto-fix leaves a province building on a lake its own state lists: HOI4 sets it, and no rule reports it.
// #a-building-on-a-lake-its-state-lists
//
// THE DEFECT. fixOrphanedStateBuildings (run by Auto-fix all) removed a history `<pid> = { … }` building block for a
// province the state DOES list whenever that province was a sea OR A LAKE ("province is water"). The sea half answers to
// non_land_province_in_state. The lake half answered to no rule at all: a state listing lake 27 with `27 = { bunker = 2 }`
// was told nothing, and one Auto-fix click deleted the block — a fixer more opinionated than any rule, deleting what a
// modder wrote by hand (batch 6 coverage table, item A-coverage-orphan-lake).
//
// WHAT THE GAME DOES (hoi4.exe 1.20.0.0, Operation Postern v1.20.0.0.8873, 56,556,664 bytes, dumpbin; section 1 re-reads the
// bytes when that build is installed. Re-derived 2026-10-30 from 1.19.4.1, the update Steam installed at 03:42 that day over
// the 1.19.4.0 this had been re-read from three hours before; 1.19.3 was last read 2026-09-30, 1.19.2 first. Every fact held,
// at new addresses, nine of the ten functions at their 1.19.3 size, and the chain's flag-byte reads are still exactly the
// three coastal tests. Re-derived 2026-11-20 from 1.20.0.0 by the strings (capstone): every fact held again, at new addresses,
// all ten functions at their 1.19.4.1 size, the chain's flag-byte reads still exactly the three coastal tests. In 1.19.4.1
// and 1.20.0.0 the game's own logs and asserts pass an empty string as the file name, and no
// …\hoi4\source\… path is left in the image, so the .cpp names below are the ones 1.19.3 and error.log gave):
//   * statehistory.cpp 0x141640CE0 walks a state history's province entries. A province the state does not list is refused
//     ("…province building in state that doesn't own it", 0x141640EFE). Otherwise each entry goes through 0x141209470(the
//     province's building container, the entry, r8b=1 at 0x141641010) and only a FALSE answer logs "State Error: Trying to
//     set invalid province building" (0x141641054) — then the next entry.
//   * 0x141209470 = slot lookup 0x1412032E0 + SetLevel 0x141167770. The slot lookup's only placement test is the building
//     type's kind check 0x141558F70 (a provincial type in a province container; an only_costal type [+366h] refused in a
//     container flagged non-coastal). SetLevel refuses a negative level, a level above the max (the type's own province max
//     unless the terrain's buildings_max_level lists the type — 0x1414DCF2F), and a port type on a province without the
//     COASTAL bit 0x08 of the template flags (0x1411679BA, "Attempting to put a port on a landlocked province!").
//   * Every province object gets a building container (0x140EEDA69 / 0x140EEDC05 → 0x141201F00, flags 1; flags 5 = also
//     coastal-locked only when the coastal bit is clear), and a state sizes the slots of every province it lists
//     (state.cpp 0x140A29ACF → 0x141204F00, 0x140A29ADB → 0x141209570, count = the building database's type count).
//   * NONE of those functions reads the LAND bit (0x01) or the LAKE bit (0x02) of the flags byte [template+0D2h]; the only
//     reads are the three coastal tests. So a bunker on a lake its state lists is SET, silently. A naval base on a
//     non-coastal lake is refused and logged — exactly as on non-coastal land — and naval_base_non_coastal (a warning)
//     reports that; fixNavalBuildingsWithoutCoast is the fixer that removes it. (It was also state_naval_building_without_coast
//     until #a-naval-building-the-game-refuses-claims-no-crash narrowed that rule to a state building in a state with no coast.)
//   Community sources say nothing about lakes: the wiki's State modding page covers only coastal-only buildings in
//   landlocked states; Building modding lists only_costal, and neither page names a land or lake restriction.
//
// MEASURED: all six shipping maps list lakes inside states (vanilla 118, Millennium Dawn 170, Road to 56 103, Old World
// Blues 89, Novum Vexillum 162, Rise of Nations 128) and none carries a province building block on a lake or a sea (of 579 /
// 766 / 632 / 373 / 812 / 527 undated province blocks). Section 2 re-derives vanilla's half of that.
//
// THE FIX. The fixer's condition loses its lake half; it still removes what its two rules report: a block for a province
// the state does not list (province_building_not_in_state) and a block on a sea province the state lists
// (non_land_province_in_state). Section 3 sends what the client sends — POST /api/map/auto-fix runs autoFixMap with the
// mod's roots.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lakebldg-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lakebldg-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lakebldg-mods-"));
process.env.HOI4_MODS_ROOT = MODS;
const md = require("./map-data.js");
const tmps = [HOME, APPDATA_DIR, MODS];
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const EXE = GAME + "/hoi4.exe";

// An 8×8 grid of 64-px provinces on a 512×512 map (a box of exactly 1/8 of the map is not "too large").
// id = x + 8y + 1. Row 0 (1-8) is sea; 27 and 35 are lakes; everything else is land.
const W = 512, H = 512, CELL = 64;
const provAt = (x, y) => Math.floor(x / CELL) + Math.floor(y / CELL) * 8 + 1;
const COL = (p) => [(p * 37) % 256, (p * 71) % 256, ((p * 113) % 200) + 40];
function bmp24(fn) {
  const rs = (W * 3 + 3) & ~3, is = rs * H; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rs; for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const LAKES = new Set([27, 35]);
const typeOf = (p) => (p <= 8 ? "sea" : LAKES.has(p) ? "lake" : "land");
function definition() {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 64; p++) {
    const [r, g, b] = COL(p), t = typeOf(p);
    const coastal = t === "land" && p >= 9 && p <= 16;
    rows.push(`${p};${r};${g};${b};${t};${coastal};${t === "land" ? "plains" : t === "lake" ? "lakes" : "ocean"};${t === "land" ? 1 : 0}`);
  }
  return rows.join("\n") + "\n";
}
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const state = (id, provs, blocks, owner) => [
  "state = {", `\tid = ${id}`, `\tname = "STATE_${id}"`, "\tmanpower = 1000", "\tstate_category = rural",
  `\tprovinces = { ${provs.join(" ")} }`, "\thistory = {", `\t\towner = ${owner}`, "\t\tbuildings = {", "\t\t\tinfrastructure = 1",
  ...blocks.map((b) => "\t\t\t" + b), "\t\t}", "\t}", "}", ""].join("\n");
function writeMod() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-lakebldg-mod-")); tmps.push(d);
  const mk = (rel, body) => { const p = path.join(d, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
  mk("descriptor.mod", 'name="LakeBuildings"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk("map/provinces.bmp", bmp24((x, y) => COL(provAt(x, y))));
  mk("map/definition.csv", definition());
  mk("history/states/1-A.txt", state(1, range(9, 16), [], "AAA"));
  // State 2: a bunker on the lake it lists (27), a naval base on the non-coastal lake it lists (35), a bunker on its own
  // land (28, the control), and a bunker on SEA province 5, which it also lists (non_land_province_in_state).
  mk("history/states/2-B.txt", state(2, [...range(17, 40), 5], ["27 = { bunker = 2 }", "35 = { naval_base = 1 }", "28 = { bunker = 1 }", "5 = { bunker = 1 }"], "AAA"));
  // State 3 sets a bunker on 20, which state 2 holds: province_building_not_in_state. It is here so Auto-fix has a
  // problem of the mod's own to run for — with none it returns before any fixer, on the base commit as on the fix.
  mk("history/states/3-C.txt", state(3, range(41, 64), ["20 = { bunker = 1 }"], "BBB"));
  return d;
}
const names = (p, pid) => p && (p.province === pid || (Array.isArray(p.provinces) && p.provinces.includes(pid))
  || (Array.isArray(p.items) && p.items.some((it) => it && (+it.province === pid
    || (Array.isArray(it.provinceKeys) && it.provinceKeys.some((k) => k && +k.province === pid))))));
const blockIn = (txt, pid) => new RegExp(`(^|\\n)[ \\t]*${pid}\\s*=\\s*\\{`).test(txt);

(async () => {
  try {
    console.log("\n=== 1. the engine's own code (hoi4.exe 1.20.0.0, read-only) ===");
    if (!fs.existsSync(EXE) || fs.statSync(EXE).size !== 56556664) {
      skip("hoi4.exe 1.20.0.0 (56,556,664 bytes) is not installed here — the engine facts did NOT run");
    } else {
      const fd = fs.openSync(EXE, "r");
      try {
        const head = Buffer.alloc(4096); fs.readSync(fd, head, 0, 4096, 0);
        const pe = head.readUInt32LE(0x3c), nSec = head.readUInt16LE(pe + 6), optSize = head.readUInt16LE(pe + 20), opt = pe + 24;
        const IB = Number(head.readBigUInt64LE(opt + 24));
        const secs = []; for (let i = 0; i < nSec; i++) { const s = opt + optSize + i * 40; secs.push({ va: head.readUInt32LE(s + 12), size: head.readUInt32LE(s + 16), raw: head.readUInt32LE(s + 20) }); }
        const bytes = (va, n) => { const rva = va - IB, s = secs.find((x) => rva >= x.va && rva < x.va + x.size), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, rva - s.va + s.raw); return b; };
        const hex = (va, n) => bytes(va, n).toString("hex");
        const jumpTo = (va) => { const b = bytes(va, 5); return b[0] === 0xe8 || b[0] === 0xe9 ? va + 5 + b.readInt32LE(1) : -1; };
        const leaText = (va) => { const b = bytes(va, 7); if ((b[0] & 0xfb) !== 0x48 || b[1] !== 0x8d) return null; return bytes(va + 7 + b.readInt32LE(3), 96).toString("latin1").split("\0")[0]; };
        // Every read of the province-template flags byte [reg+0D2h] in [lo, hi): test r/m8,imm8 (F6 /0), mov r8,r/m8 (8A),
        // movzx (0F B6) — returned as { va, form, imm }.
        const flagReads = (lo, hi) => {
          const b = bytes(lo, hi - lo), out = [];
          for (let i = 0; i + 7 <= b.length; i++) {
            const disp = (j) => j + 5 <= b.length && b.readInt32LE(j) === 0xd2;
            const modOk = (m) => (m & 0xc0) === 0x80 && (m & 7) !== 4;
            if (b[i] === 0xf6 && modOk(b[i + 1]) && ((b[i + 1] >> 3) & 7) === 0 && disp(i + 2)) out.push({ va: lo + i, form: "test", imm: b[i + 6] });
            else if (b[i] === 0x8a && modOk(b[i + 1]) && disp(i + 2)) out.push({ va: lo + i, form: "mov" });
            else if (b[i] === 0x0f && b[i + 1] === 0xb6 && modOk(b[i + 2]) && disp(i + 3)) out.push({ va: lo + i, form: "movzx" });
          }
          return out;
        };
        const H16 = (n) => "0x" + n.toString(16).toUpperCase();

        rec("statehistory.cpp applies each province entry through 0x141209470 as a PROVINCE building (0x141641010: mov r8b,1; 0x141641019: call)",
          hex(0x141641010, 3) === "41b001" && jumpTo(0x141641019) === 0x141209470, [hex(0x141641010, 3), H16(jumpTo(0x141641019))]);
        rec("…and logs only a refused one: \"State Error: Trying to set invalid province building \\\"\" (0x141641054)",
          leaText(0x141641054) === "State Error: Trying to set invalid province building \"", leaText(0x141641054));
        rec("…a province the state does not list is the other, earlier refusal (0x141640EFE)",
          /^State Error: Trying to set province building in state that doesn't own it/.test(String(leaText(0x141640EFE))), leaText(0x141640EFE));
        rec("0x141209470 = the slot lookup (0x14120949F → 0x1412032E0) then SetLevel (0x1412094C3 jmp → 0x141167770)",
          jumpTo(0x14120949F) === 0x1412032E0 && bytes(0x1412094C3, 1)[0] === 0xe9 && jumpTo(0x1412094C3) === 0x141167770);
        rec("the slot lookup's placement test is the type's kind check (0x14120330D → 0x141558F70), whose coastal lock reads only_costal [type+366h] (0x141558F8D)",
          jumpTo(0x14120330D) === 0x141558F70 && hex(0x141558F8D, 7) === "80b96603000000", [H16(jumpTo(0x14120330D)), hex(0x141558F8D, 7)]);
        rec("SetLevel refuses a port on a province without the COASTAL bit (0x1411679BA: test byte [rcx+0D2h],8) …",
          hex(0x1411679BA, 7) === "f681d200000008", hex(0x1411679BA, 7));
        rec("…\"Attempting to put a port on a landlocked province!\" (0x1411679FE) and \"…above max level!\" (0x141167983)",
          leaText(0x1411679FE) === "Attempting to put a port on a landlocked province!" && leaText(0x141167983) === "Attempting to set the level of a building above max level!",
          [leaText(0x1411679FE), leaText(0x141167983)]);
        rec("a terrain that lists no max for the type gives the type's own (0x1414DCF2F → 0x141557760)", jumpTo(0x1414DCF2F) === 0x141557760, H16(jumpTo(0x1414DCF2F)));
        rec("every province object gets a building container, flags 1 (0x140EEDA5D mov edx,1; 0x140EEDA69 → 0x141201F00) …",
          hex(0x140EEDA5D, 5) === "ba01000000" && jumpTo(0x140EEDA69) === 0x141201F00 && hex(0x140EEDBF9, 5) === "ba01000000" && jumpTo(0x140EEDC05) === 0x141201F00);
        rec("…made 5 (coastal-locked) only when the coastal bit is clear (0x140EEDA75 / 0x140EEDA7E, 0x140EEDC11 / 0x140EEDC1A)",
          hex(0x140EEDA75, 7) === "f680d200000008" && hex(0x140EEDA7E, 10) === "c786f801000005000000"
          && hex(0x140EEDC11, 7) === "f680d200000008" && hex(0x140EEDC1A, 11) === "41c786f801000005000000",
          [hex(0x140EEDA7E, 10), hex(0x140EEDC1A, 11)]);
        rec("a state sizes the building slots of every province it lists (state.cpp 0x140A29ACF → 0x141204F00, 0x140A29ADB → 0x141209570) from the building type count (0x1412095B5)",
          jumpTo(0x140A29ACF) === 0x141204F00 && jumpTo(0x140A29ADB) === 0x141209570 && hex(0x1412095B5, 5) === "440fb6704c");
        // Each range is one function's whole .pdata extent, chained unwind fragments included: two of them are three
        // RUNTIME_FUNCTIONs each — the terrain max 0x1414DCCD0..0x1414DCD7F..0x1414DCEE2..0x1414DCF44 and the slot sizer
        // 0x141209570..0x1412096C1..0x1412097C3..0x1412097E9 — and no other fragment anywhere in the image chains to these ten.
        // The sixth is the max level SetLevel compares against (0x141167937 → 0x141207720), the one of the ten whose size
        // moved in 1.19.4 (0xF5C → 0xF66 bytes); the other nine are the size they were in 1.19.3.
        const CHAIN = [[0x141640CE0, 0x14164117B], [0x141209470, 0x1412094D8], [0x1412032E0, 0x141203446], [0x141558F70, 0x141559303],
          [0x141167770, 0x141167F24], [0x141207720, 0x141208686], [0x1414DCCD0, 0x1414DCF44], [0x141209570, 0x1412097E9],
          [0x140EED920, 0x140EEDAA1], [0x140EEDAB0, 0x140EEDC44]];
        const reads = [].concat(...CHAIN.map(([lo, hi]) => flagReads(lo, hi)));
        rec("⭐⭐⭐ NOTHING in that chain reads the LAND (0x01) or LAKE (0x02) bit of the flags byte — its only reads are the three coastal tests",
          reads.length === 3 && reads.every((r) => r.form === "test" && r.imm === 8), reads.map((r) => `${H16(r.va)} ${r.form} ${r.imm}`));
        // The port loader: buildings.txt's reader refusing a port whose sea zone is a lake (" port building has a lake as sea
        // zone for province ", 0x141718110) — the one lake test this scanner should find in a window around it.
        const control = flagReads(0x1417180B0, 0x1417180D0);
        rec("THE SCANNER'S CONTROL: it does find the port loader's lake test (0x1417180BE: test [..+0D2h],2)",
          control.some((r) => r.va === 0x1417180BE && r.imm === 2), control.map((r) => `${H16(r.va)} ${r.imm}`));
      } finally { fs.closeSync(fd); }
    }

    console.log("\n=== 2. the shape is legal and unused (the installed base game) ===");
    if (!fs.existsSync(path.join(GAME, "map", "definition.csv"))) {
      skip("the base game is not installed here — the corpus facts did NOT run");
    } else {
      const model = md.buildMapModel({ modRoot: GAME, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
      const type = new Map((model.provinces || []).map((p) => [+p.id, p.type]));
      let lakesInStates = 0, blocks = 0, onLake = 0;
      for (const st of model.states || []) {
        for (const pid of st.provinces || []) if (type.get(+pid) === "lake") lakesInStates++;
        for (const pidStr of Object.keys(st.provinceBuildings || {})) { blocks++; if (type.get(+pidStr) === "lake") onLake++; }
      }
      rec("⭐⭐ vanilla lists lakes inside its states", lakesInStates > 0, lakesInStates);
      rec("…and ships province building blocks, none of them on a lake", blocks > 0 && onLake === 0, { blocks, onLake });
      const terrain = fs.readFileSync(path.join(GAME, "common", "terrain", "00_terrain.txt"), "utf8").replace(/#[^\r\n]*/g, "");
      const at = terrain.search(/(^|\n)\s*lakes\s*=\s*\{/);
      let body = "";
      if (at >= 0) { let i = terrain.indexOf("{", at), d = 0, j = i; for (; j < terrain.length; j++) { if (terrain[j] === "{") d++; else if (terrain[j] === "}" && --d === 0) break; } body = terrain.slice(i, j + 1); }
      rec("vanilla's `lakes` terrain sets no buildings_max_level, so a building's own max applies there", body.length > 0 && !/buildings_max_level/.test(body), body.slice(0, 160));
    }

    console.log("\n=== 3. a mod's own state: what the rules report, the fixer's dry run, and one Auto-fix click ===");
    const mod = writeMod();
    const NOGAME = path.join(os.tmpdir(), "nova-lakebldg-no-game");
    const o = { modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] };
    const model = md.buildMapModel({ ...o, cacheStableLayers: false });
    const problems = [].concat(md.findStateFileConflicts(mod), md.validateMapModel(model), md.findBuildingAnchorMismatches({ ...o, model }), md.validateMapBitmap(o));
    const byRule = (r) => problems.filter((p) => p.rule === r);
    rec("the fixture's lakes are lakes in the model", model.provinces.filter((p) => LAKES.has(+p.id)).every((p) => p.type === "lake"));
    rec("no province of the fixture is \"too large\" (a fixture artefact would muddy the next checks)", !byRule("province_too_large").length, byRule("province_too_large").map((p) => p.provinces));
    rec("the stray block (bunker on 20, held by state 2) is province_building_not_in_state", byRule("province_building_not_in_state").some((p) => p.province === 20 && p.stateId === 3));
    rec("the sea province state 2 lists is non_land_province_in_state", byRule("non_land_province_in_state").some((p) => names(p, 5)));
    rec("⭐⭐ the naval base on non-coastal lake 35 — which the engine refuses — is reported by naval_base_non_coastal …", byRule("naval_base_non_coastal").some((p) => names(p, 35)));
    // Moved with #a-naval-building-the-game-refuses-claims-no-crash: this said the FATAL state_naval_building_without_coast reports it
    // too. A refused province naval base is naval_base_non_coastal alone now; what removes it is still fixNavalBuildingsWithoutCoast.
    rec("…and not by state_naval_building_without_coast, which is about a state building in a state with no coast", !byRule("state_naval_building_without_coast").some((p) => names(p, 35)),
      byRule("state_naval_building_without_coast").map((p) => p.items));
    const navalDry = md.fixNavalBuildingsWithoutCoast({ ...o, dryRun: true });
    rec("…and fixNavalBuildingsWithoutCoast is still the fixer that removes it", ((navalDry && navalDry.work) || []).some((w) => (w.provinceKeys || []).some((k) => +k.province === 35 && k.key === "naval_base")),
      navalDry && navalDry.work);
    const aboutLake = problems.filter((p) => names(p, 27));
    rec("⭐⭐⭐ NO rule reports the bunker on lake 27 — the engine sets it", aboutLake.length === 0, aboutLake.map((p) => p.rule));

    const dry = md.fixOrphanedStateBuildings({ ...o, dryRun: true });
    const planned = (dry.details || []).map((d) => d.province);
    rec("the dry run still plans the block for a province the state does not list (20)", planned.includes(20), dry.details);
    rec("…and the block on the sea province the state lists (5)", planned.includes(5), dry.details);
    rec("⭐⭐⭐ …and NOT the bunker on lake 27", !planned.includes(27), dry.details);
    rec("⭐⭐ …nor the naval base on lake 35: it answers to its own two rules, not to this fixer", !planned.includes(35), dry.details);
    rec("…nor the control, a bunker on land the state lists (28)", !planned.includes(28), dry.details);

    const st2 = path.join(mod, "history", "states", "2-B.txt"), st3 = path.join(mod, "history", "states", "3-C.txt");
    const fix = md.autoFixMap(o);
    rec("Auto-fix ran its fixers (it had a problem of the mod's own)", !!(fix && fix.ok !== false && !fix.nothingToFix && fix.fixes && fix.fixes.orphanBuildings), fix && (fix.note || Object.keys(fix.fixes || {})));
    const t2 = fs.readFileSync(st2, "utf8"), t3 = fs.readFileSync(st3, "utf8");
    const orphanRemoved = ((fix && fix.fixes && fix.fixes.orphanBuildings && fix.fixes.orphanBuildings.details) || []).map((d) => d.province);
    rec("⭐⭐ one click still removes the stray block its rule reports (20 in state 3)", !blockIn(t3, 20), t3);
    rec("⭐⭐⭐ …and leaves the bunker on lake 27 where the modder wrote it", /(^|\n)[ \t]*27\s*=\s*\{\s*bunker\s*=\s*2\s*\}/.test(t2), t2);
    rec("⭐⭐ …and the orphan fixer's own pass removed neither lake block", !orphanRemoved.includes(27) && !orphanRemoved.includes(35), fix && fix.fixes && fix.fixes.orphanBuildings);
    rec("…and the control on land (28)", /(^|\n)[ \t]*28\s*=\s*\{\s*bunker\s*=\s*1\s*\}/.test(t2), t2);
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\n=== Auto-fix leaves a building on a lake its state lists: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
