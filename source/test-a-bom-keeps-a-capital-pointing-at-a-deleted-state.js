// ⛔ #a-bom-keeps-a-capital-pointing-at-a-deleted-state — DELETE MAP STRIPPED THE CAPITAL FROM SIX COUNTRY
// FILES OUT OF 337, AND REPORTED SUCCESS.
//
// Delete map deletes every state in the mod, so step (4) of blankMapToSea strips `capital = N` from every
// country file: a capital naming a state that no longer exists is in Nova's own curated FATAL set
// (capital_state_missing — hoi4.exe's country.cpp refuses it with "it is not a valid state!" and the Save
// gate stops on it).
//
// A country history file is normally written by the game's own tooling, which puts a UTF-8 BOM at the top,
// and `capital = N` is normally its FIRST line. readFileSync(…, "utf8") keeps that BOM as \uFEFF, so line 1
// reads "\uFEFFcapital = 1328" — and the strip's `^[ \t]*capital` does not match a \uFEFF. Line 1 was never
// stripped. Only a capital on some LATER line ever was.
//
// 📊 Measured 2026-09-17 by running that expression over every country file of the six installed maps:
//
//     map              files   with a BOM   declaring a capital   stripped   LEFT BEHIND
//     vanilla            364          336                   363         30           333
//     Millennium Dawn    393            0                   393        393             0
//     Road to 56         410          364                   410         50           360
//     Old World Blues    354          344                   337          8           329
//     Novum Vexillum     343          343                   342          6           336
//     Rise of Nations    546          209                   542        491            51
//
// Millennium Dawn is the one map with no BOMs anywhere, which is why this never showed: the mod it was
// developed against is the only one it worked on. Driving the real Delete map over a copy of Old World Blues,
// the call reported strippedCapitals = 6 of 337; with the fix it reports 335 and leaves none behind.
//
// ⚠️ THE COUNT UNDERSTATES IT. After Generate land re-creates states 1..N, most of those old ids exist again,
// so the surviving capitals are NOT reported — the countries are silently re-homed into whatever generated
// state took their number, and only the handful above the new maximum are named. The owner's own flow over a
// copy of Old World Blues ended with 9 capital_state_missing errors and 320 more pointing at land those
// countries never owned.
//
// ⭐ THE FIX ALREADY EXISTED NEXT DOOR: setCountryCapital, in the same file, finds the assignment with
// `(?:^|[^A-Za-z0-9_])capital`, which matches straight after a \uFEFF, and readCountryCapitals reads them
// with `\bcapital`. Nova could always SET a capital in these files and only ever failed to REMOVE one — which
// is how the validator could see a capital this writer could not.
//
// ⛔ …AND THE ANNOTATION GOES WITH THE LINE. #a-capital-comment-outlives-its-capital — vanilla writes
// `capital = 219 #Sukhumi`; a strip that ended at the digits left `#Sukhumi` alone on a line, captioning
// whatever came next. Country files whose capital line carries a trailing comment: vanilla 152, Road to 56
// 122, Rise of Nations 83, Novum Vexillum 4, Millennium Dawn 2, Old World Blues 0.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 350) : "")); }
};

const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360/";
const CORPUS = {
  vanilla: GAME,
  "Millennium Dawn": WORKSHOP + "2777392649",
  "Road to 56": WORKSHOP + "820260968",
  "Old World Blues": WORKSHOP + "2265420196",
  "Novum Vexillum": WORKSHOP + "1827273767",
  "Rise of Nations": WORKSHOP + "2026448968",
};
const tmps = [];
const BOM = "\uFEFF";
// A capital the blank must remove, judged the way the READER judges one: comments masked, so a line that is
// entirely commented out does not count, and a \uFEFF in front of it does not hide it.
const HAS_TOP_LEVEL_CAPITAL = /^[ \t\uFEFF]*capital[ \t]*=[ \t]*\d+/m;

