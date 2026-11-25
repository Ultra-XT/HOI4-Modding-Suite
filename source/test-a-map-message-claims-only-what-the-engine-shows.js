// A map problem says what the game does — not a crash nobody has seen. #a-map-message-matches-what-the-engine-checks
//
// THE DEFECT. Seven map-validator rules told a modder more than the evidence shows. Five promised a crash, one
// blocked Save as a certain crash, and one quoted an engine message that does not exist:
//
//   state_buildings_exceed_slots   error, "HOI4 can crash placing them at game start".
//       hoi4.exe's only text for it, " has too many buildings : ", sits in gamestate.cpp's string block among the
//       periodic consistency checks (" : Inconsistency in owner/controller for #", " has a vassal-relationship when
//       at WAR."). Old World Blues ships history/states/90-State.txt: arms_factory 4 + industrial_complex 8 +
//       dockyard 4 = 16 shared buildings in large_city's 8 slots (12 with its oro_post_war_city modifier), and it
//       launches. Now a warning that names the line the game logs.
//   capital_state_owned_by_other   "selecting that country crashes HOI4".
//       country.cpp logs "Attempting to set capital state #" … ", they dont own it!" — a refusal. The assert beside
//       it ("all nations need a capital!") is about a country with no capital at all. Millennium Dawn ships 1,
//       Novum Vexillum 5, Rise of Nations 4, and all three launch; the crash this was written from (2026-06-13) came
//       in the same edit as a building-slot overflow and was never isolated. Still an error — the capital the files
//       name is refused, Auto-fix repairs it — without the certainty.
//   province_id_gap                "(HOI4 crash)".
//       HOI4 wiki, Map modding: a gap "will not necessarily crash the game"; each province after it takes on the
//       properties of the next id other than its colour. Still an error.
//   province_no_continent          in the FATAL set, so a Save put a type-"save" gate in front of it.
//       "prov %d has no continent" is a plain log literal — no MAP_ERROR prefix — three strings from one that DOES say
//       "This will likely crash the game". The wiki lists it among common errors, and says the game's own
//       auto-generated definitions (a colour with no row) produce it. The FATAL comment called it a wiki-documented
//       hard crash; that page has no such sentence. Still an error, with its Auto-fix and hint.
//   non_land_province_in_state     quoted "province is not a land province but is used in state" as HOI4's text,
//                                  and said "HOI4 crashes on load". 0 occurrences of "not a land province" in 1.19.
//   adjacency_bom                  error, "HOI4 fails to parse it".
//       The exe's only BOM texts are for localisation and credits; the wiki's "without the byte order mark" sentence
//       is under Adjacency rules, about adjacency_rules.txt. Every adjacencies.csv starts with a header row, which
//       is where a BOM would sit. Now a warning that says "may"; the BOM-strip fix stays.
//   state_file_unbalanced_braces   "HOI4 cannot read it" for a MISSING closing brace.
//       Clausewitz closes open blocks at end of file — vanilla's common/ideas/SOV.txt is one "}" short and loads.
//       What goes wrong is where later lines land. (The EXTRA-brace wording is unchanged: not measured.)
//
// How it is checked: severities at EVERY push site read out of map-data.js; FATAL membership from the label
// module; messages from the real functions on fixtures; the Save gate and Mod Health's "Will it crash?" by running
// their client code on the real problem object; the engine facts by reading hoi4.exe when it is installed — a
// missing exe prints SKIP and is never counted as a pass.
//
// ⭐ EXTENDED, batch 8 (#a-map-message-claims-only-what-the-engine-shows, derived). A hand list of seven rules let the rest
// drift: state_id_gap said HOI4 "crashes on launch" where hoi4.exe refuses to load ("Failed to load the map", 0x1401E4A42);
// province_no_pixels said HOI4 "fails to load the map" where GenerateBoundingBoxes logs and carries on; buildings_empty,
// bmp_not_24bit and bmp_bad_dimensions stated the wiki's crash as fact or claimed a refusal nobody has seen; two non-fatal
// messages quoted or promised a failed load hoi4.exe does not show ("province does not exist", "crash the map load"); a merge
// refusal said "otherwise the game crashes on start"; and Mod Health said "yes: N problem(s) that stop HOI4 loading or crash on
// Play" for all twenty FATAL rules. Section 5 READS EVERY `rule: "…"` push site in map-data.js with the message beside it, and
// every FIX_HINTS entry of a FATAL rule, and holds each to what FATAL_OUTCOME records for its rule. Section 6 runs mergeState's
// refusal and Mod Health's panel. Section 1 also re-reads, on build 1.20.0.0, the code behind the four "untested" map rules
// (first traced on 1.19.2; every address re-derived on 1.19.3, 55,778,424 bytes, on 2026-09-30, and again on 1.19.4.1 —
// Operation Postern v1.19.4.1.99a5, 56,530,040 bytes — on 2026-10-30, the same code relocated. 1.19.4.0, 56,529,528 bytes,
// which Steam installed on 2026-10-27 and replaced with 1.19.4.1 on 2026-10-30, held it all at the same addresses but for
// the assert handler and the twin getter's one caller).
// Re-derived on 1.20.0.0 (Operation Postern v1.20.0.0.8873 (0c4f), 56,556,664 bytes) on 2026-11-20: the same code relocated.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 320)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-claims-home-"));
process.env.NOVA_HOME_DIR = HOME;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const tmps = [HOME];
const NOGAME = path.join(os.tmpdir(), "nova-claims-no-game-dir");
const EXE = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/hoi4.exe";

// The seven rules this file is about, and the severity each must carry at every place it is pushed.
const EXPECT = {
  state_buildings_exceed_slots: "warning",
  capital_state_owned_by_other: "error",
  province_id_gap: "error",
  province_no_continent: "error",
  non_land_province_in_state: "error",
  adjacency_bom: "warning",
  state_file_unbalanced_braces: "error",
};
// Wording that promises a certain failure. A message may still say a crash is POSSIBLE ("not necessarily").
const CERTAIN = /\bcrashes\b|\bwill crash\b|\(HOI4 crash\)|\bcan crash\b|\bfails to parse\b|\bcannot read it\b|\bfails the map build\b/i;

