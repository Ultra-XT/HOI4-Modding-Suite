// Mod Health must notice a land province whose terrain is a NAVAL terrain.
// #a-land-province-on-a-naval-terrain
//
// definition.csv's seventh column names a category from common/terrain. The continent column beside it has a
// rule in both directions; the terrain column had none at all — not in validateMapModel, not in the rule
// labels — so every bad value Nova could write survived a clean report. The inspector wrote `land;…;ocean`
// (#a-flipped-sea-keeps-its-ocean-terrain), and the result resolves to a category declared
// `naval_terrain = yes` / `is_water = yes`: the sea's movement and combat profile on a land province.
//
// ⚠️ THE NARROWEST RULE THAT DOES NOT CRY WOLF. Measured on the six shipping maps (vanilla, Millennium Dawn,
// Road to 56, Old World Blues, Novum Vexillum, Rise of Nations — 95,440 rows, 77,816 land):
//
//   land row on a NAVAL terrain (naval_terrain = yes)    0   ← this rule
//   land row on ANY water terrain (is_water = yes)       4   all `lakes`, all Old World Blues, which launches
//   sea row not on `ocean`                              14
//   terrain naming no category at all                    1   Road to 56's `plain`
//
// `lakes` is water but not naval in vanilla, Millennium Dawn and Old World Blues alike, which is exactly the
// line the corpus draws. The naval set is READ from common/terrain through the overlay, so a mod's own naval
// terrain (Millennium Dawn's water_littoral) counts and nothing is typed in.
//
// Gated like sea_province_has_continent (#inherited-problem-not-yours): only a row the mod itself changed is
// the mod's to fix. A warning — no crash has been measured, so it is nowhere near the fatal set.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 240)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-navalterr-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

const RULE = "land_province_has_naval_terrain";
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
let n = 0;
const dir = (tag) => { const d = path.join(SANDBOX, `${tag}-${++n}`); fs.mkdirSync(d, { recursive: true }); return d; };

const TERRAIN = [
  "categories = {",
  "\tunknown = { color = { 255 0 0 } }",
  "\tocean = {\n\t\tnaval_terrain = yes\n\t\tcolor = { 40 83 176 }\n\t\tis_water = yes\n\t}",
  "\tlakes = {\n\t\tcolor = { 58 91 255 }\n\t\tis_water = yes\n\t}",
  "\tplains = { color = { 255 129 66 } }",
  "\tforest = { color = { 89 199 85 } }",
  "}",
  "",
].join("\n");
const BASE_ROWS = [
  "0;0;0;0;land;false;unknown;0",
  "1;10;0;0;land;false;plains;1",
  "2;20;0;0;land;false;lakes;1",
  "3;30;0;0;sea;false;ocean;0",
  "4;40;0;0;sea;false;ocean;0",
  "5;50;0;0;land;false;ocean;1",   // the base layer's OWN quirk — inherited by every mod on top
];
const csv = (rows) => rows.join("\r\n") + "\r\n";

const GAME = dir("game");
mk(path.join(GAME, "common", "terrain", "00_terrain.txt"), TERRAIN);
mk(path.join(GAME, "map", "definition.csv"), csv(BASE_ROWS));

const hits = (modRoot, gameRoot) => md.validateMapModel(md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: false }))
  .filter((p) => p.rule === RULE);
const ids = (h) => [].concat(...h.map((p) => p.provinces || [])).sort((a, b) => a - b);
const addon = (tag) => { const m = dir(tag); mk(path.join(m, "descriptor.mod"), `name="${tag}"\nsupported_version="1.19.*"\n`); return m; };

try {
  console.log("1. ⛔ A mod that turns sea into land on `ocean` is told so");
  {
    const m = addon("flip");
    mk(path.join(m, "map", "definition.csv"), csv(BASE_ROWS.map((r) => r.startsWith("3;") ? "3;30;0;0;land;false;ocean;1" : r)));
    const h = hits(m, GAME);
    rec("⭐⭐⭐ the rule fires once", h.length === 1, h);
    rec("⭐⭐ …naming the province the mod changed", JSON.stringify(ids(h)) === "[3]", ids(h));
    rec("⭐⭐ …and NOT the base layer's own row it merely inherits", !ids(h).includes(5), ids(h));
    const p = h[0] || {};
    rec("it is a warning", p.severity === "warning", p.severity);
    rec("⭐ …outside the fatal set, so it never blocks a Save", labels.isFatalRule(RULE) === false);
    rec("…with a friendly label", !!labels.LABELS[RULE] && labels.mapRuleLabel(RULE) === labels.LABELS[RULE], labels.mapRuleLabel(RULE));
    rec("…and a hint that says how to fix it", labels.mapRuleFixHint(RULE).length > 40, labels.mapRuleFixHint(RULE));
    rec("the message names the terrain", /ocean/.test(String(p.message)), String(p.message).slice(0, 160));
  }

  console.log("\n2. ⭐⭐ What it must NOT report");
  {
    const a = addon("inherit");
    rec("an add-on that ships no definition.csv is not blamed for the base's row", hits(a, GAME).length === 0, hits(a, GAME));

    const v = addon("verbatim");
    mk(path.join(v, "map", "definition.csv"), csv(BASE_ROWS));
    rec("a mod holding the base definition.csv verbatim is not blamed either", hits(v, GAME).length === 0, hits(v, GAME));

    const owb = addon("owb");
    mk(path.join(owb, "map", "definition.csv"), csv(BASE_ROWS.map((r) => r.startsWith("1;") ? "1;10;0;0;land;false;lakes;1" : r)));
    rec("⭐⭐⭐ land on `lakes` — water, not naval — is not reported (Old World Blues ships four)", hits(owb, GAME).length === 0, hits(owb, GAME));

    const recolour = addon("recolour");
    mk(path.join(recolour, "map", "definition.csv"), csv(BASE_ROWS.map((r) => r.startsWith("5;") ? "5;55;0;0;land;false;ocean;1" : r)));
    rec("re-colouring the base's own row does not make its terrain the mod's", hits(recolour, GAME).length === 0, hits(recolour, GAME));
  }

  console.log("\n3. ⭐ The naval set comes from common/terrain, not from a list");
  {
    const m = addon("ownnaval");
    mk(path.join(m, "common", "terrain", "01_littoral.txt"),
      "categories = {\n\twater_littoral = {\n\t\tnaval_terrain = yes\n\t\tcolor = { 20 60 160 }\n\t\tis_water = yes\n\t}\n}\n");
    mk(path.join(m, "map", "definition.csv"), csv(BASE_ROWS.map((r) => r.startsWith("1;") ? "1;10;0;0;land;false;water_littoral;1" : r)));
    const h = hits(m, GAME);
    rec("⭐⭐ a naval terrain the MOD declares is recognised on its own land row", JSON.stringify(ids(h)) === "[1]", ids(h));
  }

  console.log("\n4. Editing the base game directly: its own rows are yours");
  {
    const h = hits(GAME, GAME);
    rec("the base layer validated as itself reports its own land-on-ocean row", JSON.stringify(ids(h)) === "[5]", ids(h));
  }

  console.log(`\n=== a land province cannot carry a naval terrain: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
