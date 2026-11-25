// ⛔ #a-country-registered-late-is-reported-once (review of tool campaign B2-4).
//
// B2-4 added state_owned_by_dynamic_tag: land given to a tag common/country_tags declares after `dynamic_tags = yes` (the base game's
// D01..D50), telling the modder to "give the state a real country: paint it with 🖌 Paint". It judged every such tag — the modder's OWN
// countries too, when a file of the mod's registers them after the marker (zz_nova_countries.txt, which Nova wrote for years and which the
// Road to 56 Workshop item and two of the owner's installed mods still carry). Those are country_tag_after_dynamic_marker's (FATAL, the
// flag-atlas crash), whose step is to rename the file or make the country again; the second row told the modder to paint their own
// country's land over to another one, and said "no launch has shown what HOI4 does" beside a row naming the crash. Measured on the
// review's probe: both rows named Z00.
//   1. a mod registering Z00 in its own zz_nova_countries.txt: country_tag_after_dynamic_marker reports it (FATAL);
//   2. state_owned_by_dynamic_tag does not name Z00, and still names the base game's kind of throwaway (D01);
//   3. countryTagSectionsThatLoad answers `ownAfter` = the mod's own late tags, still inside `dynamic` (what the pickers leave out);
//   4. the same late file shipped by a layer BELOW the add-on is not the add-on's registration: no FATAL for it, and land the add-on gives
//      to its tag is still state_owned_by_dynamic_tag;
//   5. source (comments masked): the rule asks ownAfter.
// Binds no port. Run: node test-a-country-registered-late-is-reported-once.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-late-tag-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments, jsBodyAt } = require("./testlib-strip-comments.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const state = (id, owner, provs) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\tstate_category = town\n\tprovinces = { ${provs} }\n\thistory = { owner = ${owner} add_core_of = ${owner} }\n}\n`;
const DEF = ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1", "2;20;20;20;land;false;plains;1", "3;30;30;30;land;false;plains;1"].join("\n") + "\n";
const tags = (dir) => {
  mk(path.join(dir, "common", "country_tags", "00_countries.txt"), 'AAA = "countries/A.txt"\nBBB = "countries/B.txt"\n');
  mk(path.join(dir, "common", "country_tags", "zz_dynamic_countries.txt"), 'dynamic_tags = yes # any tags after this is used for temporary civil wars\nD01 = "countries/D01.txt"\n');
};
const states = (dir) => {
  mk(path.join(dir, "history", "states", "1-S1.txt"), state(1, "AAA", "1"));
  mk(path.join(dir, "history", "states", "2-S2.txt"), state(2, "Z00", "2"));
  mk(path.join(dir, "history", "states", "3-S3.txt"), state(3, "D01", "3"));
};
const rows = (problems, rule) => problems.filter((p) => p && p.rule === rule);
const tagsOf = (list) => [...new Set(list.flatMap((p) => (p.items || []).map((i) => i.tag)))].sort();

try {
  console.log("=== 1-3. the mod registers its own Z00 after the marker ===");
  {
    const mod = path.join(ROOT, "own");
    mk(path.join(mod, "descriptor.mod"), 'name="LT"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="common/country_tags"\n');
    mk(path.join(mod, "map", "definition.csv"), DEF);
    tags(mod);
    mk(path.join(mod, "common", "country_tags", "zz_nova_countries.txt"), 'Z00 = "countries/Z00.txt"\n');
    states(mod);
    for (const [t, c] of [["AAA", 1], ["Z00", 2]]) mk(path.join(mod, "history", "countries", `${t}.txt`), `capital = ${c}\n`);
    const late = rows(md.validateMapBitmap({ modRoot: mod }) || [], "country_tag_after_dynamic_marker");
    ok("1. country_tag_after_dynamic_marker reports the mod's own late file, FATAL", late.length === 1 && labels.isFatalRule(late[0].rule) && (late[0].files || []).includes("zz_nova_countries.txt"), late);
    const model = md.buildMapModel({ modRoot: mod });
    const dyn = rows(md.validateMapModel(model), "state_owned_by_dynamic_tag");
    ok("2. state_owned_by_dynamic_tag does not name Z00, the mod's own country", !tagsOf(dyn).includes("Z00"), dyn);
    ok("…and still names D01, a throwaway the marker's own file declares", tagsOf(dyn).includes("D01") && dyn.length === 1 && dyn[0].severity === "error" && !labels.isFatalRule(dyn[0].rule), dyn);
    ok("…with the count of the states it judges, not of the ones it leaves", dyn[0].total === 1, dyn[0]);
    const sec = md.countryTagSectionsThatLoad({ modRoot: mod });
    ok("3. countryTagSectionsThatLoad: ownAfter is the mod's own late tag", JSON.stringify([...(sec.ownAfter || [])].sort()) === JSON.stringify(["Z00"]), [...(sec.ownAfter || [])]);
    ok("…still inside `dynamic`, which the pickers leave out (buildMapModel's dynamicTags)", sec.dynamic.has("Z00") && sec.dynamic.has("D01") && (model.dynamicTags || []).includes("Z00"), model.dynamicTags);
  }

  console.log("=== 4. the late file comes from the layer below: not the add-on's registration ===");
  {
    const base = path.join(ROOT, "base");
    tags(base);
    mk(path.join(base, "common", "country_tags", "zz_nova_countries.txt"), 'Z00 = "countries/Z00.txt"\n');
    mk(path.join(base, "map", "definition.csv"), DEF);
    const mod = path.join(ROOT, "addon");
    mk(path.join(mod, "descriptor.mod"), 'name="LT2"\nreplace_path="history/states"\n');
    mk(path.join(mod, "map", "definition.csv"), DEF);
    states(mod);
    const late = rows(md.validateMapBitmap({ modRoot: mod, gameRoot: base }) || [], "country_tag_after_dynamic_marker");
    ok("no country_tag_after_dynamic_marker for a file the add-on does not ship", late.length === 0, late);
    const sec = md.countryTagSectionsThatLoad({ modRoot: mod, gameRoot: base });
    ok("ownAfter is empty: no late file is the add-on's", !(sec.ownAfter || new Set()).size && sec.dynamic.has("Z00"), [...(sec.ownAfter || [])]);
    const dyn = rows(md.validateMapModel(md.buildMapModel({ modRoot: mod, gameRoot: base })), "state_owned_by_dynamic_tag");
    ok("land the add-on gives to that late tag is still state_owned_by_dynamic_tag", JSON.stringify(tagsOf(dyn)) === JSON.stringify(["D01", "Z00"]), dyn);
  }

  console.log("=== 5. source: the rule asks ownAfter (comments masked) ===");
  {
    const masked = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const opening = "function validateMapModel(";
    const at = masked.indexOf(opening);
    if (at < 0 || masked.indexOf(opening, at + 1) !== -1) throw new Error("map-data.js: not found exactly once: " + opening);
    const span = jsBodyAt(masked, at);
    const body = masked.slice(span[0], span[1] + 1);
    const push = body.indexOf('rule: "state_owned_by_dynamic_tag"');
    const loop = body.lastIndexOf("for (const st of model.states)", push);
    ok("the rule's state loop skips a tag the mod registers late", push > 0 && loop > 0 && /\.ownAfter\b/.test(body.slice(Math.max(0, loop - 1500), push)) && /registeredLate\(T\)/.test(body.slice(loop, push)), { push, loop });
  }
  console.log(`\ntest-a-country-registered-late-is-reported-once: ${pass} checks passed`);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* this test's own temp fixtures and app-data */ }
}
