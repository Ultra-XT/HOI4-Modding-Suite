// ⛔ #a-province-below-is-the-same-province / #a-world-owner-is-a-country — A PROVINCE ID OF THE WORLD BELOW IS A PLACE ONLY IN THE
// MAP THAT DREW IT, AND A COUNTRY IS ONE ONLY IF WHAT LOADS DEFINES IT.
//
// Measured (review cr1, WC-1, WC-2) on Hearts of Minecraft, a total conversion that draws its own map and declares
// replace_path="common/country_tags": none of its 12,706 definition.csv rows has the colour the base game's row of that id has, yet
// 🌍 Generate land read the base game's states BY PROVINCE ID onto it — 15 of 15 new states went to countries it does not have (BRA,
// TUR, USA, SOV…), cored to them, with steel, chromium and oil it does not define either; 🌍 Generate a world gave 819 of its 830
// states such an owner; Map Errors said nothing. The country catalog ignored the replace_path: 669 tags offered, 353 not in the mod,
// and the world's gate suggested "(GER, ENG, …)" — two countries it does not have.
//
// On the split-world fixture (testlib-split-world.js), the layer below owning its land AAA (west) and BBB (east), with steel, a
// releasable RRR that holds no land, a 1939 bookmark, and every AAA state below cored by RRR, claimed by BBB and BBB's in 1939:
//   1. provincesKeptBelowRead: an id is the same province where the mod's definition.csv gives it the colour the row below has, and
//      the answer is for the MAP: under half of the ids both maps have the same → a map of its own (an empty set), else the map below
//      (null) — the owner's flow, a quarter redrawn, a definition stopping early; provinceFactsBeneath and landProvincesBeneath read
//      none of a map of its own and the whole of the map below (THE CONTROL: the same-colour mod reads every province); the refusal's
//      reason calls recoloured only the ids both maps have, and the rest not on the mod's map;
//   2. Generate land on a "total conversion" (recoloured map, its own land owned by MCB, replace_path common/country_tags with MCA
//      and MCB, its own common/resources with coal alone): every new state is MCB's, cored only to its tags, with no steel —
//      though the land it raised was AAA's below (the fixture's teeth); the report says the owners are its own land's;
//      THE CONTROL: the same-colour mod inherits AAA and BBB and carries steel;
//      …and on the owner's flow a state that took an AAA id carries RRR's core, BBB's claim and the 1939 change of hands;
//   3. a mod on the base map whose own common/resources has coal alone: no new state is written steel; the base map whose
//      replace_path common/country_tags keeps AAA alone: every new state is AAA's, and none carries BBB's claim, BBB's 1939 change of
//      hands or RRR's core from the state below whose id it took; and the economy reads BBB's ground as nobody's (review cr2, R1): it
//      names no country the mod lacks (economy.unplaced named BBB), and each new state on BBB's ground carries at least that ground's
//      share of the people it held below (3,244 against 9,000);
//   4. the recoloured mod with no land of its own (after 🗑 Delete map): "the countries below it" is refused before anything is
//      written (nothing can be inherited); "One country…" with AAA (not a country there) is refused; with MCA it is built, all MCA;
//      a mod on the base map whose replace_path common/country_tags keeps only CCC is refused the same way (its countries are not
//      the ones below); neither unknown-tag refusal offers "the country that held its ground", the choice refused there (review cr2,
//      R2), and on the owner's flow, where it can be inherited, the refusal still offers it (THE CONTROL);
//   5. Map Errors: a state the mod ships owned by a tag no loaded country_tags defines is state_owner_not_a_country (an error, not
//      fatal), its core of one state_core_not_a_country (a warning); a defined tag fires neither; an inherited state whose tag no
//      layer defines is not the mod's to answer for; one whose tag the mod's replace_path cut is;
//   6. the server: GET /api/countries/catalog lists the total conversion's own two tags and not the base game's (THE CONTROL: a mod
//      without the replace_path lists AAA and BBB); the world's dry plan says inherit is impossible and why; POST /api/map/world-run
//      refuses "the countries below it" (cannot-inherit) and an unknown tag with the catalog's own examples, never "(GER, ENG, …)";
//      a tag the catalog lists only for its history/countries file (no country_tags declares it) is not in the plan's countryTags,
//      and "One country…" with it is refused before anything is forked; GET /api/map/model reports provincesKeptBelow;
//   7. the page: the unknown-tag note's examples are the list's own; the owner note says what "the countries below it" reads on a map
//      of the mod's own; the world confirm and the Generate land dialog keep Go off where nothing can be inherited (THE CONTROLS:
//      on where it can); the Generate land report says the owners came from the mod's own land.
// Binds one ephemeral port (listen(0)) for §6, as test-a-world-owner-is-a-country.js does. Run: node test-a-province-below-is-the-same-province.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-same-province-"));
const DIRS = { game: "game", game2: "game2", game3: "game3", mods: "mods", home: "home", app: "appdata", user: "hoi4-user", docs: "Documents", ws: "workshop" };
for (const k of Object.keys(DIRS)) { DIRS[k] = path.join(ROOT, DIRS[k]); fs.mkdirSync(DIRS[k], { recursive: true }); }
Object.assign(process.env, {
  HOI4_ROOT: DIRS.game, HOI4_MODS_ROOT: DIRS.mods, NOVA_HOME_DIR: DIRS.home, APPDATA: DIRS.app, NOVA_APP_DATA_DIR: DIRS.app,
  XDG_CONFIG_HOME: DIRS.app, HOI4_USER_DIR: DIRS.user, NOVA_DOCUMENTS_DIR: DIRS.docs, HOI4_WORKSHOP_ROOT: DIRS.ws,
});
delete process.env.NOVA_WORLD_JOB;
delete process.env.NODE_OPTIONS;