// ══ 1. THE SHAPE IS REAL — the installed maps, read-only ════════════════════════════════════════════════
console.log("\n=== 🈯 how the shipping maps write a capital ===");
let measured = 0, atRisk = 0;
{
  for (const [name, root] of Object.entries(CORPUS)) {
    const dir = path.join(root, "history", "countries");
    if (!fs.existsSync(dir)) { console.log(`  ..   (${name} is not installed)`); continue; }
    let files = 0, bom = 0, top = 0, bomAndTop = 0, annotated = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.toLowerCase().endsWith(".txt")) continue;
      let t = ""; try { t = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
      files++;
      const hasBom = t.charCodeAt(0) === 0xfeff;
      if (hasBom) bom++;
      const hasTop = HAS_TOP_LEVEL_CAPITAL.test(t);
      if (hasTop) top++;
      // The exact shape the old strip could not see: a BOM, and the capital on the FIRST line.
      if (hasBom && /^\uFEFF[ \t]*capital[ \t]*=[ \t]*\d+/.test(t)) bomAndTop++;
      if (/^[ \t\uFEFF]*capital[ \t]*=[ \t]*\d+[ \t]*#/m.test(t)) annotated++;
    }
    measured++;
    atRisk += bomAndTop;
    console.log(`  ..   ${name}: ${files} country files · ${bom} start with a BOM · ${top} name a capital · `
      + `${bomAndTop} carry it on the FIRST line BEHIND a BOM · ${annotated} annotate it with a comment`);
  }
  if (!measured) console.log("  ..   (no map is installed — the fixture below still carries the guard)");
  else ok(atRisk > 0, "⭐⭐ the shape is not invented: shipping maps DO put the capital on line 1 behind a BOM", atRisk);
}

// ══ 2. THE FIXTURE — one mod, six country files, every way a capital can be written ═════════════════════
//
// The blank refuses a world the mod does not own, so the fixture owns a tiny provinces.bmp and the
// definition.csv beside it, and declares replace_path="map" so no layer below is consulted.
const W = 8, H = 4;
const COL = { 1: [10, 10, 10], 2: [20, 20, 20] };
const idAtX = (x) => (x < 4 ? 1 : 2);
const FILES = {
  // name            → [text, must the capital be gone afterwards?]
  "AAA.txt": [BOM + "capital = 3\noob = \"AAA_1936\"\n", true],                         // the shape that was missed
  "BBB.txt": ["capital = 3\noob = \"BBB_1936\"\n", true],                                // no BOM, line 1
  "CCC.txt": [BOM + "# a note the modder wrote\ncapital = 3\noob = \"CCC_1936\"\n", true], // BOM, but not line 1
  "DDD.txt": [BOM + "#capital = 3\noob = \"DDD_1936\"\n", false],                        // commented out: not a capital
  "EEE.txt": [BOM + "capital = 3 #Somewhere\noob = \"EEE_1936\"\n", true],                // annotated, as vanilla writes it
  "FFF.txt": [BOM + "oob = \"FFF_1936\"\n\tcapital = 3\n", true],                         // indented, further down
};

function makeMod() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bomcap-")); tmps.push(d);
  fs.mkdirSync(path.join(d, "map"), { recursive: true });
  fs.mkdirSync(path.join(d, "history", "countries"), { recursive: true });
  fs.mkdirSync(path.join(d, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(d, "descriptor.mod"), 'name="BomCap"\nreplace_path="map"\n');

  const rowSize = Math.floor((24 * W + 31) / 32) * 4, imageSize = rowSize * H;
  const bmp = Buffer.alloc(54 + imageSize);
  bmp.write("BM", 0, "ascii");
  bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10); bmp.writeUInt32LE(40, 14);
  bmp.writeInt32LE(W, 18); bmp.writeInt32LE(H, 22); bmp.writeUInt16LE(1, 26);
  bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const c = COL[idAtX(x)]; bmp[o++] = c[2]; bmp[o++] = c[1]; bmp[o++] = c[0]; } }
  fs.writeFileSync(path.join(d, "map", "provinces.bmp"), bmp);
  fs.writeFileSync(path.join(d, "map", "definition.csv"),
    "0;0;0;0;land;false;unknown;0\n1;10;10;10;land;false;plains;1\n2;20;20;20;sea;false;ocean;0\n");
  fs.writeFileSync(path.join(d, "history", "states", "3-Somewhere.txt"),
    "state = {\n\tid = 3\n\tname = \"STATE_3\"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { 1 }\n}\n");
  for (const [f, [text]] of Object.entries(FILES)) fs.writeFileSync(path.join(d, "history", "countries", f), text, "utf8");
  return d;
}

