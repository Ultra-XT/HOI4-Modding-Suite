// Genesis scripted_effect resolution: simple wrapper effects resolve to English; parameterised
// ($X$) and long/complex bodies fall back to the title-cased name (never worse than before).
const fs = require("fs");
const G = require("./public/genesis-engine.js");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// --- deterministic synthetic cases ---
const longBody = Array.from({ length: 20 }, (_, i) => `add_political_power = ${i + 1}`).join("\n");
G.setScriptedEffects({
  my_simple_wrapper: "add_political_power = 50\nadd_stability = 0.05",
  my_modifier_wrapper: "add_dynamic_modifier = { modifier = some_cool_modifier }",
  my_param_effect: "add_political_power = $AMOUNT$",
  my_long_effect: longBody,
});

const r1 = G.translate("my_simple_wrapper = yes");
ok(/Political power \+50/.test(r1) && /Stability \+5%/.test(r1), "simple wrapper resolves to its effects", r1);

const r2 = G.translate("my_modifier_wrapper = yes");
ok(/Gain modifier: Some Cool Modifier/.test(r2), "modifier wrapper resolves", r2);

const r3 = G.translate("my_param_effect = yes");
ok(r3 === "My Param Effect", "parameterised ($X$) effect falls back to title-case", r3);

const r4 = G.translate("my_long_effect = yes");
ok(r4 === "My Long Effect", "long/complex body falls back to title-case", r4);

// recursion guard: a self-referential scripted effect must not loop
G.setScriptedEffects({ loopy: "loopy = yes\nadd_political_power = 10" });
let r5 = "";
try { r5 = G.translate("loopy = yes"); } catch (e) { r5 = "THREW:" + e.message; }
ok(!/THREW/.test(r5), "self-referential scripted effect doesn't loop/throw", r5);

// unknown key still title-cases (no scripted effects registered for it)
G.setScriptedEffects({});
ok(G.translate("ger_modify_industrial_modifier = yes") === "Modify Industrial Modifier", "unknown scripted effect still title-cases", G.translate("ger_modify_industrial_modifier = yes"));

// --- base-game effects mined from real vanilla focus completion_reward blocks (autonomy/subsidy/MIO) ---
ok(G.translate("add_autonomy_ratio = { value = 0.1 localization = X }") === "Autonomy +10%", "add_autonomy_ratio -> signed percent (localization ignored)", G.translate("add_autonomy_ratio = { value = 0.1 localization = X }"));
ok(G.translate("add_autonomy_score = { value = -100 }") === "Autonomy score -100", "add_autonomy_score -> signed flat", G.translate("add_autonomy_score = { value = -100 }"));
ok(/Subsidize Light Tank Chassis production/.test(G.translate("add_equipment_subsidy = { cic = 500 equipment_type = light_tank_chassis seller_tags = { USA } }")), "add_equipment_subsidy -> readable", G.translate("add_equipment_subsidy = { cic = 500 equipment_type = light_tank_chassis }"));
ok(G.translate("show_mio_tooltip = SOV_org") === "", "show_mio_tooltip is display-only (dropped)", G.translate("show_mio_tooltip = SOV_org"));

// --- base-game event/decision effects data-mined from vanilla events + decisions ---
ok(G.translate("clear_variable = FIN_weapon_caches") === "Clear variable: Weapon Caches", "clear_variable -> readable", G.translate("clear_variable = FIN_weapon_caches"));
ok(G.translate("white_peace = ROOT") === "White peace with this country", "white_peace resolves the ROOT scope", G.translate("white_peace = ROOT"));
ok(G.translate("transfer_ship = { type = destroyer target = ETH }") === "Transfer a Destroyer to Ethiopia", "transfer_ship -> type + target (tag mapped)", G.translate("transfer_ship = { type = destroyer target = ETH }"));
ok(G.translate("leave_faction = yes") === "Leave the current faction", "leave_faction -> plain English", G.translate("leave_faction = yes"));
ok(G.translate("uncomplete_national_focus = { focus = FIN_x }") === "Un-complete the focus X", "uncomplete_national_focus -> focus name", G.translate("uncomplete_national_focus = { focus = FIN_x }"));
ok(G.translate("character_list_tooltip = { limit = { x = yes } }") === "", "character_list_tooltip is display-only (dropped)", G.translate("character_list_tooltip = { limit = { x = yes } }"));