const SW = require("./testlib-split-world.js");
const S = SW.makeShapes({});
const G = SW.makeGame(DIRS.game, S, {});
// RRR: a country of the base game that starts with no land (a releasable), cored on AAA's states below
SW.write(DIRS.game, "common/country_tags/00_countries.txt", 'AAA = "countries/AAA.txt"\nBBB = "countries/BBB.txt"\nRRR = "countries/RRR.txt"\n');
// a 1939 bookmark, so a state's 1939 change of hands below is one a renumbered state carries (modLastBookmarkDate)
SW.write(DIRS.game, "common/bookmarks/the_gathering_storm.txt", 'bookmarks = {\n\tbookmark = {\n\t\tname = "GATHERING_STORM_NAME"\n\t\tdate = 1939.8.14.12\n\t}\n}\n');
// an airfield below, on AAA's first province (airfieldsBeneath reads it off map/buildings.txt, on that state's own land)
const AIR = G.states.find((s) => s.owner === "AAA");
const airP = AIR.provinces[0];
let airPx = -1;
for (let i = 0; i < S.W * S.H; i++) if (S.gameIds[i] === airP) { airPx = i; break; }
SW.write(DIRS.game, "map/buildings.txt", `${AIR.id};air_base;${(airPx % S.W) + 0.5};9.50;${S.H - 1 - Math.floor(airPx / S.W) + 0.5};0.00;0\n`);
const airFile = path.join(DIRS.game, "history", "states", `${AIR.id}-STATE_${AIR.id}.txt`);
fs.writeFileSync(airFile, fs.readFileSync(airFile, "utf8").replace("\t\tbuildings = {\n", () => "\t\tbuildings = {\n\t\t\tair_base = 3\n"));
// …and every AAA state below is cored by RRR and claimed by BBB, and changes hands to BBB in 1939, as the base game's Austria and
// Sudetenland do (a dated owner block): what a renumbered state that took an AAA id carries (carriedCoresAndClaims, carriedDatedOwners)
for (const s of G.states.filter((x) => x.owner === "AAA")) {
  const f = path.join(DIRS.game, "history", "states", `${s.id}-STATE_${s.id}.txt`);
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("\t\tadd_core_of = AAA\n", () => "\t\tadd_core_of = AAA\n\t\tadd_core_of = RRR\n\t\tadd_claim_by = BBB\n\t\t1939.1.1 = {\n\t\t\towner = BBB\n\t\t\tcontroller = BBB\n\t\t}\n"));
}
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");

// the colour a recoloured mod gives an id: the fixture's own pattern with another blue, so no id keeps the colour it has below
const OTHER = (id) => ((((id & 255) << 16) | (((id >> 8) & 255) << 8) | 99) >>> 0);
const ownerBelow = new Map();
for (const s of G.states) for (const p of s.provinces) ownerBelow.set(p, s.owner);
const allIds = []; for (let id = 1; id <= S.N; id++) allIds.push(id);

/** A mod at mods/<name>: Delete map's shape (own provinces.bmp + definition.csv, replace_path history/states), every row sea unless
 *  in o.keepLand; o.recolour(id) true → the OTHER colour; o.tags → replace_path common/country_tags and a countries.txt (a name the
 *  base game does not use, as Hearts of Minecraft's); o.resources → its own common/resources/00_resources.txt with those alone;
 *  o.states → its own state files [{ id, provinces, owner, cores }]; o.lastId → its definition.csv stops there (Hearts of
 *  Minecraft's shape: the rows past it are the layer below's alone). */
