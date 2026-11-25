// #a-dead-state-scope-runs-as-an-effect, the Auto-fix half — ONE CLICK MUST NOT END LEAVING A FATAL IT MADE.
//
// closeStateIdGaps slides the highest state id down into a gap. renumberStateId rewrites every reference it can
// — in the MOD. Its residual scan walks modRoot/common, modRoot/history and modRoot/events and nothing else, so
// a base-game country file that still names the old id is never even looked at: measured here, the gap-closer
// reports `residualFiles: []` while history/countries/BUL - Bulgaria.txt goes on running `4 = { … }` against a
// state the same click just renamed to 3. That is the fatal country_history_state_missing, created by the click
// that claimed to repair the map, and before this it was reported only on the NEXT validate.
//
// ⛔ AND THE POSITION IS THE POINT. fixCountryHistoryStateScopes first sat straight after fixForeignCapitals,
// "after the state fixers". It is not: closeStateIdGaps runs a SECOND time near the end of the click, whenever
// the final empty-state sweep deleted anything, and a renumber there strands a scope the earlier position had
// already walked past. It now runs after that last pass — the last point at which a state id can still change.
// "After X" is not "only after X."
//
// This drives the real autoFixMap end to end and asserts what the click LEAVES, not what any one fixer returns.
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require(path.join(__dirname, "map-data.js"));
const labels = require(path.join(__dirname, "public", "map-rule-labels.js"));

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 400))); fails.push(name); }
};
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, sz = rs * h, b = Buffer.alloc(54 + sz);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + sz, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28);
  b.writeUInt32LE(0, 30); b.writeUInt32LE(sz, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200], 4: [200, 200, 0] };
const provAtX = (x) => (x <= 1 ? 1 : x <= 3 ? 2 : x <= 5 ? 3 : 4);

// A base game of states 1..4 whose BUL file runs an effect on state 4 …
const GAME = fs.mkdtempSync(path.join(os.tmpdir(), "nova-b2click-game-"));
mk(path.join(GAME, "map", "provinces.bmp"), bmp24(8, 4, (x) => COL[provAtX(x)]));
mk(path.join(GAME, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0",
  "1;200;0;0;land;false;plains;1", "2;0;200;0;land;false;plains;1",
  "3;0;0;200;land;false;plains;1", "4;200;200;0;land;false;plains;1"].join("\n") + "\n");
for (const id of [1, 2, 3, 4]) {
  mk(path.join(GAME, "history", "states", `${id}-S${id}.txt`),
    `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`);
}
mk(path.join(GAME, "history", "countries", "BUL - Bulgaria.txt"), "capital = 1\n4 = { set_state_flag = F }\n");
mk(path.join(GAME, "common", "state_category", "00_state_categories.txt"),
  "state_categories = {\n\trural = { local_building_slots = 5 }\n}\n");

// … and a mod that replaces history/states with 1, 2 and 4: a GAP at 3, which the gap-closer shuts by sliding
// state 4 down into it — stranding the base game's `4 = { … }`.
const MOD = fs.mkdtempSync(path.join(os.tmpdir(), "nova-b2click-mod-"));
mk(path.join(MOD, "descriptor.mod"), 'name="B2 one click"\nreplace_path="history/states"\n');
for (const id of [1, 2, 4]) {
  mk(path.join(MOD, "history", "states", `${id}-S${id}.txt`),
    `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${id} }\n\thistory = { owner = AAA }\n}\n`);
}

