// mioCategoryEquipmentMap must honour HOI4's same-basename / last-definition override, not UNION archetype
// sets across roots + files. A category redefined with a NARROWER set must shrink; unioning kept the dropped
// archetype matching, so a company was still shown designing equipment its category no longer covers.
// Run: node test-mio-category-override.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miocat-"));
// replace_path equipment_groups → the game's own groups are excluded, so the category map is fully ours.
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="mio cat override"\nreplace_path="common/equipment_groups"\n');
fs.mkdirSync(path.join(mod, "common", "equipment_groups"), { recursive: true });
fs.mkdirSync(path.join(mod, "common", "military_industrial_organization", "organizations"), { recursive: true });
// The category is defined WIDE, then REDEFINED NARROW (drops wide_arch). Last definition must win.
fs.writeFileSync(path.join(mod, "common", "equipment_groups", "groups.txt"), [
  "mio_cat_eq_x = { equipment_type = { wide_arch narrow_arch } }",
  "mio_cat_eq_x = { equipment_type = { narrow_arch } }",
].join("\n"));
fs.writeFileSync(path.join(mod, "common", "military_industrial_organization", "organizations", "orgs.txt"), [
  "USA_x_co = {",
  "\ticon = GFX_idea_x",
  "\tallowed = { original_tag = USA }",
  "\tequipment_type = { mio_cat_eq_x }",
  "\tinitial_trait = { name = t equipment_bonus = { reliability = 0.1 } }",
  "}",
].join("\n"));

(async () => {
  const PORT = 3990, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const q = (arch) => fetch(`${BASE}/api/mio/for-equipment?modPath=${encodeURIComponent(mod)}&archetype=${arch}&tag=USA`).then((r) => r.json());
  try {
    const narrow = await q("narrow_arch");
    ok("the company matches the archetype STILL in the category (narrow_arch)", (narrow.companies || []).some((c) => c.id === "USA_x_co"), (narrow.companies || []).map((c) => c.id));
    const wide = await q("wide_arch");
    ok("the company does NOT match the archetype the redefinition DROPPED (wide_arch)", !(wide.companies || []).some((c) => c.id === "USA_x_co"), (wide.companies || []).map((c) => c.id));
    ok("wide_arch resolves to no category (redefinition shrank it)", (wide.categories || []).length === 0, wide.categories);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMIO-CATEGORY-OVERRIDE: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
