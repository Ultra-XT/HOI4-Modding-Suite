// A country whose land had a coast is kept on the ocean, and one that is not is said. #a-kept-country-keeps-its-coast
//
// THE DEFECT (review RK3-1). The keep pass gives a country left with no state the nearest group a neighbour can spare, and nothing
// else: once the nearer coasts had gone to other kept countries, the owner's flow at 25% seed 4 put Palestine, Yemen and Panama on
// landlocked land 14 to 20 hops off, and at 20% seed 7 Peru, whose navy then had no home (fleet_starts_off_land 8). At 35% seed 2 the
// pass took the state holding Palestine's coast — the one a channel had been kept open for — for Lebanon. And nothing said any of it:
// only a piece a kept channel opened was ever asked again.
//
// THE FIX, the half this file pins (the end-to-end half is §12 and §15 of test-a-kept-coast-keeps-its-sea.js):
//   1. tagsWithACoastBelow, pure — a country whose land below touched a province that was not land below and is no lake;
//   2. keepEveryCountryBelow, pure — such a country (`wantsCoast`) counts a group that opens onto no ocean `coastSlack` hops farther,
//      the ocean's first on a tie (KEPT_COUNTRY_COAST_SLACK by default), and such a donor keeps its last group on the ocean;
//   3. the page says a country whose land had a coast and touches no ocean now (countries.noOceanCoast), a kept one as kept, and not
//      twice for one the kept coasts already name.
// Every expectation is derived from the hand graphs below and the exported slack, never typed in. Fixture-only: binds no port.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!ok) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-keptcountry-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
process.env.HOI4_MODS_ROOT = SANDBOX;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

// ── 1. tagsWithACoastBelow ──────────────────────────────────────────────────────────────────────────────────────────────────────
// AAA's land touches the sea (9); BBB's only a lake (10); CCC's a province an earlier click raised from the sea below (11: land in the
// world before the click, not land below); DDD's only land below; EEE holds a province that is not land below (a fact of no land),
// beside the sea. Expected: the owners whose land-below provinces touch a province neither land below nor a lake.
{
  const edges = [[1, 2], [2, 9], [3, 10], [3, 4], [5, 11], [6, 1], [6, 3], [6, 5], [12, 9]];
  const adj = new Map();
  for (const [a, b] of edges) for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); }
  const land = new Set([1, 2, 3, 4, 5, 6]);
  const typeOf = (p) => ({ 9: "sea", 10: "lake", 11: "land", 12: "sea" })[p] || "land";
  const facts = new Map([[1, { owner: "AAA" }], [2, { owner: "AAA" }], [3, { owner: "BBB" }], [4, { owner: "BBB" }], [5, { owner: "CCC" }], [6, { owner: "DDD" }], [12, { owner: "EEE" }]]);
  const oracle = (tOf) => [...new Set([...facts].filter(([p]) => land.has(p) && [...adj.get(p)].some((q) => !land.has(q) && ["sea", "land"].includes(tOf(q)))).map(([, f]) => f.owner))].sort();
  const want = oracle(typeOf);
  rec("1a. (the fixture) the oracle names AAA and CCC, and with the lake read as sea BBB too: the fixture tells a lake from the sea", JSON.stringify(want) === JSON.stringify(["AAA", "CCC"])
    && JSON.stringify(oracle((p) => (typeOf(p) === "lake" ? "sea" : typeOf(p)))) === JSON.stringify(["AAA", "BBB", "CCC"]), want);
  const got = [...md.tagsWithACoastBelow({ facts, land, typeOf, adj })].sort();
  rec("1b. the countries whose land below touched the sea, a lake not counted, nor a province that was no land below", JSON.stringify(got) === JSON.stringify(want), got);
  rec("1c. no land below (a mod with no map beneath it): nobody", md.tagsWithACoastBelow({ facts, land: null, typeOf, adj }).size === 0);
}

