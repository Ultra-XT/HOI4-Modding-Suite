// ⛔ #a-generated-world-has-the-layer-belows-hubs-per-state — END TO END: GENERATE LAND, THEN AUTO-FIX, AND EVERY CAPITAL STILL HAS
// ITS HUB.
//
// Generate land hubs the capitals, then as many states of each kind as the map underneath hubs, and none on land its country
// can reach neither by rail nor by sea (test-a-generated-world-has-the-layer-belows-hubs-per-state.js pins the chooser on hand-written
// files). Every test that counted hubs before ran with no hub below to ask, so three things only the whole flow shows were never run:
//   · the capital Generate land puts a hub on is the one the country ENDS with. #a-generated-country-keeps-its-place-and-its-capital
//     settles most of them inside Generate land — each country's most important state, which takes the id its capital line names —
//     and leaves a line naming a state the mod already had for Auto-fix's fixForeignCapitals to re-point. Both ask capitalStateFor,
//     and supply leaves the capital by rail, so a hub on any other guess is a network cut off from its capital;
//   · the chooser reads the world as Generate land has just written it (its states, owners, kinds, victory points and towns);
//   · Auto-fix, run once and again, leaves the network Generate land wrote alone.
//
// Pinned on a base game of a mainland and an island, its states over three kinds and two countries, its hubs on every city, half
// the towns and fewer than half the rural states. YYY's people live in its two one-province rural states, so its most important
// state is one no hub share reaches: only the capital clause hubs it. The page's own body (inherit, a seed, every province that
// has a strategic region), then autoFixMap. Every expected number is read back off the fixture's files, and a state is known by its
// PROVINCES, never by its id: Generate land permutes the new ids so each capital line names its country's capital.
// ⚠️ Moved with #a-capital-stands-where-its-country-can-reach and #a-country-reaches-its-land-by-sea (supply critique, commit 1):
// YYY's R9 is walled off from YYY's other land by XXX's, so YYY's land is two pieces and its capital is now the most important
// state of the piece most of its people live on (R12), not of all its land (R9) — "most important" below is asked within that
// piece. And every piece of a country's land that opens onto the ocean now gets a harbour, so XXX's island is reached by sea and
// hubbed; (b) pins THAT, and the chooser asked again counts the owner's own pieces and harbours as generateSupplyNetwork does.
//   PART 1, under a mod Delete map has emptied:
//   (a) ⭐ every country's FINAL capital state holds a hub on its victory point — YYY's only by the capital clause, which a CONTROL
//       shows by asking the chooser again without it;
//   (b) ⭐ no hub stands on land its country reaches neither by its own rail nor by sea — and XXX's island, larger than any other
//       rural state, is reached by sea now: Generate land gave it a harbour and XXX's capital's piece one, so the share hubs it,
//       which a CONTROL shows it would not by land alone;
//   (c) per kind, round(the share below × its states), capitals counted;
//   (d) a second Auto-fix leaves supply_nodes.txt and railways.txt byte for byte;
//   (e) every hub of a country on its capital's land is joined to the capital by rail.
//   PART 2, under a mod that already holds R9 — YYY's capital below — and has handed it to ZZZ. Generate land leaves a capital line
//   on a state the mod already had alone, so here it is Auto-fix that moves YYY's capital, and
//   (f) ⭐ the state it moves it to, the next of YYY's one-province states, holds a hub on its victory point.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capital-hubs-"));
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

