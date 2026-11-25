// ⛔ #a-capital-is-its-countrys-most-important-state — A COUNTRY'S CAPITAL IS ITS MOST IMPORTANT STATE.
// ⛔ #a-generated-country-keeps-its-place-and-its-capital — …AND IN A GENERATED WORLD IT IS WORTH WHAT IT WAS WORTH BELOW.
//
// TEST 32: Generate land wrote no capital at all. Every inherited `capital = N` named a vanilla state id that now meant unrelated
// land, and Auto-fix re-pointed 59 of them to each country's LARGEST state — copying 59 vanilla country files into the mod to
// change one line apiece. ENG's capital was a rural VP-3 state, FRA's a wasteland worth 1; the base game's median capital is VP 10.
// "The most provinces" picks the capital the eight installed shipping maps actually ship for 355 of their 988 countries with two or
// more states; "the highest victory point, then the VP sum, the manpower, the lowest id" picks 854.
//
// This test pins:
//   1. mostImportantState and capitalStateFor as pure functions;
//   2. the corpus: on every installed shipping map the rule picks the shipped capital at least as often as "most provinces", and
//      more often in all — read off the maps installed, a map not installed is a counted skip;
//   3. fixForeignCapitals re-points onto the most important state, not the largest;
//   4. generateLand: each country's capital is its best state, takes the id its capital line already names (no country file
//      written), carries the victory point its capital held below, every other state keeps its category's value, and every state
//      carries its OWN land's manpower and category even when a capital swapped ids with a state of another size; then the
//      fallbacks — an id out of range is written, a country holding a state the mod already had is left alone, a missing line in an
//      inherited file is written (#a-capital-set-only-by-set-capital), a dependency's own capital ids are the ones pinned, and a mod's own country file whose line
//      Delete map stripped is pinned AND written; and the carry reads the capital's OWN state below, not the country's best star;
//   5. the city pass gives a category's towns to the higher star first, the count unchanged.
//
// Fixture-only apart from the read-only corpus section: binds no port. Run: node test-a-capital-is-its-countrys-most-important-state.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 300)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capitals-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
process.env.HOI4_MODS_ROOT = SANDBOX;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
const WORKSHOP = "D:/SteamLibrary/steamapps/workshop/content/394360";

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(width, height, fn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii"); buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = fn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("=== 1. mostImportantState and capitalStateFor ===");
const hasHelpers = typeof md.mostImportantState === "function" && typeof md.capitalStateFor === "function" && typeof md.stateImportanceRow === "function";
rec("map-data.js exports mostImportantState, stateImportanceRow and capitalStateFor", hasHelpers);
if (hasHelpers) {
  const pick = md.mostImportantState;
  rec("⭐⭐ the highest single victory point wins over a bigger sum", pick([{ id: 1, vp: 10, vpSum: 40 }, { id: 2, vp: 20, vpSum: 20 }]) === 2);
  rec("…then the VP sum", pick([{ id: 1, vp: 10, vpSum: 12 }, { id: 2, vp: 10, vpSum: 15 }]) === 2);
  rec("…then the manpower", pick([{ id: 1, vp: 5, vpSum: 5, manpower: 100 }, { id: 2, vp: 5, vpSum: 5, manpower: 900 }]) === 2);
  rec("…then the lowest id", pick([{ id: 7, vp: 5, vpSum: 5, manpower: 1 }, { id: 3, vp: 5, vpSum: 5, manpower: 1 }]) === 3);
  rec("…and no state is no answer", pick([]) === null && pick(null) === null);
  const row = md.stateImportanceRow({ id: 4, manpower: 77, victoryPoints: [{ province: 1, value: 3 }, { province: 2, value: 20 }, { province: 3, value: 0 }] });
  rec("a model state's row: its highest victory point, their sum, its manpower", row.id === 4 && row.vp === 20 && row.vpSum === 23 && row.manpower === 77, row);
  const model = { capitals: { AAA: 2, BBB: 9 }, states: [
    { id: 1, owner: "AAA", provinces: [1, 2, 3], victoryPoints: [{ province: 1, value: 1 }] },
    { id: 2, owner: "AAA", provinces: [4], victoryPoints: [] },
    { id: 3, owner: "AAA", provinces: [5], victoryPoints: [{ province: 5, value: 20 }] },
    { id: 9, owner: "CCC", provinces: [9], victoryPoints: [] },
    { id: 4, owner: "BBB", provinces: [6, 7], victoryPoints: [{ province: 6, value: 2 }] },
    { id: 5, owner: "BBB", provinces: [], victoryPoints: [{ province: 8, value: 50 }] }] };
  rec("⭐ capitalStateFor keeps a valid capital — the country's own, holding land", md.capitalStateFor(model, "AAA") === 2);
  rec("⭐⭐ …and for a capital on someone else's state, the most important state of its own that holds land", md.capitalStateFor(model, "BBB") === 4);
  rec("…and none for a country holding no land", md.capitalStateFor(model, "ZZZ") === null);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 2. the corpus: which rule picks the capital the shipping maps ship ===");
if (hasHelpers) {
  let roots = [];
  try { roots = fs.readdirSync(WORKSHOP).map((d) => path.join(WORKSHOP, d)).filter((d) => { try { return fs.statSync(d).isDirectory(); } catch (_) { return false; } }); } catch (_) { roots = []; }
  if (fs.existsSync(path.join(GAME, "map", "definition.csv"))) roots.unshift(GAME);
  const maps = roots.filter((r) => fs.existsSync(path.join(r, "history", "states")) && fs.existsSync(path.join(r, "map", "definition.csv")));
  if (!maps.length) {
    console.log("     ⚠️ SKIPPED: no installed shipping maps on this machine — the corpus half did not run (sections 1 and 3 still pin the rule)");
  } else {
    const rows = [];
    for (const r of maps) {
      md.clearMapLayerCache();
      const model = md.buildMapModel({ modRoot: r, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: true });
      const own = new Map();
      for (const s of model.states || []) if (s.owner && (s.provinces || []).length) { if (!own.has(s.owner)) own.set(s.owner, []); own.get(s.owner).push(s); }
      let countries = 0, byRule = 0, byProvinces = 0;
      for (const [tag, list] of own) {
        if (list.length < 2 || model.capitals[tag] == null) continue;
        countries++;
        const shipped = model.capitals[tag];
        if (md.mostImportantState(list.map(md.stateImportanceRow)) === shipped) byRule++;
        if (list.slice().sort((a, b) => b.provinces.length - a.provinces.length || a.id - b.id)[0].id === shipped) byProvinces++;
      }
      rows.push({ map: path.basename(r), countries, byRule, byProvinces });
    }
    console.log("     " + JSON.stringify(rows));
    const sum = (k) => rows.reduce((a, x) => a + x[k], 0);
    rec("⭐⭐⭐ on EVERY installed map the rule picks the shipped capital at least as often as \"most provinces\"",
      rows.every((x) => x.byRule >= x.byProvinces), rows.filter((x) => x.byRule < x.byProvinces));
    rec("⭐⭐ …and more often in all", sum("byRule") > sum("byProvinces"), { countries: sum("countries"), byRule: sum("byRule"), byProvinces: sum("byProvinces") });
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 3. fixForeignCapitals re-points onto the country's most important state ===");
{
  const mod = fs.mkdtempSync(path.join(SANDBOX, "fixcap-"));
  mk(path.join(mod, "descriptor.mod"), 'name="FixCap"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;"].concat([1, 2, 3, 4, 5].map((i) => `${i};${i * 40};${i * 7};9;land;false;plains;1;`)).join("\r\n") + "\r\n");
  const st = (id, owner, provs, vp) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t\tadd_core_of = ${owner}\n${vp ? `\t\tvictory_points = { ${provs[0]} ${vp} }\n` : ""}\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "BBB", [1], 0));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "AAA", [2, 3, 4], 1));   // AAA's largest, VP 1
  mk(path.join(mod, "history", "states", "4.txt"), st(4, "AAA", [5], 20));       // AAA's one-province city, VP 20
  mk(path.join(mod, "history", "countries", "AAA.txt"), 'capital = 1\noob = "AAA_1936"\n');   // BBB's state
  mk(path.join(mod, "history", "countries", "BBB.txt"), 'capital = 1\n');
  const r = md.fixForeignCapitals({ modRoot: mod });
  const cap = parseInt((/capital\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(mod, "history", "countries", "AAA.txt"), "utf8")) || [])[1], 10);
  rec("the fixture: AAA's largest state (3 provinces, VP 1) is not its most important one (1 province, VP 20)", true);
  rec("⭐⭐⭐ a capital on another country's state is moved to the country's MOST IMPORTANT state, not its largest",
    r.fixed === 1 && cap === 4, { fixed: r.fixed, details: r.details, cap });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FIXTURE for section 4: a 24 x 16 lattice of one-pixel provinces, every state below its own strategic region, so Generate
