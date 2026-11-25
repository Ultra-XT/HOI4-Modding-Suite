// An air wing a country starts in a state that no longer exists is reported — as a warning, only for the mod's own doing —
// and deleting, merging or renumbering a state says which air wings it leaves behind. #an-air-wing-based-in-a-state-that-is-gone
//
// THE DEFECT. history/units order-of-battle files place air wings by STATE id (`air_wings = { 64 = { … } }`). Deleting a
// state, merging it away, or Auto-fix sliding the highest state down into a freed id leaves a wing keyed to an id that is
// gone, and no Nova rule looked at air wings: the units agent's fleet/division rules read locations only (batch 6,
// deferred). deleteState and mergeState returned nothing about them, and closeStateIdGaps re-keys only the `<id> = {`
// lines it can see in the mod's own files — an inherited order of battle keeps the old id.
//
// WHAT THE GAME DOES (hoi4.exe 1.20.0.0, Operation Postern v1.20.0.0.8873, 56,556,664 bytes, capstone; section 1 re-reads the
// bytes. Read on 1.19.2 first; re-derived on 1.19.3 2026-09-30, on 1.19.4.0 2026-10-30 and on the 1.19.4.1 hotfix the same day
// from the strings -- from 1.19.3 to 1.19.4.0 the air_wings reader moved +0x5CCC0 and the state lookup +0x5CD70, every asserted
// instruction at the same offset inside each, and the parser library +0x82600 (its error list and block skip) and +0x82630 (its
// numeric test and id parse); from 1.19.4.0 to 1.19.4.1 the reader and the lookup did not move and those four parser functions
// moved +0x350 each; re-derived on 1.20.0.0 2026-11-20 from the strings: the reader and the lookup moved +0x1DC0 and the four
// parser functions +0x3910 each, every asserted instruction at the same offset inside each. 1.19.4 carries no source-file names
// (nor does 1.20.0) -- no literal in the image ends in .cpp, and its logger calls pass an
// empty file name -- so the reader is named by its own messages ("Error scripting OOB " … ". name set without airwing first");
// strategicair.cpp is the name the earlier builds gave it):
//   * strategicair.cpp's air_wings reader 0x140CC0A00 sends a numeric key (0x140CC0B3B) to 0x140CBD690 (0x140CC0B4C),
//     which parses the id (0x140CBD6B1) and refuses one below 1 (0x140CBD6B9) or at/after the state count
//     [gamestate+2D4h] (0x140CBD7AD) with " is not a valid state ID" (0x140CBD9EB), and a valid id with no air base
//     object with "State … has no air base" (0x140CBD7DF / 0x140CBD857) — both into the parser's error list
//     (0x142547F00) — and returns null.
//   * On null the reader skips the block (0x140CC0B72 → 0x142548360) and goes on to the next key (0x140CC0B77). So the
//     wing is not created and the load carries on. The failed-load path 0x140202130 has two callers in the image (the map
//     check 0x1401E4A42 and strategicair's site walk 0x140CB965F), neither of them this. A WARNING, never fatal.
//
// MEASURED (scratchpad census-airwings.js, the order-of-battle files each effective history/countries starts): air wing
// state keys pointing at a state that does not exist — vanilla 0 of 438, Millennium Dawn 0/723, Road to 56 0/391, Old World
// Blues 0/2, Novum Vexillum 0/15, Rise of Nations 0/126 (and 0 of 2,304 across every RoN file). Section 2 re-derives
// vanilla's.
//
// THE GATE, as ec785b3 decided for fleets and divisions: only units a country that owns land starts (oob / set_oob /
// set_naval_oob / set_air_oob / load_oob, any date or branch, comments masked); a numeric key only (a carrier's is its name);
// and only what the mod did — its own order-of-battle file, or a state the layers below have and the mod's states took away.
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

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-airwing-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-airwing-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const MODS = fs.mkdtempSync(path.join(os.tmpdir(), "nova-airwing-mods-"));
process.env.HOI4_MODS_ROOT = MODS;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const P = require("./testlib-map-page.js");   // withNoteHelpers: the summary's note helpers, derived not named
const tmps = [HOME, APPDATA_DIR, MODS];
const RULE = "air_wing_state_missing";
const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const EXE = VANILLA + "/hoi4.exe";

