// ⛔ #a-generated-country-keeps-its-economy — A WORLD GENERATE LAND BUILDS GIVES EACH COUNTRY ITS 1936 ECONOMY, NOT ONLY WHAT ITS
// RAISED LAND HELD.
//
// TEST 33 (the owner's flow: New mod → Delete map → Generate land 35% seed 1, inherit → Auto-fix → Redraw regions) started with
// factories 311/82/45 against the base game's 804/317/151, 35 of 90 countries with none, 532 M people of 2,075 M and 2,262 resources
// of 10,187: a state carried only what the land under it held, and most of the base game's land stayed under the sea. The owner's
// decision (question 7): each country keeps its 1936 economy. Its budget is what it held below; each new state keeps its own land's
// carry first; the rest goes where a state of the same category holds it below; a country with less land than its factories need
// keeps its mix and is said; manpower and resources come out exactly the world's below.
//
// The fixture is one world in which every case happens once, each strategic region one new state (provincesPerState 4):
//   AAA  a city state that kept its land, a drowned rural state with most of AAA's budget, and a LARGER rural state raised from
//        open sea next to it: the rest goes to the city by category, though the hollow state is the bigger (by size it would not);
//        its states below are at infrastructure 4, so a flat 2 is visible;
//   BBB  keeps one small coastal town and lost a big drowned state: 16 shared levels for 4 slots — it keeps its mix, and is said;
//        that state also held steel mills, a slot-sharing building with models and no row a new state is given (Road to 56's
//        shape): never placed, so they must not count against its slots;
//   CCC  its new state also holds one of DDD's provinces: that land's share is DDD's budget, not CCC's carry, so the state holds
//        exactly CCC's budget;
//   DDD  takes back the share CCC's state stands on; nothing below gives it an infrastructure level, so it keeps the flat 2;
//   EEE  a small known rural state (4,001 people) and a hollow rural one: the land's own carry would rank the hollow one first
//        (10,000), its economy ranks the known one first — and the capital must be the state that is most important ON DISK;
//   and a 1939.1.1 block (not the 1936 start), manpower not divisible by the provinces it is spread over.
// Twins: `economy: "land"` (the land's own carry, numbers derived from the manifest, key lines in the old order); single and none
// mode, byte-identical with and without `economy: "land"`; an add-on whose own states of AAA (IC 3, and one whose only buildings
// block is 1939's) and DDD (more than DDD's whole budget) load already; and one where CCC's state below has no owner and DDD takes
// its land. The largest state written is reported beside the largest below, and said on the page when it is larger.
// The fix wave after review (IR-1..IR-5):
//   18  a SECOND click: Generate land credited each province to the state that loads on it now, so CCC's first-click state on
//       DDD's province 14 gave CCC that land's people, chromium and factory a second time (the base game: Canada 12.2 M against its
//       1936 10.2 M). Every country holds its 1936 economy after two clicks, plus 1 person on a new state it had nothing left for;
//   19  an add-on whose states stand on other countries' land: CCC's holds MORE than CCC's budget (the land came with its people
//       and oil: taken off BBB), an ownerless one (its land is nobody's), DDD's on land nobody owned below (DDD's own, on top);
//   20  a state on another country's land carries only its own country's land first: DDD's big province under AAA's city state
//       was scaled down with AAA's carry and left AAA's hollow state 1 person (TEST 33: 94 such, Brazil 32 of its 89 states);
//   21  the owner pass throws — the one way a new state with owned land below is left ownerless — and each country is told what
//       it had no state for: its budget less the carry of the ownerless states on its land.
// The second review (R2-1..R2-5):
//   23  the world below still LOADS (no replace_path): its states hold every country's whole economy, and the default wrote each new
//       state 1 person and said each country kept "0 of the 0 levels it had" (over the base game: 15 and 87 such states). Generate
//       land is adding land to a world that is there, so each state holds its own land's — the hollow ones the 10,000 they always got;
//   and infrastructure's state_max is 4, under AAA's city state's share of AAA's mean (4.7): it is held to it.
// Every expected number is computed below from the manifest with plain arithmetic, never read off the writer.
//
// Fixture-only: binds no port. Run: node test-a-generated-country-keeps-its-economy.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-gen-economy-"));
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
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

// ── the world: 10 × 4 blocks of 32 px, province = col + row × 10 + 1 ──────────────────────────────────────────────────────
// Rows 0-1 (1-20) are in strategic regions and are raised; rows 2-3 (21-40) are in none and stay sea, so afterwards exactly row 1
// (11-20) is on a coast. Every row is all land or all sea, so the x seam adds no coast.
const COLS = 10, ROWS = 4, BLOCK = 32, W = COLS * BLOCK, H = ROWS * BLOCK;
const provAt = (x, y) => Math.floor(x / BLOCK) + Math.floor(y / BLOCK) * COLS + 1;
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const COASTAL = new Set(Array.from({ length: COLS }, (_, i) => COLS + i + 1));
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

// ── ⛔ THE MANIFEST ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const SLOTS = { rural: 2, town: 4, pastoral: 1, city: 6 };
const BUILDINGS = { infrastructure: { stateMax: 4 }, air_base: { stateMax: 10, show: 1 }, industrial_complex: { shares: true, stateMax: 20, show: 6 },
  arms_factory: { shares: true, stateMax: 20, show: 6 }, dockyard: { shares: true, stateMax: 20, show: 1, coast: true },
  steel_mill: { shares: true, stateMax: 20, show: 1 } };   // models and no row a new state is given (Road to 56's)
// the slot-sharing keys a new state can be given: no models, or models with a row Nova's own templates give a state (read off the source)
const ROW_TYPES = new Set([...(md.STATE_BUILDING_SLOTS || []), ...(md.COASTAL_STATE_BUILDING_SLOTS || [])].map(([t]) => t));
const SHARED = Object.keys(BUILDINGS).filter((k) => BUILDINGS[k].shares && (!BUILDINGS[k].show || ROW_TYPES.has(k)));
// the regions: each is ONE new state (contiguous, at most provincesPerState provinces)
const REGIONS = { A: [1, 2], H: [11, 12, 13], C: [3, 4, 14], D: [5, 6, 15, 16], E: [7, 8], F: [17, 18], B: [9, 10, 19, 20] };
const RAISED = Object.values(REGIONS).flat();
const BELOW = [
  { id: 1, owner: "AAA", cat: "city", provs: [1, 2], mp: 2000001, b: { infrastructure: 4, industrial_complex: 3, arms_factory: 1 }, res: { steel: 10 }, dated: { industrial_complex: 9 } },
  { id: 2, owner: "AAA", cat: "rural", provs: [21, 22, 31], mp: 3000000, b: { infrastructure: 4, industrial_complex: 2, arms_factory: 2 }, res: { steel: 7 } },
  { id: 3, owner: "BBB", cat: "town", provs: [9, 10, 19, 20], mp: 400000, b: { infrastructure: 3, industrial_complex: 1, dockyard: 1 } },
  { id: 4, owner: "BBB", cat: "rural", provs: [29, 30, 39], mp: 600000, b: { infrastructure: 3, industrial_complex: 7, arms_factory: 4, dockyard: 3, steel_mill: 6 }, res: { oil: 5 } },
  { id: 5, owner: "CCC", cat: "rural", provs: [3, 4], mp: 30001, b: { infrastructure: 3, industrial_complex: 1 }, res: { steel: 3 } },
  { id: 6, owner: "DDD", cat: "town", provs: [5, 6, 14, 15], mp: 1000003, b: { industrial_complex: 4 }, res: { chromium: 9 } },
  { id: 7, owner: "EEE", cat: "rural", provs: [7, 8], mp: 4001, b: { infrastructure: 2 } },
  { id: 8, owner: "EEE", cat: "rural", provs: [27, 28], mp: 900000, b: { infrastructure: 2 } },
];
const CAPITAL_LINE = { AAA: 1, BBB: 3, CCC: 5, DDD: 6, EEE: 7 };   // each country's capital = the id of its first state below
const TAGS = Object.keys(CAPITAL_LINE);

