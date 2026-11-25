// Regression: a FOLDERLESS technology must NOT gain a folder on save. Millennium Dawn ships folderless techs
// (e.g. `rangers` — a sub-unit enabler shown in NO research tree: just enable_subunits + allow, no folder block).
// serializeTechnology used to write `folder = { name = infantry_folder ... }` for any tech with no folder, which
// would silently drop all 68 of MD's folderless techs into the infantry research tree in-game. Found by round-
// tripping all 984 MD techs through save-batch. Run: node test-tech-folderless-roundtrip.js
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3495, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-folderless-"));
  fs.mkdirSync(path.join(mod, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="Folderless Test"\n', "utf8");
  fs.writeFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"),
    "technologies = {\n" +
    // FOLDERLESS — like MD's rangers: enabled, but shown in no tree (no folder block).
    "\ttest_folderless = {\n" +
    "\t\tenable_subunits = { test_subunit }\n" +
    "\t\tallow = { always = yes }\n" +
    "\t}\n" +
    // A normal foldered tech (control — its folder must still round-trip).
    "\ttest_foldered = {\n" +
    "\t\tresearch_cost = 1\n" +
    "\t\tstart_year = 1936\n" +
    "\t\tfolder = { name = infantry_folder position = { x = 3 y = 5 } }\n" +
    "\t}\n}\n", "utf8");
  return mod;
}

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = setupMod();
  const getTech = async (id) => {
    const j = await fetch(`${BASE}/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    return (j.technologies || []).find((t) => t.id === id);
  };
  try {
    const f1 = await getTech("test_folderless");
    const d1 = await getTech("test_foldered");
    ok(f1 && !f1.folder, "folderless tech parses with no folder", f1 && f1.folder);
    ok(d1 && d1.folder === "infantry_folder", "foldered control parses with its folder", d1 && d1.folder);
    await fetch(`${BASE}/api/technologies/save-batch`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modPath: mod, technologies: [f1, d1], equipments: {} }),
    });
    const f2 = await getTech("test_folderless");
    const d2 = await getTech("test_foldered");
    ok(f2 && !f2.folder, "folderless tech STAYS folderless after save (not dropped into infantry_folder)", f2 && f2.folder);
    ok(d2 && d2.folder === "infantry_folder" && d2.x === 3 && d2.y === 5, "foldered control keeps its folder + position", d2 && [d2.folder, d2.x, d2.y]);
    // Prove it at the bytes: the written folderless block contains NO folder block.
    const written = fs.readFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"), "utf8");
    const block = (written.match(/\n\ttest_folderless = \{[\s\S]*?\n\t\}/) || [""])[0];
    ok(block && !/folder\s*=\s*\{/.test(block), "no folder block written into the folderless tech", block);
    ok(/enable_subunits/.test(block), "the folderless tech's real content (enable_subunits) is preserved", block);
    // And the foldered one DID get exactly one folder block.
    const dblock = (written.match(/\n\ttest_foldered = \{[\s\S]*?\n\t\}/) || [""])[0];
    ok((dblock.match(/folder\s*=\s*\{/g) || []).length === 1, "foldered tech still writes exactly one folder block");
  } catch (e) { ok(false, "threw: " + e.message); }
  finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} server.close(); }
  console.log(`\n  ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