// land (provincesPerState 64) raises each region as ONE state and a generated state is exactly the land of one state below.
//   A_town  x 0..3,  y 0..7   AAA  town   32 provinces  VP 30 on its first province — AAA's capital below
//   A_east  x 4..5,  y 0..7   AAA  rural  16
//   A_rural x 0..5,  y 8..15  AAA  rural  48
//   B_town  x 6..11, y 0..7   BBB  town   48           VP 5 — BBB's capital below
//   B_rural x 6..11, y 8..15  BBB  rural  48
//   ocean from x 12, four regions of 6 x 8 nobody held.
// A category is worth the mean of its states' summed victory points below (town (30+5)/2, rural 0 → at least 1): the test
// derives both from this manifest.
const W = 24, H = 16, N = W * H;
const idAt = (x, y) => y * W + x + 1, xOf = (id) => (id - 1) % W, yOf = (id) => Math.floor((id - 1) / W);
const colourOf = (id) => [id & 255, (id >> 8) & 255, 107];
const box = (x0, x1, y0, y1) => { const out = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(idAt(x, y)); return out; };
const STATES = {
  A_town: { tag: "AAA", cat: "town", provs: box(0, 3, 0, 7), mpPer: 3000, vp: 30 },
  A_east: { tag: "AAA", cat: "rural", provs: box(4, 5, 0, 7), mpPer: 1000, vp: 0 },
  A_rural: { tag: "AAA", cat: "rural", provs: box(0, 5, 8, 15), mpPer: 2000, vp: 0 },
  B_town: { tag: "BBB", cat: "town", provs: box(6, 11, 0, 7), mpPer: 3000, vp: 5 },
  B_rural: { tag: "BBB", cat: "rural", provs: box(6, 11, 8, 15), mpPer: 1000, vp: 0 },
};
const OCEAN = [box(12, 17, 0, 7), box(18, 23, 0, 7), box(12, 17, 8, 15), box(18, 23, 8, 15)];
const belowOf = new Map();
for (const [k, s] of Object.entries(STATES)) for (const p of s.provs) belowOf.set(p, k);
// `vps` overrides a state's VP below, for a world that differs from the manifest in that alone (4b)
const vpBelow = (k, vps = {}) => (vps[k] != null ? vps[k] : STATES[k].vp);
const catValueFor = (vps = {}) => {
  const sum = new Map(), n = new Map();
  for (const [k, s] of Object.entries(STATES)) { sum.set(s.cat, (sum.get(s.cat) || 0) + vpBelow(k, vps)); n.set(s.cat, (n.get(s.cat) || 0) + 1); }
  const out = new Map(); for (const [c, v] of sum) out.set(c, Math.max(1, Math.round(v / n.get(c)))); return out;
};
const catValue = catValueFor();
const keyOfProvinces = (provs) => provs.slice().sort((a, b) => a - b).join(",");
const REGION_OF = new Map();
{ let r = 1; for (const s of Object.values(STATES)) { for (const p of s.provs) REGION_OF.set(p, r); r++; } for (const o of OCEAN) { for (const p of o) REGION_OF.set(p, r); r++; } }

