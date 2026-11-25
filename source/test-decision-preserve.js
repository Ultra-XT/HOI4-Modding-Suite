// Unit test for extractPreservedDecisionBody: the Decision Maker rebuilds a decision block from its
// modeled fields, so any key NOT in the caller's managed set must be carried forward verbatim, or editing
// an existing decision silently drops it. NOTE: priority / custom_cost_text / custom_cost_trigger /
// highlight_states / on_map_mode are now MODELED by the maker's "⚙️ Advanced" section (managed + round-
// tripped by the client — see test-decision-advanced-roundtrip.js). Fields that remain un-modeled and so
// rely on this preservation path: an explicit name= / picture=, selectable_mission, war_with_*, and a
// NON-mission cancel_trigger (MD: name×420, selectable_mission×188, 139 non-mission cancel_triggers).
// The assertions below pass a hand-built managed set to prove the GENERIC mechanism (any key absent from
// the set is preserved), independent of which keys the live endpoint currently manages.
"use strict";
const { extractPreservedDecisionBody, reindentPdxStatement } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
const braces = (s) => { let d = 0; for (const c of s) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return -1; } } return d; };

// Managed sets mirror the endpoint (non-mission decision: cancel_trigger preserved; non-state scope:
// targets/target_trigger preserved).
const managedNonMission = new Set(["icon","cost","days_mission_timeout","days_remove","days_re_enable","fire_only_once","available","modifier","complete_effect","ai_will_do","allowed","visible","timeout_effect","remove_effect","is_good","activation"]);
const managedMission = new Set([...managedNonMission, "cancel_trigger"]);

// ── A realistic MD-style NON-mission decision using fields the maker doesn't model ──
const file = `political_decisions = {

	my_decision = {
		icon = GFX_decision_generic
		priority = 100
		name = my_decision_custom_name
		picture = GFX_decision_cat_picture

		allowed = { original_tag = GER }

		highlight_states = { state = 64 }
		on_map_mode = map_only

		custom_cost_trigger = { command_power > 25 }
		custom_cost_text = my_cost_text

		cancel_trigger = { has_war = no }

		visible = { has_country_flag = x }
		available = { has_war = yes }

		complete_effect = {
			add_political_power = 100
		}
		ai_will_do = { factor = 1 }
	}
}
`;

const p = extractPreservedDecisionBody(file, "political_decisions", "my_decision", managedNonMission);
check("found the decision", p.found === true);
const t = p.lines.join("\n");
check("preserves priority", /priority\s*=\s*100/.test(t), t);
check("preserves explicit name", /name\s*=\s*my_decision_custom_name/.test(t));
check("preserves picture", /picture\s*=\s*GFX_decision_cat_picture/.test(t));
check("preserves highlight_states block", /highlight_states\s*=\s*\{/.test(t) && /state\s*=\s*64/.test(t));
check("preserves on_map_mode", /on_map_mode\s*=\s*map_only/.test(t));
check("preserves custom_cost_trigger block", /custom_cost_trigger\s*=\s*\{/.test(t) && /command_power/.test(t));
check("preserves custom_cost_text", /custom_cost_text\s*=\s*my_cost_text/.test(t));
check("preserves NON-mission cancel_trigger", /cancel_trigger\s*=\s*\{/.test(t) && /has_war\s*=\s*no/.test(t));
check("preserved lines are brace-balanced", braces(t) === 0, t);

// Managed fields are NOT preserved (the maker re-synthesises them).
check("does NOT preserve managed icon/allowed/available/complete_effect/ai_will_do/visible", !/\bicon\s*=/.test(t) && !/\ballowed\s*=/.test(t) && !/\bavailable\s*=/.test(t) && !/\bcomplete_effect\s*=/.test(t) && !/\bai_will_do\s*=/.test(t) && !/\bvisible\s*=/.test(t), t);

// For a MISSION, cancel_trigger IS managed (the form round-trips it) → must NOT be preserved (no dup).
const pm = extractPreservedDecisionBody(file, "political_decisions", "my_decision", managedMission);
check("mission managed-set does NOT preserve cancel_trigger (avoids duplicate)", !/cancel_trigger/.test(pm.lines.join("\n")));

// Absent decision / category → found=false, empty, no crash.
check("absent decision id → empty", extractPreservedDecisionBody(file, "political_decisions", "nope", managedNonMission).lines.length === 0);
check("absent category → empty", extractPreservedDecisionBody(file, "nope_cat", "my_decision", managedNonMission).found === false);

// A decision with ONLY modeled fields preserves nothing.
const simple = `cat = { d1 = { icon = GFX_x cost = 50 fire_only_once = yes available = { always = yes } complete_effect = { add_political_power = 1 } } }`;
check("modeled-only decision preserves nothing", extractPreservedDecisionBody(simple, "cat", "d1", managedNonMission).lines.length === 0);

// reindent the preserved lines to 2 tabs (decision field depth) and stay balanced.
const rb = p.lines.map(l => reindentPdxStatement(l, 2)).join("\n");
check("reindented preserved block balanced at 2 tabs", braces(rb) === 0 && rb.split("\n")[0].startsWith("\t\t"), JSON.stringify(rb.split("\n")[0]));

console.log(`\nDECISION-PRESERVE TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
