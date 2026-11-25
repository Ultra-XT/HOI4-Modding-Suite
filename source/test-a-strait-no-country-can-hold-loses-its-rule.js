// ⚓ #a-strait-nobody-can-hold — TEST 32's SUEZ, BOSPHORUS, DARDANELLES and OTRANTO, and the DANISH BELTS and KIEL it missed.
//
// A strait rule in map/adjacency_rules.txt is decided by who CONTROLS the provinces it lists as required. The rules file's own
// header: the enemy rule when a controller is at war with the country crossing, the friend rule for an ally, "Otherwise the
// neutral rule is used". On the owner's generated world every required province of those four rules is sea, and a sea province
// has no controller — so each is neutral for every country, for good, and vanilla's BOSPHORUS and DARDANELLES are
// `neutral = { army = no navy = no submarine = no trade = yes }`. Measured on the rehearsal t32b: 21 required provinces not land
// (0 of 546 across the 160 rules of the eight installed maps that own definition.csv), and adjacencyRulesLeftOnLand said [].
//
// It said [] for DANISH_BELTS and KIEL too, which are the other way round (the sea under them was raised): their rows run
// sea→land, and the finder wanted every row land→land — while the rule's own label promised "the Danish straits".
//
// What it pins, on a fixture of its own (types below → types in the mod):
//   DROWNED      required land drowned, its row still sea↔sea            → adjacency_rule_nobody_can_hold
//   ARMY_STRAIT  Millennium Dawn's TORRES shape: a `sea` row land/land across sea, required = its ends; the mod drowns the ends
//                and raises the sea. Its base rows never joined water, so a gate on that hid it    → nobody_can_hold
//   BELT         the DANISH shape: a blank sea/sea row whose far end the mod raised                 → adjacency_rule_left_on_land
//   CANAL_END    the KIEL shape: a canal sea/sea through land, one end raised and the land drowned  → left_on_land (reported once)
//   LAKED        required land made lake and sea: the words come off the types it has now, not "sea"  → nobody_can_hold
//   SHORE        a rule whose base row ran sea→land, never water to water, now land to land          → left_on_land
//   HOLDS, PART (one of two required drowned), NEVER_HELD (required sea already below), MY_PORTAL (the mod's own rule over
//   drowned land), REPOINTED (the modder moved the base rule onto land rows of their own; its sea is still sea) → all live.
// …the fix's per-kind notes, names off exactly their rows, the row count, CRLF, a second click, an unchanged mod, the summary;
// and an OPEN rule nobody holds (Otranto's shape), which is only its icon: reported only where no file is copied in for it.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), "nova-nobody-holds-"));
const APP = path.join(SCRATCH, "appdata");
fs.mkdirSync(APP, { recursive: true });
process.env.APPDATA = APP; process.env.NOVA_APP_DATA_DIR = APP; process.env.XDG_CONFIG_HOME = APP;
process.env.NOVA_HOME_DIR = path.join(SCRATCH, "home");
const md = require(path.join(__dirname, "map-data.js"));
const labels = require(path.join(__dirname, "public", "map-rule-labels.js"));
const P = require(path.join(__dirname, "testlib-map-page.js"));

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 600))); fails.push(name); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
let seq = 0;
const dir = (tag) => path.join(SCRATCH, tag + "-" + (++seq));

// ── the fixture ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const L = "land", S = "sea", K = "lake";
const BELOW = {
  1: L, 2: L, 40: S, 41: S,                      // HOLDS
  3: L, 4: L, 42: S, 43: S,                      // DROWNED (and MY_PORTAL's required)
  5: L, 6: L, 44: S, 45: S,                      // PART
  7: L, 8: L, 30: S, 31: S,                      // BELT
  13: S, 14: S, 15: L,                           // CANAL_END
  50: S, 51: S, 52: S, 53: S,                    // NEVER_HELD
  60: L, 61: L, 62: S,                           // ARMY_STRAIT
  70: S, 71: S, 72: L, 73: L, 74: L, 75: L,      // REPOINTED
  80: L, 81: L,                                  // MY_PORTAL's rows
  9: L, 10: L, 46: S, 47: S,                     // LAKED
  33: S, 34: L,                                  // SHORE
};
const MOD = { 3: S, 4: S, 5: S, 31: L, 14: L, 15: S, 60: S, 61: S, 62: L, 9: K, 10: S, 33: L };
const NOW = { ...BELOW, ...MOD };
const defn = (types) => ["0;0;0;0;land;false;unknown;0"].concat(Object.keys(types).map((id) =>
  `${id};${id};${id * 3};${id * 7};${types[id]};false;${types[id] === L ? "plains" : types[id] === K ? "lakes" : "ocean"};${types[id] === L ? 1 : 0}`)).join("\n") + "\n";
