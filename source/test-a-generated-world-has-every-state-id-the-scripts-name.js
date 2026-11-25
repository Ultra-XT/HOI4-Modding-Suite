// ⛔ #a-generated-world-has-every-state-id-the-scripts-name — GENERATE LAND MAKES EVERY STATE ID THE SCRIPTS BELOW NAME, ITSELF.
//
// A rebuilt world replaces history/states and still loads the base game's focuses, decisions, events and AI plans, which name
// states by id up to 1,081. Auto-fix's fixStateIdFloor closes the gap by splitting the largest states (#a-world-keeps-the-base-
// games-state-ids) — AFTER Generate land has run. So a state it made was never in Generate land's loop, the one writer that gives
// a state its victory point, its air base, its place in the city pass and its supply hub. TEST 31 (played 09-30) had 249
// such states of 1,081: no city, no air base, no hub — three megalopolis stars among them — and the owner's error.log says
// "State 849 has no air base" and "State 1036 has no air base". He saw stars with nothing at them.
//
// Now Generate land asks the floor's own question before it writes a state (stateIdCeilingScriptsName — the highest id the
// loaded scripts name, no higher than the layers below declare one) and, while its last id is short of that, halves the group
// with the most provinces (contiguousHalf — the floor's own walk, ONE helper for both). Every state is then the one writer's,
// and the floor finds nothing to do on a fresh world; it stays as the repair for every other world.
//
// Pinned on a base game of eight `city` states whose event names state 8, under a Delete-map'd world of four strategic regions,
// each a row of eight provinces — four states as the regions fall, eight once the scripts are asked. Every expected number is
// derived from the fixture (the unhalved world is generated over the same base game with the event naming nothing past it).
//
// From the review of that change, further down: a cut leaves BOTH pieces whole where one can (#a-cut-leaves-both-halves-whole —
// sections 5 and 6), land a world already has counts toward reaching the ceiling (section 4), and the page says which ids
// Generate land could not make instead of printing a plain success (section 7).
//
// ⚠️ MOVED with #an-air-base-holds-the-planes-it-starts-with: "furnished" said `air_base = 1` in every state, which is what
// Generate land wrote. It now writes each state the air base something asks for — an airfield below, an air_wings block naming
// its id, room for the planes started there — and none where nothing does (vanilla gives 750 of its 1,081 states none). So the
// base game here carries an order of battle basing a wing in every state it declares but the last, and "furnished" is the level
// that order asks for; the last is the state nothing names, which has no air base and still its one air_base POSITION row.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-every-state-id-"));
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
function bmp8(W, H, fn) {
  const rs = Math.floor((8 * W + 31) / 32) * 4, off = 54 + 1024, b = Buffer.alloc(off + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(off, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(8, 28); b.writeUInt32LE(rs * H, 34); b.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { b[54 + i * 4] = i; b[54 + i * 4 + 1] = i; b[54 + i * 4 + 2] = i; }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) b[off + (H - 1 - y) * rs + x] = fn(x, y);
  return b;
}

// ── the world: 9 x 4 provinces of 12 x 12 px, id = row * 9 + col + 1 ─────────────────────────────────────────────────────────
//   layer below   columns 0-7 are land: EIGHT states, one a column (four provinces each, ids 1..8), every one `city` with one
//                 urban province carrying a 40 px core of city ground. Column 8 is sea — it keeps the rows from joining up round
//                 the map's wrap seam, so a row of eight is a LINE and a careless cut can leave it in two pieces.
//   the mod       the same shapes, all sea (what Delete map leaves); a strategic region is a row of the eight old-land provinces.
const CELL = 12, COLS = 9, ROWS = 4, LAND_COLS = 8, W = COLS * CELL, H = ROWS * CELL;
const SPAWN = 13, PLAINS = 0, OCEAN = 15, CORE_BELOW = 40;
const idAt = (c, r) => r * COLS + c + 1;
const cellOfId = (id) => [(id - 1) % COLS, Math.floor((id - 1) / COLS)];
const provAt = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
const belowLand = (id) => cellOfId(id)[0] < LAND_COLS;
const BELOW_STATES = Array.from({ length: LAND_COLS }, (_, c) => ({ id: c + 1, provinces: Array.from({ length: ROWS }, (_, r) => idAt(c, r)), urban: idAt(c, c % ROWS) }));
const BELOW_URBAN = new Set(BELOW_STATES.map((s) => s.urban));
const inBelowCore = (x, y) => { const lx = x % CELL, ly = y % CELL; return lx >= 2 && lx < 10 && ly >= 4 && ly < 9; };   // 8 x 5 = 40 px
const MANPOWER_BELOW = 8000, VP_BELOW = 3;
const ROW_REGIONS = Array.from({ length: ROWS }, (_, r) => Array.from({ length: LAND_COLS }, (_, c) => idAt(c, r)));
const touching = (a, b) => { const [ca, ra] = cellOfId(a), [cb, rb] = cellOfId(b); return Math.abs(ca - cb) + Math.abs(ra - rb) === 1; };
const onePiece = (provs) => { const seen = new Set([provs[0]]), q = [provs[0]]; while (q.length) { const u = q.shift(); for (const v of provs) if (!seen.has(v) && touching(u, v)) { seen.add(v); q.push(v); } } return seen.size === provs.length; };
const regionOf = (p) => ROW_REGIONS.findIndex((ids) => ids.includes(p));
// the base game's air wings: one in every state it declares but the last, planes growing with the id so some need more than one
// level; the last state is named by no air_wings block, stands on no airfield below and has no planes to hold
const MULT = 100;   // the fixture's own AIRBASE_CAPACITY_MULT (makeGame writes it), not the game's
const WINGS = new Map(BELOW_STATES.slice(0, -1).map((s) => [s.id, 70 * s.id]));   // state id → planes
const UNNAMED = BELOW_STATES[BELOW_STATES.length - 1].id;
/** the air base a generated state with this id is furnished with: room for its planes, at least 1 where a wing names it, else none */
const airBaseFor = (id) => (WINGS.has(id) ? Math.max(1, Math.ceil(WINGS.get(id) / MULT)) : 0);
const furnished = (s) => s.infrastructure === 2 && s.airBase === airBaseFor(s.id);

/** names: the highest state id the base game's event names (its scripts may name any id its own states declare: 1..8) */
function makeGame(tag, names) {
  const g = path.join(ROOT, tag);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${belowLand(id) ? `land;false;${BELOW_URBAN.has(id) ? "urban" : "plains"};1` : "sea;false;ocean;0"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); return !belowLand(p) ? OCEAN : (BELOW_URBAN.has(p) && inBelowCore(x, y)) ? SPAWN : PLAINS; }));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (belowLand(provAt(x, y)) ? 106 : 89)));
  write(g, "map/buildings.txt", `1;air_base;5.00;10.40;${(H - 1 - 5).toFixed(2)};0.00;0\n`);   // a building position below, on state 1's land
  write(g, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  terrain_city = { type = urban color = { 13 } spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  for (const s of BELOW_STATES) write(g, `history/states/${s.id}-S.txt`, `state={\n\tid=${s.id}\n\tname="STATE_${s.id}"\n\tmanpower=${MANPOWER_BELOW}\n\tstate_category=city\n\tprovinces={ ${s.provinces.join(" ")} }\n\thistory={\n\t\towner=AAA\n\t\tvictory_points = { ${s.provinces[0]} ${VP_BELOW} }\n\t}\n}\n`);
  write(g, "events/base.txt", `namespace = base\ncountry_event = {\n\tid = base.1\n\toption = {\n\t\tname = base.1.a\n\t\t${names} = { add_core_of = ROOT }\n\t}\n}\n`);
  // …and a scripted effect that names it too: a folder a total conversion does NOT replace, so only the three-folder gate
  // (not the event being hidden) can keep such a world from being cut
  write(g, "common/scripted_effects/base_effects.txt", `base_effect = {\n\t${names} = { add_core_of = ROOT }\n}\n`);
  // …and the order of battle AAA starts with (history/units is not a folder stateIdCeilingScriptsName asks: section 5's answers stand)
  write(g, "common/defines/00_defines.lua", `NDefines = {\nNAir = {\n\tAIRBASE_CAPACITY_MULT = ${MULT},\n},\n}\n`);
  write(g, "history/countries/AAA - A.txt", 'set_air_oob = "AAA_air"\n');
  write(g, "history/units/AAA_air.txt", `air_wings = {\n${[...WINGS].map(([id, planes]) => `\t${id} = {\n\t\tname = "W${id}"\n\t\tfighter_equipment_0 = {\n\t\t\towner = "AAA"\n\t\t\tamount = ${planes}\n\t\t}\n\t}\n`).join("")}}\n`);
  return g;
}
function makeMod(tag, regions, extraReplace = []) {
  const m = path.join(ROOT, tag);
  write(m, "descriptor.mod", `name="every state id"\nreplace_path="history/states"\n${extraReplace.map((r) => `replace_path="${r}"\n`).join("")}`);
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};sea;false;ocean;0`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/terrain.bmp", bmp8(W, H, () => OCEAN));
  write(m, "map/heightmap.bmp", bmp8(W, H, () => 89));
  regions.forEach((ids, i) => write(m, `map/strategicregions/r${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="REGION_${i + 1}"\n\tprovinces={ ${ids.join(" ")} }\n\tweather={}\n}\n`));
  write(m, "map/supply_nodes.txt", ""); write(m, "map/railways.txt", "");
  fs.mkdirSync(path.join(m, "history", "states"), { recursive: true });
  return m;
}
const statesOf = (m) => fs.readdirSync(path.join(m, "history", "states")).map((f) => {
  const t = fs.readFileSync(path.join(m, "history", "states", f), "utf8");
  const vp = /victory_points\s*=\s*\{\s*(\d+)\s+(\d+)/.exec(t);
  const buildings = (/buildings\s*=\s*\{([^{}]*)/.exec(t) || [])[1] || "";
  return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], category: (/state_category\s*=\s*(\w+)/.exec(t) || [])[1] || "", manpower: +(/manpower\s*=\s*(\d+)/.exec(t) || [])[1],
    provinces: ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number).filter(Boolean),
    vp: vp ? +vp[1] : 0, vpValue: vp ? +vp[2] : 0, owner: (/\bowner\s*=\s*(\w+)/.exec(t) || [])[1] || "",
    airBase: +((/\bair_base\s*=\s*(\d+)/.exec(buildings) || [])[1] || 0), airBaseLine: /\bair_base\s*=/.test(t), infrastructure: +((/\binfrastructure\s*=\s*(\d+)/.exec(buildings) || [])[1] || 0) };
}).sort((a, b) => a.id - b.id);
const urbanOf = (m) => {
  const out = new Set();
  for (const line of fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split(/\r?\n/)) { const c = line.split(";"); if (c.length >= 7 && c[4] === "land" && c[6] === "urban") out.add(+c[0]); }
  return out;
};
const SEED = 3;   // one whose growth enters a row in its middle — the fixture check below says so, and fails on a seed that does not
const generate = (game, mod, count) => md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], count, provincesPerState: 8, seed: SEED, ownerMode: "inherit" });
const floorRows = (game, mod) => (md.validateMapModel(md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [] })) || []).filter((p) => p.rule === "state_ids_below_base");

const N = BELOW_STATES.length;                       // the base game declares states 1..8, and its event names the last
const GAME = makeGame("game", N), QUIET = makeGame("game-quiet", 2);
const LAND = ROW_REGIONS.length * LAND_COLS;

// ── the world as its regions fall: generated over a base game whose event names nothing past it ───────────────────────────
console.log("\n-- CONTROL: over a base game that names no state past the world's own, the states are the regions' --");
const Q = makeMod("mod-quiet", ROW_REGIONS), rq = generate(QUIET, Q, LAND), plain = statesOf(Q);
ok(rq && rq.changed && rq.createdStates === ROW_REGIONS.length && plain.every((s) => s.provinces.length === LAND_COLS) && rq.lastStateId === ROW_REGIONS.length,
  `Generate land raised ${ROW_REGIONS.length} states of ${LAND_COLS} provinces, one a region — fewer than the ${N} ids the other base game names`, rq && (rq.error || plain.map((s) => s.provinces.length)));
ok(rq.stateIds && rq.stateIds.ceiling === 0 && rq.stateIds.halved === 0, "…and says nothing names an id past them, so nothing was halved", rq.stateIds);
// each state's provinces are written in the order the generator took them. Cut that list straight in half and what is LEFT is
// in two pieces wherever the walk began in the middle of the row — which is what contiguousHalf's choice of start is for.
const straightRest = plain.map((s) => s.provinces.slice(Math.ceil(s.provinces.length / 2)));
ok(straightRest.some((rest) => !onePiece(rest)), "(the fixture: a straight cut of the generator's own order would leave at least one state in two pieces)", straightRest);

console.log("\n-- ⭐ 1. the base game's event names state " + N + ": Generate land makes every id up to it --");
const M = makeMod("mod", ROW_REGIONS), r = generate(GAME, M, LAND), states = statesOf(M);
{
  ok(md.baseStateIdCeiling({ gameRoot: GAME, dependencyRoots: [] }) === N, `(the fixture: the base game declares states up to ${N})`);
  ok(r && r.changed && r.lastStateId === N && r.createdStates === N, `⭐⭐⭐ Generate land's last state id is ${N}, the highest the scripts name`, r && (r.error || { last: r.lastStateId, states: r.createdStates }));
  ok(states.map((s) => s.id).join() === Array.from({ length: N }, (_, i) => i + 1).join(), "…with every id from the first, none skipped", states.map((s) => s.id));
  ok(r.stateIds && r.stateIds.ceiling === N && r.stateIds.halved === N - plain.length && !r.stateIds.stoppedShort && !r.stateIds.unreachable,
    `the report says how far the scripts name states (${N}) and how many states it halved to get there (${N - plain.length})`, r.stateIds);
  const all = states.flatMap((s) => s.provinces);
  ok(all.length === LAND && new Set(all).size === LAND && states.every((s) => s.provinces.length >= 1), "every province is in exactly one state, and no state is empty", states.map((s) => s.provinces.length));
  ok(states.every((s) => onePiece(s.provinces)), "⭐⭐ every state's land is one piece — both halves of a cut", states.filter((s) => !onePiece(s.provinces)).map((s) => [s.id, s.provinces]));
  ok(states.every((s) => new Set(s.provinces.map(regionOf)).size === 1), "…and lies in one strategic region, as a state must", states.map((s) => [...new Set(s.provinces.map(regionOf))]));
  const sizes = states.map((s) => s.provinces.length).sort((a, b) => a - b), largestPlain = Math.max(...plain.map((s) => s.provinces.length));
  ok(sizes[sizes.length - 1] < largestPlain && sizes[sizes.length - 1] - sizes[0] <= 1, "the largest states were the ones halved: none is left bigger than another by more than a province", sizes);
}

