// ⛔ #a-nested-sub-block-hides-the-port — 103 REAL NAVAL BASES READ AS ZERO, AND EDITING ONE FORKED THE FILE.
//
// A province's buildings are written inside the state's `buildings = { }` as `<pid> = { … }`. Vanilla often
// nests another block inside that:
//
//     11374 = { naval_base = 10  naval_headquarters = { level = 1  allowed = { has_dlc = "…" } } }
//
// Both the reader (parseStatesText) and the writer (setProvinceBuildingInHistory) matched the province with
// `[^{}]*`, which cannot span a nested block. Two consequences:
//
//   READ  — the province never matched, provinceBuildings stayed empty, and the Inspect panel showed
//           "Naval base 0" for a level-10 port. Measured across the installed corpora: 103 invisible naval
//           bases — vanilla 13, Millennium Dawn 74, Road to 56 13, Rise of Nations 2, Novum Vexillum 1.
//   WRITE — no match meant the append branch ran, adding a SECOND `11374 = { naval_base = 5 }` to the same
//           block. The file then declared one province twice with two different values; the panel read the
//           new flat block and the game read whatever it reads. Nothing inside Nova could show the conflict.
//
// The nested block must also not LEAK: `naval_headquarters = { level = 1 }` must not give the province a
// `level` of its own. That is what topLevelOnly is for.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

const NESTED = `state = {
\tid = 900
\tname = "STATE_900"
\tprovinces = { 11374 3838 }
\thistory = {
\t\towner = ENG
\t\tbuildings = {
\t\t\tinfrastructure = 5
\t\t\t11374 = {
\t\t\t\tnaval_base = 10
\t\t\t\tnaval_headquarters = { level = 1 allowed = { has_dlc = "No Compromise, No Surrender" } }
\t\t\t}
\t\t\t3838 = { naval_base = 4 }
\t\t}
\t}
}
`;

try {
  console.log("\n-- READ: a nested sub-block must not hide the province's own buildings --");
  {
    const st = md.parseStatesText(NESTED);
    const pb = st[0].provinceBuildings || {};
    ok(pb["11374"] && pb["11374"].naval_base === 10,
      "the nested province's naval_base reads as 10, not 0", pb["11374"]);
    ok(pb["3838"] && pb["3838"].naval_base === 4,
      "…and the flat province beside it still reads", pb["3838"]);
    ok(!pb["11374"] || pb["11374"].level === undefined,
      "the nested naval_headquarters does NOT leak its `level` onto the province", pb["11374"]);
    ok(st[0].buildings && st[0].buildings.infrastructure === 5,
      "…and the state's own buildings are unaffected", st[0].buildings);
    ok(!st[0].buildings || st[0].buildings.naval_base === undefined,
      "…with no province key pushed up to the state level", st[0].buildings);
  }

  console.log("\n-- WRITE: editing it must edit IN PLACE, never append a second block --");
  {
    const out = md.setProvinceBuildingInHistory(NESTED, 11374, "naval_base", 5);
    const blocks = (out.match(/11374\s*=\s*\{/g) || []).length;
    ok(blocks === 1, "the province is still declared exactly once", blocks);
    ok(/naval_base\s*=\s*5/.test(out), "…with the new value");
    ok(!/naval_base\s*=\s*10/.test(out), "…and not the old one as well");
    ok(/naval_headquarters\s*=\s*\{/.test(out), "the nested sub-block survives the edit");
    ok(/has_dlc\s*=\s*"No Compromise, No Surrender"/.test(out), "…including its own nested contents");
    ok(/3838\s*=\s*\{\s*naval_base\s*=\s*4\s*\}/.test(out), "the neighbouring province is untouched");
    // and it round-trips
    const back = md.parseStatesText(out)[0].provinceBuildings || {};
    ok(back["11374"] && back["11374"].naval_base === 5, "…and the file reads back as 5", back["11374"]);
  }

  console.log("\n-- a commented-out province block is still not the real one --");
  {
    const withComment = NESTED.replace("\t\t\t3838 = { naval_base = 4 }", "\t\t\t# 3838 = { naval_base = 9 }\n\t\t\t3838 = { naval_base = 4 }");
    const pb = md.parseStatesText(withComment)[0].provinceBuildings || {};
    ok(pb["3838"] && pb["3838"].naval_base === 4, "the live block wins over the commented one", pb["3838"]);
    const out = md.setProvinceBuildingInHistory(withComment, 3838, "naval_base", 7);
    ok(/#\s*3838 = \{ naval_base = 9 \}/.test(out), "…and the comment is left exactly as the author wrote it");
    ok((out.match(/^\s*3838\s*=\s*\{/gm) || []).length === 1, "…with still one live block", out.match(/^\s*3838\s*=\s*\{/gm));
  }

  console.log("\n-- province 121 must not match inside 1121 --");
  {
    const s = NESTED.replace("3838 = { naval_base = 4 }", "1121 = { naval_base = 4 }");
    const out = md.setProvinceBuildingInHistory(s, 121, "naval_base", 3);
    ok(/1121\s*=\s*\{\s*naval_base\s*=\s*4\s*\}/.test(out), "1121 keeps its value when 121 is written", out.slice(-200));
  }

  console.log("\n-- ⭐ the corpus: how many real ports were invisible --");
  {
    const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const dir = path.join(GAME, "history", "states");
    if (!fs.existsSync(dir)) console.log("  ..   skipped: the base game is not installed");
    else {
      let nested = 0, ports = 0;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".txt")) continue;
        let txt = ""; try { txt = fs.readFileSync(path.join(dir, f), "utf8"); } catch (_) { continue; }
        const st = md.parseStatesText(txt);
        for (const s of st) {
          for (const pid of Object.keys(s.provinceBuildings || {})) {
            if (s.provinceBuildings[pid].naval_base > 0) ports++;
          }
        }
        if (/\d+\s*=\s*\{[^{}]*\{/.test(txt)) nested++;
      }
      ok(ports > 0, `vanilla's naval bases are now readable (${ports} provinces with one)`, ports);
      ok(nested > 0, `…and ${nested} vanilla state files contain a nested province sub-block, which is why it mattered`, nested);
    }
  }
} catch (e) {
  ok(false, "threw: " + e.message + "\n" + e.stack);
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
