// ⛔ #a-slot-raise-copies-no-state-file-in (review of tool campaign B2-17).
//
// B2-17 gave state_buildings_exceed_slots a repair: Auto-fix moves a state over its building slots to the smallest category the mod loads
// that holds them (fixStatesOverTheirBuildingSlots, through writeStateFields). The rule counts an inherited state as the mod's own when the
// state categories the MOD loads give its category fewer slots than the layer below's — and writeStateFields copies the whole base file
// into the mod to change that one line. Measured on the review's probe: an add-on shipping its own state categories with town at 2 slots
// got every base town state with 3 or 4 factories copied into it and raised to city — files frozen at this build of the layer below,
// undoing the add-on's own slot table for states it never touched.
//   1. an inherited state over its slots for that reason: the row marks it `inherited`, offers no raise and declines Auto-fix, and says why;
//   2. the repair raises nothing and copies no state file into the mod;
//   3. a state whose file the mod ships (beside an inherited one) is still raised, and the row counts it apart;
//   4. one autoFixMap adds no base state file to the mod's history/states;
//   5. source (comments masked): fixStatesOverTheirBuildingSlots asks whether the file is the mod's before it picks a category.
// Binds no port. Run: node test-a-slot-raise-copies-no-state-file-in.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-slot-raise-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const { maskJsComments, jsBodyAt } = require("./testlib-strip-comments.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const cats = (town) => `state_categories = {\n\ttown = { local_building_slots = ${town} }\n\tcity = { local_building_slots = 6 }\n\tmegalopolis = { local_building_slots = 12 }\n}\n`;
const st = (id, cat, ic) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\tstate_category = ${cat}\n\tprovinces = { ${id} }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tindustrial_complex = ${ic}\n\t\t}\n\t}\n}\n`;
function layers(label) {
  const base = path.join(ROOT, label, "base"), mod = path.join(ROOT, label, "mod");
  mk(path.join(base, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1", "2;20;20;20;land;false;plains;1", "3;30;30;30;land;false;plains;1"].join("\n") + "\n");
  mk(path.join(base, "common", "state_category", "00_state_categories.txt"), cats(4));
  mk(path.join(base, "history", "states", "1-S1.txt"), st(1, "town", 4));
  mk(path.join(base, "history", "states", "2-S2.txt"), st(2, "town", 3));
  mk(path.join(base, "history", "states", "3-S3.txt"), st(3, "town", 1));
  mk(path.join(mod, "descriptor.mod"), 'name="SR"\n');
  mk(path.join(mod, "common", "state_category", "00_state_categories.txt"), cats(2));   // the add-on's own slot table: town 2
  return { base, mod, roots: { modRoot: mod, gameRoot: base } };
}
const modStates = (mod) => { try { return fs.readdirSync(path.join(mod, "history", "states")).sort(); } catch (_) { return []; } };
const rowOf = (roots) => md.validateMapModel(md.buildMapModel(roots)).find((p) => p.rule === "state_buildings_exceed_slots");

try {
  console.log("=== 1-2. inherited states over the add-on's own, smaller slot table ===");
  {
    const { mod, roots } = layers("inherited");
    const row = rowOf(roots);
    ok("the rule reports both inherited states (4 and 3 factories in town's 2)", row && row.total === 2, row);
    ok("…marks them inherited and offers no raise for either", row.items.every((i) => i.inherited === true && !i.raiseTo), row.items);
    ok("…declines Auto-fix (autoFix: false) and says it leaves them rather than copy their files in",
      row.autoFix === false && /come from the base game's or a dependency's state files/.test(row.message) && /Auto-fix leaves them alone rather than copy those files into your mod/.test(row.message), row.message);
    const r = md.fixStatesOverTheirBuildingSlots(roots);
    ok("2. the repair raises nothing", r && !(r.raised || []).length && !(r.left || []).length, r);
    ok("…and copies no state file into the add-on", modStates(mod).length === 0, modStates(mod));
  }

  console.log("=== 3. beside them, a state whose file the add-on ships is still raised ===");
  {
    const { mod, roots } = layers("mixed");
    mk(path.join(mod, "history", "states", "1-S1.txt"), st(1, "town", 4));   // the add-on's own copy of state 1
    const row = rowOf(roots);
    ok("the row counts the add-on's own state apart from the inherited one",
      row && row.total === 2 && row.items.some((i) => i.stateId === 1 && i.raiseTo === "city" && !i.inherited) && row.items.some((i) => i.stateId === 2 && i.inherited && !i.raiseTo)
      && /Auto-fix moves 1 of them, whose state files are your mod's/.test(row.message) && /1 of them come from the base game's or a dependency's state files/.test(row.message) && row.autoFix !== false, row);
    const r = md.fixStatesOverTheirBuildingSlots(roots);
    ok("the add-on's own state 1 is raised to city", (r.raised || []).length === 1 && r.raised[0].stateId === 1 && r.raised[0].to === "city", r);
    ok("…and state 2's base file is not copied in", JSON.stringify(modStates(mod)) === JSON.stringify(["1-S1.txt"]), modStates(mod));
  }

  console.log("=== 4. one autoFixMap adds no base state file to the add-on ===");
  {
    const { mod, roots } = layers("autofix");
    const before = modStates(mod);
    const fr = md.autoFixMap(roots);
    ok("autoFixMap answered", fr && typeof fr === "object", fr && fr.error);
    const so = (fr.fixes || {}).slotOverflow || {};
    ok("slotOverflow raised nothing", !(so.raised || []).length, so);
    ok("…and history/states gained no base state file", JSON.stringify(modStates(mod)) === JSON.stringify(before), modStates(mod));
  }

  console.log("=== 5. source (comments masked) ===");
  {
    const masked = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const opening = "function fixStatesOverTheirBuildingSlots(";
    const at = masked.indexOf(opening);
    if (at < 0 || masked.indexOf(opening, at + 1) !== -1) throw new Error("map-data.js: not found exactly once: " + opening);
    const span = jsBodyAt(masked, at);
    const body = masked.slice(span[0], span[1] + 1);
    const own = body.indexOf("problemIsTheModsOwn(model, st)"), pick = body.indexOf("categoryThatHoldsTheBuildings(model, st)");
    ok("the repair asks whether the state file is the mod's before it picks a category", own > 0 && pick > 0 && own < pick, { own, pick });
  }
  console.log(`\ntest-a-slot-raise-copies-no-state-file-in: ${pass} checks passed`);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* this test's own temp fixtures and app-data */ }
}
