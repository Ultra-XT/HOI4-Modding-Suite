// ⛔ #a-generated-world-nobody-rules — A GENERATED WORLD MUST HAVE COUNTRIES ON IT.
//
// generateLand took `owner` — ONE country tag for the whole planet — defaulting to "", and the Generate land
// dialog never sent one. So every world Nova had ever generated was OWNERLESS. The owner launched exactly
// that: 832 states, none with an owner; HOI4 loaded the map, then wrote 166,849 lines to error.log at about
// 8,800 a game-day ("Invalid Scope, supported: Country, provided: None"), plus exactly 832 of
// "common/on_actions/14_sea_on_actions.txt:97: owner: invalid event target: owner" at game start. Nobody was
// playable and it died of an access violation two game-weeks in.
//
// This test pins, end to end:
//   1. assignGeneratedStateOwners as a PURE function — majority, the tie-break, proximity across water,
//      that nothing is invented, and that the answer does not depend on input order.
//   2. provinceFactsBeneath reads the world a mod REPLACES (baseRootsFor, not layersBelow) — the whole point,
//      because Nova's own Delete map dialog tells a modder to add replace_path="history/states" first.
//   3. generateLand over a real fixture: inherit (the default) gives real owners by BOTH passes, `owner: TAG`
//      still hands the world to one country, and ownerMode "none" reproduces the world that crashed.
//   4. manpower and state_category come from the world below instead of the flat 10000/rural, and an
//      explicitly-passed manpower still wins.
//   5. the rule world_has_no_owners: fires on a world with no countries, SILENT on one with some ownerless
//      states (OWB ships 313 and launches), counts the POPULATION, and answers the same COLD AND WARM.
//   6. 🈯 THE CORPUS: 0 on every installed shipping map, derived from what is installed.
//   7. the page can ask for all three, and its note function is LIFTED AND RUN, not grepped.
//
// Run: node test-a-generated-world-has-countries-in-it.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-owners-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";

function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}

// ── THE FIXTURE ──────────────────────────────────────────────────────────────────────────────────────
// A W x H lattice of one-pixel provinces, so the province neighbour graph is a plain grid. The BASE layer
// (which stands in for the game) has the LEFT HALF as land owned by two countries and the RIGHT HALF as open
// ocean nobody holds. The MOD is the same map with every province blanked to sea — the shape Delete map
// leaves — and declares replace_path="history/states", exactly as Nova's own dialog tells a modder to.
//
// So a generated state on the left is decided by MAJORITY and one on the right only by PROXIMITY, and the two
// passes are both exercised by one call.
const W = 24, H = 16;
const PROVINCES = W * H;
const idAt = (x, y) => y * W + x + 1;
const colourOf = (id) => [id & 255, (id >> 8) & 255, 77];
const xOf = (id) => (id - 1) % W;
const regionOf = (id) => { const i = id - 1, x = i % W, y = Math.floor(i / W); return Math.floor(x / 6) + 4 * Math.floor(y / 8) + 1; };
const OWNED_COLUMNS = 12;                    // columns 0..11 are land below; 12..23 are ocean below
const isOwnedBelow = (id) => xOf(id) < OWNED_COLUMNS;
// AAA holds the far left (rich, "town"), BBB the middle (poor, "city"), CCC one strip whose category the
// state_category table does NOT declare — so the fallback has something to be wrong about.
const tagBelow = (id) => { const x = xOf(id); return x < 5 ? "AAA" : x < 10 ? "BBB" : "CCC"; };
const CAT_BELOW = { AAA: "town", BBB: "city", CCC: "zzz_not_declared" };
const MP_PER_PROVINCE = { AAA: 100000, BBB: 5000, CCC: 20000 };

