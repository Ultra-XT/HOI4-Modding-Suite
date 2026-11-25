// #a-refused-capital-is-what-two-shipping-maps-already-do — A MISSING CAPITAL STOPS SAVE ONLY FOR A COUNTRY THAT OWNS LAND.
//
// THE DEFECT. capital_state_missing gated Save for every country alike, and it was the last fatal row standing between a
// world Nova's own flow builds and a clean Save. On two independently built 832-state worlds it fired once, carrying 46
// countries, every capital id above 832 — and NOT ONE of those 46 owned any land. The only repair Nova offers for the rule,
// fixForeignCapitals, opens with `if (!ownedStates.has(tag)) continue;` and its own comment calls an unowned capital
// "harmless", so it re-pointed 0 of 46. A fatal rule whose only fixer declines every instance is a dead end: the modder can
// neither click past it nor fix it. The rule and its fixer disagreed about the same fact, in writing.
//
// 🎮 WHAT THE ENGINE DOES (hoi4.exe 1.19.4.1, Operation Postern v1.19.4.1.99a5, 56,530,040 bytes, read-only; section 1
// re-reads every byte below out of the installed exe. First read on 1.19.3 (2026-09-23); every address re-derived on
// 2026-10-30 on 1.19.4.0 (56,529,528 bytes) and, when Steam replaced it that night, again on 1.19.4.1: the same code
// relocated from 1.19.3, at the same addresses in both 1.19.4 builds. 1.19.4.1 carries none of the game's own source
// paths — the file its log and assert calls pass is one blank literal — so the .cpp names here are the ones 1.19.3's
// strings gave; a line number is the one the log call itself still passes):
//   (1.20.0.0, re-derived 2026-11-20: the same code relocated, every byte section 1 asserts unchanged; these are 1.19.4.1's addresses)
//   * CCountry::SetCapital 0x140758EE0 range-tests the id at 0x140758FFA (`cmp edi,1 / jl`) and 0x140759006
//     (`cmp edi,[gamestate+2D4h] / jge`), and on either — or a null table slot — reaches the branch at 0x140759020 that
//     builds "Attempting to set capital state #" (0x14075904E) + " for " + tag + ", it is not a valid state!" (0x140759087)
//     at country.cpp line 0x1B7C (0x1B7B in 1.19.3), and then `jmp 0x1407591F7` (0x1407590C7) — STRAIGHT TO THE EPILOGUE,
//     whose `ret` is at 0x14075920F. It never reaches `mov [rbx+1018h],edi` at 0x1407590D2, so the capital field is NOT
//     WRITTEN: the country is left exactly where one whose history file names no capital at all is left.
//     (The neighbouring ", they dont own it!" path at 0x140759173 falls THROUGH and keeps the capital. Milder, different,
//     and why capital_state_owned_by_other is a separate rule.)
//   * It cannot refuse the load. The failed-load routine — it clears the map's good-state byte (`mov byte [rcx+979h],0`
//     at 0x140201FA0) and files the telemetry key "IsMapInGoodState" = "no" — is 0x140201F90, and it has exactly TWO
//     callers in the whole image: the map check 0x1401E48C2 and strategicair's site walk 0x140CB789F. Neither is
//     SetCapital, and SetCapital calls neither.
//   * CCountry::GetCapitalState 0x140734370 reads the field back (`movsxd rax,[rdi+1018h]` at 0x140734474) and range-tests
//     it the same way (0x140734480), returning NULL (0x1407344A7 `xor eax,eax`). The 09-23 reading of 1.19.3 said 135 of
//     its 136 call sites test the pointer before using it and ONE DOES NOT: at 0x1411A386A (1.19.3: 0x14111C8EA) the guard
//     immediately above it (0x1411A385E `test rax,rax`) had tested a DIFFERENT country's capital — rsi, looked up from
//     [rbx+1Ch] at 0x1411A37DC — while the dereference at 0x1411A3872 is on r13's, from [rbx+14h] at 0x1411A37D3: "checked
//     one country, dereferenced the other". From 09-23 to 2026-11-03 Map Errors gave that as the reason Save stops.
//     ⛔ RE-READ ON 1.19.4 (2026-10-30) — AND THAT DOES NOT HOLD, AND NEVER DID. One block further up, the same function
//     calls the getter on r13 FIRST: `mov rcx,r13` 0x1411A3845 / call 0x1411A3848 / `test rax,rax` 0x1411A384D / `je`
//     0x1411A3850 to the exit. It tests BOTH countries' capitals, then re-calls each getter and reads through it — the very
//     shape of the control below. No jump in the image lands between that guard and the dereference, r13 is not written in
//     between, and the only call between them is GetCapitalState(rsi), which writes nothing but its own assert-once flags
//     (and those only with the assert byte set). IT IS NOT AN ENGINE CHANGE. Every offset section 1 pins in this function
//     sits at the same +0x86F80 from 1.19.3's (the function was 0x14111C840..0x14111CBD1, 0x391 bytes, as now), the rsi
//     guard's `je` rel32 (0x2CD) included; and a census of 1.19.3 taken on 2026-10-14, while it was installed, lists
//     GetCapitalState calls in that function at 0x14111C8C8, 0x14111C8D9, 0x14111C8EA and 0x14111C926 — +0x88, +0x99,
//     +0xAA, +0xE6, the four offsets 1.19.4.1 has, the first of them this guard's call. The 09-23 reading missed the guard.
//     (No 1.19.3 bytes survive to show the test and je after 0x14111C8C8 itself.) Section 1's last two checks read that
//     guard's own bytes and that nothing jumps past it. Until 2026-11-03 the last check asked for NO such guard and failed
//     on purpose, for the coordinator to settle; settled (and the owner told): the claim comes out of both messages, the
//     fix hint and the notes, and the rule STAYS — FATAL for a country that owns land, "untested" — for the reason that is
//     true: no shipping map has such a country and nobody has launched one, so what the game then does is unknown, and
//     Auto-fix repairs it the same way every time. Sections 2 and 2c pin those words.
//     1.19.4.1 has 137 E8 call sites (1.19.3: 136) and 7 E9 tail jumps. Followed along every path, ten read through the
//     pointer before testing it at that site; nine are the compiler re-calling the getter after an earlier test of the same
//     country (this one among them), and the tenth, 0x140760D41 in the "has NO capital defined." routine 0x140760C80, sits
//     behind `cmp [rbx+1018h],0 / je` — a capital id of 0, which is exactly what a refused capital leaves, never reaches it.
//     ⚠️ Such sites LOOK unguarded to a forward-only scan and are not: the compiler re-calls the getter after the guard
//     rather than keeping the value (0x140737436 → test at 0x14073743B → re-call at 0x140737450 is the clearest; the 09-23
//     reading counted six of them besides the one above). Section 1 keeps that shape as its control, because a scan that
//     cannot tell the two apart reports every one of them as unguarded.
//
// 📊 AND THE CORPUS SAYS WHO IS EXPOSED. Neither capital rule fires on any of the six shipping maps. But Old World Blues
// and Rise of Nations between them ship registered tags with NO capital line at all — OWB blanks CHI, FRA, GER, ITA, JAP,
// SOV and TUR to a few `set_` lines — and BOTH MAPS LAUNCH AND PLAY. Every one of them owns no land, and not one of the six
// maps ships a LAND-OWNING country without a capital. Section 3 derives those counts from the mods rather than naming them.
//
// SO: owns land → capital_state_missing, error, FATAL, and fixForeignCapitals can repair it because a land owner has a
// state of its own to be re-pointed at. Owns none → capital_state_missing_no_land, warning, NOT fatal, and NOT repaired:
// there is nothing to re-point at, and the alternative is copying a country file the mod does not own into the mod,
// freezing the rest of that country's history at this build of the layer below.
//
// ⚠️ A HYPOTHESIS OF MINE, REFUTED, AND KEPT HERE SO IT IS NOT RE-RUN. Novum Vexillum looked like a land-owning country
// with no capital: TRA owns state 857 and "TRA - Transylvania.txt" is three bytes, a bare UTF-8 BOM. The probe keyed
// country history by FILENAME. history/countries loads EVERY file, and NV also ships "TRA - Transnistria.txt", which sets
// capital = 857; the blanked file only overrides vanilla's same-named one. Count by TAG, never by filename — section 3 does.
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

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-caps-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-caps-home-"));
process.env.NOVA_HOME_DIR = HOME;
const tmps = [APPDATA_DIR, HOME];

