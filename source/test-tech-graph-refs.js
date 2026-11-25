// Verifies the tech-graph broken_reference lint: a tech whose prerequisite / xor / dependencies /
// sub_technologies points at a tech that exists nowhere (mod, dependency, or vanilla) is flagged,
// while valid links (and the OR/AND keywords + numeric = 0/= 1 values inside those blocks) are not.
// Fully isolated: no vanillaRoot / dependencyRoots, so known() == the mod's own ids only.
const fs = require("fs");
const os = require("os");
const path = require("path");
const mi = require("./mod-index.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// ---- Unit: extractTechGraphRefs flattening ----
const refs = mi.extractTechGraphRefs(`
  prerequisite = { tech_a = 0 }
  prerequisite = { OR = { tech_b ghost_or } }
  xor = { tech_c ghost_xor }
  dependencies = { tech_a = 1 ghost_dep = 1 }
  sub_technologies = { tech_sub ghost_sub }
  enable_equipments = { limit = { has_dlc = "Man the Guns" } eq_real eq_ghost }
  folder = { name = infantry_folder position = { x = 0 y = 0 } }
`);
const techIds = refs.filter(r => r.type === "tech").map(r => r.id);
const eqIds = refs.filter(r => r.type === "equipment").map(r => r.id);
check("extracts prerequisite tech id (with = 0 value stripped)", techIds.includes("tech_a"), JSON.stringify(techIds));
check("flattens prerequisite OR block to its tech ids", techIds.includes("tech_b") && techIds.includes("ghost_or"), JSON.stringify(techIds));
check("extracts xor + dependencies + sub_technologies ids", techIds.includes("tech_c") && techIds.includes("ghost_dep") && techIds.includes("ghost_sub"), JSON.stringify(techIds));
check("does NOT emit OR/AND/NOT keywords as tech ids", !techIds.includes("OR") && !techIds.includes("AND") && !techIds.includes("NOT"), JSON.stringify(techIds));
check("does NOT emit numeric = 0 / = 1 values as tech ids", !techIds.includes("0") && !techIds.includes("1"), JSON.stringify(techIds));
check("enable_equipments emits equipment-typed refs (not tech)", !techIds.includes("eq_real") && eqIds.includes("eq_real") && eqIds.includes("eq_ghost"), JSON.stringify(refs));
check("strips the enable_equipments DLC limit gate (no limit/has_dlc/dlc-name ids)", !eqIds.includes("limit") && !eqIds.includes("has_dlc") && !eqIds.some(s => /^Man$/i.test(s)), JSON.stringify(eqIds));

// ---- Integration: full buildModIndex broken_reference rule ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-techgraph-"));
try {
  fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="Graph Test"\n', "utf8");
  fs.mkdirSync(path.join(tmp, "common", "technologies"), { recursive: true });
  // tech_a exists; tech_b requires tech_a (ok) + ghost_pre (missing); tech_c xor ghost_x (missing).
  fs.writeFileSync(path.join(tmp, "common", "technologies", "custom.txt"), `technologies = {
  tech_a = {
    research_cost = 1
    start_year = 1936
    folder = { name = infantry_folder position = { x = 0 y = 0 } }
  }
  tech_b = {
    prerequisite = { tech_a = 0 }
    prerequisite = { ghost_pre }
    research_cost = 1
    start_year = 1936
    folder = { name = infantry_folder position = { x = 0 y = 2 } }
  }
  tech_c = {
    xor = { ghost_x }
    research_cost = 1
    start_year = 1936
    folder = { name = infantry_folder position = { x = 2 y = 0 } }
  }
  tech_d = {
    enable_equipments = { limit = { has_dlc = "Man the Guns" } eq_real eq_ghost }
    research_cost = 1
    start_year = 1936
    folder = { name = infantry_folder position = { x = 4 y = 0 } }
  }
}
`, "utf8");
  // An equipment archetype the tech can legitimately enable.
  fs.mkdirSync(path.join(tmp, "common", "units", "equipment"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "common", "units", "equipment", "custom_eq.txt"), `equipments = {
  eq_real = { year = 1936 is_archetype = yes }
}
`, "utf8");
  // A focus whose `prerequisite = { focus = X }` must NOT be misread as a tech ref.
  fs.mkdirSync(path.join(tmp, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "common", "national_focus", "tree.txt"), `focus_tree = {
  id = test_tree
  focus = { id = f_root x = 0 y = 0 cost = 1 }
  focus = { id = f_child prerequisite = { focus = f_root } x = 0 y = 1 cost = 1 }
}
`, "utf8");

  const { problems } = mi.buildModIndex(tmp, {}); // no vanilla/deps → isolated
  const broken = problems.filter(p => p.rule === "broken_reference" && p.refType === "tech");
  const brokenIds = broken.map(p => p.refId);

  check("flags a missing prerequisite tech (ghost_pre)", brokenIds.includes("ghost_pre"), JSON.stringify(brokenIds));
  check("flags a missing xor tech (ghost_x)", brokenIds.includes("ghost_x"), JSON.stringify(brokenIds));
  check("does NOT flag a valid prerequisite (tech_a exists)", !brokenIds.includes("tech_a"), JSON.stringify(brokenIds));
  check("the ghost_pre problem is attributed to tech_b", broken.some(p => p.refId === "ghost_pre" && p.entityId === "tech_b"), JSON.stringify(broken.map(p => [p.entityId, p.refId])));
  check("a focus's prerequisite={focus=...} is NOT misread as a tech ref", !brokenIds.includes("f_root"), JSON.stringify(brokenIds));

  const brokenEq = problems.filter(p => p.rule === "broken_reference" && p.refType === "equipment").map(p => p.refId);
  check("flags a tech enabling a missing equipment (eq_ghost)", brokenEq.includes("eq_ghost"), JSON.stringify(brokenEq));
  check("does NOT flag a valid enabled equipment (eq_real exists)", !brokenEq.includes("eq_real"), JSON.stringify(brokenEq));
  check("does NOT flag the DLC limit gate keys as missing equipment", !brokenEq.includes("limit") && !brokenEq.includes("has_dlc"), JSON.stringify(brokenEq));
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\nTECH-GRAPH-REFS TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
