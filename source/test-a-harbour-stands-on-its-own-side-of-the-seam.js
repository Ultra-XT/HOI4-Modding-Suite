// ⛔ #a-harbour-stands-on-its-own-side-of-the-seam — A NEW HARBOUR STANDS ON A COAST WHOSE SEA IS ON ITS OWN SIDE OF THE WRAP SEAM, AND
// AUTO-FIX GIVES A COAST THAT IS ONLY ACROSS IT ITS PORT ROW.
//
// The owner's second setting (New mod → Delete map → Generate land 15% seed 2, inherit → Auto-fix) raised land at the seam, where
// column 0 meets column W-1, and put Japan's and the USA's sea-route harbours on 5475 and 8933, whose only sea was across it. Nova's
// other readers wrap x there — landProvincesTouchingSea, provinceNeighbourGraph, the coastal column — but fixCoastalNoPort's scan did
// not, so neither province (nor 3832) got a naval_base_spawn row, and the coastal_no_port rule, its dry run, said nothing (review of
// 04d87b17, NS-6). No shipping map has a single coast like it (vanilla, MD, MDC, OWB, NV, RoN, R56, HoM: 0 each), so what hoi4.exe
// makes of one is not measured — and both states had another coast on the ocean. So a NEW harbour — a port moved within its state
// (portsFor), a navy's home, a sea route's — takes a coast whose sea is on its own side first, and fixCoastalNoPort wraps, so a coast
// that is only across the seam still gets its row.
//
// The fixture: 10 x 6 blocks of 64 px, province = col + row x 10 + 1, x wrapping. S (cols 0-2, rows 2-4) rises under T (cols 0-2,
// row 1): 21 and 31 touch sea only across the seam (30 and 40), 22 and 32 none, the rest on their own side. Three worlds on it:
//   W1 portsFor   XXX's state below held a port on 32, which the click landlocks: it moves to a spare coast of S;
//   W2 sea route  XXX's capital stands on S with no port, while its islet 27 keeps one: S's piece gets the sea route's harbour;
//   W3 navy home  ZZZ's fleet berthed at its port on 30, which stays sea: ZZZ, holding S, gets a home harbour;
// …in each, the lowest coast or the victory point — what the rule took before — is 21, a coast only across the seam. Then Auto-fix's
// fixCoastalNoPort on W2: every coast gets a row on its own pixel, 21 and 31 among them. And the pure rules: touchesSeaOnItsOwnSide,
// provinceNeighbourGraph's seamPixels, navyHomePorts' and seaRoutePorts' `ownSide`. Every expected value is derived from the manifest
// by grid arithmetic, never read off the writer. Fixture-only: binds no port.
// Run: node test-a-harbour-stands-on-its-own-side-of-the-seam.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seam-harbour-"));
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
// a block's neighbours on the bitmap's own side, and the one across the seam (column 0 against column COLS-1)
const ownSide = (p) => { const c = colOf(p), r = rowOf(p); return [c > 0 ? at(c - 1, r) : 0, c < COLS - 1 ? at(c + 1, r) : 0, r > 0 ? at(c, r - 1) : 0, r < ROWS - 1 ? at(c, r + 1) : 0].filter(Boolean); };
const across = (p) => { const c = colOf(p), r = rowOf(p); return c === 0 ? [at(COLS - 1, r)] : c === COLS - 1 ? [at(0, r)] : []; };
const d2 = (a, b) => (colOf(a) - colOf(b)) ** 2 * B * B + (rowOf(a) - rowOf(b)) ** 2 * B * B;   // centre to centre, no wrap — as Nova measures
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
const cells = (cs, rs) => { const o = []; for (const r of rs) for (const c of cs) o.push(at(c, r)); return o; };
const S = cells([0, 1, 2], [2, 3, 4]), T = cells([0, 1, 2], [1]), ISLET = [at(6, 2)];
const LANDLOCKED_PORT = at(1, 3);   // W1: XXX's port below, inside S
const HOME_PORT = at(COLS - 1, 2);  // W3: ZZZ's port below, across the seam from 21 — it has no region, so it stays sea
const st = (o) => ({ category: "rural", manpower: 1000000, vp: 1, ports: {}, fleet: null, ...o });
const WORLDS = {
  W1: { below: [st({ id: 1, tag: "XXX", provinces: S, category: "city", manpower: 3000000, vp: 10, ports: { [LANDLOCKED_PORT]: 4 } }), st({ id: 2, tag: "YYY", provinces: T })],
    capitals: { XXX: 1, YYY: 2 } },
  W2: { below: [st({ id: 1, tag: "XXX", provinces: S, category: "city", manpower: 3000000, vp: 10 }), st({ id: 2, tag: "XXX", provinces: ISLET, manpower: 500000, ports: { [ISLET[0]]: 5 } }),
    st({ id: 3, tag: "YYY", provinces: T })], capitals: { XXX: 1, YYY: 3 } },
  W3: { below: [st({ id: 1, tag: "ZZZ", provinces: S.concat([HOME_PORT]), region: S, ports: { [HOME_PORT]: 3 }, fleet: HOME_PORT }), st({ id: 2, tag: "YYY", provinces: T })],
    capitals: { ZZZ: 1, YYY: 2 } },
};

