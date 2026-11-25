// ⛔ #a-country-reaches-its-land-by-sea — EVERY PIECE OF A GENERATED COUNTRY'S LAND A SHIP CAN REACH HOLDS A HARBOUR, ITS CAPITAL'S FIRST.
//
// Supply leaves the capital by the country's own rail and reaches its other land only by sea: a naval base fed by convoy from a port
// on the capital's network (00_defines NSupply). TEST 33 (the owner's flow: New mod → Delete map → Generate land 35% seed 1, inherit →
// Auto-fix → Redraw regions) left 40.06% of the owned land with no such route, the base game 0.40% — and ENG, ITA, CAN, PER and GER had
// no harbour on their capital's piece at all: portsFor carries a port only across a drowned province, and the navy homes give one only
// to a navy that kept none. The base game ports 185 of its 189 pieces of land that are not a capital's, one each at level 1 by the
// median, and its capitals' pieces at a level-6 median. So each country with land on more than one piece gets ONE harbour on each piece
// that holds none and opens onto the ocean: the capital's at the best level its land held below, the others at level 1; a piece that
// opens onto no ocean gets none, and is said.
//
// The world of test-a-capital-stands-where-its-country-can-reach.js — 10 x 6 blocks of 64 px, province = col + row x 10 + 1, x wrapping:
//   X's  A  its capital's piece: two provinces of city on the ocean, no port below;
//        I  a megalopolis islet whose port below (level 6, X's best) is still on the coast: portsFor gives it back;
//        B  three provinces of rural land on the ocean, no port below;
//        E  an exclave inside Y's land whose only sea is a pond Y's land walls off;   F  an exclave with no sea at all;
//   Y's  one block of land: one piece, so it gains nothing.
// Every expected value is derived from the manifest by grid arithmetic, never read off the writer. Fixture-only: binds no port.
// Run: node test-a-country-reaches-its-land-by-sea.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-sea-route-"));
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
const d2 = (a, b) => (colOf(a) - colOf(b)) ** 2 * B * B + (rowOf(a) - rowOf(b)) ** 2 * B * B;
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
const PIECE = { A: [at(0, 1), at(1, 1)], I: [at(0, 3)], B: [at(3, 4), at(4, 4), at(5, 4)], E: [at(4, 2)], F: [at(7, 2)] };
const POND = at(5, 2);
const YLAND = [];
for (let r = 1; r <= 3; r++) for (let c = 3; c <= 8; c++) { const p = at(c, r); if (![PIECE.E[0], PIECE.F[0], POND].includes(p)) YLAND.push(p); }
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

function buildGame() {
  const g = tmpDir("game");
  mk(g, "map/provinces.bmp", bmp());
  mk(g, "map/definition.csv", csv(LAND));
  for (const s of BELOW) {
    mk(g, `map/strategicregions/${s.id}.txt`, `strategic_region={\n\tid=${s.id}\n\tname="REGION_${s.id}"\n\tprovinces={ ${s.provinces.join(" ")} }\n\tweather={}\n}\n`);
    const port = s.port ? `\t\tbuildings = {\n\t\t\t${s.provinces[0]} = {\n\t\t\t\tnaval_base = ${s.port}\n\t\t\t}\n\t\t}\n` : "";
    mk(g, `history/states/${s.id}.txt`, `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = ${s.manpower}\n\tstate_category = ${s.category}\n\tprovinces = { ${s.provinces.join(" ")} }\n`
      + `\thistory = {\n\t\towner = ${s.tag}\n\t\tvictory_points = { ${s.provinces[0]} ${s.vp} }\n${port}\t}\n}\n`);
  }
  for (const [t, id] of Object.entries(CAPITAL_LINE)) mk(g, `history/countries/${t} - ${t}land.txt`, `capital = ${id}\n`);
  return g;
}
function buildMod() {
  const m = tmpDir("mod");
  mk(m, "descriptor.mod", 'version="1"\nname="Sea route"\nreplace_path="history/states"\npath="mod/searoute"\n');
  mk(m, "map/provinces.bmp", bmp());
  mk(m, "map/definition.csv", csv([]));
  return m;
}
function readStates(modRoot) {
  const dir = path.join(modRoot, "history", "states");
  return fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
    const blocks = [...t.matchAll(/(\d+)\s*=\s*\{([^{}]*)\}/g)].map((m) => ({ province: +m[1], body: m[2] }));
    return { id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], provinces: (((/\bprovinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g).map(Number),
      owner: (/\bowner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1] || "", vp: +((/victory_points\s*=\s*\{\s*(\d+)/.exec(t) || [])[1] || -1),
      ports: blocks.map((b) => ({ province: b.province, level: +((/naval_base\s*=\s*(\d+)/.exec(b.body) || [])[1] || 0) })).filter((p) => p.level > 0),
      blockProvinces: blocks.map((b) => b.province) };
  });
}
const GEN = (mod, game) => ({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: LAND.length, provincesPerState: 8, seed: 3, ownerMode: "inherit",
  fillCutOffSeas: false, roughenCoast: false });

