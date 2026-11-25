// ⛔ #a-navy-keeps-a-home-port — THE STATE DROWNED, THE COUNTRY DID NOT: A NAVY THAT KEPT NO HARBOUR GETS ONE.
//
// TEST 32 (the owner's flow: New mod → Delete map → Generate land 35% seed 1, inherit → Auto-fix → Redraw regions): 8 countries
// whose order of battle starts a fleet (AST, CHI, JAP, NZL, POR, SIA, SOV, TUR) owned a coast and no harbour, and 128 of the 182
// task forces that started at sea were theirs — Auto-fix re-berths a fleet only into a harbour its country already has. "A navy
// that owns a coast owns a harbour" holds on vanilla and the seven shipping maps measured, so Generate land gives such a country
// ONE naval base, at the level of its home port below, on its coast nearest that port that opens only onto the ocean (its state's
// victory point when that one does). Nobody else gains one: not a country with no navy (#239), not one that kept or already holds
// a harbour, not one whose only coast faces a sea cut off from the ocean.
//
// The fixture is one world in which each case happens once — 8 x 4 blocks of 64 px, province = col + row x 8 + 1, x wrapping:
//   AAA  a navy whose home port (2) stays sea, walled in by the new land: a pond. Its ocean coast is region 1, and region 2's
//        pond coast is NEARER the home port, so a rule that ignores the ocean picks the pond;
//   BBB  a navy whose port (19) is still on a coast: portsFor restores it, and nothing is added;
//   CCC  no navy, ocean coasts and a port below: it gains nothing (#239);
//   DDD  a navy whose only coasts face the pond;        FFF  a navy with no coast at all.
// Then the variants: every capital line below names a generated id, so the countries block PERMUTES the ids in this very world and
// a port must be read in its own state (13); AAA owning two states on the ocean, where only the distance generateLand measures can
// choose (1b); single-tag mode, with and without BBB's port (11); AAA holding a harbour in a state the mod already has (12), and
// one the click landlocks, which can berth nothing and so does not count (12b); and a world whose click leaves a sea cut off BEFORE it
// larger than the ocean (14) — the ocean is where the ocean was, as Generate land's own fill decides it. The fixture's pond only
// survives the click with the fill off (`fillCutOffSeas: false`): with it on, a body this click cuts off is joined back to the
// ocean, so the pond stands for one cut off before the click or inherited, the only kind that survives. Every expected value is
// derived from the manifest by grid arithmetic, never read off the writer. Fixture-only: binds no port.
// And (8): a click whose order-of-battle read fails says so, in the report and on the page, and gives no home it could not decide —
// the read both this rule and the air bases take (#what-the-new-world-starts) once swallowed the throw (review of merge-x, MX-R1).
// Run: node test-a-navy-keeps-a-home-port.js
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};

const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-navy-home-"));
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

// ── a world of blocks: COLS x ROWS of 64 px, province = col + row x COLS + 1; x wraps across the seam, y does not ───────────
const B = 64;
function grid(COLS, ROWS) {
  const W = COLS * B, H = ROWS * B, N = COLS * ROWS;
  const colOf = (p) => (p - 1) % COLS, rowOf = (p) => Math.floor((p - 1) / COLS);
  const at = (c, r) => ((c + COLS) % COLS) + r * COLS + 1;
  const neighbours = (p) => { const c = colOf(p), r = rowOf(p); return [at(c - 1, r), at(c + 1, r)].concat(r > 0 ? [at(c, r - 1)] : [], r < ROWS - 1 ? [at(c, r + 1)] : []); };
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
  // the sea bodies of a set of sea provinces, largest first (ties: the lower first id), by the grid's own adjacency
  const bodies = (sea) => {
    const s = new Set(sea), seen = new Set(), out = [];
    for (const p of sorted(s)) {
      if (seen.has(p)) continue;
      const body = [p]; seen.add(p);
      for (let i = 0; i < body.length; i++) for (const q of neighbours(body[i])) if (s.has(q) && !seen.has(q)) { seen.add(q); body.push(q); }
      out.push(sorted(body));
    }
    return out.sort((a, b) => b.length - a.length || a[0] - b[0]);
  };
  return { COLS, ROWS, N, colOf, neighbours, d2, bmp, csv, bodies, all: Array.from({ length: N }, (_, i) => i + 1) };
}