function buildGame({ below = BELOW } = {}) {
  const g = tmpDir("game");
  mk(g, "map/provinces.bmp", bmp24());
  mk(g, "map/definition.csv", csv(RAISED.concat(below.flatMap((s) => s.provs))));
  mk(g, "map/buildings.txt", "");
  Object.values(REGIONS).forEach((provs, i) => mk(g, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${provs.join(" ")} }\n\tweather={}\n}\n`));
  mk(g, "common/state_category/00.txt", "state_categories = {\n" + Object.entries(SLOTS).map(([k, v]) => `\t${k} = {\n\t\tlocal_building_slots = ${v}\n\t}\n`).join("") + "}\n");
  mk(g, "common/buildings/00_buildings.txt", "buildings = {\n" + Object.entries(BUILDINGS).map(([k, d]) => `\t${k} = {\n`
    + (d.show ? `\t\tshow_on_map = ${d.show}\n` : "") + (d.coast ? "\t\tonly_costal = yes\n" : "")
    + `\t\tlevel_cap = {\n${d.shares ? "\t\t\tshares_slots = yes\n" : ""}\t\t\tstate_max = ${d.stateMax}\n\t\t}\n\t}\n`).join("") + "}\n");
  for (const s of below) {
    const res = s.res ? `\tresources = { ${Object.entries(s.res).map(([k, v]) => `${k} = ${v}`).join(" ")} }\n` : "";
    const dated = s.dated ? `\t\t1939.1.1 = {\n\t\t\tbuildings = {\n${Object.entries(s.dated).map(([k, v]) => `\t\t\t\t${k} = ${v}\n`).join("")}\t\t\t}\n\t\t}\n` : "";
    mk(g, `history/states/${s.id}-S.txt`, `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = ${s.mp}\n${res}\tstate_category = ${s.cat}\n`
      + `\tprovinces = { ${s.provs.join(" ")} }\n\thistory = {\n${s.owner ? `\t\towner = ${s.owner}\n` : ""}\t\tbuildings = {\n${Object.entries(s.b).map(([k, v]) => `\t\t\t${k} = ${v}\n`).join("")}\t\t}\n${dated}\t}\n}\n`);
  }
  for (const [t, id] of Object.entries(CAPITAL_LINE)) mk(g, `history/countries/${t} - Land.txt`, `capital = ${id}\n`);
  return g;
}
// `own`: states the mod already has, each on a province of the sea rows it makes land of its own; no `owner` writes none, and
// `datedOnly` puts its only buildings block inside 1939.1.1 (the dated-first shape: it says nothing of the 1936 start).
// `replacePath: false` is Nova's own New-mod descriptor: the world below's states still load
function buildMod(own = [], { replacePath = true } = {}) {
  const m = tmpDir("mod");
  mk(m, "descriptor.mod", 'version="1"\nname="Economy"\n' + (replacePath ? 'replace_path="history/states"\n' : "") + 'path="mod/economy"\n');
  mk(m, "map/provinces.bmp", bmp24());
  mk(m, "map/definition.csv", csv(own.flatMap((s) => s.provs)));
  const bld = (s, tabs) => `${tabs}buildings = {\n${Object.entries(s.b).map(([k, v]) => `${tabs}\t${k} = ${v}\n`).join("")}${tabs}}\n`;
  for (const s of own) mk(m, `history/states/${s.id}-Own.txt`, `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = ${s.mp}\n`
    + (s.res ? `\tresources = { ${Object.entries(s.res).map(([k, v]) => `${k} = ${v}`).join(" ")} }\n` : "") + `\tstate_category = ${s.cat}\n`
    + `\tprovinces = { ${s.provs.join(" ")} }\n\thistory = {\n${s.owner ? `\t\towner = ${s.owner}\n` : ""}`
    + (s.datedOnly ? `\t\t1939.1.1 = {\n${bld(s, "\t\t\t")}\t\t}\n` : bld(s, "\t\t")) + "\t}\n}\n");
  return m;
}
function readStates(mod) {
  const dir = path.join(mod, "history", "states");
  return fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    const id = +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1];
    const provinces = (((/\bprovinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g).map(Number);
    const res = {};
    for (const m of ((/\bresources\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").matchAll(/([a-z_]+)\s*=\s*(\d+)/g)) res[m[1]] = +m[2];
    const bi = t.indexOf("buildings = {");
    let body = "";
    if (bi >= 0) { let d = 0; for (let j = t.indexOf("{", bi); j < t.length; j++) { if (t[j] === "{") d++; else if (t[j] === "}") { d--; if (!d) { body = t.slice(t.indexOf("{", bi) + 1, j); break; } } } }
    const keys = {}, order = [];
    for (const m of body.replace(/\d+\s*=\s*\{[^{}]*\}/g, " ").matchAll(/([a-z_]+)\s*=\s*(\d+)/g)) { keys[m[1]] = +m[2]; order.push(m[1]); }
    const vps = [...t.matchAll(/victory_points\s*=\s*\{\s*(\d+)\s+(\d+)\s*\}/g)].map((m) => +m[2]);
    return { file: f, id, provinces, key: provinces.slice().sort((a, b) => a - b).join(","), category: (/\bstate_category\s*=\s*(\w+)/.exec(t) || [])[1],
      owner: (/\bowner\s*=\s*(\w+)/.exec(t) || [])[1] || "", manpower: +(/\bmanpower\s*=\s*(\d+)/.exec(t) || [])[1], res, keys, order, vps, text: t };
  });
}
const GEN = (mod, game, extra = {}) => ({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: RAISED.length, provincesPerState: 4, seed: 7, ownerMode: "inherit", ...extra });
const run = (game, extra = {}, own = [], modOpts = {}) => { const mod = buildMod(own, modOpts); const r = md.generateLand(GEN(mod, game, extra)); return { mod, r, states: readStates(mod) }; };

// ── what the manifest says must come out, by plain arithmetic ───────────────────────────────────────────────────────────
const belowOf = new Map(); for (const s of BELOW) for (const p of s.provs) belowOf.set(p, s);
const keyOf = (provs) => provs.slice().sort((a, b) => a - b).join(",");
const budgetOf = (below) => {
  const out = {};
  for (const s of below) {
    if (!s.owner) continue;
    const b = out[s.owner] = out[s.owner] || { mp: 0, res: {}, bld: {} };
    b.mp += s.mp;
    for (const [k, v] of Object.entries(s.res || {})) b.res[k] = (b.res[k] || 0) + v;
    for (const [k, v] of Object.entries(s.b)) if (k !== "infrastructure" && k !== "air_base") b.bld[k] = (b.bld[k] || 0) + v;
  }
  return out;
};
const BUDGET = budgetOf(BELOW);
const worldBelow = { mp: sum(BELOW.map((s) => s.mp)), res: {} };
for (const s of BELOW) for (const [k, v] of Object.entries(s.res || {})) worldBelow.res[k] = (worldBelow.res[k] || 0) + v;
// a region's carry, per state below: value × (its provinces there) ÷ (that state's provinces)
const carryOf = (provs, pick) => sum(BELOW.map((s) => pick(s) * provs.filter((p) => s.provs.includes(p)).length / s.provs.length));
// the per-state mean of a category below
const meanOf = (cat, pick) => { const ss = BELOW.filter((s) => s.cat === cat); return sum(ss.map(pick)) / ss.length; };
const infraBelow = (t) => { const ss = BELOW.filter((s) => s.owner === t); return ss.some((s) => "infrastructure" in s.b) ? sum(ss.map((s) => s.b.infrastructure || 0)) / ss.length : null; };
const pxOf = (provs) => provs.length * BLOCK * BLOCK;
const ownerOfRegion = { A: "AAA", H: "AAA", C: "CCC", D: "DDD", E: "EEE", F: "EEE", B: "BBB" };
const catOfRegion = { A: "city", H: "rural", C: "rural", D: "town", E: "rural", F: "rural", B: "town" };
// the land's own carry (economy "land"): per province floor(manpower ÷ provinces) and floor(resource ÷ provinces); 10,000 with none known
const r1ManpowerOf = (provs) => { const known = provs.filter((p) => belowOf.has(p)); return known.length ? sum(known.map((p) => Math.floor(belowOf.get(p).mp / belowOf.get(p).provs.length))) : 10000; };
const r1ResourcesOf = (provs) => { const o = {}; for (const p of provs) { const s = belowOf.get(p); if (s) for (const [k, v] of Object.entries(s.res || {})) { const f = Math.floor(v / s.provs.length); if (f > 0) o[k] = (o[k] || 0) + f; } } return o; };
// AAA's city state's infrastructure before the clamp: AAA's mean below × the city's level ÷ the mean of its two states' categories
const catInfra = (cat) => meanOf(cat, (s) => s.b.infrastructure || 0);
const aaaCityInfra = infraBelow("AAA") * catInfra(catOfRegion.A) / ((catInfra(catOfRegion.A) + catInfra(catOfRegion.H)) / 2);

console.log("=== 0. the fixture can tell right from wrong (controls, from the manifest alone) ===");
{
  rec("CONTROL: AAA lost most of its budget under the sea", carryOf(REGIONS.A, (s) => s.owner === "AAA" ? s.mp : 0) < BUDGET.AAA.mp / 2, { carry: carryOf(REGIONS.A, (s) => s.mp), budget: BUDGET.AAA.mp });
  rec("CONTROL: AAA's hollow state is larger than its city state, and a city below is worth more people than a rural state",
    pxOf(REGIONS.H) > pxOf(REGIONS.A) && meanOf("city", (s) => s.mp) > meanOf("rural", (s) => s.mp), { H: pxOf(REGIONS.H), A: pxOf(REGIONS.A) });
  rec("CONTROL: BBB's shared budget is over the slots of the one state it keeps", sum(SHARED.map((k) => BUDGET.BBB.bld[k] || 0)) > SLOTS[catOfRegion.B], BUDGET.BBB.bld);
  rec(`CONTROL: BBB held steel mills, slot-sharing and never placed: counted with its factories its need would be ${sum(SHARED.map((k) => BUDGET.BBB.bld[k] || 0)) + BUDGET.BBB.bld.steel_mill}, not ${sum(SHARED.map((k) => BUDGET.BBB.bld[k] || 0))}`,
    !SHARED.includes("steel_mill") && BUILDINGS.steel_mill.shares && BUDGET.BBB.bld.steel_mill > 0, BUDGET.BBB.bld);
  rec("CONTROL: CCC's new state carries more people than CCC's whole budget", carryOf(REGIONS.C, (s) => s.mp) > BUDGET.CCC.mp, { carry: carryOf(REGIONS.C, (s) => s.mp), budget: BUDGET.CCC.mp });
  rec("CONTROL: by the land's own carry EEE's hollow state outranks its known one; by its economy it does not",
    r1ManpowerOf(REGIONS.F) > r1ManpowerOf(REGIONS.E) && carryOf(REGIONS.E, (s) => s.mp) > carryOf(REGIONS.F, (s) => s.mp), { r1: [r1ManpowerOf(REGIONS.E), r1ManpowerOf(REGIONS.F)] });
  rec("CONTROL: manpower is not divisible by the provinces it is spread over (so a floored budget is short)", BELOW.some((s) => s.mp % s.provs.length) && sum(BELOW.map((s) => Math.floor(s.mp / s.provs.length) * s.provs.length)) < worldBelow.mp);
  rec("CONTROL: AAA's states below are at infrastructure 4, not the flat 2; DDD's declare none", infraBelow("AAA") === 4 && infraBelow("DDD") === null);
  rec(`CONTROL: AAA's city state's share of AAA's mean, shaped by category (${aaaCityInfra.toFixed(2)}), is over infrastructure's state_max (${BUILDINGS.infrastructure.stateMax})`,
    aaaCityInfra > BUILDINGS.infrastructure.stateMax);
}

const game = buildGame();
const runs = [run(game), run(game)];
const runsLabel = ["cold", "warm"];

for (let i = 0; i < runs.length; i++) {
  const { r, states, mod } = runs[i], label = runsLabel[i];
  console.log(`\n=== 1. ${label}: each country keeps its 1936 economy ===`);
  const byKey = new Map(states.map((s) => [s.key, s]));
  const of = (reg) => byKey.get(keyOf(REGIONS[reg])) || { keys: {}, res: {}, manpower: NaN };
  rec(`${label}: the world was generated, one state per region, each owned as the manifest says`, r && r.changed === true && states.length === Object.keys(REGIONS).length
    && Object.keys(REGIONS).every((k) => of(k).owner === ownerOfRegion[k]), states.map((s) => [s.key, s.owner]));
  rec(`${label}: the report says the economy was kept, and why not if not`, r.economy && r.economy.mode === "country" && !r.economy.error, r.economy);
  const mine = (t) => states.filter((s) => s.owner === t);
  // 1-2. manpower and every resource: the world's below, exactly, and per country its budget
  rec(`${label}: ⭐⭐ Σ manpower over every state is the world's below, exactly (${worldBelow.mp})`, sum(states.map((s) => s.manpower)) === worldBelow.mp, sum(states.map((s) => s.manpower)));
  for (const t of TAGS) rec(`${label}: ${t} holds its budget of people, ${BUDGET[t].mp}`, sum(mine(t).map((s) => s.manpower)) === BUDGET[t].mp, mine(t).map((s) => s.manpower));
  for (const [k, v] of Object.entries(worldBelow.res)) rec(`${label}: ⭐ Σ ${k} is the world's below, ${v}, and each country's its own`, sum(states.map((s) => s.res[k] || 0)) === v
    && TAGS.every((t) => sum(mine(t).map((s) => s.res[k] || 0)) === (BUDGET[t].res[k] || 0)), states.map((s) => [s.owner, s.res]));
  // 3. shared levels: min(budget, slots) per country
  for (const t of TAGS) {
    const slots = sum(mine(t).map((s) => SLOTS[s.category])), want = Math.min(sum(SHARED.map((k) => BUDGET[t].bld[k] || 0)), slots);
    rec(`${label}: ${t} holds min(its shared budget, its slots) = ${want} shared levels`, sum(mine(t).map((s) => sum(SHARED.map((k) => s.keys[k] || 0)))) === want, mine(t).map((s) => s.keys));
  }
  // 4. BBB keeps its mix
  {
    const b = of("B"), need = sum(SHARED.map((k) => BUDGET.BBB.bld[k] || 0)), slots = SLOTS[catOfRegion.B];
    rec(`${label}: ⭐⭐ BBB keeps its mix: each key within one of budget × ${slots} ÷ ${need}, and a military factory among them`,
      SHARED.every((k) => Math.abs((b.keys[k] || 0) - Math.round((BUDGET.BBB.bld[k] || 0) * slots / need)) <= 1) && b.keys.arms_factory > 0, b.keys);
  }
  // 5. CCC scaled down to its budget
  rec(`${label}: ⭐ CCC's state, carrying ${Math.round(carryOf(REGIONS.C, (s) => s.mp))} people of land below, holds CCC's budget of ${BUDGET.CCC.mp}`, of("C").manpower === BUDGET.CCC.mp, of("C").manpower);
  rec(`${label}: …and only CCC's own resources and factories (the share of DDD's land it carried went back to DDD)`, JSON.stringify(of("C").res) === JSON.stringify(BUDGET.CCC.res)
    && (of("C").keys.industrial_complex || 0) === BUDGET.CCC.bld.industrial_complex, { res: of("C").res, keys: of("C").keys });
  // 6. the rest by category, not by size
  {
    const restA = of("A").manpower - carryOf(REGIONS.A, (s) => s.mp), restH = of("H").manpower - carryOf(REGIONS.H, (s) => s.mp);
    rec(`${label}: ⭐⭐ the city state that kept its land got more of AAA's rest than the larger hollow rural state`, restA > restH && restH > 0, { restA, restH });
    const expA = (BUDGET.AAA.mp - carryOf(REGIONS.A, (s) => s.mp)) * meanOf("city", (s) => s.mp) / (meanOf("city", (s) => s.mp) + meanOf("rural", (s) => s.mp));
    rec(`${label}: …in proportion to what a state of each category holds below (within one person)`, Math.abs(restA - expA) <= 1, { restA, expA });
  }
  // 7. slots, state_max, the coast
  const over = states.filter((s) => sum(SHARED.map((k) => s.keys[k] || 0)) > SLOTS[s.category] || Object.entries(s.keys).some(([k, v]) => BUILDINGS[k] && v > BUILDINGS[k].stateMax));
  rec(`${label}: no state over its slots or a key's state_max`, over.length === 0, over.map((s) => [s.id, s.category, s.keys]));
  rec(`${label}: no dockyard on a state off the coast`, states.filter((s) => s.keys.dockyard).every((s) => s.provinces.some((p) => COASTAL.has(p))), states.filter((s) => s.keys.dockyard).map((s) => s.provinces));
  rec(`${label}: the steel mills BBB held are placed nowhere, and said as not carried`, !states.some((s) => s.keys.steel_mill)
    && Math.abs((((r.industry || {}).notCarried || {}).steel_mill || 0) - BUDGET.BBB.bld.steel_mill) < 1e-9, (r.industry || {}).notCarried);
  // 8. infrastructure
  for (const t of TAGS) {
    const lv = mine(t).map((s) => s.keys.infrastructure), m = infraBelow(t);
    if (m == null) rec(`${label}: ⭐ ${t}, given no infrastructure level below, keeps the flat 2`, lv.every((v) => v === 2), lv);
    else rec(`${label}: ⭐ ${t}'s infrastructure keeps its mean below (${m}) within 0.5, every level 1..${BUILDINGS.infrastructure.stateMax}`,
      Math.abs(sum(lv) / lv.length - m) <= 0.5 && lv.every((v) => v >= 1 && v <= BUILDINGS.infrastructure.stateMax), lv);
  }
  rec(`${label}: ⭐ AAA's city state, whose share is over it, is held to infrastructure's state_max (${BUILDINGS.infrastructure.stateMax}), read from common/buildings`,
    of("A").keys.infrastructure === BUILDINGS.infrastructure.stateMax, of("A").keys);
  // 10 (line order). the factory line is written before the dockyard line, as always
  rec(`${label}: ⭐ BBB's file writes its factories before its dockyard, the order every state file had`, (() => { const o = of("B").order; return o.indexOf("industrial_complex") >= 0 && o.indexOf("industrial_complex") < o.indexOf("dockyard"); })(), of("B").order);
  // 12. the validator
  const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
  const probs = (md.validateMapModel(model) || []).concat(md.validateMapBitmap({ modRoot: mod, gameRoot: game, dependencyRoots: [] }) || []);
  const count = (rule) => probs.filter((q) => q.rule === rule).reduce((a, q) => a + (q.total || (q.items || []).length || 1), 0);
  rec(`${label}: Map Errors reports no state over its slots and no naval building off the coast`, count("state_buildings_exceed_slots") === 0 && count("state_naval_building_without_coast") === 0,
    probs.filter((q) => /slots|coast/.test(q.rule)).map((q) => q.rule));
  // 13. the report names BBB as short
  const short = ((r.economy || {}).short || []).find((s) => s.tag === "BBB");
  rec(`${label}: ⭐ the report names BBB as short, with its need and its slots`, !!short && short.need === sum(SHARED.map((k) => BUDGET.BBB.bld[k] || 0)) && short.slots === SLOTS[catOfRegion.B], (r.economy || {}).short);
  rec(`${label}: …and only countries that are`, ((r.economy || {}).short || []).every((s) => s.need > s.slots), (r.economy || {}).short);
  const eco = r.economy || {};
  rec(`${label}: the report's people and resources are what is on disk`, (eco.manpower || {}).written === sum(states.map((s) => s.manpower))
    && (eco.resources || {}).written === sum(states.map((s) => sum(Object.values(s.res)))), eco);
  // the largest state written, beside the largest the world below starts with: a size the game has not been seen to load is said
  const big = states.slice().sort((a, b) => b.manpower - a.manpower || a.id - b.id)[0] || {}, lg = eco.largest || {}, bigBelow = Math.max(...BELOW.map((s) => s.mp));
  rec(`${label}: ⭐ the report names the largest state written (${big.id}, ${big.owner}, ${big.manpower}) and the largest below (${bigBelow})`,
    lg.id === big.id && lg.tag === big.owner && lg.manpower === big.manpower && lg.below === bigBelow, lg);
  // 15. capitals
  const capLine = (t) => { const f = path.join(mod, "history", "countries"); const own = fs.existsSync(f) ? fs.readdirSync(f).find((x) => x.startsWith(t)) : null; return own ? +(/capital\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(f, own), "utf8")) || [])[1] : CAPITAL_LINE[t]; };
  const notMost = TAGS.filter((t) => md.mostImportantState(mine(t).map((s) => ({ id: s.id, vp: Math.max(0, ...s.vps), vpSum: sum(s.vps), manpower: s.manpower }))) !== capLine(t));
  rec(`${label}: ⭐⭐ every capital is its country's most important state ON DISK (by the manpower written)`, notMost.length === 0, notMost.map((t) => [t, capLine(t), mine(t).map((s) => [s.id, s.vps, s.manpower])]));
}
rec("14. cold and warm write the same states", JSON.stringify(runs[0].states.map((s) => s.text.replace(/\r/g, "")).sort()) === JSON.stringify(runs[1].states.map((s) => s.text.replace(/\r/g, "")).sort()));
rec("…and say the same", JSON.stringify(runs[0].r.economy) === JSON.stringify(runs[1].r.economy), [runs[0].r.economy, runs[1].r.economy]);

