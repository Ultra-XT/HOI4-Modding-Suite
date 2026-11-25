// ⛔ #an-air-base-holds-the-planes-it-starts-with — A GENERATED STATE'S AIR BASE IS THE AIRFIELD THAT STOOD ON ITS LAND, ROOM FOR THE
// PLANES THAT START IN IT, AND NONE WHERE NOTHING ASKS FOR ONE.
//
// Generate land wrote `air_base = 1` into every state it made: TEST 32's 1,081 of 1,081, where vanilla gives 750 of its 1,081 states
// none and the rest 1–10. 14 of its states started 620 planes over capacity, Germany housed 2,000 planes where vanilla gives it room
// for 9,400, and the map drew an airfield in every state. Now a state's level is the largest of
//   · the undated air base of every state below whose map/buildings.txt air_base row stands on its land (the airfield itself);
//   · 1, where any air_wings block in any history/units file — started or not — keys its id (the crash guard it replaces);
//   · ⌈planes / AIRBASE_CAPACITY_MULT⌉ for the planes the started orders of battle base in it — at the id their file names, AND where
//     Auto-fix's repair will move a wing it moves (fixAirWingsBasedAbroad), so the world has room both before and after the repair;
// capped at the air base's state_max.
//
// Pinned over a base game whose defines say 50 planes a level and whose air base stops at level 5, under a Delete-map'd world that
// raises its states one for one (a strategic region each). Its state ids are not the generated world's (101 and up below, from 1
// here), so the ids the orders of battle name are learned from a first Generate land over the same base game — it is
// deterministic — and checked to be the same in the run under test. Every expected number is computed from the fixture's files.
// Two more base games ask what the first cannot:
//   · "spill" — a second CCC wing its nearest state cannot hold even at the state_max: it is sized where the repair spills it
//     (#a-full-air-base-spills-where-it-was-sized), so after Auto-fix no state is over that was not over before it;
//   · "home"  — the ids below ARE the generated ones, and the state below at the wing's id stood on the land CCC's far state now
//     holds: Generate land gives that land that id under CCC (#a-generated-state-keeps-its-countrys-id), so the wing is home and
//     Auto-fix copies nothing in;
//   · "short" — CCC holds a third state below, the wing's, on land that cannot rise, so its id goes to AAA's land and the wing must
//     move: the repair measures "nearest" from the land the file's author meant, so the sizing must too (from the generated state's
//     own centre, it sized the other one). This was "ids" until the renumbering, which keeps it reachable only for a short country.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-air-base-carry-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 400) : "")); }
};
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}

// ── the world: a character a cell of 8 x 8 px. A digit or letter is a state below; "L" is land of state "7" below that stays sea
// (in no strategic region, so it cannot rise); "~" is sea everywhere. "W" is sea too, except in the "short" base game, where it is
// the land of CCC's third state below, W — in no strategic region either, so CCC has two states here for three ids. ─────────────
const MAP = [
  "~112233~",
  "~445566~",
  "~77L~CC~",
  "~88WWDD~",
];
const COLS = MAP[0].length, ROWS = MAP.length, CELL = 8, W = COLS * CELL, H = ROWS * CELL;
const idAt = (c, r) => r * COLS + c + 1;
const colour = (id) => [id & 255, 50 + (id >> 8), 77];
const cells = [];
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) cells.push({ c, r, id: idAt(c, r), k: MAP[r][c] });
const BELOW = {   // the states below: id, owner, what stands in their history
  1: { id: 101, tag: "AAA", air: 4 },                    // an airfield that rises with its land
  2: { id: 102, tag: "AAA" },                             // AAA's orders of battle base 120 planes here
  3: { id: 103, tag: "AAA" },                             // …and 400 here, more than the air base can hold
  4: { id: 104, tag: "AAA" },                             // named only by an order of battle no country starts
  5: { id: 105, tag: "AAA" },                             // nothing at all
  6: { id: 106, tag: "AAA" },                             // CCC's 150-plane wing is based here, in AAA's state
  7: { id: 107, tag: "BBB", air: 3, lost: true },         // an airfield on the province that stays sea
  8: { id: 108, tag: "AAA", air1939: 6 },                 // an air base only its 1939 history builds
  C: { id: 109, tag: "CCC" },                             // CCC's state nearest that wing
  D: { id: 110, tag: "CCC" },                             // CCC's other state, further off
};
const provsOf = (k) => cells.filter((x) => x.k === k || (k === "7" && x.k === "L")).map((x) => x.id);
const risesOf = (k) => cells.filter((x) => x.k === k).map((x) => x.id);
const LOST = cells.find((x) => x.k === "L").id;
const MULT = 50, STATE_MAX = 5;
const PROVINCES_BMP = bmp24(W, H, (x, y) => colour(idAt(Math.floor(x / CELL), Math.floor(y / CELL))));
const cellOf = (pid) => cells.find((x) => x.id === pid);
// a building row on a province: x, then z counted from the bottom, half a cell in
const rowOn = (stateId, pid) => { const x = cellOf(pid); return `${stateId};air_base;${(x.c * CELL + 4).toFixed(2)};10.00;${(H - 1 - (x.r * CELL + 4)).toFixed(2)};0.00;0`; };