// ── what the manifest says, by grid arithmetic ─────────────────────────────────────────────────────────────────────────────────────
const landSet = new Set(LAND);
const sea = Array.from({ length: N }, (_, i) => i + 1).filter((p) => !landSet.has(p));
const seaSet = new Set(sea);
const bodies = (() => { const seen = new Set(), out = []; for (const p of sea) { if (seen.has(p)) continue; const b = [p]; seen.add(p);
  for (let i = 0; i < b.length; i++) for (const q of neighbours(b[i])) if (seaSet.has(q) && !seen.has(q)) { seen.add(q); b.push(q); } out.push(b); }
  return out.sort((a, b) => b.length - a.length); })();
const ocean = new Set(bodies[0]);
const opens = (p) => { const s = neighbours(p).filter((q) => seaSet.has(q)); return s.length > 0 && s.every((q) => ocean.has(q)); };
const touchesSea = (p) => neighbours(p).some((q) => seaSet.has(q));
const BEST_BELOW = Math.max(...BELOW.filter((s) => s.tag === "XXX" && s.port).map((s) => s.port));
// the manifest's verdict per piece of X's: the capital's (A) at X's best level below, every other one on the ocean holding no port at
// level 1, none where a port comes back or no ocean is reached
const capitalPiece = "A";
const holdsPortBelow = (k) => BELOW.some((s) => s.port && sameSet(s.provinces, PIECE[k]) && s.provinces.some(touchesSea));
const WANT = {};
for (const k of Object.keys(PIECE)) {
  if (holdsPortBelow(k)) WANT[k] = { kept: true };
  else if (!PIECE[k].some(opens)) WANT[k] = { walledIn: true };
  else WANT[k] = { level: k === capitalPiece ? BEST_BELOW : 1 };
}

console.log("=== 0. the fixture can tell right from wrong (controls, from the manifest alone) ===");
rec("CONTROL: the pond is a sea of its own, walled off by Y's land", bodies.length === 2 && sameSet(bodies[1], [POND]));
rec("CONTROL: E touches a sea — the pond — and none of it is the ocean, so a rule that asks for any sea gives it a harbour", PIECE.E.some(touchesSea) && !PIECE.E.some(opens));
rec("CONTROL: the verdicts — A at X's best level below, B at 1, the islet keeps its own, E and F walled in",
  WANT.A.level === BEST_BELOW && BEST_BELOW > 1 && WANT.B.level === 1 && WANT.I.kept && WANT.E.walledIn && WANT.F.walledIn, WANT);

