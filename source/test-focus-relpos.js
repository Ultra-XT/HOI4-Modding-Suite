// Verifies the relative_position_id broken_reference lint: a focus positioned relative to a focus that
// exists nowhere (mod / dependency / vanilla) is flagged, while a valid anchor (and a self/sibling
// anchor that exists) is not. Fully isolated: no vanillaRoot / dependencyRoots.
const fs = require("fs");
const os = require("os");
const path = require("path");
const mi = require("./mod-index.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// ---- Unit: extractRefs captures relative_position_id as a focus ref ----
const refs = mi.extractRefs(`
  id = f_child
  relative_position_id = f_anchor
  x = 2 y = 0
  cost = 1
`);
const rel = refs.filter(r => r.context === "relative_position_id");
check("extractRefs emits a relative_position_id focus ref", rel.length === 1 && rel[0].type === "focus" && rel[0].id === "f_anchor", JSON.stringify(refs));

// ---- Integration: broken_reference fires only for a missing anchor ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-relpos-"));
try {
  fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="RelPos Test"\n', "utf8");
  fs.mkdirSync(path.join(tmp, "common", "national_focus"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "common", "national_focus", "tree.txt"), `focus_tree = {
  id = test_tree
  focus = { id = f_anchor x = 0 y = 0 cost = 1 }
  focus = {
    id = f_ok
    relative_position_id = f_anchor
    x = 1 y = 0 cost = 1
  }
  focus = {
    id = f_bad
    relative_position_id = ghost_anchor
    x = 2 y = 0 cost = 1
  }
}
`, "utf8");

  const { problems } = mi.buildModIndex(tmp, {}); // no vanilla/deps -> isolated
  const broken = problems.filter(p => p.rule === "broken_reference" && p.refContext === "relative_position_id");
  const brokenIds = broken.map(p => p.refId);

  check("flags a focus anchored to a missing focus (ghost_anchor)", brokenIds.includes("ghost_anchor"), JSON.stringify(brokenIds));
  check("does NOT flag a focus anchored to an existing focus (f_anchor)", !brokenIds.includes("f_anchor"), JSON.stringify(brokenIds));
  check("the ghost_anchor problem is attributed to f_bad", broken.some(p => p.refId === "ghost_anchor" && p.entityId === "f_bad"), JSON.stringify(broken.map(p => [p.entityId, p.refId])));
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

console.log(`\nFOCUS-RELPOS TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
