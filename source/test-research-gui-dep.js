// Regression: creating a custom research folder for an add-on must base the countrytechtreeview.gui
// copy on the DEPENDENCY's (Millennium Dawn's) GUI, NOT vanilla's — otherwise the base mod's entire
// research screen gets clobbered. Guards injectCustomFolderIntoTechTreeGui's base-resolution.
const fs = require("fs");
const os = require("os");
const path = require("path");
const serverMod = require("./server.js");
const { injectCustomFolderIntoTechTreeGui, constants } = serverMod;

const MD = "d:\\SteamLibrary\\steamapps\\workshop\\content\\394360\\2777392649";
const VANILLA = constants.resolveHoi4GameRoot();

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

// Find a string that exists in MD's research GUI but NOT vanilla's (proves which one was copied).
const mdGui = fs.readFileSync(path.join(MD, "interface", "countrytechtreeview.gui"), "utf8");
const vanGui = fs.existsSync(path.join(VANILLA, "interface", "countrytechtreeview.gui")) ? fs.readFileSync(path.join(VANILLA, "interface", "countrytechtreeview.gui"), "utf8") : "";
// "augmented_vision" is an MD modern-infantry subtitle; vanilla has no such thing.
const MD_MARKER = "augmented_vision";
const mdHasMarker = mdGui.includes(MD_MARKER);
const vanHasMarker = vanGui.includes(MD_MARKER);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-resgui-"));
try {
  check("test precondition: MD GUI has the marker, vanilla does not", mdHasMarker && !vanHasMarker, `md=${mdHasMarker} van=${vanHasMarker}`);
  // Synthetic add-on declaring MD as a dependency, with no interface/ of its own.
  fs.writeFileSync(path.join(tmp, "descriptor.mod"), 'name="Res GUI Test"\ndependencies={\n\t"Millennium Dawn: A Modern Day Mod"\n}\n', "utf8");

  const changed = injectCustomFolderIntoTechTreeGui(tmp, VANILLA, "hel_research_folder", "GFX_hel_research_folder_tab");
  check("inject reported a change", changed === true, String(changed));

  const out = fs.readFileSync(path.join(tmp, "interface", "countrytechtreeview.gui"), "utf8");
  check("copied GUI is MD's (preserves MD research screen), not vanilla's", out.includes(MD_MARKER), "marker missing => clobbered MD with vanilla!");
  check("custom folder container injected", /hel_research_folder/.test(out), "");
  check("custom folder tab button injected", /hel_research_folder_tab/.test(out), "");
  check("result is brace-balanced", (() => { let d = 0; for (const c of out) { if (c === "{") d++; else if (c === "}") { d--; if (d < 0) return false; } } return d === 0; })(), "");
  // Sanity: MD's own infantry folder must still be present (not removed by the copy).
  check("MD's infantry_folder still present (not clobbered)", out.includes('name = "infantry_folder"'), "");
  // The node-renderer item template must have been added (without it MD logs "Undefined GUI_TYPE").
  const count = (s, re) => (s.match(re) || []).length;
  check("item template techtree_hel_research_folder_item added", count(out, /name = "techtree_hel_research_folder_item"/g) === 1, count(out, /name = "techtree_hel_research_folder_item"/g));

  // Idempotency: re-injecting the SAME folder must report no change and not stack duplicates
  // (re-saving a custom folder is a normal operation; duplicated containers/tabs corrupt the screen).
  const changed2 = injectCustomFolderIntoTechTreeGui(tmp, VANILLA, "hel_research_folder", "GFX_hel_research_folder_tab");
  check("re-inject reports no change (idempotent)", changed2 === false, String(changed2));
  const out2 = fs.readFileSync(path.join(tmp, "interface", "countrytechtreeview.gui"), "utf8");
  check("folder container not duplicated on re-inject", count(out2, /name = "hel_research_folder"/g) === 1, count(out2, /name = "hel_research_folder"/g));
  check("folder tab button not duplicated on re-inject", count(out2, /name = "hel_research_folder_tab"/g) === 1, count(out2, /name = "hel_research_folder_tab"/g));
  check("item template not duplicated on re-inject", count(out2, /name = "techtree_hel_research_folder_item"/g) === 1, count(out2, /name = "techtree_hel_research_folder_item"/g));
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\nRESEARCH-GUI-DEP TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