// --- set_building_level reads cleanly (was "Set Building Level: Type: …; Level: +1") ---
ok(G.translate("set_building_level = { type = arms_factory level = 1 }") === "Set military factory to level 1", "set_building_level -> readable", G.translate("set_building_level = { type = arms_factory level = 1 }"));
ok(G.translate("set_building_level = { type = naval_base level = 3 province = 1234 }") === "Set naval base to level 3 in province 1234", "set_building_level with province", G.translate("set_building_level = { type = naval_base level = 3 province = 1234 }"));

// --- ai_chance is AI weighting noise, dropped from effect output; +3 clean effects ---
ok(G.translate("add_political_power = 50 ai_chance = { base = 10 modifier = { factor = 0 } }") === "Political power +50", "ai_chance noise dropped beside a real effect", G.translate("add_political_power = 50 ai_chance = { base = 10 }"));
ok(G.translate("ai_chance = { factor = 1 }") === "", "bare ai_chance -> empty");
ok(G.translate("ai_will_do = { factor = 10 }") !== "", "ai_will_do still renders (it's an editable field, not noise)");
ok(G.translate("clear_global_event_target = my_target") === 'Clear the global event target "My Target"', "clear_global_event_target", G.translate("clear_global_event_target = my_target"));
ok(G.translate("give_resource_rights = { receiver = GER state = 64 }") === "Give resource rights in state 64 to Germany", "give_resource_rights", G.translate("give_resource_rights = { receiver = GER state = 64 }"));

// --- sub-block effects must not leak {block} or emit "null" (audit fixes) ---
ok(G.translate('add_equipment_production = { equipment = { type = ship_hull_cruiser_panzerschiff version_name = "Deutschland Class" } name = "Graf Spee II" }') === "Start production of Graf Spee II", "add_equipment_production uses the top-level name", G.translate('add_equipment_production = { equipment = { version_name = "Deutschland Class" } name = "Graf Spee II" }'));
ok(G.translate('add_equipment_production = { equipment = { type = ship_hull_light_2 version_name = "Anshan Class" } }') === "Start production of Anshan Class", "add_equipment_production falls back to the variant version_name (no {block})", G.translate('add_equipment_production = { equipment = { version_name = "Anshan Class" } }'));
ok(G.translate("add_mastery = { amount = 120 track = screens }") === "Naval mastery +120 (Screens track)", "add_mastery reads amount+track (no null)", G.translate("add_mastery = { amount = 120 track = screens }"));
ok(G.translate("add_mastery = 50") === "Naval mastery +50", "add_mastery scalar form still works", G.translate("add_mastery = 50"));
ok(G.translate("set_party_popularity = { ideology = communism popularity = party_popularity@communism }") === "Communism popularity set to Party Popularity@communism", "popularity variable -> 'set to', not null", G.translate("set_party_popularity = { ideology = communism popularity = party_popularity@communism }"));
ok(G.translate("set_party_popularity = { ideology = communism popularity = 0.3 }") === "Communism popularity +30%", "popularity number -> percent", G.translate("set_party_popularity = { ideology = communism popularity = 0.3 }"));