function makeGame(tag, { carryD = 0, ids = null, w = null } = {}) {
  const g = path.join(ROOT, tag);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", PROVINCES_BMP);
  const sea = (k) => k === "~" || (k === "W" && w == null);
  write(g, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(cells.map((x) => `${x.id};${colour(x.id).join(";")};${sea(x.k) ? "sea;false;ocean;0" : "land;false;plains;1"}`)).join("\n") + "\n");
  const rows = [];
  if (w != null) {   // `w`: the id of CCC's third state below, on the "W" cells
    write(g, `history/states/${w}-S.txt`, `state={\n\tid=${w}\n\tname="STATE_${w}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${cells.filter((x) => x.k === "W").map((x) => x.id).join(" ")} }\n\thistory={\n\t\towner=CCC\n\t}\n}\n`);
    rows.push(rowOn(w, cells.find((x) => x.k === "W").id));
  }
  for (const [k, s] of Object.entries(BELOW)) {
    const air = k === "D" ? carryD : s.air || 0;
    const id = ids ? ids[k] : s.id;   // `ids`: the state below on key k's land gets this id instead
    const hist = `\t\towner=${s.tag}\n${air ? `\t\tbuildings = {\n\t\t\tair_base = ${air}\n\t\t}\n` : ""}${s.air1939 ? `\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tair_base = ${s.air1939}\n\t\t\t}\n\t\t}\n` : ""}`;
    write(g, `history/states/${id}-S.txt`, `state={\n\tid=${id}\n\tname="STATE_${id}"\n\tmanpower=1000\n\tstate_category=rural\n\tprovinces={ ${provsOf(k).join(" ")} }\n\thistory={\n${hist}\t}\n}\n`);
    // every state's air_base row, as a shipping map gives every state one: on the lost province for 7, else the first that rises
    rows.push(rowOn(id, s.lost ? LOST : risesOf(k)[0]));
  }
  write(g, "map/buildings.txt", rows.join("\n") + "\n");
  write(g, "common/defines/00_defines.lua", `NDefines = {\nNAir = {\n\tAIRBASE_CAPACITY_MULT = ${MULT},\t-- Each level of airbase building multiplied by this, gives capacity\n},\n}\n`);
  write(g, "common/buildings/00_buildings.txt", `buildings = {\n\tair_base = {\n\t\tbase_cost = 1000\n\t\tlevel_cap = {\n\t\t\tstate_max = ${STATE_MAX}\n\t\t}\n\t\tshow_on_map = 1\n\t}\n}\n`);
  for (const t of ["AAA", "BBB", "CCC"]) write(g, `history/countries/${t} - ${t}.txt`, `${t === "BBB" ? "" : `set_air_oob = "${t}_air"\n`}`);
  return g;
}
function makeSeaMod(tag) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", 'name="air bases"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", PROVINCES_BMP);
  write(m, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(cells.map((x) => `${x.id};${colour(x.id).join(";")};sea;false;ocean;0`)).join("\n") + "\n");
  Object.keys(BELOW).forEach((k, i) => write(m, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${risesOf(k).join(" ")} }\n\tweather={}\n}\n`));
  write(m, "map/supply_nodes.txt", ""); write(m, "map/railways.txt", "");
  fs.mkdirSync(path.join(m, "history", "states"), { recursive: true });
  return m;
}
const LAND = Object.keys(BELOW).reduce((n, k) => n + risesOf(k).length, 0);
const generate = (game, mod) => md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: LAND, provincesPerState: 8, seed: 1, ownerMode: "inherit", roughenCoast: false });
const statesOf = (m) => fs.readdirSync(path.join(m, "history", "states")).map((f) => {
  const t = fs.readFileSync(path.join(m, "history", "states", f), "utf8"), b = (/buildings\s*=\s*\{([^{}]*)/.exec(t) || [])[1] || "";
  return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], owner: (/\bowner\s*=\s*(\w+)/.exec(t) || [])[1] || "",
    provinces: ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number), airBase: /\bair_base\s*=/.test(b) ? +(/\bair_base\s*=\s*(\d+)/.exec(b) || [])[1] : 0 };
});
const wing = (id, planes, name) => `\t${id} = {\n\t\tname = "${name}"\n\t\tfighter_equipment_0 = {\n\t\t\towner = "X"\n\t\t\tamount = ${planes}\n\t\t}\n\t}\n`;
const SPILL = 150;   // "spill": CCC's second wing abroad, in AAA's state 5 — C cannot hold it beside the other two at the state_max
function addOrdersOfBattle(g, gid, { spill = false } = {}) {
  write(g, "history/units/AAA_air.txt", `air_wings = {\n${wing(gid["2"], 120, "A1")}${wing(gid["3"], 400, "A2")}}\n`);
  write(g, "history/units/CCC_air.txt", `air_wings = {\n${wing(gid["6"], 150, "C1")}${wing(gid.C, 40, "C2")}${spill ? wing(gid["5"], SPILL, "C3") : ""}}\n`);
  write(g, "history/units/ZZZ_event_air.txt", `air_wings = {\n${wing(gid["4"], 10, "Z1")}}\n`);   // no country history starts it
}
/** the planes the two started orders of battle base in each state — the mod's copy of a file over the base game's — and the
 *  states that holds more than their air base has room for */
function census(mod, game) {
  const level = new Map(statesOf(mod).map((s) => [s.id, s.airBase])), load = new Map();
  for (const f of ["AAA_air.txt", "CCC_air.txt"]) {
    const file = fs.existsSync(path.join(mod, "history", "units", f)) ? path.join(mod, "history", "units", f) : path.join(game, "history", "units", f);
    for (const m of fs.readFileSync(file, "utf8").matchAll(/^\s*(\d+) = \{[^}]*?amount = (\d+)/gm)) load.set(+m[1], (load.get(+m[1]) || 0) + +m[2]);
  }
  return { load, over: [...load].filter(([id, n]) => n > MULT * (level.get(id) || 0)).map(([id]) => id).sort((a, b) => a - b) };
}
/** the state an air_wings key in the mod's copy of `file` names, by the wing's name */
const keyOf = (mod, file, name) => { const t = fs.readFileSync(path.join(mod, "history", "units", file), "utf8"); return +((new RegExp(`^\\s*(\\d+) = \\{[^}]*?name = "${name}"`, "m").exec(t) || [])[1]); };
/** generated id by the key of the state below whose land it holds */
const idsByKey = (m) => { const out = {}; for (const s of statesOf(m)) for (const [k] of Object.entries(BELOW)) if (risesOf(k).every((p) => s.provinces.includes(p))) out[k] = s.id; return out; };
const centre = (provs) => { let x = 0, y = 0; for (const p of provs) { const c = cellOf(p); x += c.c; y += c.r; } return { x: x / provs.length, y: y / provs.length }; };

/** build a world over a base game, learning its ids first; returns everything a check needs */
function scenario(tag, opts) {
  const g = makeGame("game-" + tag, opts);
  const gid = idsByKey((generate(g, makeSeaMod("probe-" + tag)), path.join(ROOT, "probe-" + tag)));
  addOrdersOfBattle(g, Object.assign({}, gid, (opts && opts.oobIds) || {}), opts);   // `oobIds`: a key the orders of battle name by another id
  const m = makeSeaMod("mod-" + tag), r = generate(g, m);
  return { g, m, r, gid, again: idsByKey(m), states: statesOf(m) };
}

const S = scenario("main");
const byKey = (k) => S.states.find((s) => s.id === S.gid[k]) || { airBase: -1 };
console.log("\n-- the fixture --");
{
  ok(S.r && S.r.changed && Object.keys(S.gid).length === Object.keys(BELOW).length && JSON.stringify(S.again) === JSON.stringify(S.gid),
    "(Generate land raised one state for each state below, with the same ids as the first run over the same base game)", S.r && (S.r.error || { first: S.gid, again: S.again }));
  ok(Object.values(BELOW).every((s) => !Object.values(S.gid).includes(s.id)), "(the ids below are not the generated world's: no wing is excused as one the world beneath already based there)");
  ok(S.states.every((s) => s.owner === BELOW[Object.keys(S.gid).find((k) => S.gid[k] === s.id)].tag), "(each state kept its owner below)", S.states.map((s) => [s.id, s.owner]));
  const wanted = Math.ceil(400 / MULT);
  ok(wanted > STATE_MAX && Math.ceil(120 / MULT) < STATE_MAX && BELOW["1"].air < STATE_MAX, `(400 planes want ${wanted} levels, past the state_max of ${STATE_MAX}; 120 and the carried airfield do not)`);
}

console.log("\n-- ⭐ the levels --");
{
  ok(byKey("1").airBase === BELOW["1"].air, `⭐⭐⭐ (1) the airfield below stands on land that rose: its state carries it, level ${BELOW["1"].air}`, byKey("1"));
  ok(S.r.airBases && S.r.airBases.lostAirfields === 1 && byKey("7").airBase === 0, "⭐⭐ (2) the one on the province that stayed sea is reported, never invented in the land that did rise", { report: S.r.airBases, state: byKey("7") });
  ok(byKey("2").airBase === Math.ceil(120 / MULT), `⭐⭐⭐ (3) 120 planes at the AIRBASE_CAPACITY_MULT of ${MULT}: ${Math.ceil(120 / MULT)} levels, room for them`, byKey("2"));
  ok(byKey("3").airBase === STATE_MAX && (S.r.airBases.capped || []).join() === String(S.gid["3"]), `…400 planes want ${Math.ceil(400 / MULT)}: written at the state_max ${STATE_MAX} and named in capped`, { state: byKey("3"), capped: S.r.airBases.capped });
  ok(byKey("4").airBase === 1, "⭐⭐ (4) a state an order of battle names, though no country starts it, has an air base", byKey("4"));
  const rows = fs.readFileSync(path.join(S.m, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 7);
  ok(byKey("5").airBase === 0 && rows.filter((c) => +c[0] === S.gid["5"] && c[1] === "air_base").length === 1, "⭐⭐⭐ (5) a state nothing names, carries or needs has no air base — but still its one air_base position", byKey("5"));
  ok(byKey("8").airBase === 0, "⭐⭐ (7) an air base its history builds only in 1939 is not carried into a 1936 start", byKey("8"));
  ok(S.states.filter((s) => s.airBase > 0).every((s) => rows.some((c) => +c[0] === s.id && c[1] === "air_base")), "(8) every state that declares an air base has its position in map/buildings.txt");
  const airProblems = (md.validateMapModel(md.buildMapModel({ modRoot: S.m, gameRoot: S.g, dependencyRoots: [] })) || []).filter((p) => /air/i.test(p.rule) && p.rule !== "air_wing_based_abroad");
  ok(airProblems.length === 0, "…and Map Errors reports no air-base problem (a wing based abroad is Auto-fix's, below)", airProblems.map((p) => p.rule));
  const levels = S.states.reduce((a, s) => a + s.airBase, 0);
  ok(S.r.airBases.levels === levels && S.r.airBases.states === S.states.filter((s) => s.airBase > 0).length && S.r.airBases.carried === 1 && S.r.airBases.named === 5,
    "the report counts the levels and states written, the one carried, and the five states an air_wings block names", S.r.airBases);
}

console.log("\n-- ⭐ the wing in another country's state: room where it is, and where Auto-fix sends it --");
const X = S.gid["6"], nearest = ["C", "D"].sort((a, b) => { const c6 = centre(risesOf("6")), d = (k) => (centre(risesOf(k)).x - c6.x) ** 2 + (centre(risesOf(k)).y - c6.y) ** 2; return d(a) - d(b); })[0];
{
  ok(nearest === "C", "(the fixture: CCC's state C is nearer the wing's state than D)");
  ok(byKey("6").airBase >= Math.ceil(150 / MULT), `⭐⭐⭐ (6) CCC's 150 planes have room in AAA's state ${X}, where their file names them — before Auto-fix runs`, byKey("6"));
  ok(byKey(nearest).airBase >= Math.ceil((40 + 150) / MULT), `⭐⭐⭐ (9) …and CCC's nearest own state has room for its own 40 and the 150 Auto-fix will move there`, byKey(nearest));
  ok(S.r.airBases.movedInPlanes === 150, "the report says 150 planes were sized for where Auto-fix will move them", S.r.airBases.movedInPlanes);
  // (10) Auto-fix on a copy: the repair moves the wing home, and nothing is over capacity
  const copy = path.join(ROOT, "mod-main-fixed");
  fs.cpSync(S.m, copy, { recursive: true });
  const fx = (md.autoFixMap({ modRoot: copy, gameRoot: S.g, dependencyRoots: [] }) || {}).fixes || {};
  const ccc = fs.readFileSync(path.join(copy, "history", "units", "CCC_air.txt"), "utf8");
  ok(fx.airWingsAbroad && fx.airWingsAbroad.moved === 1 && new RegExp(`^\\s*${S.gid[nearest]} = \\{`, "m").test(ccc) && !new RegExp(`^\\s*${X} = \\{`, "m").test(ccc),
    `⭐⭐ (10) Auto-fix moves CCC's wing to state ${S.gid[nearest]}, its nearest`, fx.airWingsAbroad);
  const after = statesOf(copy), level = new Map(after.map((s) => [s.id, s.airBase]));
  const load = new Map();
  for (const f of ["AAA_air.txt", "CCC_air.txt"]) {
    const file = fs.existsSync(path.join(copy, "history", "units", f)) ? path.join(copy, "history", "units", f) : path.join(S.g, "history", "units", f);
    for (const m of fs.readFileSync(file, "utf8").matchAll(/^\s*(\d+) = \{[^}]*?amount = (\d+)/gm)) load.set(+m[1], (load.get(+m[1]) || 0) + +m[2]);
  }
  const over = [...load].filter(([id, n]) => n > MULT * (level.get(id) || 0)).map(([id]) => id);
  ok(load.size >= 3 && over.join() === (S.r.airBases.capped || []).join(), "⭐⭐⭐ …and after it no state holds more planes than its air base has room for, but the one past the state_max (capped)", { over, capped: S.r.airBases.capped, load: [...load] });
}