console.log("\n=== 10. economy \"land\": the land's own carry, as before ===");
const land = run(game, { economy: "land" });
{
  const byKey = new Map(land.states.map((s) => [s.key, s]));
  rec("the report says the land's own carry was kept", land.r.economy && land.r.economy.mode === "land", land.r.economy);
  for (const [reg, provs] of Object.entries(REGIONS)) {
    const s = byKey.get(keyOf(provs)) || {};
    rec(`${reg}: manpower Σ floor(manpower ÷ provinces) of its own land (${r1ManpowerOf(provs)}), resources likewise, infrastructure 2`,
      s.manpower === r1ManpowerOf(provs) && JSON.stringify(s.res, Object.keys(s.res || {}).sort()) === JSON.stringify(r1ResourcesOf(provs), Object.keys(r1ResourcesOf(provs)).sort())
      && (s.keys || {}).infrastructure === 2, s && { mp: s.manpower, res: s.res, keys: s.keys });
  }
  // per country, round(Σ its raised land's shares) where nothing binds
  for (const t of TAGS) for (const k of SHARED) {
    const want = Math.round(sum(RAISED.filter((p) => belowOf.has(p) && belowOf.get(p).owner === t).map((p) => (belowOf.get(p).b[k] || 0) / belowOf.get(p).provs.length)) + 1e-9);
    const got = sum(land.states.filter((s) => s.owner === t).map((s) => s.keys[k] || 0));
    // CCC's new state also carries DDD's province share: the land carry follows the state, not the owner below
    const carried = Math.round(sum(Object.entries(REGIONS).filter(([reg]) => ownerOfRegion[reg] === t).map(([, provs]) => carryOf(provs, (s) => s.b[k] || 0))) + 1e-9);
    rec(`${t} ${k}: round(Σ its new states' shares) = ${carried}`, got === carried, { got, carried, ownLand: want });
  }
  rec("BBB's file writes its factory before its dockyard, as it always did", (() => { const o = (byKey.get(keyOf(REGIONS.B)) || {}).order || []; return o.indexOf("industrial_complex") >= 0 && o.indexOf("industrial_complex") < o.indexOf("dockyard"); })(),
    (byKey.get(keyOf(REGIONS.B)) || {}).order);
  rec("CONTROL: the land's own carry is short of the world's people, so the two answers differ", sum(land.states.map((s) => s.manpower)) !== worldBelow.mp);
}

