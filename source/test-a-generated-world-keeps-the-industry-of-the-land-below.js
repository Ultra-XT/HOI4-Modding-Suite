// ⛔ #a-generated-state-keeps-the-industry-of-the-land-below — A STATE GENERATE LAND BUILDS CARRIES THE FACTORIES, DOCKYARDS AND
// FORTS OF THE LAND UNDER IT, as it already carries that land's manpower and resources.
//
// TEST 32 (the owner's flow: New mod → Delete map → Generate land 35% seed 1, inherit → Auto-fix → Redraw regions) started with
// 0 civilian factories, 0 military factories, 0 dockyards and 0 coastal forts, against the base game's IC 804, AF 317, dockyard
// 151 and coastal_bunker 96 — provinceFactsBeneath dropped every state building, so nothing downstream could carry one, and the
// game began with no country able to build anything.
//
// The fixture is one world in which every case the rule has to get right happens once, each province its own state
// (provincesPerState 1) so each generated state's owner and category are those of the state below it:
//   (a) a share that is a fraction — 2 factories over 3 provinces; floored per province (as resources are) it is nothing;
//   (b) three states of one country at 0.4 each — rounded per state that is none, per country it is one;
//   (c) a 1-slot (pastoral) state carrying 2 factories — the second goes to another state of the same country;
//   (d) a dockyard share on inland land — it goes to the country's coastal state;
//   (e) a country with only inland land and a dockyard share — dropped, and said as `noCoast`;
//   (f) a 1939.1.1 block after the undated one — its 9 factories are not the 1936 start and are not carried;
//   (g) a state whose ONLY buildings block is dated (Rise of Nations' 607) — nothing is carried from it;
//   (h) bunker and coastal_bunker on an inland and a coastal province — the bunker follows its province, a coastal fort only
//       onto a coast that is still one;
//   (i) a shares_slots building with no models (Millennium Dawn's offices) — carried, and counted against the slots;
//   (j) a building with models and no row a new state is given (Road to 56's steel_mill) — not carried, and said;
//   (k) a coastal country whose coastal state is full — what it cannot fit is dropped as `noRoom`, not `noCoast`; the dockyard,
//       dealt first, holds the coast's slot and the factory is what drops.
// ⛔ #a-generated-country-keeps-its-economy — every world here is generated with `economy: "land"`, the land's own carry this test
// pins: by default each country now keeps its 1936 economy (test-a-generated-country-keeps-its-economy.js), which spreads what
// the land below held over the country's new states rather than leaving it on the land that held it.
// Every expected number is computed below from the manifest with plain arithmetic, never read off the writer, and the coast's
// rows are read back by pixel: a count is not a placement. Then the page's own note is lifted out of public/map.js and run.
// Section 5 is a second, smaller world for what one province per state cannot show: in a coastal state of two provinces the
// dockyard row stands on the one with the highest port, and over a common/buildings that defines no fort neither a fort's row
// nor its level is written.
//
// Fixture-only: binds no port. Run: node test-a-generated-world-keeps-the-industry-of-the-land-below.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gen-industry-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
process.env.HOI4_MODS_ROOT = SANDBOX;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
let n = 0;
const tmpDir = (tag) => { const d = path.join(SANDBOX, `${tag}-${++n}`); fs.mkdirSync(d, { recursive: true }); return d; };

// ── the world: 6 × 4 blocks of 48 px, province = col + row × 6 + 1 ───────────────────────────────────────────────────────
// Rows 0-2 (1-18) are in a strategic region and are raised; row 3 (19-24) is in none and stays sea, so afterwards exactly
// row 2 (13-18) is on a coast whatever the seed. (x wraps, but every row is all land or all sea, so the seam adds no coast.)
const COLS = 6, ROWS = 4, BLOCK = 48, W = COLS * BLOCK, H = ROWS * BLOCK;
const provAt = (x, y) => Math.floor(x / BLOCK) + Math.floor(y / BLOCK) * COLS + 1;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const RAISED = Array.from({ length: 18 }, (_, i) => i + 1);
const COASTAL = new Set([13, 14, 15, 16, 17, 18]);
function bmp24() {
  const rowSize = (W * 3 + 3) & ~3, imgSize = rowSize * H, b = Buffer.alloc(54 + imgSize);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + imgSize, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(imgSize, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const [r, g, bl] = COL(provAt(x, y)); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const csv = (land) => ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: COLS * ROWS }, (_, i) => {
  const p = i + 1, [r, g, b] = COL(p), isLand = land.includes(p);
  return `${p};${r};${g};${b};${isLand ? "land" : "sea"};false;${isLand ? "plains" : "ocean"};${isLand ? 1 : 0}`;
})).join("\n") + "\n";

