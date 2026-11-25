// ⛔ #inherited-problem-not-yours, ON THE DEPENDENCY AXIS — where "the base game" is another MOD.
//
// Every instance of this class fixed so far was found on a vanilla-based mod, so the comparisons all reached
// for the base game. An add-on built on Millennium Dawn has a different shape: MD declares
// replace_path="history/states", so vanilla's 1,081 states are not loaded at all and MD's 1,221 are the base
// layer — and MD does NOT replace "map", so its own definition.csv is what the add-on inherits.
//
// Measured against the real thing. A brand-new MD add-on — a focus tree, a descriptor and a loc file, NO map
// content whatsoever — was told it had two crash-level errors, both of them MD's:
//
//   • province_reserved_black      MD paints province 16257 black; vanilla paints none black at all.
//   • capital_state_owned_by_other MD points NPM's capital at state 706, which ABK owns.
//
// Millennium Dawn itself reports 296 problems and keeps every one of them. The add-on now reports 0.
//
// ⭐ TWO THINGS MADE IT WORK, and both are about not assuming vanilla is underneath:
//   1. baseDefinitionIndex resolves the EFFECTIVE base — the highest base layer that ships definition.csv —
//      so on this axis a row is compared against MD's, not the base game's.
//   2. capital_state_owned_by_other spans two files (the country file that points the capital, the state
//      file that says who owns it), so the model now records WHOSE file set each capital, the same signal
//      rootPath/inBaseLayer already give a state.
//
// ⚠️ And the comparison is per FIELD, not per row: a mod that only RE-COLOURED a province (Auto-fix does
// exactly that for duplicate colours) has not chosen its continent, so the sea/continent rule must not start
// reporting it. The reserved-black rule asks about r/g/b; the sea rule asks about type/continent.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];

