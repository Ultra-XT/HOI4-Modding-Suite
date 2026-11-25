// ⚓ #a-strait-left-on-land — THE OWNER'S "there is a strait in land?"
//
// On his Nova world the Gibraltar Strait tooltip sat on marsh. All three sea zones the base game's GIBRALTAR_STRAIT rule
// governs (5407, 5382, 2400) are land there, and the rule survived: its icon drawn on land, and its `enemy = { army = no }`
// now deciding who may walk across a land border.
//
// ⚠️ The first version of this check ("a rule whose every row joins land") fired on FOUR working maps — Hearts of
// Minecraft's thirteen portals, Old World Blues' spatial anomalies, Millennium Dawn's and Damaged Continuum's Torres
// Strait row. Rules on land are a modding tool. The defect is only a rule the LAYER BELOW defines over water, whose rows
// this mod's map puts on land. This test pins both halves.
//
// What it pins: the rule fires on the dried strait and the dried canal; not on the mod's own land rule (a portal), not on
// a base rule whose sea is still sea, not when the mod did not change definition.csv; the fix comments the rule out,
// takes its name off exactly its rows, keeps each row's connection, keeps the file's line ending, writes nothing the
// second time; and the back-out control.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const md = require(path.join(__dirname, "map-data.js"));

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 600))); fails.push(name); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const tmps = [];
const tmp = (tag) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-strait-" + tag + "-")); tmps.push(d); return d; };

// provinces: 1-4 land; 10, 11, 12 sea (a strait); 13, 14 sea joined through land 15 (a canal); 20, 21 sea (a strait that stays)
const TYPES = { 1: "land", 2: "land", 3: "land", 4: "land", 10: "sea", 11: "sea", 12: "sea", 13: "sea", 14: "sea", 15: "land", 20: "sea", 21: "sea" };
const defn = (over = {}) => ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(TYPES).map((id) => {
  const t = over[id] || TYPES[id];
  return `${id};${id};${id * 3};${id * 7};${t};false;${t === "land" ? "plains" : "ocean"};${t === "land" ? 1 : 0}`;
})).join("\n") + "\n";
const RULE = (name, icon) => `adjacency_rule =\n{\n\tname = "${name}"\n\n\tenemy =\n\t{\n\t\tarmy = no\n\t\tnavy = no\n\t\tsubmarine = yes\n\t\ttrade = no\n\t}\n\trequired_provinces = { 1 2 }\n\n\ticon = ${icon}\n\toffset = { 0 0 0 }\n}\n`;
const RULES = RULE("TEST_STRAIT", 10) + "\n" + RULE("TEST_CANAL", 15) + "\n" + RULE("TEST_STAYS", 20) + "\n" + RULE("BASE_LAND_RULE", 4);
const ADJ = [
  "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment",
  "10;11;;-1;-1;-1;-1;-1;TEST_STRAIT;Strait North",
  "10;12;;-1;-1;-1;-1;-1;TEST_STRAIT;Strait South",
  "13;14;sea;15;-1;-1;-1;-1;TEST_CANAL;Canal",
  "20;21;;-1;-1;-1;-1;-1;TEST_STAYS;Still sea",
  "1;2;;-1;-1;-1;-1;-1;;Plain row",
  "3;4;;-1;-1;-1;-1;-1;BASE_LAND_RULE;A base rule that was on land already",
  "-1;-1;;-1;-1;-1;-1;-1;;",
  "",
].join("\r\n");                                                               // CRLF, like the base game's own

