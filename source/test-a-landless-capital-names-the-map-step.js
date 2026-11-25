// ⛔ #a-landless-capital-names-the-map-step (review of group a: tool campaign B2-2, with the coordinator's Q3).
//
// capital_state_missing_no_land is one of the warnings Nova leaves on purpose: HOI4 loads a country with no land whose capital state
// is gone, so it neither stops Save nor is repaired. Since B2-2 it is also what Auto-fix leaves when it deletes an empty state that only
// countries with no land named as capital. Q3 binds every such warning to name what clears it, by a Map step where one exists. The row
// said "Point that capital at a state this map has", and its fix hint "Give the country land, or edit the line yourself" — but
// 🏛 Set capital sets the capital of the clicked state's OWNER, so a country with no land cannot be pointed anywhere from the map until
// it is given a state. The row and its hint now name both steps, with the tools spelled as the map page's own buttons spell them (read
// out of public/map.html here, not typed in), and following them clears the row.
// Run: node test-a-landless-capital-names-the-map-step.js
"use strict";
const assert = require("assert");
const fs = require("fs"), path = require("path");
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };

// the two tools as map.html labels them: the icon and the name of #mapModePaint and #mapModeCapital
const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
const tool = (id) => {
  const m = new RegExp(`id="${id}"[^>]*>\\s*<span class="tool-ico">([^<]+)</span>\\s*<span class="tool-name">([^<]+)</span>`).exec(html);
  return m ? `${m[1].trim()} ${m[2].trim()}` : null;
};
const PAINT = tool("mapModePaint"), CAPITAL = tool("mapModeCapital");
ok("map.html has both tools (#mapModePaint, #mapModeCapital)", !!PAINT && !!CAPITAL, { PAINT, CAPITAL });

const S1 = { id: 1, name: "S1", provinces: [10], owner: "JOR" };
const rowOf = (model) => (md.validateMapModel(model) || []).find((p) => p.rule === "capital_state_missing_no_land");

console.log("=== 1. one country with no land, its capital state gone ===");
const row = rowOf({ capitals: { BOS: 9, JOR: 1 }, states: [S1] });
ok("the row is reported, and it is a warning", row && row.severity === "warning", row);
ok("its message names the Paint owner step for BOS", row && row.message.includes(`give BOS a state with ${PAINT}`), row && row.message);
ok("…then the Set capital click on that state", row && row.message.includes(`click that state with ${CAPITAL}`), row && row.message);

console.log("=== 2. several such countries ===");
const many = rowOf({ capitals: { BOS: 9, HER: 10, JOR: 1 }, states: [S1] });
ok("the row names the same two steps for each of them", many && many.total === 2 && many.message.includes(`give each of those countries a state with ${PAINT}`)
  && many.message.includes(`click that state with ${CAPITAL}`), many && many.message);

console.log("=== 3. the fix hint beside the row names them too ===");
const hint = labels.mapRuleFixHint("capital_state_missing_no_land");
ok("the hint names Paint owner and Set capital", hint.includes(PAINT) && hint.includes(CAPITAL), hint);

console.log("=== 4. following the steps clears it ===");
// 🖌 Paint owner gives BOS state 2; 🏛 Set capital on it writes BOS's capital = 2
const after = md.validateMapModel({ capitals: { BOS: 2, JOR: 1 }, states: [S1, { id: 2, name: "S2", provinces: [20], owner: "BOS" }] }) || [];
ok("no capital row is left", !after.some((p) => /^capital_state_missing/.test(p.rule)), after.map((p) => p.rule));

console.log(`\ntest-a-landless-capital-names-the-map-step: ${pass} checks passed`);