console.log("\n=== ⛔ Delete map must leave no capital naming a state it just deleted ===");
{
  const d = makeMod();
  const before = {};
  for (const f of Object.keys(FILES)) before[f] = fs.readFileSync(path.join(d, "history", "countries", f), "utf8");
  const wanted = Object.entries(FILES).filter(([, v]) => v[1]).map(([f]) => f);
  ok(wanted.every((f) => HAS_TOP_LEVEL_CAPITAL.test(before[f])),
    `the fixture really starts with a capital in all ${wanted.length} files that should lose one`, wanted);

  const r = md.blankMapToSea({ modRoot: d, gameRoot: path.join(os.tmpdir(), "nova-bomcap-nogame"), dependencyRoots: [] });
  ok(r.changed === true, "the blank ran", r.error || r);
  ok(r.deletedStates === 1, "…and deleted the one state the fixture had", r.deletedStates);

  const after = {};
  for (const f of Object.keys(FILES)) after[f] = fs.readFileSync(path.join(d, "history", "countries", f), "utf8");
  const left = wanted.filter((f) => HAS_TOP_LEVEL_CAPITAL.test(after[f]));
  ok(left.length === 0, "⭐⭐⭐ not one of them still names a capital — including the one behind a BOM", left);
  ok(!HAS_TOP_LEVEL_CAPITAL.test(after["AAA.txt"]),
    "⭐⭐⭐ AAA.txt: a \\uFEFF in front of `capital` is not a hiding place", JSON.stringify(after["AAA.txt"]).slice(0, 80));
  ok(r.strippedCapitals === wanted.length,
    `⭐ the blank reported stripping all ${wanted.length}, not just the ones it could see`, { reported: r.strippedCapitals, expected: wanted.length });

  // …and what it must NOT do.
  ok(after["DDD.txt"] === before["DDD.txt"],
    "⭐ a capital that is entirely commented out is left exactly as the modder wrote it", JSON.stringify(after["DDD.txt"]).slice(0, 80));
  for (const f of Object.keys(FILES)) {
    if (before[f].charCodeAt(0) !== 0xfeff) continue;
    ok(after[f].charCodeAt(0) === 0xfeff, `⭐ ${f}: the BOM is still there — it is the file's encoding, not part of the statement`,
      JSON.stringify(after[f].slice(0, 12)));
  }
  // #a-capital-comment-outlives-its-capital — the annotation goes with the line it annotated.
  ok(!/Somewhere/.test(after["EEE.txt"]),
    "⭐⭐ EEE.txt: `capital = 3 #Somewhere` took its comment with it, rather than leaving it to caption the next statement",
    JSON.stringify(after["EEE.txt"]));
  ok(/oob = "EEE_1936"/.test(after["EEE.txt"]), "…and everything else in that file is untouched", JSON.stringify(after["EEE.txt"]));
  ok(/a note the modder wrote/.test(after["CCC.txt"]),
    "⚠️ a comment on its OWN line above the capital is the modder's and stays", JSON.stringify(after["CCC.txt"]));
  for (const f of Object.keys(FILES)) {
    const keptOob = /oob = "/.test(after[f]);
    ok(keptOob, `${f}: the rest of the file survived`, JSON.stringify(after[f]).slice(0, 80));
  }
}

// ══ 3. …and the reader and the writer beside it agree ══════════════════════════════════════════════════
//
// The point of the bug was an asymmetry: Nova could READ and SET a capital behind a BOM and could not REMOVE
// one. Pin all three against the same file, so a future change to any of them has to keep them in step.
console.log("\n=== 🈯 read, set and strip must all see the same capital ===");
{
  const d = makeMod();
  // The reader is buildMapModel's own `capitals`, which is what the validator's capital rules read.
  const model = md.buildMapModel({ modRoot: d, gameRoot: path.join(os.tmpdir(), "nova-bomcap-nogame"), dependencyRoots: [] });
  const caps = (model && model.capitals) || null;
  if (!caps) ok(false, "the map model carries the capitals it read", model && Object.keys(model));
  else {
    ok(caps.AAA === 3, "⭐ the READER sees the capital behind the BOM", caps.AAA);
    ok(caps.DDD === undefined, "…and does not see the commented-out one", caps.DDD);
  }
  if (typeof md.setCountryCapital !== "function") ok(false, "map-data exports setCountryCapital", typeof md.setCountryCapital);
  else {
    const s = md.setCountryCapital({ modRoot: d, gameRoot: path.join(os.tmpdir(), "nova-bomcap-nogame"), dependencyRoots: [], tag: "AAA", stateId: 7 });
    const txt = fs.readFileSync(path.join(d, "history", "countries", "AAA.txt"), "utf8");
    ok(s.changed === true && /capital = 7/.test(txt), "⭐ the SETTER writes through the BOM too", { s, txt: JSON.stringify(txt).slice(0, 60) });
    ok(txt.charCodeAt(0) === 0xfeff, "…and keeps the BOM", JSON.stringify(txt.slice(0, 8)));
    ok((txt.match(/capital[ \t]*=/g) || []).length === 1, "…and did not add a second capital line", txt.match(/capital[ \t]*=/g));
  }
}