function makeGame() {
  const g = tmp("game");
  mk(path.join(g, "map", "definition.csv"), defn());
  mk(path.join(g, "map", "adjacencies.csv"), ADJ);
  mk(path.join(g, "map", "adjacency_rules.txt"), RULES);
  mk(path.join(g, "history", "states", "1-A.txt"), "state = {\n\tid = 1\n\tprovinces = { 1 2 3 4 15 }\n\thistory = { owner = AAA }\n}\n");
  return g;
}
const GAME = makeGame();
const DRIED = { 10: "land", 11: "land", 12: "land", 13: "land", 14: "land" };   // the strait and the canal's seas become land
function makeMod({ dry = true, portal = false } = {}) {
  const m = tmp("mod");
  mk(path.join(m, "descriptor.mod"), 'name="strait fixture"\n');
  if (dry) mk(path.join(m, "map", "definition.csv"), defn(DRIED));
  if (portal) {
    // the mod's OWN rule, joining land on purpose, as Hearts of Minecraft's portals do
    mk(path.join(m, "map", "adjacency_rules.txt"), RULES + "\n" + RULE("MY_PORTAL", 3));
    mk(path.join(m, "map", "adjacencies.csv"), ADJ.replace("1;2;;-1;-1;-1;-1;-1;;Plain row", "1;2;;-1;-1;-1;-1;-1;;Plain row\r\n3;4;;-1;-1;-1;-1;-1;MY_PORTAL;Portal"));
  }
  return m;
}
const ctx = (m) => ({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
const rowsFor = (m) => (md.validateMapModel(md.buildMapModel(ctx(m))) || []).filter((p) => p.rule === "adjacency_rule_left_on_land");

try {
  console.log("=== the rule ===");
  const MOD = makeMod({ portal: true });
  const rows = rowsFor(MOD);
  const names = rows.map((r) => r.items[0].name).sort();
  rec("⭐⭐⭐ it fires on the dried strait and the dried canal", names.join(",") === "TEST_CANAL,TEST_STRAIT", rows.map((r) => r.message));
  rec("⭐⭐⭐ not on the mod's own rule that joins land on purpose (a portal)", !names.includes("MY_PORTAL"));
  rec("⭐⭐ not on a base rule whose sea is still sea", !names.includes("TEST_STAYS"));
  rec("⭐⭐ not on a base rule that joined land already below the mod — this mod did not dry it", !names.includes("BASE_LAND_RULE"));
  rec("⭐⭐ it is a warning, not a crash", rows.every((r) => r.severity === "warning"));
  const strait = rows.find((r) => r.items[0].name === "TEST_STRAIT") || { items: [{}] };
  rec("⭐⭐ it names the provinces that were sea", (strait.items[0].provinces || []).slice().sort((a, b) => a - b).join(",") === "10,11,12", strait.items);
  rec("⭐⭐ a mod that did not change definition.csv is told nothing", rowsFor(makeMod({ dry: false })).length === 0);

  console.log("\n=== the fix ===");
  const r = md.fixAdjacencyRulesLeftOnLand(ctx(MOD));
  rec("⭐⭐⭐ it takes out exactly the two rules", r.fixed === 2 && r.rules.slice().sort().join(",") === "TEST_CANAL,TEST_STRAIT", r);
  rec("⭐⭐ …and the name off exactly their three rows", r.rowsCleared === 3, r);
  rec("…with no skips", !(r.skipped || []).length, r.skipped);
  rec("⭐⭐⭐ the rule is silent afterwards", rowsFor(MOD).length === 0, rowsFor(MOD).map((x) => x.message));
  const rulesOut = fs.readFileSync(path.join(MOD, "map", "adjacency_rules.txt"), "utf8");
  const live = md.parseAdjacencyRuleBlocks(rulesOut).map((b) => b.name).sort();
  rec("⭐⭐⭐ the rules file still defines the rule that keeps its sea and the mod's portal, and not the dried ones",
    live.join(",") === "BASE_LAND_RULE,MY_PORTAL,TEST_STAYS", live);
  rec("⭐⭐ the dried rule is commented out with a note, not deleted",
    /^#adjacency_rule =    # Nova: provinces 10, 11, 12 were sea below this mod/m.test(rulesOut) && /^#\tname = "TEST_STRAIT"$/m.test(rulesOut), rulesOut.slice(0, 300));
  const adjOut = fs.readFileSync(path.join(MOD, "map", "adjacencies.csv"), "utf8");
  const A = adjOut.split("\r\n");
  rec("⭐⭐⭐ each row keeps its connection and loses only the rule name",
    A.includes("10;11;;-1;-1;-1;-1;-1;;Strait North") && A.includes("10;12;;-1;-1;-1;-1;-1;;Strait South") && A.includes("13;14;sea;15;-1;-1;-1;-1;;Canal"), A);
  rec("⭐⭐ the rows of the rules that stay are untouched", A.includes("20;21;;-1;-1;-1;-1;-1;TEST_STAYS;Still sea") && A.includes("3;4;;-1;-1;-1;-1;-1;MY_PORTAL;Portal"));
  rec("⭐⭐ the CRLF file stays CRLF, same number of lines", (adjOut.match(/\r\n/g) || []).length === (adjOut.match(/\n/g) || []).length && A.length === ADJ.split("\r\n").length + 1);
  const again = md.fixAdjacencyRulesLeftOnLand(ctx(MOD));
  rec("⭐⭐⭐ a second click writes nothing", again.fixed === 0 && fs.readFileSync(path.join(MOD, "map", "adjacencies.csv"), "utf8") === adjOut, again);

  console.log("\n=== copying in ===");
  const BARE = makeMod();                                                    // ships definition.csv only
  const b = md.fixAdjacencyRulesLeftOnLand(ctx(BARE));
  rec("⭐⭐ a mod that ships neither file gets both copied in, and is told so",
    b.fixed === 2 && (b.materialised || []).slice().sort().join(",") === "map/adjacencies.csv,map/adjacency_rules.txt", b);

  console.log("\n=== the back-out control ===");
  const WET = makeMod({ dry: false });
  const w = md.fixAdjacencyRulesLeftOnLand(ctx(WET));
  rec("⭐⭐⭐ on a world that kept its seas, the fix writes nothing", w.fixed === 0 && !fs.existsSync(path.join(WET, "map", "adjacency_rules.txt")), w);

  console.log("\n=== Auto-fix all ===");
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const a = src.indexOf("fixes.adjacencyTypes = fixAdjacenciesForProvinceTypes(");
  const c = src.indexOf("fixes.rulesOnLand = fixAdjacencyRulesLeftOnLand(");
  rec("⭐⭐ autoFixMap runs it, after the pass that retypes the rows", a !== -1 && c > a, { a, c });
} finally {
  for (const d of tmps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