console.log("\n=== 1. seaRoutePorts, pure ===");
{
  const groups = BELOW.map((s) => ({ id: s.id, provinces: s.provinces.slice() }));
  const gOf = (k) => groups.find((g) => sameSet(g.provinces, PIECE[k]));
  const tagOf = new Map(BELOW.map((s) => [s.id, s.tag]));
  const pieces = md.ownLandPieces({ groups, ownerOf: (g) => tagOf.get(g.id), links: (p) => neighbours(p).filter((q) => landSet.has(q)), opens,
    peopleOf: (g) => BELOW.find((s) => s.id === g.id).manpower });
  const ask = (o = {}) => md.seaRoutePorts({ pieces, capitalGroupOf: new Map([["XXX", gOf("A")], ["YYY", groups[5]]]), opens,
    hasPort: (g) => BELOW.some((s) => s.id === g.id && s.port), levelBelow: (t) => (t === "XXX" ? BEST_BELOW : 0), townOf: (g) => g.provinces[g.provinces.length - 1],
    importanceOf: (g) => { const s = BELOW.find((x) => x.id === g.id); return { id: g.id, vp: s.vp, vpSum: s.vp, manpower: s.manpower }; }, distance: d2, ...o });
  const r = ask();
  const h = r.harbours;
  rec("⭐⭐ the capital's piece, A, gets one harbour at X's best level below", h.has(gOf("A")) && h.get(gOf("A")).level === WANT.A.level && h.get(gOf("A")).piece === "capital", [...h.values()]);
  rec("⭐⭐ the other piece on the ocean, B, gets one at level 1", h.has(gOf("B")) && h.get(gOf("B")).level === 1 && h.get(gOf("B")).piece === "other", [...h.values()]);
  rec("…the islet, whose port comes back, gets none", !h.has(gOf("I")));
  rec("…and E (a pond coast) and F (no sea) get none, and are said", !h.has(gOf("E")) && !h.has(gOf("F")) && r.report.walledIn.length === 2
    && r.report.walledIn.every((w) => w.tag === "XXX" && !w.capital), r.report);
  rec("…nor Y, whose land is one piece", ![...h.values()].some((x) => x.tag === "YYY") && r.report.countries === 1, r.report);
  rec("each harbour may stand on its state's victory point wherever that opens onto the ocean, else on the opening province nearest its town",
    [...h].every(([g, x]) => sameSet(x.open, g.provinces.filter(opens)) && x.open.has(x.near)), [...h].map(([g, x]) => [g.id, [...x.open], x.near]));
  const noCap = ask({ capitalGroupOf: new Map() });
  rec("a country whose capital is not among the groups is left alone, and said", noCap.harbours.size === 0 && noCap.report.noCapital.includes("XXX"), noCap.report);
  const one = ask({ levelBelow: () => 0 });
  rec("…with no port below to take a level from, the capital's piece gets level 1", one.harbours.get(gOf("A")).level === 1);

  // ⛔ A PIECE WHOSE NAMED GROUP OPENS ONTO NO OCEAN: the harbour goes on the opening nearest that group's town, in whichever group holds
  // it (review of 04d87b17, NS-9 MB1). TTT's capital piece holds a port; its other piece is gN — the most important, no coast — with gL
  // (opening 5: the LOWER id, further from gN's town 20) and gH (opening 30: nearer). And (review of 2d26d727, NS-7) a group `mayHold`
  // refuses — a state that already loads, the modder's — is never given one.
  const gC = { id: 1, provinces: [100] }, gN = { id: 2, provinces: [20] }, gL = { id: 3, provinces: [5] }, gH = { id: 4, provinces: [30] };
  const two = new Map([["TTT", [{ groups: [gC], coast: true, provinces: 1 }, { groups: [gN, gL, gH], coast: true, provinces: 3 }]]]);
  const askTwo = (o = {}) => md.seaRoutePorts({ pieces: two, capitalGroupOf: new Map([["TTT", gC]]), hasPort: (g) => g === gC, opens: (p) => p === 5 || p === 30,
    townOf: (g) => g.provinces[0], importanceOf: (g) => ({ id: g.id, vp: g === gN ? 10 : 1, vpSum: g === gN ? 10 : 1, manpower: 1 }), distance: (a, b) => Math.abs(a - b), ...o });
  const where = (r) => [...r.harbours].map(([g, h]) => [g.id, h.near, sorted(h.open), h.level, h.piece]);
  rec("CONTROL: gN is the piece's most important group and opens onto no ocean; of the other two's openings 5 is the lower id, 30 the nearer gN's town",
    md.mostImportantState([gN, gL, gH].map((g) => ({ id: g.id, vp: g === gN ? 10 : 1, vpSum: g === gN ? 10 : 1, manpower: 1 }))) === gN.id && 5 < 30 && Math.abs(30 - 20) < Math.abs(5 - 20));
  rec("⭐⭐ the harbour goes on the opening nearest the named group's town — 30, in gH — not on the lowest id", JSON.stringify(where(askTwo())) === JSON.stringify([[gH.id, 30, [30], 1, "other"]]), where(askTwo()));
  const notH = askTwo({ mayHold: (g) => g !== gH });
  rec("⭐⭐ a group the click did not make is given none: with gH the modder's, it goes on gL's 5", JSON.stringify(where(notH)) === JSON.stringify([[gL.id, 5, [5], 1, "other"]]), where(notH));
  const neither = askTwo({ mayHold: (g) => g === gN });
  rec("⭐⭐ …and a piece whose every ocean coast is the modder's gets none, and is said: its coast is not ours",
    neither.harbours.size === 0 && neither.report.otherPieces === 0 && JSON.stringify(neither.report.coastNotOurs) === JSON.stringify([{ tag: "TTT", capital: false, provinces: 3 }]), neither.report);
  const theirs = askTwo({ mayHold: (g) => g === gC });
  rec("…a piece with none of the click's land is passed over, unsaid", theirs.harbours.size === 0 && theirs.report.coastNotOurs.length === 0 && theirs.report.countries === 1, theirs.report);
  rec("…and a country none of whose land is the click's, whole", askTwo({ mayHold: () => false }).report.countries === 0);
  // the capital's piece: its capital group gK is the modder's, beside new land gM — the harbour goes on gM, at the capital's level;
  // gP, an island of the click's, is TTT's other piece
  const gK = { id: 5, provinces: [40] }, gM = { id: 6, provinces: [45] }, gP = { id: 7, provinces: [200] };
  const capAsk = (groups) => md.seaRoutePorts({ pieces: new Map([["TTT", [{ groups, coast: true, provinces: groups.length }, { groups: [gP], coast: true, provinces: 1 }]]]),
    capitalGroupOf: new Map([["TTT", gK]]), opens: (p) => p === 40 || p === 45 || p === 200, levelBelow: () => 6, townOf: (g) => g.provinces[0],
    importanceOf: (g) => ({ id: g.id }), distance: (a, b) => Math.abs(a - b), mayHold: (g) => g !== gK });
  const km = capAsk([gK, gM]);
  rec("⭐⭐ a capital on the modder's state: the capital's piece's harbour goes on the click's land beside it, at the capital's level",
    JSON.stringify(where(km)) === JSON.stringify([[gM.id, 45, [45], 6, "capital"], [gP.id, 200, [200], 1, "other"]]) && km.report.capitalPieces === 1, where(km));
  const k = capAsk([gK]);
  rec("⭐⭐ …and with none of the click's land on that piece, none is given there, and it is said: the capital's coast is not ours",
    JSON.stringify(where(k)) === JSON.stringify([[gP.id, 200, [200], 1, "other"]]) && k.report.capitalPieces === 0
      && JSON.stringify(k.report.coastNotOurs) === JSON.stringify([{ tag: "TTT", capital: true, provinces: 1 }]), k.report);
}

