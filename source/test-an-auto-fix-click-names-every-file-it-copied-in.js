// ⛔ #an-add-on-is-told-what-auto-fix-froze — ONE 🔧 AUTO-FIX CLICK NAMES EVERY FILE IT COPIED INTO THE MOD, FROM THE STEP THAT COPIED IT.
//
// B6-16 (tool campaign, CONFIRMED), the server half. On an add-on over Millennium Dawn with one state emptied by hand, one click added
// MD's 63-Provence.txt and its 4,001,600-byte map/buildings.txt to the add-on, and the line named neither: from then on the add-on pins
// both as MD has them today, and an MD update no longer reaches them (the overlay rule). The page's clause (materialisedNote, guarded by
// test-an-add-on-is-told-what-auto-fix-froze.js) words what a step answers in `materialised`, and these steps answered nothing:
//   • fixStatelessLand now names the state file editStateBlock copied in to home the land in (`created`), and map/buildings.txt when
//     the rows it gives the homed land are the first this mod has of it;
//   • fixCoastalNoPort names buildings.txt (and definition.csv) when it read them from a layer below;
//   • autoFixMap's later merges of those two steps — the second stateless-land pass and the port settle loop — keep the lists of both
//     passes (materialisedOf). The settle loop is the one that copied MD's buildings.txt in: the homed province got its state during
//     the click, so its port came in the loop, whose merge rebuilt the answer from its counts.
//
// Run, not read: map-data.js's own autoFixMap on testlib-two-layer-map's small game, with a mod over it whose own copy of the coastal
// state 3 lists no provinces — the MD shape. The land goes to state 2 (the game's 2-B.txt copied in to hold it), and its port, keyed to
// state 3, is re-keyed to 2 in the settle loop (its own row, never a second: #a-coast-keeps-the-port-the-click-re-keys): the first write
// of buildings.txt. Which files the click added is read off the
// disk, never typed in, and each must be named in the line the page builds (testlib-map-page's autoFixSummary runs the page's own code).
// Section 0 asks the source the same question for every merge, so a merge added later cannot drop the list unseen.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");

