// ⛔ #a-capital-stands-where-its-country-can-reach — A GENERATED COUNTRY'S CAPITAL STANDS ON THE PIECE OF ITS LAND FROM WHICH ITS SUPPLY
// REACHES MOST OF THE ARMY IT STARTS; WITH NO ARMY TO TELL THEM APART, THE ONE A SHIP CAN REACH AND MOST OF ITS PEOPLE LIVE ON.
//
// TEST 33 (the owner's flow: New mod → Delete map → Generate land 35% seed 1, inherit → Auto-fix → Redraw regions): 40.06% of the owned
// land had no supply route to its capital (the base game 0.40%). Part of it: Generate land's chooseCapitals took each country's most
// important state of ALL its land, wherever it stood — GER's capital was a 151 px megalopolis islet over Berlin's old provinces and
// CAN's a 324 px one, neither with a port or a railway. The fix put it on the most populous piece that opens onto the ocean — and the
// review of 2d26d727 found Portugal's capital on a coastal piece reaching 2 of its 18 started divisions while 13 stood on a coastless
// one. So: one piece, that one; more, the piece whose capital reaches the most of the started army (its own, and — a country that
// ships, from the coast — every coastal piece's), then the one holding the most of that army itself, then the coast and the people;
// and the most important state within it.
//
// The fixture is one world in which each piece happens once — 10 x 6 blocks of 64 px, province = col + row x 10 + 1, x wrapping:
//   X's  A  two provinces of city on the ocean, more people than any other piece of X's that opens onto the ocean;
//        I  a one-province megalopolis islet — X's most important state below, and the state its capital line names;
//        B  three provinces of rural land on the ocean: X's LARGEST piece that opens onto it, with fewer people than A;
//        E  an exclave inside Y's land whose only sea is a pond Y's land walls off, with the most people of X's anywhere;
//        F  an exclave inside Y's land with no sea at all;
//   Y's  one block of land round E, the pond and F.
// …and two more worlds on the same grid: 3. the keep pass hands a needy country a group of X's, so the piece most of X's people live
// on is the other one AFTER it (the pieces are asked of the owners as they are on each call); 4. two pieces of X's land joined by
// an adjacencies.csv strait are one piece, and by an `impassable` row they are two — and then the report and the page name X, whose
// most important state stands on the piece its capital does not.
// Every expected value is derived from the manifest by grid arithmetic, never read off the writer. Fixture-only: binds no port.
// Run: node test-a-capital-stands-where-its-country-can-reach.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-capital-piece-"));
process.env.APPDATA = path.join(SANDBOX, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(SANDBOX, "home");
process.env.HOI4_MODS_ROOT = SANDBOX;
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };
let made = 0;
const tmpDir = (tag) => { const d = path.join(SANDBOX, `${tag}-${++made}`); fs.mkdirSync(d, { recursive: true }); return d; };
const sorted = (a) => [...a].map(Number).sort((x, y) => x - y);
const sameSet = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

// ── the grid: COLS x ROWS blocks of 64 px, province = col + row x COLS + 1; x wraps across the seam, y does not ─────────────────────
const B = 64, COLS = 10, ROWS = 6, W = COLS * B, H = ROWS * B, N = COLS * ROWS;
const at = (c, r) => ((c + COLS) % COLS) + r * COLS + 1;
const colOf = (p) => (p - 1) % COLS, rowOf = (p) => Math.floor((p - 1) / COLS);
const neighbours = (p) => { const c = colOf(p), r = rowOf(p); return [at(c - 1, r), at(c + 1, r)].concat(r > 0 ? [at(c, r - 1)] : [], r < ROWS - 1 ? [at(c, r + 1)] : []); };
const COL = (p) => [((p * 37) % 200) + 20, ((p * 71) % 200) + 20, ((p * 113) % 200) + 20];
const bmp = () => {
  const rs = (W * 3 + 3) & ~3, size = rs * H, b = Buffer.alloc(54 + size);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + size, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(size, 34);
  for (let y = 0; y < H; y++) { let o = 54 + (H - 1 - y) * rs; for (let x = 0; x < W; x++) { const [r, g, bl] = COL(Math.floor(x / B) + Math.floor(y / B) * COLS + 1); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
};
const csv = (land) => ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: N }, (_, i) => {
  const p = i + 1, [r, g, b] = COL(p), l = land.includes(p);
  return `${p};${r};${g};${b};${l ? "land" : "sea"};false;${l ? "plains" : "ocean"};${l ? 1 : 0}`;
})).join("\n") + "\n";