// vanilla: 2 land provinces, clean. DEP (a Millennium-Dawn-shaped mod): replaces history/states, ships its
// own definition.csv with a BLACK province, and points a capital at a state someone else owns.
const ROW0 = "0;0;0;0;land;false;unknown;0";
const csv = (rows) => [ROW0].concat(rows).join("\r\n") + "\r\n";
const VAN_DEF = csv(["1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;land;false;plains;1"]);
// Province 2 is BLACK — the reserved colour. Vanilla paints none black at all, so comparing against the base
// game (rather than the effective base layer) calls this the add-on's doing.
const DEP_DEF = csv(["1;200;0;0;land;false;plains;1", "2;0;0;0;land;false;plains;1", "3;0;0;200;land;false;plains;1"]);
const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = { owner = ${owner} }\n}\n`;

function makeGame() {
  const g = fs.mkdtempSync(path.join(os.tmpdir(), "nova-axgame-")); tmps.push(g);
  mk(path.join(g, "map", "definition.csv"), VAN_DEF);
  for (const i of [1, 2, 3]) mk(path.join(g, "history", "states", i + ".txt"), st(i, [i], "AAA"));
  mk(path.join(g, "history", "countries", "AAA - A.txt"), "capital = 1\n");
  return g;
}
function makeDep() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-axdep-")); tmps.push(d);
  mk(path.join(d, "descriptor.mod"), 'name="Dep"\nreplace_path="history/states"\nreplace_path="history/countries"\n');
  mk(path.join(d, "map", "definition.csv"), DEP_DEF);                       // its own map, with the black one
  mk(path.join(d, "history", "states", "1.txt"), st(1, [1], "BBB"));        // BBB owns state 1…
  mk(path.join(d, "history", "states", "2.txt"), st(2, [2], "BBB"));
  mk(path.join(d, "history", "states", "3.txt"), st(3, [3], "AAA"));        // AAA still owns land, so it EXISTS
  mk(path.join(d, "history", "countries", "AAA - A.txt"), "capital = 1\n"); // …but its capital is BBB's state
  mk(path.join(d, "history", "countries", "BBB - B.txt"), "capital = 2\n");
  return d;
}
const addon = (tag, files) => {
  const m = fs.mkdtempSync(path.join(os.tmpdir(), "nova-axaddon-" + tag + "-")); tmps.push(m);
  mk(path.join(m, "descriptor.mod"), 'name="' + tag + '"\nsupported_version="1.19.*"\n');
  for (const [rel, body] of Object.entries(files || {})) mk(path.join(m, ...rel.split("/")), body);
  return m;
};
const rules = (modRoot, gameRoot, deps) =>
  md.validateMapModel(md.buildMapModel({ modRoot, gameRoot, dependencyRoots: deps }))
    .map((p) => p.rule);

(() => {
  const game = makeGame(), dep = makeDep();

  console.log("\n=== the dependency really does carry both problems ===");
  {
    const own = rules(dep, game, []);
    ok(own.includes("province_reserved_black"), "the dependency's own black province is reported to IT", own);
    ok(own.includes("capital_state_owned_by_other"), "…and so is its own capital mismatch", own);
  }

  console.log("\n=== ⭐ an add-on that ships NOTHING is blamed for neither ===");
  {
    const a = addon("empty", { "common/characters/c.txt": "characters = {\n}\n" });
    const r = rules(a, game, [dep]);
    ok(!r.includes("province_reserved_black"),
      "the dependency's black province is not the add-on's problem", r);
    ok(!r.includes("capital_state_owned_by_other"),
      "…nor the dependency's capital mismatch", r);
  }

  console.log("\n=== …and the base game is NOT what it is compared against ===");
  {
    // The decisive one. Province 2 is black in the DEPENDENCY and normal in vanilla. Comparing against the
    // base game would call it a change the add-on made.
    const a = addon("effbase", { "common/characters/c.txt": "characters = {\n}\n" });
    const model = md.buildMapModel({ modRoot: a, gameRoot: game, dependencyRoots: [dep] });
    const p2 = (model.provinces || []).find((p) => p.id === 2);
    ok(!!p2 && p2.r === 0 && p2.g === 0 && p2.b === 0, "the effective map really is the dependency's", p2);
    ok(!rules(a, game, [dep]).includes("province_reserved_black"),
      "⭐ …and it is still not reported, so the comparison used the DEPENDENCY, not vanilla");
  }

  console.log("\n=== an add-on that DOES ship the data still owns it ===");
  {
    const a = addon("ownsmap", { "map/definition.csv": DEP_DEF });
    // Same bytes as the dependency's: shipping the file is not authoring the row. One Terrain click in the
    // map editor materialises the whole file, so "does the mod ship it" cannot be the question.
    ok(!rules(a, game, [dep]).includes("province_reserved_black"),
      "shipping a byte-identical copy is still not authoring it");
    const b = addon("paintsblack", {
      "map/definition.csv": csv(["1;0;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1", "3;0;0;200;land;false;plains;1"]),
    });
    ok(rules(b, game, [dep]).includes("province_reserved_black"),
      "…but painting a DIFFERENT province black is", rules(b, game, [dep]));
  }
  // ⚠️ THE CAPITAL RULE, STATED HONESTLY. These two cases used to ship BYTE-IDENTICAL copies of the
  // dependency's country and state files and assert the mismatch was reported, on the "the mod ships a file
  // involved, so it could have caused this" standard. It hadn't caused anything — and mirroring all 2,129 of
  // Millennium Dawn's map and history files into an add-on showed what that standard costs: 295 of MD's 296
  // problems correctly silent, and its capital mismatch still blamed on a mod that had copied it.
  //
  // So the rule now subtracts what the layer below already had, like the buildings and naval rules, and
  // these fixtures do what their names claim: they BREAK something that was fine in the dependency. In the
  // dependency BBB owns states 1 and 2 and its capital is 2 — clean. Each add-on below breaks that, one
  // through the country file and one through the state file.
  {
    const a = addon("ownscapital", { "history/countries/BBB - B.txt": "capital = 3\n" });
    ok(rules(a, game, [dep]).includes("capital_state_owned_by_other"),
      "an add-on that RE-POINTS a capital through the country file is told", rules(a, game, [dep]));
  }
  {
    const a = addon("ownsstate", { "history/states/2.txt": st(2, [2], "AAA") });
    ok(rules(a, game, [dep]).includes("capital_state_owned_by_other"),
      "…and so is one that takes the capital state away through the state file", rules(a, game, [dep]));
  }
  {
    const a = addon("copiescapital", {
      "history/countries/AAA - A.txt": "capital = 1\n",
      "history/states/1.txt": st(1, [1], "BBB"),
    });
    ok(!rules(a, game, [dep]).includes("capital_state_owned_by_other"),
      "⚠️ …while an add-on that COPIES both files of the dependency's own mismatch is not",
      rules(a, game, [dep]));
  }

  console.log("\n=== ⚠️ a RE-COLOUR does not make the continent the mod's ===");
  {
    // provinceRowIsTheModsOwn is per-field for this reason: Auto-fix recolours duplicate provinces, and that
    // must not turn every sea province's inherited continent into the modder's problem.
    const g2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-axgame2-")); tmps.push(g2);
    mk(path.join(g2, "map", "definition.csv"), csv(["1;200;0;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;5"]));
    mk(path.join(g2, "history", "states", "1.txt"), st(1, [1], "AAA"));
    const recoloured = addon("recolour", {
      "map/definition.csv": csv(["1;200;0;0;land;false;plains;1", "3;7;7;200;sea;false;ocean;5"]),
    });
    ok(!rules(recoloured, g2, []).includes("sea_province_has_continent"),
      "a province whose COLOUR changed keeps its inherited continent", rules(recoloured, g2, []));
    const retyped = addon("retype", {
      "map/definition.csv": csv(["1;200;0;0;land;false;plains;1", "3;0;0;200;sea;false;ocean;9"]),
    });
    ok(rules(retyped, g2, []).includes("sea_province_has_continent"),
      "…while one whose CONTINENT changed is the mod's", rules(retyped, g2, []));
  }

  console.log("\n=== ⚠️ TWO dependencies deep, in either order ===");
  {
    // Every other fixture here has ONE dependency. A playset can have two, and the layers stack:
    // mod > depB > depA > game. The base has to be resolved through the whole chain, and the caller may
    // hand the roots over in either order.
    const lower = addon("lower", {
      "map/definition.csv": DEP_DEF,   // the black province lives HERE, two layers below the add-on
    });
    const upper = addon("upper", { "common/characters/c.txt": "characters = {\n}\n" }); // ships no map
    const a = addon("twodeep", { "common/characters/c.txt": "characters = {\n}\n" });
    ok(rules(lower, game, []).includes("province_reserved_black"),
      "the lower dependency reports its own black province", rules(lower, game, []));
    ok(!rules(a, game, [lower, upper]).includes("province_reserved_black"),
      "⚠️ an add-on two layers up is not blamed for it", rules(a, game, [lower, upper]));
    ok(!rules(a, game, [upper, lower]).includes("province_reserved_black"),
      "…and not with the dependency roots passed the other way round", rules(a, game, [upper, lower]));
    const own = addon("twodeepown", {
      // Blacks province 3 as WELL — one the lower dependency did not.
      "map/definition.csv": csv(["1;200;0;0;land;false;plains;1", "2;0;0;0;land;false;plains;1", "3;0;0;0;land;false;plains;1"]),
    });
    ok(rules(own, game, [lower, upper]).includes("province_reserved_black"),
      "⚠️ THE CONTROL: blacking one the chain did not is still its own",
      rules(own, game, [lower, upper]));
  }

  console.log("\n=== with no mod selected, everything is still reported ===");
  {
    const r = rules(dep, dep, []);   // editing the dependency directly: it IS yours
    ok(r.includes("province_reserved_black"), "editing a mod directly reports its own black province", r);
  }

  tmps.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} });
  console.log(`\n=== an add-on is not blamed for the mod it sits on: ${pass} checks, ${fails.length} failed ===`);
  fails.forEach((f) => console.log("   FAILED: " + f));
  process.exit(fails.length ? 1 : 0);
})();