const NEUTRAL_SHUT = "\tneutral =\n\t{\n\t\tarmy = no\n\t\tnavy = no\n\t\tsubmarine = no\n\t\ttrade = yes\n\t}\n";
const NEUTRAL_OPEN = "\tneutral =\n\t{\n\t\tarmy = yes\n\t\tnavy = yes\n\t\tsubmarine = yes\n\t\ttrade = yes\n\t}\n";
const RULE = (name, required, icon, neutral = NEUTRAL_OPEN, extra = "") => `adjacency_rule =\n{\n\tname = "${name}"\n\n\tenemy =\n\t{\n\t\tarmy = no\n\t\tnavy = no\n\t\tsubmarine = yes\n\t\ttrade = no\n\t}\n${neutral}${extra}\trequired_provinces = { ${required.join(" ")} }\n\n\ticon = ${icon}\n\toffset = { 0 0 0 }\n}\n`;
const RULES = [
  RULE("HOLDS", [1, 2], 40), RULE("DROWNED", [3, 4], 3, NEUTRAL_SHUT), RULE("PART", [5, 6], 44), RULE("BELT", [7, 8], 31),
  RULE("CANAL_END", [15], 15, NEUTRAL_SHUT), RULE("NEVER_HELD", [50, 51], 52), RULE("ARMY_STRAIT", [60, 61], 62), RULE("REPOINTED", [74, 75], 70),
  RULE("LAKED", [9, 10], 9, NEUTRAL_SHUT), RULE("SHORE", [34], 33),
].join("\n");
const HEADER = "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment";
const BASE_ROWS = [
  "40;41;;-1;-1;-1;-1;-1;HOLDS;Holds",
  "42;43;;-1;-1;-1;-1;-1;DROWNED;Drowned",
  "44;45;;-1;-1;-1;-1;-1;PART;Part",
  "30;31;;-1;-1;-1;-1;-1;BELT;Belt",
  "13;14;sea;15;-1;-1;-1;-1;CANAL_END;Canal end",
  "52;53;;-1;-1;-1;-1;-1;NEVER_HELD;Never held",
  "60;61;sea;62;-1;-1;-1;-1;ARMY_STRAIT;Army strait",
  "70;71;;-1;-1;-1;-1;-1;REPOINTED;Repointed",
  "46;47;;-1;-1;-1;-1;-1;LAKED;Laked",
  "33;34;;-1;-1;-1;-1;-1;SHORE;Shore",
  "1;2;;-1;-1;-1;-1;-1;;Plain row",
];
const END = "-1;-1;-1;-1;-1;-1;-1;-1;-1";
const csv = (rows) => [HEADER, ...rows, END, ""].join("\r\n");          // CRLF, like the base game's own
// the mod's own file: REPOINTED moved onto a land pair of the modder's, the base row kept and freed; and MY_PORTAL's own row
const MOD_ROWS = BASE_ROWS.map((r) => (r.startsWith("70;71;") ? "70;71;;-1;-1;-1;-1;-1;;Repointed" : r))
  .concat(["72;73;;-1;-1;-1;-1;-1;REPOINTED;Moved by the modder", "80;81;;-1;-1;-1;-1;-1;MY_PORTAL;Portal"]);