function defRows(seaFrom) {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= PROVINCES; id++) {
    const [r, g, b] = colourOf(id);
    const land = seaFrom ? false : isOwnedBelow(id);
    rows.push(land ? `${id};${r};${g};${b};land;false;plains;1` : `${id};${r};${g};${b};sea;false;ocean;0`);
  }
  return rows.join("\r\n") + "\r\n";
}
function writeRegions(root) {
  const byRegion = new Map();
  for (let id = 1; id <= PROVINCES; id++) { const r = regionOf(id); if (!byRegion.has(r)) byRegion.set(r, []); byRegion.get(r).push(id); }
  for (const [r, provs] of byRegion) {
    mk(path.join(root, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`);
  }
}
function makeBase() {
  const base = fs.mkdtempSync(path.join(SANDBOX, "base-"));
  mk(path.join(base, "map", "definition.csv"), defRows(false));
  mk(path.join(base, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  writeRegions(base);
  // The category table the generated states will be checked against. `zzz_not_declared` is deliberately absent.
  mk(path.join(base, "common", "state_category", "00_default.txt"),
    "state_categories = {\n\ttown = { local_building_slots = 4 }\n\tcity = { local_building_slots = 6 }\n\trural = { local_building_slots = 2 }\n}\n");
  // One base state per (tag, row-block) so every owned province is held by somebody, with real manpower.
  let sid = 1;
  const byKey = new Map();
  for (let id = 1; id <= PROVINCES; id++) {
    if (!isOwnedBelow(id)) continue;
    const key = tagBelow(id) + "|" + Math.floor((id - 1) / W / 4);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(id);
  }
  for (const [key, provs] of [...byKey.entries()].sort()) {
    const tag = key.split("|")[0];
    mk(path.join(base, "history", "states", `${sid}-STATE_${sid}.txt`),
      `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = ${MP_PER_PROVINCE[tag] * provs.length}\n`
      + `\tstate_category = ${CAT_BELOW[tag]}\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${tag}\n\t\tadd_core_of = ${tag}\n\t}\n}\n`);
    sid++;
  }
  return base;
}
function makeBlankedMod(base, { replacePath = true } = {}) {
  const mod = fs.mkdtempSync(path.join(SANDBOX, "mod-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Blanked"\n' + (replacePath ? 'replace_path="history/states"\n' : ""));
  mk(path.join(mod, "map", "definition.csv"), defRows(true));      // Delete map: every province is sea
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  return mod;
}
function statesOnDisk(mod) {
  const dir = path.join(mod, "history", "states");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    return {
      file: f,
      id: parseInt((/id\s*=\s*(\d+)/.exec(t) || [])[1], 10),
      owner: ((/owner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1]) || "",
      cores: [...t.matchAll(/add_core_of\s*=\s*([A-Za-z0-9_]+)/g)].map((m) => m[1]),
      manpower: parseInt((/manpower\s*=\s*(\d+)/.exec(t) || [])[1], 10),
      category: ((/state_category\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1]) || "",
      provinces: (((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g) || [],
    };
  }).map((s) => Object.assign(s, { provinces: s.provinces.map(Number) }));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("=== 1. assignGeneratedStateOwners, as a pure function ===");
{
  const beneath = new Map([
    [1, { owner: "GER", manpowerPerProvince: 100, category: "rural" }],
    [2, { owner: "GER", manpowerPerProvince: 100, category: "rural" }],
    [3, { owner: "FRA", manpowerPerProvince: 50, category: "town" }],
    [4, { owner: "FRA", manpowerPerProvince: 50, category: "town" }],
    [5, { owner: "", manpowerPerProvince: 0, category: "" }],      // open ocean below
    [6, { owner: "", manpowerPerProvince: 0, category: "" }],
  ]);
  // A line: 1-2-3-4-6-5. 5 and 6 are new islands; only 6 touches owned land (4, FRA).
  const adj = new Map([[1, [2]], [2, [1, 3]], [3, [2, 4]], [4, [3, 6]], [6, [4, 5]], [5, [6]]]);
  const r = md.assignGeneratedStateOwners({
    groups: [{ id: 100, provinces: [1, 2, 3] }, { id: 101, provinces: [3, 4] }, { id: 102, provinces: [5, 6] }],
    beneath, adj,
  });
  rec("⭐⭐⭐ MAJORITY: a state built on land two countries held goes to the one that held most of it",
    r.ownerOf.get(100) === "GER", { got: r.ownerOf.get(100), tally: "2 GER, 1 FRA" });
  rec("…and a state entirely inside one country's old land goes to that country", r.ownerOf.get(101) === "FRA", r.ownerOf.get(101));
  rec("⭐⭐⭐ PROXIMITY: a state whose provinces were ALL open ocean below still gets a country — the nearest one",
    r.ownerOf.get(102) === "FRA", r.ownerOf.get(102));
  rec("…and the two passes are counted separately, so the page can say which decided what",
    r.byMajority === 2 && r.byProximity === 1 && r.undecided === 0, { byMajority: r.byMajority, byProximity: r.byProximity, undecided: r.undecided });
  rec("…and the shape of the result is measured, not just the count",
    r.countries === 2 && r.largest === 2 && r.largestShare === 0.667, { countries: r.countries, largest: r.largest, largestShare: r.largestShare });

  // ⭐ THE TIE-BREAK, pinned: an equal split must not depend on which province was tallied first.
  const tie = md.assignGeneratedStateOwners({ groups: [{ id: 1, provinces: [1, 3] }], beneath, adj });
  const tieReversed = md.assignGeneratedStateOwners({ groups: [{ id: 1, provinces: [3, 1] }], beneath, adj });
  rec("⭐⭐ a 1-1 tie goes to the alphabetically-first tag, whichever order the provinces came in",
    tie.ownerOf.get(1) === "FRA" && tieReversed.ownerOf.get(1) === "FRA", { forward: tie.ownerOf.get(1), reversed: tieReversed.ownerOf.get(1) });

  // ⭐⭐⭐ NOTHING IS INVENTED. With nothing below and no graph there is no country to take, and a state is
  // left OWNERLESS rather than handed to whoever came first — ownerless states are legal (OWB ships 313).
  const blind = md.assignGeneratedStateOwners({ groups: [{ id: 1, provinces: [5, 6] }], beneath: new Map(), adj: null });
  rec("⭐⭐⭐ with nothing below it invents no country — the state is left ownerless",
    blind.ownerOf.size === 0 && blind.undecided === 1 && blind.countries === 0, { assigned: blind.ownerOf.size, undecided: blind.undecided });
  const noGraph = md.assignGeneratedStateOwners({ groups: [{ id: 1, provinces: [5, 6] }], beneath, adj: null });
  rec("…and with a world below but no province graph, proximity simply does not run", noGraph.ownerOf.size === 0, noGraph.ownerOf.size);

  // Determinism over a shuffled BFS seed order: the map is iterated in province-id order on purpose.
  const shuffled = new Map([...beneath.entries()].reverse());
  const again = md.assignGeneratedStateOwners({ groups: [{ id: 102, provinces: [5, 6] }], beneath: shuffled, adj });
  rec("⭐ the BFS answer does not depend on the order the world below was handed over",
    again.ownerOf.get(102) === "FRA", again.ownerOf.get(102));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 2. provinceFactsBeneath reads the world the mod REPLACES ===");
const BASE = makeBase();
{
  const withRepl = makeBlankedMod(BASE, { replacePath: true });
  const facts = md.provinceFactsBeneath({ modRoot: withRepl, gameRoot: BASE, dependencyRoots: [] });
  rec("the base fixture really does declare replace_path=\"history/states\"",
    /replace_path="history\/states"/.test(fs.readFileSync(path.join(withRepl, "descriptor.mod"), "utf8")));
  // ⛔ THE WHOLE POINT. layersBelow (the inherited-problem gate) returns [] for a folder the mod replaces, and
  // that is correct for "who is answerable". It is wrong for "what world is being replaced".
  rec("⭐⭐⭐ …and the facts still come through: a replaced world is exactly the one a replacement copies",
    facts.size > 0, facts.size);
  const probe = 1;   // column 0, row 0 → AAA below
  rec("…province " + probe + " is read as its old owner", facts.get(probe) && facts.get(probe).owner === "AAA", facts.get(probe));
  rec("…with the manpower its old state carried, per province",
    facts.get(probe) && facts.get(probe).manpowerPerProvince === MP_PER_PROVINCE.AAA, facts.get(probe));
  rec("…and its old category", facts.get(probe) && facts.get(probe).category === CAT_BELOW.AAA, facts.get(probe));
  const ocean = idAt(20, 3);
  rec("…while a province that was OPEN OCEAN below is not claimed by anybody", !facts.has(ocean), ocean);

  // ⚠️ CACHE WARMTH CAN CHANGE AN ANSWER. This reads the CACHED layer's own state objects, and buildMapModel
  // writes onto those during its merge (rootPath) — so the same fixture is asked cold and warm and must give
  // one answer, or the owner a generated state gets would depend on what ran before it.
  md.clearMapLayerCache();
  const cold = md.provinceFactsBeneath({ modRoot: withRepl, gameRoot: BASE, dependencyRoots: [] });
  md.buildMapModel({ modRoot: withRepl, gameRoot: BASE, dependencyRoots: [], cacheStableLayers: true });
  const warm = md.provinceFactsBeneath({ modRoot: withRepl, gameRoot: BASE, dependencyRoots: [] });
  rec("⚠️ …and it says the same thing COLD and WARM", cold.size === warm.size
    && [...cold.keys()].every((k) => warm.has(k) && warm.get(k).owner === cold.get(k).owner
      && warm.get(k).manpowerPerProvince === cold.get(k).manpowerPerProvince && warm.get(k).category === cold.get(k).category),
    { cold: cold.size, warm: warm.size, probeCold: cold.get(probe), probeWarm: warm.get(probe) });

  const noRepl = makeBlankedMod(BASE, { replacePath: false });
  const facts2 = md.provinceFactsBeneath({ modRoot: noRepl, gameRoot: BASE, dependencyRoots: [] });
  rec("a mod that does NOT replace history/states reads the same world", facts2.size === facts.size, { withReplacePath: facts.size, without: facts2.size });
  rec("THE CONTROL: with no layer below at all, nothing is known",
    md.provinceFactsBeneath({ modRoot: withRepl, gameRoot: null, dependencyRoots: [] }).size === 0);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 3. generateLand: the default gives the world countries; the old behaviours stay reachable ===");
const GEN = { count: 260, provincesPerState: 8, seed: 5 };
let inheritMod = null, inheritStates = [], inheritResult = null;
{
  inheritMod = makeBlankedMod(BASE);
  // ⭐ THE PAGE'S OWN CALL: no `owner`, no `ownerMode`. This is what used to make an ownerless planet.
  inheritResult = md.generateLand(Object.assign({ modRoot: inheritMod, gameRoot: BASE, dependencyRoots: [] }, GEN));
  rec("generate land ran", inheritResult.changed === true && inheritResult.createdStates > 4,
    { changed: inheritResult.changed, states: inheritResult.createdStates, error: inheritResult.error });
  inheritStates = statesOnDisk(inheritMod);
  const owned = inheritStates.filter((s) => s.owner);
  rec("⭐⭐⭐ EVERY generated state has an owner — asking for nothing now means asking for the world below",
    inheritStates.length > 0 && owned.length === inheritStates.length, { states: inheritStates.length, owned: owned.length });
  rec("…and the mode it used is reported", inheritResult.ownership && inheritResult.ownership.mode === "inherit", inheritResult.ownership);
  rec("⭐⭐ BOTH passes did work on this map — majority on the old land, proximity on the old ocean",
    inheritResult.ownership.byMajority > 0 && inheritResult.ownership.byProximity > 0, inheritResult.ownership);
  rec("…and the two passes plus the leftovers account for every state it made",
    inheritResult.ownership.byMajority + inheritResult.ownership.byProximity + inheritResult.ownership.undecided === inheritResult.createdStates,
    { ownership: inheritResult.ownership, created: inheritResult.createdStates });

  // ⭐⭐⭐ NOTHING IS INVENTED: every tag written is one the world below already had.
  const tagsBelow = new Set(Object.keys(CAT_BELOW));
  const written = new Set(owned.map((s) => s.owner));
  rec("⭐⭐⭐ every country on the new map is one the old world had — no tag is invented",
    [...written].every((t) => tagsBelow.has(t)), { written: [...written].sort(), below: [...tagsBelow].sort() });
  rec("…and more than one of them got a share of it, so this is a world and not a conquest",
    written.size >= 2, written.size);
  rec("…every owned state is cored to its own owner, the convention on all six shipping maps",
    owned.every((s) => s.cores.indexOf(s.owner) !== -1), owned.filter((s) => s.cores.indexOf(s.owner) === -1).map((s) => s.id));

  // MAJORITY, checked against the fixture rather than against the reported count.
  const wrong = inheritStates.filter((s) => {
    const tally = new Map();
    for (const p of s.provinces) if (isOwnedBelow(p)) { const t = tagBelow(p); tally.set(t, (tally.get(t) || 0) + 1); }
    if (!tally.size) return false;               // proximity's business, checked below
    let best = "", bestN = 0;
    for (const t of [...tally.keys()].sort()) if (tally.get(t) > bestN) { best = t; bestN = tally.get(t); }
    return s.owner !== best;
  });
  rec("⭐⭐⭐ every state built on old land went to the country that held MOST of that land",
    wrong.length === 0, wrong.map((s) => ({ id: s.id, got: s.owner, provinces: s.provinces.slice(0, 6) })));
  const openOcean = inheritStates.filter((s) => s.provinces.every((p) => !isOwnedBelow(p)));
  rec("…and every state built on what was open ocean got a neighbour's flag anyway",
    openOcean.length > 0 && openOcean.every((s) => !!s.owner), { of: openOcean.length, ownerless: openOcean.filter((s) => !s.owner).length });
}
{
  // ⛔ THE BACK-OUT CONTROL, and the escape hatch: "none" reproduces the world that crashed.
  const noneMod = makeBlankedMod(BASE);
  const r = md.generateLand(Object.assign({ modRoot: noneMod, gameRoot: BASE, dependencyRoots: [], ownerMode: "none" }, GEN));
  const states = statesOnDisk(noneMod);
  rec("⭐⭐ ownerMode \"none\" still makes the world Nova used to make — the pre-fix behaviour is reachable",
    states.length > 0 && states.every((s) => !s.owner), { states: states.length, owned: states.filter((s) => s.owner).length });
  rec("…and it says so rather than pretending it decided something", r.ownership && r.ownership.mode === "none" && r.ownership.countries === 0, r.ownership);
  rec("…and it made the same number of states as the inherited run, so only ownership differs",
    states.length === inheritStates.length, { none: states.length, inherit: inheritStates.length });
}
{
  // ⭐⭐ BACKWARDS COMPATIBILITY: `owner: "TAG"` and nothing else must still mean what it always meant.
  const soloMod = makeBlankedMod(BASE);
  const r = md.generateLand(Object.assign({ modRoot: soloMod, gameRoot: BASE, dependencyRoots: [], owner: "ZZZ" }, GEN));
  const states = statesOnDisk(soloMod);
  rec("⭐⭐ a caller that passes only a tag still gets the whole world handed to it — the one-country sandbox",
    states.length > 0 && states.every((s) => s.owner === "ZZZ"), { states: states.length, other: states.filter((s) => s.owner !== "ZZZ").length });
  rec("…chosen automatically, without the caller having to know about ownerMode", r.ownership && r.ownership.mode === "single", r.ownership);
  rec("…and an explicit ownerMode still wins over a tag, so the two can disagree on purpose", (() => {
    const m = makeBlankedMod(BASE);
    md.generateLand(Object.assign({ modRoot: m, gameRoot: BASE, dependencyRoots: [], owner: "ZZZ", ownerMode: "none" }, GEN));
    return statesOnDisk(m).every((s) => !s.owner);
  })());
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 4. manpower and state_category come from the world below, not from a constant ===");
{
  // Measured over the base game's 1,081 states: manpower median 820,000, and EXACTLY FIVE states are 10,000.
  // A flat 10000 on every state of a planet is a 3rd-percentile number applied to a world.
  // ⛔ #a-generated-country-keeps-its-economy — the per-province carry is asked of an `economy: "land"` twin of the page's call: by
  // default each country keeps its 1936 economy and spreads its people over its states (test-a-generated-country-keeps-its-economy.js).
  const landMod = makeBlankedMod(BASE);
  const landRun = md.generateLand(Object.assign({ modRoot: landMod, gameRoot: BASE, dependencyRoots: [], economy: "land" }, GEN));
  const landStates = statesOnDisk(landMod);
  rec("the twin with the land's own carry ran, and made the same states", landRun.changed === true && (landRun.economy || {}).mode === "land"
    && JSON.stringify(landStates.map((s) => s.provinces.join(",")).sort()) === JSON.stringify(inheritStates.map((s) => s.provinces.join(",")).sort()), landRun.economy);
  const withPeople = landStates.filter((s) => s.provinces.some(isOwnedBelow));
  rec("⭐⭐⭐ a state built on land that had people does NOT get the flat 10000",
    withPeople.length > 0 && withPeople.some((s) => s.manpower !== 10000),
    { of: withPeople.length, stillFlat: withPeople.filter((s) => s.manpower === 10000).length });
  const exact = withPeople.filter((s) => {
    const want = s.provinces.reduce((sum, p) => sum + (isOwnedBelow(p) ? MP_PER_PROVINCE[tagBelow(p)] : 0), 0);
    return want > 0 && s.manpower !== want;
  });
  rec("⭐⭐ …it gets its old states' manpower, per province, summed over the provinces it took",
    exact.length === 0, exact.slice(0, 4).map((s) => ({ id: s.id, got: s.manpower })));
  const oceanOnly = landStates.filter((s) => s.provinces.every((p) => !isOwnedBelow(p)));
  rec("…and a state about which nothing is known keeps the old constant rather than a made-up number",
    oceanOnly.length > 0 && oceanOnly.every((s) => s.manpower === 10000), oceanOnly.filter((s) => s.manpower !== 10000).map((s) => s.id));
  rec("⭐ an explicitly-passed manpower still wins — the option did not stop working", (() => {
    const m = makeBlankedMod(BASE);
    md.generateLand(Object.assign({ modRoot: m, gameRoot: BASE, dependencyRoots: [], manpower: 4242 }, GEN));
    const st = statesOnDisk(m);
    return st.length > 0 && st.every((s) => s.manpower === 4242);
  })());

  // CATEGORY. `rural` is vanilla's commonest, but Millennium Dawn's categories are state_00…state_18 and
  // Novum Vexillum's state_level_0…state_level_35 — so a world generated over either wrote a category NOTHING
  // DEFINES, on every state it made. Taking it from below fixes that; a category the table does not declare
  // still falls back, so the generator can never introduce an unknown_state_category of its own.
  const cats = new Set(inheritStates.map((s) => s.category));
  rec("⭐⭐⭐ not every state is `rural` any more — the category comes from the land below",
    cats.size > 1 && (cats.has("town") || cats.has("city")), [...cats].sort());
  const undeclared = inheritStates.filter((s) => s.category === CAT_BELOW.CCC);
  rec("⭐⭐ …but a category the loaded state_category table does NOT declare is never written",
    undeclared.length === 0, undeclared.slice(0, 4).map((s) => ({ id: s.id, category: s.category })));
  const cccOnly = inheritStates.filter((s) => s.provinces.length && s.provinces.every((p) => isOwnedBelow(p) && tagBelow(p) === "CCC"));
  rec("…those states fall back to rural, which is what this generator has always written",
    cccOnly.length > 0 && cccOnly.every((s) => s.category === "rural"), { of: cccOnly.length, other: cccOnly.filter((s) => s.category !== "rural").map((s) => s.category) });
  // The map Nova built must not be reported as broken by Nova's own category rule.
  const problems = md.validateMapModel(md.buildMapModel({ modRoot: inheritMod, gameRoot: BASE, dependencyRoots: [] })) || [];
  rec("⭐⭐ …so the world it just built raises no unknown_state_category of its own",
    !problems.some((p) => p.rule === "unknown_state_category"),
    problems.filter((p) => p.rule === "unknown_state_category").map((p) => String(p.message).slice(0, 120)));
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 5. the rule: world_has_no_owners ===");
{
  const ruleOn = (mod) => {
    const model = md.buildMapModel({ modRoot: mod, gameRoot: BASE, dependencyRoots: [] });
    return ((md.validateMapModel(model) || []).find((p) => p.rule === "world_has_no_owners")) || null;
  };
  const noneMod = makeBlankedMod(BASE);
  md.generateLand(Object.assign({ modRoot: noneMod, gameRoot: BASE, dependencyRoots: [], ownerMode: "none" }, GEN));
  const fired = ruleOn(noneMod);
  const noneStates = statesOnDisk(noneMod);
  rec("⭐⭐⭐ a world in which NOT ONE state has an owner is reported", !!fired, fired && String(fired.message).slice(0, 120));
  rec("…as an error", !!fired && fired.severity === "error", fired && fired.severity);
  // ⚠️ COUNT THE POPULATION, NOT THE ROWS. Several map rules report ONE row carrying `total`.
  rec("⭐⭐ …counting the states it is true of, not the number of rows it printed",
    !!fired && fired.total === noneStates.length && fired.totalNoun === "states", { total: fired && fired.total, states: noneStates.length });
  // ⚠️ CACHE WARMTH CAN CHANGE AN ANSWER — buildMapModel writes fields onto the object its cached layer holds.
  md.clearMapLayerCache();
  const cold = ruleOn(noneMod);
  const warm = ruleOn(noneMod);
  rec("⚠️ …and it says the same thing COLD and WARM", !!cold && !!warm && cold.total === warm.total,
    { cold: cold && cold.total, warm: warm && warm.total });

  rec("⭐⭐⭐ THE CONTROL: the same world with owners is silent", !ruleOn(inheritMod), "");

  // 🚫 CRY WOLF, the precise version. The rule is NOT "every state must have an owner": ownerless states are
  // legal and Old World Blues ships 313 of them and launches. Take the world that passes and strip the owner
  // off most of its states — it must stay silent until the LAST one goes.
  const someMod = makeBlankedMod(BASE);
  md.generateLand(Object.assign({ modRoot: someMod, gameRoot: BASE, dependencyRoots: [] }, GEN));
  const dir = path.join(someMod, "history", "states");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).sort();
  for (const f of files.slice(0, files.length - 1)) {
    const p = path.join(dir, f);
    fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/\n\t\towner = [A-Za-z0-9_]+/, ""));
  }
  md.clearMapLayerCache();
  const stillOwned = statesOnDisk(someMod).filter((s) => s.owner).length;
  rec("the fixture really is a world with one owner left standing", stillOwned === 1, stillOwned);
  rec("⭐⭐⭐ a map with ONE owned state and all the rest ownerless is NOT reported — OWB ships 313 ownerless states",
    !ruleOn(someMod), "");
  const p = path.join(dir, files[files.length - 1]);
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(/\n\t\towner = [A-Za-z0-9_]+/, ""));
  md.clearMapLayerCache();
  rec("⭐⭐ …and it IS reported the moment the last one goes", !!ruleOn(someMod), "");

  // The label, so the panel never shows a raw rule name.
  const labels = require("./public/map-rule-labels.js");
  rec("the rule has a friendly label", !!labels.LABELS.world_has_no_owners, labels.LABELS.world_has_no_owners);
  // NOT fatal: the game LOADED this map, drew it and reached a running game. The Save gate claims a map HOI4
  // cannot load or play at all, and that has not been shown. #a-validator-must-not-cry-wolf
  rec("⭐⭐ …and is NOT in the guaranteed-fatal set — HOI4 loaded this world and reached a 1936 game",
    labels.isFatalRule("world_has_no_owners") === false);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 6. 🈯 THE CORPUS: every shipping map is far from this rule ===");
{
  // Derived from what is installed, never typed in.
  let roots = [];
  try { roots = fs.readdirSync(WORKSHOP).map((d) => path.join(WORKSHOP, d)).filter((d) => { try { return fs.statSync(d).isDirectory(); } catch (_) { return false; } }); } catch (_) { roots = []; }
  if (fs.existsSync(path.join(GAME, "map", "definition.csv"))) roots.unshift(GAME);
  const maps = roots.filter((r) => fs.existsSync(path.join(r, "history", "states")) && fs.existsSync(path.join(r, "map", "definition.csv")));
  if (!maps.length) {
    // ⚠️ A SKIP READS AS A PASS. Say it loudly; the synthetic control above (one owned state and the rest
    // ownerless) is what carries the cry-wolf claim when the corpus is not installed.
    console.log("     ⚠️ SKIPPED: no installed shipping maps on this machine — the corpus half did not run");
  } else {
    const rows = [];
    for (const r of maps) {
      md.clearMapLayerCache();
      const model = md.buildMapModel({ modRoot: r, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
      const states = model.states || [];
      const owned = states.filter((s) => String(s.owner || "").trim() !== "").length;
      const fired = (md.validateMapModel(model) || []).some((p) => p.rule === "world_has_no_owners");
      rows.push({ map: path.basename(r), states: states.length, owned, fired });
    }
    console.log("     " + JSON.stringify(rows));
    rec("⭐⭐⭐ the rule fires on NO shipping map", rows.every((x) => !x.fired), rows.filter((x) => x.fired));
    rec("⭐⭐ …and not by luck: the map with the FEWEST owned states still has hundreds",
      Math.min(...rows.map((x) => x.owned)) > 100, { fewest: Math.min(...rows.map((x) => x.owned)), maps: rows.length });
    rec("…while at least one of them ships ownerless states, which this rule must never report",
      rows.some((x) => x.owned < x.states), rows.filter((x) => x.owned < x.states));
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 7. the page can ask for all three ===");
{
  const HTML = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
  const RAW = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  rec("the Generate land dialog has a \"who owns it\" control", /id="mapGenOwnerMode"/.test(HTML));
  // DERIVED from the markup, never typed: whatever the select offers is what the handler has to understand.
  const sel = /<select id="mapGenOwnerMode"[\s\S]*?<\/select>/.exec(HTML);
  const offered = sel ? [...sel[0].matchAll(/value="([a-z]+)"/g)].map((m) => m[1]) : [];
  rec("…offering the three modes generateLand understands", offered.length === 3
    && ["inherit", "none", "single"].every((m) => offered.indexOf(m) !== -1), offered);
  rec("⭐⭐ …with \"the countries below it\" pre-selected, so doing nothing makes a world with countries on it",
    /<option value="inherit" selected>/.test(HTML));
  rec("…and a box for the one tag, so the sandbox is still reachable from the page", /id="mapGenOwnerTag"/.test(HTML));
  rec("⭐⭐ the POST sends the mode and the tag", /ownerMode, owner: ownerMode === "single" \? ownerTag : ""/.test(RAW));
  rec("…and a \"one country\" with no tag typed falls back rather than making an ownerless world quietly",
    /if \(ownerMode === "single" && !ownerTag\) ownerMode = "inherit";/.test(RAW));
  rec("…wired with addEventListener, never an inline handler (CSP: script-src 'self')",
    /\$\("mapGenOwnerMode"\)\.addEventListener\("change", syncGenOwner\)/.test(RAW) && !/onchange=/.test(sel ? sel[0] : ""));
  rec("the server passes the mode through to the generator", /ownerMode: b\.ownerMode/.test(fs.readFileSync(path.join(__dirname, "server.js"), "utf8")));

  // ⭐⭐ RUN IT. A source assertion over a string is not a back-out control.
  const fnSrc = (() => {
    const at = RAW.indexOf("function genOwnerNote(");
    if (at === -1) return "";
    let d = 0;
    for (let i = RAW.indexOf("{", at); i < RAW.length; i++) {
      if (RAW[i] === "{") d++;
      else if (RAW[i] === "}") { d--; if (d === 0) return RAW.slice(at, i + 1); }
    }
    return "";
  })();
  rec("genOwnerNote was lifted out of public/map.js", !!fnSrc);
  const note = fnSrc ? new Function(fnSrc + "\nreturn genOwnerNote;")() : null;
  if (note) {
    rec("⭐ the default's note says where the countries come from and that none is invented",
      /world underneath/.test(note("inherit")) && /invented/.test(note("inherit")), note("inherit"));
    rec("⭐⭐⭐ …and \"Nobody\" WARNS, naming what the game does with a map that has no countries on it",
      /Invalid Scope/.test(note("none")) && note("none").indexOf("\u26a0") !== -1, note("none"));
    rec("…and the one-tag note says it is a single-player sandbox", /one country/.test(note("single")), note("single"));
    rec("…and the three notes are three different sentences", new Set([note("inherit"), note("none"), note("single")]).size === 3);
  }
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}   // scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1)
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
