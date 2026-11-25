// An order of battle the mod's own map drowned is REPORTED IN FULL — and is not auto-fixed, because the files are not
// the mod's and the destination is not Nova's to choose. #a-drowned-order-of-battle-is-reported-in-full
//
// THE DEFECT. The owner's map flow is: new mod → Delete map → Generate land → Auto-fix. On the current build that ends
// at 3 problems, and the biggest one left is division_starts_on_water. Measured on his built world
// (nova_flow2_b16 over the installed base game): 2,967 divisions, in 180 order-of-battle files, for 68 countries —
// 2,967 of the 4,566 divisions the mod starts, with 12 countries (ARG SAF DEN NEP VEN YEM ECU GUA HAI IRE LIB NIC)
// left with no army at all. The rule said:
//
//     "2967 division(s) start on a province that is water: "(unnamed)" in history/units/AFG_1936.txt starts at
//      province 4893 (2966 more, at 4893, …). … what the game does with an army standing on water when a game starts
//      has not been traced. Millennium Dawn and Rise of Nations start a few divisions on water and launch, so this is
//      a warning. Move the division's location to land, or make the province land again."
//
// Five things wrong with that, all of which this test pins:
//   1. A flat 2,967 with no denominator. 2,967 of 4,566 is TWO THIRDS OF THE WORLD'S ARMY, and the number that says so
//      was never computed — though the same single parse of the same files already read every one of those 4,566.
//   2. Not one country named, so nothing said BBB starts with no army at all. 12 countries did.
//   3. "Move the division's location to land" — addressed to a modder who owns none of the 180 files. They are the base
//      game's, showing through. Copying them in to edit a location hands the mod those countries' whole order of
//      battle, frozen at this build of HOI4: the add-on floodgate, for content the mod never claimed. The message has
//      to say whose files these are and what the modder can actually do (a history/units file named like the one below
//      it takes its place), and Nova has to decline the fix out loud rather than silently not offering one.
//   4. "Millennium Dawn and Rise of Nations start a few and launch" is the cry-wolf defence for 3 and 16. It is not a
//      defence for 2,967, and the message used it as one without ever saying so.
//   5. The example was an unnamed division of AFG picked by file order, and the province list beside it REPEATED the
//      example's own province (4893) as somewhere else to look, because `more` dropped the first UNIT and not the
//      first PROVINCE.
//
// WHAT THE GAME DOES, and so what the message may claim (hoi4.exe 1.20.0.0, Operation Postern v1.20.0.0.8873, 56,556,664
// bytes, capstone — section 0 re-reads the bytes). unit.cpp 0x140C5A350 validates a `location` as an INTEGER RANGE and
// nothing else: `cmp [rsp+40h],r15d / jle` (0x140C5A7EE, id <= 0) and `cmp [rsp+40h],ecx / jge` against the province count
// read from [gamestate+2BCh] (0x140C5A8E4), both to the same branch (0x140C5AD19), which logs " has invalid location at
// province ID '…'." and hands the placement call a null province; then a null test on the province object
// (`cmp qword [rbp+458h],r15`, 0x140C5AA85), whose null case is the "…'. Spawning at province ID=1." line; then the
// placement call `[rax+0E8h]` (0x140C5AD0E). No land or sea test stands anywhere between them — so the division spawns on
// the water and the game carries on, which is all the message says.
// ⚠️ RE-DERIVED ON 1.19.4.1, 2026-10-30, and two things read differently there. (1) 1.19.4 strips every source path — the
// file argument of each assert and log call is one shared empty string (0x14279873D) — and the reader keeps it in rsi, so
// the province object 1.19.3 tested with `test rsi,rsi` lives in a stack slot now: the same null test, other bytes.
// (2) Between the lookup and that null test the 1.19.4.1 reader tests one more thing, a gamestate byte, [gamestate+0A35h]
// (0x140C5AA78), and when it is set sends the unit straight to the placement call with whatever the lookup returned. Only
// CCurrentGameState::Load writes that byte (a scan of every [reg+0A35h] write in the image finds two): 1 at 0x1401F8CC8,
// just before it logs "CCurrentGameState::Load_START", and 0 at 0x1401F903F, just after "…Load_END". It is not a land or
// sea test either, so nothing the message says moves; whether 1.19.3 had it cannot be read, because 1.19.3 is gone from
// this machine — its section 0 called the null test the only one, and pinned no bytes between. Its length says it most
// likely did: a 1.19.3 listing of every reference to that build's assert switch (scratchpad
// vgeo-audit/units/verify-CR-3/flag_xref.txt, 2026-10-14) puts the two assert compares around this spot 160 bytes apart
// (0x140C03164, 0x140C03204 — the second straight after the pinned null test), where 1.19.4.1 has 156 with the 20-byte
// branch in (as 1.20.0.0 does, 0x140C5A9F6, 0x140C5AA92) and 136 for the assert and null test alone; without the branch
// 1.19.3 would hold 24 more bytes of the same code there, while its other spans between the reader's assert compares
// differ from 1.19.4.1's by 20 at most. Inference from lengths, not a byte read.
// ⚠️ RE-DERIVED AGAIN ON 1.20.0.0, Operation Postern v1.20.0.0.8873, 2026-11-20, from the strings outward: (1) and (2)
// read the same there, and every address in these notes is now 1.20.0.0's but the 1.19.3 listing's two.
// ⚠️ Until 2026-09-30 this paragraph sent both range tests to the "Spawning at province ID=1." branch. The bytes send
// them to the other one. The jump targets were never asserted, and every unit.cpp instruction the 1.19.2 section did read
// sits at the same offset inside the reader in 1.19.3 (the whole function moved +0xF530), so this is a misreading, not an
// engine change — 1.19.2 is gone from this machine, so that last step is inference, not a byte read. Section 0 now pins
// the targets.
// ⚠️ TWO THINGS THIS PARAGRAPH LEFT OUT, read on 1.19.4.1 on 2026-10-30, pinned in section 0, and neither moves what the
// message says. (1) The reader has a third line, between the null test and the placement: past a test of its own
// (0x140C5AC59, 0x140C5AC60), it logs "… has been placed in … at start, but that is enemy territory." (0x140C5ACA7,
// 0x140C5ACC5) and goes on to the same placement (0x140C5ACFB). It only logs and reads no land or sea. (2) "Logs" means
// under -debug. All three lines carry the log flag word 0x10004, which has a file only behind the debug byte, so a normal
// launch writes none of them. test-a-unit-that-starts-where-the-map-took-its-sea-or-land-away-is-reported.js pins that
// chain, and pins the first land test on this path, one call past the reader, which is a fleet's and not a division's.
// Searching the whole binary for a complaint about a land unit at sea finds none that a normal launch raises: the
// strings about a sea province and a land unit are areas.cpp's two pathfinding asserts, which are about an AREA's first
// land province, not a unit's location; and "at sea" occurs twice — a script-doc line about a general's HQ, and
// ai_air_evaluation.cpp's "Non-naval unit without support for naval transfer found at sea.", an AI-evaluation assert
// behind the assert switch (0x143695AA1). The rule claims none of them. (The module names are 1.19.3's: 1.19.4's binary
// no longer carries source paths. All three asserts are still in it, and every byte section 0 pins of the AI one sits at
// the offset it sat at in 1.19.3.)
//
// THE CONTROLS. A mod whose divisions are all on land is told nothing. A country whose divisions are all on land is
// never named. The Auto-fix button is asked for FROM THE POPUP'S OWN CODE, not from the shape of the problem object.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0, skips = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 460)));
  if (!ok) fails.push(label);
};
const skip = (label) => { skips++; console.log("  SKIP " + label); };

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oob-home-"));
process.env.NOVA_HOME_DIR = HOME;
const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oob-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const tmps = [HOME, APPDATA_DIR];
const DIV = "division_starts_on_water";