/** the layer below: `ids` names each state's id, `caps` each country's capital line (null: no line), `regionless` provinces left out
 *  of every region, `dep` extra roots to write the same shape into */
function makeBase(label, { ids, caps, regionless = new Set(), vps = {} }) {
  const base = path.join(SANDBOX, "base-" + label);
  mk(path.join(base, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: N }, (_, i) => {
    const id = i + 1, [r, g, b] = colourOf(id);
    return belowOf.has(id) ? `${id};${r};${g};${b};land;false;plains;1` : `${id};${r};${g};${b};sea;false;ocean;0`;
  })).join("\r\n") + "\r\n");
  mk(path.join(base, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  const byR = new Map();
  for (const [p, r] of REGION_OF) { if (regionless.has(p)) continue; if (!byR.has(r)) byR.set(r, []); byR.get(r).push(p); }
  for (const [r, p] of byR) mk(path.join(base, "map", "strategicregions", `r${r}.txt`), `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${p.join(" ")} }\n\tweather={}\n}\n`);
  mk(path.join(base, "common", "state_category", "00.txt"), "state_categories = {\n\ttown = { local_building_slots = 4 }\n\trural = { local_building_slots = 2 }\n}\n");
  for (const [k, s] of Object.entries(STATES)) {
    const id = ids[k], vp = vpBelow(k, vps);
    mk(path.join(base, "history", "states", `${id}-${k}.txt`), `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${s.mpPer * s.provs.length}\n\tstate_category = ${s.cat}\n\tprovinces = { ${s.provs.join(" ")} }\n\thistory = {\n\t\towner = ${s.tag}\n\t\tadd_core_of = ${s.tag}\n${vp ? `\t\tvictory_points = { ${s.provs[0]} ${vp} }\n` : ""}\t}\n}\n`);
  }
  for (const t of ["AAA", "BBB"]) mk(path.join(base, "history", "countries", `${t} - Land of ${t}.txt`), `\ufeff${caps[t] != null ? `capital = ${caps[t]} # home\r\n` : ""}oob = "${t}_1936"\r\n`);
  return base;
}
function makeMod(label, keepLand = new Set()) {
  const mod = path.join(SANDBOX, "mod-" + label);
  mk(path.join(mod, "descriptor.mod"), 'name="Capitals"\nreplace_path="history/states"\n');
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: N }, (_, i) => {
    const id = i + 1, [r, g, b] = colourOf(id);
    return keepLand.has(id) ? `${id};${r};${g};${b};land;false;plains;1` : `${id};${r};${g};${b};sea;false;ocean;0`;
  })).join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => colourOf(idAt(x, y))));
  return mod;
}
function statesOnDisk(mod) {
  const dir = path.join(mod, "history", "states");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".txt")).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    const vp = /victory_points\s*=\s*\{\s*(\d+)\s+(\d+)\s*\}/.exec(t);
    return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], owner: ((/owner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1]) || "",
      manpower: +(/manpower\s*=\s*(\d+)/.exec(t) || [])[1], category: ((/state_category\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1]) || "",
      provinces: ((((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g) || []).map(Number),
      vp: vp ? { province: +vp[1], value: +vp[2] } : null };
  });
}
const countryFilesIn = (mod) => { const d = path.join(mod, "history", "countries"); return fs.existsSync(d) ? fs.readdirSync(d).sort() : []; };
const eligibleOf = (mod, regionless = new Set()) => fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/)
  .filter((l) => /;sea;/.test(l) && REGION_OF.has(+l.split(";")[0]) && !regionless.has(+l.split(";")[0])).length;