function buildGame(world) {
  const g = tmpDir("game");
  mk(g, "map/provinces.bmp", bmp());
  mk(g, "map/definition.csv", csv(world.below.flatMap((s) => s.provinces)));
  mk(g, "map/buildings.txt", "");
  for (const s of world.below) {
    mk(g, `map/strategicregions/${s.id}.txt`, `strategic_region={\n\tid=${s.id}\n\tname="REGION_${s.id}"\n\tprovinces={ ${(s.region || s.provinces).join(" ")} }\n\tweather={}\n}\n`);
    const blocks = Object.entries(s.ports).map(([p, lv]) => `\t\t\t${p} = {\n\t\t\t\tnaval_base = ${lv}\n\t\t\t}\n`).join("");
    mk(g, `history/states/${s.id}.txt`, `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = ${s.manpower}\n\tstate_category = ${s.category}\n\tprovinces = { ${s.provinces.join(" ")} }\n`
      + `\thistory = {\n\t\towner = ${s.tag}\n\t\tvictory_points = { ${s.provinces[0]} ${s.vp} }\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n${blocks}\t\t}\n\t}\n}\n`);
  }
  for (const [t, id] of Object.entries(world.capitals)) {
    const fleet = (world.below.find((s) => s.tag === t && s.fleet != null) || {}).fleet;
    mk(g, `history/countries/${t} - ${t}land.txt`, `capital = ${id}\n` + (fleet != null ? `oob = "${t}_1936"\n` : ""));
    if (fleet != null) mk(g, `history/units/${t}_1936.txt`, `units = {\n\tfleet = {\n\t\tname = "${t} Fleet"\n\t\tnaval_base = ${fleet}\n\t\ttask_force = {\n\t\t\tname = "${t} TF"\n\t\t\tlocation = ${fleet}\n`
      + `\t\t\tship = { name = "${t} S" definition = destroyer equipment = { ship_hull_light_1 = { amount = 1 owner = ${t} } } }\n\t\t}\n\t}\n}\n`);
  }
  return g;
}
function buildMod() {
  const m = tmpDir("mod");
  mk(m, "descriptor.mod", 'version="1"\nname="Seam harbour"\nreplace_path="history/states"\npath="mod/seamharbour"\n');
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
      ports: blocks.map((b) => ({ province: b.province, level: +((/naval_base\s*=\s*(\d+)/.exec(b.body) || [])[1] || 0) })).filter((p) => p.level > 0) };
  });
}
const GEN = (mod, game, world) => ({ modRoot: mod, gameRoot: game, dependencyRoots: [], count: world.below.flatMap((s) => s.region || s.provinces).length,
  provincesPerState: 12, seed: 3, ownerMode: "inherit", fillCutOffSeas: false, roughenCoast: false });

