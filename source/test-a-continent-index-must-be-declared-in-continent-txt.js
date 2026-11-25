// A province's continent must be one map/continent.txt actually declares.
// #a-continent-index-must-be-declared
//
// definition.csv's last column is an INDEX into map/continent.txt: 1 is the first name in that file, n the
// nth. Nova never read continent.txt at all. province_no_continent checks only that a land row is not 0 —
// and sits in the fatal set for it — while nothing checked the index resolves to a continent at all. Half a
// rule. The moment a modder names their own continents in a shorter list (Old World Blues replaced vanilla's
// seven with six), every row still pointing past the end resolved to nothing, and the map was called clean.
//
// Measured on the six shipping maps, reading continent.txt through the overlay (Rise of Nations ships none
// and inherits vanilla's seven; Old World Blues declares six; the rest seven): 0 of 95,440 rows of ANY type
// point past their own map's declared list, 0 negative, 0 non-numeric. Old World Blues is the proof authors
// maintain it deliberately: all 20,624 of its land provinces use exactly indices 1-6.
//
// ⚠️ 0 exceptions also means no shipping map tests what HOI4 does with the violation, so this is a WARNING,
// not a fatal rule. Whose problem it is follows #inherited-problem-not-yours with two files instead of one:
// a mod that changes how many continents there are is answerable for every row its list no longer reaches;
// otherwise only for the rows it changed itself.
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

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-contrange-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

const RULE = "province_continent_not_declared";
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
let n = 0;
const dir = (tag) => { const d = path.join(SANDBOX, `${tag}-${++n}`); fs.mkdirSync(d, { recursive: true }); return d; };
const csv = (rows) => rows.join("\r\n") + "\r\n";
const continents = (names) => "# the order is the index\ncontinents = {\n" + names.map((x) => "\t" + x).join("\n") + "\n}\n";

const BASE_NAMES = ["alpha", "beta", "gamma"];
const BASE_ROWS = [
  "0;0;0;0;land;false;unknown;0",
  "1;10;0;0;land;false;plains;1",
  "2;20;0;0;land;false;plains;2",
  "3;30;0;0;land;false;plains;3",
  "4;40;0;0;sea;false;ocean;0",
  "5;50;0;0;land;false;plains;4",   // the base layer's OWN out-of-range row — inherited by every mod on top
];
const GAME = dir("game");
mk(path.join(GAME, "map", "continent.txt"), continents(BASE_NAMES));
mk(path.join(GAME, "map", "definition.csv"), csv(BASE_ROWS));

const model = (modRoot, gameRoot) => md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [], cacheStableLayers: false });
const hits = (modRoot, gameRoot) => md.validateMapModel(model(modRoot, gameRoot)).filter((p) => p.rule === RULE);
const ids = (h) => [].concat(...h.map((p) => p.provinces || [])).sort((a, b) => a - b);
const addon = (tag, extra = "") => { const m = dir(tag); mk(path.join(m, "descriptor.mod"), `name="${tag}"\nsupported_version="1.19.*"\n${extra}`); return m; };

try {
  console.log("1. The model reads continent.txt through the overlay");
  {
    const a = addon("reads");
    rec("⭐⭐ an add-on sees the base layer's list", JSON.stringify(model(a, GAME).continents) === JSON.stringify(BASE_NAMES), model(a, GAME).continents);
    const own = addon("ownlist");
    mk(path.join(own, "map", "continent.txt"), continents(["west", "east"]));
    rec("⭐⭐ a mod's own continent.txt replaces it wholesale", JSON.stringify(model(own, GAME).continents) === '["west","east"]', model(own, GAME).continents);
    const tc = addon("replaces", 'replace_path="map"\n');
    mk(path.join(tc, "map", "definition.csv"), csv(BASE_ROWS.slice(0, 5)));
    rec("a mod replacing map/ with no continent.txt of its own inherits no list", model(tc, GAME).continents == null, model(tc, GAME).continents);
    rec("…and so no range rule can fire for it", hits(tc, GAME).length === 0, hits(tc, GAME));
  }

  console.log("\n2. ⛔ A mod that SHORTENS the list is told which rows it no longer reaches");
  {
    const m = addon("shorter");
    mk(path.join(m, "map", "continent.txt"), continents(["west", "east"]));
    const h = hits(m, GAME);
    rec("⭐⭐⭐ the rule fires", h.length === 1, h);
    rec("⭐⭐ …for every row past the mod's two continents", JSON.stringify(ids(h)) === "[3,5]", ids(h));
    const p = h[0] || {};
    rec("it is a warning", p.severity === "warning", p.severity);
    rec("⭐ …outside the fatal set", labels.isFatalRule(RULE) === false);
    rec("…with a friendly label", !!labels.LABELS[RULE] && labels.mapRuleLabel(RULE) === labels.LABELS[RULE], labels.mapRuleLabel(RULE));
    rec("…and a hint that says how to fix it", labels.mapRuleFixHint(RULE).length > 40, labels.mapRuleFixHint(RULE));
    rec("the message says how many continents are declared", /\b2\b/.test(String(p.message)) && /continent\.txt/.test(String(p.message)), String(p.message).slice(0, 200));
  }

  console.log("\n3. ⛔ A mod that WRITES an index past the list is told about that row");
  {
    const m = addon("row");
    mk(path.join(m, "map", "definition.csv"), csv(BASE_ROWS.map((r) => r.startsWith("2;") ? "2;20;0;0;land;false;plains;7" : r)));
    const h = hits(m, GAME);
    rec("⭐⭐⭐ the row the mod changed is reported", ids(h).includes(2), ids(h));
    rec("⭐⭐ …and the base layer's inherited row is not", !ids(h).includes(5), ids(h));
  }

  console.log("\n4. ⭐⭐ What it must NOT report");
  {
    const a = addon("inherit");
    rec("an add-on that ships neither file is not blamed for the base's row", hits(a, GAME).length === 0, hits(a, GAME));
    const v = addon("verbatim");
    mk(path.join(v, "map", "continent.txt"), continents(BASE_NAMES));
    mk(path.join(v, "map", "definition.csv"), csv(BASE_ROWS));
    rec("a mod holding both base files verbatim is not blamed either", hits(v, GAME).length === 0, hits(v, GAME));
    const renamed = addon("renamed");
    mk(path.join(renamed, "map", "continent.txt"), continents(["north", "south", "middle"]));
    rec("renaming continents without changing how many there are is not a range problem", hits(renamed, GAME).length === 0, hits(renamed, GAME));
    const inRange = addon("inrange");
    mk(path.join(inRange, "map", "definition.csv"), csv(BASE_ROWS.map((r) => r.startsWith("2;") ? "2;20;0;0;land;false;plains;3" : r)));
    rec("a changed row that stays in range is not reported", hits(inRange, GAME).length === 0, hits(inRange, GAME));
  }

  console.log("\n5. Editing the base game directly: its own rows are yours");
  {
    const h = hits(GAME, GAME);
    rec("the base layer validated as itself reports its own out-of-range row", JSON.stringify(ids(h)) === "[5]", ids(h));
  }

  console.log(`\n=== a continent index must be declared in continent.txt: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
} catch (e) {
  console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
  process.exitCode = 1;
} finally {
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
}