// ── ⛔ THE MANIFEST: the world below, and the rules its common/ folders give ────────────────────────────────────────────
const SLOTS = { rural: 2, town: 4, pastoral: 1, city: 6 };
const BUILDINGS = {   // name → its definition; the test reads shares_slots / state_max / coast / models back off this, never off Nova
  infrastructure: { stateMax: 5 }, air_base: { stateMax: 10, show: 1 },
  industrial_complex: { shares: true, stateMax: 20, show: 6 }, arms_factory: { shares: true, stateMax: 20, show: 6 },
  dockyard: { shares: true, stateMax: 20, show: 1, coast: true }, anti_air_building: { stateMax: 5, show: 3 },
  offices: { shares: true, stateMax: 50 },                                        // (i) Millennium Dawn's shape: no models
  steel_mill: { shares: true, stateMax: 20, show: 1 },                            // (j) Road to 56's: models, no template row
  bunker: { provinceMax: 10, show: 1 }, coastal_bunker: { provinceMax: 10, show: 1, coast: true },
};
const BELOW = [
  { id: 1, owner: "AAA", cat: "rural", provs: [1, 2, 3], b: { industrial_complex: 2, dockyard: 3 }, pb: { 3: { bunker: 2, coastal_bunker: 1 } } },   // (a)(d)(h)
  { id: 2, owner: "AAA", cat: "town", provs: [13], b: {}, dated: { industrial_complex: 9 } },                                                     // (f)
  { id: 3, owner: "BBB", cat: "rural", provs: [4, 5, 6, 22, 23], b: { industrial_complex: 2 } },                                                 // (b)
  { id: 4, owner: "CCC", cat: "pastoral", provs: [7], b: { industrial_complex: 2 } },                                                           // (c)
  { id: 5, owner: "CCC", cat: "rural", provs: [8], b: {} },
  { id: 6, owner: "DDD", cat: "rural", provs: [9, 10], b: { dockyard: 2 } },                                                                    // (e)
  { id: 7, owner: "EEE", cat: "pastoral", provs: [14], b: { industrial_complex: 1, dockyard: 1 }, pb: { 14: { coastal_bunker: 3, bunker: 1 } } },  // (k)(h)
  { id: 8, owner: "FFF", cat: "rural", provs: [15], b: null, datedOnly: { industrial_complex: 5 } },                                            // (g)
  { id: 9, owner: "GGG", cat: "city", provs: [16, 17], b: { offices: 3, steel_mill: 2 } },                                                      // (i)(j)
  { id: 10, owner: "HHH", cat: "rural", provs: [11, 12, 18], b: { anti_air_building: 3 } },
];
const ownerBelow = new Map(), catBelow = new Map();
for (const s of BELOW) for (const p of s.provs) { ownerBelow.set(p, s.owner); catBelow.set(p, s.cat); }

// `below`, `raised` and `buildings` default to the manifest; section 5 builds a second, smaller world from the same parts
function buildGame({ withStates = true, below = BELOW, raised = RAISED, buildings = BUILDINGS } = {}) {
  const g = tmpDir("game");
  mk(g, "map/provinces.bmp", bmp24());
  mk(g, "map/definition.csv", csv(raised.concat(below.flatMap((s) => s.provs))));
  mk(g, "map/buildings.txt", "");   // the positions file a new state's rows are added to (ensureBuildingSlotsForState writes none without one)
  mk(g, "map/strategicregions/r1.txt", `strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ ${raised.join(" ")} }\n\tweather={}\n}\n`);
  mk(g, "common/state_category/00.txt", "state_categories = {\n" + Object.entries(SLOTS).map(([k, v]) => `\t${k} = {\n\t\tlocal_building_slots = ${v}\n\t}\n`).join("") + "}\n");
  mk(g, "common/buildings/00_buildings.txt", "buildings = {\n" + Object.entries(buildings).map(([k, d]) => `\t${k} = {\n`
    + (d.show ? `\t\tshow_on_map = ${d.show}\n` : "") + (d.coast ? "\t\tonly_costal = yes\n" : "")
    + `\t\tlevel_cap = {\n${d.shares ? "\t\t\tshares_slots = yes\n" : ""}${d.stateMax ? `\t\t\tstate_max = ${d.stateMax}\n` : ""}${d.provinceMax ? `\t\t\tprovince_max = ${d.provinceMax}\n` : ""}\t\t}\n\t}\n`).join("") + "}\n");
  if (withStates) for (const s of below) {
    const pbs = Object.entries(s.pb || {}).map(([p, kv]) => `\t\t\t${p} = { ${Object.entries(kv).map(([k, v]) => `${k} = ${v}`).join(" ")} }\n`).join("");
    const undated = s.b ? `\t\tbuildings = {\n\t\t\tinfrastructure = 3\n${Object.entries(s.b).map(([k, v]) => `\t\t\t${k} = ${v}\n`).join("")}${pbs}\t\t}\n` : "";
    const later = s.dated || s.datedOnly;
    const dated = later ? `\t\t1939.1.1 = {\n\t\t\tbuildings = {\n${Object.entries(later).map(([k, v]) => `\t\t\t\t${k} = ${v}\n`).join("")}\t\t\t}\n\t\t}\n` : "";
    mk(g, `history/states/${s.id}-S.txt`, `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = 100000\n\tstate_category = ${s.cat}\n`
      + `\tprovinces = { ${s.provs.join(" ")} }\n\thistory = {\n\t\towner = ${s.owner}\n${undated}${dated}\t}\n}\n`);
  }
  return g;
}
function buildMod() {
  const m = tmpDir("mod");
  mk(m, "descriptor.mod", 'version="1"\nname="Industry"\nreplace_path="history/states"\npath="mod/industry"\n');
  mk(m, "map/provinces.bmp", bmp24());
  mk(m, "map/definition.csv", csv([]));
  return m;
}

