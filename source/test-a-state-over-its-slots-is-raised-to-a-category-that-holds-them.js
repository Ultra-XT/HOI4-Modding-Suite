// ⛔ #a-state-over-its-slots-is-raised-to-a-category-that-holds-them (tool campaign B2-17, and B2-15's tail).
//
// 🔗 Merge sums both states' buildings, and Auto-fix's naval carry adds a landlocked state's dockyards to a coastal one, so either can leave a
// state with more civilian factories, military factories and dockyards than its category's building slots — state_buildings_exceed_slots —
// and nothing cleared it: on a generated world, merging state 115 into 164 left 12 in a city's 6 after two Auto-fix clicks. Auto-fix now
// moves such a state to the smallest category the mod loads that holds them, takes no building away, and says so (Q5).
//   1. fixStatesOverTheirBuildingSlots raises to the smallest category that holds the buildings (ties by name), splicing the one line;
//   2. a state no category holds keeps its category and is answered in `left`;
//   3. the rule's row offers Auto-fix only for what the repair will raise, and names the category;
//   4. one Auto-fix leaves no state_buildings_exceed_slots it could clear, and the page's own summary names the category it gave.
// Run: node test-a-state-over-its-slots-is-raised-to-a-category-that-holds-them.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
const TL = require("./testlib-map-page.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const CATS = "state_categories = {\n\trural = {\n\t\tlocal_building_slots = 2\n\t}\n\ttown = {\n\t\tlocal_building_slots = 4\n\t}\n\tcity = {\n\t\tlocal_building_slots = 6\n\t}\n\tlarge_city = {\n\t\tlocal_building_slots = 8\n\t}\n\tmegalopolis = {\n\t\tlocal_building_slots = 12\n\t}\n}\n";
const state = (id, cat, provs, bld) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\t# the category the modder chose\n\tstate_category = ${cat}\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n${bld}\t\t}\n\t}\n}\n`;
const made = [];
function world(label) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), `nova-over-slots-${label}-`));
  made.push(mod);
  mk(path.join(mod, "descriptor.mod"), 'name="OS"\nreplace_path="history/states"\n');
  mk(path.join(mod, "common", "state_category", "00_cat.txt"), CATS);
  // state 1: 7 in a city's 6 -> large_city (8). state 2: 3 in rural's 2 -> town (4). state 3: 13 in megalopolis' 12: none holds it.
  mk(path.join(mod, "history", "states", "1-S1.txt"), state(1, "city", "1", "\t\t\tindustrial_complex = 4\n\t\t\tarms_factory = 2\n\t\t\tdockyard = 1\n\t\t\tinfrastructure = 3\n"));
  mk(path.join(mod, "history", "states", "2-S2.txt"), state(2, "rural", "2", "\t\t\tarms_factory = 3\n"));
  mk(path.join(mod, "history", "states", "3-S3.txt"), state(3, "megalopolis", "3", "\t\t\tindustrial_complex = 13\n"));
  mk(path.join(mod, "history", "states", "4-S4.txt"), state(4, "town", "4", "\t\t\tindustrial_complex = 2\n"));
  return mod;
}
const read = (mod, f) => fs.readFileSync(path.join(mod, "history", "states", f), "utf8");
try {
  console.log("=== 1-2. the repair ===");
  {
    const mod = world("fix");
    const before = { s1: read(mod, "1-S1.txt"), s4: read(mod, "4-S4.txt") };
    const r = md.fixStatesOverTheirBuildingSlots({ modRoot: mod });
    const by = new Map(r.raised.map((x) => [x.stateId, x]));
    ok("state 1 (7 in a city's 6) goes to large_city, the smallest that holds 7", by.get(1) && by.get(1).from === "city" && by.get(1).to === "large_city" && by.get(1).shared === 7 && by.get(1).slots === 8, r.raised);
    ok("state 2 (3 in rural's 2) goes to town", by.get(2) && by.get(2).to === "town", r.raised);
    ok("state 3 (13: no category holds it) keeps megalopolis and is answered in left", !by.has(3) && r.left.some((l) => l.stateId === 3 && l.shared === 13 && l.slots === 12) && /state_category = megalopolis/.test(read(mod, "3-S3.txt")), r.left);
    ok("state 4 (fits) is not touched", !by.has(4) && read(mod, "4-S4.txt") === before.s4);
    const s1 = read(mod, "1-S1.txt");
    ok("the one line is spliced: the category changes and every building, the comment above it and the rest stay",
      s1 === before.s1.replace("state_category = city", "state_category = large_city"), s1);
    const again = md.fixStatesOverTheirBuildingSlots({ modRoot: mod });
    ok("a second run raises nothing (state 3 is left again)", again.raised.length === 0 && again.left.length === 1, again);
  }

  console.log("=== 3. the row offers Auto-fix only for what it will raise ===");
  {
    const mod = world("row");
    const row = md.validateMapModel(md.buildMapModel({ modRoot: mod })).find((p) => p.rule === "state_buildings_exceed_slots");
    ok("three states are over their slots", row && row.total === 3, row);
    ok("each raisable item carries the category it goes to", row.items.find((i) => i.stateId === 1).raiseTo === "large_city" && !("raiseTo" in row.items.find((i) => i.stateId === 3)), row.items);
    ok("the message says Auto-fix moves 2 of them and the other needs its counts lowered in the state panel", /Auto-fix moves 2 of them/.test(row.message) && /other 1, so lower their counts in the state panel/.test(row.message), row.message);
    fs.writeFileSync(path.join(mod, "history", "states", "1-S1.txt"), state(1, "city", "1", "\t\t\tindustrial_complex = 4\n"));
    fs.writeFileSync(path.join(mod, "history", "states", "2-S2.txt"), state(2, "rural", "2", "\t\t\tarms_factory = 1\n"));
    const only = md.validateMapModel(md.buildMapModel({ modRoot: mod })).find((p) => p.rule === "state_buildings_exceed_slots");
    ok("with only the state no category holds left, the row does not name Auto-fix (so the popup does not offer it)", only && only.total === 1 && !/Auto-fix/.test(only.message) && /lower the counts in the state panel/.test(only.message), only && only.message);
  }

  console.log("=== 4. one Auto-fix, and the page's own summary ===");
  {
    const mod = world("click");
    const fr = md.autoFixMap({ modRoot: mod });
    ok("autoFixMap ok", fr && fr.ok, fr && fr.error);
    const so = (fr.fixes || {}).slotOverflow || {};
    ok("its answer carries the step as fixes.slotOverflow", Array.isArray(so.raised) && so.raised.length === 2 && Array.isArray(so.left) && so.left.length === 1, so);
    const left = md.validateMapModel(md.buildMapModel({ modRoot: mod })).filter((p) => p.rule === "state_buildings_exceed_slots");
    ok("only the state no category holds is still reported", left.length === 1 && left[0].total === 1 && left[0].items[0].stateId === 3, left);
    const line = TL.autoFixSummary(fr);
    ok("the summary names each category it gave", /state 1: city → large_city, 7 in 8 slots/.test(line) && /state 2: rural → town/.test(line) && /taking no building away/.test(line), line);
    ok("…and says what it left, and the step that clears it", /left 1 state\(s\) over their building slots that no state category this mod loads has room for/.test(line) && /lower the counts in the state panel/.test(line), line);
  }
  console.log(`\ntest-a-state-over-its-slots-is-raised-to-a-category-that-holds-them: ${pass} checks passed`);
} finally {
  for (const d of made) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) { /* a temp fixture of this test's own */ } }
}