console.log("\n=== 11. single and none mode keep the land's own carry ===");
for (const extra of [{ ownerMode: "single", owner: "AAA" }, { ownerMode: "none" }]) {
  const a = run(game, extra), b = run(game, { ...extra, economy: "land" });
  const text = (x) => JSON.stringify(x.states.map((s) => s.text.replace(/\r/g, "")).sort());
  rec(`${extra.ownerMode}: byte-identical with and without economy "land"`, a.states.length > 0 && text(a) === text(b), a.r.economy);
  rec(`${extra.ownerMode}: …and the report says the land's own carry`, a.r.economy && a.r.economy.mode === "land", a.r.economy);
}

console.log("\n=== 9 + 16. an add-on: states of AAA and DDD that load already ===");
{
  // 52: AAA's too, its only buildings block dated 1939 — a later bookmark's factories, not held at the 1936 start
  const OWN = [{ id: 50, owner: "AAA", cat: "rural", provs: [32], mp: 1000, b: { infrastructure: 2, industrial_complex: 3 } },
    { id: 51, owner: "DDD", cat: "town", provs: [33], mp: BUDGET.DDD.mp + 1000000, b: { infrastructure: 2, industrial_complex: (BUDGET.DDD.bld.industrial_complex || 0) + 2 }, res: { chromium: (BUDGET.DDD.res.chromium || 0) + 1 } },
    { id: 52, owner: "AAA", cat: "rural", provs: [34], mp: 500, b: { industrial_complex: 2 }, datedOnly: true }];
  const x = run(game, {}, OWN);
  const made = x.states.filter((s) => !OWN.some((o) => o.id === s.id));
  const mineNew = (t) => made.filter((s) => s.owner === t);
  rec("the add-on world was generated, beside the mod's own states", x.r.changed === true && made.length === Object.keys(REGIONS).length, x.r.error || made.length);
  rec("the states that load already are not written", OWN.every((o) => { const s = x.states.find((q) => q.id === o.id); return s && s.manpower === o.mp && s.keys.industrial_complex === o.b.industrial_complex; }));
  const ownOf = (t) => OWN.filter((o) => o.owner === t);
  const aaaPeople = BUDGET.AAA.mp - sum(ownOf("AAA").map((o) => o.mp));
  const aaaFactories = BUDGET.AAA.bld.industrial_complex - sum(ownOf("AAA").filter((o) => !o.datedOnly).map((o) => o.b.industrial_complex || 0));
  rec(`⭐⭐ AAA's new states hold its budget less what it holds already: ${BUDGET.AAA.mp} − ${sum(ownOf("AAA").map((o) => o.mp))} people`,
    sum(mineNew("AAA").map((s) => s.manpower)) === aaaPeople, mineNew("AAA").map((s) => s.manpower));
  rec("CONTROL: counted as held, state 52's dated factories would leave AAA fewer new ones", aaaFactories - OWN[2].b.industrial_complex < aaaFactories && aaaFactories - OWN[2].b.industrial_complex >= 0);
  rec(`⭐⭐ …and ${BUDGET.AAA.bld.industrial_complex} − ${OWN[0].b.industrial_complex} factories: state 52's only buildings block is 1939's, so it holds none of AAA's 1936 ones`,
    sum(mineNew("AAA").map((s) => s.keys.industrial_complex || 0)) === aaaFactories, mineNew("AAA").map((s) => s.keys));
  rec("⭐ DDD, which already holds more than its whole budget, gets nothing more: no factory, no resource, 1 person a state",
    mineNew("DDD").every((s) => !s.keys.industrial_complex && !Object.keys(s.res).length && s.manpower === 1), mineNew("DDD").map((s) => [s.keys, s.res, s.manpower]));
  rec("…the other countries are as before", ["BBB", "CCC", "EEE"].every((t) => sum(mineNew(t).map((s) => s.manpower)) === BUDGET[t].mp));
  // what the report says was left to place: each country's budget less what it holds already, never below nothing
  const left = sum(TAGS.map((t) => Math.max(0, BUDGET[t].mp - sum(OWN.filter((o) => o.owner === t).map((o) => o.mp)))));
  rec(`⭐ the report says ${left} people were left to place: DDD's overspent budget counts as nothing, not as less than nothing`,
    ((x.r.economy || {}).manpower || {}).budget === left, (x.r.economy || {}).manpower);
}

