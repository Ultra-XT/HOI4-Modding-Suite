// 🧱 #a-world-keeps-the-base-games-state-ids — THE STRUCTURAL ANSWER TO EVERY MISSING-STATE CRASH.
//
// A rebuilt world replaces history/states and still loads the base game's focuses, decisions, events and AI plans, which
// name states by id up to 1,081. The owner's Nova world had 832 states, and three of its crash layers were references to
// the 249 it lacked (an AI list's 844, Denmark's 910.DEN_develop_state_cost, a history effect on 971). Six of the seven
// shipping map mods keep every base-game id; the seventh replaces the base game's script folders instead. The owner, on
// 2026-09-24: "i dont mind if u wanna push to 1081, its ur call, the world we built is random".
//
// So Auto-fix splits the largest states (each id, where it can, out of the country that held it below) until every id up to
// the base game's ceiling exists. Measured on TEST 23's world:
// 249 states added in 219 s, script references to a missing state 1,702 → 0, no fatal problem before or after.
//
// ⚠️ A FRESH WORLD NO LONGER NEEDS THIS PASS (#a-generated-world-has-every-state-id-the-scripts-name). Those 249 were states
// Generate land never wrote, so they had no air base, no city and no supply hub — TEST 31's stars with nothing at them.
// Generate land now asks the same ceiling (stateIdCeilingScriptsName) and makes every id itself, cutting with the same walk
// (contiguousHalf), and this pass then finds nothing to do on a world it has just built; pinned in
// test-a-generated-world-has-every-state-id-the-scripts-name.js. The split stays the repair for every OTHER world — one built
// before that, one a modder shrank by hand, one whose land could not reach the ceiling when it was generated — and that is
// what this file builds: worlds written state by state, never through Generate land.
//
// What this pins, on a fixture whose base game has states 1..8 and whose world keeps 3:
//   · the rule counts the missing ids; the fix adds exactly that many, ids contiguous, every state keeping land
//   · each new state is its parent's: owner and cores copied, manpower SHARED (the total is unchanged), land contiguous
//   · the gate: nothing when the mod keeps the base states, nothing when it replaces all three base script folders
//     (Hearts of Minecraft's shape), nothing when the world already has every id
//   · idempotence, and that Auto-fix runs it before the passes that neutralise references to missing states
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-floor-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-floor-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