console.log("\n-- ⭐ when CCC's other state already carries room for all its planes --");
{
  // The shape a country-wide top-up missed: CCC's far state carries a large airfield, so CCC's own capacity already meets every
  // plane it has, and nothing was added at the nearest state — where the repair then sends the wing.
  const T = scenario("carried", { carryD: STATE_MAX });
  const s = (k) => T.states.find((x) => x.id === T.gid[k]) || { airBase: -1 };
  ok(s("D").airBase === STATE_MAX && MULT * STATE_MAX >= 150 + 40, "(the fixture: CCC's far state carries an airfield with room for all of CCC's planes)", s("D"));
  ok(s(nearest).airBase >= Math.ceil((40 + 150) / MULT), "⭐⭐ (11) its nearest state still has room for the wing the repair moves there", s(nearest));
}

console.log("\n-- ⭐ #a-full-air-base-spills-where-it-was-sized: a wing the nearest state cannot hold at the state_max --");
{
  // CCC's second wing abroad, in AAA's state 5, is also nearest C — but C, holding its own 40 and the 150 from state 6, has no room
  // for it even at the state_max. The repair is room-first and spills it into D; sized as if room were endless, C was capped at the
  // state_max with all of it and D got none, so the repair, finding no room anywhere, left C over — though D could have held it.
  const T = scenario("spill", { spill: true });
  const s = (k) => T.states.find((x) => x.id === T.gid[k]) || { airBase: -1 };
  const c5 = centre(risesOf("5")), d2 = (k) => (centre(risesOf(k)).x - c5.x) ** 2 + (centre(risesOf(k)).y - c5.y) ** 2;
  ok(JSON.stringify(T.again) === JSON.stringify(T.gid) && d2("C") < d2("D") && 40 + 150 <= MULT * STATE_MAX && 40 + 150 + SPILL > MULT * STATE_MAX && SPILL <= MULT * STATE_MAX,
    `(the fixture: C is CCC's nearest state to state 5 too; it holds 40 + 150 within the state_max's ${MULT * STATE_MAX} planes, not ${SPILL} more)`, { d: [d2("C"), d2("D")] });
  ok(s("D").airBase === Math.ceil(SPILL / MULT), `⭐⭐⭐ (12) D has room for the ${SPILL} planes the repair will spill there: level ${Math.ceil(SPILL / MULT)}`, { D: s("D"), report: T.r.airBases });
  ok(s("C").airBase === Math.ceil((40 + 150) / MULT) && (T.r.airBases.capped || []).join() === String(T.gid["3"]),
    `⭐⭐ …and C is sized for what it can hold, level ${Math.ceil((40 + 150) / MULT)} — not named past the state_max: only AAA's own 400 is`, { C: s("C"), capped: T.r.airBases.capped });
  const before = census(T.m, T.g).over;
  const copy = path.join(ROOT, "mod-spill-fixed");
  fs.cpSync(T.m, copy, { recursive: true });
  const fx = (md.autoFixMap({ modRoot: copy, gameRoot: T.g, dependencyRoots: [] }) || {}).fixes || {};
  ok(fx.airWingsAbroad && fx.airWingsAbroad.moved === 2 && keyOf(copy, "CCC_air.txt", "C1") === T.gid.C && keyOf(copy, "CCC_air.txt", "C3") === T.gid.D,
    `⭐⭐ Auto-fix moves both: state 6's wing to C, and state 5's on to D, where the room for it was left`, { fix: fx.airWingsAbroad, C1: keyOf(copy, "CCC_air.txt", "C1"), C3: keyOf(copy, "CCC_air.txt", "C3") });
  const after = census(copy, T.g);
  ok(before.join() === String(T.gid["3"]) && after.over.join() === before.join(),
    "⭐⭐⭐ (13) after Auto-fix no state holds more planes than its air base has room for that did not before it — the room for the spill was left where it landed", { before, after: after.over, load: [...after.load] });
}