// ── ⛔ THE MANIFEST ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
const PIECE = {
  A: [at(0, 1), at(1, 1)],
  I: [at(0, 3)],
  B: [at(3, 4), at(4, 4), at(5, 4)],
  E: [at(4, 2)],
  F: [at(7, 2)],
};
const POND = at(5, 2);
const YLAND = [];
for (let r = 1; r <= 3; r++) for (let c = 3; c <= 8; c++) { const p = at(c, r); if (![PIECE.E[0], PIECE.F[0], POND].includes(p)) YLAND.push(p); }
// the states below, one region each: owner, category, manpower, victory point value; the capital lines name XI and YY
const BELOW = [
  { id: 1, name: "XA", tag: "XXX", provinces: PIECE.A, category: "city", manpower: 3000000, vp: 10 },
  { id: 2, name: "XI", tag: "XXX", provinces: PIECE.I, category: "megalopolis", manpower: 500000, vp: 30, port: 6 },
  { id: 3, name: "XB", tag: "XXX", provinces: PIECE.B, category: "rural", manpower: 1000000, vp: 1 },
  { id: 4, name: "XE", tag: "XXX", provinces: PIECE.E, category: "rural", manpower: 5000000, vp: 1 },
  { id: 5, name: "XF", tag: "XXX", provinces: PIECE.F, category: "rural", manpower: 4000000, vp: 1 },
  { id: 6, name: "YY", tag: "YYY", provinces: YLAND, category: "rural", manpower: 2000000, vp: 1 },
];
const CAPITAL_LINE = { XXX: 2, YYY: 6 };
const LAND = BELOW.flatMap((s) => s.provinces);

/** the game: `below` its states (each its own strategic region, or `region` when two share one), `capitals` tag → capital line,
 *  `adjacencies` rows "from;to;type;through" for map/adjacencies.csv; `units` tag → the provinces its 1936 divisions stand on (one
 *  each), `convoys` the tags whose history sets convoys */
function buildGame(below = BELOW, capitals = CAPITAL_LINE, adjacencies = [], { units = {}, convoys = [] } = {}) {
  const g = tmpDir("game");
  const land = below.flatMap((s) => s.provinces);
  mk(g, "map/provinces.bmp", bmp());
  mk(g, "map/definition.csv", csv(land));
  const regions = new Map();
  for (const s of below) { const r = s.region || s.id; regions.set(r, (regions.get(r) || []).concat(s.provinces)); }
  for (const [r, ps] of regions) mk(g, `map/strategicregions/${r}.txt`, `strategic_region={\n\tid=${r}\n\tname="REGION_${r}"\n\tprovinces={ ${ps.join(" ")} }\n\tweather={}\n}\n`);
  for (const s of below) {
    const port = s.port ? `\t\tbuildings = {\n\t\t\t${s.provinces[0]} = {\n\t\t\t\tnaval_base = ${s.port}\n\t\t\t}\n\t\t}\n` : "";
    mk(g, `history/states/${s.id}.txt`, `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = ${s.manpower}\n\tstate_category = ${s.category}\n\tprovinces = { ${s.provinces.join(" ")} }\n`
      + `\thistory = {\n\t\towner = ${s.tag}\n\t\tvictory_points = { ${s.provinces[0]} ${s.vp} }\n${port}\t}\n}\n`);
  }
  for (const [t, id] of Object.entries(capitals)) mk(g, `history/countries/${t} - ${t}land.txt`, `capital = ${id}\n`
    + (units[t] ? `oob = "${t}_1936"\n` : "") + (convoys.includes(t) ? "set_convoys = 10\n" : ""));
  for (const [t, locs] of Object.entries(units)) mk(g, `history/units/${t}_1936.txt`, 'division_template = { name = "Inf" regiments = { infantry = { x = 0 y = 0 } } }\nunits = {\n'
    + locs.map((p, i) => `\tdivision = { name = "D${i + 1}" location = ${p} division_template = "Inf" start_experience_factor = 0.1 }\n`).join("") + "}\n");
  if (adjacencies.length) mk(g, "map/adjacencies.csv", ["From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment"]
    .concat(adjacencies.map((a) => `${a};-1;-1;-1;-1;;`), ["-1;-1;-1;-1;-1;-1;-1;-1;-1"]).join("\n") + "\n");
  return g;
}
function buildMod() {
  const m = tmpDir("mod");
  mk(m, "descriptor.mod", 'version="1"\nname="Capital piece"\nreplace_path="history/states"\npath="mod/capitalpiece"\n');
  mk(m, "map/provinces.bmp", bmp());
  mk(m, "map/definition.csv", csv([]));
  return m;
}
function readStates(modRoot) {
  const dir = path.join(modRoot, "history", "states");
  return fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
    return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], provinces: (((/\bprovinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g).map(Number),
      owner: (/\bowner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1] || "" };
  });
}
const GEN = (mod, game, count = LAND.length) => ({ modRoot: mod, gameRoot: game, dependencyRoots: [], count, provincesPerState: 8, seed: 3, ownerMode: "inherit",
  fillCutOffSeas: false, roughenCoast: false });

// ── what the manifest says, by grid arithmetic ─────────────────────────────────────────────────────────────────────────────────────
const landSet = new Set(LAND);
const sea = Array.from({ length: N }, (_, i) => i + 1).filter((p) => !landSet.has(p));
const seaSet = new Set(sea);
// the sea bodies, largest first: the ocean, and the pond
const bodies = (() => { const seen = new Set(), out = []; for (const p of sea) { if (seen.has(p)) continue; const b = [p]; seen.add(p);
  for (let i = 0; i < b.length; i++) for (const q of neighbours(b[i])) if (seaSet.has(q) && !seen.has(q)) { seen.add(q); b.push(q); } out.push(b); }
  return out.sort((a, b) => b.length - a.length); })();