// A game below from a manifest: `below` = { tag: { id, provinces, ports: { province: level }, forts: { province: coastal_bunker },
// fleet: province | null } }, `regions` = { id: [provinces] }. Its definition.csv's land is every province a state below holds, plus
// `extraLand`; its common/buildings defines the one provincial building a port shares a block with, coastal_bunker.
function buildGame(G, { regions, below, extraLand = [] }) {
  const g = tmpDir("game");
  mk(g, "map/provinces.bmp", G.bmp());
  mk(g, "map/definition.csv", G.csv([...new Set(Object.values(below).flatMap((s) => s.provinces).concat(extraLand))]));
  mk(g, "common/buildings/00_buildings.txt", "buildings = {\n\tcoastal_bunker = {\n\t\tshow_on_map = 1\n\t\tonly_costal = yes\n\t\tlevel_cap = {\n\t\t\tprovince_max = 10\n\t\t}\n\t}\n}\n");
  for (const [rid, ps] of Object.entries(regions)) mk(g, `map/strategicregions/${rid}.txt`, `strategic_region={\n\tid=${rid}\n\tname="REGION_${rid}"\n\tprovinces={ ${ps.join(" ")} }\n\tweather={}\n}\n`);
  for (const [tag, s] of Object.entries(below)) {
    const blocks = [...new Set(Object.keys(s.ports).concat(Object.keys(s.forts || {})))].map((p) => `\t\t\t${p} = {\n`
      + (s.ports[p] ? `\t\t\t\tnaval_base = ${s.ports[p]}\n` : "") + ((s.forts || {})[p] ? `\t\t\t\tcoastal_bunker = ${s.forts[p]}\n` : "") + "\t\t\t}\n");
    const ports = blocks.join("");
    mk(g, `history/states/${s.id}.txt`, `state = {\n\tid = ${s.id}\n\tname = "STATE_${s.id}"\n\tmanpower = 300000\n\tstate_category = rural\n\tprovinces = { ${s.provinces.join(" ")} }\n\thistory = {\n\t\towner = ${tag}\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n${ports}\t\t}\n\t}\n}\n`);
    mk(g, `history/countries/${tag} - ${tag}land.txt`, `capital = ${s.id}\n` + (s.fleet != null ? `oob = "${tag}_1936"\n` : ""));
    if (s.fleet != null) mk(g, `history/units/${tag}_1936.txt`, `units = {\n\tfleet = {\n\t\tname = "${tag} Fleet"\n\t\tnaval_base = ${s.fleet}\n\t\ttask_force = {\n\t\t\tname = "${tag} TF"\n\t\t\tlocation = ${s.fleet}\n`
      + `\t\t\tship = { name = "${tag} S" definition = destroyer equipment = { ship_hull_light_1 = { amount = 1 owner = ${tag} } } }\n\t\t}\n\t}\n}\n`);
  }
  return g;
}
// A Delete-map mod: its own provinces.bmp and a definition.csv with only `land` land; `states` its own state files (rel → text).
function buildMod(G, { land = [], states = {} } = {}) {
  const m = tmpDir("mod");
  mk(m, "descriptor.mod", 'version="1"\nname="Navy home"\nreplace_path="history/states"\npath="mod/navyhome"\n');
  mk(m, "map/provinces.bmp", G.bmp());
  mk(m, "map/definition.csv", G.csv(land));
  for (const [rel, text] of Object.entries(states)) mk(m, rel, text);
  return m;
}
function readStates(modRoot) {
  const dir = path.join(modRoot, "history", "states");
  return fs.readdirSync(dir).filter((f) => /\.txt$/i.test(f)).map((f) => {
    const t = fs.readFileSync(path.join(dir, f), "utf8").replace(/#[^\n]*/g, "");
    const provinces = (((/\bprovinces\s*=\s*\{([^}]*)\}/.exec(t) || [])[1]) || "").match(/\d+/g).map(Number);
    const owner = (/\bowner\s*=\s*([A-Za-z0-9_]+)/.exec(t) || [])[1] || "";
    const vp = +((/victory_points\s*=\s*\{\s*(\d+)/.exec(t) || [])[1] || -1);
    const blocks = [...t.matchAll(/(\d+)\s*=\s*\{([^{}]*)\}/g)].map((m) => ({ province: +m[1], body: m[2] }));
    const ports = blocks.map((b) => ({ province: b.province, level: +((/naval_base\s*=\s*(\d+)/.exec(b.body) || [])[1] || 0) })).filter((p) => p.level > 0);
    return { file: f, id: +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1], provinces, owner, vp, ports, blocks, blockProvinces: blocks.map((b) => b.province) };
  });
}
const GEN = (mod, game, extra = {}) => ({ modRoot: mod, gameRoot: game, dependencyRoots: [], provincesPerState: 8, seed: 3, ownerMode: "inherit",
  fillCutOffSeas: false, roughenCoast: false, ...extra });

// ── ⛔ THE MANIFEST: the world below and the regions that rise ─────────────────────────────────────────────────────────────────
const G1 = grid(8, 4);
const REGIONS = { 1: [17, 18], 2: [9, 10], 3: [19, 20], 4: [21, 22], 5: [1, 3, 4, 5, 6, 7, 8], 6: [11, 12], 7: [13, 14, 15, 16], 8: [23, 24] };
const BELOW = {   // owner → its state below, the ports on its provinces (province → level), and where its one task force berths
  // AAA's coastal forts stand on both provinces of its ocean-coast region, so wherever its home lands it shares that province's block
  AAA: { id: 1, provinces: [17, 18, 9, 10, 2], ports: { 2: 6 }, forts: { 17: 1, 18: 1 }, fleet: 2 },
  BBB: { id: 2, provinces: [19, 20], ports: { 19: 4 }, fleet: 19 },
  CCC: { id: 3, provinces: [21, 22, 23, 24, 13, 14, 15, 16, 27], ports: { 27: 1 }, fleet: null },
  DDD: { id: 4, provinces: [1, 3, 4, 5, 6, 7, 8, 26], ports: { 26: 3 }, fleet: 26 },
  FFF: { id: 5, provinces: [11, 12], ports: {}, fleet: 28 },
};

// ── what the manifest says, by grid arithmetic ───────────────────────────────────────────────────────────────────────────────
// `regions` rise, everything else is sea; each region is one state owned by whoever held its land below (asserted unanimous).
function expectFor(G, regions, below, { owner = null, oceanAt = null } = {}) {
  const raised = new Set(Object.values(regions).flat());
  const sea = G.all.filter((p) => !raised.has(p) && !(G.landAfter || []).includes(p));
  const bodies = G.bodies(sea);
  // the ocean: the body holding `oceanAt` (the ocean as it was) when given, else the largest — Generate land's own two answers
  const ocean = new Set(oceanAt ? bodies.find((b) => b.includes(oceanAt)) : bodies[0]);
  const seaSet = new Set(sea);
  const coast = new Set([...raised].filter((p) => G.neighbours(p).some((q) => seaSet.has(q))));
  const oceanOnly = new Set([...coast].filter((p) => G.neighbours(p).filter((q) => seaSet.has(q)).every((q) => ocean.has(q))));
  const ownerBelow = new Map(); const portBelow = new Map();
  for (const [t, s] of Object.entries(below)) for (const p of s.provinces) { ownerBelow.set(p, t); if (s.ports[p]) portBelow.set(p, s.ports[p]); }
  const states = Object.values(regions).map((ps) => {
    const tags = [...new Set(ps.map((p) => ownerBelow.get(p)))];
    return { provinces: ps, owner: owner || (tags.length === 1 ? tags[0] : null), unanimous: tags.length === 1,
      // portsFor: a port below on a province of the state still on the coast; else moved to the state's lowest spare coast
      ports: (() => { const out = [], drowned = []; for (const p of ps) if (portBelow.has(p)) (coast.has(p) ? out : drowned).push(p);
        const spare = ps.filter((p) => coast.has(p) && !out.includes(p)).sort((a, b) => a - b);
        return out.map((p) => ({ province: p, level: portBelow.get(p) })).concat(drowned.slice(0, spare.length).map((p, i) => ({ province: spare[i], level: portBelow.get(p) }))); })() };
  });
  const navies = Object.keys(below).filter((t) => below[t].fleet != null && (!owner || t === owner));
  const want = {};
  for (const t of navies.sort()) {
    const mine = states.filter((s) => s.owner === t);
    if (!mine.length) continue;
    if (mine.some((s) => s.ports.length)) { want[t] = { kept: true }; continue; }
    const myCoast = mine.flatMap((s) => s.provinces).filter((p) => coast.has(p));
    if (!myCoast.length) { want[t] = { noCoast: true }; continue; }
    const open = myCoast.filter((p) => oceanOnly.has(p)).sort((a, b) => a - b);
    if (!open.length) { want[t] = { noOceanCoast: true }; continue; }
    const f = below[t].fleet;
    const home = below[t].ports[f] ? f : Object.keys(below[t].ports).map(Number).sort((a, b) => below[t].ports[b] - below[t].ports[a] || a - b)[0];
    if (home == null) { want[t] = { noPortBelow: true }; continue; }
    let near = open[0]; for (const p of open) if (G.d2(p, home) < G.d2(near, home)) near = p;
    want[t] = { home, level: below[t].ports[home], near, state: mine.find((s) => s.provinces.includes(near)), open: new Set(open) };
  }
  return { raised, sea, bodies, ocean, coast, oceanOnly, states, want };
}
const E1 = expectFor(G1, REGIONS, BELOW);