function makeModAt(name, o = {}) {
  const root = path.join(DIRS.mods, name);
  const colour = (id) => (o.recolour && o.recolour(id) ? OTHER(id) : S.colourOf(id));
  SW.makeMod(root, S, { name, ownBmp: false, ownDef: false });
  SW.write(root, "map/provinces.bmp", SW.bmp24(SW.W, SW.H, (x, y) => colour(S.modIds[y * SW.W + x])));
  const ids = o.lastId ? allIds.filter((id) => id <= o.lastId) : allIds;
  SW.write(root, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", ...ids.map((id) => SW.defLine(id, colour(id), o.keepLand && o.keepLand.has(id) ? "land" : "sea"))].join("\n") + "\n");
  let desc = `name="${name}"\nreplace_path="history/states"\n`;
  if (o.tags) {
    desc += 'replace_path="common/country_tags"\n';
    SW.write(root, "common/country_tags/countries.txt", o.tags.map((t) => `${t} = "countries/${t}.txt"`).join("\n") + "\n");
  }
  SW.write(root, "descriptor.mod", desc);
  if (o.resources) SW.write(root, "common/resources/00_resources.txt", "resources = {\n" + o.resources.map((r) => `\t${r} = {\n\t\ticon_frame = 1\n\t\tcic = 0.125\n\t\tconvoys = 0.1\n\t}\n`).join("") + "}\n");
  for (const s of o.states || []) {
    SW.write(root, `history/states/${s.id}-STATE_${s.id}.txt`, `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = 1000\n\tstate_category = rural\n`
      + `\tprovinces = { ${s.provinces.join(" ")} }\n\thistory = {\n\t\towner = ${s.owner}\n${(s.cores || [s.owner]).map((c) => `\t\tadd_core_of = ${c}\n`).join("")}`
      + `\t\tvictory_points = { ${s.provinces[0]} 5 }\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t}\n\t}\n}\n`);
  }
  return root;
}
function treeHash(d) {
  const h = crypto.createHash("sha1");
  const r = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const p = path.join(x, e.name); if (e.isDirectory()) r(p); else h.update(path.relative(d, p) + "\0").update(fs.readFileSync(p)); } };
  try { r(d); } catch (_) { return "unreadable"; }
  return h.digest("hex");
}
const stateFiles = (mod) => { try { return fs.readdirSync(path.join(mod, "history", "states")).filter((f) => /\.txt$/i.test(f)); } catch (_) { return []; } };
/** The state files `mod` has that `before` did not, read by this test's own judge: owner, every add_core_of, resource keys, provinces. */
function newStates(mod, before) {
  return stateFiles(mod).filter((f) => !before.has(f)).map((f) => {
    const t = fs.readFileSync(path.join(mod, "history", "states", f), "utf8").replace(/#[^\n]*/g, "");
    const rb = /\bresources\s*=\s*\{([^}]*)\}/.exec(t);
    return { file: f, text: t, owner: (/\bowner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1] || "", cores: [...t.matchAll(/\badd_core_of\s*=\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]),
      res: rb ? [...rb[1].matchAll(/([a-z_]+)\s*=/g)].map((m) => m[1]) : [], provinces: ((((/\bprovinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g) || []).map(Number),
      manpower: Number((/\bmanpower\s*=\s*(\d+)/.exec(t) || [])[1] || 0) };
  });
}
const COUNT = Math.max(1, Math.round(S.N * 35 / 100));
const gen = (mod, extra = {}) => md.generateLand(Object.assign({ modRoot: mod, gameRoot: DIRS.game, dependencyRoots: [], count: COUNT, seed: 1, ownerMode: "inherit", owner: "" }, extra));

// the mods
const bbbStates = G.states.filter((s) => s.owner === "BBB");
const bbbLand = new Set(bbbStates.flatMap((s) => s.provinces));
const M_OWN = makeModAt("own-flow");                                                             // the owner's flow: Delete map's mod, every colour kept
const M_TC = makeModAt("tc-own-land", { recolour: () => true, keepLand: bbbLand, tags: ["MCA", "MCB"], resources: ["coal"],
  states: bbbStates.map((s) => ({ id: s.id, provinces: s.provinces, owner: "MCB" })) });      // a total conversion with land of its own
const M_TCB = makeModAt("tc-blank", { recolour: () => true, tags: ["MCA", "MCB"] });             // …after 🗑 Delete map: no land, no states
const M_TCV = makeModAt("tc-base-tags", { recolour: () => true, keepLand: bbbLand,                // a map of its own over the base game's countries
  states: bbbStates.map((s) => ({ id: s.id, provinces: s.provinces, owner: "BBB" })) });
const M_MOST = makeModAt("mostly-below", { recolour: (id) => id % 4 === 1 });                   // the map below, a quarter of it redrawn
const M_FEW = makeModAt("mostly-own", { recolour: (id) => id % 4 !== 1 });                      // a map of its own, a quarter by chance the same
const M_SHORT = makeModAt("short-def", { lastId: Math.floor(S.N * 3 / 4) });                    // the map below, its definition stopping early
const M_TCS = makeModAt("tc-short", { recolour: () => true, lastId: Math.floor(S.N * 3 / 4) });  // a map of its own, stopping early (Hearts of Minecraft)
const M_RES = makeModAt("res-coal", { resources: ["coal"] });
const M_CUT = makeModAt("tags-aaa", { tags: ["AAA"] });                                          // the base map, its countries cut to AAA
const M_TAGS = makeModAt("tags-ccc", { tags: ["CCC"] });
const M_HIST = makeModAt("hist-xyz");                                                             // the base game's countries, and XYZ's history file
SW.write(M_HIST, "history/countries/XYZ - Nowhere.txt", "capital = 1\n");                       // …which no country_tags declares

(async () => {
  console.log("\n== 1. which ids below are the same province ==");
  try {
    const k0 = md.provincesKeptBelowRead({ modRoot: M_OWN, gameRoot: DIRS.game });
    rec("the owner's flow (every colour kept): null — the map below is this map", k0.same === null && k0.counts && k0.counts.same === k0.counts.below && k0.counts.below === S.N && k0.counts.ownMap === false, k0.counts);
    const k1 = md.provincesKeptBelowRead({ modRoot: M_TCB, gameRoot: DIRS.game });
    rec("⭐ a recoloured map: a map of its own, an empty set — no id below is a place in it", k1.same instanceof Set && k1.same.size === 0 && k1.counts.same === 0 && k1.counts.below === S.N && k1.counts.ownMap === true, k1.counts);
    const quarter = allIds.filter((id) => id % 4 === 1).length;
    const kM = md.provincesKeptBelowRead({ modRoot: M_MOST, gameRoot: DIRS.game }), kF = md.provincesKeptBelowRead({ modRoot: M_FEW, gameRoot: DIRS.game });
    rec("a quarter of it redrawn: still the map below (null), its counts said", kM.same === null && kM.counts.ownMap === false && kM.counts.same === S.N - quarter && kM.counts.shared === S.N, kM.counts);
    rec("⭐ a quarter the same by chance: a map of its own (an empty set)", kF.same instanceof Set && kF.same.size === 0 && kF.counts.ownMap === true && kF.counts.same === quarter, kF.counts);
    const kS = md.provincesKeptBelowRead({ modRoot: M_SHORT, gameRoot: DIRS.game });
    rec("a definition that stops early (Hearts of Minecraft's shape over the map below): still the map below — the rows it lacks are no other place", kS.same === null && kS.counts.ownMap === false && kS.counts.shared < S.N, kS.counts);
    const f0 = md.provinceFactsBeneath({ modRoot: M_OWN, gameRoot: DIRS.game });
    const landBelow = allIds.filter((id) => ownerBelow.has(id));
    rec("THE CONTROL: the owner's flow reads every province below that a state holds", f0.size === landBelow.length && landBelow.every((p) => f0.has(p)), { facts: f0.size, land: landBelow.length });
    const f1 = md.provinceFactsBeneath({ modRoot: M_TCB, gameRoot: DIRS.game });
    rec("⭐⭐ a recoloured map reads none of them", f1.size === 0, f1.size);
    const sameFacts = (f) => f.size === f0.size && [...f0].every(([p, x]) => f.get(p) && f.get(p).owner === x.owner && f.get(p).stateId === x.stateId);
    const fM = md.provinceFactsBeneath({ modRoot: M_MOST, gameRoot: DIRS.game }), fS = md.provinceFactsBeneath({ modRoot: M_SHORT, gameRoot: DIRS.game });
    rec("⭐ the map below redrawn in places, or with a definition stopping early, is read WHOLE as the owner's flow reads it (a country's people below, a state's size)", sameFacts(fM) && sameFacts(fS), { most: fM.size, short: fS.size, own: f0.size });
    rec("⭐ …and the map of its own a quarter of whose ids match by chance reads none", md.provinceFactsBeneath({ modRoot: M_FEW, gameRoot: DIRS.game }).size === 0, null);
    const l0 = md.landProvincesBeneath({ modRoot: M_OWN, gameRoot: DIRS.game }), l1 = md.landProvincesBeneath({ modRoot: M_TCB, gameRoot: DIRS.game });
    rec("landProvincesBeneath: every land id below on the owner's flow, none on a recoloured map", l0 && l0.size === landBelow.length && l1 && l1.size === 0, { own: l0 && l0.size, tc: l1 && l1.size });
    const t = md.countryTagsThatLoad({ modRoot: M_TCB, gameRoot: DIRS.game }), t0 = md.countryTagsThatLoad({ modRoot: M_OWN, gameRoot: DIRS.game });
    rec("countryTagsThatLoad honours replace_path=\"common/country_tags\" (MCA, MCB) and reads the base game's without it (AAA, BBB, RRR)",
      t && [...t].sort().join() === "MCA,MCB" && t0 && [...t0].sort().join() === "AAA,BBB,RRR", { tc: t && [...t], own: t0 && [...t0] });
    const r = md.resourceKeysThatLoad({ modRoot: M_RES, gameRoot: DIRS.game });
    rec("resourceKeysThatLoad: the mod's own 00_resources.txt (coal); none at all below → null", r && [...r].join() === "coal" && md.resourceKeysThatLoad({ modRoot: M_OWN, gameRoot: DIRS.game }) === null, r && [...r]);
    const ff = md.inheritForecast({ modRoot: M_TCB, gameRoot: DIRS.game, loadedStates: [] }), fo = md.inheritForecast({ modRoot: M_OWN, gameRoot: DIRS.game, loadedStates: [] });
    rec("inheritForecast: nothing to inherit on the blank total conversion; THE CONTROL: the owner's flow inherits", ff.none === true && ff.owners === 0 && fo.none === false && fo.owners === landBelow.length, { tc: ff, own: fo });
    // the reason says it of the ids both maps have: the ones below that the mod's definition.csv has no row for are not on its map, not
    // "another colour" (Hearts of Minecraft's 12,706 rows over the base game's 13,413 — the refusal said all 13,413 were recoloured)
    const kTS = md.provincesKeptBelowRead({ modRoot: M_TCS, gameRoot: DIRS.game }).counts, whyTS = md.cannotInheritReason({ counts: kTS });
    const nn = (x) => Number(x).toLocaleString();
    rec("⭐ the refusal's reason counts the ids the two maps share as recoloured, and the rest as not on the mod's map",
      kTS.ownMap === true && kTS.shared < kTS.below && whyTS.includes(`none of the ${nn(kTS.shared)} province ids it shares with the world below`)
        && whyTS.includes(`no row for the other ${nn(kTS.below - kTS.shared)}`) && !whyTS.includes(`none of the ${nn(kTS.below)}`), { counts: kTS, why: whyTS });
  } catch (e) { rec("§1 ran to its end (it threw)", false, String((e && e.stack) || e).slice(0, 400)); }

  console.log("\n== 2. Generate land on a total conversion with land of its own ==");
  try {
    const before = new Set(stateFiles(M_TC));
    const r = gen(M_TC);
    const made = newStates(M_TC, before);
    rec("(it raised land)", r.changed === true && made.length > 0, { changed: r.changed, error: r.error, made: made.length });
    const raisedOnAAA = made.flatMap((s) => s.provinces).filter((p) => ownerBelow.get(p) === "AAA").length;
    rec("(the fixture's teeth: land it raised was AAA's below, by id)", raisedOnAAA > 0, raisedOnAAA);
    const owners = [...new Set(made.map((s) => s.owner))];
    rec("⭐⭐⭐ every new state is owned by MCB, the mod's own country nearest it — none by AAA or BBB, which it does not have", made.every((s) => s.owner === "MCB"), owners);
    rec("⭐⭐ …and cored only to a tag it defines", made.every((s) => s.cores.every((c) => c === "MCA" || c === "MCB")), [...new Set(made.flatMap((s) => s.cores))]);
    rec("⭐⭐ …and no resource it does not define (no steel)", made.every((s) => s.res.every((k) => k === "coal")) && !made.some((s) => /\bsteel\b/.test(s.text)), [...new Set(made.flatMap((s) => s.res))]);
    rec("…no new state file names AAA or BBB at all", !made.some((s) => /\b(AAA|BBB)\b/.test(s.text)), made.filter((s) => /\b(AAA|BBB)\b/.test(s.text)).map((s) => s.file));
    const ow = r.ownership || {};
    rec("the report says the world below was not read (keptBelow: a map of its own, 0 of N)", ow.keptBelow && ow.keptBelow.ownMap === true && ow.keptBelow.same === 0 && ow.keptBelow.below === S.N, ow.keptBelow);
    const ab = r.airBases || {};
    rec("⭐ the airfield below (on an id that is another place here) is neither carried nor counted lost", ab.carried === 0 && ab.lostAirfields === 0, ab);

    // a map of its own whose countries ARE the base game's: no tag filter can tell, only the province ids can
    const beforeV = new Set(stateFiles(M_TCV));
    const rv = gen(M_TCV);
    const madeV = newStates(M_TCV, beforeV);
    rec("(the same map over the base game's own countries raised land, some on AAA's ground below)", rv.changed === true && madeV.length > 0 && madeV.flatMap((s) => s.provinces).some((p) => ownerBelow.get(p) === "AAA"), { error: rv.error, made: madeV.length });
    rec("⭐⭐⭐ …and gave none of it to AAA by province id: every new state is BBB's, the country of its own land", madeV.every((s) => s.owner === "BBB"), [...new Set(madeV.map((s) => s.owner))]);
    rec("⭐⭐ …with no steel read off the ids below", madeV.every((s) => !s.res.includes("steel")), [...new Set(madeV.flatMap((s) => s.res))]);

    const beforeO = new Set(stateFiles(M_OWN));
    const ro = gen(M_OWN);
    const madeO = newStates(M_OWN, beforeO);
    rec("THE CONTROL: the owner's flow inherits the countries below (AAA and BBB)", ro.changed === true && madeO.length > 0 && madeO.every((s) => s.owner === "AAA" || s.owner === "BBB") && madeO.some((s) => s.owner === "AAA"), [...new Set(madeO.map((s) => s.owner))]);
    rec("…carries the steel below (so a missing steel elsewhere is the filter's doing)", madeO.some((s) => s.res.includes("steel")), [...new Set(madeO.flatMap((s) => s.res))]);
    rec("…and its report carries no keptBelow (every id is the same province)", !(ro.ownership || {}).keptBelow, (ro.ownership || {}).keptBelow);
    const carO = ((ro.stateIds || ro.idFloor || {}).carried) || {};
    rec("…and a state that took an AAA id carries what that state held below: RRR's core, BBB's claim, the 1939 change of hands (so their absence on the cut map in §3 is the filter's doing)",
      madeO.some((s) => s.cores.includes("RRR")) && madeO.some((s) => /\badd_claim_by\s*=\s*BBB\b/.test(s.text)) && madeO.some((s) => /\b1939\.1\.1\s*=\s*\{[^}]*\bowner\s*=\s*BBB/.test(s.text)),
      { carried: carO, cores: [...new Set(madeO.flatMap((s) => s.cores))] });
    const abo = ro.airBases || {};
    rec("…and it reads the airfield below (carried, or counted lost where its province did not rise)", (abo.carried || 0) + (abo.lostAirfields || 0) === 1, abo);
  } catch (e) { rec("§2 ran to its end (it threw)", false, String((e && e.stack) || e).slice(0, 400)); }

  console.log("\n== 3. a mod on the base map whose resources are its own ==");
  try {
    const before = new Set(stateFiles(M_RES));
    const r = gen(M_RES);
    const made = newStates(M_RES, before);
    rec("(it raised land, owned by the countries below)", r.changed === true && made.length > 0 && made.every((s) => s.owner === "AAA" || s.owner === "BBB"), { error: r.error, owners: [...new Set(made.map((s) => s.owner))] });
    rec("⭐⭐ no new state is written a resource its common/resources does not define (steel)", made.every((s) => s.res.every((k) => k === "coal")), [...new Set(made.flatMap((s) => s.res))]);
    // the base map with its countries cut to AAA (replace_path common/country_tags): BBB is no country here
    const beforeC = new Set(stateFiles(M_CUT));
    const rc = gen(M_CUT);
    const madeC = newStates(M_CUT, beforeC);
    rec("(the base map cut to AAA raised land, some of it BBB's below)", rc.changed === true && madeC.length > 0 && madeC.flatMap((s) => s.provinces).some((p) => ownerBelow.get(p) === "BBB"), { error: rc.error, made: madeC.length });
    rec("⭐⭐ every new state is AAA's — BBB's ground below goes to the country it does have", madeC.every((s) => s.owner === "AAA"), [...new Set(madeC.map((s) => s.owner))]);
    rec("⭐⭐ …and no new state names BBB anywhere: no claim carried from the state below whose id it took, no 1939 change of hands to it", !madeC.some((s) => /\bBBB\b/.test(s.text)), madeC.filter((s) => /\bBBB\b/.test(s.text)).map((s) => s.file + ": " + (s.text.match(/[^\n]*\bBBB\b[^\n]*/g) || []).join(" | ")).slice(0, 4));
    rec("⭐⭐ …nor a core of RRR, the base game's releasable it does not have: every core is AAA", madeC.every((s) => s.cores.every((c) => c === "AAA")), [...new Set(madeC.flatMap((s) => s.cores))]);
    const stIds = (rc.stateIds && rc.stateIds.renumbered) || (rc.idFloor && rc.idFloor.renumbered) || null;
    rec("(the renumbering ran, so the carries were asked)", !!stIds && !stIds.error, stIds);
    // ⭐ …and THE ECONOMY reads BBB's ground in the same words (review cr2, R1): it credited each province below to its owner there
    // unfiltered, so BBB's budget was summed and no state could hold it (economy.unplaced named BBB, and the page said "1 country has
    // no new state to hold its economy: BBB"), while the states AAA took on BBB's ground carried none of what that ground held — the
    // whole world 279,000 people where both countries' ground held 559,000. Now BBB's ground is nobody's land, carried by the country
    // that takes it, as a country removed in favour of nobody already is.
    const definedC = md.countryTagsThatLoad({ modRoot: M_CUT, gameRoot: DIRS.game });
    const eco = rc.economy || {};
    rec("(the new states kept their countries' 1936 economies, and AAA is the one country that loads)", eco.mode === "country" && !eco.error && definedC && [...definedC].join() === "AAA", { mode: eco.mode, error: eco.error, defined: definedC && [...definedC] });
    const named = [...(eco.unplaced || []), ...(eco.short || [])].map((u) => String((u && u.tag) || "").toUpperCase());
    rec("⭐⭐ the economy names no country this mod does not define: none left with no new state to hold it (economy.unplaced), none short",
      !!definedC && named.every((t) => definedC.has(t)), { unplaced: eco.unplaced, short: eco.short });
    // what each new state stands on of BBB's ground below: k of a state's n provinces held k / n of its people (the fixture's own numbers)
    const stateBelow = new Map();
    for (const s of G.states) for (const p of s.provinces) stateBelow.set(p, s);
    const bbbShare = (s) => s.provinces.reduce((a, p) => { const b = stateBelow.get(p); return a + (b && b.owner === "BBB" ? b.manpower / b.provinces.length : 0); }, 0);
    const onB = madeC.map((s) => ({ file: s.file, owner: s.owner, manpower: s.manpower, share: Math.floor(bbbShare(s)) })).filter((x) => x.share > 0);
    rec("(the fixture's teeth: new states stand on BBB's ground)", onB.length > 0, onB.length);
    rec("⭐⭐ every new state on BBB's ground carries at least that ground's share of the people it held below", onB.length > 0 && onB.every((x) => x.manpower >= x.share), onB.filter((x) => x.manpower < x.share).slice(0, 6));
  } catch (e) { rec("§3 ran to its end (it threw)", false, String((e && e.stack) || e).slice(0, 400)); }

  console.log("\n== 4. nothing to inherit ==");
  try {
    const h0 = treeHash(M_TCB);
    const r1 = gen(M_TCB);
    rec("⭐⭐⭐ the blank total conversion: \"the countries below it\" is refused (refusedCannotInherit)", r1.changed === false && r1.refusedCannotInherit === true, { changed: r1.changed, error: r1.error, n: newStates(M_TCB, new Set()).length });
    rec("…saying why, and that nothing was written", /map of its own/.test(String(r1.error || "")) && /Nothing was written/.test(String(r1.error || "")), r1.error);
    rec("…and the mod is byte for byte as it was", treeHash(M_TCB) === h0, null);
    const r2 = gen(M_TCB, { ownerMode: "single", owner: "aaa" });
    rec("⭐⭐ \"One country…\" with AAA (no country of this mod) is refused, naming its own tags", r2.changed === false && r2.refusedUnknownOwner === true && /MCA, MCB/.test(String(r2.error || "")) && /Nothing was written/.test(String(r2.error || "")), r2.error);
    // (review cr2, R2) it went on "…or let each state go to the country that held its ground" — the choice refused just above
    rec("⭐⭐ …and it does not offer \"the country that held its ground\", which is refused here (as the world's gate already words it)", r2.refusedUnknownOwner === true && !/held its ground/.test(String(r2.error || "")), r2.error);
    rec("…and the mod is byte for byte as it was", treeHash(M_TCB) === h0, null);
    const rt = gen(M_TAGS);
    rec("⭐⭐ a mod on the base map whose country_tags keep only CCC: refused too — the countries below are not its own", rt.changed === false && rt.refusedCannotInherit === true && rt.inherit && rt.inherit.dropped > 0 && /country_tags/.test(String(rt.error || "")), { error: rt.error, inherit: rt.inherit });
    const hT = treeHash(M_TAGS), rtu = gen(M_TAGS, { ownerMode: "single", owner: "AAA" });
    rec("⭐ …and \"One country…\" AAA there is refused (CCC is its one country) without offering the countries below either", rtu.changed === false && rtu.refusedUnknownOwner === true && /\(CCC\)/.test(String(rtu.error || "")) && !/held its ground/.test(String(rtu.error || "")) && treeHash(M_TAGS) === hT, rtu.error);
    const hO = treeHash(M_OWN), rou = gen(M_OWN, { ownerMode: "single", owner: "ZZZ" });
    rec("THE CONTROL: on the owner's flow, where the countries below can be inherited, an unknown tag's refusal still offers them", rou.changed === false && rou.refusedUnknownOwner === true && /held its ground/.test(String(rou.error || "")) && treeHash(M_OWN) === hO, rou.error);
    const r3 = gen(M_TCB, { ownerMode: "single", owner: "MCA" });
    const made = newStates(M_TCB, new Set());
    rec("THE CONTROL: \"One country…\" with MCA builds, every state MCA's and cored to MCA alone", r3.changed === true && made.length > 0 && made.every((s) => s.owner === "MCA" && s.cores.every((c) => c === "MCA")), { error: r3.error, owners: [...new Set(made.map((s) => s.owner))], cores: [...new Set(made.flatMap((s) => s.cores))] });
    // a map of its own over a world NOBODY owns below (a bare fixture's): there was never anyone to inherit, and inherit gives nobody
    // there, as it always has — refusing it would refuse every such fixture for nothing
    SW.makeGame(DIRS.game3, S, {});
    const hs3 = path.join(DIRS.game3, "history", "states");
    for (const f of fs.readdirSync(hs3)) fs.writeFileSync(path.join(hs3, f), fs.readFileSync(path.join(hs3, f), "utf8").replace(/^[ \t]*(owner|controller|add_core_of)[ \t]*=.*$/gm, ""));
    const M_BARE = makeModAt("tc-over-nobody", { recolour: () => true });
    const fb = md.inheritForecast({ modRoot: M_BARE, gameRoot: DIRS.game3, loadedStates: [] });
    const rb = gen(M_BARE, { gameRoot: DIRS.game3 });
    rec("THE CONTROL: a map of its own over a world nobody owns below is not refused — inherit gives nobody there, as it always has",
      fb.none === false && fb.heldBelow === false && fb.counts && fb.counts.ownMap === true && rb.changed === true && !rb.refusedCannotInherit, { forecast: fb, changed: rb.changed, error: rb.error });
  } catch (e) { rec("§4 ran to its end (it threw)", false, String((e && e.stack) || e).slice(0, 400)); }

  console.log("\n== 5. Map Errors ==");
  try {
    const rulesOf = (modRoot, gameRoot = DIRS.game) => {
      const model = md.buildMapModel({ modRoot, gameRoot, dependencyRoots: [] });
      const probs = md.validateMapModel(model) || [];
      return { owner: probs.find((p) => p.rule === "state_owner_not_a_country") || null, core: probs.find((p) => p.rule === "state_core_not_a_country") || null };
    };
    const land = bbbStates.slice(0, 2);
    const keep = new Set(land.flatMap((s) => s.provinces));
    const bad = makeModAt("rule-bad", { recolour: () => true, keepLand: keep, tags: ["MCA", "MCB"],
      states: [{ id: land[0].id, provinces: land[0].provinces, owner: "AAA", cores: ["AAA", "MCA"] }, { id: land[1].id, provinces: land[1].provinces, owner: "MCB", cores: ["MCB", "ZZZ"] }] });
    const b = rulesOf(bad);
    rec("⭐⭐ a state the mod ships owned by AAA (not a country here) is state_owner_not_a_country, an error", b.owner && b.owner.severity === "error" && b.owner.total === 1 && b.owner.items[0].stateId === land[0].id && b.owner.items[0].tag === "AAA", b.owner);
    rec("…its message names the tag, what HOI4 logs, and the mod's own countries", b.owner && /owner = AAA/.test(b.owner.message) && /invalid owner tag/.test(b.owner.message) && /MCA, MCB/.test(b.owner.message), b.owner && b.owner.message);
    rec("⭐ the cores of AAA and ZZZ are state_core_not_a_country, a warning, on both states", b.core && b.core.severity === "warning" && b.core.total === 2 && [...b.core.tags].sort().join() === "AAA,ZZZ", b.core);
    rec("neither is in the fatal set (HOI4 logs it and loads past it)", labels.isFatalRule("state_owner_not_a_country") === false && labels.isFatalRule("state_core_not_a_country") === false, null);
    rec("both have a label and a hint", !!labels.LABELS.state_owner_not_a_country && !!labels.LABELS.state_core_not_a_country && !!(labels.FIX_HINTS || {}).state_owner_not_a_country && !!(labels.FIX_HINTS || {}).state_core_not_a_country, Object.keys(labels));
    const good = makeModAt("rule-good", { recolour: () => true, keepLand: keep, tags: ["MCA", "MCB"], states: land.map((s) => ({ id: s.id, provinces: s.provinces, owner: "MCB" })) });
    const g = rulesOf(good);
    rec("THE CONTROL: owned and cored by MCB, a tag it defines: neither fires", !g.owner && !g.core, g);
    rec("THE CONTROL: the base game itself (AAA and BBB defined): neither fires", (() => { const x = rulesOf(null); return !x.owner && !x.core; })(), null);
    // an inherited state whose tag no layer defines is the base's problem, not the mod's
    SW.makeGame(DIRS.game2, S, {});
    SW.write(DIRS.game2, "common/country_tags/00_countries.txt", 'AAA = "countries/AAA.txt"\n');
    const inh = path.join(DIRS.mods, "rule-inherits");
    SW.write(inh, "descriptor.mod", 'name="rule-inherits"\n');
    const i = rulesOf(inh, DIRS.game2);
    rec("#inherited-problem-not-yours: the base's BBB states (BBB defined nowhere) are not this mod's to answer for", !i.owner && !i.core, i);
    const cut = path.join(DIRS.mods, "rule-cuts");
    SW.write(cut, "descriptor.mod", 'name="rule-cuts"\nreplace_path="common/country_tags"\n');
    SW.write(cut, "common/country_tags/countries.txt", 'AAA = "countries/AAA.txt"\n');
    const c = rulesOf(cut);
    const bbbN = G.states.filter((s) => s.owner === "BBB").length;
    rec("⭐ …but where the mod's own replace_path cut BBB, every BBB state is reported (the base defines it; what loads does not)", c.owner && c.owner.total === bbbN && c.owner.tags.join() === "BBB", { total: c.owner && c.owner.total, bbbN });
  } catch (e) { rec("§5 ran to its end (it threw)", false, String((e && e.stack) || e).slice(0, 400)); }

  console.log("\n== 6. the server ==");
  const { createApp } = require("./server.js");
  const listen = (app) => new Promise((res, rej) => { const s = app.listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
  const app = createApp();
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = (method, ep, body) => fetch(base + ep, method === "GET" ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body == null ? {} : body) })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  let tcPlan = null;
  try {
    const tagsOf = (body) => (Array.isArray(body) ? body : []).map((x) => String((x && x.tag) || "").toUpperCase()).filter(Boolean).sort();
    const cat = await call("GET", `/api/countries/catalog?modPath=${encodeURIComponent(M_TCB)}`);
    rec("⭐⭐⭐ the catalog lists the total conversion's own two tags and not the base game's (replace_path honoured)", tagsOf(cat.body).join() === "MCA,MCB", tagsOf(cat.body));
    const catO = await call("GET", `/api/countries/catalog?modPath=${encodeURIComponent(M_OWN)}`);
    rec("THE CONTROL: a mod without the replace_path lists the base game's AAA and BBB", ["AAA", "BBB"].every((t) => tagsOf(catO.body).includes(t)), tagsOf(catO.body));
    const dry = await call("POST", "/api/map/prepare-world", { modPath: M_TCB, dryRun: true });
    tcPlan = dry.body && dry.body.plan;
    rec("the world's dry plan lists those tags (countryTags)", dry.body && dry.body.ok && JSON.stringify(tcPlan.countryTags) === JSON.stringify(["MCA", "MCB"]), tcPlan && tcPlan.countryTags);
    rec("⭐⭐ …and says inherit can read nothing, and why (plan.inherit)", tcPlan && tcPlan.inherit && tcPlan.inherit.none === true && /map of its own/.test(String(tcPlan.inherit.why || "")), tcPlan && tcPlan.inherit);
    const dryO = await call("POST", "/api/map/prepare-world", { modPath: M_OWN, dryRun: true });
    rec("THE CONTROL: the owner's flow's plan can inherit", dryO.body && dryO.body.ok && dryO.body.plan.inherit && dryO.body.plan.inherit.none === false && dryO.body.plan.inherit.owners > 0, dryO.body && dryO.body.plan && dryO.body.plan.inherit);
    const h0 = treeHash(M_TCB);
    const RUN = { landShare: 35, seed: 1, confirm: true, replacesOwnWorld: true };
    const inh = await call("POST", "/api/map/world-run", Object.assign({ modPath: M_TCB, ownerMode: "inherit", owner: "" }, RUN));
    rec("⭐⭐⭐ a world run with \"the countries below it\" is refused before anything is forked (cannot-inherit)", inh.status === 400 && inh.body && inh.body.refused === "cannot-inherit" && /Nothing was written/.test(String(inh.body.error || "")), inh);
    const unk = await call("POST", "/api/map/world-run", Object.assign({ modPath: M_TCB, ownerMode: "single", owner: "ZZZ" }, RUN));
    const ue = String((unk.body && unk.body.error) || "");
    rec("⭐⭐ an unknown tag is refused with the catalog's own examples (MCA, MCB), never \"(GER, ENG, …)\"", unk.status === 400 && unk.body.refused === "unknown-owner" && /\(MCA, MCB\)/.test(ue) && !/GER|ENG/.test(ue), ue);
    rec("…and it does not offer \"the country that held its ground\", which cannot inherit here", !/held its ground/.test(ue), ue);
    const aaa = await call("POST", "/api/map/world-run", Object.assign({ modPath: M_TCB, ownerMode: "single", owner: "AAA" }, RUN));
    rec("⭐⭐ AAA, the base game's, is refused too (not a country in this mod)", aaa.status === 400 && aaa.body.refused === "unknown-owner", aaa);
    rec("…the mod is byte for byte as it was", treeHash(M_TCB) === h0, null);
    const run = (await call("GET", "/api/map/world-run")).body;
    rec("…and no run was started", !(run && run.run && (run.run.state === "running" || run.run.state === "finishing")), run && run.run && run.run.state);

    // a tag the catalog lists only because the mod ships its history/countries file: no country_tags declares it, and step 3's
    // Generate land refuses it (refusedUnknownOwner) — after step 2 had cleared the mod's world, had the gate let it through
    const catX = await call("GET", `/api/countries/catalog?modPath=${encodeURIComponent(M_HIST)}`);
    rec("(the catalog lists XYZ, whose history/countries file the mod ships)", tagsOf(catX.body).includes("XYZ"), tagsOf(catX.body));
    const dryX = await call("POST", "/api/map/prepare-world", { modPath: M_HIST, dryRun: true });
    const ctX = (dryX.body && dryX.body.plan && dryX.body.plan.countryTags) || [];
    rec("⭐⭐ …but the world's plan does not count it a country (plan.countryTags: the tags a country_tags file that loads declares)", ctX.includes("AAA") && !ctX.includes("XYZ"), ctX);
    const hX = treeHash(M_HIST);
    const x = await call("POST", "/api/map/world-run", Object.assign({ modPath: M_HIST, ownerMode: "single", owner: "XYZ" }, RUN));
    if (x.status === 200) {   // a back-out let it through: stop the builder it forked, in this test's own temp folder
      try { app.locals.stopWorldRun("test"); } catch (_) {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    const xe = String((x.body && x.body.error) || "");
    rec("⭐⭐ a world run with \"One country…\" XYZ is refused before anything is forked (unknown-owner), XYZ not among its examples", x.status === 400 && x.body && x.body.refused === "unknown-owner" && /\(AAA, BBB, RRR\)/.test(xe), { status: x.status, error: xe });
    rec("…and that mod is byte for byte as it was", treeHash(M_HIST) === hX, null);
    const m = await call("GET", `/api/map/model?modPath=${encodeURIComponent(M_TCB)}`);
    rec("GET /api/map/model reports provincesKeptBelow (a map of its own, 0 of N)", m.body && m.body.provincesKeptBelow && m.body.provincesKeptBelow.ownMap === true && m.body.provincesKeptBelow.same === 0 && m.body.provincesKeptBelow.below === S.N, m.body && m.body.provincesKeptBelow);
  } catch (e) { rec("§6 ran to its end (it threw)", false, String((e && e.stack) || e).slice(0, 400)); } finally {
    try { srv.closeAllConnections(); } catch (_) {}
    srv.close();
  }

  console.log("\n== 7. the page ==");
  const T = require("./testlib-map-page.js");
  const WP = require("./testlib-world-page.js");
  try {
    const note = vm.runInNewContext(T.lift("function unknownOwnerTagNote(") + "\nunknownOwnerTagNote;", {});
    const n1 = note("zzz", ["MCB", "MCA"]);
    rec("⭐ the unknown-tag note's examples are the list's own: (MCA, MCB)", /\(MCA, MCB\)/.test(n1) && !/GER|ENG/.test(n1), n1);
    rec("…the first three in tag order, then …", /\(AAA, BBB, CCC, …\)/.test(note("ZZZ", ["DDD", "CCC", "BBB", "AAA"])), note("ZZZ", ["DDD", "CCC", "BBB", "AAA"]));
    rec("…and a tag on the list says nothing", note("mca", ["MCA", "MCB"]) === "", null);
    const own = vm.runInNewContext(T.lift("function genOwnerNote(") + "\ngenOwnerNote;", {});
    const K0 = { same: 0, shared: 12706, below: 13413, own: 12706, ownMap: true }, KF = { same: 30, shared: 12706, below: 13413, own: 12706, ownMap: true };
    const KH = { same: 11845, shared: 13413, below: 13413, own: 16535, ownMap: false };
    rec("the owner note on the owner's flow is the sentence it always was", own("inherit") === own("inherit", { kept: null, ownedStates: 0 }) && /world underneath/.test(own("inherit")), own("inherit"));
    rec("⭐⭐ a map of its own with land of its own: the owners are its own land's", /map of its own/.test(own("inherit", { kept: K0, ownedStates: 3 })) && /own land nearest/.test(own("inherit", { kept: K0, ownedStates: 3 })), own("inherit", { kept: K0, ownedStates: 3 }));
    rec("⭐⭐ …with none: nothing can be inherited, and it says what to choose", /^⚠ Nothing can be inherited/.test(own("inherit", { kept: K0, ownedStates: 0 })) && /One country/.test(own("inherit", { kept: K0, ownedStates: 0 })), own("inherit", { kept: K0, ownedStates: 0 }));
    rec("a map of its own some of whose ids match by chance says how many", /only 30 of the 12,706/.test(own("inherit", { kept: KF, ownedStates: 0 })), own("inherit", { kept: KF, ownedStates: 0 }));
    rec("THE CONTROL: the map below redrawn in places (Millennium Dawn's 88%) is read whole: the sentence it always was", own("inherit", { kept: KH, ownedStates: 0 }) === own("inherit"), own("inherit", { kept: KH, ownedStates: 0 }));

    // the world confirm
    const PLAN = { modName: "TC", replacePath: "history/states", bitmap: { own: true, from: "own", bytes: 1048576 }, descriptors: [{ file: "C:/m/t/descriptor.mod", kind: "mod", has: false }], dependencyNames: [], launcherListsIt: true, stateFiles: 0, ownsWorld: false, ownWorldParts: [], copiesUnder: "C:/home/.nova", countryTags: ["MCA", "MCB"] };
    async function confirmWith(plan, mode, tag) {
      const p = WP.worldPage({ modPath: "C:/m/t", timers: { setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} },
        fetch: async (url) => ({ status: 200, json: async () => (String(url).startsWith("/api/map/prepare-world") ? { ok: true, plan } : { ok: true, run: null }) }) });
      await p.fire("mapGenerateWorld");
      p.el("mapWorldOwnerMode").value = mode;
      p.el("mapWorldOwnerTag").value = tag;
      await p.fire("mapWorldOwnerTag", "input");
      await p.fire("mapWorldOwnerMode", "change");
      return { go: p.el("mapWorldGo"), note: String(p.el("mapWorldOwnerNote").textContent || "") };
    }
    const none = Object.assign({}, PLAN, { inherit: (tcPlan && tcPlan.inherit) || { none: true, why: "x" } });
    const w1 = await confirmWith(none, "inherit", "");
    rec("⭐⭐⭐ the world confirm keeps 🌍 Generate the world off where nothing can be inherited", w1.go && w1.go.disabled === true, w1.go && w1.go.disabled);
    rec("…and says why, in the server's own words", /^⚠ Nothing can be inherited/.test(w1.note) && w1.note.includes(String(none.inherit.why)), w1.note);
    const w2 = await confirmWith(none, "single", "MCA");
    rec("THE CONTROL: \"One country…\" MCA turns it on", w2.go && w2.go.disabled === false, w2.note);
    const w3 = await confirmWith(Object.assign({}, PLAN, { inherit: { counts: { same: 5, below: 5, own: 5 }, owners: 5, dropped: 0, loaded: 0, none: false } }), "inherit", "");
    rec("THE CONTROL: a plan that can inherit is on", w3.go && w3.go.disabled === false, w3.note);

    // the Generate land dialog, its functions as written (as test-a-world-owner-is-a-country.js lifts them), with the page's model
    const lifted = [
      "let countryCatalogNames = null;",
      T.lift("async function countryNameOf("), T.lift("async function countryCatalogTags("), T.lift("function unknownOwnerTagNote("),
      T.lift("function genOwnerNote("), T.lift("async function genOwnerTagCheck("),
      T.lift("let genGateOn", "\n  };"), T.lift("const syncGenOwner = () => {", "\n  };"),
    ].join("\n");
    async function genDialog(model, mode, tag) {
      const els = WP.htmlElements();
      const sb = { console, encodeURIComponent, $: (id) => els.get(id) || null, modPath: () => "C:/m/t", model,
        fetch: async () => ({ json: async () => [{ tag: "MCA", displayName: "MCA" }, { tag: "MCB", displayName: "MCB" }] }) };
      vm.createContext(sb);
      vm.runInContext(lifted + "\nglobalThis.__f = { syncGenOwner, genOwnerTagCheck, setGenBtnEnabled };", sb);
      sb.__f.setGenBtnEnabled(true);
      els.get("mapGenOwnerMode").value = mode;
      els.get("mapGenOwnerTag").value = tag;
      sb.__f.syncGenOwner();
      await sb.__f.genOwnerTagCheck();
      await WP.settle();
      sb.__f.setGenBtnEnabled(true);
      const b = els.get("mapGenConfirmBtn");
      return { disabled: b.disabled, note: String(els.get("mapGenOwnerNote").textContent || "") };
    }
    const g1 = await genDialog({ provincesKeptBelow: K0, states: [{ id: 1, owner: "" }] }, "inherit", "");
    rec("⭐⭐ Generate land's dialog keeps Generate off on a map of its own with no owned state of its own", g1.disabled === true && /Nothing can be inherited/.test(g1.note), g1);
    const g2 = await genDialog({ provincesKeptBelow: K0, states: [{ id: 1, owner: "MCB" }] }, "inherit", "");
    rec("THE CONTROL: with a state of its own owned, it is on, and says the owners are its own land's", g2.disabled === false && /own land nearest/.test(g2.note), g2);
    const g3 = await genDialog({ provincesKeptBelow: K0, states: [] }, "single", "MCA");
    rec("THE CONTROL: \"One country…\" MCA is on there", g3.disabled === false, g3);
    const g4 = await genDialog({ provincesKeptBelow: { same: 9, shared: 9, below: 9, own: 12, ownMap: false }, states: [] }, "inherit", "");
    rec("THE CONTROL: the owner's flow (every id the same province) is on, with the old note", g4.disabled === false && /world underneath/.test(g4.note), g4);

    // the Generate land report
    let reportOf = null;
    try {
      const code = WP.withPageHelpers("globalThis.__r = (res) => generatedLandResultNote(res, { regionsNext: false });");
      const sb = { console, escHtml: undefined, window: { NovaMapRuleLabels: labels } };
      sb.globalThis = sb;
      vm.createContext(sb);
      vm.runInContext(code, sb);
      reportOf = sb.__r;
    } catch (e) { reportOf = null; rec("(the report function could be lifted and run)", false, String(e && e.message)); }
    if (reportOf) {
      const res = { changed: true, ownership: { mode: "inherit", countries: 2, byMajority: 0, byProximity: 5, undecided: 0, keptBelow: K0 } };
      let line = "";
      try { line = String(reportOf(res)); } catch (e) { line = "THREW " + e.message; }
      rec("⭐ the Generate land report says the countries came from the mod's own land", /taken from your mod's own land/.test(line), line.slice(0, 400));
      let lineO = "";
      try { lineO = String(reportOf({ changed: true, ownership: { mode: "inherit", countries: 2, byMajority: 3, byProximity: 2, undecided: 0 } })); } catch (e) { lineO = "THREW " + e.message; }
      rec("THE CONTROL: the owner's flow's report still says the world underneath", /taken from the world underneath —/.test(lineO), lineO.slice(0, 400));
    }
  } catch (e) { rec("§7 ran to its end (it threw)", false, String((e && e.stack) || e).slice(0, 400)); }

  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // this test's own temp folder only — never a mod directory (⛔ CLAUDE.md #1)
  console.log(`\n${checks - fails.length}/${checks} checks passed`);
  if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exitCode = 1; }
  setTimeout(() => process.exit(process.exitCode || 0), 300);
})().catch((e) => { console.error(e); process.exit(1); });
