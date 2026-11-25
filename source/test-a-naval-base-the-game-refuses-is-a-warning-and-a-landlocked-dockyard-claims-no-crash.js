// A naval base HOI4 refuses is a warning Auto-fix repairs, not a Save gate; a dockyard in a state with no coast still stops Save, and
// says only what hoi4.exe shows — the game refuses it — not that it crashes. #a-naval-building-the-game-refuses-claims-no-crash
//
// THE DEFECT, measured on the base commit 65978a2. state_naval_building_without_coast is FATAL and is fixNavalBuildingsWithoutCoast's
// own dry run. That dry run counts a PROVINCE naval base on every province with no sea beside it, whether or not its state has a coast,
// so a naval base on an inland province of a coastal state stopped Save behind the type-"save" gate, under a message saying "no province
// in it touches sea". And every message for the rule — the problem, the fix hint, the gate's words (FATAL_OUTCOME "crashes") — said HOI4
// "then crashes with a divide-by-zero about a second after the main menu".
//
// WHAT THE EVIDENCE SHOWS.
//   * hoi4.exe 1.20.0.0 (Operation Postern v1.20.0.0.8873, 56,556,664 bytes; read-only, dumpbin; section 1 re-reads the bytes
//     when that build is installed). Re-derived 2026-10-30 from 1.19.4.1, the update Steam installed at 03:42 that day over the
//     1.19.4.0 this had been re-read from three hours before; 1.19.3 was last read 2026-09-30, 1.19.2 first. Every fact held, at
//     new addresses. Re-derived 2026-11-20 from 1.20.0.0, the update Steam installed at 09:33 that day, by the strings
//     (capstone): every fact held again, at new addresses, every function the size it was in 1.19.4.1.
//     statehistory.cpp 0x141640CE0 applies each building through 0x141209470 and, when that returns false, logs
//     "Trying to set invalid state building" (0x141640D91) or "… invalid province building" (0x141641054) and takes the next
//     entry (0x141640DFE / 0x141641126).
//     A coastal-only type on a province flagged coastal-locked is refused by the slot lookup's kind check (0x141203314 → return
//     null) BEFORE any building is allocated (0x141203360); SetLevel 0x141167770 re-tests the coastal bit (0x1411679BA) and, unless
//     the internal assert byte 0x143695AA1 is set, returns false (0x141167A17) before the level is stored (0x141167A21).
//     "Attempting to put a port on a landlocked province!" is that gated assert, not a log line and not an abort.
//     So a refused building is never in the game: the state plays as if the line had not been written.
//   * The owner's divide-by-zero. The three EXCEPTION_INT_DIVIDE_BY_ZERO minidumps of 2026-09-09 (16:11, 17:45, 19:07) were taken
//     on 1.19.2 and all fault at that build's VA 0x14122BA06, `idiv eax,[rcx+rsi*4]`, with R15 = 0x528 = 3×440 (the country-tag
//     lookup returning one past the last of 440 tags — f0d232f). In 1.20.0.0 the same instruction is 0x1412D2506 (0x1412CEC46 in
//     1.19.4.1, 0x141240AB6 in 1.19.3), 0x43D past the assert whose file argument (0x1412D20C9) read graphics/flagtextureatlas.cpp in 1.19.2 and 1.19.3.
//     ⚠️ In 1.19.4.1 and 1.20.0.0 the game's own logs and asserts pass an empty string as the file name, and no …\hoi4\source\… path is
//     left in the image (the paths left are the Clausewitz core's, in UTF-16, third-party headers' — boost, nlohmann_json,
//     SDL — and the PDB's). So section 1 ties the idiv to that function by the one .pdata entry that holds the idiv, the
//     assert and the error the function logs, "Error loading country flag overlay: " (two other functions log that error
//     too), and shows the path is gone rather than moved. The 19:07 launch ("Nova ISLAND v2") logged NO "Trying to set invalid …
//     building" line at all — its dockyard had been removed at 18:30, its state 131's dockyard sits in a 1939.1.1 block — and died
//     on the same instruction. The crash that made this rule FATAL was the flag atlas.
//   * No launch has ever had a refused dockyard without that tag fault, so what HOI4 does next with one is untested. The FATAL set's
//     membership is unchanged (the owner's launches decide); its outcome class becomes "untested" and every message says so.
//
// THE FIX. The FATAL rule reports the naval-only STATE buildings of a state with no coast — what its label and message describe. A
// province naval base on a province with no sea beside it is naval_base_non_coastal (a warning): validateMapBitmap reports the ones
// validateMapModel's definition.csv reading does not, because HOI4 takes the bitmap's answer, and Auto-fix still repairs them.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const W = lib.makeWorld("navalrefused");
const { createApp } = require("./server.js");
const labels = require("./public/map-rule-labels.js");
const EXE = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/hoi4.exe";

