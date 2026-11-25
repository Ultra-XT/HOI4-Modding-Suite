// Regression: Mod Health warns when a tech is in a research folder that isn't defined by the mod,
// its dependencies, or the base game (it won't appear in any research tab). Guards RULE 6.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-techfolder-"));
try {
  // Mod defines "my_folder" in technology_tags.
  const tagDir = path.join(tmp, "common", "technology_tags");
  fs.mkdirSync(tagDir, { recursive: true });
  fs.writeFileSync(path.join(tagDir, "folders.txt"), "technology_folders = {\n\tmy_folder = { ledger = army }\n}\n", "utf8");
  const techDir = path.join(tmp, "common", "technologies");
  fs.mkdirSync(techDir, { recursive: true });
  fs.writeFileSync(path.join(techDir, "t.txt"),
    "technologies = {\n" +
    "\ttech_known = {\n\t\tfolder = { name = my_folder\n\t\t\tposition = { x = 0 y = 0 } }\n\t}\n" +
    "\ttech_ghost = {\n\t\tfolder = { name = ghost_folder\n\t\t\tposition = { x = 0 y = 1 } }\n\t}\n" +
    "}\n", "utf8");

  const idx = buildModIndex(tmp, {}); // no vanilla -> knownFolders = {my_folder}
  const warns = idx.problems.filter((p) => p.rule === "tech_unknown_folder");
  check("warns for tech in undefined folder (tech_ghost)", warns.some((w) => w.entityId === "tech_ghost"), JSON.stringify(warns.map((w) => w.entityId)));
  check("does NOT warn for tech in a mod-defined folder (tech_known)", !warns.some((w) => w.entityId === "tech_known"), "");

  // Sanity: with NO known folders at all, the rule is skipped (no false positives).
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-nofolders-"));
  fs.mkdirSync(path.join(tmp2, "common", "technologies"), { recursive: true });
  fs.writeFileSync(path.join(tmp2, "common", "technologies", "t.txt"), "technologies = {\n\tx = {\n\t\tfolder = { name = whatever\n\t\t\tposition = { x = 0 y = 0 } }\n\t}\n}\n", "utf8");
  const idx2 = buildModIndex(tmp2, {});
  check("no folder info -> rule skipped (no false warning)", !idx2.problems.some((p) => p.rule === "tech_unknown_folder"), "");
  fs.rmSync(tmp2, { recursive: true, force: true });
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\nTECH-FOLDER TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
