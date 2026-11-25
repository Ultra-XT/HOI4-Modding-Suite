// ⛔ #a-base-state-keeps-a-land-province — 🗑 DELETE AND 🔗 MERGE'S ADVICE FOR A STATE THE MOD DOES NOT OWN SAYS IT HAS TO KEEP A LAND PROVINCE
// WHEN THE STATE ALSO LISTS A LAKE (review of group c's Q4 fix, L-keep-one-province).
//
// Both refusals (the page's Delete button and doMergeState, and mergeState when a Save reaches it) said "It has to keep at least one of its
// provinces: move the others with ↔ Move province". For a state that also lists a lake that is a step the page then refuses: keeping only
// the lake leaves the state with no land, and ↔ Move refuses to take the last LAND out of such a state (baseStatesLeftWithoutLand, Q4).
// The advice now says "land provinces" for such a state, and stays as it was for a state of land only.
//
// RUN, not grepped: the page's own Delete click and doMergeState (testlib-state-panel-page.js) on a small world whose province 13 is a
// lake and whose states are marked as the base game's, and map-data.js's mergeState on a two-layer world (a base game that holds the
// states, a mod that does not replace history/states). Binds no port.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-base-keeps-land-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const L = require("./testlib-state-panel-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
};
const LAND = "It has to keep at least one of its land provinces: move the others with ↔ Move province, or leave it in place.";
const ANY = "It has to keep at least one of its provinces: move the others with ↔ Move province, or leave it in place.";
let seq = 0;
/** testlib's world (state 5 = [9, 13], 4 = [8, 12] …) with `lakes` retyped to lakes in definition.csv. */
function makeRoots(lakes) {
  const roots = L.makeWorld(ROOT, `w${++seq}`);
  const def = path.join(roots.modRoot, "map", "definition.csv");
  fs.writeFileSync(def, fs.readFileSync(def, "utf8").split("\n").map((l) => {
    const c = l.split(";");
    return lakes.includes(Number(c[0])) ? [c[0], c[1], c[2], c[3], "lake", "false", "lakes", c[7]].join(";") : l;
  }).join("\n"));
  return roots;
}
function page(lakes, base) {
  const roots = makeRoots(lakes);
  const pg = L.openPage(md, roots, md.buildMapModel({ ...roots, cacheStableLayers: false }));
  for (const id of base) pg.ctx.stateById.get(id).inBaseLayer = true;
  return pg;
}

console.log("\n-- THE CONTROL: the world reads province 13 as a lake, in state 5 with land 9 --");
{
  const pg = page([13], [5]);
  ok(pg.ctx.provinceType.get(13) === "lake" && JSON.stringify(pg.state(5).provinces.slice().sort((a, b) => a - b)) === "[9,13]", "state 5 lists land 9 and lake 13", pg.state(5).provinces);
}

console.log("\n-- 1. 🗑 DELETE: A BASE STATE WITH A LAKE HAS TO KEEP A LAND PROVINCE --");
{
  const pg = page([13], [5]);
  pg.deleteState(5, 9);
  ok(/^🚫 State 5 comes from the base game or a dependency/.test(pg.last()) && pg.queue().length === 0, "THE CONTROL: the Delete is refused, nothing queued", { line: pg.last(), q: pg.urls() });
  ok(pg.last().includes(LAND), "⭐⭐ …and the advice says it has to keep a LAND province", pg.last());
  const dry = page([], [5]);
  dry.deleteState(5, 9);
  ok(dry.last().includes(ANY) && !dry.last().includes(LAND), "⭐ a base state of land only keeps the words it had", dry.last());
}

console.log("\n-- 2. 🔗 MERGE: THE SAME --");
{
  const pg = page([13], [5]);
  const line = pg.merge(5, 4);
  ok(/^🚫 STATE_5 comes from the base game or a dependency/.test(line) && pg.queue().length === 0, "THE CONTROL: the Merge is refused, nothing queued", { line, q: pg.urls() });
  ok(line.includes(LAND), "⭐⭐ …and the advice says it has to keep a LAND province", line);
  const dry = page([], [5]);
  const dryLine = dry.merge(5, 4);
  ok(dryLine.includes(ANY) && !dryLine.includes(LAND), "⭐ a base state of land only keeps the words it had", dryLine);
}

console.log("\n-- 3. mergeState, WHEN A SAVE REACHES IT: THE SAME WORDS --");
{
  // a base game that holds the map and the states, and a mod over it that replaces nothing
  const server = (lakes) => {
    const game = makeRoots(lakes).modRoot;
    fs.renameSync(path.join(game, "descriptor.mod"), path.join(game, "descriptor.mod.off"));   // (the test's own temp world: the game root is not a mod)
    const mod = path.join(ROOT, `mod${++seq}`);
    L.write(mod, "descriptor.mod", `name="mod${seq}"\n`);
    return md.mergeState({ modRoot: mod, gameRoot: game, dependencyRoots: [], sourceStateId: 5, targetStateId: 4 });
  };
  const r = server([13]);
  ok(r && r.changed === false && /comes from the base game or a dependency/.test(r.error || ""), "THE CONTROL: mergeState refuses the base state", r);
  ok(String((r && r.error) || "").includes(LAND), "⭐⭐ …and says it has to keep a LAND province", r && r.error);
  const d = server([]);
  ok(String((d && d.error) || "").includes(ANY) && !String((d && d.error) || "").includes(LAND), "⭐ a base state of land only keeps the words it had", d && d.error);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