const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

const FATAL_RULE = "capital_state_missing";
const SOFT_RULE = "capital_state_missing_no_land";
const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const EXE = VANILLA + "/hoi4.exe";
// The build these addresses were read out of. A different build is a LOUD skip, never a quiet pass:
// every earlier engine trace in this repo pinned 1.19.2 by byte size and has been skipping since the
// game updated on 2026-09-17, which is exactly how a guarantee evaporates without anyone noticing —
// and it happened again when 1.19.4 replaced 1.19.3 (55,778,424 bytes) on 2026-10-27, and again when
// 1.19.4.1 replaced 1.19.4.0 (56,529,528 bytes) on 2026-10-30, three hours after this file was re-derived on 1.19.4.0.
// Re-derived on 1.20.0.0 (Operation Postern v1.20.0.0.8873 (0c4f), 56,556,664 bytes) on 2026-11-20, from the same strings.
const EXE_BYTES = 56556664;
const EXE_VERSION = "1.20.0.0";
// The refuted claim in every spelling Nova gave it: "reads a country's capital state back in 136 places, and in one of them
// it does not check whether there is one" (both messages), "reads one back in 136 places of which one does not check" (the fix
// hint), "read back by code that does not always check" (the note). A text matching this tells a modder the game reads a
// missing capital without testing it, which section 1 refutes.
const UNCHECKED_READ = /does not (always )?check|doesn't check|not checked|unchecked|without (a )?check|\bback in \d+ places\b/i;

const rulesOf = (probs) => (probs || []).map((p) => p.rule);
const row = (probs, rule) => (probs || []).find((p) => p.rule === rule);