// ── what the manifest says, by grid arithmetic ─────────────────────────────────────────────────────────────────────────────────────
function expectFor(world) {
  const land = new Set(world.below.flatMap((s) => s.region || s.provinces));
  const seaOwn = (p) => ownSide(p).filter((q) => !land.has(q)), seaAcross = (p) => across(p).filter((q) => !land.has(q));
  const coast = [...land].filter((p) => seaOwn(p).length || seaAcross(p).length).sort((a, b) => a - b);
  const onlyAcross = coast.filter((p) => !seaOwn(p).length);
  const sea = Array.from({ length: N }, (_, i) => i + 1).filter((p) => !land.has(p)), seaSet = new Set(sea), seen = new Set();
  let bodies = 0;
  for (const p of sea) { if (seen.has(p)) continue; bodies++; const b = [p]; seen.add(p); for (let i = 0; i < b.length; i++) for (const q of ownSide(b[i]).concat(across(b[i]))) if (seaSet.has(q) && !seen.has(q)) { seen.add(q); b.push(q); } }
  return { land, coast, onlyAcross, ownCoast: coast.filter((p) => !onlyAcross.includes(p)), seaOwn, seaAcross, bodies };
}
const nearest = (list, to) => list.slice().sort((a, b) => d2(a, to) - d2(b, to) || a - b)[0];

console.log("=== 0. the fixture can tell right from wrong (controls, from the manifest alone) ===");
const E2 = expectFor(WORLDS.W2);
rec("CONTROL: S's coasts only across the seam are 21 and 31 — each S's lowest coast in its row — and 22 and 32 touch no sea",
  sameSet(E2.onlyAcross.filter((p) => S.includes(p)), [at(0, 2), at(0, 3)]) && !E2.coast.includes(at(1, 2)) && !E2.coast.includes(LANDLOCKED_PORT), E2.onlyAcross);
rec("CONTROL: S's lowest coast is one only across the seam — what a lowest-id rule takes", E2.onlyAcross.includes(Math.min(...S.filter((p) => E2.coast.includes(p)))));
rec("CONTROL: in every world the sea is one body, the ocean, so every coast opens onto it", Object.values(WORLDS).every((w) => expectFor(w).bodies === 1));

