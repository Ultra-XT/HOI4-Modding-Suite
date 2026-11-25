// Deleting a tech takes out the gridbox NOVA wrote for it (#delete-own-gridbox).
//
// A tech renders through a gridbox named after it, and Nova writes one for every tech created in the
// editor — inside its own `# >>> NOVA_NEW_TECH_GRIDBOXES` sentinel. Deleting the tech left that gridbox
// behind, naming an id that no longer exists.
//
// An orphaned gridbox is inert; Millennium Dawn ships three of its own, which is exactly why a modder's
// gridboxes are left strictly alone. The distinction is ownership: this one is Nova's litter, sitting in
// Nova's managed block, so cleaning it up is safe in a way that editing theirs is not. The search is
// confined to that sentinel region and gives up if the tech isn't in it.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { createApp } = require("./server.js");

let pass = 0, total = 0;
const ok = (n, c, x) => { total++; if (c) { pass++; console.log("  ok  " + n); } else console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); };

const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-delgb-"));
fs.writeFileSync(path.join(mod, "descriptor.mod"), 'name="DelGridbox"\nsupported_version="1.19.*"\n');
const tdir = path.join(mod, "common", "technologies");
fs.mkdirSync(tdir, { recursive: true });
fs.writeFileSync(path.join(tdir, "probe.txt"), [
  "technologies = {",
  "\tkeep_me = {",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tfolder = { name = infantry_folder position = { x = 0 y = 0 } }",
  "\t}",
  "\tdoomed = {",
  "\t\tresearch_cost = 1",
  "\t\tstart_year = 1936",
  "\t\tfolder = { name = infantry_folder position = { x = 2 y = 0 } }",
  "\t}",
  "}",
  "",
].join("\n"));

// A gui with the mod's OWN gridbox plus Nova's managed block holding one for each fixture tech.
const GUI = path.join(mod, "interface", "countrytechtreeview.gui");
fs.mkdirSync(path.dirname(GUI), { recursive: true });
const gb = (name, indent) => [
  `${indent}gridboxtype = {`,
  `${indent}\tname = "${name}"`,
  `${indent}\tposition = { x = 140 y = 325 }`,
  `${indent}\tslotsize = { width = 70 height = 70 }`,
  `${indent}\tformat = "LEFT"`,
  `${indent}}`,
].join("\n");
const ORIGINAL = [
  "guiTypes = {",
  "\tcontainerWindowType = {",
  '\t\tname = "countrytechtreeview"',
  "\t\tcontainerWindowType = {",
  '\t\t\tname = "infantry_folder"',
  gb("the_mods_own_tree", "\t\t\t"),           // the modder's — must never be touched
  "\t\t\t# >>> NOVA_NEW_TECH_GRIDBOXES (gridboxes for techs added in Nova — safe to edit or move)",
  gb("doomed_tree", "\t\t\t\t"),
  gb("keep_me_tree", "\t\t\t\t"),
  "\t\t\t# <<< NOVA_NEW_TECH_GRIDBOXES",
  "\t\t}",
  "\t}",
  "}",
  "",
].join("\n");
fs.writeFileSync(GUI, ORIGINAL, "utf8");

const gui = () => fs.readFileSync(GUI, "utf8");
const balanced = () => { const s = gui().replace(/#.*$/gm, ""); return (s.match(/\{/g) || []).length === (s.match(/\}/g) || []).length; };

const PORT = 39582, app = createApp();
const server = app.listen(PORT, async () => {
  const del = (deletions) => fetch(`http://127.0.0.1:${PORT}/api/technologies/save-batch`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ technologies: [], equipments: {}, customTabs: [], modPath: mod, countryTag: null, countryTechIds: null, deletions, newTechIds: [] }),
  }).then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
  try {
    ok("the fixture gui has all three gridboxes", gui().includes('"doomed_tree"') && gui().includes('"keep_me_tree"') && gui().includes('"the_mods_own_tree"'));

    const r = await del([{ techId: "doomed", techFile: "probe.txt" }]);
    ok("delete → 200", r.s === 200, r.b);
    ok("the deleted tech's gridbox is gone (the fix)", !gui().includes('"doomed_tree"'), gui());
    ok("the OTHER Nova gridbox is untouched", gui().includes('"keep_me_tree"'), gui());
    ok("the MODDER's own gridbox is untouched", gui().includes('"the_mods_own_tree"'), gui());
    ok("Nova's sentinel block still exists", /NOVA_NEW_TECH_GRIDBOXES/.test(gui()));
    ok("the gui is still brace-balanced", balanced(), gui());
    ok("the tech block itself is gone", !/\n\tdoomed\s*=\s*\{/.test(fs.readFileSync(path.join(tdir, "probe.txt"), "utf8")));
    ok("the surviving tech is still defined", /\n\tkeep_me\s*=\s*\{/.test(fs.readFileSync(path.join(tdir, "probe.txt"), "utf8")));

    // a tech with no Nova gridbox must leave the gui completely alone
    const before = gui();
    const r2 = await del([{ techId: "keep_me", techFile: "probe.txt" }]);
    ok("second delete → 200", r2.s === 200, r2.b);
    ok("its gridbox goes too", !gui().includes('"keep_me_tree"'));
    const before3 = gui();
    const r3 = await del([{ techId: "never_existed", techFile: "probe.txt" }]);
    ok("deleting an unknown tech → 200", r3.s === 200, r3.b);
    ok("a tech with no Nova gridbox leaves the gui byte-identical", gui() === before3, gui());
    ok("the modder's gridbox survived every delete", gui().includes('"the_mods_own_tree"'));

    console.log(`\ntest-research-delete-gridbox: ${pass}/${total} checks passed`);
  } catch (e) {
    console.error("ERROR", e);
  } finally {
    process.exitCode = pass === total && total >= 13 ? 0 : 1;
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
    try { server.closeAllConnections(); } catch (_) {}
    server.close();
  }
});
server.on("error", (e) => { console.error("listen error:", e.message); process.exit(1); });