const ocean = new Set(bodies[0]);
const opens = (p) => { const s = neighbours(p).filter((q) => seaSet.has(q)); return s.length > 0 && s.every((q) => ocean.has(q)); };
const ownerOf = new Map(); for (const s of BELOW) for (const p of s.provinces) ownerOf.set(p, s.tag);
const piecesOfX = (() => { const seen = new Set(), out = []; for (const p of LAND.filter((q) => ownerOf.get(q) === "XXX")) { if (seen.has(p)) continue; const b = [p]; seen.add(p);
  for (let i = 0; i < b.length; i++) for (const q of neighbours(b[i])) if (ownerOf.get(q) === "XXX" && !seen.has(q)) { seen.add(q); b.push(q); } out.push(sorted(b)); } return out; })();
const people = (ps) => BELOW.filter((s) => s.provinces.some((p) => ps.includes(p))).reduce((n, s) => n + s.manpower, 0);
const coastal = piecesOfX.filter((ps) => ps.some(opens));
const byPeople = (list) => list.slice().sort((a, b) => people(b) - people(a))[0];
const WANT = byPeople(coastal);                                                   // the rule
const MOST_PEOPLE = byPeople(piecesOfX);                                          // …without the coast filter
const LARGEST_COASTAL = coastal.slice().sort((a, b) => b.length - a.length)[0];   // …by area, not people
const MOST_IMPORTANT = BELOW.filter((s) => s.tag === "XXX").sort((a, b) => b.vp - a.vp || b.manpower - a.manpower)[0].provinces;   // …with no piece at all

console.log("=== 0. the fixture can tell right from wrong (controls, from the manifest alone) ===");
rec("CONTROL: X's land is five pieces, every one a state of its own below", piecesOfX.length === 5 && piecesOfX.every((ps) => BELOW.some((s) => sameSet(s.provinces, ps))), piecesOfX);
rec("CONTROL: the pond is a sea of its own, walled off by Y's land, and E's only sea", bodies.length === 2 && sameSet(bodies[1], [POND]) && neighbours(PIECE.E[0]).filter((q) => seaSet.has(q)).every((q) => q === POND));
rec("CONTROL: A, I and B open onto the ocean; E (a pond coast) and F (no sea) do not", sameSet(coastal.flat(), [...PIECE.A, ...PIECE.I, ...PIECE.B]), coastal);
rec("CONTROL: the rule's piece is A", sameSet(WANT, PIECE.A), WANT);
rec("CONTROL: X's most important state of all its land is the islet — what the old rule took", sameSet(MOST_IMPORTANT, PIECE.I) && !sameSet(MOST_IMPORTANT, WANT));
rec("CONTROL: the most populous piece of all is E, which no ship reaches — what the rule takes without its coast filter", sameSet(MOST_PEOPLE, PIECE.E) && !sameSet(MOST_PEOPLE, WANT));
rec("CONTROL: the largest piece that opens onto the ocean is B — what the rule takes by area instead of people", sameSet(LARGEST_COASTAL, PIECE.B) && !sameSet(LARGEST_COASTAL, WANT));

