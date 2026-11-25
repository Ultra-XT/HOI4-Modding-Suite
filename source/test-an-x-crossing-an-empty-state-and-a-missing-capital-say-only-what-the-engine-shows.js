// An X-crossing, an empty state and a capital on a missing state say what hoi4.exe does with them — no more.
// #a-map-message-says-when-the-game-stops
//
// THE DEFECT. Three FATAL rules gated Save with messages the engine does not bear out (first traced on hoi4.exe 1.19.2 with
// dumpbin; re-derived on 1.19.3, 55,778,424 bytes, on 2026-09-30, and on 1.19.4.1 — Operation Postern v1.19.4.1.99a5,
// 56,530,040 bytes — on 2026-10-30, the same code relocated, at the same addresses 1.19.4.0 (56,529,528 bytes) had it at
// before Steam replaced it that night; section 0 re-reads the bytes. 1.19.4.1 carries none of the game's own source paths,
// so the .cpp names below are the ones 1.19.3's strings gave). The FATAL set is not changed here — the owner's launch
// tests decide that — only what the words claim.
// Re-derived on 1.20.0.0 (v1.20.0.0.8873 (0c4f), 56,556,664 bytes) on 2026-11-20: section 0 pins its addresses, these are 1.19.4.1's.
//
//   map_x_crossing      said the map "fail[s] to build a gamestate (loads to menu, crashes loading a game)", and Auto-fix's
//                       summary said it "makes the game fail to load a save". map.cpp 0x140AAF2E0 logs "Map invalid X
//                       crossing. Please fix pixels at coords: " (0x140AAF788) and jumps on to the next pixel
//                       (0x140AAF7EE -> 0x140AAF7F6). The function has no call to the failed-load path 0x140201F90, whose
//                       only two callers in the whole image are the map check (0x1401E48C2) and strategicair (0x140CB789F).
//   empty_state, empty_state_with_content, empty_capital_state
//                       said "HOI4 crashes on load" / "will crash on game start ("Executing History")", and the editor said
//                       an empty state "crashes HOI4 before the main menu". The map check calls state.cpp's "no provinces in
//                       state" (0x1401E4500 -> 0x140A29A30) and ignores the answer (inc ebx at 0x1401E4505), so the map
//                       loads past it. What stops is later: strategicair.cpp 0x140CB6BE0 walks every state id from 1
//                       (mov r15d,1 at 0x140CB7151 ... inc r15d at 0x140CB7772) with no empty-state skip, finds no air base
//                       site on a state with no land ("MAP_ERROR: no air base site defined for state ", 0x140CB722E), and a
//                       cleared flag calls the failed-load path (0x140CB789F). That walk runs when a game is started or a
//                       save is loaded (batch 5). So: "Failed to load the map" then, unless launched with -debug.
//   capital_state_missing
//                       said "HOI4 will crash on game start", and the editor's delete/merge confirmations said the same.
//                       country.cpp 0x140758EE0 logs "Attempting to set capital state #" … ", it is not a valid state!"
//                       (0x14075904E, 0x140759087) and jumps to its epilogue (0x1407590C7 -> 0x1407591F7) without setting
//                       the capital. It has no call to the failed-load path. What a country without a capital does when a
//                       game starts had not been traced, so the message said exactly that — and that Save still stops.
//                       (Read further since — section 3's note, and test-a-missing-capital-stops-save-only-for-a-country-with-land.js:
//                       no read of the missing capital goes without a test, and what the game then does is still unknown.)
//
// How it is checked: messages from the real validators on fixtures; the label; the editor's own status and confirm text
// read out of public/map.js with comments masked; the engine facts re-read from hoi4.exe when that build is installed —
// a missing or different exe prints SKIP and is never counted as a pass.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 360)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-says-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-says-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const tmps = [HOME, APPDATA_DIR];
const EXE = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/hoi4.exe";

