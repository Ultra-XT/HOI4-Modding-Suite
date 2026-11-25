// #a-state-the-mod-replaced-does-not-show-through + #a-refusal-is-judged-after-the-id-steps — THE STATES THE SEA CLEANUP SAYS IT
// LEFT ALONE ARE STATES THE GAME LOADS, NAMED BY THE IDS THEY HOLD WHEN THE CLICK ENDS.
//
// THE DEFECT (B6-18, repro-B6-18.js). On a Nova-generated world — whose descriptor says replace_path="history/states" — a ↔ Move of
// a state's last province and one Auto-fix click ended on
//   "(⛔ 1 state lists 5 sea provinces and was left alone — that state file is not your mod's; the base game supplies it, showing
//    through your map. … Make the provinces land again in the terrain editor …; e.g. state 1081)"
// while Map Errors said 0 errors, 0 warnings, and the mod's own state 1081 listed no sea at all. Advice that, followed, turns five
// sea provinces into land. Two causes, and this file holds one fixture to each, because overlapping causes need a fixture EACH for
// a back-out to bite:
//
//   1. fixSeaProvinceLeftovers read the layers below through baseRootsFor, which honours only a DEPENDENCY's replace_path, so the
//      base game's history/states — which a mod declaring the line never loads — was scanned as if it showed through. The fix next
//      door is layersBelow, which editStateBlock and stateFileTheGameKeeps already ask. Sections 1 and 2 (a control without the line).
//   2. It judged mid-click: its refusals name states by id, and passes after it change which ids exist (the second
//      closeStateIdGaps slides the top state into the gap the final empty-state sweep opens; fixStateIdFloor cuts new states).
//      autoFixMap now asks the same scan again, judging only, once no state id moves. Section 3: a state the click renumbers.
//
// Section 4 holds the judgement to writing nothing; section 5 derives the positions from the source, comments masked.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("seajudge");
const { createApp } = require("./server.js");
const md = require("./map-data.js");
const P = require("./testlib-map-page.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

const RULE = "non_land_province_in_state";
// The game ships state 3 = { 3 }. A mod that retypes province 3 to sea in its own definition.csv: with replace_path="history/states"
// the game's state 3 does not load at all; without it, state 3 shows through and lists a sea province the mod made.
const BASE_STATE = 3;
const SEA_3 = { 3: "3;0;200;0;sea;false;ocean;0" };
const descriptor = (name, lines = []) => `name="${name}"\nsupported_version="1.*"\n${lines.map((l) => `replace_path="${l}"\n`).join("")}`;
const ownStates = { "history/states/1-A.txt": lib.st(1, "4"), "history/states/2-B.txt": lib.st(2, "2 5") };
const fix = (mod, o = {}) => md.fixSeaProvinceLeftovers({ modRoot: mod, gameRoot: W.GAME, dependencyRoots: [], ...o });
const clauseOf = (line) => (/\(⛔ [^)]*state files? (?:is|are) not your mod's[^)]*\)/.exec(line) || [""])[0];
const stateFiles = (mod) => { const d = path.join(mod, "history", "states"); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith(".txt")) : []; };
/** id -> provinces list, read off the mod's own state files as text (comments are not part of this fixture). */
function statesOnDisk(mod) {
  const out = new Map();
  for (const f of stateFiles(mod)) {
    const t = fs.readFileSync(path.join(mod, "history", "states", f), "utf8");
    const id = parseInt((/(?:^|\n)\s*id\s*=\s*(\d+)/.exec(t) || [])[1], 10);
    const pm = /provinces\s*=\s*\{([^}]*)\}/.exec(t);
    if (Number.isFinite(id)) out.set(id, pm ? pm[1].trim().split(/\s+/).filter(Boolean).map(Number) : []);
  }
  return out;
}