console.log("\n=== 1. ownLandPieces and capitalPieceFor, pure ===");
{
  // the groups as Generate land makes them here: one per state below, ids in manifest order; links the grid's land neighbours
  const groups = BELOW.map((s) => ({ id: s.id, provinces: s.provinces.slice() }));
  const tagOf = new Map(BELOW.map((s) => [s.id, s.tag]));
  const pieces = md.ownLandPieces({ groups, ownerOf: (g) => tagOf.get(g.id), links: (p) => neighbours(p).filter((q) => landSet.has(q)), opens,
    peopleOf: (g) => BELOW.find((s) => s.id === g.id).manpower });
  const x = pieces.get("XXX") || [];
  rec("⭐ X's land comes back as its five pieces", x.length === piecesOfX.length && piecesOfX.every((ps) => x.some((pc) => sameSet(pc.groups.flatMap((g) => g.provinces), ps))),
    x.map((pc) => pc.groups.map((g) => g.id)));
  rec("…each with its people, its province count and whether it opens onto the ocean",
    x.every((pc) => { const ps = pc.groups.flatMap((g) => g.provinces); return pc.people === people(ps) && pc.provinces === ps.length && pc.coast === ps.some(opens); }),
    x.map((pc) => [pc.groups.map((g) => g.id), pc.people, pc.provinces, pc.coast]));
  rec("…and Y's land is one piece: another country's land between two of X's joins nothing", (pieces.get("YYY") || []).length === 1);
  // a link the caller passes joins two pieces — the strait the planner walks, an adjacencies.csv row that is not `impassable`
  const joined = md.ownLandPieces({ groups, ownerOf: (g) => tagOf.get(g.id), opens, peopleOf: () => 0,
    links: (p) => neighbours(p).filter((q) => landSet.has(q)).concat(p === PIECE.A[0] ? [PIECE.I[0]] : p === PIECE.I[0] ? [PIECE.A[0]] : []) });
  rec("…and a link between two pieces makes them one", (joined.get("XXX") || []).length === piecesOfX.length - 1);
  const pick = md.capitalPieceFor(x);
  const got = pick ? pick.groups.flatMap((g) => g.provinces) : [];
  rec("⭐⭐ capitalPieceFor: the piece with the most people among those that open onto the ocean — A", sameSet(got, WANT), got);
  rec("⭐ …not the most populous piece of all, E, which opens onto no ocean", !sameSet(got, MOST_PEOPLE), got);
  rec("⭐ …and by people, not area: not B, the largest piece on the ocean", !sameSet(got, LARGEST_COASTAL), got);
  const inland = x.filter((pc) => !pc.coast);
  const p2 = md.capitalPieceFor(inland);
  rec("…with no piece on the ocean, the most people of all", !!p2 && sameSet(p2.groups.flatMap((g) => g.provinces), byPeople(inland.map((pc) => pc.groups.flatMap((g) => g.provinces)))));
  rec("…one piece is itself, and none is null", md.capitalPieceFor([x[0]]) === x[0] && md.capitalPieceFor([]) === null);

  // ⛔ THE STARTED ARMY DECIDES FIRST (review of 2d26d727: TEST 33's Portugal put its capital on a 41,013 px coastal piece with 2 of its 18
  // divisions while 13 stood on a coastless one). A piece is scored by the divisions a capital there reaches: its own, and — a country
  // that ships, on a piece that opens onto the ocean — those of every piece that does. A tie goes to the piece holding the most of that
  // army ITSELF (on the capital's own rail: the base game's BEL and HOL, whose capitals the people would put in the Congo and the
  // Indies); only then the coast and the people.
  const nameOf = (pc) => Object.keys(PIECE).find((k) => sameSet(PIECE[k], pc.groups.flatMap((g) => g.provinces)));
  const armed = (army) => x.map((pc) => Object.assign({}, pc, { army: army[nameOf(pc)] || 0 }));
  const isCoastal = (k) => coastal.some((ps) => sameSet(ps, PIECE[k]));
  const reachArmy = (army, k, ships) => (ships && isCoastal(k) ? Object.keys(PIECE).filter(isCoastal).reduce((n, j) => n + (army[j] || 0), 0) : army[k] || 0);
  const top = (army, ships, by) => { const v = Object.keys(PIECE).map((k) => by(army, k, ships)), m = Math.max(...v); return Object.keys(PIECE).filter((k, i) => v[i] === m); };
  const best = (army, ships) => top(army, ships, reachArmy);
  const POR = { A: 1, I: 1, B: 1 }; POR.E = POR.A + POR.I + POR.B + 1;     // more on the walled-in piece than on every coastal one together
  const TIE = { A: 1, I: 1, B: 1 }; TIE.E = TIE.A + TIE.I + TIE.B;         // …exactly as many, all of it on E itself
  const EVEN = { A: 1, I: 1, B: 1, E: 1 };                                  // as many on each piece: the coast reaches more, and holds alike
  const OWN = { A: 1, I: 1, B: 2 };                                         // the coast reaches it all; B holds the most of it, A has more people
  const SEA = { A: 2, I: 1, B: 1 }; SEA.E = SEA.A + SEA.I + SEA.B - 1;      // fewer on E than the coast together, more than on any one coastal piece
  const ownOf = (army, k) => army[k] || 0;
  rec("CONTROL: the armies — POR's walled-in piece beats the coast together; TIE's ties it and holds more itself; EVEN's coast ties among itself;"
    + " OWN's coast ties and B holds the most; SEA's beats each coastal piece but not all of them, and A holds the most of the coast's",
    best(POR, true).join() === "E" && best(TIE, true).includes("E") && best(TIE, true).includes("A") && TIE.E > TIE.A
      && best(EVEN, true).every(isCoastal) && best(EVEN, true).every((k) => EVEN[k] === EVEN.A)
      && best(OWN, true).length === 3 && OWN.B > Math.max(OWN.A, OWN.I) && people(PIECE.A) > people(PIECE.B)
      && best(SEA, true).every(isCoastal) && best(SEA, false).join() === "E" && SEA.A > Math.max(SEA.I, SEA.B),
    { POR: best(POR, true), TIE: best(TIE, true), EVEN: best(EVEN, true), OWN: best(OWN, true), SEA: [best(SEA, true), best(SEA, false)], own: ownOf(OWN, "B") });
  const name = (pc) => (pc ? nameOf(pc) : null);
  rec("⭐⭐⭐ the walled-in piece that holds more of the started army than every coastal piece together takes the capital (Portugal)", name(md.capitalPieceFor(armed(POR))) === "E", name(md.capitalPieceFor(armed(POR))));
  rec("⭐⭐ …and on a tie of what they reach, the piece holding more of that army itself: E, with no convoy between it and its army", name(md.capitalPieceFor(armed(TIE))) === "E", name(md.capitalPieceFor(armed(TIE))));
  rec("⭐⭐ of the coastal pieces, which reach the same by sea, the one holding the most of the army itself: B, though A has more people", name(md.capitalPieceFor(armed(OWN))) === "B", name(md.capitalPieceFor(armed(OWN))));
  rec("⭐ …and with the army spread evenly over the coast, the coast and the people decide, as with no army: A", name(md.capitalPieceFor(armed(EVEN))) === "A", name(md.capitalPieceFor(armed(EVEN))));
  rec("⭐⭐ a country that ships reaches every coastal piece's army by sea: A, though E holds more than any one of them", name(md.capitalPieceFor(armed(SEA))) === "A", name(md.capitalPieceFor(armed(SEA))));
  rec("⭐⭐ …and one that cannot ship reaches only its own piece's: E", name(md.capitalPieceFor(armed(SEA), { ships: false })) === "E", name(md.capitalPieceFor(armed(SEA), { ships: false })));
  const counted = md.ownLandPieces({ groups, ownerOf: (g) => tagOf.get(g.id), links: (p) => neighbours(p).filter((q) => landSet.has(q)), opens,
    armyOf: (g, t) => (t === "XXX" ? g.provinces.reduce((n, p) => n + (p === PIECE.E[0] ? POR.E : 0), 0) : 99) }).get("XXX") || [];
  rec("⭐ ownLandPieces adds up each piece's army, asking armyOf of the piece's own country", counted.every((pc) => pc.army === (nameOf(pc) === "E" ? POR.E : 0)), counted.map((pc) => [nameOf(pc), pc.army]));
  // (review of 04d87b17, NS-9 MB24) …and a tie of army, coast and people goes to the piece with more provinces, then the lower id
  const lo = { groups: [{ id: 1, provinces: [1] }], coast: true, people: 5, provinces: 1, army: 0 }, hi = { groups: [{ id: 2, provinces: [2, 3, 4] }], coast: true, people: 5, provinces: 3, army: 0 };
  rec("⭐ a tie of people goes to the piece with more provinces, not the lower id", md.capitalPieceFor([lo, hi]) === hi && md.capitalPieceFor([hi, lo]) === hi);
  const lo2 = { ...lo, provinces: 3 };
  rec("…and a tie of that too, to the lower id", md.capitalPieceFor([hi, lo2]) === lo2 && md.capitalPieceFor([lo2, hi]) === lo2);
}

