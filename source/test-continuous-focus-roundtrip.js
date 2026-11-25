// Round-trip safety for the continuous-focus palette editor (common/continuous_focus/*.txt).
// Continuous focuses are edited SURGICALLY — moving the panel, editing a focus's effects, or
// adding/removing a focus must NEVER drop an un-modeled field (ai_will_do, supports_ai_strategy,
// hidden_trigger gates, comments, etc.). See research-save-roundtrip-contract for the contract.
// Run: node test-continuous-focus-roundtrip.js   (auto-discovered by run-tests.js)
const fs = require("fs");
const path = require("path");
const {
  parseContinuousFocusPalettes,
  cfSetPalettePosition,
  cfUpsertFocus,
  cfDeleteFocus,
  cfRenameFocus,
  cfDefaultPaletteFileContent,
} = require("./server.js");

let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

// A fixture that mirrors the real vanilla shape: a palette header (id/country/default/position), an
// idea-style focus, a modifier focus with nested ai_will_do, a select/cancel-effect focus, a comment.
const FIXTURE = `continuous_focus_palette = {
	id = generic_focus

	country = {
		factor = 1
	}

	default = yes
	reset_on_civilwar = no

	position = { x = 50 y = 1000 }

	focus = {
		id = continuous_naval_production
		icon = GFX_goal_continuous_naval_production
		available = {
		}
		idea = continuous_naval_production
		ai_will_do = {
			factor = 1
			modifier = {
				factor = 0.25
				is_government_in_exile = yes
				original_tag = ETH
			}
		}
		supports_ai_strategy = ai_focus_naval
		daily_cost = 1
		available_if_capitulated = yes
	}

	focus = {
		id = continuous_suppression
		icon = GFX_goal_continuous_suppression
		available = {
		}
		modifier = {
			resistance_target = -0.05 # tuned down in 1.11
		}
		ai_will_do = {
			factor = 1
			modifier = {
				factor = 0
				num_occupied_states < 1
			}
		}
		supports_ai_strategy = ai_focus_military_advancements
		daily_cost = 1
		available_if_capitulated = yes
	}

	focus = {
		id = continuous_tech_share
		icon = GFX_goal_continuous_research
		available = {
			hidden_trigger = { has_dlc = "Together for Victory" }
		}
		select_effect = {
			add_to_tech_sharing_group = continuous_tech_share
		}
		cancel_effect = {
			remove_from_tech_sharing_group = continuous_tech_share
		}
		ai_will_do = { factor = 0 }
		daily_cost = 1
		available_if_capitulated = yes
	}
}
`;

console.log("=== CONTINUOUS FOCUS ROUND-TRIP ===");

// 1. Parse.
const pals = parseContinuousFocusPalettes(FIXTURE);
ok(pals.length === 1, "one palette parsed", pals.length);
const pal = pals[0] || {};
ok(pal.id === "generic_focus", "palette id", pal.id);
ok(pal.isDefault === true, "default flag", pal.isDefault);
ok(pal.position && pal.position.x === 50 && pal.position.y === 1000, "panel position", pal.position);
ok(pal.focuses.length === 3, "three continuous focuses", pal.focuses.length);
const naval = pal.focuses.find((f) => f.id === "continuous_naval_production");
ok(naval && naval.idea === "continuous_naval_production", "idea-style focus parsed", naval && naval.idea);
ok(naval && naval.icon === "GFX_goal_continuous_naval_production", "focus icon parsed", naval && naval.icon);
const supp = pal.focuses.find((f) => f.id === "continuous_suppression");
ok(supp && /resistance_target\s*=\s*-0\.05/.test(supp.modifier || ""), "modifier body parsed", supp && supp.modifier);
const share = pal.focuses.find((f) => f.id === "continuous_tech_share");
ok(share && /add_to_tech_sharing_group/.test(share.selectEffect || ""), "select_effect parsed", share && share.selectEffect);