console.log("\n=== 1. the pure rules ===");
{
  // touchesSeaOnItsOwnSide over a hand-made graph: 1 borders the seas 2 and 3 and the land 4
  const graph = (border, seam) => { const g = new Map([[1, new Set([2, 3, 4])]]); g.borderPixels = new Map(Object.entries(border)); if (seam) g.seamPixels = new Map(Object.entries(seam)); return g; };
  const isSea = (q) => q === 2 || q === 3;
  const own = (g, sea = isSea) => md.touchesSeaOnItsOwnSide(1, { graph: g, isSea: sea });
  rec("touchesSeaOnItsOwnSide: a sea it shares an edge with off the seam → yes", own(graph({ "1-2": 64, "1-3": 10, "1-4": 5 }, { "1-2": 64, "1-3": 4 })) === true);
  rec("⭐ …every edge with every sea across the seam → no", own(graph({ "1-2": 64, "1-3": 10, "1-4": 5 }, { "1-2": 64, "1-3": 10 })) === false);
  rec("…land on its own side is no sea", own(graph({ "1-2": 64, "1-4": 5 }, { "1-2": 64 })) === false);
  rec("…a lake is no sea: its own-side edge with 3 does not count when 3 is not a sea", own(graph({ "1-2": 64, "1-3": 10 }, { "1-2": 64 }), (q) => q === 2) === false);
  rec("…a graph that does not say (no borderPixels) says yes, as before", md.touchesSeaOnItsOwnSide(1, { graph: new Map([[1, new Set([2])]]), isSea }) === true);

  // navyHomePorts: home port 9, coasts 10, 11, 12 all on the ocean, 10 nearest it — and 10's only sea across the seam
  const g = { id: 1, provinces: [10, 11, 12] };
  const home = (o) => { const h = md.navyHomePorts({ groups: [g], ownerOfGroup: () => "TTT", portsOfGroup: () => [], coast: new Set([10, 11, 12]), opensOntoOcean: () => true,
    distance: (a, b) => Math.abs(a - b), taskForces: [{ tag: "TTT", kind: "task_force", province: 9 }], beneath: new Map([[9, { owner: "TTT", navalBase: 2 }]]), ...o }).homes.get(g);
    return h ? { near: h.near, open: sorted(h.open) } : null; };
  rec("CONTROL: navyHomePorts asked nothing of the seam takes the coast nearest the home port, 10", (home({}) || {}).near === 10, home({}));
  rec("⭐⭐ navyHomePorts: a coast only across the seam is passed over for one on its own side — 11, and 10 is not where it may stand",
    JSON.stringify(home({ ownSide: (p) => p !== 10 })) === JSON.stringify({ near: 11, open: [11, 12] }), home({ ownSide: (p) => p !== 10 }));
  rec("⭐ …and a navy whose every ocean coast is across the seam still gets its home there", JSON.stringify(home({ ownSide: () => false })) === JSON.stringify({ near: 10, open: [10, 11, 12] }), home({ ownSide: () => false }));

  // seaRoutePorts: TTT's capital piece (gC, a port of its own) and a second piece gS, whose town is 50 and whose coasts 50, 51, 52 all
  // open onto the ocean — 50 only across the seam
  const gC = { id: 1, provinces: [100] }, gS = { id: 2, provinces: [50, 51, 52] };
  const pieces = new Map([["TTT", [{ groups: [gC], coast: true, provinces: 1 }, { groups: [gS], coast: true, provinces: 3 }]]]);
  const route = (o) => { const h = md.seaRoutePorts({ pieces, capitalGroupOf: new Map([["TTT", gC]]), hasPort: (x) => x === gC, opens: (p) => p >= 50 && p <= 52,
    townOf: (x) => x.provinces[0], importanceOf: (x) => ({ id: x.id }), distance: (a, b) => Math.abs(a - b), ...o }).harbours.get(gS);
    return h ? { near: h.near, open: sorted(h.open) } : null; };
  rec("CONTROL: seaRoutePorts asked nothing of the seam takes the coast nearest the town, 50", (route({}) || {}).near === 50, route({}));
  rec("⭐⭐ seaRoutePorts: the harbour may stand only on a coast on its own side — 51 the nearest, 50 not even on the victory point",
    JSON.stringify(route({ ownSide: (p) => p !== 50 })) === JSON.stringify({ near: 51, open: [51, 52] }), route({ ownSide: (p) => p !== 50 }));
  rec("⭐ …and a piece whose every ocean coast is across the seam keeps one there", JSON.stringify(route({ ownSide: () => false })) === JSON.stringify({ near: 50, open: [50, 51, 52] }), route({ ownSide: () => false }));
  // …and in a piece whose named group opens onto no ocean, among the other groups' coasts: gN (the most important, no coast) beside
  // gA (only 69, across the seam: nearest gN's town 70, and the lower id) and gB (75, on its own side)
  const gN = { id: 3, provinces: [70] }, gA = { id: 4, provinces: [69] }, gB = { id: 5, provinces: [75] };
  const pieces2 = new Map([["TTT", [{ groups: [gC], coast: true, provinces: 1 }, { groups: [gN, gA, gB], coast: true, provinces: 3 }]]]);
  const r2 = md.seaRoutePorts({ pieces: pieces2, capitalGroupOf: new Map([["TTT", gC]]), hasPort: (x) => x === gC, opens: (p) => p === 69 || p === 75,
    townOf: (x) => x.provinces[0], importanceOf: (x) => ({ id: x.id, vp: x === gN ? 10 : 1, vpSum: x === gN ? 10 : 1, manpower: 1 }), distance: (a, b) => Math.abs(a - b),
    ownSide: (p) => p !== 69 }).harbours;
  rec("CONTROL: 69 is both nearer gN's town than 75 and the lower id", Math.abs(69 - 70) < Math.abs(75 - 70) && 69 < 75);
  rec("⭐ …a piece's harbour goes on the other group's coast on its own side, 75, not on 69 across the seam", r2.size === 1 && !!r2.get(gB) && r2.get(gB).near === 75 && !r2.get(gA),
    [...r2].map(([x, h]) => [x.id, h.near]));
}

// ── the three worlds, end to end ────────────────────────────────────────────────────────────────────────────────────────────────
const run = (key) => { const world = WORLDS[key], game = buildGame(world), mod = buildMod(); const r = md.generateLand(GEN(mod, game, world)); return { world, game, mod, r, states: readStates(mod), E: expectFor(world) }; };
const stateOf = (states, ps) => states.find((s) => sameSet(s.provinces, ps));