(async () => {
  try {
    // ── 1. the engine's own code, read out of the installed exe ───────────────────────────────────────────
    console.log("\n=== 1. hoi4.exe " + EXE_VERSION + ": the setter logs and returns, nothing fails the load, and the read the 09-23 reading called unchecked is guarded ===");
    let size = 0;
    try { size = fs.statSync(EXE).size; } catch (_) { size = 0; }
    if (size !== EXE_BYTES) {
      skip("hoi4.exe " + EXE_VERSION + " (" + EXE_BYTES.toLocaleString() + " bytes) is not installed here (found " + (size || "nothing") + ") — EVERY engine fact in section 1 DID NOT RUN");
    } else {
      const exe = fs.readFileSync(EXE);
      const pe = exe.readUInt32LE(0x3c), nSec = exe.readUInt16LE(pe + 6), optSize = exe.readUInt16LE(pe + 20), opt = pe + 24;
      const IB = Number(exe.readBigUInt64LE(opt + 24));
      const secs = [];
      for (let i = 0; i < nSec; i++) {
        const s = opt + optSize + i * 40;
        secs.push({ va: exe.readUInt32LE(s + 12), vsize: exe.readUInt32LE(s + 8), size: exe.readUInt32LE(s + 16), raw: exe.readUInt32LE(s + 20), flags: exe.readUInt32LE(s + 36) });
      }
      const off = (va) => { const rva = va - IB; const s = secs.find((x) => rva >= x.va && rva < x.va + Math.max(x.size, x.vsize)); if (!s) return -1; const o = rva - s.va + s.raw; return o < s.raw + s.size ? o : -1; };
      const vaOf = (o) => { const s = secs.find((x) => o >= x.raw && o < x.raw + x.size); return s ? o - s.raw + s.va + IB : -1; };
      const hex = (va, n) => { const o = off(va); return o < 0 ? "" : exe.slice(o, o + n).toString("hex"); };
      const jumpTo = (va) => { const o = off(va); if (o < 0) return -1; return (exe[o] === 0xe8 || exe[o] === 0xe9) ? va + 5 + exe.readInt32LE(o + 1) : -1; };
      const leaText = (va) => {
        const o = off(va);
        if (o < 0 || ((exe[o] & 0xf8) !== 0x48 && (exe[o] & 0xf8) !== 0x4c) || exe[o + 1] !== 0x8d) return null;
        const t = off(va + 7 + exe.readInt32LE(o + 3));
        if (t < 0) return null;
        let e = t; while (e < exe.length && exe[e] && e - t < 300) e++;
        return exe.toString("latin1", t, e);
      };
      const callsTo = (target, lo, hi) => {
        const out = [];
        const ranges = lo != null ? [[off(lo), off(hi)]] : secs.filter((s) => s.flags & 0x20000000).map((s) => [s.raw, s.raw + s.size]);
        for (const [a, b] of ranges) {
          if (a < 0) continue;
          for (let o = a; o + 5 <= b; o++) {
            if (exe[o] !== 0xe8) continue;
            const at = vaOf(o);
            if (at > 0 && at + 5 + exe.readInt32LE(o + 1) === target) out.push(at);
          }
        }
        return out;
      };
      const H = (n) => "0x" + n.toString(16).toUpperCase();

      // 1.20.0.0 addresses, each re-derived from 1.19.4.1's by the string or call that anchors it (1.19.4.1's in the comments).
      const SET_CAPITAL = 0x14075A0D0, SET_CAPITAL_END = 0x14075A400;   // 1.19.4.1: 0x140758EE0..0x140759210
      const FAIL_LOAD = 0x140202130;                                    // 1.19.4.1: 0x140201F90
      const GET_CAPITAL_STATE = 0x140735560;                            // 1.19.4.1: 0x140734370

      rec("the setter range-tests the id: `cmp edi,1` then `jl` (0x14075A1EA), and `cmp edi,[gamestate+2D4h]` then `jge` (0x14075A1F6)",
        hex(0x14075A1EA, 3) === "83ff01" && hex(0x14075A1ED, 2) === "7c1c" && hex(0x14075A1F6, 6) === "3bb8d4020000" && hex(0x14075A1FC, 2) === "7d0d",
        [hex(0x14075A1EA, 3), hex(0x14075A1ED, 2), hex(0x14075A1F6, 6), hex(0x14075A1FC, 2)]);
      rec("…a failed lookup becomes a null (0x14075A20B `xor edx,edx`) which `test rdx,rdx / jne` (0x14075A20D) sends to the refusal",
        hex(0x14075A20B, 2) === "33d2" && hex(0x14075A20D, 3) === "4885d2" && hex(0x14075A210, 6) === "0f85a6000000",
        [hex(0x14075A20B, 2), hex(0x14075A20D, 3), hex(0x14075A210, 6)]);
      rec("…which builds the exact line Nova quotes: \"Attempting to set capital state #\" (0x14075A23E) … \", it is not a valid state!\" (0x14075A277)",
        leaText(0x14075A23E) === "Attempting to set capital state #" && leaText(0x14075A277) === ", it is not a valid state!",
        [leaText(0x14075A23E), leaText(0x14075A277)]);
      rec("⭐⭐⭐ …and then JUMPS TO THE EPILOGUE (0x14075A2B7 `jmp 0x14075A3E7`, whose `ret` is 0x14075A3FF)",
        hex(0x14075A2B7, 5) === "e92b010000" && jumpTo(0x14075A2B7) === 0x14075A3E7 && hex(0x14075A3FF, 1) === "c3",
        [hex(0x14075A2B7, 5), H(jumpTo(0x14075A2B7))]);
      rec("⭐⭐⭐ …SKIPPING the write of the capital field (`mov [rbx+1018h],edi` at 0x14075A2C2), so a refused capital leaves the country exactly as one that never named a capital at all",
        hex(0x14075A2C2, 6) === "89bb18100000" && 0x14075A2C2 < jumpTo(0x14075A2B7),
        { write: hex(0x14075A2C2, 6), jumpsPast: H(jumpTo(0x14075A2B7)) });
      rec("THE CONTROL: the neighbouring \", they dont own it!\" path (0x14075A363) is a DIFFERENT branch — it falls through and keeps the capital",
        leaText(0x14075A363) === ", they dont own it!", leaText(0x14075A363));

      const failCallers = callsTo(FAIL_LOAD);
      rec("THE SCANNER'S CONTROL: the failed-load routine 0x140202130 clears the map's good-state byte (`mov byte [rcx+979h],0`) and the scan finds its callers at all",
        hex(0x140202140, 7) === "c6817909000000" && failCallers.length > 0, { byte: hex(0x140202140, 7), callers: failCallers.map(H) });
      rec("⭐⭐⭐ …and it has EXACTLY TWO callers image-wide — the map check 0x1401E4A42 and strategicair's site walk 0x140CB965F",
        failCallers.length === 2 && failCallers.includes(0x1401E4A42) && failCallers.includes(0x140CB965F), failCallers.map(H));
      // ⚠️ A "calls it zero times" passes vacuously over the WRONG range (the 2026-10-30 back-out — 1.19.3's addresses with only
      // the gate moved — passed it while every check around it failed), so the range is pinned to the whole function first:
      // int3 padding before it, its `ret` as its last byte, and the routine it must not call found where the scan above found it.
      rec("⭐⭐⭐ …so the capital setter cannot refuse the load: it calls it zero times",
        exe[off(SET_CAPITAL) - 1] === 0xcc && hex(SET_CAPITAL_END - 1, 1) === "c3" && failCallers.length === 2
          && callsTo(FAIL_LOAD, SET_CAPITAL, SET_CAPITAL_END).length === 0,
        { wholeFunction: exe[off(SET_CAPITAL) - 1] === 0xcc && hex(SET_CAPITAL_END - 1, 1) === "c3", calls: callsTo(FAIL_LOAD, SET_CAPITAL, SET_CAPITAL_END).map(H) });

      rec("the getter reads the same field back (`movsxd rax,[rdi+1018h]`, 0x140735664), range-tests it (0x140735670) and returns null (0x140735697)",
        hex(0x140735664, 7) === "48638718100000" && hex(0x140735670, 3) === "83f801" && hex(0x140735673, 2) === "7c22" && hex(0x140735697, 2) === "33c0",
        [hex(0x140735664, 7), hex(0x140735670, 3), hex(0x140735697, 2)]);
      const getters = callsTo(GET_CAPITAL_STATE);
      rec("…and it is read back all over the game — a three-figure number of call sites", getters.length >= 100, getters.length);
      rec("THE CONTROL: a GUARDED site looks like this — call (0x140738626), `test rax,rax` (0x14073862B), `je` (0x14073862E); the later re-calls in that function are the compiler, not a missing check",
        jumpTo(0x140738626) === GET_CAPITAL_STATE && hex(0x14073862B, 3) === "4885c0" && hex(0x14073862E, 2) === "7438",
        [H(jumpTo(0x140738626)), hex(0x14073862B, 3), hex(0x14073862E, 2)]);
      rec("⭐⭐⭐ the site the 09-23 reading called unguarded: 0x1411A712A calls the getter on r13 and dereferences it at 0x1411A7132 (`mov rax,[rax+18h]`) with no test in between",
        jumpTo(0x1411A712A) === GET_CAPITAL_STATE && hex(0x1411A7127, 3) === "498bcd" && hex(0x1411A7132, 4) === "488b4018",
        [H(jumpTo(0x1411A712A)), hex(0x1411A7127, 3), hex(0x1411A7132, 4)]);
      rec("⭐⭐⭐ …and the test right above it (0x1411A711E `test rax,rax` / 0x1411A7121 `je`) is of rsi's capital, not r13's (0x1411A7116 `mov rcx,rsi`)",
        hex(0x1411A711E, 3) === "4885c0" && hex(0x1411A7121, 6) === "0f84cd020000" && hex(0x1411A7116, 3) === "488bce" && jumpTo(0x1411A7119) === GET_CAPITAL_STATE,
        [hex(0x1411A711E, 3), hex(0x1411A7116, 3)]);
      rec("⭐⭐ …and rsi and r13 are two DIFFERENT countries, looked up from [rbx+14h] (0x1411A7093) and [rbx+1Ch] (0x1411A709C)",
        hex(0x1411A7093, 4) === "4883c114" && hex(0x1411A709C, 4) === "488d4b1c", [hex(0x1411A7093, 4), hex(0x1411A709C, 4)]);
      // ⛔ THE GUARD THE 09-23 READING MISSED (found on the 1.19.4 re-read, 2026-10-30; the 2026-10-14 census of 1.19.3 has its
      // call at the same offset: the header). The three checks above read the call, the dereference and the test IMMEDIATELY
      // above; "checked one country, dereferenced the other" also needed NOTHING EARLIER to have tested r13's capital. This
      // scans from r13's lookup (`mov r13,rax`, 0x1411A70A8, straight after the [rbx+14h] lookup) to the re-call for any
      // `mov rcx,r13` / call GetCapitalState / `test rax,rax` / je, and finds exactly one, 0x1411A7105, whose je leaves by the
      // exit rsi's test leaves by. Until 2026-11-03 this check asked for NONE and failed by design; the coordinator's decision
      // took the claim out of both messages, the fix hint and the notes (sections 2 and 2c pin them), and it pins the guard now.
      const r13Guards = [];
      for (let va = 0x1411A70A8; va < 0x1411A7127; va++) {
        if (hex(va, 3) === "498bcd" && hex(va + 3, 1) === "e8" && jumpTo(va + 3) === GET_CAPITAL_STATE && hex(va + 8, 3) === "4885c0"
          && (hex(va + 11, 1) === "74" || hex(va + 11, 2) === "0f84")) r13Guards.push(va);
      }
      const jeTo = (va) => { const o = off(va); return o >= 0 && exe[o] === 0x0f && exe[o + 1] === 0x84 ? va + 6 + exe.readInt32LE(o + 2) : -1; };
      const EXIT = 0x1411A73F4;
      rec("⭐⭐⭐ …but the same function tested r13's capital FIRST: `mov rcx,r13` 0x1411A7105 / call GetCapitalState 0x1411A7108 / `test rax,rax` 0x1411A710D / `je` 0x1411A7110 to the exit 0x1411A73F4 (`xor eax,eax`), the exit rsi's test takes — the guard the 09-23 reading missed",
        hex(0x1411A70A8, 3) === "4c8be8" && r13Guards.length === 1 && r13Guards[0] === 0x1411A7105
          && hex(0x1411A7105, 3) === "498bcd" && jumpTo(0x1411A7108) === GET_CAPITAL_STATE && hex(0x1411A710D, 3) === "4885c0"
          && hex(0x1411A7110, 6) === "0f84de020000" && jeTo(0x1411A7110) === EXIT && jeTo(0x1411A7121) === EXIT && hex(EXIT, 2) === "33c0",
        { r13Lookup: hex(0x1411A70A8, 3), r13CapitalTestedAt: r13Guards.map(H), je: hex(0x1411A7110, 6), to: H(jeTo(0x1411A7110)), rsiTo: H(jeTo(0x1411A7121)), exit: hex(EXIT, 2) });
      // …and NOTHING JUMPS PAST IT. Every instruction from that je to the read is pinned above — mov rcx,rsi 0x1411A7116, call
      // 0x1411A7119, test 0x1411A711E, je 0x1411A7121, mov rcx,r13 0x1411A7127, call 0x1411A712A, mov edx,[rbx+14h] 0x1411A712F
      // and the read 0x1411A7132 — and a jump landing on any of them would reach the read without the guard. Read byte by byte
      // (every byte as if an instruction began there), the function (.pdata 0x1411A7080..0x1411A7411: int3 before it, `ret` its
      // last byte; a rel8 from outside it cannot reach this far in) has no rel8 or rel32 branch to one, and no E8 / E9 / 0F 8x in
      // any executable section has one as its target. (Widened to every byte from 0x1411A7111, the function scan finds one more:
      // 0x1411A70EE's `74 24`, the middle of `mov [rsp+38h],r14` at 0x1411A70EC, which "lands" inside the je's own rel32.)
      // THE CONTROL: the same scan finds the function's branches to its exit, these two je's among them.
      const FN = 0x1411A7080, FN_END = 0x1411A7411;
      const between = [0x1411A7116, 0x1411A7119, 0x1411A711E, 0x1411A7121, 0x1411A7127, 0x1411A712A, 0x1411A712F, 0x1411A7132];
      const branchesTo = (targets, lo, hi, rel8) => {
        const want = new Set(targets), out = [];
        const ranges = lo != null ? [[off(lo), off(hi)]] : secs.filter((s) => s.flags & 0x20000000).map((s) => [s.raw, s.raw + Math.min(s.size, s.vsize)]);
        for (const [a, b] of ranges) {
          if (a < 0) continue;
          for (let o = a; o + 6 <= b; o++) {
            const c = exe[o];
            let t = -1;
            if (c === 0xe8 || c === 0xe9) t = vaOf(o) + 5 + exe.readInt32LE(o + 1);
            else if (c === 0x0f && (exe[o + 1] & 0xf0) === 0x80) t = vaOf(o) + 6 + exe.readInt32LE(o + 2);
            else if (rel8 && ((c & 0xf0) === 0x70 || c === 0xeb)) t = vaOf(o) + 2 + exe.readInt8(o + 1);
            if (want.has(t)) out.push(vaOf(o));
          }
        }
        return out;
      };
      const toExit = branchesTo([EXIT], FN, FN_END, true);
      const intoFn = branchesTo(between, FN, FN_END, true), intoImage = branchesTo(between);
      rec("⭐⭐⭐ …and nothing jumps past it: no branch in the function, and no rel32 in the image, lands between that guard and the read (THE CONTROL: the same scan finds the function's branches to its exit, 0x1411A7110's and 0x1411A7121's among them)",
        exe[off(FN) - 1] === 0xcc && hex(FN_END - 1, 1) === "c3" && toExit.includes(0x1411A7110) && toExit.includes(0x1411A7121)
          && intoFn.length === 0 && intoImage.length === 0,
        { wholeFunction: exe[off(FN) - 1] === 0xcc && hex(FN_END - 1, 1) === "c3", toExit: toExit.map(H), intoFunction: intoFn.map(H), intoImage: intoImage.map(H) });
    }

    // ── 2. the split, on models — and the same answer cold and warm ───────────────────────────────────────
    console.log("\n=== 2. the rule splits on whether the country owns land ===");
    // One world, two countries with the same broken capital: LND owns a state with provinces, AIR owns nothing.
    const world = () => ({
      capitals: { LND: 9001, AIR: 9002, OK: 1 },
      states: [
        { id: 1, name: "S1", provinces: [10], owner: "OK" },
        { id: 2, name: "S2", provinces: [20], owner: "LND" },
      ],
    });
    {
      const probs = md.validateMapModel(world()) || [];
      const fatal = row(probs, FATAL_RULE), soft = row(probs, SOFT_RULE);
      rec("THE CONTROL: both broken capitals are reported", !!fatal && !!soft, rulesOf(probs));
      rec("⭐⭐⭐ the land owner's is capital_state_missing — an error", !!fatal && fatal.severity === "error", fatal && fatal.severity);
      rec("⭐⭐⭐ …and it still stops Save", labels.isFatalRule(FATAL_RULE) === true, [...labels.FATAL]);
      rec("⭐⭐⭐ the landless one's is capital_state_missing_no_land — a warning", !!soft && soft.severity === "warning", soft && soft.severity);
      rec("⭐⭐⭐ …and it does NOT stop Save", labels.isFatalRule(SOFT_RULE) === false, [...labels.FATAL]);
      rec("⭐⭐ each row carries only its own country", !!fatal && !!soft
        && (fatal.tags || []).join() === "LND" && (soft.tags || []).join() === "AIR",
        { fatal: fatal && fatal.tags, soft: soft && soft.tags });
      rec("⭐⭐ …and each counts itself, so problemScale can size it",
        !!fatal && fatal.total === 1 && fatal.totalNoun === "countries" && !!soft && soft.total === 1 && soft.totalNoun === "countries",
        { fatal: fatal && fatal.total, soft: soft && soft.total });
      rec("⭐ the country whose capital resolves is in neither", !(fatal.tags || []).includes("OK") && !(soft.tags || []).includes("OK"));
      // ⚠️ MOVED 2026-11-03. This pinned /does not check/: the message's "the game reads a country's capital state back in 136
      // places, and in one of them it does not check whether there is one", the claim section 1's guard check refutes. The
      // reason the message gives for Save stopping is now the true one: nobody has launched such a country, so what the game
      // does next is unknown.
      rec("⭐⭐⭐ the fatal message says the map still loads, and why Save stops anyway: nobody has launched such a country, so what the game does next is unknown",
        /still loads/i.test(fatal.message) && /nobody has launched/i.test(fatal.message) && /unknown/i.test(fatal.message) && !/crash/i.test(fatal.message), fatal.message);
      rec("⭐⭐⭐ …and it claims no read the game does not check (the 09-23 reading's miss)", !UNCHECKED_READ.test(fatal.message), fatal.message);
      rec("⭐⭐ …and the fix hint says the same: nobody has launched one, and no unchecked read",
        /nobody has launched/i.test(labels.mapRuleFixHint(FATAL_RULE)) && !UNCHECKED_READ.test(labels.mapRuleFixHint(FATAL_RULE)), labels.mapRuleFixHint(FATAL_RULE));
      rec("⭐⭐⭐ the warning message names the shipping maps that already do this, and promises no repair",
        /Old World Blues/.test(soft.message) && /Rise of Nations/.test(soft.message) && /will not repair/.test(soft.message) && !/crash/i.test(soft.message), soft.message);
      rec("⭐ both rules read as plain English in the panel",
        labels.mapRuleLabel(SOFT_RULE) === labels.LABELS[SOFT_RULE] && /capital/i.test(labels.LABELS[SOFT_RULE] || ""), labels.mapRuleLabel(SOFT_RULE));
      rec("⭐ …and the new one has a real fix hint", labels.mapRuleFixHint(SOFT_RULE).length > 15, labels.mapRuleFixHint(SOFT_RULE).length);
    }
    // ⚠️ #cache-warmth-changed-the-answer — the split reads `owner` and `provinces` off the state objects, and
    // buildMapModel writes some fields onto the objects its CACHED layer holds. A fixture that is only ever run
    // warm (or only cold) can give one answer here and the other in the app. Same world, from files, both ways.
    console.log("\n=== 2b. the same answer cold and warm ===");
    {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-caps-mod-")); tmps.push(root);
      const mk = (rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
      const st = (id, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${id * 10} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
      mk("descriptor.mod", 'version="1"\nname="caps"\n');
      mk("history/states/1.txt", st(1, "OK"));
      mk("history/states/2.txt", st(2, "LND"));
      mk("history/countries/LND - Landed.txt", "capital = 9001\n");
      mk("history/countries/AIR - Airy.txt", "capital = 9002\n");
      mk("history/countries/OK  - Okay.txt", "capital = 1\n");
      const NOGAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-caps-nogame-")); tmps.push(NOGAME);
      const read = () => {
        const probs = md.validateMapModel(md.buildMapModel({ modRoot: root, gameRoot: NOGAME, dependencyRoots: [], cacheStableLayers: true })) || [];
        return { fatal: (row(probs, FATAL_RULE) || {}).tags || [], soft: (row(probs, SOFT_RULE) || {}).tags || [] };
      };
      const cold = read();          // nothing cached yet
      const warm = read();          // …and again, over whatever the first run left behind
      rec("THE CONTROL: the cold run splits the two countries", cold.fatal.join() === "LND" && cold.soft.join() === "AIR", cold);
      rec("⭐⭐⭐ the warm run gives the SAME answer", JSON.stringify(cold) === JSON.stringify(warm), { cold, warm });
    }

    // ── 2c. the same capital 0, reached with no line at all: no_capital_at_all gives the same reason ──────
    // A country that owns land and whose history names no capital (no line, no set_capital) starts exactly where a refused
    // capital line leaves one, so its rule shares the verdict and must share the reason: the claim was in its message too.
    console.log("\n=== 2c. a land owner whose history names no capital at all: the same reason, and no unchecked read ===");
    {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-caps-none-")); tmps.push(root);
      const NOGAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-caps-nonegame-")); tmps.push(NOGAME);
      const mk = (rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
      const st = (id, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${id * 10} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
      mk("descriptor.mod", 'version="1"\nname="capsnone"\n');
      mk("history/states/1.txt", st(1, "OK"));
      mk("history/states/2.txt", st(2, "NON"));
      mk("history/countries/OK  - Okay.txt", "capital = 1\n");
      mk("history/countries/NON - Nocap.txt", "# no capital line and no set_capital\nset_research_slots = 3\n");
      const probs = md.validateMapModel(md.buildMapModel({ modRoot: root, gameRoot: NOGAME, dependencyRoots: [] })) || [];
      const none = row(probs, "no_capital_at_all");
      const msg = String((none && none.message) || "");
      rec("THE CONTROL: the land owner that names no capital is no_capital_at_all, and the one with a line is not", !!none && (none.tags || []).join() === "NON", rulesOf(probs));
      rec("⭐⭐⭐ its message says the map still loads, and why Save stops anyway: nobody has launched such a country, so what the game does is unknown",
        /still loads/i.test(msg) && /NO capital defined/.test(msg) && /nobody has launched/i.test(msg) && /unknown/i.test(msg) && !/crash/i.test(msg), msg);
      rec("⭐⭐⭐ …and it claims no read the game does not check", !!none && !UNCHECKED_READ.test(msg), msg);
    }

    // ── 3. the corpus — derived, never typed ──────────────────────────────────────────────────────────────
    console.log("\n=== 3. the six shipping maps ===");
    const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
    const MAPS = { vanilla: VANILLA, MD: W + "2777392649", R56: W + "820260968", OWB: W + "2265420196", NV: W + "1827273767", RoN: W + "2026448968" };
    const present = Object.entries(MAPS).filter(([, p]) => { try { return fs.existsSync(path.join(p, "descriptor.mod")) || fs.existsSync(path.join(p, "map")); } catch (_) { return false; } });
    if (present.length < Object.keys(MAPS).length) {
      skip(`only ${present.length} of the ${Object.keys(MAPS).length} corpus maps are installed here — the shipping-map facts DID NOT run in full`);
    }
    if (!present.length) {
      skip("no corpus map is installed — section 3 did not run at all");
    } else {
      // (a) neither rule may fire on a map that ships and launches.
      for (const [key, root] of present) {
        let probs = [];
        try { probs = md.validateMapModel(md.buildMapModel({ modRoot: root, gameRoot: VANILLA, dependencyRoots: [], cacheStableLayers: true })) || []; } catch (e) { probs = null; }
        if (!probs) { rec(`${key}: validated`, false, "threw"); continue; }
        const f = row(probs, FATAL_RULE), s = row(probs, SOFT_RULE);
        rec(`⭐⭐⭐ ${key}: neither capital rule fires on a map that ships and launches`, !f && !s,
          { fatal: f && f.total, soft: s && s.total });
      }
      // (b) the fact the split rests on: registered tags shipping with NO capital line at all, which own no land.
      //     Counted by TAG (history/countries loads EVERY file and a tag may have several), not by filename.
      const maskComments = (src) => {
        const a = src.split(""); let q = false;
        for (let i = 0; i < a.length; i++) {
          const c = a[i];
          if (c === '"') q = !q;
          else if (c === "#" && !q) { while (i < a.length && a[i] !== "\n") { a[i] = " "; i++; } }
          else if (c === "\n") q = false;
        }
        return a.join("");
      };
      let noCapitalTags = 0, noCapitalOwningLand = 0;
      const owningLandWithout = [];
      for (const [key, root] of present) {
        if (key === "vanilla") continue;
        let model = null;
        try { model = md.buildMapModel({ modRoot: root, gameRoot: VANILLA, dependencyRoots: [], cacheStableLayers: true }); } catch (_) { continue; }
        const landOwners = new Set();
        for (const st2 of model.states || []) if (st2.owner && (st2.provinces || []).length) landOwners.add(st2.owner);
        const byBase = new Map();
        for (const r of [VANILLA, root]) {
          let names = [];
          try { names = fs.readdirSync(path.join(r, "history", "countries")); } catch (_) { continue; }
          for (const n of names) if (/\.txt$/i.test(n)) byBase.set(n.toLowerCase(), path.join(r, "history", "countries", n));
        }
        const byTag = new Map();
        for (const [base, p] of byBase) {
          const tag = base.slice(0, 3).toUpperCase();
          if (!/^[A-Z0-9]{3}$/.test(tag)) continue;
          let src = ""; try { src = fs.readFileSync(p, "utf8"); } catch (_) {}
          const masked = maskComments(src);
          const has = /(^|[^a-z_])capital\s*=/i.test(masked) || /set_capital/i.test(masked);
          byTag.set(tag, (byTag.get(tag) || false) || has);
        }
        for (const [tag, has] of byTag) {
          if (has) continue;
          noCapitalTags++;
          if (landOwners.has(tag)) { noCapitalOwningLand++; owningLandWithout.push(key + ":" + tag); }
        }
      }
      rec("THE CONTROL: shipping mods really do register countries with no capital line at all", noCapitalTags > 0, noCapitalTags);
      rec("⭐⭐⭐ every single one of them owns NO LAND — which is why the landless half is not gated: it is a state maps that launch are already in",
        noCapitalOwningLand === 0, owningLandWithout);
      rec("⭐⭐ …and no shipping map has a LAND-OWNING country without a capital, which is why the other half still is",
        owningLandWithout.length === 0, owningLandWithout);
    }

    // ── 4. and the repair reaches exactly the half that is gated ──────────────────────────────────────────
    console.log("\n=== 4. Nova's repair covers the gated half, and only it ===");
    {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "nova-caps-fix-")); tmps.push(root);
      const NOGAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-caps-fixgame-")); tmps.push(NOGAME);
      const mk = (rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
      const st = (id, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${id * 10} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
      mk("descriptor.mod", 'version="1"\nname="capsfix"\n');
      mk("history/states/1.txt", st(1, "OK"));
      mk("history/states/2.txt", st(2, "LND"));
      mk("history/countries/LND - Landed.txt", "capital = 9001\n");
      mk("history/countries/AIR - Airy.txt", "capital = 9002\n");
      mk("history/countries/OK  - Okay.txt", "capital = 1\n");
      const probsBefore = md.validateMapModel(md.buildMapModel({ modRoot: root, gameRoot: NOGAME, dependencyRoots: [] })) || [];
      rec("THE CONTROL: before the fix both halves are there", !!row(probsBefore, FATAL_RULE) && !!row(probsBefore, SOFT_RULE), rulesOf(probsBefore));
      const r = md.fixForeignCapitals({ modRoot: root, gameRoot: NOGAME, dependencyRoots: [] });
      rec("⭐⭐⭐ the repair re-points the land owner", r && r.fixed === 1 && (r.details || []).some((d) => d.tag === "LND" && d.to === 2), r);
      const probsAfter = md.validateMapModel(md.buildMapModel({ modRoot: root, gameRoot: NOGAME, dependencyRoots: [] })) || [];
      rec("⭐⭐⭐ …so the FATAL half is gone and Save is no longer stopped by it", !row(probsAfter, FATAL_RULE), rulesOf(probsAfter));
      rec("⭐⭐ …and the landless one is left alone, reported and un-repaired, exactly as its message says",
        !!row(probsAfter, SOFT_RULE) && (row(probsAfter, SOFT_RULE).tags || []).join() === "AIR", rulesOf(probsAfter));
      // ⛔ THE BACK-OUT CONTROL THAT BITES. Put the split back the way it was — one rule for everyone — and the
      // landless country becomes a FATAL row again. This is the assertion that fails if anyone removes the split,
      // and the one above it is the assertion that fails if anyone removes the gate instead.
      const stillFatalForLandless = labels.isFatalRule(SOFT_RULE) === true || !!row(probsAfter, FATAL_RULE);
      rec("⛔ THE BACK-OUT CONTROL: a landless country is not, by either route, a row that stops Save", stillFatalForLandless === false,
        { softIsFatal: labels.isFatalRule(SOFT_RULE), fatalRowPresent: !!row(probsAfter, FATAL_RULE) });
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }

  console.log(`\n=== a missing capital stops Save only for a country with land: ${checks} checks, ${fails.length} failed, ${skips} SKIPPED (not counted as passes) ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