// ── the world: 12 x 6 provinces of 12 px, id = row * 12 + col + 1 ───────────────────────────────────────────────────────────────
//   rows 0-3, cols 0-9   the mainland, handed out along each row from PLAN; YYY holds three rural states, XXX the rest
//   row 5, cols 0-3      an island: one rural state of XXX's, larger than any other rural state; XXX's capital is on the mainland
//   the rest             sea, with no strategic region in the mod, so Generate land raises exactly the land below and no more;
//                        columns 10-11 keep the rows from joining round the map's east-west wrap
const CELL = 12, COLS = 12, ROWS = 6, W = COLS * CELL, H = ROWS * CELL;
const SPAWN = 13, PLAINS = 0, OCEAN = 15;
const idAt = (c, r) => r * COLS + c + 1;
const provAt = (x, y) => idAt(Math.floor(x / CELL), Math.floor(y / CELL));
const colour = (id) => [(id * 29) % 256, (id * 67) % 256, 30 + id];
//   name, kind, provinces, owner, a town below. Each row adds up to ten.
const PLAN = [
  [["C1", "city", 2, "XXX", 1], ["C2", "city", 2, "XXX", 1], ["C3", "city", 2, "XXX", 1], ["C4", "city", 2, "XXX", 1], ["T1", "town", 2, "XXX", 1]],
  [["T2", "town", 2, "XXX", 1], ["T3", "town", 2, "XXX", 0], ["T4", "town", 2, "XXX", 0], ["R1", "rural", 1, "XXX", 0], ["R2", "rural", 3, "XXX", 1]],
  [["R3", "rural", 3, "XXX", 0], ["R4", "rural", 2, "XXX", 1], ["R5", "rural", 2, "XXX", 0], ["R6", "rural", 2, "XXX", 0], ["R9", "rural", 1, "YYY", 0]],
  [["R7", "rural", 3, "YYY", 0], ["R8", "rural", 2, "YYY", 0], ["R12", "rural", 1, "YYY", 0], ["R10", "rural", 2, "XXX", 1], ["R11", "rural", 2, "XXX", 0]],
];
// 1,000 people a province, but in YYY's two one-province states: R9 holds the most, R12 the next — so each in turn is YYY's most
// important state while YYY holds it, and each, one province with no town, is the last of its kind a hub share reaches
const MANPOWER = { R9: 9000, R12: 8000 };
const STATES = [];
PLAN.forEach((row, r) => { let c = 0; for (const [name, category, n, owner, town] of row) { const provinces = []; for (let k = 0; k < n; k++) provinces.push(idAt(c++, r)); STATES.push({ name, category, owner, town: !!town, provinces, manpower: MANPOWER[name] || n * 1000 }); } });
STATES.push({ name: "RI", category: "rural", owner: "XXX", town: false, provinces: [0, 1, 2, 3].map((c) => idAt(c, 5)), manpower: 4000 });
const S = Object.fromEntries(STATES.map((s) => [s.name, s]));
const LAND = new Set(STATES.flatMap((s) => s.provinces));
const VP_BY_KIND = { city: 10, town: 5, rural: 1 };
// the hubs below: every city, half the towns, six of the rural states — none on the island, as a hub there would not work
const HUBBED_BELOW = new Set(["C1", "C2", "C3", "C4", "T1", "T3", "R2", "R3", "R5", "R7", "R8", "R10"]);
// the ids below: R9 is state 1, so part 2's mod, which keeps R9, leaves no gap under the ids Generate land hands out; then PLAN order
const ID_BELOW = new Map(["R9", ...STATES.map((s) => s.name).filter((n) => n !== "R9")].map((n, i) => [n, i + 1]));
const idBelow = (name) => ID_BELOW.get(name);
const stateFile = (s, owner) => `state={\n\tid=${idBelow(s.name)}\n\tname="STATE_${idBelow(s.name)}"\n\tmanpower=${s.manpower}\n\tstate_category=${s.category}\n\tprovinces={ ${s.provinces.join(" ")} }\n\thistory={\n\t\towner=${owner}\n\t\tvictory_points = { ${s.provinces[0]} ${VP_BY_KIND[s.category]} }\n\t}\n}\n`;