console.log("\n=== 17. land nobody owned below: carried by the country that took it, on top of its budget ===");
{
  const below = BELOW.map((s) => (s.owner === "CCC" ? { ...s, owner: "" } : s));
  const g2 = buildGame({ below }), x = run(g2);
  const byKey = new Map(x.states.map((s) => [s.key, s]));
  const taker = (byKey.get(keyOf(REGIONS.C)) || {}).owner;
  rec("the fixture: CCC's land below has no owner, and its new state went to DDD (the one owner on it)", taker === "DDD", taker);
  const wb = sum(below.map((s) => s.mp));
  rec("⭐⭐ Σ manpower is still the world's below, exactly: nobody's land kept its people", sum(x.states.map((s) => s.manpower)) === wb, { got: sum(x.states.map((s) => s.manpower)), wb });
  const cc = BELOW.find((s) => s.owner === "CCC");
  rec("…and DDD holds its own budget and that land's", sum(x.states.filter((s) => s.owner === "DDD").map((s) => s.manpower)) === BUDGET.DDD.mp + cc.mp, x.states.filter((s) => s.owner === "DDD").map((s) => s.manpower));
  rec("…and its resources", sum(x.states.map((s) => s.res.steel || 0)) === worldBelow.res.steel, x.states.map((s) => s.res));
}