console.log("=== 0. the fixture can tell right from wrong (controls, from the manifest alone) ===");
rec("CONTROL: every region's land was one country's below, so its owner is not a tie", E1.states.every((s) => s.unanimous), E1.states.map((s) => s.provinces));
rec("CONTROL: the new land walls AAA's home port 2 off from the ocean — a pond of its own", E1.bodies.length === 2 && E1.bodies.some((b) => sameSet(b, [2])), E1.bodies);
const pondCoastOfAAA = E1.states.filter((s) => s.owner === "AAA").flatMap((s) => s.provinces).filter((p) => E1.coast.has(p) && !E1.oceanOnly.has(p));
rec("CONTROL: AAA's pond coast is NEARER its home port than any of its ocean coast, so a rule that ignores the ocean picks the pond",
  pondCoastOfAAA.length > 0 && pondCoastOfAAA.every((p) => [...E1.want.AAA.open].every((q) => G1.d2(p, 2) < G1.d2(q, 2))), { pondCoastOfAAA, open: [...E1.want.AAA.open] });
rec("CONTROL: the manifest's verdicts — AAA housed, BBB kept its port, DDD only a pond coast, FFF no coast, CCC no navy",
  E1.want.AAA.near > 0 && E1.want.BBB.kept && E1.want.DDD.noOceanCoast && E1.want.FFF.noCoast && !E1.want.CCC, E1.want);