console.log("\n=== 2. W1: a port the click landlocks moves to a coast of its state on its own side of the seam ===");
{
  const { r, states, E } = run("W1");
  const s = stateOf(states, S), spare = S.filter((p) => E.coast.includes(p)).sort((a, b) => a - b), want = spare.filter((p) => E.ownCoast.includes(p))[0];
  rec("CONTROL: the world was made, S one state of XXX's, and the port below on 32 is landlocked by it", r && r.changed === true && !!s && s.owner === "XXX" && !E.coast.includes(LANDLOCKED_PORT),
    r && (r.error || states.map((x) => [x.id, x.owner, x.provinces])));
  rec("CONTROL: S's lowest spare coast is 21, only across the seam — where the port went before", spare[0] === at(0, 2) && E.onlyAcross.includes(spare[0]), spare);
  rec(`⭐⭐ S holds ONE port, at the level below (4), on ${want}: its lowest coast on its own side of the seam`,
    !!s && s.ports.length === 1 && s.ports[0].province === want && s.ports[0].level === 4, s && s.ports);
}

console.log("\n=== 3. W2: the sea route's harbour on the capital's piece stands on a coast on its own side of the seam ===");
let W2run = null;
{
  W2run = run("W2");
  const { r, states, E } = W2run;
  const s = stateOf(states, S), islet = stateOf(states, ISLET);
  const opening = S.filter((p) => E.coast.includes(p)), ownOpening = opening.filter((p) => E.ownCoast.includes(p)), town = Math.min(...S);
  const before = s && (opening.includes(s.vp) ? s.vp : nearest(opening, town));
  const want = s && (ownOpening.includes(s.vp) ? s.vp : nearest(ownOpening, town));
  rec("CONTROL: the world was made — S XXX's capital state, its islet XXX's, holding the port it had below", r && r.changed === true && !!s && s.owner === "XXX" && !!islet && islet.owner === "XXX"
    && islet.ports.length === 1 && islet.ports[0].level === 5 && (md.buildMapModel({ modRoot: W2run.mod, gameRoot: W2run.game, dependencyRoots: [], cacheStableLayers: false }).capitals || {}).XXX === s.id,
  r && (r.error || states.map((x) => [x.id, x.owner, x.provinces, x.ports])));
  rec("CONTROL: before, the harbour went on S's victory point or the coast nearest its town — a coast only across the seam", !!before && E.onlyAcross.includes(before), { vp: s && s.vp, before });
  rec(`⭐⭐ S holds ONE harbour, the sea route's, at XXX's best level below (5), on ${want}: a coast on its own side of the seam`,
    !!s && s.ports.length === 1 && s.ports[0].province === want && s.ports[0].level === 5 && E.ownCoast.includes(want)
      && ((r.seaRoute || {}).provinces || []).some((x) => x.tag === "XXX" && x.piece === "capital" && x.province === want), { ports: s && s.ports, seaRoute: r.seaRoute });
}

console.log("\n=== 4. W3: a navy's home harbour stands on a coast on its own side of the seam ===");
{
  const { r, states, E } = run("W3");
  const s = stateOf(states, S);
  const opening = S.filter((p) => E.coast.includes(p)), ownOpening = opening.filter((p) => E.ownCoast.includes(p));
  const before = s && (opening.includes(s.vp) ? s.vp : nearest(opening, HOME_PORT));
  const want = s && (ownOpening.includes(s.vp) ? s.vp : nearest(ownOpening, HOME_PORT));
  rec("CONTROL: the world was made — S ZZZ's, its home port 30 still sea, across the seam from 21", r && r.changed === true && !!s && s.owner === "ZZZ" && !E.land.has(HOME_PORT) && across(at(0, 2)).includes(HOME_PORT),
    r && (r.error || states.map((x) => [x.id, x.owner, x.provinces])));
  rec("CONTROL: before, the home went on S's victory point or the coast nearest the home port — a coast only across the seam", !!before && E.onlyAcross.includes(before), { vp: s && s.vp, before });
  rec(`⭐⭐ ZZZ gets ONE home harbour, at its home port's level (3), on ${want}: a coast on its own side of the seam`,
    !!s && s.ports.length === 1 && s.ports[0].province === want && s.ports[0].level === 3 && E.ownCoast.includes(want)
      && ((r.navyHome || {}).provinces || []).some((x) => x.tag === "ZZZ" && x.province === want), { ports: s && s.ports, navyHome: r.navyHome });
}