const generate = (mod, base, extra = {}) => md.generateLand(Object.assign({ modRoot: mod, gameRoot: base, dependencyRoots: [], count: eligibleOf(mod, extra.regionless), seed: 2, provincesPerState: 64 }, extra, { regionless: undefined }));
const stateHolding = (states, key) => states.find((s) => keyOfProvinces(s.provinces) === key);

console.log("\n=== 4. generateLand: each capital is its country's best state, under the id its line names ===");
// The CONTROL world first, with no capital line anywhere, so nothing is pinned: the id each region's state takes on its own.
const IDS0 = { A_town: 1, A_east: 2, A_rural: 3, B_town: 4, B_rural: 5 };
const ctlBase = makeBase("ctl", { ids: IDS0, caps: { AAA: null, BBB: null } });
const ctlMod = makeMod("ctl");
const ctl = generate(ctlMod, ctlBase);
const ctlStates = statesOnDisk(ctlMod);
const natural = new Map(Object.keys(STATES).map((k) => [k, (stateHolding(ctlStates, keyOfProvinces(STATES[k].provs)) || {}).id]));
rec("the control world: every state below rose as exactly one state", ctl.changed === true && [...natural.values()].every((v) => Number.isInteger(v)), Object.fromEntries(natural));
// Now the real one: AAA's capital line names the id A_rural's state took on its own (48 provinces, against A_town's 32), so making
// the line true SWAPS two states of different sizes; BBB's names the id its own town took, so it is pinned in place.
const SWAP_TO = natural.get("A_rural"), A_TOWN_OWN = natural.get("A_town");
const used = new Set([SWAP_TO, natural.get("B_town")]);
const free = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((i) => !used.has(i));
const IDS = { A_town: SWAP_TO, B_town: natural.get("B_town"), A_east: free[0], A_rural: free[1], B_rural: free[2] };
const mainBase = makeBase("main", { ids: IDS, caps: { AAA: IDS.A_town, BBB: IDS.B_town } });
const mainMod = makeMod("main");
const main = generate(mainMod, mainBase);
const st = statesOnDisk(mainMod);
const model = md.buildMapModel({ modRoot: mainMod, gameRoot: mainBase, dependencyRoots: [], cacheStableLayers: false });
rec("generate land ran", main.changed === true && st.length === ctlStates.length, { error: main.error, states: st.length });
rec("⭐⭐ (a) not one country file was written into the mod", countryFilesIn(mainMod).length === 0, countryFilesIn(mainMod));
const capA = model.capitals.AAA, capStateA = st.find((s) => s.id === capA);
rec("⭐⭐⭐ (b) AAA's capital line names a state AAA owns on disk", !!capStateA && capStateA.owner === "AAA", { capA, owner: capStateA && capStateA.owner });
const rowOnDisk = (s) => ({ id: s.id, vp: catValue.get(s.category) || 1, vpSum: catValue.get(s.category) || 1, manpower: s.manpower });
const bestA = md.mostImportantState ? md.mostImportantState(st.filter((s) => s.owner === "AAA").map(rowOnDisk)) : null;
rec("⭐⭐⭐ (c) …and it is AAA's most important state by what a generated world can see — its category's value, then manpower",
  !!capStateA && capA === bestA && keyOfProvinces(capStateA.provinces) === keyOfProvinces(STATES.A_town.provs), { capA, bestA, largest: Math.max(...st.filter((s) => s.owner === "AAA").map((s) => s.provinces.length)) });