// Every `rule: "<name>"` in the code, with the severity written beside it in the same object literal.
function emissionSeverities(src) {
  const out = [];
  const re = /rule:\s*"([a-z0-9_]+)"/g;
  let m;
  while ((m = re.exec(src))) {
    const before = src.slice(Math.max(0, m.index - 160), m.index);
    const a = /severity:\s*"([a-z]+)"\s*,\s*$/.exec(before);
    let sev = a ? a[1] : null;
    if (!sev) {
      const b = /^rule:\s*"[a-z0-9_]+"\s*,\s*severity:\s*"([a-z]+)"/.exec(src.slice(m.index, m.index + 200));
      sev = b ? b[1] : null;
    }
    out.push({ rule: m[1], severity: sev, line: src.slice(0, m.index).split("\n").length });
  }
  return out;
}

// Every NUL-delimited literal in the binary that contains `needle`.
function literalsContaining(buf, needle) {
  const out = [];
  const nb = Buffer.from(needle, "latin1");
  let at = buf.indexOf(nb);
  while (at !== -1 && out.length < 50) {
    let s = at; while (s > 0 && buf[s - 1] !== 0) s--;
    let e = at + nb.length; while (e < buf.length && buf[e] !== 0) e++;
    out.push(buf.slice(s, e).toString("latin1"));
    at = buf.indexOf(nb, e);
  }
  return out;
}

function newMod(files) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-claims-mod-")); tmps.push(d);
  for (const [rel, body] of Object.entries(files)) {
    const p = path.join(d, ...rel.split("/"));
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  }
  return d;
}
const one = (probs, rule) => probs.filter((p) => p && p.rule === rule);

const GOOD_STATE = [
  "state = {", "\tid = 9001", '\tname = "STATE_9001"', "\tmanpower = 100", "\tstate_category = rural",
  "\thistory = {", "\t\towner = ENG", "\t\tbuildings = {", "\t\t\tinfrastructure = 3", "\t\t}", "\t}",
  "\tprovinces = {", "\t\t900001 900002", "\t}", "}", "",
].join("\n");

