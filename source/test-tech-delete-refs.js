// Regression: deleting a tech must not leave a PARENT's `path = { leads_to_tech = <deleted> }` dangling
// (HOI4 logs "undefined technology" + draws a broken tree edge). The editor strips prereq/XOR/dependency refs
// client-side and re-saves those techs, but a parent's path is regenerated SERVER-side from the child list —
// so save-batch must drop a deleted tech from that catalog BEFORE regenerating, or the stale edge comes back.
// Found by testing the real save-batch deletion flow. Run: node test-tech-delete-refs.js
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3496, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const T = (id, x, extra) => `\t${id} = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = ${x} y = 0 } }\n${extra || ""}\t}\n`;

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-delref-"));
  fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="DELREF"\n', "utf8");
  const techFile = "custom_technologies.txt";
  const file = path.join(mod, "common", "technologies", techFile);
  // tech_a leads to BOTH tech_b and tech_c. Deleting tech_b must drop A→B but keep A→C.
  fs.writeFileSync(file,
    "technologies = {\n" +
    T("tech_a", 0, "\t\tpath = { leads_to_tech = tech_b }\n\t\tpath = { leads_to_tech = tech_c }\n") +
    T("tech_b", 1) +
    T("tech_c", 2) +
    "}\n", "utf8");
  const get = (e) => fetch(BASE + e).then((r) => r.json());
  const post = (e, o) => fetch(BASE + e, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).then((r) => r.json());
  try {
    const cat = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const A = (cat.technologies || []).find((t) => t.id === "tech_a");
    ok(!!A, "parent tech parses");
    // Editor flow: parent re-serialized (marked dirty) + deferred deletion of the child.
    const r = await post("/api/technologies/save-batch", { modPath: mod, technologies: [A], equipments: {}, deletions: [{ techId: "tech_b", techFile }] });
    ok(!r.error, "save-batch with deletion ok", r);
    const txt = fs.readFileSync(file, "utf8");
    ok(!/\btech_b\s*=\s*\{/.test(txt), "deleted tech_b block is gone");
    ok(!/leads_to_tech\s*=\s*tech_b/.test(txt), "parent's stale `leads_to_tech = tech_b` is DROPPED (no dangling edge)");
    ok(/leads_to_tech\s*=\s*tech_c/.test(txt), "parent's OTHER edge `leads_to_tech = tech_c` is PRESERVED");
    ok(/\btech_c\s*=\s*\{/.test(txt), "the untouched sibling tech_c is intact");
    // Re-reading the catalog, the parent now has exactly one outgoing edge (to C).
    const cat2 = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const A2 = (cat2.technologies || []).find((t) => t.id === "tech_a");
    const childCount = (txt.match(/leads_to_tech\s*=/g) || []).length;
    ok(childCount === 1, "parent ends with exactly one path edge", childCount);
    ok(A2 && !(cat2.technologies || []).find((t) => t.id === "tech_b"), "tech_b no longer in the catalog");
  } catch (e) { ok(false, "threw: " + e.message); }
  finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} server.close(); }
  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