console.log("\n=== 2. end to end: Generate land writes them ===");
const game = buildGame(), mod = buildMod();
const r = md.generateLand(GEN(mod, game));
const states = readStates(mod);
const stateOn = (k) => states.find((s) => sameSet(s.provinces, PIECE[k]));
rec("the world was generated, each piece of X's a state of X's", r && r.changed === true && Object.keys(PIECE).every((k) => stateOn(k) && stateOn(k).owner === "XXX"),
  r && (r.error || states.map((s) => [s.id, s.provinces, s.owner])));
rec("CONTROL: X's capital stands on A", ((md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: false }).capitals) || {}).XXX === (stateOn("A") || {}).id);
{
  const a = stateOn("A"), b = stateOn("B"), i = stateOn("I"), e = stateOn("E"), f = stateOn("F");
  rec(`⭐⭐ A, the capital's piece, holds ONE harbour, at X's best level below (${WANT.A.level})`, !!a && a.ports.length === 1 && a.ports[0].level === WANT.A.level, a && a.ports);
  rec("…on its victory point, which opens onto the ocean", !!a && a.ports.length === 1 && a.ports[0].province === a.vp && opens(a.vp), a && { ports: a.ports, vp: a.vp });
  rec("⭐⭐ B holds ONE harbour, at level 1", !!b && b.ports.length === 1 && b.ports[0].level === 1, b && b.ports);
  rec("…on a province that opens onto the ocean", !!b && b.ports.length === 1 && opens(b.ports[0].province), b && b.ports);
  rec("⭐ the islet holds exactly the port it had below, and no second", !!i && i.ports.length === 1 && i.ports[0].level === BELOW[1].port && i.ports[0].province === PIECE.I[0], i && i.ports);
  rec("⭐ E, whose only sea is the pond, holds none", !!e && e.ports.length === 0, e && e.ports);
  rec("…nor F, with no sea", !!f && f.ports.length === 0, f && f.ports);
  rec("Y gains none", states.filter((s) => s.owner === "YYY").every((s) => s.ports.length === 0));
  const twice = states.filter((s) => new Set(s.blockProvinces).size !== s.blockProvinces.length).map((s) => s.id);
  rec("no province's block is written twice", twice.length === 0, twice);
  // the route the game takes (model F): a piece is reached when it is the capital's, or holds a port while the capital's piece holds one
  const capHas = !!a && a.ports.length > 0;
  const unreached = Object.keys(PIECE).filter((k) => PIECE[k].some(opens) && k !== capitalPiece && !(capHas && (stateOn(k) || { ports: [] }).ports.length > 0));
  rec("⭐⭐ every piece of X's that opens onto the ocean is reached from the capital by sea", unreached.length === 0, unreached);
  const sr = r.seaRoute || {};
  rec("the report names the two harbours, the pieces they are on and their levels", (sr.provinces || []).length === 2
    && sr.provinces.some((p) => p.tag === "XXX" && p.piece === "capital" && p.state === a.id && p.level === WANT.A.level && p.province === a.ports[0].province && p.onVictoryPoint === true)
    && sr.provinces.some((p) => p.tag === "XXX" && p.piece === "other" && p.state === b.id && p.level === 1), sr);
  rec("…and the two pieces no ship reaches", (sr.walledIn || []).length === 2 && sr.capitalPieces === 1 && sr.otherPieces === 1 && sr.countries === 1, sr);
  rec("the restored ports are counted apart — navalBases.restored is portsFor's alone", (r.navalBases || {}).restored === 1, r.navalBases);
}