// ── the fixture map: 8x8 provinces of 32px, ids 1..64 by row; rows 0–1 (1..16) are land ──────────────────────────
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const provAt = (x, y) => Math.floor(x / 32) + Math.floor(y / 32) * 8 + 1;
const COL = (p) => [((p * 29) % 210) + 15, ((p * 67) % 210) + 15, ((p * 101) % 210) + 15];
const BMP = bmp24(256, 256, (x, y) => COL(provAt(x, y)));
const DEFINITION = ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: 64 }, (_, i) => {
  const p = i + 1, [r, g, b] = COL(p), land = p <= 16;
  return `${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`;
})).join("\n") + "\n";
const state = (id, provs, owner, manpower) =>
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n\t\tadd_core_of = ${owner}\n\t\tbuildings = { infrastructure = 2 }\n\t}\n}\n`;

// the base game: 8 states of two provinces each — its scripts may name any of 1..8
const GAME = tmp("game");
mk(GAME, "map/provinces.bmp", BMP);
mk(GAME, "map/definition.csv", DEFINITION);
// (each worth 3 victory points: what a state of the floor's making is worth, read off the layer below)
// ⛔ #an-id-the-scripts-name-goes-back-to-its-country — the floor cuts each id from the country that held it below, and only when
// the world has no splittable state of that country does it cut the largest. Every id here was ZZZ's, a country this world does
// not have, so the floor walks the largest states — the walk everything below is derived from. Which country's land an id goes
// to is pinned in test-an-id-the-scripts-name-goes-back-to-its-country.js.
const BELOW = "ZZZ";
for (let id = 1; id <= 8; id++) mk(GAME, `history/states/${id}-S.txt`, state(id, [2 * id - 1, 2 * id], BELOW, 2000).replace("\t\tbuildings", `\t\tvictory_points = { ${2 * id} 3 }\n\t\tbuildings`));
// …and a base-game event that names state 8, so the loaded scripts reach the base game's highest id
mk(GAME, "events/base.txt", "namespace = base\ncountry_event = {\n\tid = base.1\n\toption = {\n\t\tname = base.1.a\n\t\t8 = { add_core_of = ROOT }\n\t}\n}\n");

// a world of 3 states over the same 16 provinces: row 0 is AAA's, row 1 is BBB's in two states
function makeWorld(extraReplace = [], states = [[1, [1, 2, 3, 4, 5, 6, 7, 8], "AAA", 8000], [2, [9, 10, 11, 12], "BBB", 4000], [3, [13, 14, 15, 16], "BBB", 4000]]) {
  const m = tmp("mod");
  mk(m, "descriptor.mod", `name="floor fixture"\nreplace_path="history/states"\n${extraReplace.map((r) => `replace_path="${r}"\n`).join("")}`);
  for (const [id, provs, owner, mp] of states) mk(m, `history/states/${id}-W.txt`, state(id, provs, owner, mp));
  return m;
}
const ctx = (m) => ({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
const rowsFor = (m) => (md.validateMapModel(md.buildMapModel(ctx(m))) || []).filter((p) => p.rule === "state_ids_below_base");
const statesOf = (m) => md.buildMapModel(ctx(m)).states.slice().sort((a, b) => a.id - b.id);

try {
  console.log("=== the rule ===");
  const W = makeWorld();
  rec("THE CONTROL: the base game's ceiling reads 8", md.baseStateIdCeiling({ gameRoot: GAME, dependencyRoots: [] }) === 8);
  const r0 = rowsFor(W);
  rec("⭐⭐⭐ it fires on a world of 3 states under a base game of 8, counting the 5 missing ids", r0.length === 1 && r0[0].total === 5, r0.map((p) => p.message));
  rec("⭐⭐ it is a warning, not a crash claim", r0[0] && r0[0].severity === "warning");

  console.log("\n=== the repair ===");
  const before = statesOf(W);
  const mpBefore = before.reduce((n, s) => n + (+s.manpower || 0), 0);
  const r = md.fixStateIdFloor(ctx(W));
  rec("⭐⭐⭐ it adds exactly the 5 missing states, with no errors", r.added === 5 && !(r.errors || []).length && !r.stoppedShort, r);
  rec("⭐⭐ each id was " + BELOW + "'s below, a country this world does not have, so each was cut from the largest state: none from its country",
    (r.details || []).length === 5 && r.details.every((d) => d.ownerBelow === BELOW) && r.fromItsCountry === 0 && r.details[0].from === 1, r.details);
  const after = statesOf(W);
  rec("⭐⭐⭐ the world now has ids 1..8, contiguous", after.map((s) => s.id).join(",") === "1,2,3,4,5,6,7,8", after.map((s) => s.id));
  rec("⭐⭐⭐ every state keeps land — none emptied, none empty", after.every((s) => (s.provinces || []).length >= 1), after.map((s) => [s.id, s.provinces]));
  const all = after.flatMap((s) => s.provinces.map(Number));
  rec("⭐⭐ every province is still in exactly one state", all.length === 16 && new Set(all).size === 16, all);
  const mpAfter = after.reduce((n, s) => n + (+s.manpower || 0), 0);
  rec("⭐⭐⭐ manpower is SHARED, not minted: the world's total is unchanged", mpAfter === mpBefore, { mpBefore, mpAfter });
  const ownerOf = new Map(after.map((s) => [s.id, String(s.owner || "").toUpperCase()]));
  const row0 = after.filter((s) => s.provinces.every((p) => +p <= 8)), row1 = after.filter((s) => s.provinces.every((p) => +p >= 9));
  rec("⭐⭐⭐ each new state is its parent's: every piece of AAA's row is AAA's, every piece of BBB's is BBB's",
    row0.length + row1.length === 8 && row0.every((s) => ownerOf.get(s.id) === "AAA") && row1.every((s) => ownerOf.get(s.id) === "BBB"), [...ownerOf]);
  const newFiles = fs.readdirSync(path.join(W, "history", "states")).map((f) => fs.readFileSync(path.join(W, "history", "states", f), "utf8"));
  rec("⭐⭐ …and carries its parent's core, not a new one", newFiles.every((t) => /add_core_of\s*=\s*(AAA|BBB)/.test(t)), newFiles.length);
  const graph = md.provinceNeighbourGraph({ ...ctx(W), model: md.buildMapModel(ctx(W)) });
  const connected = (ps) => { const set = new Set(ps.map(Number)), seen = new Set([+ps[0]]), q = [+ps[0]]; while (q.length) { const p = q.shift(); for (const n of (graph.get(p) || [])) if (set.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } } return seen.size === set.size; };
  rec("⭐⭐ every state's land is contiguous — the cut followed real borders", after.every((s) => connected(s.provinces)), after.filter((s) => !connected(s.provinces)).map((s) => [s.id, s.provinces]));
  rec("⭐⭐⭐ the rule is silent afterwards", rowsFor(W).length === 0);
  const again = md.fixStateIdFloor(ctx(W));
  rec("⭐⭐⭐ a second click adds nothing", again.added === 0, again);
  rec("⭐⭐ a state with no victory point is split into states with none — the floor invents no victory point", after.every((s) => !(s.victoryPoints || []).length),
    after.filter((s) => (s.victoryPoints || []).length).map((s) => [s.id, s.victoryPoints]));

  console.log("\n=== a state's victory point stays in it, and each new state gets one of its own ===");
  // ⛔ TEST 31's rehearsal: 13 of 59 capital states — ENG, USA, ITA, BRA and MEX among them — lost their only victory point
  // to this split, because the half the walk carved away held it. HOI4 then takes a capital state's FIRST province as its
  // capital, off the supply hub the rail was run to (#a-generated-capital-sits-on-its-rail). So each state here gets its
  // victory point on a province the same walk carved OUT of it in the world above — derived, so the walk is the one that
  // would take it.
  const carvedFrom = (id, own) => { const kept = new Set(after.find((s) => s.id === id).provinces.map(Number)); return own.find((p) => !kept.has(p)); };
  const VPS = [[1, [1, 2, 3, 4, 5, 6, 7, 8], "AAA", 8000], [2, [9, 10, 11, 12], "BBB", 4000], [3, [13, 14, 15, 16], "BBB", 4000]]
    .map(([id, provs, owner, mp]) => ({ id, provs, owner, mp, vp: carvedFrom(id, provs) }));
  rec("THE CONTROL: the walk above carved a province out of each of the three states", VPS.every((s) => s.vp > 0), VPS.map((s) => [s.id, s.vp]));
  const V = makeWorld([], VPS.map((s) => [s.id, s.provs, s.owner, s.mp]));
  for (const s of VPS) mk(V, `history/states/${s.id}-W.txt`, state(s.id, s.provs, s.owner, s.mp).replace("\t\tbuildings", `\t\tvictory_points = { ${s.vp} 20 }\n\t\tbuildings`));
  const vr = md.fixStateIdFloor(ctx(V));
  rec("the floor still adds the 5 missing states", vr.added === 5 && !(vr.errors || []).length && !vr.stoppedShort, vr);
  const va = statesOf(V);
  const vpOf = (s) => (s.victoryPoints || []).filter((v) => Number(v.value) > 0);
  rec("⭐⭐⭐ every state keeps the province its victory point is on", VPS.every((o) => va.find((s) => s.id === o.id).provinces.map(Number).includes(o.vp)
    && vpOf(va.find((s) => s.id === o.id)).some((v) => +v.province === o.vp && +v.value === 20)), va.filter((s) => s.id <= 3).map((s) => [s.id, s.provinces, s.victoryPoints]));
  const made = va.filter((s) => s.id > 3);
  rec("⭐⭐⭐ each new state has one victory point, on its own land, worth what the base game gives a state like it (3)",
    made.length === 5 && made.every((s) => vpOf(s).length === 1 && s.provinces.map(Number).includes(+vpOf(s)[0].province) && +vpOf(s)[0].value === 3),
    made.map((s) => [s.id, s.provinces, s.victoryPoints]));
  rec("⭐⭐ no state names a victory point on a province it does not hold", va.every((s) => vpOf(s).every((v) => s.provinces.map(Number).includes(+v.province))));
  rec("⭐⭐ …and a second click adds nothing", md.fixStateIdFloor(ctx(V)).added === 0);

  console.log("\n=== a state with a dockyard keeps its coast ===");
  // ⚓ Row 1 (9..16) is the coast. State 1 = {1,2,3,4,12} holds a DOCKYARD: the walk's first start (its far end, 12) would
  // take {12,4,3} and leave {1,2} — no sea — with the dockyard. The second Auto-fix click on TEST 27b removed exactly such
  // a dockyard: the floor had split its coast away after the dockyard check had already run.
  const DOCK = makeWorld([], [[1, [1, 2, 3, 4, 12], "AAA", 5000], [2, [5, 6, 7, 8], "AAA", 4000], [3, [9, 10, 11], "BBB", 3000], [4, [13, 14, 15, 16], "BBB", 4000]]);
  mk(DOCK, "history/states/1-W.txt", state(1, [1, 2, 3, 4, 12], "AAA", 5000).replace("buildings = { infrastructure = 2 }", "buildings = { infrastructure = 2 dockyard = 2 }"));
  const dr = md.fixStateIdFloor(ctx(DOCK));
  rec("THE CONTROL: the floor ran on the dockyard world", dr.added === 4 && !(dr.errors || []).length, dr);
  const dm = md.buildMapModel(ctx(DOCK));
  const dockState = dm.states.find((s) => +((s.buildings || {}).dockyard) > 0);
  const coastSet = md.landProvincesTouchingSea({ ...ctx(DOCK), model: dm });
  rec("⭐⭐⭐ the state that owns the dockyard still touches the sea after the split",
    !!dockState && (dockState.provinces || []).some((p) => coastSet.has(+p)), dockState && dockState.provinces);
  const again2 = md.fixNavalBuildingsWithoutCoast({ ...ctx(DOCK), dryRun: true });
  rec("⭐⭐⭐ …so the dockyard check finds nothing to remove — the click that follows writes nothing", !(again2.removed || again2.wouldRemove || (again2.targets || []).length), again2);

  console.log("\n=== the gate ===");
  const HOM = makeWorld(["common/national_focus", "common/decisions", "events"]);
  rec("⭐⭐⭐ a world that replaces all three base script folders (Hearts of Minecraft's shape) is left alone",
    rowsFor(HOM).length === 0 && md.fixStateIdFloor(ctx(HOM)).added === 0);
  const TWO = makeWorld(["common/national_focus", "common/decisions"]);
  rec("⭐⭐ …but replacing only two of them still leaves the base game's events naming states", rowsFor(TWO).length === 1);
  const OVERLAY = tmp("overlay");
  mk(OVERLAY, "descriptor.mod", 'name="an ordinary mod"\n');
  rec("⭐⭐ a mod that keeps the base game's states is told nothing — every id exists beneath it", rowsFor(OVERLAY).length === 0 && md.fixStateIdFloor(ctx(OVERLAY)).added === 0);
  // ⭐ ONLY WHAT THE LOADED SCRIPTS NAME: a base game whose scripts name nothing above the world leaves the world alone.
  const QUIET = tmp("quietgame");
  mk(QUIET, "map/provinces.bmp", BMP);
  mk(QUIET, "map/definition.csv", DEFINITION);
  for (let id = 1; id <= 8; id++) mk(QUIET, `history/states/${id}-S.txt`, state(id, [2 * id - 1, 2 * id], "AAA", 2000));
  mk(QUIET, "events/base.txt", "namespace = base\ncountry_event = {\n\tid = base.1\n\toption = { name = base.1.a 2 = { add_core_of = ROOT } }\n}\n");
  const QW = makeWorld();
  const qctx = { modRoot: QW, gameRoot: QUIET, dependencyRoots: [] };
  rec("⭐⭐⭐ a base game that names only states the world HAS is no reason to split anything",
    (md.validateMapModel(md.buildMapModel(qctx)) || []).every((p) => p.rule !== "state_ids_below_base") && md.fixStateIdFloor(qctx).added === 0);
  // ⛔ UNREACHABLE: a world with less land than the ceiling is told so and offered no button — splitting it would chop every
  // state to one province and still fall short.
  const SMALL = makeWorld([], [[1, [1, 2], "AAA", 2000], [2, [3], "AAA", 1000], [3, [4, 5], "BBB", 2000]]);
  mk(SMALL, "map/definition.csv", ["0;0;0;0;land;false;unknown;0"].concat(Array.from({ length: 64 }, (_, i) => {
    const p = i + 1, [r, g, b] = COL(p), land = p <= 5;
    return `${p};${r};${g};${b};${land ? "land" : "sea"};false;${land ? "plains" : "ocean"};${land ? 1 : 0}`;
  })).join("\n") + "\n");
  const sr = rowsFor(SMALL);
  rec("⭐⭐⭐ a world with 5 land provinces under a ceiling of 8 is told so, with no Auto-fix offered",
    sr.length === 1 && sr[0].autoFix === false && /5 land provinces/.test(sr[0].message), sr.map((p) => ({ autoFix: p.autoFix, m: p.message.slice(-260) })));
  const sf = md.fixStateIdFloor(ctx(SMALL));
  rec("⭐⭐⭐ …and the fixer does not chop it up", sf.added === 0 && sf.unreachable === true && statesOf(SMALL).length === 3, sf);
  const FULL = makeWorld([], Array.from({ length: 8 }, (_, i) => [i + 1, [2 * i + 1, 2 * i + 2], "AAA", 2000]));
  rec("⭐⭐⭐ THE BACK-OUT CONTROL: a world that already has every id gets nothing", rowsFor(FULL).length === 0 && md.fixStateIdFloor(ctx(FULL)).added === 0);

  console.log("\n=== Auto-fix all ===");
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const f = src.indexOf("fixes.stateIdFloor = fixStateIdFloor(");
  const d = src.indexOf("fixes.deadStateScopes = fixCountryHistoryStateScopes(");
  const s = src.indexOf("fixes.deadScriptStateRefs = fixScriptStateRefs(");
  rec("⭐⭐ autoFixMap runs it BEFORE the passes that neutralise references to missing states", f !== -1 && f < d && d < s, { f, d, s });
} finally {
  for (const t of tmps) { try { fs.rmSync(t, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