console.log("\n=== 5. provinceNeighbourGraph counts the edges across the seam ===");
{
  const { mod, game, E } = W2run;
  const model = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: false });
  const graph = md.provinceNeighbourGraph({ modRoot: mod, gameRoot: game, dependencyRoots: [], model });
  const want = new Map(Array.from({ length: ROWS }, (_, r) => [`${at(0, r)}-${at(COLS - 1, r)}`, B]));
  const seam = (graph && graph.seamPixels) || new Map();
  rec(`⭐ seamPixels: one pair per row, column 0 against column ${COLS - 1}, ${B} edges each — and nothing else`,
    seam.size === want.size && [...want].every(([k, n]) => seam.get(k) === n), [...seam]);
  rec("…and those pairs share no edge off the seam", [...want.keys()].every((k) => graph.borderPixels.get(k) === B), [...want.keys()].map((k) => [k, graph.borderPixels.get(k)]));
  const type = new Map((model.provinces || []).map((p) => [p.id, p.type]));
  const wrong = E.coast.filter((p) => md.touchesSeaOnItsOwnSide(p, { graph, isSea: (q) => type.get(q) === "sea" }) !== E.ownCoast.includes(p));
  rec("⭐ touchesSeaOnItsOwnSide on the written world: no for exactly the coasts only across the seam", wrong.length === 0 && E.onlyAcross.length > 0, { wrong, onlyAcross: E.onlyAcross });
}

console.log("\n=== 6. Auto-fix's fixCoastalNoPort gives a coast only across the seam its port row ===");
{
  const { mod, game, E, states } = W2run;
  const opts = { modRoot: mod, gameRoot: game, dependencyRoots: [] };
  const inState = new Set(states.flatMap((s) => s.provinces));
  const rows = () => { let t = ""; for (const f of [path.join(mod, "map", "buildings.txt"), path.join(game, "map", "buildings.txt")]) if (fs.existsSync(f)) { t = fs.readFileSync(f, "utf8"); break; }
    return t.split(/\r?\n/).map((l) => l.trim().split(";")).filter((c) => c[1] === "naval_base_spawn")
      .map((c) => { const x = Math.floor(parseFloat(c[2])), y = H - 1 - Math.floor(parseFloat(c[4])); return { on: at(Math.floor(x / B), Math.floor(y / B)), x, y, sea: +c[6] }; }); };
  const portless = () => { const on = new Set(rows().map((x) => x.on)); return E.coast.filter((p) => inState.has(p) && !on.has(p)); };
  const want = portless();
  rec("CONTROL: after Generate land the coasts only across the seam have no port row", E.onlyAcross.every((p) => want.includes(p)) && E.onlyAcross.length === 2, { want, onlyAcross: E.onlyAcross });
  const dry = md.fixCoastalNoPort({ ...opts, dryRun: true });
  rec("⭐⭐ the dry run — the coastal_no_port rule — names every coast in a state with no port row, those only across the seam among them",
    !!dry && !dry.error && sameSet(dry.targets || [], want), { targets: dry && dry.targets, want, error: dry && dry.error });
  const fx = md.fixCoastalNoPort(opts);
  rec("Auto-fix's pass wrote them", !!fx && !fx.error && fx.added === want.length, fx);
  const after = rows();
  const bad = E.coast.filter((p) => inState.has(p)).filter((p) => { const mine = after.filter((x) => x.on === p); return !mine.length || mine.some((x) => !E.seaOwn(p).concat(E.seaAcross(p)).includes(x.sea)); });
  rec("⭐⭐ every coast in a state now holds a port row on its own pixel, naming a sea it touches", bad.length === 0, { bad, rows: after });
  const seamRows = after.filter((x) => E.onlyAcross.includes(x.on));
  rec("⭐ …21 and 31 on their pixel in column 0, each naming the sea across the seam", seamRows.length === 2 && seamRows.every((x) => x.x === 0 && E.seaAcross(x.on).includes(x.sea)), seamRows);
  const again = md.fixCoastalNoPort({ ...opts, dryRun: true });
  rec("…and the rule then finds none", !!again && !again.error && !(again.targets || []).length, again);
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log(`\n${fails.length ? "FAILED " + fails.length + "/" + checks : "PASSED " + checks + "/" + checks}`);
process.exitCode = fails.length ? 1 : 0;