console.log("\n=== 2. end to end: Generate land gives X's capital id to the state on A ===");
{
  const game = buildGame(), mod = buildMod();
  const r = md.generateLand(GEN(mod, game));
  const states = readStates(mod);
  rec("the world was generated, each piece of X's a state of X's", r && r.changed === true && piecesOfX.every((ps) => states.some((s) => sameSet(s.provinces, ps) && s.owner === "XXX")),
    r && (r.error || states.map((s) => [s.id, s.provinces, s.owner])));
  rec("CONTROL: X's capital line names a generated id, so the countries block hands it to X's capital", CAPITAL_LINE.XXX >= r.firstStateId && CAPITAL_LINE.XXX <= r.lastStateId
    && ((r.countries || {}).capitals || {}).pinned >= 1, { first: r.firstStateId, last: r.lastStateId, capitals: (r.countries || {}).capitals });
  const cap = states.find((s) => s.id === CAPITAL_LINE.XXX);
  rec(`⭐⭐ the state X's capital line names (${CAPITAL_LINE.XXX}) is the one on A — not the islet, the most important state of all X's land`,
    !!cap && sameSet(cap.provinces, WANT) && cap.owner === "XXX", cap);
  const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: false });
  rec("…and the model the game loads agrees: X's capital is that state", model.capitals && model.capitals.XXX === CAPITAL_LINE.XXX && !!cap, model.capitals);
  const y = states.find((s) => s.id === CAPITAL_LINE.YYY);
  rec("Y, one piece, keeps its capital on its own land as before", !!y && y.owner === "YYY", y);
}