// ── what the manifest says must come out, by plain arithmetic ───────────────────────────────────────────────────────────
const raisedSet = new Set(RAISED);
const share = new Map();   // province → { key: F / provinces the state lists }, the undated block only, 0 for a dated-first state
for (const s of BELOW) for (const p of s.provs) share.set(p, Object.fromEntries(Object.entries(s.b || {}).map(([k, v]) => [k, v / s.provs.length])));
// a key is dealt when it has no models, or its models have a row a new state is given (Nova's own templates, read off the source)
const ROW_TYPES = new Set([...(md.STATE_BUILDING_SLOTS || []), ...(md.COASTAL_STATE_BUILDING_SLOTS || [])].map(([t]) => t));
const placeable = (k) => { const d = BUILDINGS[k]; return !!d && !d.provinceMax && (!d.show || ROW_TYPES.has(k)); };
const T = {};              // owner → key → round(Σ share over its RAISED provinces)
for (const p of RAISED) for (const [k, v] of Object.entries(share.get(p) || {})) {
  const o = ownerBelow.get(p); T[o] = T[o] || {}; T[o][k] = (T[o][k] || 0) + v;
}
for (const o of Object.keys(T)) for (const k of Object.keys(T[o])) T[o][k] = Math.round(T[o][k] + 1e-9);
const coastalOwners = new Set([...COASTAL].map((p) => ownerBelow.get(p)));
const expectNoCoast = {}, expectNoRoom = {}, expectWritten = {}, expectNotCarried = {};
for (const [o, keys] of Object.entries(T)) for (const [k, t] of Object.entries(keys)) {
  if (!placeable(k)) { continue; }
  if (BUILDINGS[k].coast && !coastalOwners.has(o)) { expectNoCoast[k] = (expectNoCoast[k] || 0) + t; continue; }
  expectWritten[k] = (expectWritten[k] || 0) + t;
}
for (const p of RAISED) for (const [k, v] of Object.entries(share.get(p) || {})) if (!placeable(k)) expectNotCarried[k] = (expectNotCarried[k] || 0) + v;
// (k): EEE's one coastal state is pastoral (1 slot). The factory is the larger share world-wide, but a coast-only key is dealt
// first (#a-generated-country-keeps-its-economy): the dockyard takes the slot, and the factory is what EEE has no room for
const eeeCoastal = [...COASTAL].filter((p) => ownerBelow.get(p) === "EEE");
const eeeShared = Object.entries(T.EEE).filter(([k]) => BUILDINGS[k].shares).reduce((a, [, v]) => a + v, 0);
const eeeRoom = eeeCoastal.reduce((a, p) => a + SLOTS[catBelow.get(p)], 0);
expectNoRoom.industrial_complex = eeeShared - eeeRoom;
expectWritten.industrial_complex -= expectNoRoom.industrial_complex;

console.log("=== 0. the fixture can tell right from wrong (controls, from the manifest alone) ===");
{
  const flooredAAA = [1, 2, 3].reduce((a, p) => a + Math.floor(share.get(p).industrial_complex), 0);
  rec("CONTROL (a): floored per province, as resources are, AAA's 2 factories are 0", flooredAAA === 0 && T.AAA.industrial_complex === 2, { flooredAAA, T: T.AAA });
  const perStateBBB = [4, 5, 6].reduce((a, p) => a + Math.round(share.get(p).industrial_complex), 0);
  rec("CONTROL (b): rounded per state BBB's three 0.4 shares are 0; per country they are 1", perStateBBB === 0 && T.BBB.industrial_complex === 1, { perStateBBB, T: T.BBB });
  rec("CONTROL (c): CCC's 2 factories cannot both fit its pastoral state's slots", T.CCC.industrial_complex > SLOTS[catBelow.get(7)], { T: T.CCC, slots: SLOTS.pastoral });
  rec("CONTROL (e): DDD owns no coastal province, and has a dockyard share", !coastalOwners.has("DDD") && T.DDD.dockyard > 0, T.DDD);
  rec("CONTROL (k): EEE's coastal state cannot take its factory and its dockyard", expectNoRoom.industrial_complex === 1, { eeeShared, eeeRoom });
  rec("CONTROL: the factory is the largest share in the world, so dealt by share alone it would take EEE's slot", (() => {
    const tot = {}; for (const p of RAISED) for (const [k, v] of Object.entries(share.get(p) || {})) tot[k] = (tot[k] || 0) + v;
    return tot.industrial_complex > tot.dockyard;
  })());
}

