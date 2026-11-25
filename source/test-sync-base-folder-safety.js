// CRITICAL regression: the gridbox sync must NEVER relayout a base-game/base-mod folder. Millennium
// Dawn defines its own folders (electronics_folder, civilian_folder, …) AND gives them same-named GUI
// containers, so a prior version relayouted them on every save — rewriting every base tech's position
// and wrecking the tab in-game ("saving ruined the electronics tree"). Only folders Nova itself
// created (declared in zz_nova_custom_folders.txt) may ever be touched.
const fs = require("fs");
const os = require("os");
const path = require("path");
const server = require("./server.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-syncsafety-"));
try {
  // A GUI that gives BOTH folders a same-named container (so a container check alone can't tell them apart).
  const ifaceDir = path.join(tmp, "interface");
  fs.mkdirSync(ifaceDir, { recursive: true });
  const gui = [
    "guiTypes = {",
    "\tcontainerWindowType = {",
    "\t\tname = \"countrytechtreeview\"",
    "\t\tcontainerWindowType = { name = \"folder_tabs\" position = { x = 0 y = 0 } }",
    "\t\tcontainerWindowType = { name = \"electronics_folder\" position = { x = 0 y = 47 } }",
    "\t\tcontainerWindowType = { name = \"my_custom_folder\" position = { x = 0 y = 47 } }",
    "\t\tcontainerWindowType = { name = \"techtree_infantry_item\" containerWindowType = { name = \"sub_technology_slot_0\" } }",
    "\t}",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(path.join(ifaceDir, "countrytechtreeview.gui"), gui, "utf8");

  // Nova's own file declares ONLY my_custom_folder. electronics_folder is the base mod's, defined elsewhere.
  const tagDir = path.join(tmp, "common", "technology_tags");
  fs.mkdirSync(tagDir, { recursive: true });
  fs.writeFileSync(path.join(tagDir, "zz_nova_custom_folders.txt"),
    "technology_folders = {\n\tmy_custom_folder = {\n\t\tledger = army\n\t}\n}\n", "utf8");
  fs.writeFileSync(path.join(tagDir, "00_md_folders.txt"),
    "technology_folders = {\n\telectronics_folder = {\n\t\tledger = army\n\t}\n}\n", "utf8");

  // A base electronics tech at a hand-tuned position that must NOT move.
  const techDir = path.join(tmp, "common", "technologies");
  fs.mkdirSync(techDir, { recursive: true });
  const elecFile = path.join(techDir, "electronics.txt");
  const elecBefore =
    "technologies = {\n" +
    "\tbase_radar = {\n\t\tfolder = { name = electronics_folder\n\t\t\tposition = { x = 5 y = 7 } }\n\t\tstart_year = 1936\n\t}\n" +
    "\tbase_radar2 = {\n\t\tfolder = { name = electronics_folder\n\t\t\tposition = { x = 9 y = 3 } }\n\t\tstart_year = 1940\n\t}\n" +
    "}\n";
  fs.writeFileSync(elecFile, elecBefore, "utf8");

  // === The unsafe case: syncing a base folder must SKIP and write nothing. ===
  const guiBefore = fs.readFileSync(path.join(ifaceDir, "countrytechtreeview.gui"), "utf8");
  const r = server.syncCustomFolderGridboxes(tmp, "electronics_folder");
  check("electronics sync is SKIPPED", r && r.skipped === "not a Nova-created folder", JSON.stringify(r));
  check("electronics tech file UNCHANGED", fs.readFileSync(elecFile, "utf8") === elecBefore, "positions were rewritten!");
  check("gui UNCHANGED by base-folder sync", fs.readFileSync(path.join(ifaceDir, "countrytechtreeview.gui"), "utf8") === guiBefore, "");

  // === getNovaCreatedTechFolders is the authoritative list (only Nova's file). ===
  const nova = server.getNovaCreatedTechFolders(tmp);
  check("Nova list = [my_custom_folder] only", nova.length === 1 && nova[0] === "my_custom_folder", JSON.stringify(nova));
  check("getModDefinedTechFolders still sees BOTH (unchanged)", server.getModDefinedTechFolders(tmp).includes("electronics_folder"), "");

  // === The safe case: a real Nova folder is NOT skipped (it's allowed to lay out). ===
  const myTechFile = path.join(techDir, "mine.txt");
  fs.writeFileSync(myTechFile,
    "technologies = {\n\tmy_tech = {\n\t\tfolder = { name = my_custom_folder\n\t\t\tposition = { x = 0 y = 0 } }\n\t}\n}\n", "utf8");
  const r2 = server.syncCustomFolderGridboxes(tmp, "my_custom_folder");
  check("Nova folder is NOT skipped", !(r2 && r2.skipped), JSON.stringify(r2));
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\nSYNC-BASE-FOLDER-SAFETY TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