// ── 2. keepEveryCountryBelow, a country whose land had a coast ──────────────────────────────────────────────────────────────────
// A line of provinces 1..n: NNN held province 1 below; each other province is one group of DDD's (id 100 + province), the last DDD's
// capital. `coast` the provinces whose group opens onto the ocean. NNN's nearest group is province 2's, `hops` 1.
const SLACK = md.KEPT_COUNTRY_COAST_SLACK;
const line = (n, coast) => {
  const adj = new Map();
  for (let p = 1; p <= n; p++) adj.set(p, [p - 1, p + 1].filter((q) => q >= 1 && q <= n));
  const groups = [];
  for (let p = 2; p <= n; p++) groups.push({ id: 100 + p, provinces: [p] });
  return { adj, groups, ownerOf: new Map(groups.map((g) => [g.id, "DDD"])), facts: new Map([[1, { owner: "NNN" }], ...groups.map((g) => [g.provinces[0], { owner: "DDD" }])]),
    protect: new Set([100 + n]), oceanCoast: (g) => coast.includes(g.provinces[0]) };
};
const keep = (w, extra) => md.keepEveryCountryBelow(Object.assign({ groups: w.groups, facts: w.facts, adj: w.adj, ownerOf: w.ownerOf, protect: w.protect, oceanCoast: w.oceanCoast }, extra || {}));
{
  rec("2a. (the slack) map-data.js exports a whole number of hops above 0", Number.isInteger(SLACK) && SLACK > 0, SLACK);
  const near = 2, within = 2 + SLACK, beyond = 3 + SLACK, n = beyond + 3;
  const at = (r) => (r.kept[0] || {}).state - 100;
  const a = keep(line(n, [within]), { wantsCoast: new Set(["NNN"]) });
  rec(`2b. a group on the ocean ${SLACK} hops farther than the nearest is taken (province ${within}, not ${near})`, a.kept.length === 1 && at(a) === within && a.kept[0].hops === within - 1, a.kept);
  const b = keep(line(n, [beyond]), { wantsCoast: new Set(["NNN"]) });
  rec(`2c. one ${SLACK + 1} hops farther is not: the nearest (province ${near})`, b.kept.length === 1 && at(b) === near, b.kept);
  const c = keep(line(n, [within]));
  rec("2d. CONTROL: a country whose land had no coast takes the nearest", c.kept.length === 1 && at(c) === near, c.kept);
  const d = keep(line(n, [within]), { wantsCoast: new Set(["NNN"]), coastSlack: SLACK - 1 });
  rec("2e. the slack is the bound: one hop less, and the nearest", d.kept.length === 1 && at(d) === near, d.kept);
  // a tie of the counted hops goes to the ocean: with a slack of 1, the coast one hop farther than the nearest is as near
  const e = keep(line(n, [near + 1]), { wantsCoast: new Set(["NNN"]), coastSlack: 1 });
  rec("2f. on a tie of the counted hops the group on the ocean goes first", e.kept.length === 1 && at(e) === near + 1, e.kept);
  const f = keep(line(n, [near]), { wantsCoast: new Set(["NNN"]) });
  rec("2g. CONTROL: the nearest on the ocean is simply the nearest", f.kept.length === 1 && at(f) === near, f.kept);
}
// …and a donor whose land had a coast keeps its last group on the ocean: DDD's only coast is province 2's group, NNN's nearest
{
  const hold = keep(line(6, [2]), { wantsCoast: new Set(["DDD"]) });
  rec("2h. a donor whose land had a coast keeps its last group on the ocean: NNN takes the next one, and the hold is counted", hold.kept.length === 1 && hold.kept[0].state === 103
    && hold.heldByCoast === 1, hold);
  const give = keep(line(6, [2]));
  rec("2i. CONTROL: a donor whose land had none gives it", give.kept.length === 1 && give.kept[0].state === 102 && give.heldByCoast === 0, give.kept);
  const two = keep(line(6, [2, 4]), { wantsCoast: new Set(["DDD"]) });
  rec("2j. CONTROL: a donor with another group on the ocean gives this one", two.kept.length === 1 && two.kept[0].state === 102 && two.heldByCoast === 0, two.kept);
}

// ── 3. the page says it ─────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const vm = require("vm");
  const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const at = MASKED.indexOf("function generatedCountriesNote("), body = at < 0 ? null : jsBodyAt(MASKED, at);
  rec("3a. public/map.js has generatedCountriesNote", !!body);
  const note = body ? vm.runInNewContext("(" + PAGE.slice(at, body[1] + 1) + ")") : () => "";
  const dry = [{ tag: "PRU", provinces: 2, kept: true }, { tag: "GRE", provinces: 3 }];
  const said = note({ countries: { kept: [], stillGone: [], capitals: {}, noOceanCoast: dry } });
  rec("3b. every country whose land had a coast and touches no ocean now is warned of, by name, a kept one as kept", /⚠/.test(said) && said.includes(`${dry.length} countries`)
    && said.includes("PRU (kept on new land)") && said.includes("GRE") && !said.includes("GRE (kept") && /no ocean now/.test(said), said);
  const once = note({ countries: { kept: [], stillGone: [], capitals: {}, noOceanCoast: dry }, keptCoasts: { stillWalled: [{ tag: "GRE", provinces: 3 }] } });
  rec("3c. one the kept coasts already name (stillWalled) is not named again here", once.includes("1 country") && once.includes("PRU") && !once.includes("GRE"), once);
  rec("3d. CONTROL: nobody without a coast says nothing of it", !/no ocean now/.test(note({ countries: { kept: [], stillGone: [], capitals: {}, noOceanCoast: [] } })));
  const err = note({ countries: { kept: [], stillGone: [], capitals: {}, noOceanCoastError: "no links" } });
  rec("3e. …and when that could not be asked, it is said with its reason", /⚠/.test(err) && err.includes("no links"), err);
  const kept = note({ countries: { kept: [{ tag: "PAL", state: 9, from: "SOV" }], stillGone: [], capitals: {} } });
  rec("3f. the kept countries' sentence says a country with a coast is kept on the ocean when one is near", /PAL from SOV/.test(kept) && /nearest on the ocean/.test(kept), kept);
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