(async () => {
  try {
    console.log("\n=== 🎮 the engine's own words (hoi4.exe, read-only) ===");
    let exe = null;
    try { exe = fs.readFileSync(EXE); } catch (_) { exe = null; }
    if (!exe) {
      skip("hoi4.exe is not installed at " + EXE + " — the engine facts below did NOT run");
    } else {
      const slots = literalsContaining(exe, "has too many buildings");
      rec("slots: hoi4.exe has \" has too many buildings : \"", slots.some((s) => s === " has too many buildings : "), slots);
      rec("…with no crash wording", slots.length > 0 && slots.every((s) => !/crash/i.test(s)), slots);
      const periodic = exe.indexOf(Buffer.from(" : Inconsistency in owner/controller for #", "latin1"));
      const at = exe.indexOf(Buffer.from(" has too many buildings : ", "latin1"));
      rec("…a few bytes from the periodic owner/controller consistency check", periodic > 0 && at > periodic && at - periodic < 0x100, { periodic, at });

      const refuse = literalsContaining(exe, "they dont own it");
      rec("capital: hoi4.exe refuses a capital the country does not own (\", they dont own it!\")", refuse.some((s) => s === ", they dont own it!"), refuse);
      rec("…beside \"Attempting to set capital state #\"", literalsContaining(exe, "Attempting to set capital state #").length > 0);

      const cont = literalsContaining(exe, "has no continent");
      rec("continent: the literal is exactly \"prov %d has no continent\"", cont.some((s) => s === "prov %d has no continent"), cont);
      rec("…with no MAP_ERROR prefix and no crash wording", cont.length > 0 && cont.every((s) => !/MAP_ERROR|crash/i.test(s)), cont);
      const port = literalsContaining(exe, "has no port building in the nudger");
      rec("THE CONTROL: where the engine expects a crash it says so (the coastal-no-port literal)", port.some((s) => /will likely crash/i.test(s)), port);

      rec("sea-in-state: \"not a land province\" appears nowhere in hoi4.exe", literalsContaining(exe, "not a land province").length === 0,
        literalsContaining(exe, "not a land province"));
      rec("THE CONTROL: the scan does find the nearby script text \"non-land province\"", literalsContaining(exe, "non-land province").length > 0);

      const bom = literalsContaining(exe, "utf-8-bom");
      rec("bom: hoi4.exe has BOM texts at all", bom.length > 0, bom);
      rec("…and every one is about localisation or credits, none about adjacencies", bom.length > 0 && bom.every((s) => /locali[sz]ation|credits/i.test(s) && !/adjacenc/i.test(s)), bom);

      // #the-untested-fatal-map-rules-traced — the code behind the messages section 5 holds to their classes.
      if (exe.length !== 56556664) {
        skip("hoi4.exe is not build 1.20.0.0 (56,556,664 bytes) — the code sites of state_id_gap and the four untested map rules did NOT run");
      } else {
        const pe = exe.readUInt32LE(0x3c), nSec = exe.readUInt16LE(pe + 6), optSize = exe.readUInt16LE(pe + 20), opt = pe + 24;
        const IB = Number(exe.readBigUInt64LE(opt + 24));
        const secs = []; for (let i = 0; i < nSec; i++) { const s = opt + optSize + i * 40; secs.push({ va: exe.readUInt32LE(s + 12), size: exe.readUInt32LE(s + 16), raw: exe.readUInt32LE(s + 20), vsize: exe.readUInt32LE(s + 8), exec: !!(exe.readUInt32LE(s + 36) & 0x20000000) }); }
        const off = (va) => { const rva = va - IB, s = secs.find((x) => rva >= x.va && rva < x.va + x.size); return s ? rva - s.va + s.raw : -1; };
        const hex = (va, n) => exe.slice(off(va), off(va) + n).toString("hex");
        const jumpTo = (va) => { const o = off(va); return exe[o] === 0xe8 || exe[o] === 0xe9 ? va + 5 + exe.readInt32LE(o + 1) : -1; };
        const leaText = (va) => { const o = off(va); if ((exe[o] & 0xfb) !== 0x48 || exe[o + 1] !== 0x8d) return null; const t = off(va + 7 + exe.readInt32LE(o + 3)); let e = t; while (e < exe.length && exe[e]) e++; return exe.toString("latin1", t, e); };
        const callsIn = (lo, hi, target) => { const out = []; for (let va = lo; va + 5 <= hi; va++) { const o = off(va); if (exe[o] === 0xe8 && va + 5 + exe.readInt32LE(o + 1) === target) out.push(va); } return out; };
        const jccTo = (va) => { const o = off(va); if (exe[o] === 0x0f && (exe[o + 1] & 0xf0) === 0x80) return va + 6 + exe.readInt32LE(o + 2); if ((exe[o] & 0xf0) === 0x70 || exe[o] === 0xeb) return va + 2 + exe.readInt8(o + 1); return -1; };
        // 1.20.0.0 addresses (1.19.4.1's beside each), every one re-derived from the string or call that anchors it.
        const FAIL_LOAD = 0x140202130;   // 1.19.4.1: 0x140201F90
        rec("THE SCANNER'S CONTROL: it finds the map check's call to the failed-load path (0x1401E4A42 → 0x140202130)", callsIn(0x1401E4A20, 0x1401E4A60, FAIL_LOAD).includes(0x1401E4A42));
        rec("state_id_gap: the state pass logs \"MAP_ERROR: Definition for state id \" (0x1401E674F), and the map check fails the load on it — a refusal",
          /^MAP_ERROR: Definition for state id /.test(String(leaText(0x1401E674F))) && jumpTo(0x1401E4A42) === FAIL_LOAD, leaText(0x1401E674F));
        rec("province_no_pixels: GenerateBoundingBoxes logs \" has no pixels in provinces.bmp\" (0x140AB3B4D) and never calls the failed-load path",
          leaText(0x140AB3B4D) === " has no pixels in provinces.bmp" && callsIn(0x140AB2A20, 0x140AB3D79, FAIL_LOAD).length === 0, leaText(0x140AB3B4D));
        rec("map_x_crossing: map.cpp logs \"Map invalid X crossing. Please fix pixels at coords: \" (0x140AB1548) and never calls the failed-load path",
          leaText(0x140AB1548) === "Map invalid X crossing. Please fix pixels at coords: " && callsIn(0x140AB10A0, 0x140AB167D, FAIL_LOAD).length === 0, leaText(0x140AB1548));
        rec("capital_state_missing: country.cpp refuses it (\", it is not a valid state!\", 0x14075A277) and never calls the failed-load path",
          leaText(0x14075A277) === ", it is not a valid state!" && callsIn(0x14075A0D0, 0x14075A400, FAIL_LOAD).length === 0, leaText(0x14075A277));
        // #the-capital-assert-behind-the-byte — 1.19.2's capital getters 0x1406DFDA0 / 0x1406DFE30 were 0x1406EC950 and its
        // twin 0x1406EC9E0 in 1.19.3, and are 0x1407344B0 and 0x140734540 in 1.19.4.1, laid out exactly as before: the gate 9
        // bytes in, the null return 0x64 in, the twin 0x90 after. Each fetches the capital from GetCapitalState 0x140734370
        // and, ONLY when the internal assert byte is set (0x14368F611 in 1.19.4.1, compared with 0 at 18,507 sites), asserts
        // pCapitalState && "all nations need a capital!" on a null one. With the byte clear (a normal launch) the null comes
        // back and nothing asserts. Each fact is decoded, not just found: a gate is `cmp byte [assert byte],0` straight after
        // the call that fetched the capital, and the assert sits inside what that gate's `je` jumps over.
        // ⚠️ 1.19.4.1 CARRIES NONE OF THE GAME'S OWN SOURCE PATHS. 1.19.3's assert passed "…\geography\country.cpp" as its file
        // argument (lea rdx, 0x24 into the getter); in 1.19.4.1 the file the game's log and assert calls pass is one blank
        // literal, 0x14279471D, loaded by 45,655 LEAs (in 18,140 .pdata functions and 23 places outside any), and no
        // "country.cpp", "map.cpp" or "state.cpp" is left in the exe, in ASCII or UTF-16 (the only .cpp paths left are a few
        // UTF-16 ones in engine-library asserts: pdx_core's md5.cpp, physfs.cpp, …). So the getter can no longer be tied to
        // country.cpp by its file name. The check still reads the blank, and that it is the same argument SetCapital's own
        // country.cpp log line passes (lea r8, 0x140759039), but that ties it to nothing — 45,655 LEAs load it. What
        // identifies the pair is the assert text, and the check after the twin's holds that exactly two LEAs in the whole
        // image load it: theirs.
        const ASSERT_BYTE = 0x143695AA1, ASSERT_FN = 0x14254E310, GET_CAPITAL_STATE = 0x140735560;   // 1.19.4.1: 0x14368F611, 0x14254AA00, 0x140734370 (the handler was 0x14254A6B0 in 1.19.4.0)
        const CAPITAL_ASSERT = "pCapitalState && \"all nations need a capital!\"";
        const GETTER = 0x1407356A0, TWIN = 0x140735730;   // 1.19.4.1: 0x1407344B0, 0x140734540
        const leaTarget = (va) => va + 7 + exe.readInt32LE(off(va) + 3);
        const H = (n) => "0x" + n.toString(16).toUpperCase();
        const fnStart = (va) => exe[off(va) - 1] === 0xcc;
        const gateAfterFetch = (va) => hex(va, 2) === "803d" && va + 7 + exe.readInt32LE(off(va) + 2) === ASSERT_BYTE && hex(va + 6, 1) === "00"
          && hex(va - 5, 1) === "e8" && jumpTo(va - 5) === GET_CAPITAL_STATE;
        {
          // the getter is one .pdata piece, GETTER..end: int3 before it, a tail `jmp` as its last instruction, int3 after
          const gate = 0x1407356A9, je = gate + 7, test = 0x1407356BB, lea = 0x1407356DA, call = 0x1407356F1, nul = 0x140735704, end = 0x140735722;
          rec("capital_state_missing: its capital getter 0x1407356A0 asserts pCapitalState && \"all nations need a capital!\" (LEA 0x1407356DA, call 0x14254E310 at 0x1407356F1) only when the assert byte 0x143695AA1 is set (0x1407356A9), otherwise returning null (0x140735704 xor eax,eax)",
            fnStart(GETTER) && hex(GETTER, 4) === "4883ec38" && gate - GETTER === 9 && nul - GETTER === 0x64 && gateAfterFetch(gate)
              && hex(je, 1) === "74" && jccTo(je) === 0x14073570B && hex(0x14073570B, 3) === "4885c0" && hex(0x14073570E, 1) === "74" && jccTo(0x14073570E) === nul
              && gate < test && hex(test, 3) === "4885c0" && hex(test + 3, 1) === "75" && jccTo(test + 3) === 0x140735710
              && hex(0x1407356C4, 3) === "488d15" && leaText(0x1407356C4) === "" && leaTarget(0x1407356C4) === leaTarget(0x14075A229) && hex(0x14075A229, 3) === "4c8d05"
              && gate < lea && lea < call && call < jccTo(je) && hex(lea, 3) === "488d0d" && leaText(lea) === CAPITAL_ASSERT
              && hex(call, 1) === "e8" && jumpTo(call) === ASSERT_FN && hex(nul, 7) === "33c04883c438c3"
              && hex(end - 5, 1) === "e9" && exe[off(end)] === 0xcc && JSON.stringify(callsIn(GETTER, end, ASSERT_FN)) === JSON.stringify([call]),
            { gate: hex(gate, 7), lea: leaText(lea), file: JSON.stringify(leaText(0x1407356C4)), assertCalls: callsIn(GETTER, end, ASSERT_FN).map(H), nul: hex(nul, 7) });
        }
        {
          const gate = 0x14073574B, je = gate + 10, test = 0x140735760, lea = 0x14073577F, call = 0x140735796;
          rec("…and so does its twin 0x140735730, 0x90 after it as in 1.19.2 and 1.19.3: the same fetch, the same gate (0x14073574B), the same text (LEA 0x14073577F) and handler (0x140735796); with the byte clear a null capital goes straight to its epilogue (0x1407357B5 test rbx,rbx -> 0x140735AF1)",
            fnStart(TWIN) && TWIN - GETTER === 0x90 && JSON.stringify(callsIn(TWIN, gate, GET_CAPITAL_STATE)) === JSON.stringify([gate - 5]) && gateAfterFetch(gate)
              && hex(gate + 7, 3) === "488bd8" && hex(je, 1) === "74" && jccTo(je) === 0x1407357B5
              && hex(0x1407357B5, 3) === "4885db" && hex(0x1407357B8, 2) === "0f84" && jccTo(0x1407357B8) === 0x140735AF1 && hex(0x140735AF1, 4) === "4883c440" && hex(0x140735AF9, 1) === "c3"
              && gate < test && hex(test, 3) === "4885c0" && hex(test + 3, 1) === "75"
              && gate < lea && lea < call && call < jccTo(je) && hex(lea, 3) === "488d0d" && leaText(lea) === CAPITAL_ASSERT && hex(call, 1) === "e8" && jumpTo(call) === ASSERT_FN,
            { gate: hex(gate, 7), je: hex(je, 2), lea: leaText(lea), handler: H(jumpTo(call)) });
        }
        // One pass over the code: every E8 / E9 that reaches either getter, and every RIP-relative LEA (REX.W 8D, modrm
        // mod=00 rm=101) that loads the assert text the getter's own LEA points at.
        const ASSERT_TEXT_AT = leaTarget(0x1407356DA);
        const refs = { [GETTER]: [], [TWIN]: [] }, textLeas = [];
        for (const s of secs) {
          if (!s.exec) continue;
          for (let p = s.raw, e = s.raw + Math.min(s.size, s.vsize) - 5; p < e; p++) {
            const va = IB + s.va + (p - s.raw);
            if ((exe[p] & 0xfb) === 0x48 && exe[p + 1] === 0x8d && (exe[p + 2] & 0xc7) === 5 && va + 7 + exe.readInt32LE(p + 3) === ASSERT_TEXT_AT) textLeas.push(va);
            if (exe[p] !== 0xe8 && exe[p] !== 0xe9) continue;
            const t = va + 5 + exe.readInt32LE(p + 1);
            if (t === GETTER || t === TWIN) refs[t].push(va);
          }
        }
        rec("…and that assert text is the pair's fingerprint: exactly two LEAs in the whole image load it, the getter's (0x1407356DA) and the twin's (0x14073577F), which is what ties the two together now that no country.cpp path does",
          leaText(0x1407356DA) === CAPITAL_ASSERT && JSON.stringify(textLeas) === JSON.stringify([0x1407356DA, 0x14073577F]),
          { text: leaText(0x1407356DA), at: H(ASSERT_TEXT_AT), leas: textLeas.map(H) });
        // (the twin's one caller, a tail jump, was 0x1418CE0FB in 1.19.3 and 0x1419594FB in 1.19.4.0; the thunk was 0x1406CF240 in 1.19.3)
        rec("…and 38 call sites reach the two, the count 1.19.2's and 1.19.3's traces gave: 37 to the getter (36 calls and the one-jmp thunk 0x140717F10), 1 to the twin (the tail jump 0x14195CECB)",
          refs[GETTER].length === 37 && refs[GETTER].filter((va) => hex(va, 1) === "e8").length === 36 && refs[GETTER].includes(0x140717F10) && hex(0x140717F10, 1) === "e9"
            && refs[TWIN].length === 1 && refs[TWIN][0] === 0x14195CECB && hex(0x14195CECB, 1) === "e9",
          { getter: refs[GETTER].length, calls: refs[GETTER].filter((va) => hex(va, 1) === "e8").length, twin: refs[TWIN].map(H) });
        // GetCapitalState itself, the function both getters call: it range-tests the capital id and hands out null for
        // one out of range. map-rule-labels.js's capital_state_missing note rests on this.
        rec("GetCapitalState 0x140735560 reads the capital id back (movsxd rax,[rdi+1018h], 0x140735664), range-tests it (cmp eax,1 / jl, 0x140735670; cmp eax,[gamestate+2D4h] / jge, 0x14073567C) and returns null for one out of range (0x140735697 xor eax,eax); an id in range returns its state-table slot (0x140735687, 0x14073568E)",
          fnStart(GET_CAPITAL_STATE) && hex(0x140735664, 7) === "48638718100000"
            && hex(0x140735670, 3) === "83f801" && hex(0x140735673, 1) === "7c" && jccTo(0x140735673) === 0x140735697
            && hex(0x14073567C, 6) === "3b82d4020000" && hex(0x140735682, 1) === "7d" && jccTo(0x140735682) === 0x140735697
            && hex(0x140735687, 7) === "488b82c8020000" && hex(0x14073568E, 4) === "488b04c8" && hex(0x140735692, 5) === "4883c438c3"
            && hex(0x140735697, 7) === "33c04883c438c3" && exe[off(0x14073569E)] === 0xcc,
          [hex(0x140735664, 7), hex(0x140735670, 5), hex(0x14073567C, 8), hex(0x140735697, 7)]);
        rec("strategic_region_id_gap: a missing region id is a null slot the border manager tests (0x140FC08B7 test rbp,rbp) and logs as \"Hole in Strategic Regions DB at ID = \" (0x140FC08E8)",
          hex(0x140FC08B7, 3) === "4885ed" && leaText(0x140FC08E8) === "Hole in Strategic Regions DB at ID = ", leaText(0x140FC08E8));
        rec("…while the map check's region pass reads every slot (0x1401E6577 mov rcx,[rsi+rax]) and dereferences it with no null test (0x1401E657B cmp qword [rcx+0A0h],0)",
          hex(0x1401E6577, 4) === "488b0c06" && hex(0x1401E657B, 8) === "4883b9a000000000", [hex(0x1401E6577, 4), hex(0x1401E657B, 8)]);
      }
    }

    console.log("\n=== 1. severities at every push site, read out of map-data.js ===");
    {
      const src = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
      const sites = emissionSeverities(src);
      const c1 = emissionSeverities('problems.push({ severity: "warning", rule: "adjacency_bom", file: "x" })');
      rec("THE CONTROL: the reader sees a push's severity", c1.length === 1 && c1[0].severity === "warning", c1);
      for (const [rule, sev] of Object.entries(EXPECT)) {
        const mine = sites.filter((s) => s.rule === rule);
        rec(`${rule}: pushed somewhere`, mine.length > 0, mine.length);
        const wrong = mine.filter((s) => s.severity !== sev);
        rec(`${rule}: ${sev} at every one of its ${mine.length} push site(s)`, mine.length > 0 && wrong.length === 0,
          wrong.map((s) => `map-data.js:${s.line} is ${s.severity}`));
      }
    }

    console.log("\n=== 2. none of them is in the curated FATAL set ===");
    {
      for (const rule of Object.keys(EXPECT)) rec(`${rule} does not gate Save`, labels.isFatalRule(rule) === false, [...labels.FATAL]);
      const hint = labels.mapRuleFixHint("province_no_continent");
      rec("⭐⭐ province_no_continent keeps its fix hint", hint.length > 15, hint);
      rec("…and the hint no longer says the game fails the map build", !CERTAIN.test(hint) && !/crash/i.test(hint), hint);
      const liveFatal = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map-rule-labels.js"), "utf8"));
      const setBody = (/const FATAL = new Set\(\[([\s\S]*?)\]\)/.exec(liveFatal) || [])[1] || "";
      rec("THE CONTROL: the FATAL set's source was found", /"map_x_crossing"/.test(setBody), setBody.slice(0, 80));
      rec("…and its live code does not list province_no_continent", setBody.length > 0 && !/"province_no_continent"/.test(setBody));
    }

    console.log("\n=== 3. the messages, from the real functions ===");
    // A. slots — the Old World Blues shape: 16 shared buildings in 8 slots.
    {
      const p = one(md.validateMapModel({
        states: [{ id: 90, provinces: [1], category: "large_city", buildings: { arms_factory: 4, industrial_complex: 8, dockyard: 4 } }],
        categorySlots: { large_city: 8 },
      }), "state_buildings_exceed_slots")[0];
      rec("A. 16 shared buildings in 8 slots is reported", !!p, p);
      rec("A. …as a warning", !!p && p.severity === "warning", p && p.severity);
      rec("A. …without promising a crash", !!p && !CERTAIN.test(p.message) && !/crash/i.test(p.message), p && p.message);
      rec("A. …naming what the game logs while it runs", !!p && /has too many buildings/.test(p.message), p && p.message);
    }
    // B. capital owned by another country.
    {
      const p = one(md.validateMapModel({
        states: [{ id: 10, provinces: [1], owner: "AAA" }, { id: 11, provinces: [2], owner: "BBB" }],
        capitals: { AAA: 11, BBB: 11 },
      }), "capital_state_owned_by_other")[0];
      rec("B. a land-owning country whose capital another owns is reported", !!p, p);
      rec("B. …still as an error", !!p && p.severity === "error", p && p.severity);
      rec("B. …without promising a crash", !!p && !CERTAIN.test(p.message) && !/crash/i.test(p.message), p && p.message);
      rec("B. …saying the game refuses that capital and logs it", !!p && /refuse/i.test(p.message) && /they dont own it/.test(p.message), p && p.message);
    }
    // C. a gap in definition.csv.
    {
      const mod = newMod({ "map/definition.csv": "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;1\n3;30;30;30;land;false;plains;1\n" });
      const p = one(md.validateMapFiles({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }), "province_id_gap")[0];
      rec("C. a missing province id is reported", !!p && (p.missing || []).includes(2), p);
      rec("C. …still as an error", !!p && p.severity === "error", p && p.severity);
      rec("C. …without \"(HOI4 crash)\" or any certainty", !!p && !CERTAIN.test(p.message), p && p.message);
      rec("C. …saying what a gap does: later provinces take the next id's properties", !!p && /next id/i.test(p.message) && /not necessarily/i.test(p.message), p && p.message);
    }
    // D. land with no continent.
    let continentProblem = null;
    {
      const p = one(md.validateMapModel({ states: [{ id: 1, provinces: [10] }], provinces: [
        { id: 0, r: 0, g: 0, b: 0, type: "land", continent: 0 },
        { id: 10, r: 1, g: 2, b: 3, type: "land", continent: 0 },
      ] }), "province_no_continent")[0];
      continentProblem = p || null;
      rec("D. a land province on continent 0 is reported", !!p && (p.provinces || []).includes(10), p);
      rec("D. …still as an error", !!p && p.severity === "error", p && p.severity);
      rec("D. …quoting the log line, not a failed build", !!p && !CERTAIN.test(p.message) && /prov/i.test(p.message) && /has no continent/.test(p.message), p && p.message);
    }
    // G. a sea province inside a state.
    {
      const p = one(md.validateMapModel({
        provinces: [{ id: 10, type: "land", r: 1, g: 2, b: 3, continent: 1 }, { id: 99, type: "sea", r: 7, g: 8, b: 9, continent: 0 }],
        provinceToState: { 10: 1, 99: 1 }, states: [{ id: 1, name: "S1", provinces: [10, 99] }], capitals: {},
      }), "non_land_province_in_state")[0];
      rec("G. a sea province in a state is reported", !!p, p);
      rec("G. …still as an error", !!p && p.severity === "error", p && p.severity);
      rec("G. …without promising a crash on load", !!p && !CERTAIN.test(p.message) && !/crash/i.test(p.message), p && p.message);
      const quote = "not a land province" + " but is used in state";   // split so this file does not match itself
      for (const f of ["map-data.js", "server.js"]) {
        const raw = fs.readFileSync(path.join(__dirname, f), "utf8");
        rec(`G. ${f} no longer quotes an engine message hoi4.exe does not contain`, raw.indexOf(quote) === -1, raw.indexOf(quote));
      }
    }
    // H. a BOM on adjacencies.csv.
    {
      const mod = newMod({ "map/adjacencies.csv": "\uFEFFFrom;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n2;3;sea;-1;-1;-1;-1;-1;;\n" });
      const p = one(md.validateMapFiles({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [] }), "adjacency_bom")[0];
      rec("H. a BOM on adjacencies.csv is reported", !!p, p);
      rec("H. …as a warning", !!p && p.severity === "warning", p && p.severity);
      rec("H. …that says it MAY cause trouble, not that parsing fails", !!p && /\bmay\b/i.test(p.message) && !CERTAIN.test(p.message), p && p.message);
      rec("H. …and still offers the fix", !!p && /Auto-fix/.test(p.message), p && p.message);
    }
    // I. unbalanced braces in a state file.
    {
      const missing = GOOD_STATE.replace("\t\t\tinfrastructure = 3\n\t\t}", () => "\t\t\t# infrastructure = 3\n\t\t#\t\t}");
      rec("I. THE CONTROL: the missing-brace fixture really is one short", missing !== GOOD_STATE);
      const pm = one(md.findStateFileConflicts(newMod({ "history/states/9001-Test.txt": missing })), "state_file_unbalanced_braces")[0];
      rec("I. a file one \"}\" short is reported", !!pm, pm);
      rec("I. …still as an error", !!pm && pm.severity === "error", pm && pm.severity);
      rec("I. …not as a file HOI4 cannot read", !!pm && !CERTAIN.test(pm.message) && !/will not load/i.test(pm.message), pm && pm.message);
      rec("I. …but as one whose later lines land inside the wrong block", !!pm && /end of the file/i.test(pm.message) && /wrong block|inside/i.test(pm.message), pm && pm.message);
      const pe = one(md.findStateFileConflicts(newMod({ "history/states/9001-Test.txt": GOOD_STATE + "}\n" })), "state_file_unbalanced_braces")[0];
      rec("I. an EXTRA \"}\" keeps its own wording (not measured, not changed)", !!pe && /closes a brace it never opened/.test(pe.message), pe && pe.message);
    }

    console.log("\n=== 4. a Save that leaves only a continent-0 province — the REAL client code, run ===");
    if (!continentProblem) {
      rec("the continent problem exists to feed the client", false, null);
    } else {
      const v = { ok: true, problems: [continentProblem], errors: 1, warnings: 0 };
      {
        const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
        const MASKED = maskJsComments(MAP);
        const grab = (needle) => { const s = MASKED.indexOf(needle); if (s < 0) return ""; const e = MASKED.indexOf("\n  }", s); return e < 0 ? "" : MAP.slice(s, e + 4); };
        const gate = grab("async function mapCrashGate");
        const modal = grab("function openMapErrorsModal(");
        rec("mapCrashGate lifted", gate.length > 300, gate.length);
        rec("openMapErrorsModal lifted", modal.length > 2000, modal.length);
        let status = "";
        const overlays = [];
        const el = () => ({ style: {}, value: "", disabled: false, textContent: "", innerHTML: "", title: "",
          addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, remove() {}, appendChild() {}, querySelector: () => el() });
        const sandbox = {
          console, JSON, encodeURIComponent,
          window: { NovaMapRuleLabels: labels },
          document: { getElementById: () => null, createElement: () => { const o = el(); overlays.push(o); return o; },
            body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
          setTimeout: () => 0,
          statusEl: { style: {} },
          setStatus: (s) => { status = String(s); },
          modPath: () => "D:/fixture",
          escHtml: (s) => String(s == null ? "" : s),
          hasPendingMapEdits: () => false,
          fetch: async (url) => ({ json: async () => (String(url).indexOf("/api/map/validate") === 0 ? v : {}) }),
        };
        sandbox.globalThis = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(`${modal}\n${gate}\nglobalThis.__gate = mapCrashGate;`, sandbox);
        await sandbox.__gate({ done: 1 });
        const html = overlays.map((o) => o.innerHTML).join("\n");
        rec("THE CONTROL: the gate ran and said something", status.length > 0, status);
        rec("⭐⭐⭐ the status line does not call it a crash", !/will crash/i.test(status), status);
        rec("⭐⭐ …and the popup is not the type-\"save\" gate", overlays.length > 0 && !/id="mapErrGateInput"/.test(html), html.slice(0, 200));
        rec("…while still listing it among the errors", /no continent/.test(html), html.slice(0, 200));
      }
      {
        const panel = { innerHTML: "", insertAdjacentHTML() {} };
        let runFn = null;
        const sandbox = {
          console, JSON, encodeURIComponent,
          window: { NovaMapRuleLabels: labels },
          localStorage: { getItem: () => "D:/fixture-mod" },
          document: { readyState: "complete", addEventListener() {}, getElementById: (id) => (id === "mhCrashCheck" ? panel : null) },
          setTimeout: (fn) => { runFn = fn; return 0; },
          fetch: async (url) => ({ json: async () => {
            const u = String(url);
            if (u.indexOf("/api/root") === 0) return { hoi4GameRoot: "D:/fixture-game" };
            if (u.indexOf("/api/map/validate") === 0) return v;
            if (u.indexOf("/api/modversion") === 0) return { ok: true, severity: "ok" };
            if (u.indexOf("/api/modhealth/loc-check") === 0) return { ok: true, problems: [] };
            return {};
          } }),
        };
        sandbox.globalThis = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(fs.readFileSync(path.join(__dirname, "public", "modhealth-crashcheck.js"), "utf8"), sandbox);
        if (runFn) await runFn();
        const text = panel.innerHTML.replace(/<[^>]+>/g, " ");
        rec("THE CONTROL: Mod Health rendered a verdict", /Will it crash\?/.test(text), text.slice(0, 160));
        rec("⭐⭐⭐ Mod Health does not say it will crash", !/Will it crash\? — yes/.test(text), text.slice(0, 200));
      }
    }

    console.log("\n=== 5. EVERY map rule's message, and every FATAL rule's fix hint, claims only what its evidence shows — DERIVED from source ===");
    {
      // A crash, a failed load, or a refusal claimed in a sentence, and what makes such a sentence someone else's claim or a
      // stated unknown. A quoted engine line that itself says "will likely crash" carries its "likely".
      const CRASH = /\bcrash(es|ed)?\b|divides? by zero|divide-by-zero/i;
      // ⭐⭐ "refuses to load" was the only spelling of a refusal either pattern knew, so "HOI4 refuses such a map" --
      // the exact wording state_no_air_base_or_rocket_site's own message used -- walked straight past both. A non-fatal
      // rule could tell a modder the game refuses its map and nothing here would say a word. REFUSAL is shared by both
      // so the two can never drift apart again.
      const REFUSAL = /refuses? (?:to load|such a map|the map|that map|the mod's map|your map)/;
      const LOADCLAIM = new RegExp(/fails? to load the map|won't load the map|will not load the map|Failed to load the map|aborts? loading|stops? loading/.source + "|" + REFUSAL.source, "i");
      const CERTAIN = new RegExp(/\bcrashes\b|\bwill crash\b|crash the map load|fails? to load the map|aborts? loading|won't load the map|will not load the map/.source + "|" + REFUSAL.source, "i");
      // …and a sentence that reports a NON-observation is not a claim. "has never been seen", "not known to", "played on"
      // are how the withdrawn refusals are now written, and they are stated unknowns exactly as "untested" is.
      const ATTRIB = /\bwiki\b|no launch|launch-tested|launch test|untested|not necessarily|\blikely\b|not been traced|never once been seen|never been seen|not known to|played on|has not been seen/i;
      // `${…}` spans become N (balanced), so a sentence split is not thrown off by the code inside them.
      const untemplate = (m) => { let out = "", i = 0; const s = String(m || ""); while (i < s.length) { if (s[i] === "$" && s[i + 1] === "{") { let d = 1, j = i + 2; for (; j < s.length && d; j++) { if (s[j] === "{") d++; else if (s[j] === "}") d--; } out += "N"; i = j; } else out += s[i++]; } return out; };
      const sentences = (m) => untemplate(m).split(/(?<=[.!?])\s+(?=[A-Z"“(])/);
      // Every `rule: "<name>"` in map-data.js and the string or template literal written as `message:` beside it — before the next
      // rule literal and not past a new problems.push( — sliced from the unmasked text at the masked text's offsets.
      const messageSites = (raw) => {
        const src = maskJsComments(raw);
        const starts = [];
        const re = /rule:\s*"([a-z0-9_]+)"/g;
        let sm;
        while ((sm = re.exec(src))) starts.push({ rule: sm[1], at: sm.index, end: sm.index + sm[0].length });
        return starts.map((s, i) => {
          const zone = src.slice(s.end, Math.min(i + 1 < starts.length ? starts[i + 1].at : src.length, s.end + 6000));
          const mm = /message:\s*([`"'])/.exec(zone);
          const push = zone.search(/problems\.push\(/);
          const line = src.slice(0, s.at).split("\n").length;
          if (!mm || (push !== -1 && push < mm.index)) return { rule: s.rule, line, message: null };
          const q = mm[1], from = s.end + mm.index + mm[0].length;
          let j = from, depth = 0;
          for (; j < src.length; j++) {
            const c = src[j];
            if (c === "\\") { j++; continue; }
            if (depth > 0) { if (c === "{") depth++; else if (c === "}") depth--; continue; }
            if (q === "`" && c === "$" && src[j + 1] === "{") { depth = 1; j++; continue; }
            if (c === q) break;
          }
          return { rule: s.rule, line, message: raw.slice(from, j) };
        });
      };
      const ctl = messageSites('problems.push({ severity: "error", rule: "x_rule", coords: a.map((c) => ({ x: c.x })),\n  message: `A ${b ? `c ${d}` : ""} e.` });\nproblems.push({ severity: "error", rule: "y_rule" });');
      rec("THE CONTROL: the reader finds a template message past a `})` and inner templates, and none for a push without one",
        ctl.length === 2 && ctl[0].message === 'A ${b ? `c ${d}` : ""} e.' && ctl[1].message === null, ctl);
      rec("THE CONTROL: a sentence claiming a crash with no attribution is caught, and the wiki's is not",
        sentences("It works. HOI4 crashes on it.").some((x) => CRASH.test(x) && !ATTRIB.test(x)) && !sentences("The HOI4 wiki says it crashes.").some((x) => CRASH.test(x) && !ATTRIB.test(x)));

      const sites = messageSites(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
      const fatalSites = sites.filter((s) => labels.isFatalRule(s.rule));
      const fatalWithSites = [...new Set(fatalSites.map((s) => s.rule))];
      rec(`the reader found ${sites.length} push sites, ${fatalSites.length} of them for ${fatalWithSites.length} FATAL rules`, sites.length >= 60 && fatalWithSites.length >= 18, fatalWithSites);
      rec("…and a message beside every FATAL one", fatalSites.every((s) => s.message), fatalSites.filter((s) => !s.message).map((s) => `${s.rule} map-data.js:${s.line}`));
      const bare = (m, claim) => sentences(m).filter((x) => claim.test(x) && !ATTRIB.test(x));
      for (const s of fatalSites.filter((x) => x.message)) {
        const cls = labels.fatalOutcome(s.rule), where = `map-data.js:${s.line}`;
        if (cls === "refuses-to-load") {
          rec(`⭐⭐ ${s.rule} (refuses-to-load, ${where}) names the refusal and no crash`, /refuses to load|Failed to load the map/.test(s.message) && !CRASH.test(s.message), s.message);
        } else if (cls === "crashes") {
          rec(`${s.rule} (crashes, ${where}) says so`, CRASH.test(s.message), s.message);
        } else {
          const b = bare(s.message, new RegExp(CRASH.source + "|" + LOADCLAIM.source, "i"));
          rec(`⭐⭐ ${s.rule} (untested, ${where}) claims no crash or failed load it cannot attribute`, b.length === 0, b);
        }
      }
      const nonFatalBare = sites.filter((s) => s.message && !labels.isFatalRule(s.rule)).flatMap((s) => bare(s.message, CERTAIN).map((x) => `${s.rule} map-data.js:${s.line}: ${x.slice(0, 140)}`));
      rec("⭐⭐ no rule outside the FATAL set states a crash or a failed load as certain without saying whose claim it is", nonFatalBare.length === 0, nonFatalBare);
      for (const r of labels.FATAL) {
        const h = labels.mapRuleFixHint(r), cls = labels.fatalOutcome(r);
        if (cls === "refuses-to-load") rec(`${r}'s fix hint (refuses-to-load) claims no crash`, !CRASH.test(h), h);
        else if (cls === "untested") { const b = bare(h, new RegExp(CRASH.source + "|" + LOADCLAIM.source, "i")); rec(`${r}'s fix hint (untested) claims nothing it cannot attribute`, b.length === 0, b); }
      }
    }

    console.log("\n=== 6. a merge refusal and Mod Health's headline, run ===");
    {
      const mod = newMod({
        "history/states/1-A.txt": 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { 10 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n',
        "history/states/2-B.txt": 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { 20 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n',
        "history/countries/AAA - Aland.txt": "capital = 1\n",
      });
      const r = md.mergeState({ modRoot: mod, gameRoot: NOGAME, dependencyRoots: [], sourceStateId: 1, targetStateId: 2 });
      rec("THE CONTROL: merging away a country's capital is refused, naming the country", !!r && r.changed === false && /capital of AAA/.test(String(r.error)), r);
      rec("⭐⭐ …saying what HOI4 does with a capital left on a state that is gone — it refuses it — not that the game crashes",
        !!r && /HOI4 refuses/.test(String(r.error)) && !/crash/i.test(String(r.error)), r && r.error);

      const runHealth = async (v) => {
        const panel = { innerHTML: "", insertAdjacentHTML() {} };
        let runFn = null;
        const sandbox = {
          console, JSON, encodeURIComponent,
          window: { NovaMapRuleLabels: labels },
          localStorage: { getItem: () => "D:/fixture-mod" },
          document: { readyState: "complete", addEventListener() {}, getElementById: (id) => (id === "mhCrashCheck" ? panel : null) },
          setTimeout: (fn) => { runFn = fn; return 0; },
          fetch: async (url) => ({ json: async () => {
            const u = String(url);
            if (u.indexOf("/api/root") === 0) return { hoi4GameRoot: "D:/fixture-game" };
            if (u.indexOf("/api/map/validate") === 0) return v;
            if (u.indexOf("/api/modversion") === 0) return { ok: true, severity: "ok" };
            if (u.indexOf("/api/modhealth/loc-check") === 0) return { ok: true, problems: [] };
            return {};
          } }),
        };
        sandbox.globalThis = sandbox;
        vm.createContext(sandbox);
        vm.runInContext(fs.readFileSync(path.join(__dirname, "public", "modhealth-crashcheck.js"), "utf8"), sandbox);
        if (runFn) await runFn();
        const text = panel.innerHTML.replace(/<[^>]+>/g, " ");
        return (/Will it crash\? — [^\n]*?Fix before launch\./.exec(text) || [text.slice(0, 240)])[0];
      };
      const P1 = (rule) => ({ ok: true, problems: [{ severity: "error", rule, message: `${rule} (fixture)` }], errors: 1, warnings: 0 });
      const refused = await runHealth(P1("land_not_in_state"));
      rec("⭐⭐⭐ Mod Health on a map HOI4 refuses to load says that, and not that it crashes on Play", /refuses to load/.test(refused) && !/crash on Play|— yes:/.test(refused), refused);
      rec("…while still counting it among what Save stops for", /1 problem Save stops for/.test(refused), refused);
      const untested = await runHealth(P1("map_x_crossing"));
      rec("⭐⭐⭐ Mod Health on an untested FATAL rule claims neither a crash nor a refusal, only that Save stops", /Save stops for/.test(untested) && !/crash on Play|refuses to load|— yes:/.test(untested), untested);
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\n=== a map message claims only what the engine shows: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