function makeWorld({ changed = true, terrainOnly = false } = {}) {
  const d = dir("w"), game = path.join(d, "game"), mod = path.join(d, "mod");
  mk(path.join(game, "map", "definition.csv"), defn(BELOW));
  mk(path.join(game, "map", "adjacencies.csv"), csv(BASE_ROWS));
  mk(path.join(game, "map", "adjacency_rules.txt"), RULES);
  mk(path.join(mod, "descriptor.mod"), 'name="nobody holds"\n');
  if (terrainOnly) mk(path.join(mod, "map", "definition.csv"), defn(BELOW).replace("\n1;1;3;7;land;false;plains;1\n", "\n1;1;3;7;land;false;hills;1\n"));
  else if (changed) {
    mk(path.join(mod, "map", "definition.csv"), defn(NOW));
    mk(path.join(mod, "map", "adjacencies.csv"), csv(MOD_ROWS));
    mk(path.join(mod, "map", "adjacency_rules.txt"), RULES + "\n" + RULE("MY_PORTAL", [3, 4], 80));
  }
  return { modRoot: mod, gameRoot: game, dependencyRoots: [] };
}
// ── an OPEN rule nobody holds: its neutral block lets every unit through and no trigger can change that. Vanilla's OTRANTO is
// one (TEST 32 drowned it); SUEZ is not — its is_disabled, which the Italo-Ethiopian war's sanctions and a decision set, still
// shuts it. Once nobody holds an open rule its crossing is as open as with no rule and only its icon is left, and copying the
// base's two files into a mod for an icon is the whole-file override #inherited-problem-not-yours is about.
const BLOCK = "\tis_disabled =\n\t{\n\t\thas_global_flag = BLOCKABLE_BLOCKED\n\t}\n";
const OPEN_SET = { OPEN_ONLY: { required: [1, 2], neutral: NEUTRAL_OPEN, extra: "" }, BLOCKABLE: { required: [3, 4], neutral: NEUTRAL_OPEN, extra: BLOCK } };
const OPEN_BELOW = { 1: L, 2: L, 3: L, 4: L, 40: S, 41: S, 42: S, 43: S };
const OPEN_ROWS = ["40;41;;-1;-1;-1;-1;-1;OPEN_ONLY;Open", "42;43;;-1;-1;-1;-1;-1;BLOCKABLE;Blockable"];
const OPEN_RULES = Object.entries(OPEN_SET).map(([n, x]) => RULE(n, x.required, x.required[0], x.neutral, x.extra)).join("\n");
// the oracle: the all-yes neutral block, and none of the four triggers the rules file's header names
const inert = (n) => OPEN_SET[n].neutral === NEUTRAL_OPEN && !/(^|\s)is_(disabled|enemy|friend|neutral)\s*=/.test(OPEN_SET[n].extra);
function makeOpenWorld(drown, { own = [] } = {}) {
  const d = dir("open"), game = path.join(d, "game"), mod = path.join(d, "mod");
  mk(path.join(game, "map", "definition.csv"), defn(OPEN_BELOW));
  mk(path.join(game, "map", "adjacencies.csv"), csv(OPEN_ROWS));
  mk(path.join(game, "map", "adjacency_rules.txt"), OPEN_RULES);
  mk(path.join(mod, "descriptor.mod"), 'name="open rules"\n');
  const now = { ...OPEN_BELOW };
  for (const n of drown) for (const p of OPEN_SET[n].required) now[p] = S;
  mk(path.join(mod, "map", "definition.csv"), defn(now));
  if (own.includes("csv")) mk(path.join(mod, "map", "adjacencies.csv"), csv(OPEN_ROWS));
  if (own.includes("rules")) mk(path.join(mod, "map", "adjacency_rules.txt"), OPEN_RULES);
  return { modRoot: mod, gameRoot: game, dependencyRoots: [] };
}
const problems = (ctx) => md.validateMapModel(md.buildMapModel(ctx)) || [];
const named = (ps, rule) => ps.filter((p) => p.rule === rule).map((p) => p.items[0].name).sort();

// ── the oracle: the two statements of the rule, read off the fixture's own tables ──────────────────────────────────────────
const water = (t) => t === S || t === "lake";
const required = {};
for (const m of RULES.matchAll(/name = "(\w+)"[\s\S]*?required_provinces = \{ ([\d ]+) \}/g)) required[m[1]] = m[2].trim().split(/\s+/).map(Number);
const rowsOf = (rows, name) => rows.map((r) => r.split(";")).filter((c) => c[8] === name).map((c) => ({ from: +c[0], to: +c[1] }));
const baseNames = [...new Set(BASE_ROWS.map((r) => r.split(";")[8]).filter(Boolean))];
const expectSea = baseNames.filter((n) => {
  const was = rowsOf(BASE_ROWS, n), now = rowsOf(MOD_ROWS, n);
  // every row joins land to land now, or no row joins water to water now where one did below — and a province the base
  // crossed water at is land now
  return now.length && (now.every((x) => NOW[x.from] === L && NOW[x.to] === L)
      || (was.some((x) => water(BELOW[x.from]) && water(BELOW[x.to])) && !now.some((x) => water(NOW[x.from]) && water(NOW[x.to]))))
    && was.some((x) => [x.from, x.to].some((p) => water(BELOW[p]) && NOW[p] === L));
}).sort();
const expectLand = baseNames.filter((n) => !expectSea.includes(n) && rowsOf(MOD_ROWS, n).length
  && required[n].every((p) => NOW[p] !== L) && required[n].some((p) => BELOW[p] === L)).sort();