// ── ⛔ 3. THE PIECES ARE ASKED OF THE OWNERS AS THEY ARE NOW: the keep pass hands a needy country a group, which can turn which piece
// most of a country's people live on. X's land is two pieces: K (its city KC, and the group of region 2 — K2, X's three provinces
// and Z's one, which X wins 3 to 1) and L (KL alone). Z's only province is in that group, so Z is needy and the keep pass hands it
// the group, taking most of K's people with it. Asked once, before the keep pass, K would still be X's capital's piece.
console.log("\n=== 3. after the keep pass, the pieces of the land each country holds THEN ===");
{
  const KEEP = [
    { id: 1, name: "KC", tag: "XXX", provinces: [at(1, 1), at(2, 1)], category: "city", manpower: 1000000, vp: 20 },
    { id: 2, name: "K2", tag: "XXX", provinces: [at(3, 1), at(4, 1), at(5, 1)], category: "rural", manpower: 3000000, vp: 1, region: 2 },
    { id: 3, name: "KZ", tag: "ZZZ", provinces: [at(6, 1)], category: "rural", manpower: 600000, vp: 1, region: 2 },
    { id: 4, name: "KL", tag: "XXX", provinces: [at(1, 3), at(2, 3), at(3, 3)], category: "rural", manpower: 4000000, vp: 5 },
  ];
  const caps = { XXX: 1, ZZZ: 3 };
  const land = new Set(KEEP.flatMap((s) => s.provinces));
  // by the manifest: the groups are the regions; a group's owner is its majority below; its people each state's manpower, a share per
  // province; pieces join groups of one owner whose provinces touch
  const groupsK = [...new Set(KEEP.map((s) => s.region || s.id))].map((r) => KEEP.filter((s) => (s.region || s.id) === r).flatMap((s) => s.provinces));
  const ownerBelow = new Map(KEEP.flatMap((s) => s.provinces.map((p) => [p, s.tag])));
  const perProvince = new Map(KEEP.flatMap((s) => s.provinces.map((p) => [p, s.manpower / s.provinces.length])));
  const majority = (ps) => { const n = new Map(); for (const p of ps) n.set(ownerBelow.get(p), (n.get(ownerBelow.get(p)) || 0) + 1); return [...n].sort((a, b) => b[1] - a[1])[0][0]; };
  const piecesOf = (owners, tag) => {
    const mine = groupsK.filter((ps, k) => owners[k] === tag), out = [];
    for (const ps of mine) {
      const hit = out.filter((pc) => pc.some((q) => ps.some((p) => neighbours(p).includes(q))));
      const merged = hit.flat().concat(ps);
      for (const h of hit) out.splice(out.indexOf(h), 1);
      out.push(merged);
    }
    return out.map((ps) => ({ ps, people: ps.reduce((n, p) => n + perProvince.get(p), 0) }));
  };
  const ownersBefore = groupsK.map(majority);
  const zGroup = groupsK.findIndex((ps) => ps.some((p) => ownerBelow.get(p) === "ZZZ"));
  const ownersAfter = ownersBefore.map((t, k) => (k === zGroup ? "ZZZ" : t));
  const top = (list) => list.slice().sort((a, b) => b.people - a.people)[0].ps;
  const before = top(piecesOf(ownersBefore, "XXX")), after = top(piecesOf(ownersAfter, "XXX"));
  const KL = KEEP.find((s) => s.name === "KL").provinces, KC = KEEP.find((s) => s.name === "KC").provinces;
  rec("CONTROL: Z owns no group by majority, so it is needy; the group holding its province is X's", !ownersBefore.includes("ZZZ") && ownersBefore[zGroup] === "XXX", ownersBefore);
  rec("CONTROL: before the keep pass most of X's people live on K, its city's piece; once Z holds K2, on L",
    before.includes(KC[0]) && !before.includes(KL[0]) && sameSet(after, KL), { before, after });
  const seaK = Array.from({ length: N }, (_, i) => i + 1).filter((p) => !land.has(p));
  const oneBody = (() => { const seen = new Set([seaK[0]]), q = [seaK[0]]; while (q.length) { const u = q.pop(); for (const v of neighbours(u)) if (!land.has(v) && !seen.has(v)) { seen.add(v); q.push(v); } } return seen.size === seaK.length; })();
  rec("CONTROL: the sea is one body, the ocean, and K and L both touch it, so the coast decides nothing here",
    oneBody && [before, KL].every((ps) => ps.some((p) => neighbours(p).some((q) => !land.has(q)))));
  const game = buildGame(KEEP, caps), mod = buildMod();
  const r = md.generateLand(GEN(mod, game, land.size));
  const states = readStates(mod);
  const kept = ((r.countries || {}).kept || []).find((k) => k.tag === "ZZZ");
  rec("(guard: the keep pass handed Z the group of region 2, from X)", !!kept && kept.from === "XXX"
    && states.some((s) => s.id === kept.state && s.owner === "ZZZ" && sameSet(s.provinces, groupsK[zGroup])), { kept: (r.countries || {}).kept, error: r.error });
  const cap = states.find((s) => s.id === caps.XXX);
  rec(`⭐⭐ X's capital line (${caps.XXX}) names the state on L — the piece most of its people live on once the keep pass is done, not K`,
    !!cap && cap.owner === "XXX" && sameSet(cap.provinces, after), cap);
}

// ── ⛔ 4. A COUNTRY'S LAND IS ONE PIECE ACROSS A STRAIT, AND TWO ACROSS AN IMPASSABLE BORDER: the links the supply planner walks —
// every pair provinceNeighbourGraph has (an adjacencies.csv row among them) but those an `impassable` row closes. X: SA, a city of
// two provinces on the ocean, and SI, a one-province megalopolis islet two rows off it, the sea between; a row joins them.
console.log("\n=== 4. a strait joins two pieces of a country's land; an impassable row does not ===");
{
  const STRAIT = [
    { id: 1, name: "SA", tag: "XXX", provinces: [at(1, 1), at(2, 1)], category: "city", manpower: 3000000, vp: 10 },
    { id: 2, name: "SI", tag: "XXX", provinces: [at(1, 3)], category: "megalopolis", manpower: 500000, vp: 30 },
  ];
  const SA = STRAIT[0].provinces, SI = STRAIT[1].provinces, THROUGH = at(1, 2);
  const caps = { XXX: 1 };
  // by the manifest: joined, X is one piece and its most important state the megalopolis; apart, the city's piece has the most people
  const joinedWant = STRAIT.slice().sort((a, b) => b.vp - a.vp)[0].provinces;
  const apartWant = STRAIT.slice().sort((a, b) => b.manpower - a.manpower)[0].provinces;
  rec("CONTROL: SI touches none of SA's provinces, and the province between is sea",
    !SI.some((p) => neighbours(p).some((q) => SA.includes(q))) && !STRAIT.some((s) => s.provinces.includes(THROUGH)) && neighbours(THROUGH).includes(SA[0]) && neighbours(THROUGH).includes(SI[0]));
  rec("CONTROL: joined, the capital is the islet; apart, the city — so the fixture tells the two apart", sameSet(joinedWant, SI) && sameSet(apartWant, SA));
  // the page's own words for a Generate land report (public/map.js), evaluated as the page runs them
  const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const noteAt = MASKED.indexOf("function generatedCountriesNote("), noteBody = noteAt < 0 ? null : jsBodyAt(MASKED, noteAt);
  rec("public/map.js has generatedCountriesNote", !!noteBody);
  const note = noteBody ? require("vm").runInNewContext("(" + PAGE.slice(noteAt, noteBody[1] + 1) + ")") : () => "";
  for (const [label, row, want] of [["a strait (a `sea` row through the sea between)", `${SA[0]};${SI[0]};sea;${THROUGH}`, joinedWant],
    ["an `impassable` row", `${SA[0]};${SI[0]};impassable;-1`, apartWant]]) {
    const game = buildGame(STRAIT, caps, [row]), mod = buildMod();
    const r = md.generateLand(GEN(mod, game, SA.length + SI.length));
    const states = readStates(mod), cap = states.find((s) => s.id === caps.XXX);
    rec(`⭐⭐ across ${label}, X's capital line names the state on ${sameSet(want, SI) ? "the islet" : "the city"}`, !!cap && cap.owner === "XXX" && sameSet(cap.provinces, want),
      { cap, error: r && r.error });
    // ⛔ …and where X's most important state of all its land (joinedWant, by the manifest) stands on the other piece, the report and the
    // page say so: the page told the owner every capital was its country's most important state while CAN's and CHL's were not
    // (review of the four-chain merge, F2)
    const most = states.find((s) => sameSet(s.provinces, joinedWant));
    const wantSaid = sameSet(want, joinedWant) ? [] : [{ tag: "XXX", capital: caps.XXX, best: most ? most.id : null }];
    const said = ((r.countries || {}).capitals || {}).notMostImportant, line = note(r);
    rec(`⭐⭐ …and the report ${wantSaid.length ? "names X, whose most important state stands on the other piece" : "names no country whose most important state stands elsewhere"}`,
      !!most && JSON.stringify(said) === JSON.stringify(wantSaid), { said, wantSaid });
    rec(`⭐ …and the page ${wantSaid.length ? "says so, with both states" : "says nothing of it"}`,
      wantSaid.length ? line.includes(`XXX (capital ${caps.XXX}, most important ${most && most.id})`) && line.includes("another piece") : !line.includes("another piece") && line.includes("Each country's capital"), line);
  }
}