// what one province of a state below is worth of one quantity: value ÷ its provinces, never floored
const shareOf = (below, p, pick) => { const s = below.find((q) => q.provs.includes(p)); return s ? pick(s) / s.provs.length : 0; };

console.log("\n=== 18. a second click: the first click's state stands on another country's land, and the second gives its country more ===");
{
  // CCC's first-click state (region C) stands on DDD's province 14 and holds CCC's whole budget; the mod then puts one more sea
  // province in a strategic region, 24, beside 14 and nothing else anybody holds: the second click raises it, and CCC takes it
  const mod = buildMod();
  const r1 = md.generateLand(GEN(mod, game));
  mk(mod, "map/strategicregions/r8.txt", `strategic_region={\n\tid=${Object.keys(REGIONS).length + 1}\n\tname="REGION_EXTRA"\n\tprovinces={ 24 }\n\tweather={}\n}\n`);
  const r2 = md.generateLand(GEN(mod, game, { count: 1 }));
  const all = readStates(mod), second = all.filter((s) => s.key === "24"), first = all.find((s) => s.key === keyOf(REGIONS.C)) || {};
  rec("the fixture: the first click made every region, the second one state on 24, and CCC took it", r1.changed === true && r2.changed === true
    && all.length === Object.keys(REGIONS).length + 1 && second.length === 1 && second[0].owner === "CCC", { r2: r2.error, states: all.map((s) => [s.key, s.owner]) });
  rec("CONTROL: CCC's first-click state stands on DDD's province 14, and holds CCC's whole budget", first.owner === "CCC" && first.provinces.includes(14)
    && belowOf.get(14).owner === "DDD" && first.manpower === BUDGET.CCC.mp, { first: [first.owner, first.provinces, first.manpower] });
  rec("CONTROL: crediting 14 to the state that holds it now would give CCC more than its budget", shareOf(BELOW, 14, (s) => s.mp) >= 1 && shareOf(BELOW, 14, (s) => (s.res || {}).chromium || 0) >= 1);
  const mineAll = (t) => all.filter((s) => s.owner === t), r2eco = r2.economy || {};
  rec("the second click kept the countries' economies, and nothing failed", r2eco.mode === "country" && !r2eco.error, r2eco);
  // Generate land never writes a state with nobody: a country with nothing left gives its new state 1 person
  for (const t of TAGS) {
    const floor = second.filter((s) => s.owner === t && s.manpower === 1).length;
    rec(`⭐⭐ ${t} holds its 1936 people after two clicks, ${BUDGET[t].mp}${floor ? ` (+ 1 on the new state it had nothing left for)` : ""}`,
      sum(mineAll(t).map((s) => s.manpower)) === BUDGET[t].mp + floor, mineAll(t).map((s) => [s.key, s.manpower]));
  }
  rec("⭐⭐ …and every country exactly its resources", TAGS.every((t) => Object.keys(worldBelow.res).every((k) => sum(mineAll(t).map((s) => s.res[k] || 0)) === (BUDGET[t].res[k] || 0))),
    all.map((s) => [s.owner, s.res]));
  rec("⭐ …and no country more of a slot-sharing building than it held below", TAGS.every((t) => SHARED.every((k) => sum(mineAll(t).map((s) => s.keys[k] || 0)) <= (BUDGET[t].bld[k] || 0))),
    all.map((s) => [s.owner, s.keys]));
}