// ── run it, cold and then warm in one process (getRootLayer's cache) ───────────────────────────────────────────────────────
function readStates(mod) {
  const dir = path.join(mod, "history", "states");
  return fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    const id = +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1];
    const provinces = (((/\bprovinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g).map(Number);
    const category = (/\bstate_category\s*=\s*(\w+)/.exec(t) || [])[1];
    const owner = (/\bowner\s*=\s*(\w+)/.exec(t) || [])[1] || "";
    const bi = t.indexOf("buildings = {");
    let body = "";
    if (bi >= 0) { let d = 0; for (let j = t.indexOf("{", bi); j < t.length; j++) { if (t[j] === "{") d++; else if (t[j] === "}") { d--; if (!d) { body = t.slice(t.indexOf("{", bi) + 1, j); break; } } } }
    const flat = body.replace(/\d+\s*=\s*\{[^{}]*\}/g, " "), keys = {};
    for (const m of flat.matchAll(/([a-z_]+)\s*=\s*(\d+)/g)) keys[m[1]] = +m[2];
    const prov = {};
    for (const m of body.matchAll(/(\d+)\s*=\s*\{([^{}]*)\}/g)) { prov[+m[1]] = {}; for (const kv of m[2].matchAll(/([a-z_]+)\s*=\s*(\d+)/g)) prov[+m[1]][kv[1]] = +kv[2]; }
    return { id, provinces, category, owner, keys, prov, dated: /\b\d{4}\.\d{1,2}\.\d{1,2}\s*=/.test(t), text: t };
  });
}
function readRows(mod) {
  const t = fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8");
  return t.split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 7).map((c) => ({ sid: +c[0], type: c[1], x: +c[2], z: +c[4] }));
}
const GEN = (mod, game) => ({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: RAISED.length, provincesPerState: 1, seed: 7, ownerMode: "inherit", economy: "land" });

const game = buildGame();
const runs = [];
for (const label of ["cold", "warm"]) {
  const mod = buildMod();
  const r = md.generateLand(GEN(mod, game));
  runs.push({ label, mod, r, states: readStates(mod), rows: readRows(mod) });
}