console.log("\n-- ⭐ the ids below are the generated ones: the renumbering keeps the wing home, and nothing is copied --");
{
  // ⚠️ MOVED with #a-generated-state-keeps-its-countrys-id: this was the "ids" scenario — the base game's state at the wing's id,
  // gid["6"], stood on the land CCC's far state D now holds — and in cut order AAA's state took that id, so the wing was abroad.
  // Generate land now gives every state the id its land held below under its own country: CCC's state on D's land takes gid["6"], the
  // wing's file names CCC's own state, and nothing moves. The sizing leaves room at that id, and Auto-fix copies nothing in.
  const ids = Object.fromEntries(Object.keys(BELOW).map((k) => [k, S.gid[k === "6" ? "D" : k === "D" ? "6" : k]]));
  const T = scenario("home", { ids, oobIds: { 6: ids.D } });   // the wing keyed to the id that stood on D's land below, as before
  const onLand = (k) => T.states.find((x) => risesOf(k).every((p) => x.provinces.includes(p))) || { id: -1, airBase: -1 };
  ok(Object.keys(BELOW).every((k) => onLand(k).id === ids[k] && onLand(k).owner === BELOW[k].tag) && JSON.stringify(T.again) === JSON.stringify(T.gid),
    "(the fixture: every state rose under the id its land held below, under its own country — CCC's state on D's land holds the wing's id)", { ids, onDisk: Object.fromEntries(Object.keys(BELOW).map((k) => [k, onLand(k).id])) });
  ok(onLand("D").airBase >= Math.ceil(150 / MULT) && T.r.airBases.movedInPlanes === 0, `⭐⭐ the 150 planes have room where their file names them — CCC's own state — and none is sized as moving`, { D: onLand("D"), report: T.r.airBases });
  const copy = path.join(ROOT, "mod-home-fixed");
  fs.cpSync(T.m, copy, { recursive: true });
  const fx = (md.autoFixMap({ modRoot: copy, gameRoot: T.g, dependencyRoots: [] }) || {}).fixes || {};
  ok(!(fx.airWingsAbroad && fx.airWingsAbroad.moved) && !fs.existsSync(path.join(copy, "history", "units", "CCC_air.txt")), "⭐⭐⭐ …and Auto-fix moves no wing and copies no order of battle into the mod", fx.airWingsAbroad);
}