console.log("\n=== 19. an add-on whose states stand on land other countries held below ===");
{
  // state 9 below: land nobody owned (rows 2-3, never raised). Own states: CCC's 53 on BBB's province 39, holding MORE than CCC's
  // whole budget (the land came with its people and oil); an ownerless 54 on AAA's 21; DDD's 55 on 35, nobody's land below.
  const below = BELOW.concat([{ id: 9, owner: "", cat: "rural", provs: [35, 36], mp: 50000, b: {} }]);
  const g9 = buildGame({ below });
  const p39 = shareOf(below, 39, (s) => s.mp), oil39 = shareOf(below, 39, (s) => (s.res || {}).oil || 0);
  const OWN = [{ id: 53, owner: "CCC", cat: "rural", provs: [39], mp: BUDGET.CCC.mp + p39, b: { infrastructure: 2 }, res: { oil: Math.ceil(oil39) } },
    { id: 54, owner: "", cat: "rural", provs: [21], mp: shareOf(below, 21, (s) => s.mp), b: { infrastructure: 2 } },
    { id: 55, owner: "DDD", cat: "rural", provs: [35], mp: shareOf(below, 35, (s) => s.mp), b: { infrastructure: 2 } }];
  const x = run(g9, {}, OWN), made = x.states.filter((s) => !OWN.some((o) => o.id === s.id));
  const mineNew = (t) => made.filter((s) => s.owner === t);
  rec("the add-on world was generated beside its own states", x.r.changed === true && made.length === Object.keys(REGIONS).length && !(x.r.economy || {}).error, x.r.error || x.r.economy);
  rec("CONTROL: CCC's state holds more than CCC's whole budget, people and oil", OWN[0].mp > BUDGET.CCC.mp && OWN[0].res.oil > (BUDGET.CCC.res.oil || 0));
  // CCC took the excess with the land: people up to the land's share, oil up to its share
  const bbbPeople = BUDGET.BBB.mp - Math.min(p39, OWN[0].mp - BUDGET.CCC.mp), bbbOil = Math.round(BUDGET.BBB.res.oil - Math.min(oil39, OWN[0].res.oil - (BUDGET.CCC.res.oil || 0)));
  rec(`⭐⭐ BBB's new states hold its budget less the share of its land CCC's state took with it: ${bbbPeople} people, ${bbbOil} oil`,
    sum(mineNew("BBB").map((s) => s.manpower)) === bbbPeople && sum(mineNew("BBB").map((s) => s.res.oil || 0)) === bbbOil, mineNew("BBB").map((s) => [s.manpower, s.res]));
  rec(`…and CCC, over its budget of people and oil already, gets 1 person a state and no oil — but the ${BUDGET.CCC.res.steel} steel state 53 does not hold`,
    mineNew("CCC").every((s) => s.manpower === 1 && !s.res.oil) && sum(mineNew("CCC").map((s) => s.res.steel || 0)) === BUDGET.CCC.res.steel, mineNew("CCC").map((s) => [s.manpower, s.res]));
  const aaaPeople = BUDGET.AAA.mp - shareOf(below, 21, (s) => s.mp);
  rec(`⭐⭐ AAA's new states hold its budget less the share of its land the ownerless state holds: ${aaaPeople}`, sum(mineNew("AAA").map((s) => s.manpower)) === aaaPeople, mineNew("AAA").map((s) => s.manpower));
  rec(`⭐⭐ DDD's new states hold its whole budget, ${BUDGET.DDD.mp}: the land nobody owned below that its state holds is its own, on top`,
    sum(mineNew("DDD").map((s) => s.manpower)) === BUDGET.DDD.mp, mineNew("DDD").map((s) => s.manpower));
  rec("…and EEE is untouched", sum(mineNew("EEE").map((s) => s.manpower)) === BUDGET.EEE.mp);
}

console.log("\n=== 20. a country's state on another country's land carries only its own country's land first ===");
{
  // AAA's city state below is province 1 alone; province 2 is a big town of DDD's. Region A (1 + 2) goes to AAA (a tie, the lower
  // tag). Carried first, DDD's 6,000,000 were over AAA's budget, scaled down with AAA's own, and left AAA's hollow state with 1 person.
  const below = BELOW.map((s) => (s.id === 1 ? { ...s, provs: [1] } : s)).concat([{ id: 10, owner: "DDD", cat: "town", provs: [2], mp: 6000000, b: { infrastructure: 3 } }]);
  const g10 = buildGame({ below }), x = run(g10);
  const byKey = new Map(x.states.map((s) => [s.key, s]));
  const a = byKey.get(keyOf(REGIONS.A)) || {}, h = byKey.get(keyOf(REGIONS.H)) || {};
  const budget = budgetOf(below), own = below.find((s) => s.id === 1).mp;
  rec("the fixture: AAA holds region A, half of it DDD's land below, and the hollow region H", a.owner === "AAA" && h.owner === "AAA", [a.owner, h.owner]);
  rec("CONTROL: what region A's land held below is over AAA's whole budget", shareOf(below, 1, (s) => s.mp) + shareOf(below, 2, (s) => s.mp) > budget.AAA.mp);
  // the rest of AAA's budget, after its own land's carry, goes by what a state of each one's category holds below
  const mean = (cat) => { const ss = below.filter((s) => s.cat === cat); return sum(ss.map((s) => s.mp)) / ss.length; };
  rec("the fixture: both categories written are ones the states below have", below.some((s) => s.cat === a.category) && below.some((s) => s.cat === h.category), [a.category, h.category]);
  const expH = (budget.AAA.mp - own) * mean(h.category) / (mean(a.category) + mean(h.category));
  rec(`⭐⭐ AAA's hollow state holds its share of AAA's rest by category (${Math.round(expH)}), not the 1 person a scaled-down carry left it`,
    Math.abs(h.manpower - expH) <= 1, { h: h.manpower, expH });
  rec("⭐ …and AAA holds its budget, DDD its own (province 2's people went to DDD's state)", a.manpower + h.manpower === budget.AAA.mp
    && sum(x.states.filter((s) => s.owner === "DDD").map((s) => s.manpower)) === budget.DDD.mp, x.states.map((s) => [s.owner, s.manpower]));
}

console.log("\n=== 22. a capital tied with another of its country's states on its star and its people ===");
{
  // EEE's two states below each lie half in region E, half in region F, alike: E and F carry the same people, the same category and
  // the same star. EEE's capital line (7) is the highest new id, so the capital, whichever it is, ties a state with a LOWER id — and
  // mostImportantState breaks a tie on the lower id (TEST 33: Argentina's 278 and 67, both 1,175,603 people)
  const e7 = BELOW.find((s) => s.id === 7);
  const below = BELOW.filter((s) => s.owner !== "EEE").concat([{ ...e7, provs: [7, 17], mp: 4000 }, { ...e7, id: 8, provs: [8, 18], mp: 4000 }]);
  const x = run(buildGame({ below }));
  const eee = x.states.filter((s) => s.owner === "EEE");
  rec("the fixture: EEE holds regions E and F, the same category, the same star, and its capital line is the highest new id", eee.length === 2 && eee[0].category === eee[1].category
    && JSON.stringify(eee[0].vps) === JSON.stringify(eee[1].vps) && CAPITAL_LINE.EEE === Math.max(...x.states.map((s) => s.id)), eee.map((s) => [s.id, s.category, s.vps, s.manpower]));
  const rows = eee.map((s) => ({ id: s.id, vp: Math.max(0, ...s.vps), vpSum: sum(s.vps), manpower: s.manpower }));
  const half = sum(below.filter((s) => s.owner === "EEE").map((s) => s.mp)) / 2;
  rec(`⭐⭐ EEE's capital is its most important state ON DISK: the tie at ${half} each broken by 1 person moved to it, not lost on the id`, md.mostImportantState(rows) === CAPITAL_LINE.EEE
    && (rows.find((q) => q.id === CAPITAL_LINE.EEE) || {}).manpower === half + 1 && (rows.find((q) => q.id !== CAPITAL_LINE.EEE) || {}).manpower === half - 1, rows);
  rec("…and EEE still holds its budget", sum(eee.map((s) => s.manpower)) === sum(below.filter((s) => s.owner === "EEE").map((s) => s.mp)), eee.map((s) => s.manpower));
}