// ── run it, cold and then warm in one process ──────────────────────────────────────────────────────────────────────────────────
const game = buildGame(G1, { regions: REGIONS, below: BELOW });
const runs = [];
for (const label of ["cold", "warm"]) {
  const mod = buildMod(G1);
  const r = md.generateLand(GEN(mod, game, { count: E1.raised.size }));
  runs.push({ label, mod, r, states: readStates(mod) });
}
const portsOf = (R, tag) => R.states.filter((s) => s.owner === tag).flatMap((s) => s.ports.map((p) => ({ ...p, state: s })));
for (const R of runs) {
  const { label, r } = R;
  console.log(`\n=== 1. ${label}: who gets a harbour ===`);
  rec(`${label}: the world was generated, every region one state`, r && r.changed === true && E1.states.every((s) => R.states.some((q) => sameSet(q.provinces, s.provinces))) && R.states.length === E1.states.length,
    r && (r.error || R.states.map((s) => s.provinces)));
  const model = md.buildMapModel({ modRoot: R.mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
  const coast = md.landProvincesTouchingSea({ modRoot: R.mod, gameRoot: game, dependencyRoots: [], model });
  rec(`${label}: the coasts are the manifest's`, sameSet(coast, E1.coast), { got: sorted(coast), want: sorted(E1.coast) });
  // 2. AAA: one port, in its state on the ocean, on the victory point if that opens only onto the ocean, at its home port's level
  const a = portsOf(R, "AAA"), w = E1.want.AAA;
  rec(`${label}: ⭐ AAA (a navy whose every harbour is gone) has exactly one harbour`, a.length === 1, a.map((p) => [p.province, p.level]));
  if (a.length === 1) {
    const at = w.open.has(a[0].state.vp) ? a[0].state.vp : w.near;
    rec(`${label}: …on a coast that opens only onto the ocean, never the pond`, E1.oceanOnly.has(a[0].province), a[0].province);
    rec(`${label}: …in the state holding its ocean coast nearest its home port ${w.home}`, sameSet(a[0].state.provinces, w.state.provinces), a[0].state.provinces);
    rec(`${label}: CONTROL: that victory point is not the coast nearest the home port, so the fixture tells the one from the other`, a[0].state.vp !== w.near, { vp: a[0].state.vp, near: w.near });
    rec(`${label}: …on that state's victory point, which opens onto the ocean`, a[0].province === at && at === a[0].state.vp, { port: a[0].province, vp: a[0].state.vp });
    rec(`${label}: …and wherever it stands, on its state's victory point whenever that opens onto the ocean`, !w.open.has(a[0].state.vp) || a[0].province === a[0].state.vp,
      { port: a[0].province, vp: a[0].state.vp });
    rec(`${label}: …at the level its home port had below (${w.level})`, a[0].level === w.level, a[0].level);
    const mine = a[0].state.blocks.filter((b) => b.province === a[0].province);
    rec(`${label}: ⭐ …in ONE block with the coastal fort its province held below — the home is in the state's one ports list`,
      mine.length === 1 && /coastal_bunker\s*=\s*\d+/.test(mine[0].body) && BELOW.AAA.forts[a[0].province] > 0, mine);
  }
  // 3. BBB keeps exactly the port portsFor restored
  const b = portsOf(R, "BBB"), bWant = E1.states.filter((s) => s.owner === "BBB").flatMap((s) => s.ports);
  rec(`${label}: BBB (its port still on a coast) has exactly that port back and no second`, JSON.stringify(b.map((p) => [p.province, p.level])) === JSON.stringify(bWant.map((p) => [p.province, p.level])), b);
  // 4. #239, and the two navies that cannot be housed
  rec(`${label}: ⛔ CCC (no navy) gains no harbour, ocean coasts and a port below notwithstanding — the 652-state case`, portsOf(R, "CCC").length === 0, portsOf(R, "CCC"));
  rec(`${label}: DDD (only a pond to sail) gains no harbour`, portsOf(R, "DDD").length === 0, portsOf(R, "DDD"));
  rec(`${label}: FFF (no coast) gains no harbour`, portsOf(R, "FFF").length === 0, portsOf(R, "FFF"));
  // 5. the report
  const nh = (r && r.navyHome) || {};
  rec(`${label}: the report names the one home it gave, where from and at what level`, nh.given === 1 && (nh.provinces || []).length === 1 && nh.provinces[0].tag === "AAA"
    && nh.provinces[0].from === w.home && nh.provinces[0].level === w.level && nh.provinces[0].province === (a[0] || {}).province && nh.provinces[0].onVictoryPoint === true, nh);
  const by = (k) => Object.keys(E1.want).filter((t) => E1.want[t][k]).sort();
  rec(`${label}: …and the navies it could not house, by reason`, JSON.stringify(nh.noOceanCoast) === JSON.stringify(by("noOceanCoast")) && JSON.stringify(nh.noCoast) === JSON.stringify(by("noCoast"))
    && JSON.stringify(nh.noPortBelow) === JSON.stringify(by("noPortBelow")) && nh.navies === Object.keys(E1.want).length, { nh, want: E1.want });
  rec(`${label}: every navy whose states this click makes is asked, though none of those states is on disk when the rule asks (≥ ${Object.keys(E1.want).length})`,
    nh.navies >= Object.keys(E1.want).length, nh.navies);
  rec(`${label}: the count the page says is the homes written — given is the length of the list it names`, nh.given === (nh.provinces || []).length, nh);
  rec(`${label}: the restored ports are counted apart from the home — navalBases.restored is portsFor's alone`,
    (r.navalBases || {}).restored === E1.states.reduce((n, s) => n + s.ports.length, 0), r.navalBases);
  // 6. the corpus invariant
  const navies = new Set(md.startingUnitLocations({ modRoot: R.mod, gameRoot: game, dependencyRoots: [], model }).filter((u) => u.kind === "task_force").map((u) => u.tag));
  const housed = new Set(R.states.filter((s) => s.ports.length).map((s) => s.owner));
  const oceanCoastOwners = new Set(R.states.filter((s) => s.provinces.some((p) => E1.oceanOnly.has(p))).map((s) => s.owner));
  rec(`${label}: ⭐ every navy owning an ocean coast has a harbour`, navies.size === Object.values(BELOW).filter((s) => s.fleet != null).length && [...navies].filter((t) => oceanCoastOwners.has(t)).every((t) => housed.has(t)),
    { navies: [...navies], housed: [...housed] });
  // 13. the countries block permutes the generated ids here; every port must still stand in its own state, declared once
  const lo = r.firstStateId, hi = r.lastStateId;
  const capitalsInRange = Object.values(BELOW).filter((s) => s.id >= lo && s.id <= hi).length;
  rec(`${label}: CONTROL: every capital line below names a generated id, so the countries block permuted them (pinned ${capitalsInRange})`,
    capitalsInRange === Object.keys(BELOW).length && ((r.countries || {}).capitals || {}).pinned === capitalsInRange, r.countries);
  const astray = R.states.flatMap((s) => s.ports.filter((p) => !s.provinces.includes(p.province)).map((p) => ({ state: s.id, province: p.province })));
  const twice = R.states.filter((s) => new Set(s.blockProvinces).size !== s.blockProvinces.length).map((s) => s.id);
  rec(`${label}: ⭐⭐ every naval base a generated state declares stands on one of that state's own provinces`, R.states.some((s) => s.ports.length) && astray.length === 0, astray);
  rec(`${label}: …and no province's block is written twice`, twice.length === 0, twice);
}
rec("cold and warm write the same harbours", JSON.stringify(runs[0].states.map((s) => [s.id, s.provinces, s.ports]).sort()) === JSON.stringify(runs[1].states.map((s) => [s.id, s.provinces, s.ports]).sort()));
rec("cold and warm say the same", JSON.stringify(runs[0].r.navyHome) === JSON.stringify(runs[1].r.navyHome), [runs[0].r.navyHome, runs[1].r.navyHome]);

console.log("\n=== 1(b). the nearest coast is the one nearest on the map: across x, and straight along z ===");
// In section 1 AAA has ONE state on the ocean, so the distance never decides where its home goes. Here it owns two, and only the
// distance generateLand builds (provinceCentroids' { x, z }) can choose: in (x) the lower ids lie far across x, so a distance that
// is always 0 — or NaN, the raw `.y` of #the-nearest-that-was-not — takes the lowest id; in (z) the far state lies straight along z
// from the home port and holds the higher ids, so a distance that reads x alone takes it while "the lowest id" picks right.
for (const [label, regions, below] of [
  ["(x)", { 1: [3, 4], 2: [21, 22] }, { AAA: { id: 1, provinces: [3, 4, 21, 22, 31], ports: { 31: 5 }, fleet: 31 } }],
  ["(z)", { 1: [5, 6], 2: [31, 32] }, { AAA: { id: 1, provinces: [5, 6, 31, 32, 7], ports: { 7: 4 }, fleet: 7 } }],
]) {
  const E = expectFor(G1, regions, below), w = E.want.AAA || {}, open = sorted(w.open || []);
  const stateOf = (p) => E.states.find((s) => s.provinces.includes(p));
  const dx2 = (p) => (G1.colOf(p) - G1.colOf(w.home)) ** 2;
  let byX = open[0]; for (const p of open) if (dx2(p) < dx2(byX)) byX = p;
  rec(`${label} CONTROL: AAA's two states both open onto the ocean, and nothing below is restored in them`,
    E.states.length === 2 && E.states.every((s) => s.owner === "AAA" && !s.ports.length && s.provinces.some((p) => open.includes(p))) && w.near > 0, { states: E.states, want: w });
  if (label === "(x)") rec(`(x) CONTROL: its lowest-id ocean coast ${open[0]} is in the FAR state, so a distance that is always 0 takes the far one`,
    !!w.state && stateOf(open[0]) !== w.state, { lowest: open[0], near: w.near });
  else rec(`(z) CONTROL: by x alone its coast ${byX} in the FAR state is nearest, so a distance that drops z takes it — while its lowest id ${open[0]} is in the near one`,
    !!w.state && stateOf(byX) !== w.state && stateOf(open[0]) === w.state, { byX, lowest: open[0], near: w.near });
  const gameN = buildGame(G1, { regions, below }), mod = buildMod(G1);
  const r = md.generateLand(GEN(mod, gameN, { count: E.raised.size }));
  const ports = readStates(mod).flatMap((s) => s.ports.map((p) => ({ ...p, state: s })));
  // ⚠️ Moved with #a-country-reaches-its-land-by-sea (supply critique, commit 1 (b)): AAA's two states here do not touch, so they are
  // two pieces of its land, and the one the navy home is not in now gets a harbour of its own, the sea route's (r.seaRoute). The
  // navy home is still ONE harbour, at the home port's level, in the state nearest the home port — and every other harbour is the
  // sea route's, in the other state. A distance that is always 0, or drops z, puts the home in the far state, and the near one then
  // holds the sea route's harbour instead — level 1 in (z); in (x), where the near state is the capital's piece, at the level its
  // land held below, so there it is navyHome's own province that bites.
  const route = ((r.seaRoute || {}).provinces || []).filter((x) => x.tag === "AAA");
  const mine = w.state ? ports.filter((p) => sameSet(p.state.provinces, w.state.provinces)) : [];
  const home = ((r.navyHome || {}).provinces || []).filter((x) => x.tag === "AAA");
  const at = mine.length === 1 ? (open.includes(mine[0].state.vp) ? mine[0].state.vp : w.near) : -1;
  rec(`${label} ⭐ AAA's navy home is ONE harbour, in the state nearest its home port ${w.home} (${w.state ? w.state.provinces : "?"}), at level ${w.level}`,
    mine.length === 1 && mine[0].province === at && mine[0].level === w.level && home.length === 1 && home[0].province === at,
    { ports: ports.map((p) => [p.province, p.level, p.state.provinces]), navyHome: r.navyHome, seaRoute: r.seaRoute, error: r.error });
  rec(`${label} …and the only other harbour is the sea route's, in AAA's other piece`,
    ports.length === 1 + route.length && route.length === 1 && ports.some((p) => p.province === route[0].province && !sameSet(p.state.provinces, (w.state || {}).provinces || [])),
    { ports: ports.map((p) => [p.province, p.level, p.state.provinces]), route });
}

console.log("\n=== 2. end to end: Auto-fix's re-berth takes AAA's fleet into the harbour this wrote ===");
{
  const R = runs[0];
  const fx = md.fixDrownedFleetBerths({ modRoot: R.mod, gameRoot: game, dependencyRoots: [] });
  const a = portsOf(R, "AAA")[0];
  const f = path.join(R.mod, "history", "units", "AAA_1936.txt");
  const t = fs.existsSync(f) ? fs.readFileSync(f, "utf8") : "";
  rec("⭐ AAA's task force now lies in its new harbour", !!a && new RegExp(`location = ${a.province}\\b`).test(t), { fx: fx && { moved: fx.moved, toSea: fx.toSea, noHarbour: fx.noHarbour }, t: t.slice(0, 300) });
  rec("…and so does its fleet's home", !!a && new RegExp(`naval_base = ${a.province}\\b`).test(t), t.slice(0, 200));
}

console.log("\n=== 3. single-tag mode: the owner is the one tag, for this rule as for the state files ===");
{
  // (a) the whole world is AAA's, BBB's restored port with it: AAA holds a harbour, so nothing is added
  const Ea = expectFor(G1, REGIONS, BELOW, { owner: "AAA" });
  const mod = buildMod(G1), r = md.generateLand(GEN(mod, game, { count: Ea.raised.size, ownerMode: "single", owner: "AAA" })), states = readStates(mod);
  const want = Ea.states.flatMap((s) => s.ports).map((p) => [p.province, p.level]);
  rec("CONTROL: in single mode AAA owns BBB's state, and with it the port portsFor restores there", Ea.want.AAA && Ea.want.AAA.kept && want.length === 1, { want: Ea.want, ports: want });
  rec("(a) every state is AAA's, and its only harbour is the restored one", states.every((s) => s.owner === "AAA") && JSON.stringify(states.flatMap((s) => s.ports).map((p) => [p.province, p.level])) === JSON.stringify(want),
    states.map((s) => [s.owner, s.ports]));
  rec("(a) …so no home is given", (r.navyHome || {}).given === 0 && ((r.navyHome || {}).provinces || []).length === 0, r.navyHome);
  // (b) the same world with no port of BBB's below: AAA, the one tag, kept no harbour and gets its home
  const noBBB = { ...BELOW, BBB: { ...BELOW.BBB, ports: {} } };
  const Eb = expectFor(G1, REGIONS, noBBB, { owner: "AAA" });
  const gameB = buildGame(G1, { regions: REGIONS, below: noBBB });
  const modB = buildMod(G1), rb = md.generateLand(GEN(modB, gameB, { count: Eb.raised.size, ownerMode: "single", owner: "AAA" })), sb = readStates(modB);
  const ports = sb.flatMap((s) => s.ports.map((p) => ({ ...p, state: s }))), w = Eb.want.AAA;
  const at = ports.length === 1 ? (w.open.has(ports[0].state.vp) ? ports[0].state.vp : w.near) : -1;
  rec("CONTROL: with BBB's port gone, nothing below is restored", Eb.states.every((s) => !s.ports.length) && w && w.near > 0, Eb.want);
  rec(`(b) ⭐ AAA, the one tag, gets exactly one harbour: in the state nearest its home port ${w.home}, on its victory point, at level ${w.level}`,
    ports.length === 1 && sameSet(ports[0].state.provinces, w.state.provinces) && ports[0].province === at && ports[0].level === w.level, { ports: ports.map((p) => [p.province, p.level, p.state.provinces, p.state.vp]), want: w });
  rec("(b) …and the report says so", (rb.navyHome || {}).given === 1 && (((rb.navyHome || {}).provinces || [])[0] || {}).tag === "AAA", rb.navyHome);
}

console.log("\n=== 4. a harbour in a state that already loads counts when it is on a coast: AAA holding one in the mod's own state gains nothing ===");
{
  // the mod already has state 50 on province 28 (land in its own map, on the ocean's coast) — AAA's, with a naval base
  const st50 = "state = {\n\tid = 50\n\tname = \"STATE_50\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 28 }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 1\n\t\t\t28 = {\n\t\t\t\tnaval_base = 2\n\t\t\t}\n\t\t}\n\t}\n}\n";
  const mod = buildMod(G1, { land: [28], states: { "history/states/50-STATE_50.txt": st50 } });
  const model0 = md.buildMapModel({ modRoot: mod, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
  const s50 = (model0.states || []).find((s) => s.id === 50);
  const coast0 = md.landProvincesTouchingSea({ modRoot: mod, gameRoot: game, dependencyRoots: [], model: model0 });
  rec("CONTROL: the mod's state 50 loads, AAA's, with its naval base on 28, which touches the sea", !!s50 && s50.owner === "AAA" && +((s50.provinceBuildings || {})[28] || {}).naval_base === 2 && coast0.has(28),
    s50 && { owner: s50.owner, pb: s50.provinceBuildings });
  const r = md.generateLand(GEN(mod, game, { count: E1.raised.size }));
  const gen = readStates(mod).filter((s) => s.id !== 50);
  rec("CONTROL: AAA still owns its generated states, and so would qualify but for state 50", gen.filter((s) => s.owner === "AAA").length === E1.states.filter((s) => s.owner === "AAA").length, gen.map((s) => [s.owner, s.provinces]));
  // ⚠️ Moved with review NS-7 (#a-country-reaches-its-land-by-sea counts a country's land that already loads as pieces of it): AAA's
  // capital line names state 1, which does not load here — state 50 pushes the new ids to 51 on — so Auto-fix stands its capital on its
  // most important state, generated land with no harbour, and state 50's port is on another piece. So the navy home still gains
  // nothing, but the capital's piece gets the sea route's harbour, at AAA's best level below, and that is the only one it gains.
  const genPorts = gen.filter((s) => s.owner === "AAA").flatMap((s) => s.ports);
  const route = ((r.seaRoute || {}).provinces || []).filter((x) => x.tag === "AAA"), best = Math.max(...Object.values(BELOW.AAA.ports));
  rec("CONTROL: AAA's capital line names no state that loads after the click", !gen.concat([s50]).some((s) => s.id === BELOW.AAA.id), gen.map((s) => s.id));
  rec(`⭐ AAA gains no navy home among the generated states — the one harbour there is the sea route's, on its capital's piece, at its best level below (${best})`,
    genPorts.length === 1 && route.length === 1 && route[0].piece === "capital" && genPorts[0].province === route[0].province && genPorts[0].level === best && route[0].level === best,
    { genPorts, route, seaRoute: r.seaRoute && { ...r.seaRoute, provinces: undefined } });
  rec("…and no home is given", (r.navyHome || {}).given === 0, r.navyHome);

  // (b) …but only a harbour ON A COAST counts. State 50 grown to 27, 28, 29: once the click raises 20 the base on 28 has land on every
  // side and can berth nothing — a second Generate land raising land in front of the first world's harbour — so AAA is housed as if
  // state 50 held none, where the manifest's distance puts it.
  const G4 = grid(8, 4); G4.landAfter = [27, 28, 29];
  const E4 = expectFor(G4, REGIONS, BELOW), w4 = E4.want.AAA || {};
  const modB = buildMod(G4, { land: G4.landAfter, states: { "history/states/50-STATE_50.txt": st50.replace("provinces = { 28 }", "provinces = { 27 28 29 }") } });
  const modelB0 = md.buildMapModel({ modRoot: modB, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
  const s50b = (modelB0.states || []).find((s) => s.id === 50);
  const coastB0 = md.landProvincesTouchingSea({ modRoot: modB, gameRoot: game, dependencyRoots: [], model: modelB0 });
  rec("4(b) CONTROL: state 50 loads, AAA's, its naval base on 28 on the sea before the click — and every province beside 28 is land after it",
    !!s50b && s50b.owner === "AAA" && sameSet(s50b.provinces || [], G4.landAfter) && +((s50b.provinceBuildings || {})[28] || {}).naval_base === 2 && coastB0.has(28)
      && G4.neighbours(28).every((q) => E4.raised.has(q) || G4.landAfter.includes(q)) && w4.near > 0,
    s50b && { owner: s50b.owner, provinces: s50b.provinces, pb: s50b.provinceBuildings, coast28: coastB0.has(28) });
  const rb = md.generateLand(GEN(modB, game, { count: E4.raised.size }));
  const modelB = md.buildMapModel({ modRoot: modB, gameRoot: game, dependencyRoots: [], cacheStableLayers: true });
  rec("4(b) CONTROL: after the click Nova's own coast reader agrees — 28 touches no sea",
    rb.changed === true && !md.landProvincesTouchingSea({ modRoot: modB, gameRoot: game, dependencyRoots: [], model: modelB }).has(28), rb.error);
  const aB = readStates(modB).filter((s) => s.id !== 50 && s.owner === "AAA").flatMap((s) => s.ports.map((p) => ({ ...p, state: s })));
  const atB = aB.length === 1 ? (w4.open.has(aB[0].state.vp) ? aB[0].state.vp : w4.near) : -1;
  rec(`4(b) ⭐ AAA, whose one loaded harbour the click landlocked, gains exactly one: in the state nearest its home port ${w4.home}, at level ${w4.level}`,
    aB.length === 1 && sameSet(aB[0].state.provinces, w4.state.provinces) && aB[0].province === atB && aB[0].level === w4.level
      && ((rb.navyHome || {}).provinces || []).filter((h) => h.tag === "AAA").length === 1, { ports: aB.map((p) => [p.province, p.level]), navyHome: rb.navyHome });
}

console.log("\n=== 5. the ocean is where the ocean was: a sea cut off before the click, larger than the ocean it leaves ===");
{
  // 4 x 6: rows 0-1 (1-8) a designed sea, row 2 (9-12) land the mod already has, rows 3-4 (13-20) rise, row 5 (21-24) the ocean.
  // NNN held rows 3-5 below, its fleet in its port on 21, which is the ocean now.
  const G2 = grid(4, 6);
  const DESIGNED = [1, 2, 3, 4, 5, 6, 7, 8], HELD = [9, 10, 11, 12], R2 = { 1: [13, 14, 15, 16, 17, 18, 19, 20] };
  const B2 = { NNN: { id: 1, provinces: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], ports: { 21: 5 }, fleet: 21 } };
  G2.landAfter = HELD;
  const before = G2.bodies(G2.all.filter((p) => !HELD.includes(p)));
  const E2 = expectFor(G2, R2, B2, { oceanAt: 21 });
  rec("CONTROL: before the click the designed sea is cut off and smaller than the ocean", before.length === 2 && sameSet(before[1], DESIGNED) && before[0].length > DESIGNED.length, before);
  rec("CONTROL: after it the designed sea is the LARGEST body — so 'the largest' calls the real ocean's coast a pond",
    E2.bodies.length === 2 && sameSet(E2.bodies[0], DESIGNED) && !E2.ocean.has(DESIGNED[0]) && E2.want.NNN && E2.want.NNN.near > 0, { bodies: E2.bodies, want: E2.want });
  const g2 = buildGame(G2, { regions: R2, below: B2, extraLand: HELD });
  const mod = buildMod(G2, { land: HELD });
  const r = md.generateLand(GEN(mod, g2, { count: R2[1].length, fillCutOffSeas: true }));   // Generate land's own fill decides the ocean
  const st = readStates(mod), ports = st.flatMap((s) => s.ports.map((p) => ({ ...p, state: s }))), w = E2.want.NNN;
  rec("CONTROL: the click left the designed sea as it was — not filled, not joined", r.changed === true && (r.inlandSeas || {}).filled === 0 && !((r.inlandSeas || {}).leftSea || []).length, r.inlandSeas);
  const at = ports.length === 1 ? (w.open.has(ports[0].state.vp) ? ports[0].state.vp : w.near) : -1;
  rec(`⭐⭐ NNN gets exactly one harbour, on its coast on the ocean as it was (level ${w.level} from ${w.home})`,
    ports.length === 1 && E2.oceanOnly.has(ports[0].province) && ports[0].province === at && ports[0].level === w.level, { ports: ports.map((p) => [p.province, p.level]), vp: st.map((s) => s.vp), navyHome: r.navyHome });
  rec("…and the report says no coast of it faced a cut-off sea", (r.navyHome || {}).given === 1 && JSON.stringify((r.navyHome || {}).noOceanCoast) === "[]", r.navyHome);
}

console.log("\n=== 6. the rule itself: navyHomePorts and opensOntoOcean, pure ===");
rec("navyHomePorts and opensOntoOcean are exported", typeof md.navyHomePorts === "function" && typeof md.opensOntoOcean === "function");
if (typeof md.navyHomePorts === "function" && typeof md.opensOntoOcean === "function") {
  const g1 = { id: 1, provinces: [10, 11] }, g2 = { id: 2, provinces: [30, 31] };
  const ask = (o) => md.navyHomePorts({ groups: [g1], ownerOfGroup: () => "TTT", portsOfGroup: () => [], harbourTags: new Set(), coast: new Set([10, 11]),
    opensOntoOcean: () => true, distance: (a, b) => Math.abs(a - b), ...o });
  const fleet = (...at) => at.map((p) => ({ tag: "TTT", kind: "task_force", province: p }));
  const port = (lv, owner = "TTT") => ({ owner, navalBase: lv });
  const home = (r) => { const h = r.homes.get(g1) || r.homes.get(g2); return h ? [h.from, h.level, h.near] : null; };
  rec("most task forces win over the higher level: 2 at a level-3 port, 1 at a level-5 one → the level-3 one",
    JSON.stringify(home(ask({ taskForces: fleet(100, 100, 200), beneath: new Map([[100, port(3)], [200, port(5)]]) }))) === JSON.stringify([100, 3, 11]));
  rec("equal votes → the higher level", (home(ask({ taskForces: fleet(100, 200), beneath: new Map([[100, port(3)], [200, port(5)]]) })) || [])[0] === 200);
  rec("equal votes, equal level → the lower id", (home(ask({ taskForces: fleet(200, 100), beneath: new Map([[200, port(4)], [100, port(4)]]) })) || [])[0] === 100);
  rec("no task force at a port of its own → its highest-level port below, never another country's",
    (home(ask({ taskForces: fleet(300), beneath: new Map([[100, port(2)], [200, port(7)], [300, port(9, "UUU")]]) })) || [])[0] === 200);
  const none = ask({ taskForces: fleet(300), beneath: new Map([[300, port(9, "UUU")]]) });
  rec("no port of its own below → noPortBelow, and nothing given", none.homes.size === 0 && JSON.stringify(none.report.noPortBelow) === '["TTT"]' && none.report.given === 0, none.report);
  // home port 20, its coasts 30 and 10 both 10 away (listed high id first, so the order given cannot be what decides)
  const tie = md.navyHomePorts({ groups: [{ id: 1, provinces: [30, 10] }], ownerOfGroup: () => "TTT", portsOfGroup: () => [], coast: new Set([10, 30]), opensOntoOcean: () => true,
    distance: (a, b) => Math.abs(a - b), taskForces: fleet(20), beneath: new Map([[20, port(1)]]) });
  rec("its nearest coast to the home port, a tie in distance going to the lower id", [...tie.homes.values()].map((h) => h.near).join() === "10", [...tie.homes.values()]);
  const two = md.navyHomePorts({ groups: [g1, g2], ownerOfGroup: () => "TTT", portsOfGroup: () => [], coast: new Set([10, 11, 30, 31]), opensOntoOcean: (p) => p !== 31,
    distance: (a, b) => Math.abs(a - b), taskForces: fleet(29), beneath: new Map([[29, port(2)]]) });
  const h2 = two.homes.get(g2);
  rec("⭐ the home is keyed by the GROUP OBJECT that holds the nearest coast (never by its id), with that group's open coast only",
    two.homes.size === 1 && !!h2 && h2.near === 30 && sameSet(h2.open, [30]) && two.homes.get(2) === undefined, [...two.homes].map(([g, h]) => [g.id, h.near, [...h.open]]));
  rec("a harbour in a loaded state → counted a navy, given nothing", ask({ taskForces: fleet(100), beneath: new Map([[100, port(3)]]), harbourTags: new Set(["TTT"]) }).report.given === 0
    && ask({ taskForces: fleet(100), beneath: new Map([[100, port(3)]]), harbourTags: new Set(["TTT"]) }).report.navies === 1);
  rec("a port restored in one of its states → given nothing", ask({ taskForces: fleet(100), beneath: new Map([[100, port(3)]]), portsOfGroup: () => [{ province: 10, level: 1 }] }).report.given === 0);
  rec("a navy that owns none of these states is not this click's: not even counted", ask({ taskForces: fleet(100), beneath: new Map([[100, port(3)]]), ownerOfGroup: () => "VVV" }).report.navies === 0);
  const noCoast = ask({ taskForces: fleet(100), beneath: new Map([[100, port(3)]]), coast: new Set() });
  const pond = ask({ taskForces: fleet(100), beneath: new Map([[100, port(3)]]), opensOntoOcean: () => false });
  rec("no coast → noCoast; a coast that opens on no ocean → noOceanCoast", JSON.stringify(noCoast.report.noCoast) === '["TTT"]' && JSON.stringify(pond.report.noOceanCoast) === '["TTT"]'
    && noCoast.homes.size === 0 && pond.homes.size === 0);
  rec("a country with no navy is never asked", ask({ taskForces: [], beneath: new Map([[100, port(3)]]) }).report.navies === 0);
  // opensOntoOcean over a hand-made graph: 2 and 3 the ocean, 5 a pond, 8 a lake (not a sea at all)
  const adj = new Map([[1, new Set([2, 3])], [4, new Set([3, 5])], [6, new Set([1, 4])], [7, new Set([2, 8])]]);
  const types = new Map([[2, "sea"], [3, "sea"], [5, "sea"], [8, "lake"], [1, "land"], [4, "land"], [6, "land"], [7, "land"]]);
  const opens = (p) => md.opensOntoOcean(p, { adj, isSea: (id) => types.get(id) === "sea", oceanBody: new Set([2, 3]) });
  rec("opensOntoOcean: every sea beside it is the ocean → yes", opens(1) === true);
  rec("…one sea beside it is a pond → no", opens(4) === false);
  rec("…no sea beside it at all → no", opens(6) === false);
  rec("…a lake beside it is not a sea, so the ocean alone counts → yes", opens(7) === true);
}

let pageNote = null;   // section 7's generatedNavyHomeNote, for section 8
console.log("\n=== 7. the page says it ===");
{
  const { maskJsLiterals, jsBodyAt, stripJsComments } = require("./testlib-strip-comments.js");
  const PAGE = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"), MASKED = maskJsLiterals(PAGE);
  const at = MASKED.indexOf("function generatedNavyHomeNote("), body = at < 0 ? null : jsBodyAt(MASKED, at);
  rec("public/map.js has generatedNavyHomeNote", !!body);
  const note = body ? vm.runInNewContext("(" + PAGE.slice(at, body[1] + 1) + ")") : () => "";
  if (body) pageNote = note;
  const real = note(runs[0].r), h = ((runs[0].r.navyHome || {}).provinces || [])[0] || { tag: "AAA", province: -1, level: -1 };
  rec("⭐ the home it gave is said: the country, the province and the level", real.includes(h.tag) && real.includes(String(h.province)) && real.includes(`level ${h.level}`), real);
  rec("…and as a NEW harbour, never as the old port back", /new harbour/.test(real) && !/home port back/.test(real), real);
  rec("…the navy with no coast is said, and that its fleets start at sea", /FFF/.test(real) && /no coast/.test(real) && /at sea/.test(real), real);
  rec("⚠ …and the one whose only coast faces a sea cut off from the ocean", /⚠[^⚠]*DDD/.test(real) && /cut off from the ocean/.test(real), real);
  const two = note({ navyHome: { given: 2, provinces: [{ tag: "JAP", province: 12097, level: 10, from: 1092 }, { tag: "SOV", province: 9197, level: 10, from: 3151 }], noCoast: [], noOceanCoast: [], noPortBelow: [] } });
  rec("two homes read as plural, and both are named", /^ 2 navies/.test(two) && /JAP/.test(two) && /SOV/.test(two), two);
  const one = note({ navyHome: { given: 1, provinces: [{ tag: "JAP", province: 12097, level: 10, from: 1092 }], noCoast: [], noOceanCoast: [], noPortBelow: [] } });
  rec("…one as singular", /^ 1 navy that/.test(one), one);
  rec("a navy with no port below to take a level from is said too", /ZZZ/.test(note({ navyHome: { given: 0, provinces: [], noCoast: [], noOceanCoast: [], noPortBelow: ["ZZZ"] } })));
  const err = note({ navyHome: { given: 0, provinces: [], error: "boom" } });
  rec("⚠ a rule that failed is said with its reason", /⚠/.test(err) && err.includes("boom"), err);
  rec("CONTROL: nothing to say says nothing", note({ navyHome: { given: 0, provinces: [], noCoast: [], noOceanCoast: [], noPortBelow: [] } }) === "" && note({}) === "" && note(null) === "");
  // The click's success line is the LAST reload before its .catch (the first after the POST is a click that stopped part-way)
  const handler = stripJsComments(PAGE), post = handler.indexOf('fetch("/api/map/generate-land"');
  const caught = post < 0 ? -1 : handler.indexOf(".catch(", post), done = caught < 0 ? -1 : handler.lastIndexOf("reloadAfterImmediateWrite(", caught);
  // ⚠️ MOVED WITH 🌍 Generate a world: the handler hands generatedLandResultNote(res) to the reload, and the notes are built in that
  // function (the world shows the same words for its own Generate land step) — so the report is read through it (testlib-map-page.js)
  const line = require("./testlib-map-page.js").generateLandReportLine(handler);
  rec("⭐⭐ the Generate land report on the page carries it", /=\s*generatedNavyHomeNote\(res\)/.test(line) && /\$\{navyNote\}/.test(line.slice(line.lastIndexOf("reloadAfterImmediateWrite("))), line.slice(-200));
}

console.log("\n=== 8. an order of battle that could not be read is said — never taken for a world that starts no fleet ===");
{
  // Every rule of Generate land reads the units ONCE (startedUnitsNow, #what-the-new-world-starts). Made to fail here the way any read
  // can, for this one click: unit-data.js's splitTop, the parser every order-of-battle file is read with, throws. Harbours' own read
  // used to land that throw in this rule's catch, which says it; once the two rules shared one read, its catch kept the throw to
  // itself — 0 navies asked, no error, and nothing on the page, while every coastal navy that lost its harbours kept none (MX-R1).
  const ud = require("./unit-data.js"), realSplit = ud.splitTop, WHY = "probe: an order-of-battle file could not be parsed";
  const mod = buildMod(G1);
  let r = null, asked = 0;
  ud.splitTop = function splitTop() { asked++; throw new Error(WHY); };
  try { r = md.generateLand(GEN(mod, game, { count: E1.raised.size })); } finally { ud.splitTop = realSplit; }
  const st = readStates(mod), nh = (r && r.navyHome) || {}, ab = (r && r.airBases) || {}, aaa = portsOf({ states: st }, "AAA");
  rec("CONTROL: the read was asked, and failed — the parser threw", asked > 0, asked);
  rec("…and the click still made the world: a read that failed costs no land", !!r && r.changed === true && st.length === E1.states.length, r && (r.error || st.length));
  rec("⭐⭐ the navy homes say the read failed, with its reason", typeof nh.error === "string" && nh.error.includes(WHY), nh);
  rec("…and give no home they could not decide: AAA, whom a read that works houses, gains none", nh.given === 0 && !(nh.provinces || []).length && aaa.length === 0,
    { nh, AAA: aaa.map((p) => [p.province, p.level]) });
  rec("⭐ the air bases say it too: sized without the planes the orders of battle start, not failed", typeof ab.wingsError === "string" && ab.wingsError.includes(WHY) && !ab.error, ab);
  rec("CONTROL: a click whose read works says neither", !("error" in (runs[0].r.navyHome || {})) && !("wingsError" in (runs[0].r.airBases || {})), [runs[0].r.navyHome, runs[0].r.airBases]);
  const said = pageNote ? pageNote(r) : "";
  rec("⚠ …and the page says the homes were not decided, with the reason", /⚠/.test(said) && said.includes(WHY), said);
}

try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}   // scratch fixtures only — never a mod directory (⛔ CLAUDE.md #1)
console.log("\n" + (fails.length ? "FAILED " + fails.length + " of " + checks : "PASSED " + checks + " checks"));
if (fails.length) { for (const f of fails) console.log("  - " + f); process.exit(1); }