// The editor's code lines (comments masked, so an explanatory comment never passes or fails a check).
const MAP_SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MAP_LINES = maskJsComments(MAP_SRC).split("\n");
const codeLines = (re) => MAP_LINES.map((l, i) => ({ line: i + 1, text: l })).filter((x) => re.test(x.text));
// …and the SENTENCES within them that carry both words. One help line can mention empty states and, in another sentence,
// a different rule's crash (the Erase tool's inland-sea warning); only a sentence making the claim is the claim. A JS
// string's "\n" is split on too.
const sentencesSaying = (re, claim) => {
  const out = [];
  for (const x of codeLines(re)) for (const s of x.text.split(/(?<=[.!?])\s+|\\n/)) if (re.test(s) && claim.test(s)) out.push(`map.js:${x.line} ${s.trim().slice(0, 160)}`);
  return out;
};

function bmp24(file, grid) {
  const H = grid.length, Wd = grid[0].length, rs = Math.floor((24 * Wd + 31) / 32) * 4, size = 54 + rs * H;
  const b = Buffer.alloc(size);
  b.write("BM", 0); b.writeUInt32LE(size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(Wd, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < Wd; x++) {
    const o = 54 + (H - 1 - y) * rs + x * 3, [r, g, bl] = grid[y][x];
    b[o] = bl; b[o + 1] = g; b[o + 2] = r;
  }
  fs.writeFileSync(file, b);
}

(async () => {
  try {
    console.log("\n=== 0. the engine's own code (hoi4.exe 1.20.0.0, read-only) ===");
    if (!fs.existsSync(EXE) || fs.statSync(EXE).size !== 56556664) {
      skip("hoi4.exe 1.20.0.0 (56,556,664 bytes) is not installed here — the addresses belong to that build; the engine facts did NOT run");
    } else {
      const img = fs.readFileSync(EXE);
      const pe = img.readUInt32LE(0x3c), nSec = img.readUInt16LE(pe + 6), optSize = img.readUInt16LE(pe + 20), opt = pe + 24;
      const IB = Number(img.readBigUInt64LE(opt + 24));
      const secs = [];
      for (let i = 0; i < nSec; i++) {
        const s = opt + optSize + i * 40;
        secs.push({ vsize: img.readUInt32LE(s + 8), va: img.readUInt32LE(s + 12), size: img.readUInt32LE(s + 16), raw: img.readUInt32LE(s + 20), exec: !!(img.readUInt32LE(s + 36) & 0x20000000) });
      }
      const off = (va) => { const rva = va - IB; const s = secs.find((x) => rva >= x.va && rva < x.va + x.size); return s ? rva - s.va + s.raw : -1; };
      const hex = (va, n) => img.slice(off(va), off(va) + n).toString("hex");
      const rel32 = (va) => va + 5 + img.readInt32LE(off(va) + 1);
      const leaText = (va) => { const o = off(va); if ((img[o] & 0xfb) !== 0x48 || img[o + 1] !== 0x8d) return null; const t = off(va + 7 + img.readInt32LE(o + 3)); return img.slice(t, t + 120).toString("latin1").split("\0")[0]; };
      const FAILED_LOAD = 0x140202130;   // 1.19.4.1: 0x140201F90
      const callsIn = (lo, hi, target) => { const out = []; for (let va = lo; va < hi - 4; va++) { const b = img[off(va)]; if ((b === 0xe8 || b === 0xe9) && rel32(va) === target) out.push(va); } return out; };
      const h = (n) => "0x" + n.toString(16).toUpperCase();

      const all = [];
      for (const s of secs) {
        if (!s.exec) continue;
        const end = s.raw + Math.min(s.size, s.vsize) - 5;
        for (let p = s.raw; p < end; p++) {
          const b = img[p];
          if (b !== 0xe8 && b !== 0xe9) continue;
          const va = IB + p - s.raw + s.va;
          if (va + 5 + img.readInt32LE(p + 1) === FAILED_LOAD) all.push(va);
        }
      }
      rec("THE PATH: \"Failed to load the map\" (0x140202130) has exactly two direct callers — the map check and strategicair",
        all.length === 2 && all.includes(0x1401E4A42) && all.includes(0x140CB965F), all.map(h));

      rec("X-crossing: map.cpp loads \"Map invalid X crossing. Please fix pixels at coords: \" at 0x140AB1548",
        leaText(0x140AB1548) === "Map invalid X crossing. Please fix pixels at coords: ", leaText(0x140AB1548));
      rec("…then jumps on (0x140AB15AE: jmp 0x140AB15B6) to the next pixel (0x140AB15BD: inc r12d)",
        hex(0x140AB15AE, 2) === "eb06" && hex(0x140AB15BD, 3) === "41ffc4", [hex(0x140AB15AE, 2), hex(0x140AB15BD, 3)]);
      // ⚠️ A "never calls" check passes vacuously over the WRONG range — the back-out control (1.19.2 addresses with only
      // the gate moved) showed this one and the capital one below passing while every positive check around them failed.
      // So each pins its range to a whole function first: int3 padding before it, its `ret` as its last byte, its LEA inside.
      // (The 1.19.3 -> 1.19.4.1 back-out, 2026-10-30 — 1.19.3's addresses with only the gate moved — failed all fourteen
      // checks in this section.)
      const wholeFn = (lo, hi) => img[off(lo) - 1] === 0xcc && hex(hi - 1, 1) === "c3";
      rec("…and its function (0x140AB10A0..0x140AB167D) never calls the failed-load path",
        wholeFn(0x140AB10A0, 0x140AB167D) && leaText(0x140AB1548) === "Map invalid X crossing. Please fix pixels at coords: " && callsIn(0x140AB10A0, 0x140AB167D, FAILED_LOAD).length === 0,
        { wholeFunction: wholeFn(0x140AB10A0, 0x140AB167D), calls: callsIn(0x140AB10A0, 0x140AB167D, FAILED_LOAD).map(h) });

      rec("empty state: the map check calls state.cpp's no-provinces check (0x1401E4680 -> 0x140A2B7F0, the function that logs 'no provinces in state' at 0x140A2B8C0)",
        rel32(0x1401E4680) === 0x140A2B7F0 && leaText(0x140A2B8C0) === "no provinces in state \"", [h(rel32(0x1401E4680)), leaText(0x140A2B8C0)]);
      rec("…and ignores its answer (0x1401E4685: inc ebx, the next state)", hex(0x1401E4685, 2) === "ffc3", hex(0x1401E4685, 2));
      rec("strategicair walks every state id from 1 (0x140CB8F11: mov r15d,1) …", hex(0x140CB8F11, 6) === "41bf01000000", hex(0x140CB8F11, 6));
      rec("…one at a time (0x140CB9532: inc r15d)", hex(0x140CB9532, 3) === "41ffc7", hex(0x140CB9532, 3));
      rec("…logging \"MAP_ERROR: no air base site defined for state \" (0x140CB8FEE)", leaText(0x140CB8FEE) === "MAP_ERROR: no air base site defined for state ", leaText(0x140CB8FEE));
      rec("…and a cleared flag calls the failed-load path (0x140CB965F)", rel32(0x140CB965F) === FAILED_LOAD);

      rec("capital: country.cpp loads \"Attempting to set capital state #\" (0x14075A23E)", leaText(0x14075A23E) === "Attempting to set capital state #", leaText(0x14075A23E));
      rec("…and \", it is not a valid state!\" (0x14075A277)", leaText(0x14075A277) === ", it is not a valid state!", leaText(0x14075A277));
      rec("…then jumps straight to its epilogue (0x14075A2B7: jmp 0x14075A3E7; lea r11,[rsp+130h])",
        hex(0x14075A2B7, 1) === "e9" && rel32(0x14075A2B7) === 0x14075A3E7 && hex(0x14075A3E7, 8) === "4c8d9c2430010000", [hex(0x14075A2B7, 5), hex(0x14075A3E7, 8)]);
      rec("…and its function (0x14075A0D0..0x14075A400) never calls the failed-load path",
        wholeFn(0x14075A0D0, 0x14075A400) && leaText(0x14075A277) === ", it is not a valid state!" && callsIn(0x14075A0D0, 0x14075A400, FAILED_LOAD).length === 0,
        { wholeFunction: wholeFn(0x14075A0D0, 0x14075A400), calls: callsIn(0x14075A0D0, 0x14075A400, FAILED_LOAD).map(h) });
    }

    console.log("\n=== 1. an X-crossing: the engine logs it and carries on ===");
    {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-says-xc-")); tmps.push(mod);
      const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-says-xc-game-")); tmps.push(game);
      fs.mkdirSync(path.join(mod, "map"), { recursive: true });
      fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="XC"\n');
      const A = [255, 0, 0], B = [0, 255, 0], C = [0, 0, 255], D = [255, 255, 0], E = [40, 40, 40];
      bmp24(path.join(mod, "map", "provinces.bmp"), [[E, A, A, B, B, E], [E, A, A, B, B, E], [E, C, C, D, D, E], [E, C, C, D, D, E]]);
      const p = (md.validateMapBitmap({ modRoot: mod, gameRoot: game }) || []).find((x) => x.rule === "map_x_crossing");
      const msg = String((p && p.message) || "");
      rec("THE CONTROL: the crossing is reported", !!p, p);
      rec("…still as an error that stops Save (FATAL is the owner's launch tests' call, not this change's)", !!p && p.severity === "error" && labels.isFatalRule("map_x_crossing") === true);
      rec("⭐⭐⭐ it no longer says the map fails to build a gamestate or crashes loading a game", !!p && !/gamestate|crash|fail(s)? to load a save/i.test(msg), msg);
      rec("⭐⭐ it quotes the line HOI4 logs", /Map invalid X crossing/.test(msg), msg);
      rec("⭐⭐ …and says the engine carries on building the map", /carries on/i.test(msg), msg);
      rec("⭐ it says Save still stops for it until a launch test settles it", /Save/.test(msg) && /launch test/i.test(msg), msg);
      rec("…and still offers Auto-fix", /Auto-fix/.test(msg), msg);
      const summary = codeLines(/X-crossing\(s\) in provinces\.bmp/);
      rec("THE CONTROL: Auto-fix's X-crossing summary was found in public/map.js", summary.length === 1, summary.map((x) => x.line));
      rec("⭐⭐ …and it no longer says a crossing makes a save fail to load", summary.length === 1 && !/crash|fail(s)? to load a save|gamestate/i.test(summary[0].text), summary.map((x) => x.text.trim().slice(0, 240)));
    }

    console.log("\n=== 2. an empty state: the map loads past it; a game will not start ===");
    {
      const probs = md.validateMapModel({
        capitals: { FRA: 12 },
        states: [
          { id: 10, name: "Real", provinces: [1, 2] },
          { id: 11, name: "Empty", provinces: [] },
          { id: 12, name: "Cap", provinces: [] },
          { id: 13, name: "Built", provinces: [], buildings: { infrastructure: 2 } },
        ],
      });
      for (const [rule, sid] of [["empty_state", 11], ["empty_capital_state", 12], ["empty_state_with_content", 13]]) {
        const p = probs.find((x) => x.rule === rule && x.stateId === sid);
        const msg = String((p && p.message) || "");
        rec(`THE CONTROL: ${rule} is reported for state ${sid}`, !!p, probs.map((x) => x.rule));
        rec(`${rule}: …still an error that stops Save`, !!p && p.severity === "error" && labels.isFatalRule(rule) === true);
        rec(`⭐⭐⭐ ${rule}: no "crashes on load", no "crash on game start", no "Executing History", no "before the main menu"`,
          !!p && !/crash|Executing History|before the (main )?menu/i.test(msg), msg);
        rec(`⭐⭐ ${rule}: says the map load only logs "no provinces in state"`, /no provinces in state/.test(msg) && /carries on/i.test(msg), msg);
        rec(`⭐⭐⭐ ${rule}: says HOI4 stops with "Failed to load the map" when a game is started or a save is loaded`,
          /Failed to load the map/.test(msg) && /when a game is started or a save is loaded/.test(msg), msg);
        rec(`⭐⭐ ${rule}: names the check that stops it`, /no air base site defined for state/.test(msg), msg);
        rec(`⭐ ${rule}: and that -debug is what gets past it`, /-debug/.test(msg), msg);
      }
      rec("⭐ the empty_state label no longer calls it cosmetic (\"won't appear in-game\")", !/won't appear in-game/i.test(labels.LABELS.empty_state || ""), labels.LABELS.empty_state);
      const lines = codeLines(/empty state|now EMPTY|with no provinces/i);
      rec("THE CONTROL: the editor's empty-state status lines were found", lines.length >= 6, lines.map((x) => x.line));
      const crashy = sentencesSaying(/empty state|now EMPTY|with no provinces/i, /crash/i);
      rec("⭐⭐⭐ none of them says an empty state crashes HOI4 (on load, before the menu, or at all)", crashy.length === 0, crashy);
    }

    console.log("\n=== 3. a capital on a state that does not exist: the engine refuses it ===");
    {
      const probs = md.validateMapModel({ capitals: { HAM: 209 }, states: [{ id: 210, name: "Real", provinces: [5], owner: "HAM" }] });
      const p = probs.find((x) => x.rule === "capital_state_missing");
      const msg = String((p && p.message) || "");
      rec("THE CONTROL: capital_state_missing is reported", !!p, probs.map((x) => x.rule));
      rec("…still an error that stops Save", !!p && p.severity === "error" && labels.isFatalRule("capital_state_missing") === true);
      rec("⭐⭐⭐ it no longer says HOI4 will crash on game start", !!p && !/crash/i.test(msg), msg);
      rec("⭐⭐ it quotes the refusal HOI4 logs", /it is not a valid state!/.test(msg), msg);
      // ⚠️ THESE TWO MOVED WITH THE TRACE (2026-09-23). They required "not been traced" and "launch test",
      // which is what the message said while nobody had read the engine. hoi4.exe 1.19.3 has now been read
      // (and 1.19.4.1 re-read, 2026-10-30): CCountry::SetCapital 0x140758EE0 (1.19.3: 0x140710DD0) logs the
      // refusal and jumps to its epilogue without writing the capital field, and it never calls the failed-load
      // routine 0x140201F90 (1.19.3: 0x1401EBED0; two callers image-wide, the map check and strategicair's site
      // walk). What Save stops for is what the game does after that, which nobody has launched (below).
      rec("⭐⭐⭐ it says the map itself still loads", /still loads/i.test(msg), msg);
      rec("⭐⭐ …naming country.cpp refusing the capital, not the map being rejected", /country\.cpp/.test(msg) && /refuses the capital/.test(msg), msg);
      // ⚠️ MOVED 2026-11-03. This required /does not check/: the message's "…in 136 places, and in one of them it does not
      // check whether there is one", the one unguarded GetCapitalState read the 09-23 reading claimed. Re-read on 1.19.4.0
      // and 1.19.4.1, that site is guarded earlier in its function, and a 1.19.3 census of 2026-10-14 has the guard's call
      // at the same offset (test-a-missing-capital-stops-save-only-for-a-country-with-land.js section 1 reads the guard's
      // bytes). So the claim is out, and the message says why Save stops in words that are true: nobody has launched such
      // a country, so what the game does next is unknown.
      rec("⭐ …and why Save stops for it anyway: nobody has launched such a country, so what the game does next is unknown",
        /Save/.test(msg) && /nobody has launched/i.test(msg) && /unknown/i.test(msg), msg);
      rec("⭐⭐⭐ …and it claims no read the game does not check",
        !!p && !/does not (always )?check|doesn't check|not checked|unchecked|without (a )?check|\bback in \d+ places\b/i.test(msg), msg);
      rec("THE CONTROL: the editor's capital confirmations were found", codeLines(/is the CAPITAL of|is the capital of/).length >= 3, codeLines(/is the CAPITAL of|is the capital of/).map((x) => x.line));
      const crashy = sentencesSaying(/capital/i, /crash/i);
      rec("⭐⭐⭐ no editor sentence about a capital promises a crash", crashy.length === 0, crashy);
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
  console.log(`\n=== an x-crossing, an empty state and a missing capital say only what the engine shows: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} SKIPPED (not counted as passes)` : ""} ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