console.log("\n=== 21. the owners could not be decided: each country is told what it had no state for ===");
{
  // map-data.js compiled once more with an owner pass that throws, the one way a new state with an owner below is left ownerless
  const Module = require("module");
  const file = path.join(__dirname, "map-data.js"), src = fs.readFileSync(file, "utf8");
  const exp = [...src.matchAll(/^module\.exports[ \t]*=[ \t]*\{/gm)];
  rec("the fixture: map-data.js declares assignGeneratedStateOwners and exports once", exp.length === 1 && /^function assignGeneratedStateOwners\(/m.test(src), exp.length);
  const m = new Module(file, module);
  m.filename = file;
  m.paths = Module._nodeModulePaths(__dirname);
  m._compile(src.slice(0, exp[0].index) + "\nassignGeneratedStateOwners = function () { throw new Error(\"no owners, on purpose\"); };\n" + src.slice(exp[0].index), file);
  const mod = buildMod(), x = m.exports.generateLand(GEN(mod, game)), states = readStates(mod);
  rec("the owner pass threw, and every new state was written with no owner and its own land's people", x.changed === true && states.length === Object.keys(REGIONS).length
    && states.every((s) => !s.owner && s.manpower === r1ManpowerOf(s.provinces)), { error: x.error, owners: states.map((s) => [s.owner, s.manpower]) });
  for (const t of TAGS) {
    // its budget less the carry of the ownerless states on its land (unfloored, as the budget is)
    const left = Math.round(BUDGET[t].mp - carryOf(RAISED, (s) => (s.owner === t ? s.mp : 0)));
    const u = (((x.economy || {}).unplaced) || []).find((q) => q.tag === t);   // a country with nothing left is not listed
    rec(`⭐ ${t}: ${left} of its people had no state to go to — its budget less what the ownerless states on its land hold`, (u ? u.manpower : 0) === left, u);
  }
}

const { lift } = require("./testlib-map-page.js");
const note = require("vm").runInNewContext("(" + lift("function generatedIndustryNote(") + ")");

console.log("\n=== 23. the world below still loads: Generate land adds land to it, and each new state holds its own land's ===");
{
  // the same world on Nova's own New-mod descriptor (no replace_path): every state below loads, on provinces the mod made sea
  const x = run(game, {}, [], { replacePath: false }), land = run(game, { economy: "land" }, [], { replacePath: false });
  const byKey = new Map(x.states.map((s) => [s.key, s])), eco = x.r.economy || {};
  const loading = BELOW.filter((s) => s.provs.length).length;
  rec("CONTROL: every country has a state below, so where they load each holds its whole budget already", TAGS.every((t) => BELOW.some((s) => s.owner === t)));
  rec("the world was generated, one state per region, each owned as the manifest says", x.r.changed === true && x.states.length === Object.keys(REGIONS).length
    && Object.entries(REGIONS).every(([reg, provs]) => (byKey.get(keyOf(provs)) || {}).owner === ownerOfRegion[reg]), x.r.error || x.states.map((s) => [s.key, s.owner]));
  rec(`⭐⭐ the report says each state kept its own land's, because the ${loading} states of the world below still load`, eco.mode === "land" && eco.belowLoads === loading && !eco.error, eco);
  for (const [reg, provs] of Object.entries(REGIONS)) {
    const s = byKey.get(keyOf(provs)) || {};
    rec(`⭐ ${reg}: manpower Σ floor(manpower ÷ provinces) of its own land (${r1ManpowerOf(provs)}), resources likewise, infrastructure 2`,
      s.manpower === r1ManpowerOf(provs) && JSON.stringify(s.res, Object.keys(s.res || {}).sort()) === JSON.stringify(r1ResourcesOf(provs), Object.keys(r1ResourcesOf(provs)).sort())
      && (s.keys || {}).infrastructure === 2, s && { mp: s.manpower, res: s.res, keys: s.keys });
  }
  const hollow = Object.entries(REGIONS).filter(([, provs]) => !provs.some((p) => belowOf.has(p)));
  rec("CONTROL: the fixture has regions raised from open sea, which held nothing below", hollow.length > 0, hollow.map(([reg]) => reg));
  rec("⭐⭐ …each holds the 10,000 people a state nothing below describes always got, not 1", hollow.every(([, provs]) => (byKey.get(keyOf(provs)) || {}).manpower === r1ManpowerOf(provs) && r1ManpowerOf(provs) > 1),
    hollow.map(([reg, provs]) => [reg, (byKey.get(keyOf(provs)) || {}).manpower]));
  const text = (y) => JSON.stringify(y.states.map((s) => s.text.replace(/\r/g, "")).sort());
  rec("⭐ byte-identical to economy \"land\" on the same mod", x.states.length > 0 && text(x) === text(land), land.r.economy);
  rec("CONTROL: with replace_path the same click keeps each country's 1936 economy, and writes other states", (runs[0].r.economy || {}).mode === "country" && text(runs[0]) !== text(x));
  const said = note(x.r);
  rec("⭐⭐ the page says the world underneath still loads, and that the new states hold their own land's",
    said.includes(`The world underneath still loads — ${loading.toLocaleString()} of its states —`) && /new states hold what their own land held/.test(said), said);
  rec("⭐ …and nothing of a 1936 economy kept (\"0 of the 0 levels it had\")", !/1936/.test(said) && !/0 of the 0/.test(said), said);
}

console.log("\n=== 13. the page says it ===");
{
  const res = runs[0].r, said = note(res), eco = res.economy || {};
  rec("⭐⭐ under R3 it says each country kept its 1936 economy, with what was placed of what they had, people and resources",
    /1936 economy/.test(said) && said.includes(`${(eco.shared || {}).written} of the ${(eco.shared || {}).budget}`) && said.includes(Number((eco.manpower || {}).written).toLocaleString()), said);
  rec("⭐⭐ …and NOT that the states hold what their provinces held below", !/what those provinces held/.test(said), said);
  rec("…nor that the world underneath still loads (it does not: replace_path)", !/still loads/.test(said) && eco.belowLoads == null, said);
  rec("⭐ …and names the country short of land, with its slots and its need", /⚠[^⚠]*less land than[^⚠]*BBB has room for 4 of 16 on 1 state/.test(said), said);
  const none = note({ ...res, economy: { ...res.economy, short: [] } });
  rec("with nobody short it warns of nothing about land", /1936 economy/.test(none) && !/less land/.test(none), none);
  const err = note({ ...res, economy: { mode: "country", error: "boom" } });
  rec("⭐ a failure is said with its reason, and that the land's own industry stands instead", /⚠[^⚠]*boom[^⚠]*land's own industry instead/.test(err) && /Carried the industry of the land it raised/.test(err), err);
  const big = eco.largest || {};
  rec("CONTROL: the largest state written holds more people than any state below", big.manpower > big.below, big);
  rec("⭐ …and the page names it, with the largest below", said.includes(`Its largest state, ${big.id} (${big.tag}), holds ${Number(big.manpower).toLocaleString()} people`)
    && said.includes(`(${Number(big.below).toLocaleString()})`), said);
  rec("…and says nothing of it when it is no larger", !/largest state/.test(note({ ...res, economy: { ...eco, largest: { ...big, below: big.manpower } } })));
  const r1 = note(land.r);
  rec("under economy \"land\" it says what the land carried, as before, and nothing of 1936", /Carried the industry of the land it raised/.test(r1) && !/1936/.test(r1) && !/largest state/.test(r1), r1);
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}   // scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1)
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