function makeGame(tag) {
  const g = path.join(ROOT, tag);
  write(g, "hoi4.exe", "");
  write(g, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const townAt = new Set(STATES.filter((s) => s.town).map((s) => s.provinces[0]));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${LAND.has(id) ? `land;false;${townAt.has(id) ? "urban" : "plains"};1` : "sea;false;ocean;0"}`);
  write(g, "map/definition.csv", rows.join("\n") + "\n");
  write(g, "map/terrain.bmp", bmp8(W, H, (x, y) => { const p = provAt(x, y); const lx = x % CELL, ly = y % CELL; return !LAND.has(p) ? OCEAN : townAt.has(p) && lx >= 3 && lx < 9 && ly >= 3 && ly < 9 ? SPAWN : PLAINS; }));
  write(g, "map/heightmap.bmp", bmp8(W, H, (x, y) => (LAND.has(provAt(x, y)) ? 106 : 89)));
  write(g, "common/terrain/00_terrain.txt", ["categories = {", "  plains = { color = { 200 200 100 } }", "  urban = { color = { 120 110 100 } }", "  ocean = { color = { 0 0 200 } is_water = yes }", "}",
    "terrain = {", "  plains = { type = plains color = { 0 } }", "  terrain_city = { type = urban color = { 13 } spawn_city = yes }", "  ocean = { type = ocean color = { 15 } }", "}", ""].join("\n"));
  for (const s of STATES) write(g, `history/states/${idBelow(s.name)}-S.txt`, stateFile(s, s.owner));
  write(g, "map/supply_nodes.txt", STATES.filter((s) => HUBBED_BELOW.has(s.name)).map((s) => `1 ${s.provinces[0]}`).join("\n") + "\n");
  write(g, "map/railways.txt", "");
  // XXX's capital line names its smallest state, which Generate land must move to its most important; YYY's names R9
  write(g, "history/countries/XXX - Exx.txt", `capital = ${idBelow("R1")}\n`);
  write(g, "history/countries/YYY - Wyy.txt", `capital = ${idBelow("R9")}\n`);
  return g;
}
/** a mod over the game whose map is all sea but the land of `kept` ({ name, owner }), a state of its own; each state below is a
 *  strategic region of the mod's, so each comes back as one state of the same land */
function makeMod(tag, kept = null) {
  const m = path.join(ROOT, tag);
  const own = new Set(kept ? S[kept.name].provinces : []);
  write(m, "descriptor.mod", 'name="capital hubs"\nreplace_path="history/states"\n');
  write(m, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let id = 1; id <= COLS * ROWS; id++) rows.push(`${id};${colour(id).join(";")};${own.has(id) ? "land;false;plains;1" : "sea;false;ocean;0"}`);
  write(m, "map/definition.csv", rows.join("\n") + "\n");
  write(m, "map/terrain.bmp", bmp8(W, H, (x, y) => (own.has(provAt(x, y)) ? PLAINS : OCEAN)));
  write(m, "map/heightmap.bmp", bmp8(W, H, (x, y) => (own.has(provAt(x, y)) ? 106 : 89)));
  for (const s of STATES) write(m, `map/strategicregions/r${idBelow(s.name)}.txt`, `strategic_region={\n\tid=${idBelow(s.name)}\n\tname="REGION_${idBelow(s.name)}"\n\tprovinces={ ${s.provinces.join(" ")} }\n\tweather={}\n}\n`);
  write(m, "map/supply_nodes.txt", ""); write(m, "map/railways.txt", "");
  fs.mkdirSync(path.join(m, "history", "states"), { recursive: true });
  if (kept) write(m, `history/states/${idBelow(kept.name)}-S.txt`, stateFile(S[kept.name], kept.owner));
  return m;
}
const statesOn = (m) => fs.readdirSync(path.join(m, "history", "states")).map((f) => {
  const t = fs.readFileSync(path.join(m, "history", "states", f), "utf8");
  const vp = /victory_points\s*=\s*\{\s*(\d+)\s+([\d.]+)/.exec(t);
  return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], category: (/state_category\s*=\s*(\w+)/.exec(t) || [])[1] || "", owner: (/\bowner\s*=\s*(\w+)/.exec(t) || [])[1] || "",
    manpower: +(/\bmanpower\s*=\s*(\d+)/.exec(t) || [])[1] || 0,
    provinces: ((/provinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1] || "").trim().split(/\s+/).map(Number).filter(Boolean), vp: vp ? +vp[1] : 0, vpValue: vp ? +vp[2] : 0 };
}).sort((a, b) => a.id - b.id);
const hubsOn = (m) => md.parseSupplyNodes(fs.readFileSync(path.join(m, "map", "supply_nodes.txt"), "utf8")).map((h) => h.province);
const urbanOn = (m) => new Set(fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split(/\r?\n/).map((l) => l.split(";"))
  .filter((c) => c.length >= 7 && c[4] === "land" && c[6] === "urban").map((c) => +c[0]));
const nameOf = (s) => (STATES.find((b) => b.provinces.join() === s.provinces.slice().sort((a, b) => a - b).join()) || {}).name;
// the land as the bitmap joins it: four-neighbour cells, sea between; the island is its own piece
const pieceOf = (() => {
  const out = new Map();
  for (const p of LAND) {
    if (out.has(p)) continue;
    const q = [p]; out.set(p, p);
    while (q.length) { const u = q.pop(), c = (u - 1) % COLS; for (const v of [c > 0 ? u - 1 : -1, c < COLS - 1 ? u + 1 : -1, u - COLS, u + COLS]) if (LAND.has(v) && !out.has(v)) { out.set(v, p); q.push(v); } }
  }
  return out;
})();
const generate = (game, mod, count) => md.generateLand({ modRoot: mod, gameRoot: game, dependencyRoots: [], count, seed: 1, ownerMode: "inherit", owner: "" });

const GAME = makeGame("game");
const statesBelow = () => fs.readdirSync(path.join(GAME, "history", "states")).map((f) => fs.readFileSync(path.join(GAME, "history", "states", f), "utf8"));
// the share of each kind of state below that holds a hub, off the files just written
const shareBelow = (() => {
  const hubAt = new Set(fs.readFileSync(path.join(GAME, "map", "supply_nodes.txt"), "utf8").split(/\r?\n/).map((l) => +l.trim().split(/\s+/)[1]).filter(Boolean));
  const per = new Map();
  for (const t of statesBelow()) {
    const cat = /state_category=(\w+)/.exec(t)[1], provs = /provinces=\{([^}]*)\}/.exec(t)[1].trim().split(/\s+/).map(Number);
    const r = per.get(cat) || { n: 0, hub: 0 }; r.n++; if (provs.some((p) => hubAt.has(p))) r.hub++; per.set(cat, r);
  }
  return (cat) => per.get(cat).hub / per.get(cat).n;
})();
// what a state of each kind's victory point is worth below, off the same files
const vpOfKindBelow = (() => {
  const per = new Map();
  for (const t of statesBelow()) { const cat = /state_category=(\w+)/.exec(t)[1], v = +/victory_points = \{ \d+ ([\d.]+)/.exec(t)[1]; per.set(cat, (per.get(cat) || []).concat(v)); }
  return (cat) => { const a = per.get(cat) || []; return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; };
})();
// each country's own land in pieces, as the states on disk hand it out: four-neighbour cells of one owner (wrap seam kept apart by
// the sea columns); `coast` a cell beside the sea, which is one body here, the ocean
const ownPiecesOn = (states) => {
  const ownerOfP = new Map(); for (const s of states) for (const p of s.provinces) if (s.owner) ownerOfP.set(p, s.owner);
  const out = new Map();
  const nb = (u) => { const c = (u - 1) % COLS; return [c > 0 ? u - 1 : -1, c < COLS - 1 ? u + 1 : -1, u - COLS, u + COLS].filter((v) => v >= 1 && v <= COLS * ROWS); };
  for (const p of [...ownerOfP.keys()].sort((a, b) => a - b)) {
    if (out.has(p)) continue;
    const q = [p]; out.set(p, p);
    while (q.length) { const u = q.pop(); for (const v of nb(u)) if (!out.has(v) && ownerOfP.get(v) === ownerOfP.get(p)) { out.set(v, p); q.push(v); } }
  }
  return { of: (p) => out.get(p), coast: (k) => [...out].some(([p, r]) => r === k && nb(p).some((v) => !LAND.has(v))) };
};
// #a-capital-is-its-countrys-most-important-state, asked of what is on disk: a generated state's star is worth its kind's below, then
// the more people (md.mostImportantState) — within the piece of its land a ship reaches and most of its people live on
// (#a-capital-stands-where-its-country-can-reach: the most people among the pieces with a coast; every piece here has one)
const mostImportantOf = (states, tag) => {
  const own = states.filter((s) => s.owner === tag && s.provinces.length), pc = ownPiecesOn(states);
  const people = new Map(); for (const s of own) { const k = pc.of(s.provinces[0]); people.set(k, (people.get(k) || 0) + s.manpower); }
  const pool = [...people.keys()].some((k) => pc.coast(k)) ? [...people.keys()].filter((k) => pc.coast(k)) : [...people.keys()];
  const home = pool.sort((a, b) => people.get(b) - people.get(a) || a - b)[0];
  return md.mostImportantState(own.filter((s) => pc.of(s.provinces[0]) === home)
    .map((s) => ({ id: s.id, vp: vpOfKindBelow(s.category), vpSum: vpOfKindBelow(s.category), manpower: s.manpower })));
};
// …and whether `id` is one: as important as the one it names. A tie is not asked here — Generate land breaks a capital's by moving 1
// person to it from the tied state (#a-generated-country-keeps-its-economy; XXX's four cities tie below)
const importance = (s) => s ? [vpOfKindBelow(s.category), s.manpower].join("/") : "";
const isMostImportant = (states, tag, id) => { const st = states.find((s) => s.id === id); return !!st && st.owner === tag && importance(st) === importance(states.find((s) => s.id === mostImportantOf(states, tag))); };
// each state's harbours on disk, { province, level }, by state id
const portsOn = (mod) => {
  const m = md.buildMapModel({ modRoot: mod, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false }), out = new Map();
  for (const s of (m.states || []).filter(Boolean)) for (const [p, b] of Object.entries(s.provinceBuildings || {})) if (Number((b || {}).naval_base) > 0) {
    if (!out.has(s.id)) out.set(s.id, []); out.get(s.id).push({ province: +p, level: Number(b.naval_base) });
  }
  return out;
};
// THE CONTROL: the hub chooser asked again over the states Generate land wrote, as generateSupplyNetwork asks it — the share below
// per kind, the hub on the state's victory point, the urban provinces the city pass retyped, the capitals `capitalOf` (tag → id), a
// state reached when it lies on its owner's capital's piece or on a piece holding a harbour of its owner's while the capital's piece
// holds one too, and each piece's harbours (#a-hub-stands-on-its-pieces-harbour) — with one clause turned off at a time
// (`seaRoutes: false` judges reach by land alone; `harbourStep: false` asks no piece's harbour — YYY's capital's piece has its
// harbour on R12's star, so without the capital clause that step alone would still hub it). Asked as it is, it must give exactly
// the hubs on disk, or it is not a control.
function chooseAgain(mod, made, capitalOf, { capitalClause = true, reachGuard = true, seaRoutes = true, harbourStep = true, notUrban = [] } = {}) {
  const urban = urbanOn(mod), ports = portsOn(mod), pc = ownPiecesOn(statesOn(mod));
  for (const p of notUrban) urban.delete(p);   // asked as if these held no town
  const capPiece = new Map([...capitalOf].map(([tag, id]) => [tag, new Set(((made.find((s) => s.id === id) || {}).provinces || []).map((p) => pc.of(p)))]));
  const portPieces = new Set(); for (const [, list] of ports) for (const pt of list) portPieces.add(pc.of(pt.province));
  const records = made.map((s) => ({ id: s.id, category: s.category, provinces: s.provinces, owner: s.owner, vpValue: s.vpValue, vp: s.vp, urban: s.provinces.some((p) => urban.has(p)),
    ports: ports.get(s.id) || [] }));
  const reached = (s) => {
    const cap = capPiece.get(s.owner) || new Set(), capPort = [...cap].some((k) => portPieces.has(k));
    return s.provinces.some((p) => cap.has(pc.of(p)) || (seaRoutes && capPort && portPieces.has(pc.of(p))));
  };
  const piecesOf = (t) => new Set(made.filter((s) => s.owner === t).map((s) => pc.of(s.provinces[0]))).size;
  const r = md.chooseSupplyHubs({ states: records, rateOf: shareBelow, capitalStateIds: capitalClause ? [...capitalOf.values()] : [],
    routable: reachGuard ? (s) => !s.owner || reached(s) : null,
    hubProvinceOf: (s) => s.vp, ...(harbourStep ? { portsOf: (s) => s.ports, pieceOf: (p) => pc.of(p) || null, piecesOf } : {}) });
  return new Set(r.hubs.map((h) => h.province));
}
const sameSet = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

console.log("\n-- PART 1: Generate land, as the page asks for it, under a mod Delete map has emptied --");
const MOD = makeMod("mod");
const gen = generate(GAME, MOD, LAND.size);
const made = statesOn(MOD);
ok(gen && gen.changed && made.length === STATES.length && made.every((s) => nameOf(s)) && new Set(made.map(nameOf)).size === STATES.length
  && made.every((s, i) => s.id === gen.firstStateId + i) && gen.lastStateId === gen.firstStateId + STATES.length - 1,
  `(guard: Generate land raised the ${STATES.length} states of the land below, one a region, known by their provinces, with the ids it reports)`, gen && (gen.error || made.map((s) => [s.id, nameOf(s)])));
// ⚠️ moved with #a-generated-country-keeps-its-economy: XXX's four cities tie on their star and their people, and a capital tied so
// takes 1 person from the tied state with the lower id (the id that breaks a tie is its line's, given after it was chosen) — so
// each state holds its people below give or take that one, and each country exactly its own
const peopleOf = (states, tag, pick) => states.filter((s) => s.owner === tag).reduce((a, s) => a + pick(s), 0);
ok(made.every((s) => { const b = S[nameOf(s)]; return b && s.category === b.category && s.owner === b.owner && Math.abs(s.manpower - b.manpower) <= 1; })
  && [...new Set(STATES.map((s) => s.owner))].every((t) => peopleOf(made, t, (s) => s.manpower) === peopleOf(STATES, t, (s) => s.manpower)),
  "(the fixture: each came back with its kind, its country and its people, a capital's tie broken by 1 person)", made.map((s) => [s.id, nameOf(s), s.category, s.owner, s.manpower]));
const sn = gen.supplyNetwork || {};
ok(sn.changed && sn.density && sn.density.fromLayerBelow === true && sn.density.topUp === 0, "(guard: the hubs were chosen by the map underneath, and none was added for area)", sn.density || sn);

console.log("\n-- Auto-fix, once and again --");
const fix1 = md.autoFixMap({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
ok(fix1 && fix1.ok === true, "(guard: the click ran)", fix1 && (fix1.error || Object.keys(fix1.fixes || {})));
const capFix = (fix1.fixes || {}).capitals || {};
const supplyAfter1 = fs.readFileSync(path.join(MOD, "map", "supply_nodes.txt")), railAfter1 = fs.readFileSync(path.join(MOD, "map", "railways.txt"));
const fix2 = md.autoFixMap({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
ok(fix2 && fix2.ok === true, "(guard: the second click ran)", fix2 && fix2.error);

const model = md.buildMapModel({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });
const final = statesOn(MOD), hubs = new Set(hubsOn(MOD));
const byId = new Map(final.map((s) => [s.id, s]));
const hubbed = (s) => s.provinces.some((p) => hubs.has(p));
const capitals = Object.entries(model.capitals || {}).filter(([tag]) => final.some((s) => s.owner === tag)).sort();
const capitalOf = new Map(capitals);
const urban1 = urbanOn(MOD);

console.log("\n-- ⭐ (a) every country's final capital state holds a hub, on its victory point --");
{
  ok(capitals.map(([t]) => t).join() === "XXX,YYY", "(the fixture: two countries hold land, each with a capital)", capitals);
  ok(capitals.every(([tag, cap]) => isMostImportant(final, tag, cap)) && Number(capFix.fixed) === 0,
    "(the fixture: Generate land made each capital its country's most important state, so Auto-fix moved none)",
    { capitals: capitals.map(([t, id]) => [t, id, nameOf(byId.get(id) || { provinces: [] }), importance(byId.get(id))]), want: capitals.map(([t]) => [t, importance(byId.get(mostImportantOf(final, t)))]), capFix });
  const xxx = byId.get(capitalOf.get("XXX")), yyy = byId.get(capitalOf.get("YYY"));
  ok(xxx && xxx.owner === "XXX" && nameOf(xxx) !== "R1",
    `(the fixture: XXX's line named R1 below, its smallest state, and its capital ends on ${xxx && nameOf(xxx)} — the hub must follow the capital, not the land the line named)`, { xxx, line: idBelow("R1") });
  // ⚠️ MOVED WITH #every-generated-capital-has-a-city: this said YYY's capital is one province with no town. Every capital gets one
  // now, and YYY's is the town the city pass gives a capital its count passed over — so the clause's CONTROL below asks the chooser
  // as if that town were not there, which is a capital on a map whose city pass could not run
  const capTowns = ((gen && gen.cities && gen.cities.forCapitals) || []).filter((p) => yyy && yyy.provinces.includes(p));
  ok(yyy && yyy.owner === "YYY" && yyy.provinces.length === 1 && capTowns.length === 1 && urban1.has(capTowns[0]),
    `(the fixture: YYY's capital, ${yyy && nameOf(yyy)}, is one province, whose only town is the one every capital is given — the last of its kind in a hub share's order without it)`, { yyy, forCapitals: gen && gen.cities && gen.cities.forCapitals });
  const asked = chooseAgain(MOD, made, capitalOf);
  ok(sameSet(asked, hubs), "(CONTROL: the chooser asked again as Generate land asked it gives exactly the hubs on disk)", { asked: [...asked].sort((a, b) => a - b), onDisk: [...hubs].sort((a, b) => a - b) });
  const noClause = chooseAgain(MOD, made, capitalOf, { capitalClause: false, harbourStep: false, notUrban: capTowns });
  ok(yyy && !noClause.has(yyy.vp), `(CONTROL: without the capital clause the shares alone leave YYY's capital, ${yyy && nameOf(yyy)}, without a hub)`, { noClause: [...noClause].map((p) => nameOf(final.find((s) => s.provinces.includes(p)))) });
  for (const [tag, cap] of capitals) {
    const st = byId.get(cap);
    ok(st && st.owner === tag && st.vp > 0 && hubs.has(st.vp), `⭐⭐ ${tag}'s capital, state ${cap} (${st && nameOf(st)}), holds a hub on its victory point`, { st, hubs: [...hubs] });
  }
}

console.log("\n-- ⭐ (b) no hub on land its country reaches neither by rail nor by sea; the island is reached by sea --");
const own1 = ownPiecesOn(final);
const capPiece = new Map(capitals.map(([t, id]) => [t, new Set(((byId.get(id) || {}).provinces || []).map((p) => own1.of(p)))]));
const island = final.find((s) => nameOf(s) === "RI");
{
  // the harbours on disk, by the piece of their owner's land they stand on
  const ports = new Set(); for (const s of (model.states || []).filter(Boolean)) for (const [p, b] of Object.entries(s.provinceBuildings || {})) if (Number((b || {}).naval_base) > 0) ports.add(own1.of(+p));
  ok(island && island.owner === "XXX" && final.every((s) => s === island || s.category !== "rural" || s.provinces.length < island.provinces.length)
    && capPiece.has("XXX") && !capPiece.get("XXX").has(own1.of(island.provinces[0])),
    "(the fixture: XXX's island is larger than any other rural state, and XXX's capital is on the mainland)", { island });
  ok(island && ports.has(own1.of(island.provinces[0])) && [...capPiece.get("XXX")].some((k) => ports.has(k)),
    "(the fixture: Generate land gave the island a harbour, and XXX's capital's piece one — #a-country-reaches-its-land-by-sea)", { island, ports: [...ports] });
  const byLand = chooseAgain(MOD, made, capitalOf, { seaRoutes: false });
  ok(island && !byLand.has(island.vp), "(CONTROL: reach judged by land alone, the rural share would leave the island without a hub)", { island: island && island.vp, byLand: [...byLand] });
  const stranded = [...hubs].filter((p) => {
    const s = final.find((x) => x.provinces.includes(p)); if (!s || !s.owner) return false;
    const cap = capPiece.get(s.owner) || new Set();
    return !cap.has(own1.of(p)) && !([...cap].some((k) => ports.has(k)) && ports.has(own1.of(p)));
  });
  ok(stranded.length === 0 && hubbed(island), "⭐⭐ no hub stands on land its country can reach neither by its own rail nor by sea — and the island, reached by sea, has one", { stranded, island: island && hubbed(island) });
}

console.log("\n-- (c) per kind, the share below of its states, capitals counted --");
{
  for (const cat of ["city", "town", "rural"]) {
    const group = final.filter((s) => s.category === cat);
    const want = Math.round(shareBelow(cat) * group.length), got = group.filter(hubbed);
    ok(got.length === want, `⭐⭐ ${cat}: ${want} of its ${group.length} states hold a hub — round(${shareBelow(cat)} × states)`, got.map(nameOf));
  }
  // the island's turn: the rural slots must outlast the rural capitals and every rural state the chooser's order puts ahead of the
  // island — one holding a town where the island holds none, then one with more provinces (none: the island is the largest)
  const rural = final.filter((s) => s.category === "rural"), isCap = (s) => capitals.some(([, id]) => id === s.id);
  const town = (s) => s.provinces.some((p) => urban1.has(p)), reach = (s) => s.provinces.some((p) => (capPiece.get(s.owner) || new Set()).has(own1.of(p)));
  const capIn = rural.filter(isCap).length;
  const ahead = !island ? NaN : rural.filter((s) => s !== island && !isCap(s) && reach(s) && (town(s) !== town(island) ? town(s) : s.provinces.length > island.provinces.length)).length;
  const want = Math.round(shareBelow("rural") * rural.length);
  ok(capIn >= 1 && want > capIn + ahead, "(the fixture: the rural share leaves slots past the capitals and the states ahead of the island — the island's turn comes)", { capIn, ahead, want, islandHasTown: island && town(island) });
}

console.log("\n-- (d) Auto-fix leaves the network alone, and a second click writes nothing --");
{
  ok(fs.readFileSync(path.join(MOD, "map", "supply_nodes.txt")).equals(supplyAfter1) && fs.readFileSync(path.join(MOD, "map", "railways.txt")).equals(railAfter1),
    "⭐ the second Auto-fix leaves supply_nodes.txt and railways.txt byte for byte", { sn1: (fix1.fixes || {}).supplyNetwork, sn2: (fix2.fixes || {}).supplyNetwork });
  ok(hubs.size === sn.hubs, "…and the hubs on disk are exactly as many as Generate land wrote", { onDisk: hubs.size, wrote: sn.hubs });
}

console.log("\n-- (e) every hub of a country on its capital's land is joined to the capital by rail --");
{
  const rails = md.parseRailways(fs.readFileSync(path.join(MOD, "map", "railways.txt"), "utf8"));
  const g = new Map(), link = (u, v) => { if (!g.has(u)) g.set(u, new Set()); g.get(u).add(v); };
  for (const r of rails) for (let i = 1; i < r.provinces.length; i++) { link(r.provinces[i - 1], r.provinces[i]); link(r.provinces[i], r.provinces[i - 1]); }
  for (const [tag, cap] of capitals) {
    const st = byId.get(cap); if (!st) { ok(false, `⭐ ${tag}'s capital state ${cap} is on disk`); continue; }
    const seen = new Set([st.vp]), q = [st.vp];
    while (q.length) { const u = q.shift(); for (const v of (g.get(u) || [])) if (!seen.has(v)) { seen.add(v); q.push(v); } }
    const mine = [...hubs].filter((p) => { const s = final.find((x) => x.provinces.includes(p)); return s && s.owner === tag && own1.of(p) === own1.of(st.vp); });
    ok(mine.length > 1 && mine.every((p) => seen.has(p)), `⭐ all ${mine.length} of ${tag}'s hubs on its capital's land are on the capital's railway`, { cut: mine.filter((p) => !seen.has(p)), rails: rails.length });
  }
}

console.log("\n-- PART 2: a mod that already holds R9, handed to ZZZ — Generate land leaves YYY's line on it, and Auto-fix moves it --");
{
  const MOD2 = makeMod("mod-kept", { name: "R9", owner: "ZZZ" });
  const gen2 = generate(GAME, MOD2, LAND.size - S.R9.provinces.length);
  const new2 = new Set(((gen2 && gen2.newStates) || []).map((s) => s.id));
  const made2 = statesOn(MOD2).filter((s) => new2.has(s.id));
  const kept = statesOn(MOD2).find((s) => nameOf(s) === "R9");
  const before2 = md.buildMapModel({ modRoot: MOD2, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });
  ok(gen2 && gen2.changed && made2.length === STATES.length - 1 && made2.every((s) => nameOf(s) && nameOf(s) !== "R9") && kept && kept.owner === "ZZZ"
    && (before2.capitals || {}).YYY === kept.id,
    "(the fixture: Generate land raised every other state, and left YYY's capital line on R9, a state the mod already had — ZZZ's now)",
    { error: gen2 && gen2.error, made: made2.map((s) => [s.id, nameOf(s), s.owner]), kept, capitals: before2.capitals, countries: gen2 && gen2.countries && gen2.countries.capitals });
  const fixK = md.autoFixMap({ modRoot: MOD2, gameRoot: GAME, dependencyRoots: [] });
  const cf = ((fixK && fixK.fixes) || {}).capitals || {};
  const model2 = md.buildMapModel({ modRoot: MOD2, gameRoot: GAME, dependencyRoots: [], cacheStableLayers: false });
  const final2 = statesOn(MOD2), hubs2 = new Set(hubsOn(MOD2));
  const ycap = final2.find((s) => s.id === (model2.capitals || {}).YYY);
  ok(fixK && fixK.ok === true && ycap && isMostImportant(final2, "YYY", ycap.id)
    && (cf.details || []).some((d) => d.tag === "YYY" && d.from === (kept || {}).id && d.to === ycap.id),
    `(the fixture: Auto-fix, not Generate land, moved YYY's capital off ZZZ's state onto YYY's most important own, ${ycap && nameOf(ycap)})`, { ycap, capFix: cf, error: fixK && fixK.error });
  ok(ycap && ycap.provinces.length === 1 && !ycap.provinces.some((p) => urbanOn(MOD2).has(p)),
    `(the fixture: that state, ${ycap && nameOf(ycap)}, is one province with no town)`, { ycap });
  const capitalOf2 = new Map(Object.entries(model2.capitals || {}).filter(([tag]) => made2.some((s) => s.owner === tag)));
  const asked2 = chooseAgain(MOD2, made2, capitalOf2);
  ok(sameSet(asked2, hubs2), "(CONTROL: the chooser asked again, with the capitals Auto-fix left, gives exactly the hubs on disk)", { asked: [...asked2].sort((a, b) => a - b), onDisk: [...hubs2].sort((a, b) => a - b), capitals: [...capitalOf2] });
  const noClause2 = chooseAgain(MOD2, made2, capitalOf2, { capitalClause: false, harbourStep: false });
  ok(ycap && !noClause2.has(ycap.vp), `(CONTROL: without the capital clause the shares alone leave ${ycap && nameOf(ycap)} without a hub)`, { noClause: [...noClause2] });
  ok(ycap && ycap.vp > 0 && hubs2.has(ycap.vp), `⭐⭐ (f) YYY's capital after Auto-fix, state ${ycap && ycap.id} (${ycap && nameOf(ycap)}), holds the hub Generate land put on its victory point`, { ycap, hubs: [...hubs2] });
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