console.log("\n-- ⭐ a SHORT country's wing moves: nearest to the land the wing's file meant, not to the state now at its id --");
{
  // ⚠️ MOVED with #a-generated-state-keeps-its-countrys-id (critic P6): the scenario the renumbering keeps reachable in the page's own
  // mode. CCC holds three states below — C, D and W, the wing's — and two here: W's land cannot rise. AAA's state 6 is numbered past
  // the world's last id below, so its land takes the id left over, W's: the wing's id now names AAA's state on 6's land, and the wing
  // must move. The repair ranks CCC's states from the land its file meant — W's, beside D — so that is where the sizing must leave room;
  // ranked from the generated state at its id, on 6's land, C is nearer, and an air base sized there leaves D, where the repair sends
  // the wing, with none. (vanilla's 1939 JAP wing in Manchukuo's 716 on a 60% world, the critic measured: a short Japan.)
  const ids = Object.assign({}, S.gid, { 6: Object.keys(BELOW).length + 1 });
  const W_ID = S.gid["6"];
  const T = scenario("short", { ids, w: W_ID });
  const onLand = (k) => T.states.find((x) => risesOf(k).every((p) => x.provinces.includes(p))) || { id: -1, airBase: -1 };
  const wCells = cells.filter((x) => x.k === "W").map((x) => x.id);
  const from = (provs, k) => { const a = centre(provs), b = centre(risesOf(k)); return (b.x - a.x) ** 2 + (b.y - a.y) ** 2; };
  ok(T.r && T.r.changed && onLand("6").id === W_ID && onLand("6").owner === "AAA" && onLand("C").id === S.gid.C && onLand("D").id === S.gid.D
    && T.states.every((s) => !s.provinces.some((p) => wCells.includes(p))) && from(wCells, "D") < from(wCells, "C") && from(risesOf("6"), "C") < from(risesOf("6"), "D"),
    "(the fixture: W's land did not rise; its id went to AAA's state on 6's land; from W's land D is CCC's nearer state, from 6's C)", { error: T.r && T.r.error, gid: T.gid });
  ok(onLand("D").airBase >= Math.ceil(150 / MULT) && onLand("C").airBase === Math.ceil(40 / MULT) && T.r.airBases.movedInPlanes === 150,
    `⭐⭐⭐ (14) D — CCC's nearest state to the land the wing's file meant — has room for its 150 planes; C only for its own 40`, { C: onLand("C"), D: onLand("D"), report: T.r.airBases });
  const copy = path.join(ROOT, "mod-short-fixed");
  fs.cpSync(T.m, copy, { recursive: true });
  const fx = (md.autoFixMap({ modRoot: copy, gameRoot: T.g, dependencyRoots: [] }) || {}).fixes || {};
  const after = fs.existsSync(path.join(copy, "history", "units", "CCC_air.txt")) ? census(copy, T.g) : { over: ["no copy"] };
  ok(fx.airWingsAbroad && fx.airWingsAbroad.moved === 1 && fs.existsSync(path.join(copy, "history", "units", "CCC_air.txt")) && keyOf(copy, "CCC_air.txt", "C1") === onLand("D").id && !after.over.includes(onLand("D").id),
    `⭐⭐⭐ (15) Auto-fix moves the wing to D, with room there`, { fix: fx.airWingsAbroad, over: after.over });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