const RULE = "state_naval_building_without_coast";
const NB = "naval_base_non_coastal";
const DOCK = "\t\tbuildings = {\n\t\t\tdockyard = 1\n\t\t}\n";
const PORT = (pid) => `\t\tbuildings = {\n\t\t\t${pid} = {\n\t\t\t\tnaval_base = 1\n\t\t\t}\n\t\t}\n`;
// Province 2's coast painted over: a strip of province 3 between it and the sea (3 stays coastal above the strip). State 2 = { 2 5 } then
// has no province beside the sea, while definition.csv still marks 2 coastal — the island's shape.
const PAINTED = lib.bmp24(256, 256, (x, y) => lib.COL[y < 60 ? 1 : y < 64 ? (x < 128 ? 3 : 1) : lib.provAt(x, y)]);
const fatalIn = (v) => ((v && v.problems) || []).filter((p) => labels.isFatalRule(p.rule)).length;
const told = (v, rule) => ((v && v.problems) || []).filter((p) => p.rule === rule).flatMap((p) => (p.items || []).map((i) => i.stateId + ":" + i.province)).sort();
const messages = (v, rule) => ((v && v.problems) || []).filter((p) => p.rule === rule);
const read = (d, rel) => { try { return fs.readFileSync(path.join(d, ...rel.split("/")), "utf8"); } catch (_) { return ""; } };
// A claim that the game crashes on this rule — what no launch shows.
const CRASH_CLAIM = /divide|divides by zero|then crash|and then crashes|HOI4 crashes|crashes the game|will crash/i;

