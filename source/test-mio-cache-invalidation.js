// scanAllMioCompanies / mioCategoryEquipmentMap cached their parsed results keyed ONLY on the root-path string,
// with no file fingerprint. Creating a manufacturer (POST /api/mio writes into the organizations dir) leaves
// the paths unchanged, so the STALE company list was served and the new company was missing from the variant
// designer's "who designs this" picker until a server restart. Both caches now fingerprint the scanned dirs.
// Run: node test-mio-cache-invalidation.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-miocache-"));
// replace_path both dirs → the game root is excluded, so the scan is fully ours (fast + deterministic).
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="mio cache test"\nreplace_path="common/equipment_groups"\nreplace_path="common/military_industrial_organization/organizations"\n');
const groupsDir = path.join(mod, "common", "equipment_groups");
const orgsDir = path.join(mod, "common", "military_industrial_organization", "organizations");
fs.mkdirSync(groupsDir, { recursive: true });
fs.mkdirSync(orgsDir, { recursive: true });
fs.writeFileSync(path.join(groupsDir, "g.txt"), "mio_cat_eq_x = { equipment_type = { arch_x } }\n");
const mio = (id) => [id + " = {", "\ticon = GFX_idea_x", "\tallowed = { original_tag = USA }", "\tequipment_type = { mio_cat_eq_x }", "\tinitial_trait = { name = t equipment_bonus = { reliability = 0.1 } }", "}"].join("\n");
fs.writeFileSync(path.join(orgsDir, "a.txt"), mio("USA_a_co") + "\n");

(async () => {
  const PORT = 3991, BASE = `http://127.0.0.1:${PORT}`;
  const server = await new Promise((res) => { const s = createApp().listen(PORT, () => res(s)); });
  const q = () => fetch(`${BASE}/api/mio/for-equipment?modPath=${encodeURIComponent(mod)}&archetype=arch_x&tag=USA`).then((r) => r.json());
  try {
    const d1 = await q(); // populates the cache
    ok("initial scan returns the first company", (d1.companies || []).some((c) => c.id === "USA_a_co"), (d1.companies || []).map((c) => c.id));
    ok("the not-yet-created company is absent", !(d1.companies || []).some((c) => c.id === "USA_b_co"), (d1.companies || []).map((c) => c.id));

    // Create a NEW manufacturer file (what POST /api/mio does) — the org dir changes, the root paths do not.
    fs.writeFileSync(path.join(orgsDir, "b.txt"), mio("USA_b_co") + "\n");

    const d2 = await q(); // must RE-SCAN (fingerprint changed), not serve the stale cache
    ok("after creating a manufacturer, the picker shows it WITHOUT a restart", (d2.companies || []).some((c) => c.id === "USA_b_co"), (d2.companies || []).map((c) => c.id));
    ok("the original company is still there too", (d2.companies || []).some((c) => c.id === "USA_a_co"), (d2.companies || []).map((c) => c.id));

    // Editing a category (equipment_groups) must also invalidate its cache — narrow mio_cat_eq_x to a diff arch.
    fs.writeFileSync(path.join(groupsDir, "g.txt"), "mio_cat_eq_x = { equipment_type = { arch_y } }\n");
    const d3 = await q();
    ok("after editing the category, arch_x no longer matches (category cache re-read)", !(d3.companies || []).some((c) => c.id === "USA_a_co" || c.id === "USA_b_co"), { n: (d3.companies || []).length });
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMIO-CACHE-INVALIDATION: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