// ── ⛔ 5. THE STARTED ARMY, END TO END: the first world, X's history now starting an order of battle (one division a location) and,
// in two of the three, convoys. Generate land reads the army before it chooses the first capital.
console.log("\n=== 5. Generate land puts the capital where its supply reaches most of the army the country starts ===");
{
  const locs = (army) => Object.entries(army).flatMap(([k, n]) => Array(n).fill(PIECE[k][0]));
  const POR = { A: 1, I: 1, B: 1, E: 4 }, SEA = { A: 2, I: 1, B: 1, E: 3 }, OWN = { A: 1, I: 1, B: 2 };
  rec("CONTROL: POR's E holds more than the coast together, SEA's fewer — and more than any one coastal piece, A the most of those;"
    + " OWN's B holds the most of a coast that holds it all, A more people",
    POR.E > POR.A + POR.I + POR.B && SEA.E < SEA.A + SEA.I + SEA.B && SEA.E > Math.max(SEA.A, SEA.I, SEA.B) && SEA.A > Math.max(SEA.I, SEA.B)
      && !OWN.E && OWN.B > Math.max(OWN.A, OWN.I) && people(PIECE.A) > people(PIECE.B) && sameSet(WANT, PIECE.A));
  const said = { E: "E, the walled-in piece the army stands on", A: "A, the coast's most populous", B: "B, the coastal piece the army stands on" };
  for (const [label, army, convoys, want] of [["Portugal's shape, with convoys", POR, ["XXX"], "E"], ["more on the coast together, with convoys", SEA, ["XXX"], "A"],
    ["the same army with no convoys (it cannot ship)", SEA, [], "E"], ["the army on the coast, most of it on B, with convoys", OWN, ["XXX"], "B"]]) {
    const game = buildGame(BELOW, CAPITAL_LINE, [], { units: { XXX: locs(army) }, convoys }), mod = buildMod();
    const r = md.generateLand(GEN(mod, game));
    const cap = readStates(mod).find((s) => s.id === CAPITAL_LINE.XXX);
    rec(`⭐⭐ ${label}: X's capital line names the state on ${said[want]}`,
      !!cap && cap.owner === "XXX" && sameSet(cap.provinces, PIECE[want]), { cap, error: r && r.error, armyLand: ((r && r.countries) || {}).armyLand });
  }
}

