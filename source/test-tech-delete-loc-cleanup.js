// Regression: deleting a technology must strip its localization (name + _desc) AND its equipment's name
// from the loc .yml — persistTechnologySave writes <techId>:0 / <techId>_desc:0 / <equipId>:0 into
// custom_technologies_l_english.yml, but the delete paths only removed the .txt block, ORPHANING the loc
// (same class as the focus/idea deletes). TWO delete paths: /api/technologies/delete AND the one the UI
// actually uses, /api/technologies/save-batch (deletions are deferred and applied on Save). The strip is
// anchored, so zztest_tech deletion must NOT take the prefix-sharing sibling zztest_tech_keep, and a
// deleted-then-recreated id in the same batch must KEEP its (fresh) loc. Found by deep UI testing.
// Run: node test-tech-delete-loc-cleanup.js
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");
const PORT = 3499, BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log("  ✓ " + m); } else { fail++; console.log("  ✗ FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const post = (e, o) => fetch(BASE + e, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(o) }).then((r) => r.json());

function setupMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-techloc-"));
  mk(path.join(mod, "descriptor.mod"), 'name="TechLoc"\n');
  mk(path.join(mod, "common", "technologies", "custom_technologies.txt"),
    "technologies = {\n" +
    "\tzztest_tech = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }\n\t}\n" +
    "\tzztest_tech_keep = {\n\t\tresearch_cost = 1\n\t\tstart_year = 1936\n\t\tfolder = { name = infantry_folder position = { x = 0 y = 1 } }\n\t}\n" +
    "}\n");
  mk(path.join(mod, "common", "units", "equipment", "custom_equipment.txt"),
    "equipments = {\n\tzztest_equip = {\n\t\tyear = 1936\n\t\tis_archetype = yes\n\t\ttype = infantry\n\t}\n}\n");
  const locFile = path.join(mod, "localisation", "english", "custom_technologies_l_english.yml");
  mk(locFile,
    "﻿l_english:\n" +
    ' zztest_tech:0 "Test Tech"\n' +
    ' zztest_tech_desc:0 "A test technology."\n' +
    ' zztest_tech_keep:0 "Keep Tech (sibling)"\n' +
    ' zztest_equip:0 "Test Equipment"\n');
  return { mod, locFile };
}

(async () => {
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mods = [];
  try {
    // ── Scenario A: /api/technologies/delete (direct delete endpoint) ──
    console.log("=== /api/technologies/delete ===");
    { const { mod, locFile } = setupMod(); mods.push(mod);
      const r = await post("/api/technologies/delete", {
        modPath: mod, techId: "zztest_tech", techFile: "custom_technologies.txt",
        equipId: "zztest_equip", equipFile: "custom_equipment.txt",
      });
      ok(r.ok, "delete ok", r);
      const techTxt = fs.readFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"), "utf8");
      ok(!/zztest_tech\s*=\s*\{/.test(techTxt), "tech block removed from .txt");
      ok(/zztest_tech_keep\s*=\s*\{/.test(techTxt), "sibling tech block preserved in .txt");
      const equipTxt = fs.readFileSync(path.join(mod, "common", "units", "equipment", "custom_equipment.txt"), "utf8");
      ok(!/zztest_equip\s*=\s*\{/.test(equipTxt), "equipment block removed from .txt");
      const loc = fs.readFileSync(locFile, "utf8");
      ok(!/zztest_tech:0/.test(loc), "tech name loc stripped (no orphan)");
      ok(!/zztest_tech_desc:0/.test(loc), "tech _desc loc stripped (no orphan)");
      ok(!/zztest_equip:0/.test(loc), "equipment name loc stripped (no orphan)");
      ok(/zztest_tech_keep:0/.test(loc), "the prefix-sharing SIBLING loc survives (anchored)");
      ok(/^﻿?l_english:/m.test(loc), "the l_english header is intact after strip");
    }

    // ── Scenario B: /api/technologies/save-batch with deferred deletions (the PATH THE UI USES) ──
    console.log("=== /api/technologies/save-batch (deferred deletion — the UI path) ===");
    { const { mod, locFile } = setupMod(); mods.push(mod);
      const r = await post("/api/technologies/save-batch", {
        modPath: mod, technologies: [], equipments: {}, deletions: [
          { techId: "zztest_tech", techFile: "custom_technologies.txt", equipId: "zztest_equip", equipFile: "custom_equipment.txt" },
        ],
      });
      ok(r.ok, "save-batch ok", r);
      const techTxt = fs.readFileSync(path.join(mod, "common", "technologies", "custom_technologies.txt"), "utf8");
      ok(!/zztest_tech\s*=\s*\{/.test(techTxt), "tech block removed via save-batch");
      ok(/zztest_tech_keep\s*=\s*\{/.test(techTxt), "sibling tech preserved via save-batch");
      const loc = fs.readFileSync(locFile, "utf8");
      ok(!/zztest_tech:0/.test(loc), "tech name loc stripped via save-batch (no orphan)");
      ok(!/zztest_tech_desc:0/.test(loc), "tech _desc loc stripped via save-batch (no orphan)");
      ok(!/zztest_equip:0/.test(loc), "equipment loc stripped via save-batch (no orphan)");
      ok(/zztest_tech_keep:0/.test(loc), "sibling loc preserved via save-batch");
    }
  } catch (e) { ok(false, "threw: " + e.message + "\n" + e.stack); }
  finally {
    mods.forEach((m) => { try { fs.rmSync(m, { recursive: true, force: true }); } catch (_) {} });
    console.log(`\n  ${pass} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
})();
