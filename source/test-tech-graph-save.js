// Regression guard: saving a SUBSET of techs (as the editor does when you move/edit one node) must
// NOT drop a re-serialized parent's `path` edges to its OTHER, unsaved children. Re-serializing a
// parent regenerates its paths from the catalog; if save-batch only knows the saved subset, the
// parent loses its path to any sibling not in that subset — silently breaking the tree. This caught
// exactly that: moving childB dropped parentA -> childC.
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3496, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-graph-"));
  fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Graph Save Test"\n', "utf8");
  // parentA -> childB and parentA -> childC, edges stored ONLY on the parent's path (childB/childC have
  // no own prerequisite block — so dropping a path deletes the edge entirely). Plus childD whose edge
  // is ALSO stored on the child (prerequisite) to confirm that variant survives too.
  fs.writeFileSync(path.join(mod, "common", "technologies", "custom.txt"),
    "technologies = {\n" +
    "\tparentA = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t\tpath = { leads_to_tech = childB }\n\t\tpath = { leads_to_tech = childC }\n\t\tpath = { leads_to_tech = childD }\n\t}\n" +
    "\tchildB = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 1 y = 2 } }\n\t}\n" +
    "\tchildC = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = -1 y = 2 } }\n\t}\n" +
    "\tchildD = {\n\t\tprerequisite = { parentA = 0 }\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 3 y = 2 } }\n\t}\n" +
    "}\n", "utf8");
  return mod;
}

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  const file = path.join(mod, "common", "technologies", "custom.txt");
  try {
    const techs = (await (await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`)).json()).technologies || [];
    const A = techs.find((t) => t.id === "parentA");
    const B = techs.find((t) => t.id === "childB");
    ok(!!A && Array.isArray(A.leadsTo) && A.leadsTo.includes("childC"), "parentA parses with a path to childC");
    // Simulate moving childB: the editor saves the moved child + its prerequisite-parent (parentA), but
    // NOT the siblings childC / childD.
    const res = await fetch(`${BASE}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, technologies: [A, B].filter(Boolean), equipments: {} }),
    });
    ok((await res.json()).ok !== false, "save-batch succeeds");
    const w = fs.readFileSync(file, "utf8");
    ok(/leads_to_tech\s*=\s*childB/.test(w), "parentA -> childB path kept (the moved child)");
    ok(/leads_to_tech\s*=\s*childC/.test(w), "parentA -> childC path kept (unsaved sibling — THE BUG)");
    ok(/leads_to_tech\s*=\s*childD/.test(w), "parentA -> childD path kept (unsaved sibling)");
    // childD's own prerequisite block is untouched (childD wasn't re-serialized), so its edge is doubly safe.
    ok(/childD\s*=\s*\{[\s\S]*?prerequisite\s*=\s*\{\s*parentA/.test(w), "childD's own prerequisite on parentA survives");
    // Re-parse: the whole A->{B,C,D} graph is still intact.
    const techs2 = (await (await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`)).json()).technologies || [];
    const A2 = techs2.find((t) => t.id === "parentA");
    ok(A2 && ["childB", "childC", "childD"].every((c) => (A2.leadsTo || []).includes(c)), "all three edges round-trip", A2 && A2.leadsTo);
  } catch (e) { ok(false, "threw: " + e.message); }
  finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    server.close();
  }
  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