// --- base-game effects data-mined from vanilla & confirmed against the wiki effect list ---
ok(G.translate("give_military_access = GER") === "Grant military access to Germany", "give_military_access -> target tag mapped", G.translate("give_military_access = GER"));
ok(G.translate("save_event_target_as = my_state") === 'Save this as a reusable target: "my_state"', "save_event_target_as -> keeps the raw target name verbatim", G.translate("save_event_target_as = my_state"));
ok(G.translate("remove_power_balance = { id = spain_civil_war_balance }") === 'Remove the balance of power "Spain Civil War Balance"', "remove_power_balance -> readable BoP id", G.translate("remove_power_balance = { id = spain_civil_war_balance }"));
// sub-block ship/equipment effects (fields verified from real vanilla usage)
ok(G.translate("send_equipment = { equipment = infantry_equipment amount = 2500 target = ROOT }") === "Send 2500 Infantry Equipment to this country", "send_equipment -> amount + archetype + recipient", G.translate("send_equipment = { equipment = infantry_equipment amount = 2500 target = ROOT }"));
ok(G.translate("send_equipment = { type = fighter_equipment_1 amount = 12 target = ROOT }") === "Send 12 Fighter Equipment 1 to this country", "send_equipment -> `type` alias for archetype", G.translate("send_equipment = { type = fighter_equipment_1 amount = 12 target = ROOT }"));
ok(G.translate('create_ship = { type = ship_hull_midget_submarine equipment_variant = "CB Class" creator = FROM }') === 'Add a ship: "CB Class" for the source country', "create_ship -> named variant + creator scope", G.translate('create_ship = { type = ship_hull_midget_submarine equipment_variant = "CB Class" creator = FROM }'));

// --- common idea modifiers in the engine MODIFIERS dict (auto() infers % vs flat) ---
ok(G.translate("production_speed_arms_factory_factor = 0.15") === "Mil factory construction speed +15%", "construction-speed modifier -> percent name", G.translate("production_speed_arms_factory_factor = 0.15"));
ok(G.translate("communism_drift = 0.05") === "Communism support drift +5%", "ideology drift modifier -> percent name", G.translate("communism_drift = 0.05"));
ok(G.translate("operative_slot = 2") === "Operative slots +2", "flat count modifier -> flat (not %)", G.translate("operative_slot = 2"));
ok(G.translate("max_command_power = 50") === "Max command power +50", "flat amount modifier -> flat (not %)", G.translate("max_command_power = 50"));
// flat-daily modifiers must NOT be read as a percentage by auto() (political_power_gain = 0.5 is +0.5/day, not +50%)
ok(G.translate("political_power_gain = 0.5") === "Political power gain (flat) +0.5", "political_power_gain 0.5 -> +0.5 (flat, not +50%)", G.translate("political_power_gain = 0.5"));
ok(G.translate("command_power_gain = 0.5") === "Command power gain (flat) +0.5", "command_power_gain 0.5 -> +0.5 (flat)", G.translate("command_power_gain = 0.5"));
ok(G.translate("stability_factor = 0.05") === "Stability +5%", "percent factor still renders as % (not broken by the flat fix)", G.translate("stability_factor = 0.05"));

// --- real vanilla scripted_effects: build the map, show how many resolve vs title-case ---
const SE_DIR = "d:/SteamLibrary/steamapps/common/Hearts of Iron IV/common/scripted_effects";
let realMap = {};
try {
  for (const f of fs.readdirSync(SE_DIR)) {
    if (!f.endsWith(".txt")) continue;
    const txt = fs.readFileSync(SE_DIR + "/" + f, "utf8");
    for (const st of G.tokenize(txt)) { if (st.key && st.block != null) realMap[st.key] = st.block; }
  }
} catch (e) { console.log("  (skip real scripted_effects: " + e.message + ")"); }

const names = Object.keys(realMap);
if (names.length) {
  G.setScriptedEffects(realMap);
  let resolved = 0, fellBack = 0;
  const samples = [];
  for (const n of names) {
    const out = G.translate(n + " = yes");
    const titleCased = n.replace(/^[a-z]{3}_/i, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (out && out !== titleCased && out.toLowerCase() !== titleCased.toLowerCase()) { resolved++; if (samples.length < 10 && out.length < 90) samples.push(n + "  →  " + out); }
    else fellBack++;
  }
  console.log(`\n  real scripted_effects: ${names.length} total — ${resolved} resolved to English, ${fellBack} kept as a name`);
  console.log("  sample resolutions:");
  samples.forEach((s) => console.log("    " + s));
  ok(resolved > 0, "at least some real vanilla scripted_effects resolve", resolved);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