console.log("\n=== 3. the page says it ===");
{
  const { maskJsLiterals, jsBodyAt, stripJsComments } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const atNote = MASKED.indexOf("function generatedSeaRouteNote("), body = atNote < 0 ? null : jsBodyAt(MASKED, atNote);
  rec("public/map.js has generatedSeaRouteNote", !!body);
  const note = body ? vm.runInNewContext("(" + PAGE.slice(atNote, body[1] + 1) + ")") : () => "";
  const real = note(r);
  rec("⭐ the harbours it gave are said, and to whom", /Gave 2 harbours to 1 country/.test(real) && /\(XXX\)/.test(real), real);
  rec("…and the pieces no ship reaches", /2 pieces of a country's land have no coast on the ocean/.test(real), real);
  // ⛔ a walled-in CAPITAL piece is said apart: supply starts there (TEST 33 counted Chile's, Ecuador's and Latvia's among the pieces
  // "supply has no way" to). The report above plus one capital piece walled in, of a country the fixture does not have.
  const sr = (r && r.seaRoute) || {};
  const walledOthers = (sr.walledIn || []).filter((w) => !w.capital).length;
  const withCap = { seaRoute: { ...sr, walledIn: (sr.walledIn || []).concat([{ tag: "LLL", capital: true, provinces: 3 }]) } };
  const said = note(withCap);
  rec("CONTROL: the fixture's walled-in pieces are none of them a capital's", walledOthers === (sr.walledIn || []).length && walledOthers > 0, sr.walledIn);
  rec("⭐⭐ a capital's walled-in piece is not counted among the pieces supply has no way to",
    new RegExp(`(^|\\D)${walledOthers} pieces of a country's land have no coast on the ocean[^.]*supply has no way there`).test(said) && !new RegExp(`${walledOthers + 1} pieces`).test(said), said);
  rec("⭐ …it is said apart, by country: the capital stands on land with no ocean coast, so its other land is not reached by sea",
    /capital stands on land with no coast on the ocean \(LLL\), so supply reaches none of its other land by sea/.test(said), said);
  // ⛔ …and a piece on the ocean that got no harbour, and why (review of 2d26d727, NS-7): its capital's coast, or its coast, all on land
  // that already loaded; or no capital among its country's land
  const nc = note({ seaRoute: { provinces: [], walledIn: [], noCapital: ["NNN"],
    coastNotOurs: [{ tag: "KKK", capital: true, provinces: 9 }, { tag: "OOO", capital: false, provinces: 2 }, { tag: "OOO", capital: false, provinces: 1 }] } });
  rec("⭐⭐ a capital whose coast is all on land that was already there, with no harbour, is said by country",
    /One country's capital stands on land that was already there and has no harbour on its coast \(KKK\)/.test(nc), nc);
  rec("⭐ …any other piece whose ocean coast is such land is counted", /(^|\D)2 pieces of a country's new land reach the ocean only over land that was already there with no harbour/.test(nc), nc);
  rec("⭐ …and a country with no capital among its land is said by name", /One country has no capital on its land \(NNN\)/.test(nc), nc);
  const err = note({ seaRoute: { error: "boom" } });
  rec("⚠ a rule that failed is said with its reason", /⚠/.test(err) && err.includes("boom"), err);
  rec("CONTROL: nothing to say says nothing", note({ seaRoute: { provinces: [], walledIn: [] } }) === "" && note({}) === "" && note(null) === "");
  const handler = stripJsComments(PAGE), post = handler.indexOf('fetch("/api/map/generate-land"');
  const caught = post < 0 ? -1 : handler.indexOf(".catch(", post), done = caught < 0 ? -1 : handler.lastIndexOf("reloadAfterImmediateWrite(", caught);
  // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
  // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
  const line = require("./testlib-map-page.js").generateLandReportLine(handler);
  rec("⭐ the Generate land report on the page carries it", /generatedSeaRouteNote\(res\)/.test(line) && /\$\{navyNote\}/.test(line.slice(line.lastIndexOf("reloadAfterImmediateWrite("))), line.slice(-200));
}

console.log("\n=== 4. a country's land that already loads is a piece of it: an island raised beside its homeland gets a harbour ===");
{
  // ⛔ review of 2d26d727, NS-7: Generate land over a world that keeps its land, the use generatedLandClaim allows on an inherited map.
  // XXX's homeland is the mod's own state, its capital there; the click raises a 2 x 2 island in open ocean, which the proximity pass
  // gives XXX. The island is another piece of XXX's land; the homeland is the modder's, so it is never written into. (c): XXX's capital
  // line names a small homeland holding the port, while its larger, more important state elsewhere holds none — the capital is the
  // line's, as Auto-fix's capitalStateFor leaves it, not the most important state.
  const HOME = []; for (let row = 1; row <= 3; row++) for (let c = 0; c <= 2; c++) HOME.push(at(c, row));
  const ISLAND = [at(6, 1), at(7, 1), at(6, 2), at(7, 2)], HOME_PORT = at(2, 1);
  const SMALL = [at(0, 1), at(1, 1), at(2, 1)], LARGE = [at(0, 3), at(1, 3), at(2, 3), at(0, 4), at(1, 4), at(2, 4)];
  const stateFile = (s) => `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = ${s.manpower}\n\tstate_category = city\n\tprovinces = { ${s.provinces.join(" ")} }\n`
    + `\thistory = {\n\t\towner = XXX\n\t\tvictory_points = { ${s.provinces[0]} ${s.vp} }\n`
    + (s.port ? `\t\tbuildings = {\n\t\t\t${HOME_PORT} = {\n\t\t\t\tnaval_base = ${s.port}\n\t\t\t}\n\t\t}\n` : "") + "\t}\n}\n";
  const CASES = [
    ["(a) a homeland with its harbour", [{ id: 1, provinces: HOME, manpower: 3000000, vp: 10, port: 5 }]],
    ["(b) a homeland with none", [{ id: 1, provinces: HOME, manpower: 3000000, vp: 10, port: 0 }]],
    ["(c) a capital line on a small homeland with the harbour, a larger state elsewhere with none",
      [{ id: 1, provinces: SMALL, manpower: 1000000, vp: 1, port: 5 }, { id: 2, provinces: LARGE, manpower: 4000000, vp: 10, port: 0 }]],
  ];
  const keptOpens = (land) => (p) => neighbours(p).some((q) => !land.has(q));   // the sea is one body (row 5 and cols 3-9 are sea), so a coast opens onto it
  rec("CONTROL: the island touches none of the homelands — a piece of its own — and opens onto the ocean; each port stands on a coast; (c)'s two homelands are apart, the larger the more important",
    CASES.every(([, homes]) => { const land = new Set(homes.flatMap((s) => s.provinces).concat(ISLAND));
      return ISLAND.every((p) => neighbours(p).every((q) => !homes.some((s) => s.provinces.includes(q)))) && ISLAND.some(keptOpens(land)) && keptOpens(land)(HOME_PORT); })
      && SMALL.every((p) => neighbours(p).every((q) => !LARGE.includes(q)))
      && md.mostImportantState(CASES[2][1].map((s) => ({ id: s.id, vp: s.vp, vpSum: s.vp, manpower: s.manpower }))) === 2);
  const { maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const atNote = MASKED.indexOf("function generatedSeaRouteNote("), body = atNote < 0 ? null : jsBodyAt(MASKED, atNote);
  const note = body ? vm.runInNewContext("(" + PAGE.slice(atNote, body[1] + 1) + ")") : () => "";
  for (const [label, homes] of CASES) {
    const g = tmpDir("game-kept"), m = tmpDir("mod-kept"), homeLand = homes.flatMap((s) => s.provinces), land = new Set(homeLand.concat(ISLAND));
    mk(g, "map/provinces.bmp", bmp()); mk(g, "map/definition.csv", csv(homeLand));
    homes.forEach((s, i) => mk(g, `map/strategicregions/${i + 1}.txt`, `strategic_region={\n\tid=${i + 1}\n\tname="R${i + 1}"\n\tprovinces={ ${s.provinces.join(" ")} }\n\tweather={}\n}\n`));
    mk(g, "map/strategicregions/9.txt", `strategic_region={\n\tid=9\n\tname="R9"\n\tprovinces={ ${ISLAND.join(" ")} }\n\tweather={}\n}\n`);
    for (const s of homes) mk(g, `history/states/${s.id}-home.txt`, stateFile(s));
    mk(g, "history/countries/XXX - Xland.txt", "capital = 1\n");
    mk(m, "descriptor.mod", 'version="1"\nname="Kept world"\nreplace_path="history/states"\npath="mod/keptworld"\n');
    mk(m, "map/provinces.bmp", bmp()); mk(m, "map/definition.csv", csv(homeLand));
    for (const s of homes) mk(m, `history/states/${s.id}-home.txt`, stateFile(s));
    const before = homes.map((s) => fs.readFileSync(path.join(m, "history", "states", `${s.id}-home.txt`)));
    const res = md.generateLand({ modRoot: m, gameRoot: g, dependencyRoots: [], count: ISLAND.length, provincesPerState: 8, seed: 3, ownerMode: "inherit",
      fillCutOffSeas: false, roughenCoast: false });
    const isl = readStates(m).find((s) => sameSet(s.provinces, ISLAND)), sr = (res && res.seaRoute) || {};
    rec(`${label}: CONTROL: the island is one state of XXX's, and each homeland's file is byte for byte as it was`,
      res && res.changed === true && !!isl && isl.owner === "XXX" && homes.every((s, i) => fs.readFileSync(path.join(m, "history", "states", `${s.id}-home.txt`)).equals(before[i])),
      res && (res.error || readStates(m).map((s) => [s.id, s.owner, s.provinces])));
    rec(`${label}: ⭐⭐ the island holds ONE harbour, the sea route's, at level 1, on a coast that opens onto the ocean`,
      !!isl && isl.ports.length === 1 && isl.ports[0].level === 1 && keptOpens(land)(isl.ports[0].province)
        && (sr.provinces || []).length === 1 && sr.provinces[0].tag === "XXX" && sr.provinces[0].piece === "other" && sr.provinces[0].province === isl.ports[0].province,
      { ports: isl && isl.ports, seaRoute: sr });
    rec(`${label}: …said on the page`, /Gave 1 harbour to 1 country/.test(note(res)) && /\(XXX\)/.test(note(res)), note(res));
    if (homes.find((s) => s.id === 1).port) rec(`${label}: ⭐ the capital's piece holds its port, so nothing more is said of it`, sr.capitalPieces === 0 && !(sr.coastNotOurs || []).length && sr.countries === 1, sr);
    else {
      rec(`${label}: ⭐⭐ the capital's piece, the modder's land with no harbour on its coast, is given none — and is said`,
        sr.capitalPieces === 0 && JSON.stringify((sr.coastNotOurs || []).map((x) => [x.tag, x.capital, x.provinces])) === JSON.stringify([["XXX", true, HOME.length]]), sr);
      rec(`${label}: …on the page, by country`, /capital stands on land that was already there and has no harbour on its coast \(XXX\)/.test(note(res)), note(res));
    }
  }
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log(`\n${fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks}`);
process.exitCode = fails.length ? 1 : 0;
