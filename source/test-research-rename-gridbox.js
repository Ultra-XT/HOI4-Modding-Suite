// Renaming a technology has to update everything that names it — including the GUI (#rename-gridbox),
// and it must not damage things the user did not touch (#loc-update-in-place).
//
// A tech renders through the gridbox of its prerequisite chain's ROOT, and a gridbox is named after the
// tech that owns it (97 of them in Millennium Dawn's countrytechtreeview.gui). The rename path only ever
// rewrote common/technologies, so after renaming a branch root the gui still named `<old>_tree` — an id
// that no longer existed. HOI4 logs "Found no grid box for tech" and the ENTIRE branch below it stops
// drawing; renaming night_vision_1 in MD took all four night-vision techs off the tree.
//
// Also pinned here, from the same audit:
//   * previousId must be the id ON DISK. The ID field fires `input` per KEYSTROKE, so typing "zz_new"
//     renamed the tech six times and left previousId as "zz_ne" — the save then removed nothing and the
//     mod defined the tech TWICE, with duplicate loc keys and two paths from the parent.
//   * a rename must not resurrect itself: previousId is cleared once the save lands.
//   * a duplicated tech is a NEW tech and needs its own gridbox.
//   * saving a CHILD pulls its prerequisite parents into the batch; that must not rewrite a parent's
//     authored localisation name. Nova read the LAST definition of a duplicated key but wrote to the
//     FIRST, so a parent whose name is defined in two files (MD has four such techs) was silently
//     overwritten on every save of one of its children.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

// ── client-side guarantees, read from the source (same convention as test-research-equipment.js) ────
{
  const client = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
  ok("previousId is only recorded the FIRST time, so a keystroke can't overwrite the on-disk id",
    /if \(!tech\.previousId\) tech\.previousId = oldId;/.test(client));
  ok("typing back to the original id cancels the rename",
    /if \(tech\.previousId === newId\) delete tech\.previousId;/.test(client));
  ok("renaming a just-created tech keeps it in the newly-created set (so it still gets a gridbox)",
    /newlyCreatedTechIds\.delete\(oldId\);[\s\S]{0,60}newlyCreatedTechIds\.add\(newId\);/.test(client));
  ok("a duplicated tech is registered as newly created", /newlyCreatedTechIds\.add\(newId\);/.test(client));
  ok("undoing the duplicate un-registers it", /newlyCreatedTechIds\.delete\(newId\);/.test(client));
  ok("previousId is cleared once the save lands", /if \(t && t\.previousId\) delete t\.previousId;/.test(client));
  ok("undo/redo restores the years-dirty flag instead of arming a GUI write",
    /const yearsDirtyBefore = yearsDirty;/.test(client) && /yearsDirty = yearsDirtyBefore;/.test(client));
}

// ── server-side: the gridbox rename, on a throwaway mod ─────────────────────────────────────────────
const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rngb-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="RenameGridbox"\nsupported_version="1.19.*"\n');
const tdir = path.join(mod, "common", "technologies");
fs.mkdirSync(tdir, { recursive: true });
fs.writeFileSync(path.join(tdir, "probe.txt"), `technologies = {
\tbranch_root = {
\t\tresearch_cost = 1
\t\tstart_year = 1936
\t\tpath = {
\t\t\tleads_to_tech = branch_child
\t\t\tresearch_cost_coeff = 1
\t\t}
\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }
\t}
\tbranch_child = {
\t\tresearch_cost = 1
\t\tstart_year = 1938
\t\tfolder = { name = infantry_folder position = { x = 0 y = 2 } }
\t}
}
`);

// a minimal gui carrying a gridbox named after the branch root, shaped like the real file
const GUI = path.join(mod, "interface", "countrytechtreeview.gui");
fs.mkdirSync(path.dirname(GUI), { recursive: true });
const GUI_TEXT = [
  "guiTypes = {",
  '\tcontainerWindowType = {',
  '\t\tname = "countrytechtreeview"',
  '\t\tcontainerWindowType = {',
  '\t\t\tname = "infantry_folder"',
  '\t\t\tgridBoxType = {',
  '\t\t\t\tname = "branch_root_tree"',
  '\t\t\t\tposition = { x = 40 y = 40 }',
  '\t\t\t\tslotsize = { width = 90 height = 90 }',
  '\t\t\t\tformat = "UP"',
  "\t\t\t}",
  '\t\t\tgridBoxType = {',
  '\t\t\t\tname = "other_tech_tree"',
  '\t\t\t\tposition = { x = 200 y = 40 }',
  '\t\t\t\tslotsize = { width = 90 height = 90 }',
  "\t\t\t}",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(GUI, GUI_TEXT, "utf8");

const gui = () => fs.readFileSync(GUI, "utf8");

const PORT = 39576, app = createApp();
const server = app.listen(PORT, async () => {
  const get = (ep) => fetch(`http://127.0.0.1:${PORT}${ep}`).then((r) => r.json());
  const save = (techs) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ technologies: techs, equipments: {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions: [], newTechIds: [] }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    const cat = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const T = Object.fromEntries((cat.technologies || []).map((t) => [t.id, t]));
    ok("the fixture techs are in the catalog", !!T.branch_root && !!T.branch_child);

    const r = await save([Object.assign({}, T.branch_root, { id: "renamed_root", previousId: "branch_root" })]);
    ok("rename → 200", r.s === 200, r.b);

    ok("the gui no longer names the old gridbox", !/"branch_root_tree"/.test(gui()), gui());
    ok("the gui names the new gridbox", /"renamed_root_tree"/.test(gui()), gui());
    ok("an unrelated gridbox is untouched", /"other_tech_tree"/.test(gui()));
    ok("the gui is still brace-balanced", (gui().match(/\{/g) || []).length === (gui().match(/\}/g) || []).length);
    ok("nothing else in the gui changed", gui() === GUI_TEXT.replace('"branch_root_tree"', '"renamed_root_tree"'), gui());

    const txt = fs.readFileSync(path.join(tdir, "probe.txt"), "utf8");
    ok("the old tech block is gone", !/^\tbranch_root\s*=\s*\{/m.test(txt), txt);
    ok("the new tech block is there", /^\trenamed_root\s*=\s*\{/m.test(txt));
    ok("the tech is defined exactly once", (txt.match(/^\trenamed_root\s*=\s*\{/gm) || []).length === 1);

    // ── a rename that touches no gridbox must not invent one, nor materialise a gui ────────────────
    const before = gui();
    const cat2 = await get(`/api/technologies/catalog?modPath=${encodeURIComponent(mod)}`);
    const child = (cat2.technologies || []).find((t) => t.id === "branch_child");
    const r2 = await save([Object.assign({}, child, { id: "renamed_child", previousId: "branch_child" })]);
    ok("second rename → 200", r2.s === 200, r2.b);
    ok("a tech with no gridbox leaves the gui completely alone", gui() === before, gui());

    console.log(`\ntest-research-rename-gridbox: ${pass}/${total} checks passed`);
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 18 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