rec("the fixture: AAA's largest state is not that one", st.filter((s) => s.owner === "AAA").sort((a, b) => b.provinces.length - a.provinces.length || a.id - b.id)[0].id !== bestA);
// ⚠️ MOVED with #a-generated-state-keeps-its-countrys-id: the pin still swaps the capital onto the id its line names, but the state it
// displaced no longer keeps the capital's cut-order id — the renumbering hands every other state the id its own land held below, under
// its own country. So A_rural, whose land took SWAP_TO in cut order, now stands under A_rural's id below, and so does every state.
const idOfLand = (k) => (stateHolding(st, keyOfProvinces(STATES[k].provs)) || {}).id;
rec("⭐⭐ the capital took the id its line names, and the state whose land held that id in cut order took its OWN id below — as every state did",
  capA === SWAP_TO && SWAP_TO !== A_TOWN_OWN && idOfLand("A_rural") === IDS.A_rural && idOfLand("A_rural") !== A_TOWN_OWN && Object.keys(STATES).every((k) => idOfLand(k) === IDS[k]),
  { capA, SWAP_TO, A_TOWN_OWN, onDisk: Object.fromEntries(Object.keys(STATES).map((k) => [k, idOfLand(k)])), below: IDS });
const wantVp = Math.max(catValue.get("town"), STATES.A_town.vp);
rec("⭐⭐⭐ (d) the capital's star is worth what its capital was worth below: max(its category's value, the VP below)",
  !!capStateA && capStateA.vp && capStateA.vp.value === wantVp && wantVp > catValue.get("town"), { star: capStateA && capStateA.vp, wantVp, category: catValue.get("town") });
const others = st.filter((s) => s.id !== capA);
rec("⭐⭐ (e) every other state keeps its category's value — BBB's capital among them, since its VP below is smaller",
  others.every((s) => s.vp && s.vp.value === (catValue.get(s.category) || 1)), others.filter((s) => !s.vp || s.vp.value !== (catValue.get(s.category) || 1)).map((s) => `${s.id}:${s.category}:${s.vp && s.vp.value}`));
rec("…and BBB's capital line names its town, pinned in place", model.capitals.BBB === natural.get("B_town") && (st.find((s) => s.id === model.capitals.BBB) || {}).owner === "BBB", model.capitals.BBB);
// ⭐⭐ every state carries ITS OWN land's manpower and category — derived from the manifest, province by province.
// #a-generated-country-keeps-its-economy — the manpower half is asked of an `economy: "land"` twin of the same world, which makes the
// same swap: by default each country keeps its 1936 economy and spreads its people over its states (test-a-generated-country-keeps-
// its-economy.js pins that). A state's category is its own land's either way, and is asked of the default world as well.
const wrongLandOf = (states, withManpower) => states.filter((s) => {
  const ks = new Set(s.provinces.map((p) => belowOf.get(p)).filter(Boolean));
  if (!ks.size) return (withManpower && s.manpower !== 10000) || s.category !== "rural";
  const mp = s.provinces.reduce((a, p) => a + (belowOf.has(p) ? STATES[belowOf.get(p)].mpPer : 0), 0);
  const cats = new Map(); for (const p of s.provinces) if (belowOf.has(p)) { const c = STATES[belowOf.get(p)].cat; cats.set(c, (cats.get(c) || 0) + 1); }
  const cat = [...cats].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  return (withManpower && s.manpower !== mp) || s.category !== cat;
});
const landMod = makeMod("main-land");
const landRun = generate(landMod, mainBase, { economy: "land" });
const landSt = statesOnDisk(landMod), wrongLand = wrongLandOf(landSt, true);
rec("⭐⭐⭐ every state on disk carries the manpower and category of its OWN provinces below — the swap moved no state's land facts",
  landRun.changed === true && (landRun.economy || {}).mode === "land" && landSt.length === st.length
  && keyOfProvinces((landSt.find((s) => s.id === SWAP_TO) || { provinces: [] }).provinces) === keyOfProvinces(STATES.A_town.provs) && wrongLand.length === 0,
  { swapped: (landSt.find((s) => s.id === SWAP_TO) || {}).provinces, wrong: wrongLand.map((s) => `${s.id}:${s.manpower}:${s.category}`) });