// the provinces each message and note names: the base's water ends that are land now, the required land that is sea now
const wasSeaOf = (n) => [...new Set(rowsOf(BASE_ROWS, n).flatMap((x) => [x.from, x.to]))].filter((p) => water(BELOW[p]) && NOW[p] === L);
const wasLandOf = (n) => required[n].filter((p) => BELOW[p] === L);

try {
  console.log("=== THE CONTROLS: the fixture can tell right from wrong ===");
  rec("THE CONTROL: the oracle finds exactly the six shapes this file is about, three of each kind",
    expectLand.join(",") === "ARMY_STRAIT,DROWNED,LAKED" && expectSea.join(",") === "BELT,CANAL_END,SHORE", { expectLand, expectSea });
  rec("THE CONTROL: LAKED's required land is lake and sea now, so a gate that wants it all sea misses it",
    required.LAKED.some((p) => NOW[p] === K) && required.LAKED.some((p) => NOW[p] === S) && required.LAKED.every((p) => BELOW[p] === L));
  rec("THE CONTROL: SHORE's base row ran sea to land, never water to water, and joins land to land now — only that last test sees it",
    rowsOf(BASE_ROWS, "SHORE").every((x) => !(water(BELOW[x.from]) && water(BELOW[x.to]))) && rowsOf(MOD_ROWS, "SHORE").every((x) => NOW[x.from] === L && NOW[x.to] === L));
  const landToLand = (n) => rowsOf(MOD_ROWS, n).every((x) => NOW[x.from] === L && NOW[x.to] === L);
  rec("THE CONTROL: no row of BELT or CANAL_END joins land to land, so the first finder's one test could not see them",
    !landToLand("BELT") && !landToLand("CANAL_END"));
  rec("THE CONTROL: REPOINTED's rows now join land to land, so that test alone would take the modder's rule out",
    landToLand("REPOINTED") && rowsOf(MOD_ROWS, "REPOINTED").length === 1);
  rec("THE CONTROL: ARMY_STRAIT's base row joined land to land, so a gate on its rows joining water hides it",
    rowsOf(BASE_ROWS, "ARMY_STRAIT").every((x) => BELOW[x.from] === L && BELOW[x.to] === L));
  rec("THE CONTROL: CANAL_END is both kinds at once — its one required province drowned as well", required.CANAL_END.every((p) => NOW[p] !== L && BELOW[p] === L));

  console.log("\n=== the rules ===");
  const W = makeWorld();
  const ps = problems(W);
  rec("⭐⭐⭐ nobody_can_hold fires on exactly the rules whose required land all drowned", named(ps, "adjacency_rule_nobody_can_hold").join(",") === expectLand.join(","),
    named(ps, "adjacency_rule_nobody_can_hold"));
  rec("⭐⭐⭐ left_on_land fires on exactly the rules whose passage is gone — the DANISH and KIEL shapes",
    named(ps, "adjacency_rule_left_on_land").join(",") === expectSea.join(","), named(ps, "adjacency_rule_left_on_land"));
  for (const n of ["HOLDS", "PART", "NEVER_HELD", "MY_PORTAL", "REPOINTED"]) {
    rec(`⭐⭐ ${n} is not reported`, !ps.some((p) => /^adjacency_rule_/.test(p.rule) && p.items[0].name === n), ps.filter((p) => /^adjacency_rule_/.test(p.rule) && p.items[0].name === n).map((p) => p.message));
  }
  const one = (rule, n) => ps.find((p) => p.rule === rule && p.items[0].name === n) || { items: [{}], message: "" };
  const drowned = one("adjacency_rule_nobody_can_hold", "DROWNED");
  rec("⭐⭐ DROWNED names its required provinces, and the ones that were land below", (drowned.items[0].provinces || []).join(",") === required.DROWNED.join(",")
    && (drowned.items[0].wasLand || []).join(",") === wasLandOf("DROWNED").join(","), drowned.items);
  // the words come off the rule's own neutral block: DROWNED's says no to all three, ARMY_STRAIT's to none
  rec("⭐⭐ …and says its neutral settings, read off its own block, shut it to armies, navies and submarines",
    /shut it to armies, navies and submarines/.test(drowned.message), drowned.message);
  rec("⭐⭐ …and names the source of that: the rules file's own header", /rules file's own header/.test(drowned.message), drowned.message);
  rec("⭐⭐ …and where its icon stands, at sea", drowned.message.includes(`Its icon stands on province 3, which is sea in your map`), drowned.message);
  const army = one("adjacency_rule_nobody_can_hold", "ARMY_STRAIT");
  rec("⭐⭐ ARMY_STRAIT's neutral block shuts nothing, so its message claims nothing shut, and its icon on land is not called sea",
    army.message && !/shut it to/.test(army.message) && !/Its icon stands/.test(army.message), army.message);
  // #a-strait-nobody-can-hold — the gate is "not land", so the words must come off the types too: "are sea now" was said of a lake
  const laked = one("adjacency_rule_nobody_can_hold", "LAKED");
  const lakedNow = wasLandOf("LAKED").map((p) => `${NOW[p]} (${p})`).join(" and ");
  rec("⭐⭐ LAKED's message words each province by the type it has now — a lake is not called sea",
    laked.message.includes(`${wasLandOf("LAKED").join(", ")} were land beneath your mod and are ${lakedNow} now`) && !/are sea now/.test(laked.message), laked.message);
  rec("⭐⭐ …and its icon, on the lake, is called lake", laked.message.includes(`Its icon stands on province ${required.LAKED[0]}, which is ${NOW[required.LAKED[0]]} in your map`), laked.message);
  const belt = one("adjacency_rule_left_on_land", "BELT"), kiel = one("adjacency_rule_left_on_land", "CANAL_END");
  rec("THE CONTROL: BELT and CANAL_END each crossed water at one province that is land now", wasSeaOf("BELT").length === 1 && wasSeaOf("CANAL_END").length === 1);
  rec("⭐⭐ BELT and CANAL_END name the province the base crossed water at that is land now",
    (belt.items[0].provinces || []).join(",") === wasSeaOf("BELT").join(",") && (kiel.items[0].provinces || []).join(",") === wasSeaOf("CANAL_END").join(","), [belt.items, kiel.items]);
  rec("⭐⭐ CANAL_END is reported once, not under both rules", ps.filter((p) => /^adjacency_rule_/.test(p.rule) && p.items[0].name === "CANAL_END").length === 1);
  rec("⭐⭐ …and the message no longer says its rows join land to land", /joins water to water/.test(belt.message) && !/join land to land/.test(belt.message), belt.message);
  const mine = ps.filter((p) => /^adjacency_rule_/.test(p.rule));
  rec("⭐⭐ all are warnings, not in the fatal set, each with a label and a long text of its own",
    mine.every((p) => p.severity === "warning" && !labels.isFatalRule(p.rule) && labels.LABELS[p.rule] && labels.mapRuleFixHint(p.rule).length > 40));
  rec("⭐⭐ a mod that did not change definition.csv is told nothing", problems(makeWorld({ changed: false })).filter((p) => /^adjacency_rule_/.test(p.rule)).length === 0);

  console.log("\n=== the fix ===");
  const before = fs.readFileSync(path.join(W.modRoot, "map", "adjacencies.csv"), "utf8");
  const r = md.fixAdjacencyRulesLeftOnLand(W);
  const gone = expectLand.concat(expectSea).sort();
  rec("⭐⭐⭐ it takes out exactly those rules", r.fixed === gone.length && r.rules.slice().sort().join(",") === gone.join(","), r);
  rec("⭐⭐ …and says which kind each was", (r.byKind || {}).land && r.byKind.land.slice().sort().join(",") === expectLand.join(",") && r.byKind.sea.slice().sort().join(",") === expectSea.join(","), r.byKind);
  const carried = MOD_ROWS.filter((row) => gone.includes(row.split(";")[8])).length;
  rec("⭐⭐ …and the name off exactly their rows", r.rowsCleared === carried && !(r.skipped || []).length, { r, carried });
  const rulesOut = fs.readFileSync(path.join(W.modRoot, "map", "adjacency_rules.txt"), "utf8");
  const live = md.parseAdjacencyRuleBlocks(rulesOut).map((b) => b.name).sort();
  const defined = [...(RULES + "\n" + RULE("MY_PORTAL", [3, 4], 80)).matchAll(/name = "(\w+)"/g)].map((x) => x[1]);
  rec("⭐⭐⭐ the rules file still defines every other rule", live.join(",") === defined.filter((n) => !gone.includes(n)).sort().join(","), { live, defined });
  const lines = rulesOut.split("\n");
  rec("⭐⭐ a rule nobody can hold is commented out with a note that says so",
    lines.includes(`#adjacency_rule =    # Nova: provinces ${wasLandOf("DROWNED").join(", ")} were land below this mod and are sea in this map, so no country can hold this strait any more`)
    && lines.includes(`#\tname = "DROWNED"`), rulesOut.slice(0, 400));
  rec("⭐⭐ …and LAKED's note says lake where the map has a lake, in the modder's own file",
    lines.includes(`#adjacency_rule =    # Nova: provinces ${wasLandOf("LAKED").join(", ")} were land below this mod and are ${lakedNow} in this map, so no country can hold this strait any more`),
    lines.filter((l) => /Nova:/.test(l)));
  rec("⭐⭐ …and one whose sea is gone keeps the note it always had",
    lines.includes(`#adjacency_rule =    # Nova: provinces ${wasSeaOf("BELT").join(", ")} were sea below this mod and are land in this map, so there is no strait here any more`));
  const after = fs.readFileSync(path.join(W.modRoot, "map", "adjacencies.csv"), "utf8");
  const A = after.split("\r\n"), B = before.split("\r\n");
  rec("⭐⭐⭐ every row keeps its connection: same rows, in the same order, only column 9 emptied on theirs",
    A.length === B.length && A.every((ln, i) => ln === B[i] || (gone.includes(B[i].split(";")[8]) && ln === B[i].split(";").map((c, k) => (k === 8 ? "" : c)).join(";"))), { A, B });
  rec("⭐⭐ the CRLF file stays CRLF", (after.match(/\r\n/g) || []).length === (after.match(/\n/g) || []).length);
  rec("⭐⭐⭐ the rules are silent afterwards", problems(W).filter((p) => /^adjacency_rule_/.test(p.rule)).length === 0, problems(W).filter((p) => /^adjacency_rule_/.test(p.rule)).map((p) => p.message));
  const again = md.fixAdjacencyRulesLeftOnLand(W);
  rec("⭐⭐⭐ a second click writes nothing", again.fixed === 0 && fs.readFileSync(path.join(W.modRoot, "map", "adjacencies.csv"), "utf8") === after
    && fs.readFileSync(path.join(W.modRoot, "map", "adjacency_rules.txt"), "utf8") === rulesOut, again);
  const T = makeWorld({ terrainOnly: true });
  rec("THE CONTROL: that mod did change definition.csv", fs.readFileSync(path.join(T.modRoot, "map", "definition.csv"), "utf8") !== defn(BELOW));
  const t = md.fixAdjacencyRulesLeftOnLand(T);
  rec("⭐⭐ a mod whose definition.csv changed only a terrain gets no write", t.fixed === 0 && !fs.existsSync(path.join(T.modRoot, "map", "adjacency_rules.txt"))
    && !fs.existsSync(path.join(T.modRoot, "map", "adjacencies.csv")), t);

  console.log("\n=== the summary ===");
  // it said "because their land is sea", which LAKED's lake is not
  const line = P.autoFixSummary({ ok: true, fixes: { rulesOnLand: r } });
  rec("⭐⭐ the Auto-fix summary names both kinds, and each rule under its own",
    line.includes(`${expectSea.length} whose sea is land in this map (`) && line.includes(`${expectLand.length} that no country could hold any more because none of their land is left (`)
    && gone.every((n) => line.includes(n)) && /their crossings stay as plain links/.test(line), line.slice(0, 600));

  console.log("\n=== an open rule nobody holds ===");
  const NOBODY = "adjacency_rule_nobody_can_hold";
  const owns = (ctx, f) => fs.existsSync(path.join(ctx.modRoot, "map", f));
  rec("THE CONTROL: by the oracle OPEN_ONLY is open and BLOCKABLE is not, for its is_disabled alone",
    inert("OPEN_ONLY") && !inert("BLOCKABLE") && OPEN_SET.OPEN_ONLY.neutral === OPEN_SET.BLOCKABLE.neutral);
  const o1 = makeOpenWorld(["OPEN_ONLY"]);
  rec("⭐⭐⭐ alone, in a mod that ships neither file, an open rule nobody holds is not reported", named(problems(o1), NOBODY).length === 0, named(problems(o1), NOBODY));
  const f1 = md.fixAdjacencyRulesLeftOnLand(o1);
  rec("⭐⭐⭐ …and Auto-fix copies neither file in for its icon", f1.fixed === 0 && !owns(o1, "adjacency_rules.txt") && !owns(o1, "adjacencies.csv"), f1);
  const o5 = makeOpenWorld(["OPEN_ONLY"], { own: ["csv"] });
  rec("⭐⭐ …nor in a mod that ships only adjacencies.csv (as the row retype leaves one): the rules file would still be copied in",
    named(problems(o5), NOBODY).length === 0 && md.fixAdjacencyRulesLeftOnLand(o5).fixed === 0 && !owns(o5, "adjacency_rules.txt"));
  const o2 = makeOpenWorld(["BLOCKABLE"]);
  const p2 = problems(o2).find((p) => p.rule === NOBODY) || { items: [{}], message: "" };
  rec("⭐⭐⭐ the same open rule with an is_disabled trigger is reported alone — the trigger can still shut it", p2.items[0].name === "BLOCKABLE", p2);
  rec("⭐⭐ …and says so, naming the trigger off its own block, and does not call its crossing open",
    /, though its is_disabled trigger can still change that/.test(p2.message) && !/as open as it would be with no rule/.test(p2.message), p2.message);
  const f2 = md.fixAdjacencyRulesLeftOnLand(o2);
  rec("⭐⭐ …and Auto-fix takes it out, copying both files in", f2.fixed === 1 && f2.rules.join() === "BLOCKABLE"
    && f2.materialised.slice().sort().join() === "map/adjacencies.csv,map/adjacency_rules.txt", f2);
  const o3 = makeOpenWorld(Object.keys(OPEN_SET));
  const ps3 = problems(o3);
  rec("⭐⭐⭐ beside a rule that copies the files in anyway, the open one rides along: both are reported", named(ps3, NOBODY).join() === Object.keys(OPEN_SET).sort().join(), named(ps3, NOBODY));
  const m3 = (ps3.find((p) => p.rule === NOBODY && p.items[0].name === "OPEN_ONLY") || {}).message || "";
  rec("⭐⭐ …and the open one says plainly that its crossing is as open as with no rule, and only its icon is left",
    /its neutral settings let every unit through, so the crossing is as open as it would be with no rule: all that is left of it is its icon/.test(m3) && !/trigger/.test(m3), m3);
  const f3 = md.fixAdjacencyRulesLeftOnLand(o3);
  rec("⭐⭐ …and one click takes both out", f3.fixed === Object.keys(OPEN_SET).length && f3.rules.slice().sort().join() === Object.keys(OPEN_SET).sort().join(), f3);
  const o4 = makeOpenWorld(["OPEN_ONLY"], { own: ["csv", "rules"] });
  rec("⭐⭐⭐ in a mod that ships both files the open rule is reported alone, since taking its icon away copies nothing",
    named(problems(o4), NOBODY).join() === "OPEN_ONLY", named(problems(o4), NOBODY));
  const f4 = md.fixAdjacencyRulesLeftOnLand(o4);
  rec("⭐⭐ …and Auto-fix takes it out, writing only the mod's own two files", f4.fixed === 1 && f4.materialised.length === 0 && f4.files.length === 2, f4);
} finally {
  try { fs.rmSync(SCRATCH, { recursive: true, force: true }); } catch (_) {}
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