for (const { label, mod, r, states, rows } of runs) {
  console.log(`\n=== 1. ${label}: the levels ===`);
  rec(`${label}: the world was generated, one state per province`, r && r.changed === true && states.length === RAISED.length && states.every((s) => s.provinces.length === 1), r && (r.error || r.createdStates));
  const of = new Map(states.map((s) => [s.provinces[0], s]));   // province → its state
  rec(`${label}: each state is owned as the state below it was`, RAISED.every((p) => (of.get(p) || {}).owner === ownerBelow.get(p)), RAISED.map((p) => (of.get(p) || {}).owner));
  const got = {};
  for (const s of states) for (const [k, v] of Object.entries(s.keys)) if (k !== "infrastructure" && k !== "air_base") { got[s.owner] = got[s.owner] || {}; got[s.owner][k] = (got[s.owner][k] || 0) + v; }
  // 1. per country and key, exactly round(Σ share), less what (e) and (k) force out
  for (const [o, keys] of Object.entries(T)) for (const [k, t] of Object.entries(keys)) {
    if (!placeable(k)) continue;
    const want = BUILDINGS[k].coast && !coastalOwners.has(o) ? 0 : (o === "EEE" && k === "industrial_complex" ? t - expectNoRoom.industrial_complex : t);
    rec(`${label}: ${o} holds ${want} ${k} (round of its shares ${t})`, ((got[o] || {})[k] || 0) === want, got[o]);
  }
  const unexpected = Object.entries(got).flatMap(([o, kv]) => Object.keys(kv).filter((k) => !(T[o] && T[o][k] && placeable(k))).map((k) => `${o}.${k}`));
  rec(`${label}: no country holds a building it held no share of`, unexpected.length === 0, unexpected);
  rec(`${label}: (a) no AAA state holds more than the ⌈share⌉ of its own land`, [1, 2, 3].every((p) => (of.get(p).keys.industrial_complex || 0) <= Math.ceil(share.get(p).industrial_complex)), [1, 2, 3].map((p) => of.get(p).keys));
  rec(`${label}: (c) CCC's pastoral state holds what its slots hold, the rest is in its other state`,
    of.get(7).keys.industrial_complex === SLOTS.pastoral && of.get(8).keys.industrial_complex === T.CCC.industrial_complex - SLOTS.pastoral, [of.get(7).keys, of.get(8).keys]);
  rec(`${label}: (d) AAA's dockyards are all in its one coastal state`, of.get(13).keys.dockyard === T.AAA.dockyard, of.get(13).keys);
  rec(`${label}: (f) the 1939 factories of AAA's coastal state were not carried`, !of.get(13).keys.industrial_complex, of.get(13).keys);
  rec(`${label}: (g) nothing came from a state whose only buildings block is dated`, Object.keys(of.get(15).keys).every((k) => k === "infrastructure" || k === "air_base"), of.get(15).keys);
  rec(`${label}: (i) the offices with no models were carried`, (got.GGG || {}).offices === T.GGG.offices, got.GGG);
  rec(`${label}: (j) the steel mill with models and no row was not`, !(got.GGG || {}).steel_mill, got.GGG);
  rec(`${label}: (k) EEE's coastal state holds the dockyard, dealt first, in its one slot`, of.get(14).keys.dockyard === T.EEE.dockyard && !of.get(14).keys.industrial_complex, of.get(14).keys);

  // 2. slots and state_max, by the manifest's own table
  const over = states.filter((s) => Object.entries(s.keys).filter(([k]) => (BUILDINGS[k] || {}).shares).reduce((a, [, v]) => a + v, 0) > SLOTS[s.category]
    || Object.entries(s.keys).some(([k, v]) => BUILDINGS[k] && BUILDINGS[k].stateMax && v > BUILDINGS[k].stateMax));
  rec(`${label}: no state holds more shared-slot levels than its category's slots, or a key past its state_max`, over.length === 0, over.map((s) => [s.id, s.category, s.keys]));
  // 3. the coast
  const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
  const coast = md.landProvincesTouchingSea({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
  rec(`${label}: the coast is row 2, as built`, JSON.stringify([...coast].sort((a, b) => a - b)) === JSON.stringify([...COASTAL]), [...coast]);
  rec(`${label}: no state with a dockyard lacks a province on the coast`, states.filter((s) => s.keys.dockyard).every((s) => s.provinces.some((p) => coast.has(p))), states.filter((s) => s.keys.dockyard).map((s) => s.provinces));
  // 4. no dated block is written
  rec(`${label}: no generated state file holds a dated block`, states.every((s) => !s.dated), states.filter((s) => s.dated).map((s) => s.id));
  // 5. forts: each province's own, a coastal one only on a coast
  const fortsWant = {}, fortsGot = {};
  for (const s of BELOW) for (const [p, kv] of Object.entries(s.pb || {})) if (raisedSet.has(+p)) for (const [k, v] of Object.entries(kv)) if (k === "bunker" || COASTAL.has(+p)) fortsWant[`${p}.${k}`] = v;
  for (const s of states) for (const [p, kv] of Object.entries(s.prov)) for (const [k, v] of Object.entries(kv)) if (k !== "naval_base") fortsGot[`${p}.${k}`] = v;
  rec(`${label}: (h) the forts are each province's own, and a coastal fort stands only on a coast`, JSON.stringify(fortsGot, Object.keys(fortsGot).sort()) === JSON.stringify(fortsWant, Object.keys(fortsWant).sort()), { fortsGot, fortsWant });
  rec(`${label}: every fort is in the block of the province it stands in`, states.every((s) => Object.keys(s.prov).every((p) => s.provinces.includes(+p))));

  // 6/7. the coast's rows, read by pixel off the mod's own provinces.bmp as it is after the click
  const buf = fs.readFileSync(path.join(mod, "map", "provinces.bmp")), off = buf.readUInt32LE(10), rs = (W * 3 + 3) & ~3;
  const byColour = new Map(Array.from({ length: COLS * ROWS }, (_, i) => [COL(i + 1).join(","), i + 1]));
  const idAt = (px, row) => byColour.get([buf[off + (H - 1 - row) * rs + px * 3 + 2], buf[off + (H - 1 - row) * rs + px * 3 + 1], buf[off + (H - 1 - row) * rs + px * 3]].join(",")) || -1;
  const pixelProv = (x, z) => { const px = Math.floor(x), row = md.buildingZToPixelY(H, z); return px < 0 || row < 0 || px >= W || row >= H ? -1 : idAt(px, row); };
  const seaBeside = (x, z) => { const px = Math.floor(x), row = md.buildingZToPixelY(H, z); return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const q = row + dy; return q >= 0 && q < H && !raisedSet.has(idAt((px + dx + W) % W, q)); }); };
  const yard = rows.filter((w) => w.type === "dockyard"), cb = rows.filter((w) => w.type === "coastal_bunker");
  const coastalStates = states.filter((s) => s.provinces.some((p) => COASTAL.has(p)));
  rec(`${label}: every coastal state has exactly one dockyard row, and no other state has one`,
    coastalStates.every((s) => yard.filter((w) => w.sid === s.id).length === 1) && yard.length === coastalStates.length, { rows: yard.length, coastal: coastalStates.length });
  rec(`${label}: ⭐ each dockyard row stands on its own state's coastal province, beside the sea`,
    yard.every((w) => { const p = pixelProv(w.x, w.z), s = states.find((q) => q.id === w.sid); return s && s.provinces.includes(p) && COASTAL.has(p) && seaBeside(w.x, w.z); }), yard);
  rec(`${label}: every coastal province has exactly one coastal_bunker row, and no other province one`,
    [...COASTAL].every((p) => cb.filter((w) => pixelProv(w.x, w.z) === p).length === 1) && cb.length === COASTAL.size, cb.map((w) => pixelProv(w.x, w.z)));
  rec(`${label}: ⭐ each coastal_bunker row stands on its province, under that province's own state, beside the sea`,
    cb.every((w) => { const s = states.find((q) => q.id === w.sid); return s && s.provinces.includes(pixelProv(w.x, w.z)) && seaBeside(w.x, w.z); }), cb);
  rec(`${label}: every state that declares a dockyard has a dockyard row`, states.filter((s) => s.keys.dockyard).every((s) => yard.some((w) => w.sid === s.id)));
  rec(`${label}: every coastal fort level has a coastal_bunker row on its province`,
    Object.keys(fortsGot).filter((k) => k.endsWith(".coastal_bunker")).every((k) => cb.some((w) => pixelProv(w.x, w.z) === +k.split(".")[0])));
  // asked again for a coastal state that has them, nothing is added: a coastal_bunker row is found by the province it stands on
  const again = coastalStates.map((s) => md.ensureBuildingSlotsForState({ modRoot: mod, gameRoot: game, dependencyRoots: [], stateId: s.id, provinces: s.provinces,
    coast: { provinces: new Set(s.provinces.filter((p) => COASTAL.has(p))), ports: [], types: new Set(["dockyard", "coastal_bunker"]) } }));
  const rowsAgain = readRows(mod);
  rec(`${label}: asked again, no coastal state is given a second dockyard row`, rowsAgain.filter((w) => w.type === "dockyard").length === yard.length, rowsAgain.filter((w) => w.type === "dockyard").length);
  rec(`${label}: asked again, no coastal province is given a second coastal_bunker row — the row on it is found by its pixel`,
    rowsAgain.filter((w) => w.type === "coastal_bunker").length === cb.length, rowsAgain.filter((w) => w.type === "coastal_bunker").length);
  rec(`${label}: …and nothing at all is written`, again.every((a) => a && !a.changed) && rowsAgain.length === rows.length, again.filter((a) => a && a.changed));

  // 8. the validator stays silent on what was written — the slot rule is the model's, the coast rule reads the bitmap
  const probs = (md.validateMapModel(model) || []).concat(md.validateMapBitmap({ modRoot: mod, gameRoot: game, dependencyRoots: [] }) || []);
  const count = (rule) => probs.filter((q) => q.rule === rule).reduce((a, q) => a + (q.total || (q.items || []).length || 1), 0);
  rec(`${label}: Map Errors reports no state over its building slots`, count("state_buildings_exceed_slots") === 0, probs.filter((q) => q.rule === "state_buildings_exceed_slots"));
  rec(`${label}: Map Errors reports no naval building without a coast`, count("state_naval_building_without_coast") === 0, probs.filter((q) => q.rule === "state_naval_building_without_coast"));

  // 9. the report says it, by the same arithmetic
  const ind = (r && r.industry) || {};
  const sameNum = (a, b) => { const ks = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]); return [...ks].every((k) => Math.abs(((a || {})[k] || 0) - ((b || {})[k] || 0)) < 1e-9); };
  rec(`${label}: the report's written levels are the manifest's`, sameNum(ind.written, expectWritten), { got: ind.written, want: expectWritten });
  rec(`${label}: ⭐ (e) a dockyard with no coast in its country is said as noCoast`, sameNum((ind.dropped || {}).noCoast, expectNoCoast), ind.dropped);
  rec(`${label}: ⭐ (k) …and one whose country's coast was full as noRoom`, sameNum((ind.dropped || {}).noRoom, expectNoRoom), ind.dropped);
  rec(`${label}: (j) what was not carried is said, with its share`, sameNum(ind.notCarried, expectNotCarried), ind.notCarried);
  rec(`${label}: the states said to hold industry are the ones that do`, ind.statesWith === states.filter((s) => Object.keys(s.keys).some((k) => k !== "infrastructure" && k !== "air_base")).length, ind.statesWith);
  rec(`${label}: the forts are counted, and the one off the coast is said`, (ind.forts || {}).bunker === Object.entries(fortsWant).filter(([k]) => k.endsWith(".bunker")).reduce((a, [, v]) => a + v, 0)
    && (ind.forts || {}).coastalBunkerNotOnACoast === BELOW.flatMap((s) => Object.entries(s.pb || {})).filter(([p, kv]) => raisedSet.has(+p) && !COASTAL.has(+p) && kv.coastal_bunker).reduce((a, [, kv]) => a + kv.coastal_bunker, 0), ind.forts);
}
rec("cold and warm write the same states", JSON.stringify(runs[0].states.map((s) => s.text.replace(/\r/g, "")).sort()) === JSON.stringify(runs[1].states.map((s) => s.text.replace(/\r/g, "")).sort()));
rec("cold and warm say the same", JSON.stringify(runs[0].r.industry) === JSON.stringify(runs[1].r.industry), [runs[0].r.industry, runs[1].r.industry]);