(async () => {
  let S = null;
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
        const jccTo = (va) => { const b = bytes(va, 6); return b[0] === 0x0f && (b[1] & 0xf0) === 0x80 ? va + 6 + b.readInt32LE(2) : (b[0] & 0xf0) === 0x70 ? va + 2 + b.readInt8(1) : -1; };
        const leaText = (va) => { const b = bytes(va, 7); if ((b[0] & 0xfb) !== 0x48 || b[1] !== 0x8d) return null; return bytes(va + 7 + b.readInt32LE(3), 120).toString("latin1").split("\0")[0]; };
        const H16 = (n) => "0x" + n.toString(16).toUpperCase();

        const ripTo = (va) => va + 7 + bytes(va, 7).readInt32LE(3);

        rec("statehistory.cpp sets a STATE building through 0x141209470 (0x141640D59) and on false logs \"Trying to set invalid state building\" (0x141640D91) …",
          jumpTo(0x141640D59) === 0x141209470 && leaText(0x141640D91) === "State Error: Trying to set invalid state building \"", [H16(jumpTo(0x141640D59)), leaText(0x141640D91)]);
        rec("…and takes the next entry either way (0x141640D60 jne → 0x141640DFE: add rbx,88h)",
          jccTo(0x141640D60) === 0x141640DFE && hex(0x141640DFE, 7) === "4881c388000000", [H16(jccTo(0x141640D60)), hex(0x141640DFE, 7)]);
        rec("a PROVINCE building the same way (0x141641019 → 0x141209470; 0x141641054 \"… invalid province building\"; 0x141641020 jne → 0x141641126: add r14,88h)",
          jumpTo(0x141641019) === 0x141209470 && leaText(0x141641054) === "State Error: Trying to set invalid province building \""
          && jccTo(0x141641020) === 0x141641126 && hex(0x141641126, 7) === "4981c688000000");
        rec("⭐⭐ the slot lookup refuses a type its kind check rejects BEFORE it allocates a building (0x141203314 je → 0x14120342F xor eax,eax; allocation 0x141203360 mov ecx,1F0h)",
          jumpTo(0x14120330D) === 0x141558F70 && jccTo(0x141203314) === 0x14120342F && hex(0x14120342F, 2) === "33c0" && hex(0x141203360, 5) === "b9f0010000",
          [H16(jccTo(0x141203314)), hex(0x14120342F, 2), hex(0x141203360, 5)]);
        rec("…whose coastal lock is the container's coastal-locked flag (0x141558F82 shr eax,2 / test al,1) and the type's only_costal (0x141558F8D)",
          hex(0x141558F82, 5) === "c1e802a801" && hex(0x141558F8D, 7) === "80b96603000000", [hex(0x141558F82, 5), hex(0x141558F8D, 7)]);
        rec("…a flag every province object takes from its coastal bit when it is built (0x140EEDA75 test [..+0D2h],8 / 0x140EEDA7E mov [..+1F8h],5)",
          hex(0x140EEDA75, 7) === "f680d200000008" && hex(0x140EEDA7E, 10) === "c786f801000005000000");
        rec("⭐⭐⭐ SetLevel's port-on-landlocked test (0x1411679BA) is a GATED ASSERT: unless the assert byte 0x143695AA1 is set it jumps straight to return false",
          hex(0x1411679BA, 7) === "f681d200000008" && hex(0x1411679C3, 3) === "443825" && ripTo(0x1411679C3) === 0x143695AA1
          && jccTo(0x1411679CA) === 0x141167A17 && hex(0x141167A17, 2) === "32c0", [hex(0x1411679C3, 7), H16(jccTo(0x1411679CA)), hex(0x141167A17, 2)]);
        rec("…before the level is stored (0x141167A21 mov [rdi+40h],si), and its text is \"Attempting to put a port on a landlocked province!\" (0x1411679FE)",
          hex(0x141167A21, 4) === "66897740" && leaText(0x1411679FE) === "Attempting to put a port on a landlocked province!", leaText(0x1411679FE));
        rec("⭐⭐⭐ THE DIVIDE-BY-ZERO THE ISLAND LAUNCHES DIED ON: 0x1412D2506 is `idiv eax,[rcx+rsi*4]` …", hex(0x1412D2506, 3) === "f73cb1", hex(0x1412D2506, 3));
        // The .pdata entry (RUNTIME_FUNCTION) holding a VA, from the exception directory (data directory 3), or null. One entry
        // is one contiguous piece of one function, so what it holds is in the same function.
        const excRva = head.readUInt32LE(opt + 112 + 3 * 8), excSize = head.readUInt32LE(opt + 112 + 3 * 8 + 4);
        const pdata = bytes(IB + excRva, excSize);
        const runtimeFunction = (va) => {
          let lo = 0, hi = Math.floor(excSize / 12) - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1, b = IB + pdata.readUInt32LE(mid * 12), e = IB + pdata.readUInt32LE(mid * 12 + 4);
            if (va < b) hi = mid - 1; else if (va >= e) lo = mid + 1; else return { begin: b, end: e };
          }
          return null;
        };
        // ⚠️ In 1.19.2 and 1.19.3 this check read the function's name out of the assert 0x43D before the idiv, whose file argument
        // was graphics\flagtextureatlas.cpp (the next check: that is gone in 1.19.4.1). What ties the idiv to the flag code now
        // is the one .pdata entry that holds the idiv, that assert — its expression and its call to the assert handler SetLevel's
        // landlocked-port assert calls — and the error the function logs. "Error loading country flag overlay: " is logged from
        // three functions (0x1412CF6D0, 0x1412D1381 and this one's 0x1412D2165), so the text alone does not name the idiv's.
        const fnOfIdiv = runtimeFunction(0x1412D2506);
        const inFnOfIdiv = (va) => !!fnOfIdiv && va >= fnOfIdiv.begin && va < fnOfIdiv.end;
        rec("…in the function that logs \"Error loading country flag overlay: \": one .pdata entry, 0x1412D2010..0x1412D2766, holds the idiv, that error (0x1412D2165) and the assert 0x43D before the idiv (\"nBufferSize <= CApplication::AccessInstance().GetUnsafeScratchBufferSize()\", 0x1412D20D0 → the assert handler 0x14254E310, 0x1412D20D7)",
          !!fnOfIdiv && fnOfIdiv.begin === 0x1412D2010 && fnOfIdiv.end === 0x1412D2766
          && [0x1412D20C9, 0x1412D20D0, 0x1412D20D7, 0x1412D2151, 0x1412D2165].every(inFnOfIdiv)
          && leaText(0x1412D2165) === "Error loading country flag overlay: "
          && leaText(0x1412D20D0) === "nBufferSize <= CApplication::AccessInstance().GetUnsafeScratchBufferSize()"
          && jumpTo(0x1412D20D7) === 0x14254E310 && jumpTo(0x141167A05) === 0x14254E310,
          { fn: fnOfIdiv && [H16(fnOfIdiv.begin), H16(fnOfIdiv.end)], error: leaText(0x1412D2165), assert: leaText(0x1412D20D0), handler: [H16(jumpTo(0x1412D20D7)), H16(jumpTo(0x141167A05))] });
        // ⚠️ The file name is gone, not moved: the assert's file argument (0x1412D20C9) and the log's 0x88 after it (0x1412D2151),
        // both graphics\flagtextureatlas.cpp in 1.19.3, take the one empty string the build's logs pass too (statehistory's,
        // 0x141641039), and neither the name nor any …\hoi4\source\… path is anywhere in the image, in latin1 or UTF-16, in any
        // case. THE CONTROLS: the same search of the same bytes finds the function's own error text (latin1), the Clausewitz
        // core's own source paths, which this build still carries (UTF-16), and statehistory's class name, mixed case
        // (.?AVCStateHistory@@), so an empty answer is not a blind scan.
        const image = fs.readFileSync(EXE).toString("latin1").toLowerCase();
        const u16 = (s) => s.split("").join("\0") + "\0";
        const find = (s) => ({ latin1: image.indexOf(s), utf16: image.indexOf(u16(s)) });
        const named = find("flagtextureatlas"), modulePath = find("\\hoi4\\source\\");
        const control = { latin1: image.indexOf("error loading country flag overlay: "), utf16: image.indexOf(u16("\\clausewitz\\pdx_core\\")), mixedCase: image.indexOf(".?avcstatehistory@@") };
        rec("⚠️ THE NAME IS GONE, NOT MOVED: the assert's file argument 0x43D before the idiv (0x1412D20C9) and the log's after it (0x1412D2151), graphics\\flagtextureatlas.cpp in 1.19.3, are the empty string statehistory's log passes (0x141641039), and neither \"flagtextureatlas\" nor any \\hoi4\\source\\ path is in the image",
          leaText(0x1412D20C9) === "" && leaText(0x1412D2151) === "" && leaText(0x141641039) === ""
          && ripTo(0x1412D20C9) === ripTo(0x141641039) && ripTo(0x1412D2151) === ripTo(0x141641039)
          && named.latin1 === -1 && named.utf16 === -1 && modulePath.latin1 === -1 && modulePath.utf16 === -1
          && control.latin1 > 0 && control.utf16 > 0 && control.mixedCase > 0,
          { file: [leaText(0x1412D20C9), leaText(0x1412D2151)], at: [H16(ripTo(0x1412D20C9)), H16(ripTo(0x1412D2151)), H16(ripTo(0x141641039))], named, modulePath, control });
      } finally { fs.closeSync(fd); }
    }

    S = await lib.startServer(createApp);

    console.log("\n=== 2. THE CONTROLS ===");
    {
      const v = await S.validate(W.mod("CoastalDockyard", { "history/states/2-B.txt": lib.st(2, "2 5", { history: DOCK }) }));
      rec("a dockyard in a state that touches the sea is reported by neither rule", lib.idsOf(v, RULE).length === 0 && told(v, NB).length === 0, lib.rulesIn(v));
      rec("…and Save is not stopped", (await lib.saveGate(v)).crashes === 0);
      const b = await S.validate(W.mod("CoastalBase", { "history/states/2-B.txt": lib.st(2, "2 5", { history: PORT(2) }) }));
      rec("a naval base on a province beside the sea is reported by neither rule", lib.idsOf(b, RULE).length === 0 && told(b, NB).length === 0, lib.rulesIn(b));
    }

    console.log("\n=== 3. a naval base on an inland province of a COASTAL state: a warning, not a Save gate ===");
    {
      const a = W.mod("InlandBaseCoastalState", { "history/states/2-B.txt": lib.st(2, "2 5", { history: PORT(5) }) });
      const v = await S.validate(a);
      rec("⭐⭐⭐ it is not state_naval_building_without_coast — state 2 touches the sea through province 2", lib.idsOf(v, RULE).length === 0, messages(v, RULE).map((p) => p.message));
      rec("⭐⭐ …it is naval_base_non_coastal, once", told(v, NB).join() === "2:5", told(v, NB));
      const g = await lib.saveGate(v);
      rec("⭐⭐⭐ …and Save is not stopped", g.crashes === 0 && !g.armed, { crashes: g.crashes, fatal: fatalIn(v), status: g.status.slice(0, 200) });
      const fx = await S.autoFix(a);
      // ⛔ #a-coast-taken-away-keeps-its-naval-buildings — Auto-fix repairs it by moving it with the coast now, not by deleting it (review
      // of the coast rows, CR-R3): a naval base onto a coastal province of its own state, and a coastless state's dockyards and naval bases
      // to its country's coastal state next door — so this section, 5 and 6 hold where each went, at its level, instead of that it was gone.
      const nn3 = (fx.body.fixes || {}).navalNoCoast || {}, mv3 = (nn3.moved || [])[0] || {};
      rec("⭐⭐ Auto-fix still repairs the naval base the game refuses: it moves it onto province 2, the coast state 2 still has, at its level",
        fx.status === 200 && !nn3.removed && (nn3.moved || []).length === 1 && mv3.stateId === 2 && mv3.from === 5 && mv3.to === 2 && mv3.level === 1
        && /(^|[^0-9])2 = \{\s*naval_base = 1\s*\}/.test(read(a, "history/states/2-B.txt")) && !/(^|[^0-9])5 = \{/.test(read(a, "history/states/2-B.txt")),
        { navalNoCoast: nn3, file: read(a, "history/states/2-B.txt") });
      rec("…and nothing about it is left", told(await S.validate(a), NB).length === 0);
    }

    console.log("\n=== 4. a naval base in a state with NO coast (and no dockyard): a warning, not a Save gate ===");
    {
      const a = W.mod("InlandBaseLandlockedState", { "history/states/1-A.txt": lib.st(1, "4", { history: PORT(4) }) });
      const v = await S.validate(a);
      rec("⭐⭐⭐ it is not state_naval_building_without_coast", lib.idsOf(v, RULE).length === 0, messages(v, RULE).map((p) => p.message));
      rec("⭐⭐ …it is naval_base_non_coastal, once", told(v, NB).join() === "1:4", told(v, NB));
      const g = await lib.saveGate(v);
      rec("⭐⭐⭐ …and Save is not stopped", g.crashes === 0 && !g.armed, { crashes: g.crashes, fatal: fatalIn(v), status: g.status.slice(0, 200) });
    }

    console.log("\n=== 5. the island's shape: a naval base on a province definition.csv calls coastal and the bitmap does not ===");
    {
      const a = W.mod("PaintedCoastBase", { "map/provinces.bmp": PAINTED, "history/states/2-B.txt": lib.st(2, "2 5", { history: PORT(2) }) });
      const v = await S.validate(a);
      rec("THE CONTROL: the bitmap now leaves province 2 without a coast (HOI4 logs the disagreement and plays the bitmap's answer)",
        ((v.problems || []).find((p) => p.rule === "coastal_province_has_no_sea") || { provinces: [] }).provinces.map(Number).includes(2), lib.rulesIn(v));
      rec("⭐⭐⭐ it is not state_naval_building_without_coast", lib.idsOf(v, RULE).length === 0, messages(v, RULE).map((p) => p.message));
      rec("⭐⭐⭐ …it is naval_base_non_coastal — which validateMapModel alone, reading definition.csv, cannot see", told(v, NB).join() === "2:2", told(v, NB));
      const p = messages(v, NB).find((x) => (x.items || []).some((i) => +i.province === 2)) || {};
      rec("⭐⭐ …saying what the game does: it refuses the building, in its own words", /Trying to set invalid province building/.test(String(p.message)) && !CRASH_CLAIM.test(String(p.message)), p.message);
      rec("⭐⭐ …and offering the Auto-fix that repairs it", p.severity === "warning" && p.autoFix !== false && /Auto-fix/.test(String(p.message)), p);
      const g = await lib.saveGate(v);
      rec("⭐⭐⭐ …and Save is not stopped", g.crashes === 0 && !g.armed, { crashes: g.crashes, fatal: fatalIn(v), status: g.status.slice(0, 200) });
      const fx = await S.autoFix(a);
      // state 2 has no coast left at all, so the base goes to its country's coastal state next door: state 3, whose province 3 the strip is
      const nn5 = (fx.body.fixes || {}).navalNoCoast || {}, c5 = (nn5.carried || [])[0] || {}, b5 = (c5.navalBases || [])[0] || {};
      rec("⭐⭐ Auto-fix repairs the naval base the game refuses: state 2 has no coast left, so it goes to state 3, its country's coastal state next door, at its level",
        fx.status === 200 && !nn5.removed && c5.from === 2 && c5.to === 3 && b5.from === 2 && b5.to === 3 && b5.level === 1
        && !/naval_base/.test(read(a, "history/states/2-B.txt")) && /(^|[^0-9])3 = \{\s*naval_base = 1\s*\}/.test(read(a, "history/states/3-C.txt")),
        { navalNoCoast: nn5, file: read(a, "history/states/2-B.txt"), three: read(a, "history/states/3-C.txt") });
      rec("…and the warning goes with it", told(await S.validate(a), NB).length === 0);
    }

    // ⛔ #a-refused-dockyard-is-not-a-save-gate — MOVED 2026-11-19 (tool campaign B1-31): this section pinned "Save still stops for it (the
    // FATAL set is unchanged)", pending a launch. The evidence above (the engine logs the refusal and takes the next entry; the launch that
    // made it FATAL died in the flag atlas; no recorded crash) says precautionary, and as a Save gate it left a FATAL Auto-fix could not clear
    // when the country has no other coast. So it is reported as an error and Save does not stop for it.
    console.log("\n=== 6. a DOCKYARD in a state with no coast is reported, does not stop Save — and claims no crash ===");
    {
      const a = W.mod("InlandDockyard", { "history/states/1-A.txt": lib.st(1, "4", { history: DOCK }) });
      const v = await S.validate(a);
      rec("⭐⭐⭐ it is reported", lib.idsOf(v, RULE).join() === "1", lib.idsOf(v, RULE));
      const p = messages(v, RULE)[0] || {};
      rec("⭐⭐⭐ …saying the game refuses it, in its own words", /Trying to set invalid state building/.test(String(p.message)), p.message);
      rec("⭐⭐⭐ …and not that HOI4 crashes or divides by zero", !CRASH_CLAIM.test(String(p.message)), p.message);
      rec("⭐⭐ …and that the game plays on, so Save does not stop for it", /takes the next entry/.test(String(p.message)) && /does not stop Save/.test(String(p.message)), p.message);
      rec("⭐⭐ …and names the Map step that takes it out", /state panel's Dockyard field/.test(String(p.message)), p.message);
      const g = await lib.saveGate(v);
      rec("⭐⭐⭐ Save does not stop for it: it is not in the FATAL set", !labels.isFatalRule(RULE) && g.crashes === 0 && fatalIn(v) === 0 && !g.armed, { crashes: g.crashes, fatal: fatalIn(v) });
      rec("⭐⭐⭐ …and the gate's status line is not a stop line, and claims no crash", !/Save stops for/.test(g.status) && !/crash/i.test(g.status), g.status.slice(0, 240));
      const fx = await S.autoFix(a);
      // state 1 = { 4 } borders states 2 and 3, both coastal and both its country's: the lower id
      const nn6 = (fx.body.fixes || {}).navalNoCoast || {}, c6 = (nn6.carried || [])[0] || {};
      rec("⭐⭐ Auto-fix repairs the dockyard the game refuses: it goes to state 2, its country's coastal state next door, and is not deleted",
        fx.status === 200 && !nn6.removed && c6.from === 1 && c6.to === 2 && JSON.stringify(c6.levels) === JSON.stringify([{ date: null, key: "dockyard", level: 1 }])
        && !/dockyard/.test(read(a, "history/states/1-A.txt")) && /dockyard = 1/.test(read(a, "history/states/2-B.txt")),
        { navalNoCoast: nn6, file: read(a, "history/states/1-A.txt"), two: read(a, "history/states/2-B.txt") });
      rec("…and Save no longer stops for it", lib.idsOf(await S.validate(a), RULE).length === 0);
    }

    console.log("\n=== 7. what the label module says about the rule ===");
    {
      rec("⭐⭐⭐ no FATAL_OUTCOME — the one launch that blamed it died in the flag atlas, and it left the fatal set", labels.fatalOutcome(RULE) === "", labels.fatalOutcome(RULE));
      const hint = labels.mapRuleFixHint(RULE);
      rec("⭐⭐ its fix hint claims no crash", hint.length > 40 && !/crash/i.test(hint), hint);
      rec("…and still names the refusal and the Auto-fix", /refuses/i.test(hint) && /Auto-fix/.test(hint), hint);
      rec("…and says Save does not stop for it, naming the state panel's Dockyard field", /Save does not stop/.test(hint) && /state panel's Dockyard field/.test(hint), hint);
      rec("THE CONTROL: the rule is no longer in the FATAL set (#a-refused-dockyard-is-not-a-save-gate)", !labels.FATAL.has(RULE));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== a naval building the game refuses claims no crash: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