// ── The fixture map: 8x8 provinces of 32px in a 256x256 bitmap, ids 1..64 by row.
//    base: 1..48 land (rows 0-5), 49..64 sea.     mod: only 1..24 stay land — rows 3,4,5 are drowned.
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
const BMP = bmp24(256, 256, (x, y) => COL(provAt(x, y)));
function definition(isLand) {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 64; p++) { const [r, g, b] = COL(p); const land = isLand(p); rows.push(`${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`); }
  return rows.join("\n") + "\n";
}
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
const div = (name, loc) => `\tdivision = { ${name ? `name = "${name}" ` : ""}location = ${loc} division_template = "Inf" }`;
const oobFile = (lines) => ['division_template = { name = "Inf" regiments = { infantry = { x = 0 y = 0 } } }', "units = {", ...lines, "}", ""].join("\n");
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ZZZ is the worst hit AND sorts LAST in history/countries, so picking the example by file order picks somebody else's.
// Its first drowned division is deliberately UNNAMED and shares province 25 with the next one: the example must be the
// NAMED one, and 25 must not then be listed again as another place to look.
// ⚠️ AAA's and BBB's drowned provinces together must number FEWER THAN the eight the message prints, or the example's
// own province is pushed past the cut and a report that repeats it reads as clean. That is exactly how this fixture
// passed while the bug was still in: six distinct provinces before ZZZ's, not ten.
const ZZZ_DROWNED = [[null, 25], ["Krasnaya Guard", 25], ...range(26, 43).map((p, i) => [`Z${i + 1} Rifle`, p])];   // 20
const AAA_DROWNED = range(44, 46).map((p, i) => [`A${i + 1} Marine`, p]);                                            // 3, all named
const BBB_DROWNED = range(34, 36).map((p, i) => [`B${i + 1} Militia`, p]);                                           // 3 = every division BBB has
const STARTED = { ZZZ: ZZZ_DROWNED.length + 4, AAA: AAA_DROWNED.length + 4, BBB: BBB_DROWNED.length, CCC: 6 };
const DROWNED = { ZZZ: ZZZ_DROWNED.length, AAA: AAA_DROWNED.length, BBB: BBB_DROWNED.length, CCC: 0 };
const TOTAL_STARTED = Object.values(STARTED).reduce((a, b) => a + b, 0);
const TOTAL_DROWNED = Object.values(DROWNED).reduce((a, b) => a + b, 0);

function writeGame(game) {
  mk(game, "map/provinces.bmp", BMP);
  mk(game, "map/definition.csv", definition((p) => p <= 48));
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
  mk(game, "history/states/1.txt", st(1, range(1, 6), "ZZZ"));
  mk(game, "history/states/2.txt", st(2, range(7, 12), "AAA"));
  mk(game, "history/states/3.txt", st(3, range(13, 18), "BBB"));
  mk(game, "history/states/4.txt", st(4, range(19, 24), "CCC"));
  for (const tag of ["AAA", "BBB", "CCC", "ZZZ"]) mk(game, `history/countries/${tag} - ${tag}land.txt`, `capital = 1\noob = "${tag}_1936"\n`);
  mk(game, "history/units/ZZZ_1936.txt", oobFile([...ZZZ_DROWNED.map((d) => div(d[0], d[1])), ...range(1, 4).map((p) => div(`Z home ${p}`, p))]));
  mk(game, "history/units/AAA_1936.txt", oobFile([...AAA_DROWNED.map((d) => div(d[0], d[1])), ...range(5, 8).map((p) => div(`A home ${p}`, p))]));
  mk(game, "history/units/BBB_1936.txt", oobFile(BBB_DROWNED.map((d) => div(d[0], d[1]))));
  mk(game, "history/units/CCC_1936.txt", oobFile(range(9, 14).map((p) => div(`C home ${p}`, p))));   // every one on land: never named
}

