// Regression: deleting a custom research tab must fully remove it from the mod — the GUI tab button +
// viewport container + item templates AND the technology_folders entry — and re-home its techs. Before
// this, a tab "deleted" in the editor still showed in-game (its folder def + tab button lingered).
const fs = require("fs");
const os = require("os");
const path = require("path");
const server = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const braced = (t) => { let d = 0; for (const ch of t) { if (ch === "{") d++; else if (ch === "}") d--; if (d < 0) return false; } return d === 0; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-delfolder-"));
try {
  // A minimal-but-valid research GUI: a folder_tabs strip + a complete infantry item template to clone.
  const ifaceDir = path.join(tmp, "interface");
  fs.mkdirSync(ifaceDir, { recursive: true });
  const baseGui = [
    "guiTypes = {",
    "\tcontainerWindowType = {",
    "\t\tname = \"countrytechtreeview\"",
    "\t\tcontainerWindowType = {",
    "\t\t\tname = \"folder_tabs\"",
    "\t\t\tposition = { x = 0 y = 0 }",
    "\t\t}",
    "\t\tcontainerWindowType = {",
    "\t\t\tname = \"techtree_infantry_item\"",
    "\t\t\tposition = { x = 0 y = 0 }",
    "\t\t\tcontainerWindowType = { name = \"sub_technology_slot_0\" }",
    "\t\t}",
    "\t}",
    "}",
    "",
  ].join("\n");
  const guiPath = path.join(ifaceDir, "countrytechtreeview.gui");
  fs.writeFileSync(guiPath, baseGui, "utf8");

  // technology_folders with TWO custom folders so we can prove only the targeted one is removed.
  const tagDir = path.join(tmp, "common", "technology_tags");
  fs.mkdirSync(tagDir, { recursive: true });
  const folderFile = path.join(tagDir, "zz_nova_custom_folders.txt");
  fs.writeFileSync(folderFile, "technology_folders = {\n\tkeep_folder = {\n\t\tledger = army\n\t}\n\tdoomed_folder = {\n\t\tledger = navy\n\t}\n}\n", "utf8");

  // A tech that lives in doomed_folder (should be re-homed to infantry_folder on delete).
  const techDir = path.join(tmp, "common", "technologies");
  fs.mkdirSync(techDir, { recursive: true });
  const techFile = path.join(techDir, "t.txt");
  fs.writeFileSync(techFile,
    "technologies = {\n" +
    "\tmy_tech = {\n\t\tfolder = { name = doomed_folder\n\t\t\tposition = { x = 0 y = 2 } }\n\t}\n" +
    "}\n", "utf8");

  // 1. Inject the custom folder into the GUI (the create-tab path).
  const wrote = server.injectCustomFolderIntoTechTreeGui(tmp, "", "doomed_folder", "GFX_infantry_folder_tab");
  let gui = fs.readFileSync(guiPath, "utf8");
  check("inject wrote the GUI", wrote === true, String(wrote));
  check("after inject: container present", /name\s*=\s*"doomed_folder"/.test(gui), "");
  check("after inject: tab button present", /name\s*=\s*"doomed_folder_tab"/.test(gui), "");
  check("after inject: item template present", /name\s*=\s*"techtree_doomed_folder_item"/.test(gui), "");
  check("after inject: braces balanced", braced(gui), "");

  // 2. Re-home the techs, then strip the GUI + folder def (the delete-tab path).
  const rehomed = server.rehomeFolderTechs(tmp, "doomed_folder", "infantry_folder");
  const techTxt = fs.readFileSync(techFile, "utf8");
  check("rehome touched 1 file", rehomed === 1, String(rehomed));
  check("tech re-homed to infantry_folder", /name\s*=\s*infantry_folder/.test(techTxt) && !/name\s*=\s*doomed_folder/.test(techTxt), techTxt);

  const guiChanged = server.removeCustomFolderFromTechTreeGui(tmp, "doomed_folder");
  gui = fs.readFileSync(guiPath, "utf8");
  check("removeFromGui reported a change", guiChanged === true, String(guiChanged));
  check("after delete: container GONE", !/name\s*=\s*"doomed_folder"/.test(gui), "");
  check("after delete: tab button GONE", !/name\s*=\s*"doomed_folder_tab"/.test(gui), "");
  check("after delete: item template GONE", !/name\s*=\s*"techtree_doomed_folder_item"/.test(gui), "");
  check("after delete: braces balanced", braced(gui), "");
  // The base blocks must survive untouched.
  check("base folder_tabs survives", /name\s*=\s*"folder_tabs"/.test(gui), "");
  check("base infantry item survives", /name\s*=\s*"techtree_infantry_item"/.test(gui), "");

  const defRemoved = server.removeTechnologyFolderDef(tmp, "doomed_folder");
  const def = fs.readFileSync(folderFile, "utf8");
  check("removeDef reported removal", defRemoved === true, String(defRemoved));
  check("doomed_folder def GONE", !/\bdoomed_folder\s*=/.test(def), def);
  check("keep_folder def survives", /\bkeep_folder\s*=/.test(def), def);
  check("folder file still braces balanced", braced(def), "");

  // 3. Idempotency: deleting again is a clean no-op (nothing to remove).
  check("second GUI delete is a no-op", server.removeCustomFolderFromTechTreeGui(tmp, "doomed_folder") === false, "");
  check("second def remove is a no-op", server.removeTechnologyFolderDef(tmp, "doomed_folder") === false, "");

  // 4. removeNamedGuiBlock returns input untouched when the block is absent.
  const sample = "containerWindowType = { name = \"x\" }\n";
  check("removeNamedGuiBlock: absent name → unchanged", server.removeNamedGuiBlock(sample, "nope") === sample, "");
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\nDELETE-CUSTOM-FOLDER TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