console.log("\n-- ⭐ 2. every one of them is furnished by the one writer --");
{
  // a state of equal provinces, each with a 3x3 of its own: its town province is the lowest id among them
  const townOf = (s) => s.provinces.slice().sort((a, b) => a - b)[0];
  ok(states.every((s) => s.vp === townOf(s) && s.vpValue === VP_BELOW), "⭐⭐ every state has a victory point, on its own town province, worth what the layer below gives a state like it", states.map((s) => [s.id, s.vp, townOf(s), s.vpValue]));
  ok(WINGS.size === N - 1 && [...WINGS.values()].some((p) => Math.ceil(p / MULT) > 1) && !WINGS.has(UNNAMED) && states.some((s) => s.id === UNNAMED),
    `(the fixture: the base game's air wings name states 1 to ${N - 1}, some with planes past one level's room, and none names state ${UNNAMED})`, [...WINGS]);
  ok(states.every(furnished), "⭐⭐⭐ every state file has buildings = { infrastructure = 2 } and the air base its order of battle asks for — room for the planes it starts with, no state an air wing cannot land in", states.map((s) => [s.id, s.infrastructure, s.airBase, airBaseFor(s.id)]));
  ok(states.filter((s) => s.id === UNNAMED && !s.airBaseLine).length === 1, `…and state ${UNNAMED}, which nothing names, carries or needs, has no air_base line at all`, states.find((s) => s.id === UNNAMED));
  const rows = fs.readFileSync(path.join(M, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 7);
  ok(states.every((s) => rows.filter((c) => +c[0] === s.id && c[1] === "air_base").length === 1), "…and its one air_base position in map/buildings.txt, as every state's building slots", states.map((s) => rows.filter((c) => +c[0] === s.id).length));
  // ⚠️ the fixture's base game ships no map/supply_nodes.txt, so Generate land has no hub below to ask and keeps its FALLBACK, one
  // hub in every state; with hubs below, only the states that map would hub get one (#a-generated-world-has-the-layer-belows-hubs-per-state)
  const hubs = fs.readFileSync(path.join(M, "map", "supply_nodes.txt"), "utf8").split(/\r?\n/).map((l) => parseInt(l.trim().split(/\s+/)[1], 10)).filter(Number.isFinite);
  ok(hubs.length === N && states.every((s) => hubs.filter((h) => s.provinces.includes(h)).join() === String(s.vp)), "⭐⭐ every state has its supply hub, on its victory point", hubs);
  const urban = urbanOf(M), rate = BELOW_URBAN.size / BELOW_STATES.length;
  ok(states.every((s) => s.category === "city") && urban.size === Math.round(rate * N) && states.every((s) => s.provinces.filter((p) => urban.has(p)).length === 1),
    `⭐⭐ every state took its place in the city pass: the layer below's ${rate} a state gives ${Math.round(rate * N)} cities, one in each`, states.map((s) => s.provinces.filter((p) => urban.has(p)).length));
  // ⚠️ MOVED with #a-generated-state-keeps-its-countrys-id: AAA's capital takes the id the renumbering gives it, not the cut's first, so
  // it can tie a LOWER id on its star and its people — and then the tied-capital guard (map-data.js, "a capital tied with another state")
  // moves ONE person from that state to the capital, so it stays its country's most important state on disk. The total is kept, and
  // every other state holds exactly its own land's people.
  const people = states.reduce((a, s) => a + s.manpower, 0), share = (s) => s.provinces.length * MANPOWER_BELOW / ROWS;
  const aaaFile = path.join(M, "history", "countries", "AAA - A.txt");
  const cap = +((/^\s*capital\s*=\s*(\d+)/m.exec(fs.existsSync(aaaFile) ? fs.readFileSync(aaaFile, "utf8") : "") || [])[1] || 0);
  const capState = states.find((s) => s.id === cap), off = states.filter((s) => s.manpower !== share(s));
  // ⛔ the tie is read off the fixture's own land, never assumed (w5b3 review, contract-F2): "nobody's people moved" is exactly what the
  // world looks like with the guard removed, so it is accepted only where the capital ties no lower id — and the fixture must tie one,
  // or this check pins nothing
  const tieBelow = !!capState && states.some((s) => s !== capState && s.id < cap && s.owner === capState.owner && share(s) === share(capState) && s.vpValue === capState.vpValue);
  ok(tieBelow, "(the fixture: AAA's capital ties a lower id of its own on its star and its own land's people, so the tied-capital guard has work to do)", { cap, capState });
  const guarded = tieBelow ? (off.length === 2 && capState && off.some((s) => s === capState && s.manpower === share(s) + 1)
    && off.some((s) => s !== capState && s.id < cap && s.manpower === share(s) - 1 && share(s) === share(capState) && s.vpValue === capState.vpValue))
    : off.length === 0;
  ok(people === BELOW_STATES.length * MANPOWER_BELOW && guarded && states.every((s) => s.owner === "AAA") && !!capState,
    "…and its manpower and owner were decided for the state it IS: the people of its own provinces below, no more and no fewer in all — but the one person the capital takes from a lower id it tied with",
    { people, cap, each: states.map((s) => [s.id, s.manpower, share(s)]) });
  ok((r.newStates || []).length === N && (r.newStates || []).every((s) => s.vp && states.find((x) => x.id === s.id).vp === s.vp.province), "what Generate land hands the page to name (newStates) holds every one, with its victory point", (r.newStates || []).length);
}

console.log("\n-- ⭐ 3. so Auto-fix's state-id floor finds nothing to do on a fresh world --");
{
  ok(floorRows(GAME, M).length === 0, "⭐⭐ Map Errors does not report state_ids_below_base");
  const before = statesOf(M).length, f = md.fixStateIdFloor({ modRoot: M, gameRoot: GAME, dependencyRoots: [] });
  ok(f && f.added === 0 && !f.error && statesOf(M).length === before, "⭐⭐⭐ fixStateIdFloor adds nothing", f);
  // CONTROL: the unhalved world over the base game that names state 8 is exactly what the floor exists for
  const qRows = (md.validateMapModel(md.buildMapModel({ modRoot: Q, gameRoot: GAME, dependencyRoots: [] })) || []).filter((p) => p.rule === "state_ids_below_base");
  ok(qRows.length === 1 && qRows[0].total === N - plain.length, `CONTROL: the same world left at ${plain.length} states is reported ${N - plain.length} ids short — the rule can tell`, qRows.map((p) => p.total));
}

const answers = {};   // what Generate land answered for the worlds below that it could not give every id: section 7 hands them to the page
console.log("\n-- 4. the floor's own gates, asked the same way --");
{
  // ⛔ unreachable: six provinces of land under a ceiling of eight. A state needs a province, so no cut gets there — and cutting
  // anyway only chops the world to single provinces and still falls short.
  const few = ROW_REGIONS[0].slice(0, N - 2);
  const S = makeMod("mod-small", [few]), rs = generate(GAME, S, few.length), small = statesOf(S);
  answers.small = rs;
  ok(rs && rs.changed && small.length === 1 && small[0].provinces.length === few.length && rs.stateIds && rs.stateIds.unreachable === true && rs.stateIds.halved === 0,
    `⭐⭐ a world of ${few.length} provinces under a ceiling of ${N} is not chopped up: one state, and the report says the land cannot reach it`, rs && (rs.error || { states: small.map((s) => s.provinces.length), stateIds: rs.stateIds }));
  // exactly enough: eight provinces, eight ids — every state a single province, which is what the floor would make of it
  const E = makeMod("mod-exact", [ROW_REGIONS[0]]), re = generate(GAME, E, LAND_COLS), exact = statesOf(E);
  ok(re && re.lastStateId === N && exact.length === N && exact.every((s) => s.provinces.length === 1 && furnished(s) && s.vp === s.provinces[0]),
    "a world with exactly as many provinces as ids is cut all the way: one province a state, each furnished", re && (re.error || exact.map((s) => s.provinces.length)));
  // The floor splits the LARGEST state first, and a state the mod already has is on disk: the floor's to split. A world that
  // holds one — row 1's eight provinces, written by hand — and raises row 0 beside it, under a base game that names state 7,
  // is two states of eight with five ids to make. Generate land halves its own row only as far as the floor's order gives it,
  // counts the cuts that fall to the older state, and leaves those to the floor. Halving on regardless cut the new land down
  // to single provinces while the older state stayed whole; leaving it ALL to the floor put the new land's states outside the
  // one writer again. And a TIE is cut here, so every cut left over is on a state larger than any Generate land wrote.
  const old = ROW_REGIONS[1], fresh = ROW_REGIONS[0], SEVEN = makeGame("game-seven", N - 1);
  /** a world that already holds state 1 — row 1's eight provinces, land — with `region` still sea beside it */
  const withOlderState = (tag, region) => {
    const m = makeMod(tag, [region]);
    write(m, "map/definition.csv", fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split("\n").map((l) => (old.includes(+l.split(";")[0]) ? l.replace(/;sea;false;ocean;0$/, ";land;false;plains;1") : l)).join("\n"));
    write(m, "history/states/1-Old.txt", `state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 9000\n\tstate_category = city\n\tprovinces = { ${old.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t}\n\t}\n}\n`);
    return m;
  };
  const O = withOlderState("mod-older", fresh);
  // where the floor's own order ends, worked out here: the largest state halved, again and again, until there are N - 1 of them
  const floorOrder = (sizes, n) => { const s = sizes.slice(); while (s.length < n) { s.sort((a, b) => b - a); const big = s.shift(); s.push(big >> 1, big - (big >> 1)); } return s.sort((a, b) => a - b); };
  const ends = floorOrder([old.length, fresh.length], N - 1), toMake = N - 1 - 2;
  const ro = generate(SEVEN, O, fresh.length), made = statesOf(O).filter((s) => s.id > 1);
  answers.older = ro;
  ok(ro && ro.changed && ro.stateIds.ceiling === N - 1 && ro.stateIds.halved === made.length - 1 && ro.stateIds.halved > 0 && ro.stateIds.leftToTheFloor > 0
    && ro.stateIds.halved + ro.stateIds.leftToTheFloor === toMake && !ro.stateIds.stoppedShort,
    `⭐⭐ beside an older state as large, the new land is halved only as far as its share of the ${toMake} ids to make: the cuts that fall to the older state are counted and left to the floor`,
    ro && (ro.error || { states: made.map((s) => s.provinces.length), stateIds: ro.stateIds }));
  ok(made.length > 1 && made.every((s) => s.provinces.length >= 2 && furnished(s) && s.vp > 0), "…it is not chopped to single provinces beside a whole older state, and each of its states is furnished", made.map((s) => [s.id, s.provinces.length, s.airBase, airBaseFor(s.id), s.vp]));
  const fo = md.fixStateIdFloor({ modRoot: O, gameRoot: SEVEN, dependencyRoots: [] }), after = statesOf(O);
  ok(fo && fo.added === ro.stateIds.leftToTheFloor && after.length === N - 1 && after.map((s) => s.provinces.length).sort((a, b) => a - b).join() === ends.join(),
    `…and the floor then makes exactly those, leaving the world where its own order ends (${ends.join(" ")} provinces a state)`, fo && (fo.error || { added: fo.added, sizes: after.map((s) => s.provinces.length) }));
  ok(made.every((s) => (after.find((x) => x.id === s.id) || { provinces: [] }).provinces.join() === s.provinces.join()) && (fo.statesMade || []).length === fo.added && (fo.statesMade || []).every((s) => !made.some((g) => g.id === s.from)),
    "⭐⭐⭐ every one of them out of the older state: the floor cuts no state Generate land made", (fo.statesMade || []).map((s) => [s.from, s.id]));
  // ⛔ …AND THE LAND ALREADY IN STATES COUNTS TOWARD REACHING THE CEILING. What the rule tells a world too small for the ids is
  // "Add land" — so the second Generate land is the one that has to cut: the same older state of eight, four new provinces
  // beside it, under the base game that names state 8. The new land alone cannot hold that many states; with the older
  // state's it can. Were only its own land counted, Generate land would call the world unreachable, halve nothing, and leave
  // every new id to the floor — outside the one writer again. (The fixture above cannot tell: its new land reaches the ceiling alone.)
  const added = fresh.slice(0, LAND_COLS / 2), toMakeAdded = N - 2, endsAdded = floorOrder([old.length, added.length], N);
  ok(added.length < N && added.length + old.length >= N, `(the fixture: ${added.length} new provinces are fewer than the ${N} ids, and with the older state's ${old.length} they are not)`);
  const AD = withOlderState("mod-added", added), ra = generate(GAME, AD, added.length), madeAdded = statesOf(AD).filter((s) => s.id > 1);
  ok(ra && ra.changed && ra.stateIds.ceiling === N && !ra.stateIds.unreachable && ra.stateIds.halved === madeAdded.length - 1 && ra.stateIds.halved > 0
    && ra.stateIds.halved + (ra.stateIds.leftToTheFloor || 0) === toMakeAdded && !ra.stateIds.stoppedShort,
    `⭐⭐⭐ land added to a world that was too small counts WITH the land already there: the ${toMakeAdded} ids are reachable, and the new land is halved for its share of them`,
    ra && (ra.error || { states: madeAdded.map((s) => s.provinces.length), stateIds: ra.stateIds }));
  ok(madeAdded.every((s) => furnished(s) && s.vp > 0), "…each of its states furnished by the one writer", madeAdded.map((s) => [s.id, s.provinces.length, s.airBase, airBaseFor(s.id), s.vp]));
  const fa = md.fixStateIdFloor({ modRoot: AD, gameRoot: GAME, dependencyRoots: [] }), afterAdded = statesOf(AD);
  ok(fa && fa.added === (ra.stateIds.leftToTheFloor || 0) && fa.added > 0 && afterAdded.length === N && afterAdded.map((s) => s.provinces.length).sort((a, b) => a - b).join() === endsAdded.join()
    && (fa.statesMade || []).every((s) => !madeAdded.some((g) => g.id === s.from)),
    `…and the floor makes the rest out of the older state, ending where its own order ends (${endsAdded.join(" ")})`, fa && (fa.error || { added: fa.added, sizes: afterAdded.map((s) => s.provinces.length) }));
  // Hearts of Minecraft's shape: the mod replaces the base game's focus, decision and event folders, so nothing names the rest
  const HOM = makeMod("mod-hom", ROW_REGIONS, ["common/national_focus", "common/decisions", "events"]), rh = generate(GAME, HOM, LAND);
  ok(rh && rh.changed && rh.createdStates === plain.length && rh.stateIds && rh.stateIds.ceiling === 0,
    "⭐ a world that replaces all three base script folders is left as its regions fall", rh && (rh.error || { states: rh.createdStates, stateIds: rh.stateIds }));
}

console.log("\n-- 5. the two helpers, asked directly --");
{
  const ask = (above, mod = M, game = GAME) => md.stateIdCeilingScriptsName({ modRoot: mod, gameRoot: game, dependencyRoots: [], above });
  ok(typeof md.stateIdCeilingScriptsName === "function" && ask(0).ceiling === N && ask(0).references > 0, `stateIdCeilingScriptsName: the scripts that load name states up to ${N}`, typeof md.stateIdCeilingScriptsName === "function" && ask(0));
  ok(ask(N - 1).ceiling === N && ask(N).ceiling === 0 && ask(N).references === 0, "…asked past an id, only what is named ABOVE it counts: nothing past the last", [ask(N - 1), ask(N)]);
  ok(ask(0, M, QUIET).ceiling === 2 && ask(2, M, QUIET).ceiling === 0, "…and it is the highest id NAMED, not the highest the base game declares", ask(0, M, QUIET));
  const WILD = makeGame("game-wild", 10 * N);
  ok(ask(0, M, WILD).ceiling === N, `…but never past what the layers below declare: a script naming state ${10 * N} asks for ${N}`, ask(0, M, WILD));
  ok(ask(0, path.join(ROOT, "mod-hom")).ceiling === 0 && ask(0, path.join(ROOT, "mod-hom")).references === 0, "…and a mod that replaces all three base script folders is asked nothing, whatever else names a state", ask(0, path.join(ROOT, "mod-hom")));
  const short = md.stateIdFloorShortfall(md.buildMapModel({ modRoot: Q, gameRoot: GAME, dependencyRoots: [] }));
  ok(short && short.ceiling === ask(0).ceiling && short.missing === N - plain.length, "the floor's rule asks the same helper: its ceiling is that answer", short);
  // …and asks it past the world's own highest id, because its message counts the references to MISSING states. A base game
  // whose event names state 8 and whose scripted effect names state 1 — a state every world has — holds one such reference.
  const BOTH = makeGame("game-both", N);
  write(BOTH, "common/scripted_effects/base_effects.txt", "base_effect = {\n\t1 = { add_core_of = ROOT }\n}\n");
  const shortBoth = md.stateIdFloorShortfall(md.buildMapModel({ modRoot: Q, gameRoot: BOTH, dependencyRoots: [] }));
  ok(ask(0, Q, BOTH).references === 2 && shortBoth && shortBoth.references === 1 && shortBoth.ceiling === N, "…asked past the world's highest id: of the two references in the scripts, the rule counts the one to a state the world lacks", { all: ask(0, Q, BOTH), shortBoth });

  const half = md.contiguousHalf;
  // a line 1-2-3-4-5-6, listed from its middle outwards — the order a walk that began at 3 leaves it in
  const line = new Map([[1, [2]], [2, [1, 3]], [3, [2, 4]], [4, [3, 5]], [5, [4, 6]], [6, [5]]]);
  const listed = [3, 2, 4, 1, 5, 6], naive = listed.slice(3), gap = (l) => { const s = l.slice().sort((a, b) => a - b); return s.some((p, i) => i > 0 && p !== s[i - 1] + 1); };
  ok(typeof half === "function" && gap(naive), "(the fixture: a straight cut of [3,2,4,1,5,6] leaves 1 cut off from 5 and 6)", naive);
  if (typeof half === "function") {
    const t = half(listed, line), rest = listed.filter((p) => !t.includes(p));
    ok(t.length === 3 && !gap(t) && rest.length === 3 && !gap(rest), "⭐⭐ contiguousHalf: half the line in one piece, leaving the other half in one piece", { t, rest });
    const a = half(listed, line, { avoid: new Set([3]) });
    ok(a.length > 0 && !a.includes(3) && !gap(a), "a province to avoid (a victory point) is never in the cut", a);
    const mid = half([1, 2, 3], new Map([[1, [2]], [2, [1, 3]], [3, [2]]]), { avoid: new Set([2]) });
    ok(mid.length === 1 && mid[0] !== 2, "…even when it sits in the middle, next to every other province: the walk steps round it", mid);
    const keep6 = half(listed, line, { restMust: (rest) => rest.has(6) }), keep1 = half(listed, line, { restMust: (rest) => rest.has(1) });
    ok(keep6.length === 3 && !keep6.includes(6) && keep1.length === 3 && !keep1.includes(1), "a test the half left behind must pass (a dockyard's coast) decides which half is cut", { keep6, keep1 });
    ok(half(listed, line, { restMust: () => false }).length === 0 && half([7], line).length === 0, "no cut that passes it, or a single province: nothing to cut", half([7], line));
    // a spine 1-2-3-4 with a spur on 2 (5) and one on 3 (6). The walk's first start is the province furthest from the first
    // listed — 6 — and the half it reaches from there, {6,3,2}, leaves 1, 4 and 5 each on its own. Only a walk begun at a spur
    // end that takes ITS side of the spine ({5,2,1} or {6,3,4}) leaves the rest whole, so the walk has to try more than one start.
    const tree = new Map([[1, [2]], [2, [1, 3, 5]], [3, [2, 4, 6]], [4, [3]], [5, [2]], [6, [3]]]), all = [1, 2, 3, 4, 5, 6];
    const joined = (l) => { const s = new Set(l), seen = new Set([l[0]]), q = [l[0]]; while (q.length) { const u = q.shift(); for (const v of tree.get(u)) if (s.has(v) && !seen.has(v)) { seen.add(v); q.push(v); } } return seen.size === s.size; };
    const walkFrom = (start) => { const out = [], seen = new Set([start]), q = [start]; while (q.length && out.length < 3) { const u = q.shift(); out.push(u); for (const v of tree.get(u)) if (!seen.has(v)) { seen.add(v); q.push(v); } } return out; };
    const furthest = (() => { const seen = new Set([all[0]]), q = [all[0]]; let last = all[0]; while (q.length) { last = q.shift(); for (const v of tree.get(last)) if (!seen.has(v)) { seen.add(v); q.push(v); } } return last; })();
    const firstRest = all.filter((p) => !walkFrom(furthest).includes(p));
    ok(!joined(firstRest) && all.some((s) => joined(all.filter((p) => !walkFrom(s).includes(p)))), "(the fixture: the walk from the furthest province leaves the rest in pieces, and a walk from another start does not)", { furthest, firstRest });
    const tt = half(all, tree), tr = all.filter((p) => !tt.includes(p));
    ok(tt.length === 3 && joined(tt) && joined(tr), "⭐⭐ the walk is tried from more than one start: the cut it keeps leaves the rest in one piece", { tt, tr });
    ok(half([9, 8, 7, 6, 5], null).join() === "9,8,7", "with no province graph to walk, the straight slice Generate land makes of such a world", half([9, 8, 7, 6, 5], null));

    // ⛔ #a-cut-leaves-both-halves-whole — A SMALLER CUT THAT LEAVES BOTH PIECES WHOLE BEATS A HALF THAT DOES NOT. A hub that
    // touches every other province: whatever start a walk of exactly half takes, it goes through the hub, and what is left has
    // nothing joining it. The walk kept such a cut, and the first Generate land to halve its own states (35% of the sea, seed 1)
    // left 2 of 1,081 in two pieces where the unhalved world had none. Every expectation below is this file's own count over
    // every way to cut the shape, not the walk's.
    const wholeOn = (g, l) => { const s = new Set(l), seen = new Set([l[0]]), q = [l[0]]; while (q.length) { const u = q.shift(); for (const v of (g.get(u) || [])) if (s.has(v) && !seen.has(v)) { seen.add(v); q.push(v); } } return l.length > 0 && seen.size === s.size; };
    const prefixFrom = (g, start, n) => { const out = [], seen = new Set([start]), q = [start]; while (q.length && out.length < n) { const u = q.shift(); out.push(u); for (const v of (g.get(u) || [])) if (!seen.has(v)) { seen.add(v); q.push(v); } } return out; };
    /** the sizes of every cut that leaves BOTH pieces whole, the piece taken no larger than half */
    const wholeCuts = (g, l) => { const out = [], want = Math.ceil(l.length / 2); for (let m = 1; m < (1 << l.length) - 1; m++) { const a = l.filter((_, i) => m & (1 << i)), b = l.filter((_, i) => !(m & (1 << i))); if (a.length <= want && wholeOn(g, a) && wholeOn(g, b)) out.push(a.length); } return out; };
    const noHalfLeavesItWhole = (g, l) => l.every((s) => !wholeOn(g, l.filter((p) => !prefixFrom(g, s, Math.ceil(l.length / 2)).includes(p))));
    const star = new Map([[1, [2, 3, 4, 5]], [2, [1]], [3, [1]], [4, [1]], [5, [1]]]), spokes = [1, 2, 3, 4, 5];
    const starCuts = wholeCuts(star, spokes);
    ok(noHalfLeavesItWhole(star, spokes) && starCuts.length === spokes.length - 1 && Math.max(...starCuts) === 1,
      "(the fixture: a hub and four spokes — no walk of half from any start leaves the rest in one piece, and the only cuts that leave both whole take one spoke)", starCuts);
    const st = half(spokes, star), sr = spokes.filter((p) => !st.includes(p));
    ok(st.length === Math.max(...starCuts) && wholeOn(star, st) && wholeOn(star, sr) && !st.includes(1), "⭐⭐⭐ round a hub the cut is the one spoke that leaves the rest together, not a half that leaves two spokes apart", { st, sr });
    // …and the shape it was measured on: state 178 and state 954, the one it was cut from — eight provinces round province
    // 2887, with the borders provinces.bmp gives them. A cut of four and four that leaves both whole exists; no walk's first
    // four is one.
    const hub = new Map([[2863, [4667, 2887, 4443]], [2887, [2934, 4667, 5507, 13084, 2863, 4450, 4443]], [2934, [4667, 5507, 2887]], [4443, [2887, 2863]], [4450, [2887, 13084]], [4667, [2934, 2863, 2887]], [5507, [2934, 2887]], [13084, [2887, 4450]]]);
    const measured = [4450, 2887, 13084, 2934, 4443, 2863, 4667, 5507], measuredCuts = wholeCuts(hub, measured);
    ok(noHalfLeavesItWhole(hub, measured) && Math.max(...measuredCuts) === Math.ceil(measured.length / 2), "(the fixture: on the measured shape too, no walk of half leaves the rest whole — though a cut of four and four that leaves both whole exists)", measuredCuts.length);
    const mt = half(measured, hub), mr = measured.filter((p) => !mt.includes(p));
    ok(mt.length === 3 && wholeOn(hub, mt) && wholeOn(hub, mr), "⭐⭐ on the measured shape the cut is three provinces and five, each in one piece: the longest head of any walk that leaves the rest whole", { mt, mr });
    // a victory point and a coast still decide: the shorter walks are held to both
    const sa = half(spokes, star, { avoid: new Set([5]) });
    ok(sa.length === 1 && sa[0] !== 5 && sa[0] !== 1, "…a shorter cut still never holds a province to avoid", sa);
    const sc = half(spokes, star, { restMust: (rest) => rest.has(5) && rest.has(4) });
    ok(sc.length === 1 && ![1, 4, 5].includes(sc[0]), "…and still leaves behind what the rest must keep", sc);
    // …and only a cut that leaves the rest WHOLE may be shorter. A line 1-2-3-4 whose ends must both stay, and at least three
    // provinces with them: no half passes that, and a single province out of the middle passes it and leaves an end on its own.
    const four = new Map([[1, [2]], [2, [1, 3]], [3, [2, 4]], [4, [3]]]), ends = (rest) => rest.has(1) && rest.has(4) && rest.size >= 3;
    ok([[2], [3]].every((t) => ends(new Set([1, 2, 3, 4].filter((p) => !t.includes(p)))) && !wholeOn(four, [1, 2, 3, 4].filter((p) => !t.includes(p)))),
      "(the fixture: taking either middle province passes the test and leaves the rest in two pieces)");
    ok(half([1, 2, 3, 4], four, { restMust: ends }).length === 0, "a shorter cut that leaves the rest apart is not taken: such a state is left whole, as it was", half([1, 2, 3, 4], four, { restMust: ends }));
    // land already in pieces has no cut that leaves the rest whole: the first half-size cut, as before
    const isles = new Map([[1, [2]], [2, [1, 3]], [3, [2, 4]], [4, [3]], [5, []], [6, []]]), apart = [1, 2, 3, 4, 5, 6];
    const it = half(apart, isles);
    ok(it.length === 3 && wholeOn(isles, it), "CONTROL: land that is already in pieces is still cut at half — there is no whole remainder to hold out for", it);
  }
}

console.log("\n-- ⭐ 6. a state cut round a hub: both states in one piece --");
{
  // Generate land's own halving on that shape: one strategic region of five provinces in a plus, under a base game that names
  // state 2 — one state as the region falls, two once the scripts are asked. Whichever way a half is walked it takes the
  // middle, and the two arms left behind touch nothing.
  const mid = [1, 1], plus = [idAt(mid[0], mid[1]), idAt(mid[0] - 1, mid[1]), idAt(mid[0] + 1, mid[1]), idAt(mid[0], mid[1] - 1), idAt(mid[0], mid[1] + 1)];
  const arms = plus.slice(1);
  ok(arms.every((p) => touching(p, plus[0])) && arms.every((a) => arms.every((b) => a === b || !touching(a, b))), "(the fixture: four arms that touch the middle province and not each other)", plus);
  const P = makeMod("mod-plus", [plus]), rp = generate(QUIET, P, plus.length), cut = statesOf(P);
  ok(rp && rp.changed && cut.length === 2 && rp.stateIds.ceiling === 2 && rp.stateIds.halved === 1 && cut.flatMap((s) => s.provinces).sort((a, b) => a - b).join() === plus.slice().sort((a, b) => a - b).join(),
    "Generate land raised the five provinces and halved its one state to make the two ids the scripts name", rp && (rp.error || { states: cut.map((s) => s.provinces), stateIds: rp.stateIds }));
  ok(cut.length === 2 && cut.every((s) => onePiece(s.provinces)), "⭐⭐⭐ both states are in one piece: an arm on its own, and the middle with the other three", cut.map((s) => s.provinces));
  ok(cut.every((s) => furnished(s) && s.vp > 0 && s.provinces.includes(s.vp)), "…and both are furnished", cut.map((s) => [s.id, s.airBase, airBaseFor(s.id), s.vp]));
}

console.log("\n-- 7. the page says what Generate land could not make --");
{
  // `stateIds` was returned and read by nothing: a world left short of ids — and a throw inside the halving, which is caught so
  // the land is not lost — printed a plain success. The page's own function, lifted out of public/map.js and run on the answers
  // the worlds above gave.
  const { maskJsLiterals, jsBodyAt, stripJsComments } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const at = MASKED.indexOf("function generatedStateIdsNote("), body = at < 0 ? null : jsBodyAt(MASKED, at);
  ok(!!body, "public/map.js has generatedStateIdsNote");
  const note = body ? require("vm").runInNewContext("(" + PAGE.slice(at, body[1] + 1) + ")") : () => "";
  ok(note(r) === "" && note(rq) === "" && note({}) === "" && note(null) === "", "CONTROL: a world that made every id, one nothing names an id for, and an answer with no stateIds say nothing", [note(r), note(rq)]);
  const small = answers.small || {}, saidSmall = note(small);
  ok((small.stateIds || {}).unreachable === true && /⚠/.test(saidSmall) && saidSmall.includes("up to id " + N) && /more land/.test(saidSmall), "⭐⭐ a world with less land than the ids the scripts name is told so, with the id they reach and what to do", saidSmall);
  const older = answers.older || {}, left = (older.stateIds || {}).leftToTheFloor, saidOlder = note(older);
  ok(left > 0 && saidOlder.startsWith(` ⚠ ${left} of the state ids`) && /Auto-fix all/.test(saidOlder) && /no supply hub and no city/.test(saidOlder),
    "⭐⭐ ids left to the states the map already had are counted, with what Auto-fix makes of them: no supply hub, no city", saidOlder);
  // Every way the halving can fall short is a field it sets on stateIds, read out of generateLand's own source — and the page
  // reads each one. (`halved` is counted up, not set: it is the success, and success says nothing.)
  // ⚠️ MOVED with #a-generated-state-keeps-its-countrys-id: stateIds also carries `renumbered` and `carried`, which the page's second
  // note (generatedStateMeaningNote) reads — so the fields read are those of both notes.
  const src = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const written = [...new Set([...src.matchAll(/\bidFloor\.(\w+)\s*=[^=]/g)].map((m) => m[1]))].sort();
  const mAt = MASKED.indexOf("function generatedStateMeaningNote("), mBody = mAt < 0 ? null : jsBodyAt(MASKED, mAt);
  ok(!!mBody, "public/map.js has generatedStateMeaningNote");
  const meaning = mBody ? require("vm").runInNewContext("(" + PAGE.slice(mAt, mBody[1] + 1) + ")") : () => "";
  const read = [...new Set([...stripJsComments(PAGE.slice(at, body ? body[1] + 1 : at) + "\n" + (mBody ? PAGE.slice(mAt, mBody[1] + 1) : "")).matchAll(/\bsi\.(\w+)/g)].map((m) => m[1]))];
  ok(written.length === 7 && written.includes("error") && written.includes("renumbered") && written.includes("carried") && written.every((k) => read.includes(k)),
    "⭐⭐ every field Generate land sets on stateIds is one the page reads (derived from map-data.js)", { written, read });
  // what the meaning note says, on the answers above and on the shapes no fixture world reaches
  const rn = (r.stateIds || {}).renumbered || {}, saidR = meaning(r);
  ok(rn.sameOwner > 0 && saidR.startsWith(` ${rn.sameOwner} of ${r.createdStates} new states took an id their own country held in 1936`) && !/⚠/.test(saidR),
    "⭐⭐ the world above is told how many new states took an id their own country held in 1936", saidR);
  ok(meaning({}) === "" && meaning(null) === "" && meaning({ stateIds: { ceiling: 0 } }) === "" && meaning({ createdStates: 4, stateIds: { renumbered: { sameOwner: 0 } } }) === "",
    "…and an answer whose renumbering did not run says nothing", meaning({ stateIds: { ceiling: 0 } }));
  const saidRenErr = meaning({ createdStates: 3, stateIds: { renumbered: { error: "boom" } } });
  ok(/⚠/.test(saidRenErr) && saidRenErr.includes("(boom)") && /another country's land/.test(saidRenErr), "⭐⭐ a renumbering that threw is said, with its reason and what it means", saidRenErr);
  // ⚠️ MOVED with #what-a-core-held-none-of-stands-on (w5b3 review, gameplay-F1): the note said "so N of those cores stand on other land of
  // the same country" of every one of them, true on the owner's flow of 116 of 237; each part is now said by its own count
  const held = { states: 3, cores: 5, ownLand: 2, raised: 2, otherLand: 1, noOwnLand: { states: 2, cores: 3 }, living: 1 };
  const saidCarry = meaning({ createdStates: 10, stateIds: { renumbered: { sameOwner: 7 }, carried: { states: 4, cores: 6, claims: 2, onLandHeldNone: held } } });
  ok(saidCarry.includes("7 of 10 new states") && saidCarry.includes("4 carry that state's 1936 cores (6) and claims (2)") && saidCarry.includes("3 of them hold none of their state underneath")
    && saidCarry.includes("of the 5 cores they carry there, 2 stand on other land of the same country, 2 on land raised from the sea, 1 on land another country held in 1936")
    && saidCarry.includes("2 of those states stand on not one province of their country's 1936 land") && saidCarry.includes("1 of those cores is of a country that starts with land"),
    "⭐⭐⭐ the cores carried are counted, and so are the states carrying them on land that held none of their state underneath (the decision the owner may override) — and what that land was, each part by its own count", saidCarry);
  const saidBare = meaning({ createdStates: 10, stateIds: { renumbered: { sameOwner: 7 }, carried: { states: 4, cores: 6, claims: 2, onLandHeldNone: { states: 3, cores: 5 } } } });
  ok(saidBare.includes("3 of them hold none of their state underneath") && !/other land of the same country/.test(saidBare),
    "…and a count that does not say what the land was never calls it the same country's other land", saidBare);
  const saidCarryErr = meaning({ createdStates: 10, stateIds: { renumbered: { sameOwner: 7 }, carried: { error: "bang" } } });
  ok(/⚠/.test(saidCarryErr) && saidCarryErr.includes("(bang)"), "…and cores that could not be carried are said, with the reason", saidCarryErr);
  ok(!/as in the base game|work as|works as/.test(saidCarry + saidR), "…and no sentence promises the base game's releases work as they did", saidCarry);
  // the two no fixture world reaches — the halving's own catch, and new states that cannot be cut — in the fields read above
  const saidError = note({ stateIds: { ceiling: N, halved: 1, error: "boom" } }), saidShort = note({ stateIds: { ceiling: N, halved: 1, stoppedShort: 3 } });
  ok(/⚠/.test(saidError) && saidError.includes("(boom)") && /Map Errors/.test(saidError) && /no supply hub and no city/.test(saidError), "⭐⭐⭐ a halving that threw is said, with its reason — not a plain success over a world short of states", saidError);
  ok(saidShort.startsWith(" ⚠ 3 of the state ids") && /could not be made/.test(saidShort) && /Map Errors lists them/.test(saidShort), "…and so are ids no new state was left to be cut for", saidShort);
  ok(note({ stateIds: { ceiling: N, halved: 2, leftToTheFloor: 1, stoppedShort: 1 } }).split("⚠").length === 3, "both at once are two sentences", note({ stateIds: { ceiling: N, halved: 2, leftToTheFloor: 1, stoppedShort: 1 } }));
  // …and it is in the line the click prints
  // The click's success line is the LAST reload before its .catch: the first one after the POST is now a click that stopped
  // part-way (#a-click-that-stopped-part-way-said-nothing-changed), which made no world to count ids in
  const handler = stripJsComments(PAGE), post = handler.indexOf('fetch("/api/map/generate-land"');
  const caught = post < 0 ? -1 : handler.indexOf(".catch(", post), done = caught < 0 ? -1 : handler.lastIndexOf("reloadAfterImmediateWrite(", caught);
  // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
  // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
  const line = require("./testlib-map-page.js").generateLandReportLine(handler);
  ok(/=\s*generatedStateIdsNote\(res\)/.test(line) && /\$\{idsNote\}/.test(line.slice(line.indexOf("reloadAfterImmediateWrite("))), "⭐⭐ the Generate land report on the page carries it", line.slice(-260));
  ok(/=\s*generatedStateMeaningNote\(res\)\s*\+\s*generatedContinentsNote\(res\)/.test(line) && /\$\{meaningNote\}/.test(line.slice(line.indexOf("reloadAfterImmediateWrite("))),
    "⭐⭐ …and the meaning of its ids and the continents of its land", line.slice(-260));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
