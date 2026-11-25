// The MIO writer's preserve-merge kept un-modeled TOP-LEVEL keys (visible/available/add_trait) on a re-save, but
// `trait` was fully owned: mioTraitLines regenerated every trait from Nova's model (token/name/icon/position/
// relative_position_id/parent/equipment_bonus/production_bonus) and dropped everything else. A real Millennium
// Dawn trait carries all_parents / mutually_exclusive / limit_to_equipment_type / ai_will_do / on_complete /
// special_trait_background — thousands of uses — so re-saving an overridden MD MIO would DELETE its whole
// trait-tree + AI-weighting structure. mergePreservedMioBlock now preserves each same-token trait's non-owned
// statements (the officerExtra contract, one level deeper). This test: a trait with all of those survives a
// POST /api/mio re-save, including the deeply nested on_complete/ai_will_do effect blocks. #mio-trait-preserve
// Run: node test-mio-trait-preserve.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miotrait-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="mio trait preserve test"\n');
const orgsDir = path.join(mod, "common", "military_industrial_organization", "organizations");
fs.mkdirSync(orgsDir, { recursive: true });

// A hand-written MIO (as MD ships them) whose trait leans on fields Nova does NOT model. Written to the SAME
// file the default re-save targets (nova_mio.txt) so writeMioToFile finds + preserve-merges the existing block.
const OLD = [
  "USA_test_co = {",
  "\ticon = GFX_idea_test",
  "\tallowed = { original_tag = USA }",
  "\tequipment_type = { mio_cat_eq_x }",
  "\tvisible = { always = yes }", // un-modeled TOP-LEVEL key — must also survive (existing contract)
  "\tinitial_trait = {",
  "\t\tname = USA_test_co_initial",
  "\t\tequipment_bonus = { reliability = 0.1 }",
  "\t\torganization_modifier = { military_industrial_organization_task_capacity = -1 }", // un-modeled initial_trait sub-key — MUST survive
  "\t\tlimit_to_equipment_type = { medium_tank_chassis }",                               // un-modeled — MUST survive
  "\t}",
  "\ttrait = {",
  "\t\ttoken = USA_test_co_flexible",
  "\t\tname = USA_test_co_flexible",
  "\t\ticon = GFX_generic_mio_trait_icon_reliability",
  "\t\tposition = { x = 2 y = 3 }",
  "\t\trelative_position_id = USA_test_co_base",
  "\t\tany_parent = { USA_test_co_base }",            // OWNED (serializer emits from model.parent) — round-trips
  "\t\tall_parents = { USA_test_co_base USA_test_co_alt }", // un-modeled — MUST be preserved
  "\t\tmutually_exclusive = { USA_test_co_rigid }",   // un-modeled — MUST be preserved
  "\t\tlimit_to_equipment_type = { light_tank_chassis }", // un-modeled — MUST be preserved
  "\t\tspecial_trait_background = yes",               // un-modeled — MUST be preserved
  "\t\tequipment_bonus = { reliability = 0.05 }",     // OWNED — regenerated from model
  "\t\ton_complete = {",                              // un-modeled DEEPLY NESTED effect — MUST survive verbatim
  "\t\t\tif = {",
  "\t\t\t\tlimit = { check_variable = { free_trait_picks > 0 } }",
  "\t\t\t\tadd_to_variable = { free_trait_picks = -1 }",
  "\t\t\t}",
  "\t\t}",
  "\t\tai_will_do = {",                               // un-modeled NESTED weighting — MUST survive verbatim
  "\t\t\tbase = 10",
  "\t\t\tmodifier = {",
  "\t\t\t\tfactor = 0",
  "\t\t\t\tcheck_variable = { FROM.interest_rate > 8 }",
  "\t\t\t}",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(path.join(orgsDir, "nova_mio.txt"), OLD);

(async () => {
  const PORT = 3994, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  try {
    // Re-save the SAME MIO with Nova's model. The model re-uses the trait token + carries the parent (so any_parent
    // is regenerated), but knows nothing of all_parents/mutually_exclusive/ai_will_do/on_complete/etc.
    const body = {
      modPath: mod, id: "USA_test_co", name: "Test Co", allowedTag: "USA",
      equipmentType: ["mio_cat_eq_x"],
      initial: { equipmentBonus: { reliability: 0.1 } },
      traits: [{
        token: "USA_test_co_flexible", name: "Flexible", x: 2, y: 3,
        relativeTo: "USA_test_co_base", parent: "USA_test_co_base",
        equipmentBonus: { reliability: 0.05 },
      }],
    };
    const d = await fetch(`${BASE}/api/mio`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
    ok("re-save succeeded", d && d.ok === true, d);

    const after = fs.readFileSync(path.join(orgsDir, "nova_mio.txt"), "utf8");

    // (1) The un-modeled trait fields survive the regeneration.
    ok("all_parents preserved", /all_parents\s*=\s*\{\s*USA_test_co_base\s+USA_test_co_alt\s*\}/.test(after), after);
    ok("mutually_exclusive preserved", /mutually_exclusive\s*=\s*\{\s*USA_test_co_rigid\s*\}/.test(after), after);
    ok("limit_to_equipment_type preserved", /limit_to_equipment_type\s*=\s*\{\s*light_tank_chassis\s*\}/.test(after), after);
    ok("special_trait_background preserved", /special_trait_background\s*=\s*yes/.test(after), after);

    // (2) The deeply nested effect blocks survive intact (structure, not just the keyword).
    ok("ai_will_do preserved", /ai_will_do\s*=\s*\{/.test(after), after);
    ok("ai_will_do nested modifier survives", /check_variable\s*=\s*\{\s*FROM\.interest_rate\s*>\s*8\s*\}/.test(after), after);
    ok("on_complete preserved", /on_complete\s*=\s*\{/.test(after), after);
    ok("on_complete nested effect survives", /add_to_variable\s*=\s*\{\s*free_trait_picks\s*=\s*-1\s*\}/.test(after), after);

    // (3) The owned parent field round-trips through the model as any_parent (exactly once — no duplicate).
    ok("any_parent regenerated from model", /any_parent\s*=\s*\{\s*USA_test_co_base\s*\}/.test(after), after);
    ok("any_parent is not duplicated", (after.match(/any_parent\s*=/g) || []).length === 1, (after.match(/any_parent\s*=/g) || []).length);

    // (4) The existing TOP-LEVEL preserve still works alongside the new trait-level one.
    ok("top-level visible still preserved", /visible\s*=\s*\{\s*always\s*=\s*yes\s*\}/.test(after), after);

    // (4b) INITIAL_TRAIT un-modeled sub-keys survive too (organization_modifier is in nearly every MD MIO).
    ok("initial_trait organization_modifier preserved", /organization_modifier\s*=\s*\{\s*military_industrial_organization_task_capacity\s*=\s*-1\s*\}/.test(after), after.slice(after.indexOf("initial_trait"), after.indexOf("initial_trait") + 300));
    ok("initial_trait limit_to_equipment_type preserved", /initial_trait\s*=\s*\{[\s\S]*?limit_to_equipment_type\s*=\s*\{\s*medium_tank_chassis\s*\}/.test(after), after);

    // (5) The regenerated owned content is present and the file is brace-balanced (game-loadable).
    ok("owned trait bonus regenerated", /token\s*=\s*USA_test_co_flexible/.test(after) && /reliability\s*=\s*0\.05/.test(after), after);
    const bal = (after.match(/\{/g) || []).length === (after.match(/\}/g) || []).length;
    ok("file is brace-balanced", bal, { open: (after.match(/\{/g) || []).length, close: (after.match(/\}/g) || []).length });
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMIO-TRAIT-PRESERVE: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