console.log("\n=== 6. with no province map to read, no piece is asked: the capital is the country's most important state, as before ===");
{
  // ⛔ review of 04d87b17, NS-8: generateLand's documented degraded path — no provinces.bmp in the mod or below, "the land is still made,
  // scattered". With no land links every GROUP is a piece of its own and none opens onto the ocean, so asking the pieces put X's capital
  // on its most populous group: the 5M-people rural state, not its megalopolis (victory point 30), which its capital line names.
  const MEGA = [2], RURAL = [6, 7, 8, 9], N2 = 12;
  const csv2 = (land) => ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: N2 }, (_, i) => {
    const p = i + 1, [r, g, b] = COL(p), l = land.includes(p);
    return `${p};${r};${g};${b};${l ? "land" : "sea"};false;${l ? "plains" : "ocean"};${l ? 1 : 0}`;
  })).join("\n") + "\n";
  const below = [{ id: 1, provinces: MEGA, category: "megalopolis", manpower: 2000000, vp: 30 }, { id: 2, provinces: RURAL, category: "rural", manpower: 5000000, vp: 1 }];
  rec("CONTROL: the megalopolis is X's most important state, the rural state has more people", md.mostImportantState(below.map((s) => ({ id: s.id, vp: s.vp, vpSum: s.vp, manpower: s.manpower }))) === 1
    && below[1].manpower > below[0].manpower);
  const g = tmpDir("game-nobmp"), m = tmpDir("mod-nobmp");
  mk(g, "map/definition.csv", csv2(MEGA.concat(RURAL)));
  for (const s of below) {
    mk(g, `map/strategicregions/${s.id}.txt`, `strategic_region={\n\tid=${s.id}\n\tname="R${s.id}"\n\tprovinces={ ${s.provinces.join(" ")} }\n\tweather={}\n}\n`);
    mk(g, `history/states/${s.id}.txt`, `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = ${s.manpower}\n\tstate_category = ${s.category}\n\tprovinces = { ${s.provinces.join(" ")} }\n`
      + `\thistory = {\n\t\towner = XXX\n\t\tvictory_points = { ${s.provinces[0]} ${s.vp} }\n\t}\n}\n`);
  }
  mk(g, "history/countries/XXX - Xland.txt", "capital = 1\n");
  mk(m, "descriptor.mod", 'version="1"\nname="No bitmap"\nreplace_path="history/states"\npath="mod/nobitmap"\n');
  mk(m, "map/definition.csv", csv2([]));
  rec("CONTROL: no provinces.bmp anywhere", !fs.existsSync(path.join(g, "map", "provinces.bmp")) && !fs.existsSync(path.join(m, "map", "provinces.bmp")));
  const r = md.generateLand({ modRoot: m, gameRoot: g, dependencyRoots: [], count: MEGA.length + RURAL.length, provincesPerState: 8, seed: 3, ownerMode: "inherit",
    fillCutOffSeas: false, roughenCoast: false });
  const states = readStates(m);
  // the line the game reads: the mod's own country file when the click wrote one, else the game's
  const cd = path.join(m, "history", "countries"), own = fs.existsSync(cd) ? fs.readdirSync(cd).filter((f) => /^XXX\b/.test(f)) : [];
  const line = own.length ? +((/\bcapital\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(cd, own[0]), "utf8")) || [])[1]) : 1;
  const cap = states.find((s) => s.id === line);
  rec("CONTROL: the land was made, both states X's", r && r.changed === true && states.length === 2 && states.every((s) => s.owner === "XXX"), r && (r.error || states));
  rec("⭐⭐ X's capital line names the megalopolis, its most important state — not the most populous one", !!cap && sameSet(cap.provinces, MEGA), { line, cap, states });
}

console.log("\n=== 7. one answer for the capital's piece: chooseCapitals, the keep pass's reach and the sea routes ask it the same way ===");
{
  // ⛔ review of 7c258023, M1: reachOf had its own `peopleOf` beside chooseCapitals', so a merge that changed one (the industry chain's
  // economy manpower) would leave the keep pass guarding a capital piece chooseCapitals does not pick. Now the pieces are built in ONE
  // place (landPiecesOf, with capitalPeopleOf) and the piece picked in ONE place (capitalPieceOf). Comments stripped.
  const { maskJsLiterals, jsBodyAt, stripJsComments } = require("./testlib-strip-comments.js");
  const SRC = stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
  const g0 = SRC.indexOf("function generateLand("), gb = g0 < 0 ? null : jsBodyAt(maskJsLiterals(SRC), g0);
  const GEN = gb ? SRC.slice(g0, gb[1] + 1) : "";
  const count = (needle) => GEN.split(needle).length - 1;
  const piecesLine = (GEN.match(/const landPiecesOf = [^\n]*/) || [""])[0];
  const between = (from, to) => { const a = GEN.indexOf(from); return a < 0 ? "" : GEN.slice(a, GEN.indexOf(to, a)); };
  const choose = between("const chooseCapitals = ", "let capitalOf = chooseCapitals()"), reach = between("const reachOf = ", "};");
  rec("generateLand found", GEN.length > 0);
  rec("⭐⭐ the people a piece is weighed by are named ONCE, in landPiecesOf, as capitalPeopleOf",
    count("peopleOf:") === 1 && /peopleOf: capitalPeopleOf\b/.test(piecesLine) && count("const capitalPeopleOf = ") === 1, { peopleOf: count("peopleOf:"), piecesLine });
  rec("⭐⭐ capitalPieceFor is asked in ONE place, capitalPieceOf", count("capitalPieceFor(") === 1 && /const capitalPieceOf = [^\n]*capitalPieceFor\(/.test(GEN), count("capitalPieceFor("));
  rec("⭐ …and chooseCapitals and the keep pass's reach both ask landPiecesOf and capitalPieceOf, ranking a capital's state by the same people",
    /landPiecesOf\(/.test(choose) && /capitalPieceOf\(/.test(choose) && /manpower: capitalPeopleOf\(g\)/.test(choose) && /landPiecesOf\(/.test(reach) && /capitalPieceOf\(/.test(reach),
    { choose: choose.slice(0, 200), reach: reach.slice(0, 200) });
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log(`\n${fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks}`);
process.exitCode = fails.length ? 1 : 0;