// A bare run is handed the sandbox its runner would give it before any folder exists (#a-bare-test-run-writes-into-the-real-app-data),
// and the fixtures go inside it, so they go when it does.
require("./safe-write.js");
const SBX = fs.mkdtempSync(path.join(process.env.NOVA_HOME_DIR || os.tmpdir(), "click-names-what-it-copied-"));
const L = require("./testlib-two-layer-map.js");
const T = require("./testlib-map-page.js");
const md = require("./map-data.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
function rec(name, pass, detail) {
  checks++;
  console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
  if (!pass) { fails.push(name); if (detail !== undefined) console.log("   ", typeof detail === "string" ? detail.slice(0, 1500) : JSON.stringify(detail).slice(0, 1500)); }
}

// ── 0. every merge of the two steps in autoFixMap keeps what its passes copied in ──
{
  const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const LIT = maskJsLiterals(SRC), CODE = maskJsComments(SRC);
  const at = LIT.indexOf("function autoFixMap(");
  const body = at < 0 ? null : jsBodyAt(LIT, at);
  rec("THE CONTROL: autoFixMap's body is found", !!body && body[1] - body[0] > 20000, body);
  if (body) {
    const text = CODE.slice(body[0], body[1]);
    for (const step of ["statelessLand", "coastalNoPort"]) {
      const re = new RegExp(`fixes\\.${step}\\s*=\\s*`, "g");
      const merges = [];
      let m;
      while ((m = re.exec(text))) {
        const rest = text.slice(m.index + m[0].length);
        if (/^(fix\w+\(|\{\s*error\s*:)/.test(rest)) continue;          // the pass's own answer, or its failure
        const end = rest.search(/;[ \t]*\r?\n/);
        merges.push(rest.slice(0, end < 0 ? 400 : end));
      }
      rec(`THE CONTROL: autoFixMap merges ${step}'s passes somewhere`, merges.length >= 1, merges.length);
      const dropped = merges.filter((s) => !/materialisedOf\(/.test(s));
      rec(`⭐⭐ every merge of ${step} keeps both passes' materialised lists (materialisedOf)`, merges.length >= 1 && dropped.length === 0, dropped.map((s) => s.slice(0, 160)));
    }
  }
}

// ── the game, and one Auto-fix click on a mod over it ──
const land3 = ["3;supply_node;200.00;9.50;135.00;0.00;0", "3;bunker;200.00;9.50;135.00;0.00;0", "3;special_project_facility_spawn;200.00;9.50;135.00;0.00;0"];
function game(rows) {
  return L.write(path.join(SBX, "game-" + Math.random().toString(36).slice(2, 8)), {
    "map/provinces.bmp": L.bmp24(256, 256, (x, y) => L.COL[L.provAt(x, y)]),
    "map/definition.csv": L.DEF(),
    "map/buildings.txt": rows.join("\n"),
    "map/strategicregions/1-Sea.txt": L.region(1, "1"),
    "map/strategicregions/2-Land.txt": L.region(2, "2 3 4 5"),
    ...L.GAME_STATES,
    "common/state_category/00_state_category.txt": "state_categories = {\n\trural = {\n\t\tlocal_building_slots = 2\n\t}\n}\n",
  });
}
function click(GAME, own) {
  const MOD = L.write(path.join(SBX, "mod-" + Math.random().toString(36).slice(2, 8)), Object.assign({ "descriptor.mod": 'name="Copied in"\n', "history/states/3-C.txt": L.st(3, "") }, own || {}));
  const before = L.tree(MOD);
  const r = md.autoFixMap({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
  const after = L.tree(MOD);
  const added = Object.keys(after).filter((k) => !(k in before)).sort();
  let line = "";
  try { line = r && r.ok ? T.autoFixSummary(r) : String(r && r.error); } catch (e) { line = "THREW " + e.message; }
  return { r, f: (r && r.fixes) || {}, added, line };
}
const named = (line, rel) => line.includes(rel);

// ── 1. the MD shape: the homed land's rows already stand on it, so the settle loop's port is the first write of buildings.txt ──
{
  const c = click(game(L.BUILD.concat(land3)));
  rec("THE CONTROL: the click ran, homed province 3 into state 2, and gave it its port in the settle loop (it had no state before the click)",
    c.r && c.r.ok === true && (c.f.statelessLand || {}).fixed === 1 && ((c.f.coastalNoPort || {}).provinces || []).includes(3), { st: c.f.statelessLand, cnp: c.f.coastalNoPort });
  rec("THE CONTROL: it copied the game's 2-B.txt and buildings.txt into the mod (read off the disk)",
    c.added.join() === "history/states/2-B.txt,map/buildings.txt", c.added);
  rec("⭐⭐⭐ each file the click copied in is named in the line the page builds", c.added.length > 0 && c.added.every((rel) => named(c.line, rel)), { added: c.added, line: c.line });
  rec("⭐⭐ the port step names buildings.txt (the settle loop's write, kept through its merge)",
    JSON.stringify((c.f.coastalNoPort || {}).materialised) === '["map/buildings.txt"]', c.f.coastalNoPort);
  rec("⭐⭐ the stateless-land step names the state file it copied in", JSON.stringify((c.f.statelessLand || {}).materialised) === '["history/states/2-B.txt"]', c.f.statelessLand);
  rec("…and each beside its own step in the line", /a port \([^)]*\) — to do it, map\/buildings\.txt is now YOUR mod's/.test(c.line)
    && /to a neighbouring state — to do it, history\/states\/2-B\.txt is now YOUR mod's/.test(c.line), c.line);
}

// ── 2. the homed land has no rows below: the stateless-land step gives them, the first write of buildings.txt ──
{
  const c = click(game(L.BUILD));
  rec("THE CONTROL: the stateless-land step gave the homed land its rows", (((c.f.statelessLand || {}).buildingRows || {}).placed || []).length > 0, c.f.statelessLand);
  rec("⭐⭐⭐ each file the click copied in is named in the line", c.added.length === 2 && c.added.every((rel) => named(c.line, rel)), { added: c.added, line: c.line });
  rec("⭐⭐ the stateless-land step names both, and the port step (writing a file already the mod's) names none",
    JSON.stringify((c.f.statelessLand || {}).materialised) === '["history/states/2-B.txt","map/buildings.txt"]' && !(c.f.coastalNoPort || {}).materialised, { st: c.f.statelessLand, cnp: c.f.coastalNoPort });
}

// ── 3. THE CONTROL: a mod that already owns both files: nothing copied in, and nothing said to be ──
{
  const GAME = game(L.BUILD.concat(land3));
  const own = { "history/states/2-B.txt": fs.readFileSync(path.join(GAME, "history", "states", "2-B.txt"), "utf8"), "map/buildings.txt": fs.readFileSync(path.join(GAME, "map", "buildings.txt"), "utf8") };
  const c = click(GAME, own);
  rec("THE CONTROL: the same click on a mod that owns both files adds no file and still homes the land", c.added.length === 0 && (c.f.statelessLand || {}).fixed === 1, { added: c.added, st: c.f.statelessLand });
  rec("THE CONTROL: …and its line says no file is now the mod's", !/is now YOUR mod's|are now YOUR mod's/.test(c.line) && !(c.f.statelessLand || {}).materialised && !(c.f.coastalNoPort || {}).materialised, c.line);
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
console.log(`(fixtures in the run's sandbox: ${SBX})`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
console.log("All green");
