// Regression: Mod Health warns when a tech has a negative research-folder grid position (it won't
// render in-game — "Found no grid box"). Guards RULE 5 (tech_negative_position).
//
// SCOPED TO TECHS NOVA PLACED (#tech-position-not-absolute). `folder.position` is a SLOT OFFSET from the
// gridbox a tech's chain resolves to, not an absolute coordinate, and mod-index never opens a .gui — so a
// negative value only means "off the frame" when Nova itself wrote the gridbox at the folder origin. Left
// ungated, the rule fired 57 times on the SHIPPING BASE GAME (CAS1/2/3, heavy_fighter1/2/3, the MtG hull
// line, the special-forces doctrines), all of which render perfectly.
//
// So the fixture now carries what a Nova-placed tech actually has: an interface/.gui with Nova's marker and
// a `<id>_tree` gridbox per tech. That is the situation the rule was written for — an add-on whose techs
// Nova positioned and hid — and the ungated form is what made it unusable.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildModIndex } = require("./mod-index.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "novamod-techpos-"));
try {
  const dir = path.join(tmp, "common", "technologies");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "t.txt"),
    "technologies = {\n" +
    "\ttech_ok = {\n\t\tfolder = { name = hellenic_research\n\t\t\tposition = { x = 0 y = 0 } }\n\t}\n" +
    "\ttech_bad = {\n\t\tfolder = { name = hellenic_research\n\t\t\tposition = { x = -2 y = 1 } }\n\t}\n" +
    "\ttech_bad_y = {\n\t\tfolder = { name = hellenic_research\n\t\t\tposition = { x = 1 y = -3 } }\n\t}\n" +
    "}\n", "utf8");

  // The gridboxes Nova writes for techs it placed, inside its own marker block — this is what makes the
  // folder origin the real origin for these three techs.
  const iface = path.join(tmp, "interface");
  fs.mkdirSync(iface, { recursive: true });
  fs.writeFileSync(path.join(iface, "countrytechtreeview.gui"), [
    "guiTypes = {",
    "\tcontainerWindowType = {",
    '\t\tname = "hellenic_research"',
    "\t\t# >>> NOVA_NEW_TECH_GRIDBOXES",
    '\t\tgridboxtype = { name = "tech_ok_tree" position = { x = 0 y = 0 } }',
    '\t\tgridboxtype = { name = "tech_bad_tree" position = { x = 0 y = 0 } }',
    '\t\tgridboxtype = { name = "tech_bad_y_tree" position = { x = 0 y = 0 } }',
    "\t\t# <<< NOVA_NEW_TECH_GRIDBOXES",
    "\t}",
    "}",
    "",
  ].join("\n"), "utf8");

  const idx = buildModIndex(tmp, {});
  const warns = idx.problems.filter((p) => p.rule === "tech_negative_position");
  check("warns for negative x (tech_bad)", warns.some((w) => w.entityId === "tech_bad"), JSON.stringify(warns.map((w) => w.entityId)));
  check("warns for negative y (tech_bad_y)", warns.some((w) => w.entityId === "tech_bad_y"), JSON.stringify(warns.map((w) => w.entityId)));
  check("does NOT warn for valid position (tech_ok)", !warns.some((w) => w.entityId === "tech_ok"), "");
  check("exactly 2 negative-position warnings", warns.length === 2, "count=" + warns.length);
} catch (e) {
  fail++; console.log("  FAIL harness →", e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\nTECH-POSITION TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