const wrongCategory = wrongLandOf(st, false);
rec("…and every state of the default world the category of its own provinces below", wrongCategory.length === 0, wrongCategory.map((s) => `${s.id}:${s.category}`));
const af = md.autoFixMap({ modRoot: mainMod, gameRoot: mainBase, dependencyRoots: [] });
md.clearMapLayerCache();
const after = md.validateMapModel(md.buildMapModel({ modRoot: mainMod, gameRoot: mainBase, dependencyRoots: [], cacheStableLayers: false })) || [];
rec("⭐⭐ (f) Auto-fix afterwards re-points no capital, and Map Errors has no capital row",
  ((af.fixes || {}).capitals || {}).fixed === 0 && !after.some((p) => /^capital_state_|^empty_capital_state/.test(p.rule)) && countryFilesIn(mainMod).length === 0,
  { capitals: (af.fixes || {}).capitals, rows: after.filter((p) => /capital/.test(p.rule)).map((p) => p.rule), files: countryFilesIn(mainMod) });
rec("…and the result says how", main.countries && main.countries.capitals.pinned === 2 && main.countries.capitals.carried === 1 && main.countries.capitals.written.length === 0, main.countries && main.countries.capitals);

console.log("\n=== 4b. the fallbacks ===");
{
  // an id past every new one: the line is WRITTEN, into the mod's own copy of the inherited file, BOM and CRLF kept, stale comment gone
  const b = makeBase("far", { ids: Object.assign({}, IDS0, { A_town: 999 }), caps: { AAA: 999, BBB: IDS0.B_town } });
  const m = makeMod("far");
  const r = generate(m, b);
  const file = path.join(m, "history", "countries", "AAA - Land of AAA.txt");
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const s = statesOnDisk(m), cap = parseInt((/capital\s*=\s*(\d+)/.exec(text) || [])[1], 10), capSt = s.find((x) => x.id === cap);
  rec("⭐⭐ a capital line naming an id no new state has is written — onto AAA's town",
    !!capSt && capSt.owner === "AAA" && keyOfProvinces(capSt.provinces) === keyOfProvinces(STATES.A_town.provs) && (r.countries.capitals.written || []).some((w) => w.tag === "AAA" && w.state === cap), { cap, written: r.countries && r.countries.capitals.written });
  rec("…keeping the file's BOM and its CRLF, and dropping the comment that named the old state",
    text.charCodeAt(0) === 0xfeff && !/[^\r]\n/.test(text) && !/# home/.test(text) && /oob = "AAA_1936"/.test(text), JSON.stringify(text.slice(0, 60)));
  rec("…and its star still carries the VP its capital held below", !!capSt && capSt.vp && capSt.vp.value === wantVp, capSt && capSt.vp);
  rec("…and only AAA's file was written", JSON.stringify(countryFilesIn(m)) === JSON.stringify(["AAA - Land of AAA.txt"]), countryFilesIn(m));
}
{
  // a country holding a state the mod already had: DDD's state sits inside AAA's land, kept as land and out of every region
  const ddd = box(2, 3, 10, 11);
  const regionless = new Set(ddd);
  const b = makeBase("pre", { ids: IDS0, caps: { AAA: IDS0.A_town, BBB: IDS0.B_town }, regionless });
  mk(path.join(b, "history", "countries", "DDD - Land of DDD.txt"), "\ufeffcapital = 50 # home\r\n");
  const m = makeMod("pre", regionless);
  mk(path.join(m, "history", "states", "50-DDD.txt"), `state = {\n\tid = 50\n\tname = "STATE_50"\n\tmanpower = 4000\n\tstate_category = town\n\tprovinces = { ${ddd.join(" ")} }\n\thistory = {\n\t\towner = DDD\n\t\tadd_core_of = DDD\n\t}\n}\n`);
  const before = fs.readFileSync(path.join(m, "history", "states", "50-DDD.txt"));
  const r = generate(m, b, { regionless });
  const s = statesOnDisk(m);
  // (AAA's and BBB's lines ARE written here, and rightly: state 50 lifts the first new id to 51, past the ids their lines name.)
  rec("⭐⭐ a country that holds a state the mod already had is left alone: no state handed to it, no capital line written for it",
    !s.some((x) => x.owner === "DDD" && x.id !== 50) && !countryFilesIn(m).some((f) => /^DDD/.test(f)) && !((r.countries || {}).kept || []).some((k) => k.tag === "DDD"),
    { ddd: s.filter((x) => x.owner === "DDD").map((x) => x.id), files: countryFilesIn(m), kept: r.countries && r.countries.kept });
  rec("…while the countries whose lines name ids no new state has are written", ["AAA", "BBB"].every((t) => (r.countries.capitals.written || []).some((w) => w.tag === t)), r.countries && r.countries.capitals.written);
  rec("…and its state is byte-identical", Buffer.compare(before, fs.readFileSync(path.join(m, "history", "states", "50-DDD.txt"))) === 0);
}
{
  // ⛔ #a-capital-set-only-by-set-capital — a missing line in an inherited file was "left as shipped" (for vanilla's PRC, whose capital is
  // set by set_capital — read now, test-a-capital-set-only-by-set-capital.js). With no set_capital either, a country owning land would
  // start with no capital at all, so its capital group's id is WRITTEN as its line, into the mod's copy of the file.
  const b = makeBase("noline", { ids: IDS0, caps: { AAA: IDS0.A_town, BBB: null } });
  const m = makeMod("noline");
  const r = generate(m, b);
  const file = path.join(m, "history", "countries", "BBB - Land of BBB.txt");
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const cap = parseInt((/capital\s*=\s*(\d+)/.exec(text) || [])[1], 10), capSt = statesOnDisk(m).find((x) => x.id === cap);
  rec("⭐ a country whose inherited file names no capital at all is given one: a line naming its town, written into the mod's copy, and the result says so",
    JSON.stringify(countryFilesIn(m)) === JSON.stringify(["BBB - Land of BBB.txt"]) && !!capSt && capSt.owner === "BBB" && keyOfProvinces(capSt.provinces) === keyOfProvinces(STATES.B_town.provs)
    && JSON.stringify(r.countries.capitals.withNoCapital) === JSON.stringify(["BBB"]) && r.countries.capitals.leftAsShipped.length === 0 && /oob = "BBB_1936"/.test(text),
    { files: countryFilesIn(m), cap, capitals: r.countries && r.countries.capitals });
}
{
  // a dependency's own country files: ITS capital ids are the ones pinned, and none of its files is copied
  const b = makeBase("dep-base", { ids: IDS0, caps: { AAA: IDS0.A_town, BBB: IDS0.B_town } });
  const dep = path.join(SANDBOX, "dep");
  mk(path.join(dep, "descriptor.mod"), 'name="Dep"\n');
  const depCap = natural.get("A_east");
  mk(path.join(dep, "history", "countries", "AAA - Land of AAA.txt"), `capital = ${depCap}\n`);
  const m = makeMod("dep");
  const r = md.generateLand({ modRoot: m, gameRoot: b, dependencyRoots: [dep], count: eligibleOf(m), seed: 2, provincesPerState: 64 });
  const s = statesOnDisk(m);
  const mm = md.buildMapModel({ modRoot: m, gameRoot: b, dependencyRoots: [dep], cacheStableLayers: false });
  const capSt = s.find((x) => x.id === mm.capitals.AAA);
  rec("⭐⭐ a dependency's capital id is the one pinned: AAA's town takes the id the DEPENDENCY's file names",
    r.changed === true && mm.capitals.AAA === depCap && !!capSt && keyOfProvinces(capSt.provinces) === keyOfProvinces(STATES.A_town.provs), { cap: mm.capitals.AAA, depCap });
  rec("…and no country file is copied into the mod", countryFilesIn(m).length === 0, countryFilesIn(m));
}
{
  // the mod's own country file, whose line Delete map stripped: pinned to the line the layer below gives, AND written back
  const b = makeBase("own", { ids: IDS0, caps: { AAA: IDS0.A_town, BBB: IDS0.B_town } });
  const m = makeMod("own");
  mk(path.join(m, "history", "countries", "AAA - Land of AAA.txt"), '\ufeffoob = "AAA_1936"\r\nset_research_slots = 3\r\n');
  const r = generate(m, b);
  const text = fs.readFileSync(path.join(m, "history", "countries", "AAA - Land of AAA.txt"), "utf8");
  const cap = parseInt((/capital\s*=\s*(\d+)/.exec(text) || [])[1], 10);
  const capSt = statesOnDisk(m).find((x) => x.id === cap);
  rec("⭐⭐ a mod's own country file with no line gets one, naming the id the layer below gives — and that id is AAA's town",
    cap === IDS0.A_town && !!capSt && keyOfProvinces(capSt.provinces) === keyOfProvinces(STATES.A_town.provs) && /set_research_slots = 3/.test(text), { cap, text: text.slice(0, 80) });
  rec("…and the carry still read the capital below", !!capSt && capSt.vp && capSt.vp.value === wantVp, capSt && capSt.vp);
}
{
  // the carry reads the CAPITAL's own state below, not the country's best star anywhere: AAA's east, which is not its capital, held
  // a bigger victory point than its capital did (vanilla: BRA 20 against its capital's 10, TUR 25 against 15, MAN, MEN)
  const vps = { A_east: STATES.A_town.vp + 10 };
  const cv = catValueFor(vps);
  const b = makeBase("bigeast", { ids: IDS0, caps: { AAA: IDS0.A_town, BBB: IDS0.B_town }, vps });
  const m = makeMod("bigeast");
  const r = generate(m, b);
  const mm = md.buildMapModel({ modRoot: m, gameRoot: b, dependencyRoots: [], cacheStableLayers: false });
  const capSt = statesOnDisk(m).find((x) => x.id === mm.capitals.AAA);
  const want = Math.max(cv.get("town"), STATES.A_town.vp), anywhere = Math.max(cv.get("town"), vps.A_east);
  rec("the fixture: AAA's capital is still its town, and the best star it held below is elsewhere — so the two readings differ",
    r.changed === true && !!capSt && keyOfProvinces(capSt.provinces) === keyOfProvinces(STATES.A_town.provs) && vps.A_east > STATES.A_town.vp && want !== anywhere,
    { cap: mm.capitals.AAA, want, anywhere });
  rec("⭐⭐ the capital's star carries what its OWN state held below, not the country's best star elsewhere",
    !!capSt && capSt.vp && capSt.vp.value === want, { star: capSt && capSt.vp, want, anywhere });
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n=== 5. the city pass gives a category's towns to the higher star first ===");
{
  const states = (vpBig, vpSmall) => [
    { id: 1, provinces: [1, 2, 3], category: "town", vpProvince: 1, vp: vpBig },
    { id: 2, provinces: [4, 5], category: "town", vpProvince: 4, vp: vpSmall },
  ];
  const once = (list) => md.chooseUrbanProvinces({ states: list, shareOf: () => 0, perStateOf: () => 0.5 });
  const capFirst = once(states(5, 30)), equal = once(states(5, 5));
  rec("the fixture: one town for two states of the category (round(0.5 × 2))", equal.size === 1, [...equal]);
  rec("⭐⭐ the smaller state with the higher star gets it", capFirst.size === 1 && capFirst.has(4), [...capFirst]);
  rec("…and the count is the same as with equal stars", capFirst.size === equal.size);
  rec("CONTROL: with equal stars the larger state still gets it, as before", equal.has(1), [...equal]);
}

console.log("\n=== 6. every capital gets a city, even where its category's count gives it none ===");
// #every-generated-capital-has-a-city — TEST 38 had 28 of 90 capitals with no urban province, and the owner saw countries with no city.
{
  const run = (capital) => md.chooseUrbanProvinces({ states: [
    { id: 1, provinces: [1, 2, 3], category: "rural", vpProvince: 2, vp: 1, capital },
    { id: 2, provinces: [4, 5], category: "rural", vpProvince: 4, vp: 1 },
    { id: 3, provinces: [6, 7], category: "town", vpProvince: 7, vp: 5, capital },
    { id: 4, provinces: [8, 9], category: "city", vpProvince: 0, vp: 0, capital },
  ], shareOf: () => 0, perStateOf: (c) => (c === "town" ? 1 : 0), areaOf: new Map([[8, 10], [9, 40]]) });
  const withCap = run(true), without = run(false);
  rec("the fixture: with no capital flag only the town state's count gives a city", [...without].sort((a, b) => a - b).join() === "7", [...without]);
  rec("⭐⭐⭐ a capital in a category with no towns gets its star's province", withCap.has(2), [...withCap]);
  rec("⭐⭐ …a capital with no star gets its largest province", withCap.has(9) && !withCap.has(8), [...withCap]);
  rec("⭐⭐ …a capital that already has one gets no second, and a state that is not a capital gets none",
    withCap.size === 3 && !withCap.has(6) && !withCap.has(4) && !withCap.has(5), [...withCap]);
}
{
  // the generator flags the capital states it hands the chooser — by its own capital map, never by a hand-kept list
  const src = require("./testlib-strip-comments.js").stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const pushes = src.match(/cityStates\.push\(\{[^}]*\}\)/g) || [];
  rec("⭐⭐ generateLand marks a capital state for the city pass by capitalVp", pushes.length === 1 && /capital:\s*capitalVp\.has\(g\)/.test(pushes[0]), pushes);
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}   // scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1)
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