// ══ 4. …AND THE BRANCH THAT ADDS A CAPITAL THAT WAS NEVER THERE ═══════════════════════════════════════
//
// ⛔ #a-prepended-capital-lands-in-front-of-the-bom — section 3 only ever exercises the REPLACE branch,
// because AAA.txt already has a capital. When the file has none the writer PREPENDS `capital = N\n` at
// offset 0 — in front of the BOM, which stops being the file's encoding marker and becomes an invisible
// U+FEFF at the head of line 2. Every BOM check in this project is `charCodeAt(0) === 0xfeff`, so the next
// writer to touch the file reads it as having no BOM at all.
//
// DDD.txt is the case in the wild: its only `capital` is commented out, so the finder correctly does not see
// one (#a-commented-capital-is-not-a-capital) and the prepend branch runs. Old World Blues ships CHI exactly
// that way.
//
// 📊 Measured 2026-09-17 by running setCountryCapital over every country file of the six installed maps and
// counting those that came back no longer starting with their BOM: 15 — vanilla's `PRC - ComChina.txt` and
// 14 Old World Blues files that open with `set_country_flag` and declare no capital at all.
console.log("\n=== ⛔ adding a capital to a file that had none must not step in front of the BOM ===");
{
  const d = makeMod();
  const NOGAME = path.join(os.tmpdir(), "nova-bomcap-nogame");
  // …and a file with no `capital` anywhere at all, the shape those 15 shipping files have.
  fs.writeFileSync(path.join(d, "history", "countries", "GGG.txt"), BOM + "set_country_flag = something\noob = \"GGG_1936\"\n", "utf8");
  // …and one that opens with TWO BOMs, as three Road to 56 files do.
  fs.writeFileSync(path.join(d, "history", "countries", "HHH.txt"), BOM + BOM + "set_country_flag = something\n", "utf8");

  for (const [tag, file] of [["DDD", "DDD.txt"], ["GGG", "GGG.txt"], ["HHH", "HHH.txt"]]) {
    const before = fs.readFileSync(path.join(d, "history", "countries", file), "utf8");
    let lead = 0; while (before.charCodeAt(lead) === 0xfeff) lead++;
    const r = md.setCountryCapital({ modRoot: d, gameRoot: NOGAME, dependencyRoots: [], tag, stateId: 3 });
    const after = fs.readFileSync(path.join(d, "history", "countries", file), "utf8");
    let leadAfter = 0; while (after.charCodeAt(leadAfter) === 0xfeff) leadAfter++;
    ok(r.changed === true, `${file}: the setter ran`, r.error || r);
    ok(/capital[ \t]*=[ \t]*3/.test(after), `…${file}: and the capital it was asked for is in the file`, JSON.stringify(after.slice(0, 60)));
    ok(leadAfter === lead, `⭐⭐ ${file}: every BOM it had (${lead}) is still at the front`, JSON.stringify(after.slice(0, 40)));
    ok(after.indexOf(BOM, leadAfter) === -1, `…${file}: and no U+FEFF is left loose in the body`, JSON.stringify(after.slice(0, 60)));
  }
  // The control: a file with no BOM must not acquire one.
  const bbb = fs.readFileSync(path.join(d, "history", "countries", "BBB.txt"), "utf8");
  ok(bbb.indexOf(BOM) === -1, "a country file that had no BOM is not given one", JSON.stringify(bbb.slice(0, 30)));
}

for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