// The Map Errors popup's own code, lifted from public/map.js and run — a problem's shape is not the button.
function popupHtml(problems) {
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const s = MAP.indexOf("function openMapErrorsModal("), e = s < 0 ? -1 : MAP.indexOf("\n  }", s);
  if (s < 0 || e <= s) return null;
  const overlays = [];
  const el = () => ({ style: {}, value: "", disabled: false, textContent: "", innerHTML: "", title: "", dataset: {},
    addEventListener() {}, removeEventListener() {}, focus() {}, click() {}, remove() {}, appendChild() {}, querySelector: () => el(), querySelectorAll: () => [] });
  const sandbox = {
    console, JSON, encodeURIComponent,
    window: { NovaMapRuleLabels: labels },
    document: { getElementById: () => null, createElement: () => { const o = el(); overlays.push(o); return o; }, body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
    setTimeout: () => 0, statusEl: { style: {} }, setStatus() {}, modPath: () => "M",
    escHtml: (x) => String(x == null ? "" : x), hasPendingMapEdits: () => false, fetch: async () => ({ json: async () => ({}) }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${MAP.slice(s, e + 4)}\nglobalThis.__open = openMapErrorsModal;`, sandbox);
  sandbox.__open({ ok: true, problems });
  return overlays.map((o) => o.innerHTML).join("\n");
}

(async () => {
  try {
    console.log("\n=== 0. what the unit loader actually tests (hoi4.exe 1.20.0.0, read-only) ===");
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
          const secs = []; for (let i = 0; i < nSec; i++) { const s = opt + optSize + i * 40; secs.push({ va: head.readUInt32LE(s + 12), size: head.readUInt32LE(s + 16), raw: head.readUInt32LE(s + 20) }); }
          const bytes = (va, n) => { const rva = va - IB, s = secs.find((x) => rva >= x.va && rva < x.va + x.size), b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, rva - s.va + s.raw); return b; };
          const hex = (va, n) => bytes(va, n).toString("hex");
          // Where a `jcc rel32` (0F 8x) or a `cmp byte [rip+disp32]` goes — the targets the 1.19.2 reading never pinned.
          const jccTo = (va) => { const b = bytes(va, 6); return b[0] === 0x0f && (b[1] & 0xf0) === 0x80 ? va + 6 + b.readInt32LE(2) : -1; };
          const ripOf = (va, len, dispAt) => va + len + bytes(va, len).readInt32LE(dispAt);
          const callTo = (va) => { const b = bytes(va, 5); return b[0] === 0xe8 ? va + 5 + b.readInt32LE(1) : -1; };
          const leaText = (va) => { const b = bytes(va, 7); if ((b[0] & 0xfb) !== 0x48 || b[1] !== 0x8d) return null; return bytes(va + 7 + b.readInt32LE(3), 96).toString("latin1").split("\0")[0]; };
          const H = (n) => "0x" + n.toString(16).toUpperCase();
          const ASSERT_SWITCH = 0x143695AA1, INVALID_BRANCH = 0x140C5AD19, GAMESTATE = 0x1433E3B30;
          // The whole of the loader's validation of `location`, in order: two integer-range tests to the same branch,
          // a null test on the province object, then the placement call. Nothing land/sea stands between them — nor in the
          // one other branch between the lookup and the null test, a gamestate byte (pinned below).
          rec("unit.cpp rejects a location id <= 0 (0x140C5A7EE cmp [rsp+40h],r15d; 0x140C5A7F3 jle)",
            hex(0x140C5A7EE, 5) === "44397c2440" && hex(0x140C5A7F3, 2) === "0f8e", [hex(0x140C5A7EE, 5), hex(0x140C5A7F3, 2)]);
          rec("…and one at or past the province count read from [gamestate+2BCh] (0x140C5A8E4 / 0x140C5A8EA cmp [rsp+40h],ecx; jge)",
            hex(0x140C5A8E4, 6) === "8b88bc020000" && hex(0x140C5A8EA, 4) === "394c2440" && hex(0x140C5A8EE, 2) === "0f8d",
            [hex(0x140C5A8E4, 6), hex(0x140C5A8EA, 4), hex(0x140C5A8EE, 2)]);
          rec("⭐⭐ …both to the SAME branch (0x140C5AD19), which logs \" has invalid location at province ID '…'.\" (0x140C5ADA5, 0x140C5ADC0) — not the \"Spawning at province ID=1.\" line — and hands the placement call a null province (0x140C5AE01 xor edx,edx; 0x140C5AE07 call [rax+0E8h])",
            jccTo(0x140C5A7F3) === INVALID_BRANCH && jccTo(0x140C5A8EE) === INVALID_BRANCH
              && leaText(0x140C5ADA5) === " has invalid location at province ID '" && leaText(0x140C5ADC0) === "'."
              && hex(0x140C5AE01, 2) === "33d2" && hex(0x140C5AE07, 6) === "ff90e8000000",
            [H(jccTo(0x140C5A7F3)), H(jccTo(0x140C5A8EE)), leaText(0x140C5ADA5), leaText(0x140C5ADC0), hex(0x140C5AE01, 2), hex(0x140C5AE07, 6)]);
          // ⚠️ 1.19.3 held the province object in rsi and tested it with `test rsi,rsi` (4885f6). 1.19.4 keeps the assert
          // file argument — one empty string now, the build strips source paths — in rsi, and the object in a stack slot.
          rec("…then a null test on the province object: the lookup's result is stored at [rbp+458h] (0x140C5A98F) and compared with r15 (0x140C5AA85 cmp qword [rbp+458h],r15; 0x140C5AA8C jne), zeroed at the reader's start (0x140C5A375 xor r15d,r15d) — whose null case says \"'. Spawning at province ID=1.\" (0x140C5ABD3)",
            hex(0x140C5A98F, 7) === "48898558040000" && hex(0x140C5AA85, 7) === "4c39bd58040000" && hex(0x140C5AA8C, 2) === "0f85"
              && hex(0x140C5A375, 3) === "4533ff" && leaText(0x140C5ABD3) === "'. Spawning at province ID=1.",
            [hex(0x140C5A98F, 7), hex(0x140C5AA85, 7), hex(0x140C5AA8C, 2), hex(0x140C5A375, 3), leaText(0x140C5ABD3)]);
          // ⚠️ NEW ON THIS READING (1.19.4): one more branch sits between the lookup and that null test. It reads a byte of
          // the gamestate — the same object the province count comes from — that CCurrentGameState::Load sets and clears
          // around its own work, and when it is set it sends the unit to the placement call with the lookup's result as it
          // stands. Not a land or sea test, so the message's claim is untouched; whether 1.19.3 had it cannot be read (its
          // length there says it most likely did — see the header).
          rec("⚠️ …and the one other branch before that null test is no land/sea test: a gamestate byte (0x140C5AA71 loads the same gamestate pointer the province count was read through at 0x140C5A8DD; 0x140C5AA78 cmp byte [rax+0A35h],r15b; 0x140C5AA7F jne 0x140C5ACFD, the placement call's setup) that the function logging \"CCurrentGameState::Load_START\" sets (0x1401F8CC8) and clears after \"…Load_END\" (0x1401F903F)",
            hex(0x140C5AA71, 3) === "488b05" && ripOf(0x140C5AA71, 7, 3) === GAMESTATE && hex(0x140C5A8DD, 3) === "488b05" && ripOf(0x140C5A8DD, 7, 3) === GAMESTATE
              && hex(0x140C5AA78, 7) === "4438b8350a0000" && jccTo(0x140C5AA7F) === 0x140C5ACFD && hex(0x140C5ACFD, 7) === "4c8bad58040000"
              && hex(0x1401F8CC8, 8) === "41c686350a000001" && hex(0x1401F903F, 8) === "41c686350a000000"
              && leaText(0x1401F8D03) === "CCurrentGameState::Load_START" && leaText(0x1401F8FE8) === "CCurrentGameState::Load_END",
            [H(ripOf(0x140C5AA71, 7, 3)), H(ripOf(0x140C5A8DD, 7, 3)), hex(0x140C5AA78, 7), H(jccTo(0x140C5AA7F)), hex(0x140C5ACFD, 7), hex(0x1401F8CC8, 8), hex(0x1401F903F, 8), leaText(0x1401F8D03), leaText(0x1401F8FE8)]);
          rec("…and the unit is placed (0x140C5AD04 lea rcx,[r14-10h]; 0x140C5AD0E call [rax+0E8h]) — no land/sea test anywhere between",
            hex(0x140C5AD04, 4) === "498d4ef0" && hex(0x140C5AD0E, 6) === "ff90e8000000", [hex(0x140C5AD04, 4), hex(0x140C5AD0E, 6)]);
          // ⚠️ The header's reading skipped this line. Both ways out of it reach the placement, so it stops nothing.
          rec("⚠️ …and the third line on the way only logs: a non-null province (0x140C5AA8C jne 0x140C5AC12) is put to a test (0x140C5AC59 call; 0x140C5AC5E test al,al), whose false case goes straight to the placement (0x140C5AC60 je 0x140C5AD04) and whose true case says \" has been placed in … at start, but that is enemy territory.\" (0x140C5ACA7, 0x140C5ACC5) and then does too (0x140C5ACFB jmp 0x140C5AD04)",
            jccTo(0x140C5AA8C) === 0x140C5AC12 && callTo(0x140C5AC59) === 0x140749580 && hex(0x140C5AC5E, 2) === "84c0" && jccTo(0x140C5AC60) === 0x140C5AD04
              && leaText(0x140C5ACA7) === " has been placed in " && leaText(0x140C5ACC5) === " at start, but that is enemy territory."
              && hex(0x140C5ACFB, 1) === "eb" && 0x140C5ACFD + bytes(0x140C5ACFB, 2).readInt8(1) === 0x140C5AD04,
            [H(jccTo(0x140C5AA8C)), H(callTo(0x140C5AC59)), H(jccTo(0x140C5AC60)), leaText(0x140C5ACA7), leaText(0x140C5ACC5), hex(0x140C5ACFB, 2)]);
          const READER_LOG_LINES = [[0x140C5AB2F, 0x140C5AB4A], [0x140C5AC6B, 0x140C5AC86], [0x140C5AD1E, 0x140C5AD39]];
          rec("⚠️ …and \"logs\" means under -debug: the reader's three lines (0x140C5AB2F, 0x140C5AC6B, 0x140C5AD1E) all carry the log flag word 0x10004, the fifth argument of the log entry 0x14254FD50, a word a normal launch has no file for (the chain: test-a-unit-that-starts-where-the-map-took-its-sea-or-land-away-is-reported.js)",
            READER_LOG_LINES.every(([flag, call]) => hex(flag, 8) === "c744242004000100" && callTo(call) === 0x14254FD50),
            READER_LOG_LINES.map(([flag, call]) => [hex(flag, 8), H(callTo(call))]));
          // The negative that licenses the message's silence about consequences: the binary has no complaint for it.
          const buf = fs.readFileSync(EXE);
          const nowhere = ["army is at sea", "unit is at sea", "land unit in sea", "division in sea province", "not a land province"];
          const found = nowhere.filter((s) => buf.indexOf(Buffer.from(s, "latin1")) !== -1);
          rec("⭐⭐ hoi4.exe has no message at all about a land unit standing on water, so the rule claims none", found.length === 0, found);
          // …and the one string that does mention a unit at sea is an assert a normal launch never raises (the assert switch
          // starts clear; only -asserts, -ai_testing, -hands_off or the console set it). Counted, not assumed: "at sea" occurs exactly twice, and the other occurrence is a script-doc line about a general's HQ.
          const atSea = []; for (let i = buf.indexOf("at sea"); i !== -1; i = buf.indexOf("at sea", i + 1)) atSea.push(i);
          const lineAt = (o) => { let a = o; while (a > 0 && buf[a - 1] !== 0) a--; return buf.toString("latin1", a, buf.indexOf(0, o)); };
          const AI_AT_SEA = "Non-naval unit without support for naval transfer found at sea.";
          rec("⭐ THE CONTROL: \"at sea\" occurs exactly twice — a general's-HQ doc line, and ai_air_evaluation.cpp's \"" + AI_AT_SEA + "\"",
            atSea.length === 2 && atSea.map(lineAt).some((s) => /^state ID where the general's deployed HQ/.test(s)) && atSea.map(lineAt).includes(AI_AT_SEA),
            atSea.map(lineAt));
          // The je is DERIVED as the instruction straight after the 7-byte cmp, and must come before the assert call it jumps
          // over: pinned only by opcode and target, the je at 0x141357A67 (after the call, skipping the int3) passed too.
          // ⚠️ 1.19.3 also pinned the assert's source path ("…\ai\ai_air_evaluation.cpp"). 1.19.4 strips every path, so the
          // same argument (0x141357A49) is the build's one empty string — pinned as that, not dropped.
          const AI_GATE = 0x141357A12, AI_JE = AI_GATE + 7, AI_CALL = 0x141357A57, ASSERT_FN = 0x14254E310;
          rec("⭐ …and that assert (0x141357A50; its file argument at 0x141357A49 is an empty string, as every one is in 1.19.4) is jumped over unless the assert switch is set (0x141357A12 cmp byte [0x143695AA1],0; the je straight after it, 0x141357A19 je 0x141357B7C, past the assert call at 0x141357A57 to the assert handler 0x14254E310) — the byte the unit reader gates its own asserts on (0x140C5A805)",
            leaText(0x141357A50) === AI_AT_SEA && leaText(0x141357A49) === ""
              && hex(AI_GATE, 2) === "803d" && ripOf(AI_GATE, 7, 2) === ASSERT_SWITCH && hex(AI_GATE + 6, 1) === "00"
              && hex(AI_JE, 2) === "0f84" && jccTo(AI_JE) === 0x141357B7C && AI_JE < AI_CALL && jccTo(AI_JE) > AI_CALL
              && hex(AI_CALL, 1) === "e8" && AI_CALL + 5 + bytes(AI_CALL, 5).readInt32LE(1) === ASSERT_FN
              && hex(0x140C5A805, 3) === "44383d" && ripOf(0x140C5A805, 7, 3) === ASSERT_SWITCH,
            [leaText(0x141357A50), leaText(0x141357A49), H(ripOf(AI_GATE, 7, 2)), hex(AI_GATE + 6, 1), H(AI_JE), hex(AI_JE, 2), H(jccTo(AI_JE)), hex(AI_CALL, 1), H(AI_CALL + 5 + bytes(AI_CALL, 5).readInt32LE(1)), H(ripOf(0x140C5A805, 7, 3))]);
        } finally { fs.closeSync(fd); }
      }
    }

    const game = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oob-game-")); tmps.push(game);
    writeGame(game);

    console.log("\n=== 1. the mod drowns rows 3-5: the report a modder is handed ===");
    let problem = null;
    {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oob-mod-")); tmps.push(mod);
      mk(mod, "descriptor.mod", 'name="Drowned OOB"\n');
      mk(mod, "map/definition.csv", definition((p) => p <= 24));
      const probs = md.validateMapBitmap({ modRoot: mod, gameRoot: game, dependencyRoots: [] }) || [];
      const hits = probs.filter((p) => p.rule === DIV);
      rec("THE CONTROL: exactly one division_starts_on_water problem", hits.length === 1, probs.map((p) => p.rule));
      problem = hits[0] || {};
      const m = String(problem.message || "");

      // ── 1. the denominator
      rec(`⭐⭐⭐ the message gives the SHARE, not a bare count (${TOTAL_DROWNED} of the ${TOTAL_STARTED} this mod starts)`,
        m.indexOf(`${TOTAL_DROWNED} of the ${TOTAL_STARTED} divisions this mod starts`) !== -1, m.slice(0, 200));
      rec("…and the same numbers are on the problem as data", problem.startedDivisions === TOTAL_STARTED && (problem.items || []).length > 0, problem.startedDivisions);

      // ── 2. the countries
      const worstSaid = `Worst hit: ZZZ ${DROWNED.ZZZ} of ${STARTED.ZZZ}, AAA ${DROWNED.AAA} of ${STARTED.AAA}, BBB ${DROWNED.BBB} of ${STARTED.BBB}`;
      rec("⭐⭐⭐ the worst-hit countries are named, worst first, each with its own denominator", m.indexOf(worstSaid) !== -1, m.slice(m.indexOf("Worst hit"), m.indexOf("Worst hit") + 140));
      rec("⭐⭐⭐ a country left with NO ARMY AT ALL is called out by name", /1 country starts with no army at all/.test(m) && /\(BBB\)/.test(m), m.slice(m.indexOf("no army"), m.indexOf("no army") + 90));
      rec("…and the per-country breakdown is on the problem as data, worst first",
        JSON.stringify(problem.countries) === JSON.stringify([
          { tag: "ZZZ", stranded: DROWNED.ZZZ, started: STARTED.ZZZ },
          { tag: "AAA", stranded: DROWNED.AAA, started: STARTED.AAA },
          { tag: "BBB", stranded: DROWNED.BBB, started: STARTED.BBB }]), problem.countries);

      // ── 3. whose files these are, and what the modder can do
      // ⚠️ THESE THREE MOVED WITH THE FIX, 2026-09-24. They required the message to say "Auto-fix leaves them
      // alone" and to tell the modder to write their own order of battle instead. That scope repaired 0 of
      // 2,563 on a world built by Nova's own flow, where every order-of-battle file is inherited. The repair
      // now copies them in — and the message's job changes from explaining a refusal to NAMING THE COST.
      rec("⭐⭐⭐ the message says the order-of-battle files are NOT the mod's, and names the layer that supplies them",
        /3 of the order-of-battle files are not your mod's: the base game supplies them/.test(m), m.slice(m.indexOf("order-of-battle"), m.indexOf("order-of-battle") + 180));
      rec("⭐⭐⭐ …that repairing them COPIES THEM IN, and what that costs — before the click, not after",
        /copying them into your mod first/.test(m) && /replaces the same-named file below it whole/.test(m)
        && /frozen at this build of the game/.test(m), m);
      rec("⭐⭐⭐ …and it NAMES every file it would copy, so the modder can see the bill",
        /history\/units\/AAA_1936\.txt/.test(m) && /history\/units\/BBB_1936\.txt/.test(m), m.slice(m.indexOf("That is"), m.indexOf("That is") + 200));
      rec("THE CONTROL: it does not tell the modder to edit files as though they were theirs", !/edit those locations there/.test(m));

      // ── 4. the cry-wolf defence is quoted, and not stretched
      const S = md.SHIPPING_DIVISIONS_ON_WATER;
      rec("⭐⭐ the shipping evidence is quoted by number, from the module's own constant, as the reason this is a warning",
        m.indexOf(md.shippingDivisionsOnWaterSaid()) !== -1 && Object.keys(S).every((k) => m.indexOf(md.SHIPPING_MAP_NAMES[k]) !== -1 && m.indexOf(String(S[k])) !== -1)
          && problem.severity === "warning" && labels.isFatalRule(DIV) === false, [S, problem.severity]);
      rec(`⭐⭐⭐ …and, at ${TOTAL_DROWNED}, the message says that evidence does not stretch this far`,
        /no shipping map starts anything of this size on water/.test(m), m);
      rec("⭐ it promises no crash and no failed load", !/crash/i.test(m) && !/fail(s|ed)? to load/i.test(m), m);

      // ── 5. the example
      const head = /"([^"]*)" in history\/units\/([A-Za-z0-9_]+\.txt) starts at province (\d+)/.exec(m);
      rec("THE CONTROL: the message opens with a named example", !!head, m.slice(0, 160));
      rec("⭐⭐⭐ the example is a NAMED division of the WORST-HIT country, not whichever came first in file order",
        !!head && head[1] === "Krasnaya Guard" && head[2] === "ZZZ_1936.txt" && head[3] === "25", head && head.slice(1));
      const more = /\((\d+) more, at ([^)]*)\)/.exec(m);
      rec("THE CONTROL: the example is followed by the other provinces to look at", !!more, m.slice(0, 220));
      rec("⭐⭐ …and the example's OWN province is not listed again among them (another division shares 25)",
        !!more && !more[2].split(/,\s*/).includes("25"), more && more[2]);
      // THE CONTROL's control: 25 has to be inside the eight the message prints, or "not listed" is free.
      rec("THE CONTROL's control: the example's province would fall inside the printed eight if it were listed",
        !!more && more[2].split(/,\s*/).filter((x) => /^\d+$/.test(x)).length >= 7, more && more[2]);
      rec(`…the count beside them is every other drowned division (${TOTAL_DROWNED - 1})`, !!more && more[1] === String(TOTAL_DROWNED - 1), more && more[1]);

      // ── the control country
      const all = JSON.stringify(problem);
      rec("⭐⭐ THE CONTROL: a country whose every division is on land is never named (CCC)", !/CCC/.test(all), all.slice(0, 200));
      rec("THE CONTROL: …and its file is not counted among the ones to fix", !/CCC_1936/.test(all));
    }

    console.log("\n=== 2. the popup asked for the Auto-fix button, from its own code ===");
    {
      // ⚠️ MOVED WITH THE FIX, 2026-09-24 — this asserted `autoFix === false` and "no button is offered",
      // which was right while the repair declined inherited files and is wrong now that it copies them in.
      rec("THE CONTROL: the problem now OFFERS Auto-fix, and counts what it can move",
        problem.autoFix === true && problem.movable === TOTAL_DROWNED, { autoFix: problem.autoFix, movable: problem.movable, drowned: TOTAL_DROWNED });
      const html = popupHtml([problem]);
      rec("THE CONTROL: openMapErrorsModal ran", html !== null && /Map Errors/.test(String(html)), String(html).slice(0, 120));
      rec("⭐⭐⭐ the popup renders the button", String(html).indexOf('id="mapErrFix"') !== -1, String(html).slice(0, 200));
      rec("⭐⭐ …while the full report itself is still shown", /Worst hit: ZZZ/.test(String(html)) && /no army at all/.test(String(html)));
      // THE NEGATIVE CONTROL, which is now the interesting direction: a warning whose message names Auto-fix
      // only to decline it must still get NO button. Without it, "a button is offered" would pass even if the
      // popup offered one to everybody. #a-warning-auto-fix-leaves-alone-offers-no-auto-fix
      const no = popupHtml([{ severity: "warning", rule: DIV, autoFix: false, message: "Auto-fix leaves this one alone." }]);
      rec("⭐⭐ THE NEGATIVE CONTROL: the same popup withholds the button when the warning declines",
        String(no).indexOf('id="mapErrFix"') === -1, String(no).slice(0, 200));
    }

    console.log("\n=== 3. THE CONTROL: a mod that drowns nothing ===");
    {
      const dry = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oob-dry-")); tmps.push(dry);
      mk(dry, "descriptor.mod", 'name="Dry OOB"\n');
      // Rows 6-7 were already sea; turning 57..64 into LAKE changes province types without drowning any division.
      const base = definition((p) => p <= 48);
      const dried = base.replace(/\n(5[7-9]|6[0-4]);([^;]+);([^;]+);([^;]+);sea;/g, (s, id, r, g, b) => `\n${id};${r};${g};${b};land;`);
      mk(dry, "map/definition.csv", dried);
      // ⛔ A control that changes nothing proves nothing: an identical definition.csv would be told nothing because the
      // rule's GATE never fires, which is not the same as the search running and finding no drowned division. Pin both.
      rec("THE CONTROL's control: this mod really does change province types (8 sea provinces become land)",
        dried !== base && (dried.match(/;land;/g) || []).length === (base.match(/;land;/g) || []).length + 8,
        [(base.match(/;land;/g) || []).length, (dried.match(/;land;/g) || []).length]);
      const model = md.buildMapModel({ modRoot: dry, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
      const st = md.findUnitsStrandedByTheMap({ modRoot: dry, gameRoot: game, dependencyRoots: [], model });
      rec("THE CONTROL's control: the search ran and read the layer below to judge against", st.judgedAgainstBelow === true, st.judgedAgainstBelow);
      // …and stopped there. The totals are collected on the one pass the rule ALREADY makes over the started orders of
      // battle, and that pass only happens when there is a stranded province to look for — a clean map still reads none.
      rec("⭐ a clean map pays nothing for the totals: no order of battle is read at all", st.startedDivisions === 0 && st.divisionsByTag.size === 0, [st.startedDivisions, st.divisionsByTag.size]);
      const probs = (md.validateMapBitmap({ modRoot: dry, gameRoot: game, dependencyRoots: [] }) || []).filter((p) => p.rule === DIV);
      rec("⭐⭐ nothing is reported when every started division is still on land", probs.length === 0 && st.divisions.length === 0, probs.map((p) => String(p.message).slice(0, 160)));
    }

    console.log("\n=== 4. a mod that ships an order of battle of its OWN is told those files are its to edit ===");
    {
      const own = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oob-own-")); tmps.push(own);
      mk(own, "descriptor.mod", 'name="Own OOB"\n');
      mk(own, "map/definition.csv", definition((p) => p <= 24));
      // Same filename as the base game's, so it REPLACES it — exactly what the message tells a modder to do.
      mk(own, "history/units/ZZZ_1936.txt", fs.readFileSync(path.join(game, "history", "units", "ZZZ_1936.txt")));
      const p = (md.validateMapBitmap({ modRoot: own, gameRoot: game, dependencyRoots: [] }) || []).find((x) => x.rule === DIV) || {};
      const m = String(p.message || "");
      // ⚠️ Moved twice in one day, and the second move is the honest one. It first required "1 file is your
      // mod's own and yours to edit" (the rule named a file and offered nothing), then "…and Auto-fix is
      // offered for THOSE, because the file is already yours". Both encoded a scope that repaired 0 of 2,563
      // on a world built by Nova's own flow. What the message owes the modder now is which files it already
      // has and which it will have to copy — the bill, itemised, before the click.
      rec("⭐⭐⭐ the file the mod already owns is counted separately from the ones it does not",
        /1 file is already your mod's own/.test(m) && /2 of the order-of-battle files are not your mod's/.test(m),
        m.slice(Math.max(0, m.indexOf("already your mod's own") - 140), m.indexOf("already your mod's own") + 60));
      rec("⭐⭐⭐ …and Auto-fix is offered for EVERY drowned division, not just the ones in files it owns",
        p.autoFix === true && p.movable === TOTAL_DROWNED, { autoFix: p.autoFix, movable: p.movable, drowned: TOTAL_DROWNED });
      // THE POSITIVE CONTROL for the affordance: the popup must actually render the button for this problem.
      // Without it, `autoFix: true` could be set and never reach a modder. Section 2 is its negative twin.
      {
        const html = String(popupHtml([p]));
        rec("⭐⭐ …and the popup renders the button", html.indexOf('id="mapErrFix"') !== -1, html.slice(0, 200));
      }
      rec("⭐⭐ …and the two it would have to copy in are NAMED", /history\/units\/AAA_1936\.txt/.test(m) && /history\/units\/BBB_1936\.txt/.test(m), m.slice(m.indexOf("That is"), m.indexOf("That is") + 160));
      rec("THE CONTROL: the totals are unchanged — replacing a file by the same content starts the same army",
        p.startedDivisions === TOTAL_STARTED && (p.countries || []).length === 3, [p.startedDivisions, (p.countries || []).length]);
    }

    console.log("\n=== 5. the totals the report rests on are the search's own, and are derived ===");
    {
      const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oob-tot-")); tmps.push(mod);
      mk(mod, "descriptor.mod", 'name="Totals"\n');
      mk(mod, "map/definition.csv", definition((p) => p <= 24));
      const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
      const st = md.findUnitsStrandedByTheMap({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
      // Derived from the same source the fixture was written from, never typed: every started division of the four OOBs.
      const everyStarted = md.startingUnitLocations({ modRoot: mod, gameRoot: game, dependencyRoots: [], model }).filter((u) => u.kind === "division");
      rec("⭐⭐ startedDivisions is every division the country histories start", st.startedDivisions === everyStarted.length && st.startedDivisions === TOTAL_STARTED, [st.startedDivisions, everyStarted.length, TOTAL_STARTED]);
      const derived = new Map();
      for (const u of everyStarted) derived.set(u.tag, (derived.get(u.tag) || 0) + 1);
      rec("…and divisionsByTag matches it per country, CCC included", [...derived].every((e) => st.divisionsByTag.get(e[0]) === e[1]) && st.divisionsByTag.size === derived.size, [...st.divisionsByTag]);
      rec("THE CONTROL: the stranded set itself is unchanged by collecting them", st.divisions.length === TOTAL_DROWNED, st.divisions.length);
      rec("THE CONTROL: no fleet is reported (this fixture strands none)", st.fleets.length === 0, st.fleets.length);
    }

    console.log("\n=== 6. the corpus figures the message quotes are RE-MEASURED, not trusted ===");
    {
      // ⚠️ THIS SECTION EXISTS BECAUSE THE NUMBER HAD ALREADY DRIFTED. The rule quoted "Rise of Nations 16" — the count
      // over every file in RoN's history/units, not the ones its country histories start. Its started count is 7. A
      // corpus figure typed into a message the modder is asked to trust is exactly the kind of claim that rots quietly,
      // so it is measured here from the installed mods, the same way the rule's own search measures.
      //
      // ⚠️⚠️ AND THEN THE CORPUS MOVED UNDER IT, 2026-10-08. Millennium Dawn's 2.0.2 update (history/units rewritten
      // 2026-10-04) starts 5,083 divisions and NONE of them on water: the "3" the message quotes is gone. A reader that
      // owes nothing to Nova's agrees (0 of 5,877 divisions across every file MD ships). Rise of Nations is unchanged at 7.
      // So 6b went red with Nova unchanged — and it is RIGHT to, because the message now tells a modder something about
      // Millennium Dawn that is not true, and only re-measuring SHIPPING_DIVISIONS_ON_WATER in map-data.js mends that.
      // What 6b must never do is go red because the MEASURE broke: a reader that found nothing would also say "MD now
      // starts 0". So the measure is first run on a fixture whose answer is known (6a), and only then trusted with the
      // installed mods (6b) — and the one claim the message makes about every shipping map is derived from all of them at
      // run time (6c), so a Steam update reddens it only by making the message false.
      const VAN = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
      const W = "D:/SteamLibrary/steamapps/workshop/content/394360/";
      const S = md.SHIPPING_DIVISIONS_ON_WATER;
      rec("THE CONTROL: the message's figures come from an exported constant, not from prose — every key a number with a name to quote it by",
        !!S && Object.keys(S).length >= 1 && Object.keys(S).every((k) => Number.isInteger(S[k]) && typeof md.SHIPPING_MAP_NAMES[k] === "string"), [S, md.SHIPPING_MAP_NAMES]);
      // The one measure every figure below goes through: the divisions the map's country histories START, on a province its
      // own definition.csv makes sea or lake.
      const measure = (modRoot, gameRoot) => {
        const model = md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: true });
        const type = new Map((model.provinces || []).map((p) => [+p.id, p.type]));
        const started = md.startingUnitLocations({ modRoot, gameRoot, dependencyRoots: [], model }).filter((u) => u.kind === "division");
        return { started: started.length, wet: started.filter((u) => { const t = type.get(u.province); return t === "sea" || t === "lake"; }) };
      };

      // ── 6a. THE KNOWN ANSWER. A shipping map built here, carrying both traps the figures have fallen into or could:
      // a file in history/units that no country history names (RoN's 16 was the count over EVERY file), and a started
      // file of a country that owns no state (the game never spawns it).
      {
        const ship = fs.mkdtempSync(path.join(os.tmpdir(), "nova-oob-ship-")); tmps.push(ship);
        mk(ship, "descriptor.mod", 'name="Shipping fixture"\n');
        mk(ship, "map/definition.csv", definition((p) => p <= 24));   // rows 3-5 water, as in section 1; 47 and 48 too
        // Its own state 4 file replaces the base game's, so QQQ owns state 4 and CCC owns nothing at all.
        mk(ship, "history/states/4.txt", `state = {\n\tid = 4\n\tname = "STATE_4"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${range(19, 24).join(" ")} }\n\thistory = {\n\t\towner = QQQ\n\t}\n}\n`);
        mk(ship, "history/countries/QQQ - Qland.txt", 'capital = 4\noob = "QQQ_1936"\n');
        const QQQ_WET = [47, 48], QQQ_HOME = [19, 20];
        mk(ship, "history/units/QQQ_1936.txt", oobFile([...QQQ_WET.map((p) => div(`Q wet ${p}`, p)), ...QQQ_HOME.map((p) => div(`Q home ${p}`, p))]));
        const SPARE = range(25, 29), NO_STATE = range(30, 33);
        mk(ship, "history/units/QQQ_spare.txt", oobFile(SPARE.map((p) => div(`spare ${p}`, p))));          // no history names it
        mk(ship, "history/units/CCC_1936.txt", oobFile(NO_STATE.map((p) => div(`C wet ${p}`, p))));        // CCC owns no state now
        // Derived from the arrays the fixture was written from: the base game's drowned divisions show through, plus QQQ's.
        const KNOWN = TOTAL_DROWNED + QQQ_WET.length;
        const EVERY_FILE = KNOWN + SPARE.length + NO_STATE.length;
        const m = measure(ship, game);
        rec("THE CONTROL's control: the fixture's started count and its every-file count differ, so the traps are live",
          KNOWN !== EVERY_FILE && fs.existsSync(path.join(ship, "history", "units", "QQQ_spare.txt")), [KNOWN, EVERY_FILE]);
        rec(`⭐⭐⭐ the measure counts the divisions the histories START on water — ${KNOWN}, not every file's ${EVERY_FILE}`,
          m.wet.length === KNOWN, { measured: m.wet.length, known: KNOWN, everyFile: EVERY_FILE });
        const byTag = {}; for (const u of m.wet) byTag[u.tag] = (byTag[u.tag] || 0) + 1;
        const wantByTag = { ZZZ: DROWNED.ZZZ, AAA: DROWNED.AAA, BBB: DROWNED.BBB, QQQ: QQQ_WET.length };
        rec("⭐⭐ …per country, as written: ZZZ AAA BBB from the layer below, QQQ its own, and nothing of CCC, which owns no state",
          Object.keys(byTag).length === Object.keys(wantByTag).length && Object.keys(wantByTag).every((t) => byTag[t] === wantByTag[t]), { measured: byTag, want: wantByTag });
        // Every division the started files hold, land ones included — so "wet" above is the map's own types picking them
        // out, not a measure that calls everything it reads water.
        const STARTED_ALL = STARTED.ZZZ + STARTED.AAA + STARTED.BBB + QQQ_WET.length + QQQ_HOME.length;
        rec("THE CONTROL: …out of every division those files start, land ones included", m.started === STARTED_ALL && m.started > m.wet.length, { started: m.started, want: STARTED_ALL });
      }

      // Nova's rule: a test that needs the installed game FAILS when it is missing. A third-party mod that is not installed
      // is only reported as not run.
      if (!fs.existsSync(path.join(VAN, "history", "units")) || !fs.existsSync(path.join(VAN, "map", "definition.csv"))) {
        rec("the base game is installed — every figure the message quotes is measured over it, and a missing game is a failure, not a pass", false, VAN);
      } else {
        // ── 6b. Each figure the message quotes, against the installed mod it names. The keys come from the constant; a key
        // this table cannot place fails rather than going unmeasured.
        const WHERE = { MD: "2777392649", RoN: "2026448968", MDC: "3721160655", OWB: "2265420196", NV: "1827273767", R56: "820260968", HoM: "2624254320" };
        const versionOf = (root) => { try { return (/^\s*version\s*=\s*"([^"]*)"/m.exec(fs.readFileSync(path.join(root, "descriptor.mod"), "utf8")) || [])[1] || "?"; } catch (_) { return "?"; } };
        for (const key of Object.keys(S)) {
          if (!WHERE[key]) { rec(`the message quotes ${key}, and this test knows which installed mod to re-measure it on`, false, Object.keys(WHERE)); continue; }
          const root = W + WHERE[key];
          if (!fs.existsSync(path.join(root, "map", "definition.csv"))) { skip(`${key} (workshop ${WHERE[key]}) is not installed here — its figure was NOT re-measured`); continue; }
          const m = measure(root, VAN);
          rec(`⭐⭐⭐ ${key} really does start ${S[key]} division(s) on water, as the message tells the modder (of ${m.started})`,
            m.wet.length === S[key], { measured: m.wet.length, quoted: S[key], installed: `${key} ${versionOf(root)}`, sample: m.wet.slice(0, 3).map((u) => `${u.tag} ${u.file}@${u.province}`),
              meaning: "the installed mod no longer ships what the message says it does — re-measure SHIPPING_DIVISIONS_ON_WATER in map-data.js" });
        }

        // ── 6c. The message says "no shipping map starts anything of this size on water" past the largest figure it quotes.
        // Asked of every map installed here — the base game and each workshop item that ships a definition.csv, listed from
        // the folder, never typed — so it can only go red when a map really does start more than that.
        const maps = [["the base game", VAN]];
        try {
          for (const id of fs.readdirSync(W).sort()) {
            const root = W + id;
            if (!fs.existsSync(path.join(root, "map", "definition.csv"))) continue;
            let name = id; try { name = (/^\s*name\s*=\s*"([^"]*)"/m.exec(fs.readFileSync(path.join(root, "descriptor.mod"), "utf8")) || [])[1] || id; } catch (_) {}
            maps.push([name, root]);
          }
        } catch (_) { /* no workshop folder: the base game alone is still asked */ }
        const LIMIT = Math.max(...Object.values(S));
        const counts = maps.map(([name, root]) => { const m = measure(root, VAN); return { name, wet: m.wet.length, of: m.started }; });
        rec(`⭐⭐ no installed map starts more divisions on water than the largest figure the message quotes (${LIMIT}), past which it says no shipping map does (${counts.length} maps asked)`,
          counts.every((c) => c.wet <= LIMIT) && counts.length >= 1, counts.map((c) => `${c.name}: ${c.wet} of ${c.of}`));
        console.log("  ..   measured: " + counts.map((c) => `${c.name} ${c.wet} of ${c.of}`).join(" · "));
      }
    }

    console.log(`\n=== an order of battle under water is reported in full: ${checks} checks, ${fails.length} failed${skips ? `, ${skips} skipped` : ""} ===`);
    if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exitCode = 1; }
  } catch (e) {
    console.error("\nUNCAUGHT: " + (e && e.stack ? e.stack : e));
    process.exitCode = 1;
  } finally {
    for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
  }
})();