// A 4×4 grid of 64-px land provinces; state n holds row n (provinces 4n-3 … 4n).
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
const stateTxt = (id, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${[1, 2, 3, 4].map((k) => 4 * id - 4 + k).join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
const wing = (sid, tag, name) => `\t${sid} = {\n\t\tfighter_equipment_0 = { owner = "${tag}" amount = 10 }${name ? `\n\t\tname = "${name}"` : ""}\n\t}`;
const OWNER = { 1: "AAA", 2: "AAA", 3: "BBB", 4: "BBB" };
function tmpDir(tag) { const d = fs.mkdtempSync(path.join(os.tmpdir(), `nova-airwing-${tag}-`)); tmps.push(d); return d; }

// The base game of these fixtures.
function writeGame(root) {
  mk(root, "map/provinces.bmp", bmp24(256, 256, (x, y) => COL(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 16; p++) { const [r, g, b] = COL(p); rows.push(`${p};${r};${g};${b};land;false;plains;1`); }
  mk(root, "map/definition.csv", rows.join("\n") + "\n");
  for (const id of [1, 2, 3, 4]) mk(root, `history/states/${id}.txt`, stateTxt(id, OWNER[id]));
  mk(root, "history/countries/AAA - Aland.txt", 'capital = 1\nset_air_oob = "AAA_air"\n# set_air_oob = "AAA_unused"\n');
  mk(root, "history/countries/BBB - Bland.txt", 'capital = 3\noob = "BBB_1936"\nif = {\n\tlimit = { has_dlc = "By Blood Alone" }\n\tset_air_oob = "BBB_air"\n}\n');
  // CCC owns no state, so nothing it names is started.
  mk(root, "history/countries/CCC - Cland.txt", 'capital = 2\nset_air_oob = "CCC_air"\n');
  mk(root, "history/units/AAA_air.txt", ["air_wings = {", wing(2, "AAA"), wing(4, "AAA", "Fourth Wing"), '\t"Old Carrier" = {', '\t\tcv_fighter_equipment_0 = { owner = "AAA" amount = 5 }', "\t}", "}", ""].join("\n"));
  mk(root, "history/units/AAA_unused.txt", ["air_wings = {", wing(6, "AAA"), "}", ""].join("\n"));
  // State 9 exists in no layer: an inherited problem, not an add-on's to answer.
  mk(root, "history/units/BBB_1936.txt", ["units = {", "\tair_wings = {", wing(9, "BBB").replace(/^/gm, "\t"), "\t}", "}", ""].join("\n"));
  mk(root, "history/units/BBB_air.txt", ["air_wings = {", wing(3, "BBB"), wing(4, "BBB"), "}", ""].join("\n"));
  mk(root, "history/units/CCC_air.txt", ["air_wings = {", wing(8, "CCC"), "}", ""].join("\n"));
  return root;
}
const validate = (modRoot, gameRoot) => md.validateMapBitmap({ modRoot, gameRoot, dependencyRoots: [] }).filter((p) => p.rule === RULE);
const wingKeys = (p) => ((p && p.items) || []).map((it) => `${it.file}:${it.state}`).sort();

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
        const secs = []; for (let i = 0; i < nSec; i++) { const s = opt + optSize + i * 40; secs.push({ va: head.readUInt32LE(s + 12), vsize: head.readUInt32LE(s + 8), size: head.readUInt32LE(s + 16), raw: head.readUInt32LE(s + 20), exec: !!(head.readUInt32LE(s + 36) & 0x20000000) }); }
        const bytes = (va, n) => { const rva = va - IB, s = secs.find((x) => rva >= x.va && rva < x.va + x.size), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, rva - s.va + s.raw); return b; };
        const hex = (va, n) => bytes(va, n).toString("hex");
        const jumpTo = (va) => { const b = bytes(va, 5); return b[0] === 0xe8 || b[0] === 0xe9 ? va + 5 + b.readInt32LE(1) : -1; };
        const leaText = (va) => { const b = bytes(va, 7); if ((b[0] & 0xfb) !== 0x48 && (b[0] & 0xfb) !== 0x4c) return null; if (b[1] !== 0x8d) return null; return bytes(va + 7 + b.readInt32LE(3), 96).toString("latin1").split("\0")[0]; };
        const H16 = (n) => "0x" + n.toString(16).toUpperCase();
        // ⚠️ Up to 1.19.3 this function was named by the source path its logger call loads (strategicair.cpp). 1.19.4 carries
        // NO source-file names (nor does 1.20.0) -- no literal in the image ends in .cpp, and (counted on 1.20.0.0) 11,979 of the
        // 12,102 calls to the logger 0x14254FD50 (11,976 of 12,099 on 1.19.4.1) load the empty string 0x14279873D as the file just
        // before the call -- so that same
        // `lea r8,<file>` (0x140CC0C64) loads "". The reader is named by what it says instead, and the empty name is pinned too:
        // a build that brings paths back fails here, which is the cue to name it by its path again.
        rec("strategicair.cpp's air_wings reader names itself — \"Error scripting OOB \" (0x140CC0C83) … \". name set without airwing first\" (0x140CC0EEF) — and, 1.19.4 carrying no source-file names, its logger's file argument (0x140CC0C64) is empty",
          leaText(0x140CC0C83) === "Error scripting OOB " && leaText(0x140CC0EEF) === ". name set without airwing first" && leaText(0x140CC0C64) === "",
          [leaText(0x140CC0C83), leaText(0x140CC0EEF), leaText(0x140CC0C64)]);
        rec("a numeric key (0x140CC0B3B → 0x14254B350) goes to the state lookup 0x140CBD690 (0x140CC0B4C)",
          jumpTo(0x140CC0B3B) === 0x14254B350 && hex(0x140CC0B42, 2) === "740f" && jumpTo(0x140CC0B4C) === 0x140CBD690, [H16(jumpTo(0x140CC0B3B)), H16(jumpTo(0x140CC0B4C))]);
        rec("the lookup parses the id (0x140CBD6B1) and refuses one below 1 (0x140CBD6B9: cmp ebx,1; jl) …",
          jumpTo(0x140CBD6B1) === 0x14254B270 && hex(0x140CBD6B9, 3) === "83fb01" && hex(0x140CBD6BC, 2) === "0f8c");
        rec("…or at/after the state count (0x140CBD7AD: cmp ebx,[rax+2D4h]; jge)", hex(0x140CBD7AD, 6) === "3b98d4020000" && hex(0x140CBD7B3, 2) === "0f8d", hex(0x140CBD7AD, 8));
        rec("⭐⭐ …as \" is not a valid state ID\" (0x140CBD9EB) into the parser's error list (0x140CBDA2B → 0x142547F00)",
          leaText(0x140CBD9EB) === " is not a valid state ID" && jumpTo(0x140CBDA2B) === 0x142547F00, [leaText(0x140CBD9EB), H16(jumpTo(0x140CBDA2B))]);
        rec("…and a valid id with no air base as \"State … has no air base\" (0x140CBD7DF, 0x140CBD857, 0x140CBD897)",
          leaText(0x140CBD7DF) === "State " && leaText(0x140CBD857) === " has no air base" && jumpTo(0x140CBD897) === 0x142547F00);
        rec("…returning null (0x140CBDAB0: xor eax,eax)", hex(0x140CBDAB0, 2) === "33c0");
        rec("⭐⭐⭐ on null the reader skips the block (0x140CC0B72 → 0x142548360) and goes on to the next key (0x140CC0B77 jmp 0x140CC0AC0)",
          hex(0x140CC0B6A, 3) === "4885c0" && hex(0x140CC0B6D, 2) === "7514" && jumpTo(0x140CC0B72) === 0x142548360 && bytes(0x140CC0B77, 1)[0] === 0xe9 && jumpTo(0x140CC0B77) === 0x140CC0AC0);
        // Every direct call or jump to the failed-load path, over the executable sections.
        const callers = [];
        for (const s of secs) {
          if (!s.exec) continue;
          const len = Math.min(s.size, s.vsize), b = Buffer.alloc(len); fs.readSync(fd, b, 0, len, s.raw);
          for (let i = 0; i + 5 <= len; i++) { if (b[i] !== 0xe8 && b[i] !== 0xe9) continue; const va = IB + s.va + i; if (va + 5 + b.readInt32LE(i + 1) === 0x140202130) callers.push(va); }
        }
        rec("⭐⭐ the failed-load path 0x140202130 has exactly its two callers, neither in the air-wing reader",
          callers.length === 2 && callers.includes(0x1401E4A42) && callers.includes(0x140CB965F), callers.map(H16));
      } finally { fs.closeSync(fd); }
    }

    console.log("\n=== 2. the installed base game starts air wings, all in states that exist ===");
    if (!fs.existsSync(path.join(VANILLA, "history", "units"))) {
      skip("the base game is not installed here — the corpus check did NOT run");
    } else {
      const model = md.buildMapModel({ modRoot: VANILLA, gameRoot: VANILLA, dependencyRoots: [], cacheStableLayers: true });
      const all = typeof md.startingUnitLocations === "function" ? md.startingUnitLocations({ modRoot: VANILLA, gameRoot: VANILLA, dependencyRoots: [], model, stateIds: true }).filter((u) => u.kind === "air_wing") : [];
      const have = new Set(model.states.map((s) => s.id));
      rec("⭐ vanilla's started orders of battle base air wings in states (startingUnitLocations lists them)", all.length > 0, all.length);
      rec("…every one of them in a state that exists", all.length > 0 && all.every((u) => have.has(u.state)), all.filter((u) => !have.has(u.state)).slice(0, 5));
      const found = typeof md.findAirWingsOnMissingStates === "function" ? md.findAirWingsOnMissingStates({ modRoot: VANILLA, gameRoot: VANILLA, dependencyRoots: [], model }) : null;
      rec("…so the search finds none on it", !!found && found.wings.length === 0, found && found.wings.slice(0, 3));
    }

    console.log("\n=== 3. the rule ===");
    const GAME = writeGame(tmpDir("game"));
    {
      const p = validate(GAME, GAME);
      rec("editing the base game itself: its one started wing in a missing state (9, BBB_1936 inside units) is reported", p.length === 1 && wingKeys(p[0]).join() === "BBB_1936.txt:9", p.map(wingKeys));
      const it = p[0] || {};
      rec("…as a warning", it.severity === "warning", it.severity);
      rec("⭐⭐ …quoting what HOI4 logs", /is not a valid state ID|has no air base/.test(String(it.message)), String(it.message).slice(0, 300));
      rec("…not in the fatal set", labels.isFatalRule(RULE) === false);
      const keys = Object.keys(labels.LABELS);
      rec("⭐ …with a label, placed directly after division_starts_on_water", keys.indexOf(RULE) === keys.indexOf("division_starts_on_water") + 1 && keys.indexOf(RULE) > 0, keys.indexOf(RULE));
      rec("⚠️ a wing in a state that exists (2), a carrier's named wing, an order of battle nobody starts (CCC, a commented set_air_oob) are not reported",
        !p.some((x) => wingKeys(x).some((k) => /:2$|Carrier|CCC_air|AAA_unused/.test(k))), p.map(wingKeys));
    }
    {
      // An add-on: an empty history/states/4.txt takes state 4 away (HOI4 replaces the file by name), and it starts one
      // order of battle of its own with a wing in state 7, which no layer has.
      const ADD = tmpDir("addon");
      mk(ADD, "descriptor.mod", 'name="WingAddon"\n');
      mk(ADD, "history/states/4.txt", "# state 4 was removed by this mod\n");
      mk(ADD, "history/countries/AAA - Aland.txt", 'capital = 1\nset_air_oob = "AAA_air"\nset_air_oob = "AAA_extra"\n');
      mk(ADD, "history/units/AAA_extra.txt", ["air_wings = {", wing(7, "AAA", "Lost Wing"), "}", ""].join("\n"));
      const p = validate(ADD, GAME);
      const keys = p.flatMap(wingKeys).sort();
      rec("⭐⭐⭐ an add-on is told about the wings in the state its own states took away (AAA_air 4, BBB_air 4)", keys.includes("AAA_air.txt:4") && keys.includes("BBB_air.txt:4"), keys);
      rec("⭐⭐ …and about the wing its own order of battle bases in a state no layer has (AAA_extra 7)", keys.includes("AAA_extra.txt:7"), keys);
      rec("⭐⭐⭐ …and NOT about the base game's wing in state 9, which the layer below lacks too", !keys.some((k) => /:9$/.test(k)), keys);
      rec("…in one problem", p.length === 1, p.length);
      rec("…whose message says the mod's states took the state away", /took/.test(String((p[0] || {}).message)), String((p[0] || {}).message).slice(0, 300));
      const QUIET = tmpDir("quiet");
      mk(QUIET, "descriptor.mod", 'name="Quiet"\n');
      rec("THE CONTROL: an add-on that ships no history of its own is told nothing", validate(QUIET, GAME).length === 0, validate(QUIET, GAME).map(wingKeys));
    }

    console.log("\n=== 4. deleting, merging and renumbering a state say which air wings they leave behind ===");
    const ownMod = () => {
      const d = tmpDir("own");
      mk(d, "descriptor.mod", 'name="OwnStates"\nreplace_path="history/states"\n');
      for (const id of [1, 2, 3, 4]) mk(d, `history/states/${id}-S.txt`, stateTxt(id, OWNER[id]));
      return d;
    };
    {
      const d = ownMod();
      const r = md.deleteState({ modRoot: d, gameRoot: GAME, dependencyRoots: [], stateId: 4 });
      rec("deleteState removed state 4", r && r.changed === true, r);
      const stranded = ((r && r.strandedAirWings) || []).map((w) => `${w.file}:${w.state}`).sort();
      rec("⭐⭐⭐ …and names the air wings still based in it (AAA_air 4, BBB_air 4)", stranded.join() === "AAA_air.txt:4,BBB_air.txt:4", r && r.strandedAirWings);
      rec("⭐⭐ …with a message the Save line can carry, naming the file and what HOI4 does", /AAA_air\.txt/.test(String(r && r.airWingWarning)) && /not a valid state ID/.test(String(r && r.airWingWarning)), r && r.airWingWarning);
      const d2 = ownMod();
      const r2 = md.deleteState({ modRoot: d2, gameRoot: GAME, dependencyRoots: [], stateId: 1 });
      rec("THE CONTROL: deleting a state no wing names says nothing about air wings", r2 && r2.changed === true && !r2.airWingWarning && !(r2.strandedAirWings || []).length, r2);
      const d3 = ownMod();
      const r3 = md.deleteState({ modRoot: d3, gameRoot: GAME, dependencyRoots: [], stateId: 3 });
      rec("⭐ deleting a state below the highest says the wings would land in whichever state the gap-closer moves down", /moving a higher state down/.test(String(r3 && r3.airWingWarning)) && /BBB_air\.txt/.test(String(r3 && r3.airWingWarning)), r3 && r3.airWingWarning);
      // ⛔ (review T02) IT NAMED THAT STATE, THE MODEL'S HIGHEST, AND NOTHING ASKED AGAIN. The next write of the same Save can merge that very state away, on the same line;
      // here the delete of 3 said "moving state 4 down", and 4 going next leaves no gap at all. A sentence naming no state cannot be overtaken by the next write.
      rec("⭐⭐ …and names no state as the one to move: the Save's next write can take it", !/state 4\b/.test(String(r3 && r3.airWingWarning)), r3 && r3.airWingWarning);
      const next = md.deleteState({ modRoot: d3, gameRoot: GAME, dependencyRoots: [], stateId: 4 });
      const closed = md.closeStateIdGaps(d3, { gameRoot: GAME, dependencyRoots: [] });
      rec("(guard: with the state it would have named gone too, no gap is left and nothing slides)", next && next.changed === true && !(closed.renumbered || []).length, { next, closed });
      rec("⭐⭐ …so it says HOI4 skips the wings unless another state takes the id, which holds there too", /not a valid state ID/.test(String(r3 && r3.airWingWarning)) && /unless another state takes id 3/.test(String(r3 && r3.airWingWarning)), r3 && r3.airWingWarning);
    }
    {
      const d = ownMod();
      const r = md.mergeState({ modRoot: d, gameRoot: GAME, dependencyRoots: [], sourceStateId: 4, targetStateId: 1 });
      rec("mergeState merged state 4 into 1", r && r.changed === true, r && (r.error || Object.keys(r)));
      rec("⭐⭐ …and carries the air-wing message of the state it deleted", /state 4/.test(String(r && r.airWingWarning)) && /AAA_air\.txt/.test(String(r && r.airWingWarning)), r && r.airWingWarning);
    }
    {
      // No replace_path: an empty 3.txt takes state 3 away, the mod ships its own copy of 4.txt and of AAA_air.txt, and
      // BBB_air.txt stays the base game's. Auto-fix's gap-closer moves state 4 down to 3.
      const d = tmpDir("gap");
      mk(d, "descriptor.mod", 'name="GapMod"\n');
      mk(d, "history/states/3.txt", "# state 3 was removed by this mod\n");
      mk(d, "history/states/4.txt", stateTxt(4, "BBB"));
      mk(d, "history/units/AAA_air.txt", fs.readFileSync(path.join(GAME, "history", "units", "AAA_air.txt"), "utf8"));
      const r = md.closeStateIdGaps(d, { gameRoot: GAME, dependencyRoots: [] });
      rec("closeStateIdGaps moved state 4 down to 3", (r.renumbered || []).some((x) => x.from === 4 && x.to === 3), r);
      const own = fs.readFileSync(path.join(d, "history", "units", "AAA_air.txt"), "utf8");
      rec("⭐ it re-keyed the mod's own air wing (AAA_air.txt: 4 = { → 3 = {)", /(^|\n)\t3 = \{/.test(own) && !/(^|\n)\t4 = \{/.test(own), own);
      const stranded = ((r && r.strandedAirWings) || []).map((w) => `${w.file}:${w.state}`).sort();
      rec("⭐⭐⭐ …and names the inherited wing still based in state 4, which no longer exists (BBB_air 4)", stranded.join() === "BBB_air.txt:4", r && r.strandedAirWings);
      rec("…with a message", /BBB_air\.txt/.test(String(r && r.airWingWarning)), r && r.airWingWarning);
    }

    console.log("\n=== 5. the editor shows those messages (the real client code, run) ===");
    {
      // LF, whatever the checkout wrote: the flushMapSaves needle below spans a line break, and a CRLF copy of map.js (every
      // fresh clone here, with core.autocrlf = true) made it match nothing — 0 characters lifted, section 5 failed.
      const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n");
      const MASKED = maskJsComments(MAP);
      const grab = (needle, endNeedle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf(endNeedle, s); return e < 0 ? "" : MAP.slice(s, e + endNeedle.length); };
      const flush = grab("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
      const gate = grab("async function mapCrashGate", "\n  }");
      const mark = grab("function markSaveBoundary", "\n  }");
      const note = grab("function blankAdjacencyNote", "\n  }");
      const modal = grab("function openMapErrorsModal(", "\n  }");
      rec("flushMapSaves, mapCrashGate, markSaveBoundary, blankAdjacencyNote and openMapErrorsModal lifted",
        flush.length > 500 && gate.length > 300 && mark.length > 80 && note.length > 200 && modal.length > 2000, [flush.length, gate.length, mark.length, note.length, modal.length]);
      const WARN = "2 air wings are based in state 4, which this deleted (history/units/AAA_air.txt).";
      let status = "";
      const sandbox = {
        console, JSON, encodeURIComponent,
        pendingWrites: [{ url: "/api/map/delete-state", body: { stateId: 4 }, meta: {} }],
        paintDiff: new Map(), statusEl: { style: {} }, stateById: new Map(), model: { states: [] }, stagedRiverEdits: [],
        undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0, baseImageData: null, baseImageDataPristine: null,
        setStatus: (s) => { status = String(s); }, setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => "D:/fixture",
        isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
        buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
        orphanedQueuedWrites: () => [], emptyNewStateWrites: () => [], stateFormDirty: () => false, stateFormBaseline: null,
        stageStateWrite: () => {}, remapQueuedStateId: () => {}, provincesBmpNote: () => "", riversPaintNote: () => "", heightmapNote: () => "", STATE_ID_FIELDS: [],
        openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {}, rebuildStagedRiversFromPending: () => {},
        $: () => null, window: { NovaMapRuleLabels: labels },
        fetch: async (url) => ({ json: async () => (String(url).indexOf("/api/map/validate") === 0
          ? { ok: true, errors: 0, warnings: 0, problems: [] }
          : { ok: true, changed: true, airWingWarning: WARN }) }),
      };
      sandbox.globalThis = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(`${mark}\n${gate}\n${note}\n${flush}\nglobalThis.__run = flushMapSaves; globalThis.__gate = mapCrashGate;`, sandbox);
      await sandbox.__run();
      rec("⭐⭐⭐ a Save whose delete-state answer names stranded air wings puts that message on the Save line", status.indexOf(WARN) !== -1, status);
      // The line shows three of a Save's own notes, every ⚠ one first. Two merges' words about their scripts and what they left behind fill it, and a country losing its planes was "…and 2 more".
      const realNote = String(md.deleteState({ modRoot: ownMod(), gameRoot: GAME, dependencyRoots: [], stateId: 4 }).airWingWarning || "");
      status = "";
      await sandbox.__gate({ done: 1, writeWarnings: ["plain one", "plain two", "plain three", "plain four", realNote] });
      rec("⭐⭐ …and a line already holding three other notes still says what deleteState said of the planes", realNote.length > 20 && status.indexOf(realNote) !== -1, status);

      // Auto-fix all: the summary line after the click.
      const GAPNOTE = "1 air wing in a file your mod inherits is still based in state 4 (history/units/BBB_air.txt).";
      let st2 = "";
      const mkEl = () => { const q = new Map(), listeners = {}; return { style: {}, value: "", disabled: false, textContent: "", innerHTML: "", title: "", listeners,
        addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); }, removeEventListener() {}, focus() {}, click() {}, remove() {}, appendChild() {},
        querySelector(sel) { if (!q.has(sel)) q.set(sel, mkEl()); return q.get(sel); } }; };
      const overlays = [];
      const sb2 = {
        console, JSON, encodeURIComponent, window: { NovaMapRuleLabels: labels },
        document: { getElementById: () => null, createElement: () => { const o = mkEl(); overlays.push(o); return o; }, body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
        setTimeout: () => 0, statusEl: { style: {} }, setStatus: (s) => { st2 = String(s); }, modPath: () => "D:/fixture", escHtml: (s) => String(s == null ? "" : s),
        // ⚠️ The note helpers are no longer STUBBED here. Stubbing the three this test knew about meant a
        // fourth (duplicateStatesLeftNote) arriving in public/map.js threw "is not defined" from inside the
        // click's own catch, which reports it as "Auto-fix failed: …" and blames the page. They are lifted
        // from public/map.js instead, derived from what the modal actually calls — see withNoteHelpers below.
        hasPendingMapEdits: () => false, load: async () => {},
        fetch: async (url) => ({ json: async () => (String(url).indexOf("/api/map/auto-fix") === 0
          ? { ok: true, fixes: { stateGaps: { renumbered: [{ from: 4, to: 3 }], residualFiles: [], strandedAirWings: [{ file: "BBB_air.txt", state: 4 }], airWingWarning: GAPNOTE } } }
          : { ok: false }) }),
      };
      sb2.globalThis = sb2;
      vm.createContext(sb2);
      vm.runInContext(P.withNoteHelpers(modal) + "\nglobalThis.__modal = openMapErrorsModal;", sb2);
      sb2.__modal({ ok: true, errors: 1, warnings: 0, problems: [{ severity: "error", rule: "state_id_gap", message: "gap" }] });
      const ov = overlays[overlays.length - 1];
      const fixBtn = ov && ov.querySelector("#mapErrFix");
      for (const fn of ((fixBtn && fixBtn.listeners.click) || [])) await fn({});
      rec("THE CONTROL: Auto-fix's summary reported the renumber", /renumbered 1 state/.test(st2), st2);
      rec("⭐⭐ …and the air wings the renumber left behind", st2.indexOf(GAPNOTE) !== -1, st2);
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\n=== an air wing based in a state that is gone is reported: ${checks} checks, ${fails.length} failed, ${skips} skipped ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