// 2. Move the panel — only position changes, everything else byte-stable.
const moved = cfSetPalettePosition(FIXTURE, "generic_focus", 1200, 100);
const movedPals = parseContinuousFocusPalettes(moved);
ok(movedPals[0].position.x === 1200 && movedPals[0].position.y === 100, "position updated", movedPals[0].position);
ok(/ai_focus_naval/.test(moved) && /resistance_target/.test(moved) && /add_to_tech_sharing_group/.test(moved), "move preserved all focus bodies");
ok((moved.match(/position\s*=\s*\{/g) || []).length === 1, "no duplicate position block", (moved.match(/position\s*=\s*\{/g) || []).length);
// idempotent move
const moved2 = cfSetPalettePosition(moved, "generic_focus", 1200, 100);
ok(moved2 === moved, "re-moving to same coords is a no-op (idempotent)");

// 3. Edit an existing focus's modifier — preserve ai_will_do, supports_ai_strategy, daily_cost, icon.
const edited = cfUpsertFocus(FIXTURE, "generic_focus", "continuous_suppression", {
  modifier: "resistance_target = -0.10\nresistance_damage_to_garrison = -0.10",
});
const eP = parseContinuousFocusPalettes(edited);
const eSupp = eP[0].focuses.find((f) => f.id === "continuous_suppression");
ok(/resistance_target\s*=\s*-0\.10/.test(eSupp.modifier || ""), "modifier edited", eSupp && eSupp.modifier);
ok(/resistance_damage_to_garrison/.test(eSupp.modifier || ""), "added modifier line present");
ok(/supports_ai_strategy\s*=\s*ai_focus_military_advancements/.test(edited), "supports_ai_strategy preserved on edit");
ok(/num_occupied_states < 1/.test(edited), "ai_will_do body preserved on edit");
ok((edited.match(/id = continuous_suppression/g) || []).length === 1, "no duplicated focus on edit");
ok(eP[0].focuses.length === 3, "focus count unchanged on edit", eP[0].focuses.length);
// editing twice is idempotent in shape (still one block, same field count)
const edited2 = cfUpsertFocus(edited, "generic_focus", "continuous_suppression", { modifier: "resistance_target = -0.10\nresistance_damage_to_garrison = -0.10" });
ok((edited2.match(/modifier = \{/g) || []).length === (edited.match(/modifier = \{/g) || []).length, "edit idempotent (no modifier block growth)");

// 3b. Rename a continuous focus's id (surgical) — only the id changes, everything else survives.
const renamed = cfRenameFocus(FIXTURE, "generic_focus", "continuous_suppression", "continuous_crackdown");
const rP = parseContinuousFocusPalettes(renamed)[0];
ok(rP.focuses.some((f) => f.id === "continuous_crackdown"), "focus id renamed");
ok(!rP.focuses.some((f) => f.id === "continuous_suppression"), "old id gone after rename");
ok(/resistance_target\s*=\s*-0\.05/.test(renamed) && /ai_focus_military_advancements/.test(renamed), "rename preserved the focus body");
ok(rP.focuses.length === 3, "rename keeps the focus count", rP.focuses.length);
let renameThrew = false; try { cfRenameFocus(FIXTURE, "generic_focus", "continuous_suppression", "continuous_naval_production"); } catch (_) { renameThrew = true; }
ok(renameThrew, "rename to an existing id is rejected");

// 4. Edit a scalar (daily_cost) + add a NEW block field (enable) on an existing focus.
const edited3 = cfUpsertFocus(FIXTURE, "generic_focus", "continuous_naval_production", { dailyCost: 2, enable: "always = yes" });
const e3 = parseContinuousFocusPalettes(edited3)[0].focuses.find((f) => f.id === "continuous_naval_production");
ok(e3.dailyCost === 2, "daily_cost edited", e3 && e3.dailyCost);
ok(/always = yes/.test(e3.enable || ""), "enable block inserted", e3 && e3.enable);
ok(e3.idea === "continuous_naval_production", "idea preserved when editing other fields");

// 5. Add a brand-new continuous focus — box grows by one.
const added = cfUpsertFocus(FIXTURE, "generic_focus", "continuous_war_economy", {
  icon: "GFX_goal_generic_construct_mil_factory",
  modifier: "production_speed_arms_factory_factor = 0.1",
  supportsAiStrategy: "ai_focus_military_advancements",
  dailyCost: 1,
});
const aP = parseContinuousFocusPalettes(added);
ok(aP[0].focuses.length === 4, "focus added (count grew to 4)", aP[0].focuses.length);
const aNew = aP[0].focuses.find((f) => f.id === "continuous_war_economy");
ok(aNew && /production_speed_arms_factory_factor/.test(aNew.modifier || ""), "new focus modifier present", aNew && aNew.modifier);
ok(/resistance_target/.test(added) && /add_to_tech_sharing_group/.test(added), "adding preserved existing focuses");

// 6. Delete a focus — box shrinks, the others stay intact.
const del = cfDeleteFocus(FIXTURE, "generic_focus", "continuous_suppression");
const dP = parseContinuousFocusPalettes(del);
ok(dP[0].focuses.length === 2, "focus deleted (count 2)", dP[0].focuses.length);
ok(!/id = continuous_suppression/.test(del), "deleted focus gone");
ok(/id = continuous_naval_production/.test(del) && /id = continuous_tech_share/.test(del), "siblings preserved after delete");
ok(/ai_focus_naval/.test(del), "sibling bodies preserved after delete");

// 7. Comment preservation: the inline comment on the suppression modifier survives a panel move.
ok(/# tuned down in 1\.11/.test(moved), "inline comment preserved through a move");

// 8. Default palette file content is parseable and round-trips.
const fresh = cfDefaultPaletteFileContent("my_focus", 200, 1400);
const fP = parseContinuousFocusPalettes(fresh);
ok(fP.length === 1 && fP[0].id === "my_focus" && fP[0].position.x === 200, "default palette file parses", fP[0]);
const freshAdded = cfUpsertFocus(fresh, "my_focus", "continuous_test", { modifier: "stability_factor = 0.05" });
ok(parseContinuousFocusPalettes(freshAdded)[0].focuses.length === 1, "can add a focus to a fresh palette");

// 9. Realism check against the actual vanilla file, if present (read-only; never written).
const VANILLA = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/continuous_focus/generic.txt";
if (fs.existsSync(VANILLA)) {
  try {
    const vtext = fs.readFileSync(VANILLA, "utf8");
    const vp = parseContinuousFocusPalettes(vtext);
    ok(vp.length >= 1 && vp[0].focuses.length >= 9, "vanilla generic.txt parses (>=9 focuses)", vp[0] && vp[0].focuses.length);
    // move + verify count/bodies unchanged
    const vmoved = cfSetPalettePosition(vtext, vp[0].id, 300, 1200);
    const vmp = parseContinuousFocusPalettes(vmoved);
    ok(vmp[0].focuses.length === vp[0].focuses.length, "vanilla focus count stable after move", { before: vp[0].focuses.length, after: vmp[0].focuses.length });
    ok(vmp[0].position.x === 300, "vanilla position moved", vmp[0].position);
  } catch (e) {
    ok(false, "vanilla realism check threw: " + (e.message || e));
  }
} else {
  console.log("  --  (vanilla generic.txt not found; skipped realism check)");
}

if (failed) { console.error(`\ntest-continuous-focus-roundtrip: ${failed} FAILED`); process.exit(1); }
console.log("\ntest-continuous-focus-roundtrip: all checks passed");
