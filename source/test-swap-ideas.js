// Verifies swap_ideas validation: in `swap_ideas = { remove_idea = X add_idea = Y }`, Y must exist
// (broken_reference if missing) AND counts as a grant (so an idea added only via a swap is NOT a false
// orphan_spirit). The removed idea is not validated. Fully isolated: no vanillaRoot / dependencyRoots.
const fs = require("fs");
const os = require("os");
const path = require("path");
const mi = require("./mod-index.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// ---- Unit: extractRefs captures add_idea (singular) but not add_ideas (plural) ----
const refs = mi.extractRefs(`
  completion_reward = {
    add_ideas = { some_plural_idea }
    swap_ideas = { remove_idea = idea_old add_idea = idea_new }
  }
`);
const swapAdds = refs.filter(r => r.context === "swap_add_idea").map(r => r.id);
check("captures add_idea as a swap_add_idea/idea ref", swapAdds.includes("idea_new"), JSON.stringify(refs));
check("does NOT capture the plural add_ideas token as a swap_add_idea", !swapAdds.includes("some_plural_idea"), JSON.stringify(swapAdds));
check("does NOT capture the removed idea as swap_add_idea", !swapAdds.includes("idea_old"), JSON.stringify(swapAdds));
check("swap_add_idea ref is typed as an idea", refs.some(r => r.context === "swap_add_idea" && r.type === "idea"), JSON.stringify(refs));

// ---- Integration ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-swapideas-"));
try {
  fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="Swap Test"\n', "utf8");
  fs.mkdirSync(path.join(tmp, "common", "ideas"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "common", "ideas", "custom.txt"), `ideas = {
  country = {
    idea_swapped = { picture = generic removal_cost = -1 }
  }
}
`, "utf8");
  fs.mkdirSync(path.join(tmp, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "common", "national_focus", "tree.txt"), `focus_tree = {
  id = test_tree
  focus = {
    id = f_swap
    completion_reward = {
      swap_ideas = { remove_idea = idea_old add_idea = idea_swapped }
      swap_ideas = { remove_idea = idea_old2 add_idea = ghost_idea }
    }
    x = 0 y = 0 cost = 1
  }
}
`, "utf8");

  const { problems } = mi.buildModIndex(tmp, {}); // no vanilla/deps -> isolated
  const brokenIdeas = problems.filter(p => p.rule === "broken_reference" && p.refContext === "swap_add_idea").map(p => p.refId);
  const orphans = problems.filter(p => p.rule === "orphan_spirit").map(p => p.entityId);

  check("flags a swap that adds a missing idea (ghost_idea)", brokenIdeas.includes("ghost_idea"), JSON.stringify(brokenIdeas));
  check("does NOT flag a swap that adds an existing idea (idea_swapped)", !brokenIdeas.includes("idea_swapped"), JSON.stringify(brokenIdeas));
  check("an idea granted ONLY via swap_ideas is NOT a false orphan_spirit", !orphans.includes("idea_swapped"), JSON.stringify(orphans));
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\nSWAP-IDEAS TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