const rulesNow = () => {
  md.clearMapLayerCache();
  const model = md.buildMapModel({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
  return (md.validateMapModel(model) || []).map((p) => p.rule);
};

console.log("=== a world with a state-id gap, under a base game that names the id the gap-closer will move ===");
const before = rulesNow();
rec("THE CONTROL: the gap is really there", before.includes("state_id_gap"), before);
rec("THE CONTROL: …and the country scope is NOT yet dead — state 4 still exists",
  !before.includes("country_history_state_missing"), before);

const r = md.autoFixMap({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
rec("the click ran", r && r.ok !== false, r && r.error);
const sg = (r.fixes || {}).stateGaps || {};
rec("⭐⭐ it renumbered, which is what strands the scope", (sg.renumbered || []).length === 1 && sg.renumbered[0].from === 4, sg);
rec("⭐⭐⭐ …and the gap-closer's own residual report says NOTHING about it — it walks the mod's folders only",
  (sg.residualFiles || []).length === 0, sg.residualFiles);

const ds = (r.fixes || {}).deadStateScopes || {};
rec("⭐⭐⭐ the click repaired the scope its own renumber stranded", ds.fixed === 1, ds);
rec("⭐⭐ …by making the base game's country file the mod's own, and saying so",
  (ds.materialised || []).includes("BUL - Bulgaria.txt"), ds);

const after = rulesNow();
rec("⭐⭐⭐ the click leaves no problem at all — not the gap, and not the fatal it would have made",
  after.length === 0, after);
rec("…and that fatal really is one", labels.isFatalRule("country_history_state_missing") === true);

const body = fs.readFileSync(path.join(MOD, "history", "countries", "BUL - Bulgaria.txt"), "utf8");
rec("⭐⭐ the modder can see what was done and undo it", /^#4 = \{ set_state_flag = F \}/m.test(body) && /# Nova: state 4 is not in this map/.test(body), body);
rec("⭐⭐ …and the rest of the file came through untouched", /^capital = 1$/m.test(body));

const r2 = md.autoFixMap({ modRoot: MOD, gameRoot: GAME, dependencyRoots: [] });
rec("⭐⭐⭐ a second click writes nothing", ((r2.fixes || {}).deadStateScopes || {}).fixed === 0 && rulesNow().length === 0,
  { second: (r2.fixes || {}).deadStateScopes, rules: rulesNow() });

for (const d of [GAME, MOD]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }

// ── THE POSITION, PROVED ──────────────────────────────────────────────────────────────────────────────
// The shape that reaches the LATE gap-close, which is the one the first placement walked past. A middle
// state that is EMPTY and is a country's CAPITAL: fixEmptyStates skips it ("capital state — give it a
// province or move the country's capital"), fixForeignCapitals then moves that capital onto land the
// country owns, the SECOND empty-state sweep deletes the now-ordinary empty state, and closeStateIdGaps
// runs AGAIN to close the hole it left — sliding the highest id down and stranding the base game's scope.
// Measured with the repair in its first position: deadStateScopes {fixed: 0} and the click ends on
// country_history_state_missing, a FATAL of the click's own making. In its place after that sweep: fixed 1,
// and the click ends clean.
console.log("\n=== the late pass: an EMPTY CAPITAL STATE in the middle, deleted only by the second sweep ===");
{
  const G2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-b2late-game-"));
  const at = (x) => (x <= 2 ? 1 : x <= 5 ? 3 : 4);
  const C2 = { 1: [200, 0, 0], 3: [0, 0, 200], 4: [200, 200, 0] };
  mk(path.join(G2, "map", "provinces.bmp"), bmp24(9, 4, (x) => C2[at(x)]));
  mk(path.join(G2, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0",
    "1;200;0;0;land;false;plains;1", "3;0;0;200;land;false;plains;1", "4;200;200;0;land;false;plains;1"].join("\n") + "\n");
  const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 100\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = { owner = AAA }\n}\n`;
  const SHAPE = [[1, [1]], [2, []], [3, [3]], [4, [4]]];        // state 2: empty, and AAA's capital
  for (const [id, p] of SHAPE) mk(path.join(G2, "history", "states", `${id}-S${id}.txt`), st(id, p));
  mk(path.join(G2, "history", "countries", "AAA - Aaa.txt"), "capital = 2\n");
  mk(path.join(G2, "history", "countries", "BUL - Bulgaria.txt"), "capital = 1\n4 = { set_state_flag = F }\n");
  mk(path.join(G2, "common", "state_category", "00_state_categories.txt"), "state_categories = {\n\trural = { local_building_slots = 5 }\n}\n");
  const M2 = fs.mkdtempSync(path.join(os.tmpdir(), "nova-b2late-mod-"));
  mk(path.join(M2, "descriptor.mod"), 'name="B2 late"\nreplace_path="history/states"\n');
  for (const [id, p] of SHAPE) mk(path.join(M2, "history", "states", `${id}-S${id}.txt`), st(id, p));

  const rules2 = () => {
    md.clearMapLayerCache();
    return (md.validateMapModel(md.buildMapModel({ modRoot: M2, gameRoot: G2, dependencyRoots: [] })) || []).map((p) => p.rule);
  };
  rec("THE CONTROL: it starts as an empty capital state, and the scope is NOT yet dead",
    rules2().includes("empty_capital_state") && !rules2().includes("country_history_state_missing"), rules2());
  const rr = md.autoFixMap({ modRoot: M2, gameRoot: G2, dependencyRoots: [] });
  const es = (rr.fixes || {}).emptyStates || {}, cp = (rr.fixes || {}).capitals || {}, g2 = (rr.fixes || {}).stateGaps || {};
  rec("⭐⭐ the capital moved and the empty state went with the SECOND sweep",
    (cp.details || []).some((d) => d.from === 2) && (es.deleted || []).includes(2), { capitals: cp, emptyStates: es });
  rec("⭐⭐⭐ …and that late sweep re-closed the gap, sliding the highest id down — the renumber the first placement missed",
    (g2.renumbered || []).some((x) => x.from === 4 && x.to === 2), g2);
  rec("⭐⭐⭐ the repair still caught it, because it runs after that pass",
    ((rr.fixes || {}).deadStateScopes || {}).fixed === 1, (rr.fixes || {}).deadStateScopes);
  rec("⭐⭐⭐ so the click ends clean, with no fatal of its own making", rules2().length === 0, rules2());
  for (const d of [G2, M2]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_) {} }
}

console.log(`\n=== one click repairs the country scope its own renumber stranded: ${pass + fails.length} checks, ${fails.length} failed ===`);
if (fails.length) { for (const f of fails) console.log("   FAILED: " + f); process.exit(1); }
assert.ok(pass > 0);