(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);

    console.log("=== 1. a mod that replaces history/states: the base game's state does not show through, so nothing names it ===");
    const rep = W.mod("Replaces", { "descriptor.mod": descriptor("Replaces", ["history/states"]), "map/definition.csv": lib.DEF(SEA_3), ...ownStates });
    {
      const v = await S.validate(rep);
      rec(`the map the game loads lists province 3 in no state: Map Errors names no state for ${RULE}`, lib.idsOf(v, RULE).length === 0, lib.idsOf(v, RULE));
      const r = fix(rep);
      rec("the fixer ran", !!r && !r.error, r);
      rec(`⭐⭐⭐ …and names no state as "not your mod's" — the base game's state ${BASE_STATE} is not loaded beneath a mod that replaces history/states`,
        Array.isArray(r.notYours) && r.notYours.length === 0 && (r.notYoursProvinces || 0) === 0, { notYours: r.notYours, notYoursRoots: r.notYoursRoots });
      const fr = await S.autoFix(rep);
      rec("one Auto-fix click, as the page sends it, answers ok", fr.status === 200 && fr.body && fr.body.ok, { status: fr.status, error: fr.body && fr.body.error });
      const slv = (fr.body.fixes && fr.body.fixes.seaLeftovers) || {};
      rec("⭐⭐⭐ …and its seaLeftovers names no state the base game supplies", (slv.notYours || []).length === 0, slv);
      const line = P.autoFixSummary(fr.body);
      rec("⭐⭐⭐ …so the 🔧 line the page builds from it says no state file shows through", !clauseOf(line) && !/the base game supplies/.test(line), line.slice(0, 600));
    }

    console.log("\n=== 2. THE CONTROL: the same mod without the line — the base game's state does show through, and is still named ===");
    const ovl = W.mod("Overlays", { "map/definition.csv": lib.DEF(SEA_3), ...ownStates });
    {
      const v = await S.validate(ovl);
      rec(`Map Errors names state ${BASE_STATE} for ${RULE}: the mod retyped province 3, and the game's state lists it`, lib.idsOf(v, RULE).includes(BASE_STATE), lib.idsOf(v, RULE));
      const r = fix(ovl);
      rec(`⭐⭐ the fixer names state ${BASE_STATE} as not the mod's, supplied by the base game`,
        (r.notYours || []).join() === String(BASE_STATE) && r.notYoursProvinces === 1 && (r.notYoursRoots || []).join() === "the base game", r);
      const fr = await S.autoFix(ovl);
      const slv = (fr.body && fr.body.fixes && fr.body.fixes.seaLeftovers) || {};
      rec(`⭐⭐ …and so does the click's answer, judged after the id steps`, (slv.notYours || []).join() === String(BASE_STATE) && (slv.notYoursRoots || []).join() === "the base game", slv);
      const line = P.autoFixSummary(fr.body);
      rec(`…and the 🔧 line names state ${BASE_STATE} and the base game`, /the base game supplies it/.test(clauseOf(line)) && new RegExp(`e\\.g\\. state ${BASE_STATE}\\)`).test(clauseOf(line)), clauseOf(line) || line.slice(0, 600));
    }

    console.log("\n=== 3. a state the click renumbers is named by the id it holds when the click ends ===");
    // A world of its own map: provinces 1 and 2 land, 3 sea. State 1 = { 1 2 }; state 2 is EMPTY, with content, and AAA's capital —
    // the first empty-state sweep spares a capital, fixForeignCapitals moves the capital to state 1, the final sweep deletes state 2,
    // and the second closeStateIdGaps slides the top state, 3, into its id. State 3 lists only the sea province, so taking the sea
    // out would empty it: the sea cleanup leaves it alone (wouldEmpty) and says so — by id.
    const COLS = { 1: [10, 10, 10], 2: [20, 20, 20], 3: [30, 30, 30] };
    const at = (x) => (x <= 1 ? 1 : x <= 3 ? 2 : 3);
    const ren = W.mod("Renumbers", {
      "descriptor.mod": descriptor("Renumbers", ["map", "history/states"]),
      "map/provinces.bmp": lib.bmp24(6, 2, (x) => COLS[at(x)]),
      "map/definition.csv": ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1", "2;20;20;20;land;true;plains;1", "3;30;30;30;sea;false;ocean;0"].join("\r\n") + "\r\n",
      "map/strategicregions/1-Sea.txt": lib.region(1, "3"),
      "map/strategicregions/2-Land.txt": lib.region(2, "1 2"),
      "history/states/1-Main.txt": "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t\tadd_core_of = AAA\n\t}\n}\n",
      "history/states/2-Cap.txt": "state = {\n\tid = 2\n\tname = \"STATE_2\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = { arms_factory = 3 }\n\t}\n}\n",
      "history/states/3-Water.txt": "state = {\n\tid = 3\n\tname = \"STATE_3\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n",
      "history/countries/AAA.txt": "capital = 2\n",
    });
    {
      const before = await S.validate(ren);
      rec("setup: Map Errors names the all-water state 3", lib.idsOf(before, RULE).includes(3) || lib.idsOf(before, "state_only_water").includes(3) || JSON.stringify(before.problems || []).includes("3-Water"), lib.rulesIn(before));
      const fr = await S.autoFix(ren);
      rec("one Auto-fix click, as the page sends it, answers ok", fr.status === 200 && fr.body && fr.body.ok, { status: fr.status, error: fr.body && fr.body.error });
      const fixes = (fr.body && fr.body.fixes) || {};
      const disk = statesOnDisk(ren);
      const holder = [...disk].filter(([, ps]) => ps.includes(3)).map(([id]) => id);
      rec("THE CONTROL: the click renumbered a state (the fixture reaches the id step it is about)",
        ((fixes.stateGaps && fixes.stateGaps.renumbered) || []).length > 0 && !disk.has(3), { renumbered: fixes.stateGaps && fixes.stateGaps.renumbered, ids: [...disk.keys()] });
      rec("…and exactly one state still lists the sea province once the click ends", holder.length === 1, [...disk]);
      const slv = fixes.seaLeftovers || {};
      rec(`⭐⭐⭐ seaLeftovers names that state by the id it holds now (${holder[0]}), not by the id it held when the scan first looked`,
        JSON.stringify(slv.wouldEmpty || []) === JSON.stringify(holder), { wouldEmpty: slv.wouldEmpty, onDisk: holder });
      const named = [...(slv.wouldEmpty || []), ...(slv.notYours || [])];
      rec("⭐⭐ every state either refusal names is a state the map has after the click", named.every((id) => disk.has(id)), { named, ids: [...disk.keys()] });
      const line = P.autoFixSummary(fr.body);
      rec(`⭐⭐ …and the 🔧 line says "e.g. state ${holder[0]}"`, new RegExp(`still lists? sea provinces[^)]*e\\.g\\. state ${holder[0]}\\)`).test(line), line.slice(0, 700));
      rec("…and no settle failure was said for it", !(slv.settleError), slv.settleError);
    }

    console.log("\n=== 4. the judgement writes nothing, where the repair would ===");
    // The mod's own state 2 = { 2 5 } with 5 retyped to sea: the repair takes 5 out (2 stays). The judgement must leave every byte.
    const cln = W.mod("Cleans", { "map/definition.csv": lib.DEF({ 5: "5;0;200;200;sea;false;ocean;0" }), "history/states/2-B.txt": lib.st(2, "2 5") });
    {
      const t0 = lib.tree(cln);
      const j = fix(cln, { judgeOnly: true });
      rec("⭐⭐⭐ judgeOnly writes nothing", lib.written(t0, lib.tree(cln)).length === 0, lib.written(t0, lib.tree(cln)));
      rec("…and answers with the refusals alone", j && j.judged === true && Array.isArray(j.wouldEmpty) && Array.isArray(j.notYours) && j.statesEdited === undefined, j);
      const r = fix(cln);
      rec("THE CONTROL: the repair itself does write that state", !!r && r.statesEdited === 1 && lib.written(t0, lib.tree(cln)).length > 0, { r, written: lib.written(t0, lib.tree(cln)) });
    }

    console.log("\n=== 5. derived from the source, comments masked ===");
    const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
    const CODE = maskJsComments(SRC), LIT = maskJsLiterals(SRC);
    const bodyOf = (name) => { const i = LIT.indexOf(`function ${name}(`); const b = i < 0 ? null : jsBodyAt(LIT, i); return b ? { at: b[0], text: CODE.slice(b[0], b[1] + 1) } : null; };
    const sea = bodyOf("fixSeaProvinceLeftovers");
    rec("fixSeaProvinceLeftovers was found", !!sea && sea.text.length > 2000, sea && sea.text.length);
    rec(`⭐⭐⭐ its history/states scan asks layersBelow, which honours the mod's own replace_path`,
      !!sea && /layersBelow\(\s*modRoot\s*,\s*gameRoot\s*,\s*dependencyRoots\s*,\s*"history\/states"\s*\)/.test(sea.text), null);
    rec("⭐⭐ …and asks baseRootsFor nothing", !!sea && !/\bbaseRootsFor\(/.test(sea.text), sea && (sea.text.match(/\bbaseRootsFor\([^)]*\)/g) || []));
    const af = bodyOf("autoFixMap");
    rec("autoFixMap was found", !!af && af.text.length > 20000, af && af.text.length);
    if (af) {
      const t = af.text;
      const judgeAt = [...t.matchAll(/fixSeaProvinceLeftovers\(\s*\{[^}]*\bjudgeOnly\s*:\s*true/g)].map((m) => m.index);
      rec("⭐⭐ autoFixMap asks for the judgement exactly once", judgeAt.length === 1, judgeAt.length);
      const lastGap = t.lastIndexOf("closeStateIdGaps("), floorAt = t.lastIndexOf("fixStateIdFloor(");
      rec("⭐⭐⭐ …after the last call that changes which state ids exist (closeStateIdGaps, fixStateIdFloor) — \"after X\" is not \"only after X\"",
        judgeAt.length === 1 && lastGap >= 0 && floorAt >= 0 && judgeAt[0] > lastGap && judgeAt[0] > floorAt, { judgeAt, lastGap, floorAt });
      const firstAt = t.search(/fixes\.seaLeftovers\s*=\s*fixSeaProvinceLeftovers\(/);
      rec("…and the repair itself still runs where it did, before the settle passes", firstAt >= 0 && firstAt < lastGap, { firstAt, lastGap });
    }
    const jb = bodyOf("judgeStateBlock");
    rec("judgeStateBlock was found", !!jb, null);
    rec("⭐⭐ …and holds no write of any kind", !!jb && !/\b(safeModWrite|writeFileSync|appendFileSync|renameSync|rmSync|unlinkSync|mkdirSync|copyFileSync|cpSync|editStateBlock)\(/.test(jb.text), jb && jb.text);
  } catch (e) {
    rec("the run finished without throwing", false, e && (e.stack || e.message || String(e)));
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== the sea cleanup names only states that load after the click: ${checks} checks, ${fails.length} failed ===`);
  for (const f of fails) console.log("   FAILED: " + f);
  process.exit(fails.length ? 1 : 0);
})();
