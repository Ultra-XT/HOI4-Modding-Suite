// injectGridboxesIntoFolderContainer drops the Nova-managed gridbox block INTO a specific research
// folder container in countrytechtreeview.gui. The existing gridbox test only covers the empty-block
// "clear" path; this locks the rest: it throws a helpful error when the named container is missing
// (so the UI can tell the modder to create the tab first), inserts the block INSIDE the right
// container (a sibling container is untouched), is idempotent (re-injecting strips the prior
// NOVA_GRIDBOXES region instead of stacking a second), and keeps the GUI brace-balanced.
"use strict";
const { injectGridboxesIntoFolderContainer } = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e !== undefined ? "→ " + JSON.stringify(e) : ""); } };
const balanced = (t) => { let d = 0; for (const c of t) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; };
const novaCount = (t) => (t.match(/# >>> NOVA_GRIDBOXES/g) || []).length;

const container = (name, inner) => `\tcontainerWindowType = {\n\t\tname = "${name}"\n\t\tposition = { x = 0 y = 0 }\n${inner || ""}\t}`;
const gui = [
  container("techtree_demo_folder", "\t\tsize = { width = 100 height = 100 }\n"),
  container("techtree_other_folder", "\t\tsize = { width = 50 height = 50 }\n"),
].join("\n\n");
const gbBlock = "\n\t\t\t# >>> NOVA_GRIDBOXES\n\t\t\tgridboxtype = { name = \"a_tree\" position = { x = 1 y = 2 } }\n\t\t\t# <<< NOVA_GRIDBOXES";

// --- Missing container → throws a helpful, actionable error. ---
let threw = false, msg = "";
try { injectGridboxesIntoFolderContainer(gui, "techtree_nonexistent", gbBlock); } catch (e) { threw = true; msg = e.message; }
check("throws when the folder container is absent", threw, msg);
check("error message is actionable (mentions it wasn't found)", /not found/i.test(msg), msg);

// --- Inserts the block INSIDE the named container; sibling container untouched. ---
const out = injectGridboxesIntoFolderContainer(gui, "techtree_demo_folder", gbBlock);
check("exactly one NOVA_GRIDBOXES region after inject", novaCount(out) === 1, novaCount(out));
const idxNova = out.indexOf("# >>> NOVA_GRIDBOXES");
const idxDemo = out.indexOf('name = "techtree_demo_folder"');
const idxOther = out.indexOf('name = "techtree_other_folder"');
check("gridboxes land inside the demo container (before the sibling)", idxNova > idxDemo && idxNova < idxOther, { idxDemo, idxNova, idxOther });
check("the sibling container is left intact", /name = "techtree_other_folder"[\s\S]*?size = \{ width = 50 height = 50 \}/.test(out));
check("output stays brace-balanced", balanced(out), "");

// --- Idempotent: re-injecting strips the prior region instead of stacking a second. ---
const out2 = injectGridboxesIntoFolderContainer(out, "techtree_demo_folder", gbBlock);
check("re-inject keeps exactly one NOVA_GRIDBOXES region", novaCount(out2) === 1, novaCount(out2));
check("re-inject stays brace-balanced", balanced(out2), "");

// --- Empty block clears the managed region (the documented clear path). ---
const cleared = injectGridboxesIntoFolderContainer(out, "techtree_demo_folder", "");
check("empty block clears the NOVA region", novaCount(cleared) === 0 && balanced(cleared), novaCount(cleared));

console.log(`\nINJECT-GRIDBOXES TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
