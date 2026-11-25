// Wiki-correctness guard: HOI4 technology blocks have NO `prerequisite` key — that is a national-focus
// keyword (hoi4.paradoxwikis.com/Technology_modding: "Prerequisite is not a valid key"; confirmed by
// 0 uses in vanilla and in Millennium Dawn). A custom/add-on tech that must come AFTER a vanilla or
// base-mod parent (one we won't rewrite with a `path`) must therefore be gated the wiki-correct way:
//   • single parent (AND) -> `dependencies = { parent = 1 }`
//   • several parents (OR) -> `allow = { OR = { has_tech = a has_tech = b } }`
// and the output must contain NO `prerequisite` (which the game would silently ignore, leaving the
// add-on tech researchable from turn one). Requires the real HOI4 install to mark vanilla as non-mod;
// skips cleanly otherwise (portable, like test-research-fidelity.js).
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3497, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-prereq-"));
  fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Prereq Test"\n', "utf8");
  // Two custom techs that depend on REAL vanilla parents (stable since launch): one AND, one OR.
  fs.writeFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"),
    "technologies = {\n" +
    "\tcustom_rifle = {\n" +
    "\t\tprerequisite = { infantry_weapons = 0 }\n" +
    "\t\tresearch_cost = 1\n" +
    "\t\tstart_year = 1936\n" +
    "\t\tfolder = { name = infantry_folder position = { x = 5 y = 5 } }\n" +
    "\t}\n" +
    "\tcustom_or = {\n" +
    "\t\tprerequisite = { OR = { infantry_weapons = 0 infantry_weapons1 = 0 } }\n" +
    "\t\tresearch_cost = 1\n" +
    "\t\tstart_year = 1936\n" +
    "\t\tfolder = { name = infantry_folder position = { x = 7 y = 5 } }\n" +
    "\t}\n}\n", "utf8");
  return mod;
}

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  const file = path.join(mod, "common", "technologies", "custom_technologies.txt");
  const getAll = async () => {
    const res = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    return (await res.json()).technologies || [];
  };
  try {
    const all = await getAll();
    const vanillaParent = all.find((t) => t.id === "infantry_weapons" && t.isMod === false);
    if (!vanillaParent) {
      console.log("  ⚠ SKIP — vanilla HOI4 install not found (infantry_weapons not loaded as a base tech)");
    } else {
      const rifle = all.find((t) => t.id === "custom_rifle");
      const orTech = all.find((t) => t.id === "custom_or");
      ok(rifle && (rifle.prerequisites || []).some((p) => p.type === "AND" && p.tech === "infantry_weapons"),
         "AND prerequisite on a vanilla parent parses", rifle && rifle.prerequisites);
      ok(orTech && (orTech.prerequisites || []).some((p) => p.type === "OR" && (p.techs || []).includes("infantry_weapons1")),
         "OR prerequisite on vanilla parents parses", orTech && orTech.prerequisites);
      await fetch(`${BASE}/api/technologies/save-batch`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modPath: mod, technologies: [rifle, orTech].filter(Boolean), equipments: {} }),
      });
      const txt = fs.readFileSync(file, "utf8");
      // THE fix: no invalid `prerequisite` key anywhere in the written tech file.
      ok(!/\bprerequisite\b/.test(txt), "written file contains NO `prerequisite` key (invalid in tech blocks)", txt.match(/.*prerequisite.*/)?.[0]);
      // AND requirement expressed as a dependency assignment.
      ok(/dependencies\s*=\s*\{[\s\S]*?infantry_weapons\s*=\s*1[\s\S]*?\}/.test(txt), "AND parent written as `dependencies = { infantry_weapons = 1 }`");
      // OR requirement expressed as an allow/has_tech gate over both parents.
      ok(/allow\s*=\s*\{[\s\S]*?OR\s*=\s*\{[\s\S]*?has_tech\s*=\s*infantry_weapons\b[\s\S]*?has_tech\s*=\s*infantry_weapons1[\s\S]*?\}/.test(txt),
         "OR parents written as `allow = { OR = { has_tech = ... } }`");
      // Round-trips: re-parsing the saved file still recovers the requirements (dependencies/allow read back).
      const all2 = await getAll();
      const rifle2 = all2.find((t) => t.id === "custom_rifle");
      ok(rifle2 && (rifle2.dependencies || []).includes("infantry_weapons"), "AND dependency reads back after save", rifle2 && rifle2.dependencies);
    }
  } catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
  finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    process.exitCode = fail ? 1 : 0;
    server.closeAllConnections && server.closeAllConnections();
    server.close();
  }
  console.log(`\n  ${pass} passed, ${fail} failed`);
})();