console.log("\n=== 2. a world with nothing below carries nothing ===");
{
  const bare = buildGame({ withStates: false }), mod = buildMod();
  const r = md.generateLand(GEN(mod, bare));
  const states = readStates(mod);
  rec("the bare world was generated", r && r.changed === true && states.length > 0, r && r.error);
  rec("CONTROL: with no state below, no state holds anything but infrastructure and an air base", states.every((s) => Object.keys(s.keys).every((k) => k === "infrastructure" || k === "air_base")), states.map((s) => s.keys));
  rec("…and the report carries nothing", Object.keys(((r || {}).industry || {}).written || {}).length === 0, r && r.industry);
}

console.log("\n=== 3. what common/buildings says, read by stateBuildingRules ===");
{
  const model = md.buildMapModel({ modRoot: runs[0].mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
  const rules = md.stateBuildingRules(model);
  for (const [k, d] of Object.entries(BUILDINGS)) {
    const r = rules.get(k) || {};
    rec(`${k}: shares_slots ${!!d.shares}, state_max ${d.stateMax || "none"}, coast ${!!d.coast}, provincial ${!!d.provinceMax}, models ${d.show || 0}`,
      r.sharesSlots === !!d.shares && r.stateMax === (d.stateMax || Infinity) && r.coastOnly === !!d.coast && r.provincial === !!d.provinceMax && r.showOnMap === (d.show || 0), r);
  }
}

console.log("\n=== 4. the page says it ===");
{
  const { maskJsLiterals, jsBodyAt, stripJsComments } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const at = MASKED.indexOf("function generatedIndustryNote("), body = at < 0 ? null : jsBodyAt(MASKED, at);
  rec("public/map.js has generatedIndustryNote", !!body);
  const note = body ? require("vm").runInNewContext("(" + PAGE.slice(at, body[1] + 1) + ")") : () => "";
  const carried = note(runs[0].r);
  rec("⭐ what was carried is said, by kind and in how many states", /civilian factor/.test(carried) && /dockyard/.test(carried) && carried.includes(String(runs[0].r.industry.statesWith)), carried);
  rec("⭐⭐ a dockyard with no coast left is warned about, as such", /⚠[^⚠]*no coast left/.test(carried), carried);
  rec("⭐⭐ …and apart from one whose country had no room", /⚠[^⚠]*had room/.test(carried), carried);
  rec("⭐ what could not be carried is named", /⚠[^⚠]*steel_mill/.test(carried), carried);
  const onlyRoom = note({ industry: { written: { dockyard: 2 }, statesWith: 1, dropped: { noCoast: {}, noRoom: { dockyard: 1 } }, notCarried: {} } });
  rec("…a full coast alone is not called a lost coast", /had room/.test(onlyRoom) && !/no coast left/.test(onlyRoom), onlyRoom);
  rec("CONTROL: nothing carried says nothing", note({ industry: { written: {}, dropped: { noCoast: {}, noRoom: {} }, notCarried: {} } }) === "" && note({}) === "" && note(null) === "");
  rec("…and a deal that failed is said with its reason", /⚠/.test(note({ industry: { error: "boom" } })) && note({ industry: { error: "boom" } }).includes("boom"));
  // The click's success line is the LAST reload before its .catch: the first one after the POST is a click that stopped
  // part-way (#a-click-that-stopped-part-way-said-nothing-changed), which carried no industry to report
  const handler = stripJsComments(PAGE), post = handler.indexOf('fetch("/api/map/generate-land"');
  const caught = post < 0 ? -1 : handler.indexOf(".catch(", post), done = caught < 0 ? -1 : handler.lastIndexOf("reloadAfterImmediateWrite(", caught);
  // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
  // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
  const line = require("./testlib-map-page.js").generateLandReportLine(handler);
  rec("⭐⭐ the Generate land report on the page carries it", /=\s*generatedIndustryNote\(res\)/.test(line) && /\$\{industryNote\}/.test(line.slice(line.lastIndexOf("reloadAfterImmediateWrite("))), line.slice(-200));
}

console.log("\n=== 5. a coastal state of two provinces, over a common/buildings that defines no fort ===");
// One state below on 13 and 14, both on the coast once raised, with a port on each — the higher on 14, the higher id, which is
// the one "nearest the town" does not pick (ties go to the lower id) — and a coastal fort and a bunker on 13. Its common/buildings
// is the manifest's less bunker and coastal_bunker: a total conversion that replaced the folder. Raised as ONE state.
{
  const TWO = [13, 14], PORTS = { 13: 1, 14: 3 }, FORTS = { 13: { coastal_bunker: 2, bunker: 1 } };
  const noForts = Object.fromEntries(Object.entries(BUILDINGS).filter(([, d]) => !d.provinceMax));
  const world = (ports) => buildGame({ raised: TWO, buildings: noForts, below: [{ id: 1, owner: "AAA", cat: "town", provs: TWO, b: { dockyard: 1 },
    pb: Object.fromEntries(TWO.map((p) => [p, { ...(FORTS[p] || {}), ...(ports ? { naval_base: PORTS[p] } : {}) }]).filter(([, kv]) => Object.keys(kv).length)) }] });
  const run2 = (game) => { const mod = buildMod(); const r = md.generateLand({ ...GEN(mod, game), count: TWO.length, provincesPerState: TWO.length }); return { mod, r, states: readStates(mod), rows: readRows(mod) }; };
  const buf = (mod) => { const b = fs.readFileSync(path.join(mod, "map", "provinces.bmp")); return { b, off: b.readUInt32LE(10), rs: (W * 3 + 3) & ~3 }; };
  const byColour = new Map(Array.from({ length: COLS * ROWS }, (_, i) => [COL(i + 1).join(","), i + 1]));
  const provOf = (mod, x, z) => { const { b, off, rs } = buf(mod), px = Math.floor(x), row = md.buildingZToPixelY(H, z);
    return px < 0 || row < 0 || px >= W || row >= H ? -1 : byColour.get([b[off + (H - 1 - row) * rs + px * 3 + 2], b[off + (H - 1 - row) * rs + px * 3 + 1], b[off + (H - 1 - row) * rs + px * 3]].join(",")) || -1; };
  const portGame = world(true), withPorts = run2(portGame), noPorts = run2(world(false));
  const yardOn = (x) => x.rows.filter((w) => w.type === "dockyard").map((w) => provOf(x.mod, w.x, w.z));
  const highest = TWO.slice().sort((a, b) => PORTS[b] - PORTS[a] || a - b)[0];
  rec("the fixture: both worlds rose as one state on both provinces, each with its dockyard", [withPorts, noPorts].every((x) => x.r.changed === true
    && x.states.length === 1 && JSON.stringify(x.states[0].provinces.slice().sort((a, b) => a - b)) === JSON.stringify(TWO) && x.states[0].keys.dockyard === 1),
    [withPorts, noPorts].map((x) => x.states.map((s) => [s.provinces, s.keys])));
  rec("the fixture: both provinces are on the coast, and the state's ports were carried onto them",
    [...md.landProvincesTouchingSea({ modRoot: withPorts.mod, gameRoot: portGame, dependencyRoots: [] })].sort((a, b) => a - b).join() === TWO.join()
    && TWO.every((p) => (withPorts.states[0].prov[p] || {}).naval_base === PORTS[p]), withPorts.states[0].prov);
  rec("CONTROL: with no port, the dockyard row stands on the other province — so the fixture can tell the port rule from the fallback",
    yardOn(noPorts).length === 1 && yardOn(noPorts)[0] !== highest && TWO.includes(yardOn(noPorts)[0]), { noPorts: yardOn(noPorts), highest });
  rec(`⭐⭐ the dockyard row stands on the province with the state's highest port (${highest}: port ${PORTS[highest]})`,
    JSON.stringify(yardOn(withPorts)) === JSON.stringify([highest]), { yardOn: yardOn(withPorts), PORTS });
  rec("⭐⭐ no coastal_bunker row is written where common/buildings defines no coastal_bunker", ![withPorts, noPorts].some((x) => x.rows.some((w) => w.type === "coastal_bunker")),
    withPorts.rows.filter((w) => w.type === "coastal_bunker"));
  const fortLevels = withPorts.states.flatMap((s) => Object.entries(s.prov).flatMap(([p, kv]) => Object.keys(kv).filter((k) => k !== "naval_base").map((k) => `${p}.${k}`)));
  rec("⭐⭐ …nor a fort level the layer below held, for a building common/buildings does not define — on the coast or off it",
    fortLevels.length === 0 && Object.values(withPorts.r.industry.forts || {}).every((v) => v === 0), { fortLevels, forts: withPorts.r.industry.forts });
  rec("CONTROL: the layer below held those forts on a province that is still a coast", Object.keys(FORTS).every((p) => TWO.includes(+p)) && FORTS[13].coastal_bunker > 0 && FORTS[13].bunker > 0);
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}   // scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1)
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
