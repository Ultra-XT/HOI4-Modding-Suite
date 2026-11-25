// ⛔ #a-province-two-states-list — A PROVINCE TWO STATES LIST HOLDS THE BUILDING ROWS OF THE STATE THAT GETS IT, AND OF NO OTHER.
//
// A state's own map/buildings.txt rows used to go into its home province alone. Spread over its provinces
// (#a-states-buildings-are-spread-not-piled), the air base is SENT to the nearest other province — and where a second state's
// history file lists that province too, and the model gives it to that state (provinceToState, the map the placement pass
// re-homes rows by), every row the slot writer put there was handed to the other state one pass later. Measured on the fixture
// below, slot pass then placement pass, four rounds: the state was still without an air base after every round, and the file
// grew 63 → 71 → 76 → 81 rows, the other state collecting an air_base row a round. The real Auto-fix click settles the double
// claim before it places anything; the slot writer's other callers — giveMovedStatesTheirSites, fixStandardSlotsOverWater,
// createState — do not.
//
// generateSupplyNetwork already leaves such a province out of a state's own land (`p2s[p] === s.id`). ensureBuildingSlotsForState
// now names the state it is placing for, and stateBuildingAnchor leaves out a province the model has in that state's list and
// gives to another. A province the model does not have in its list — the caller is ahead of the disk — is placed in as before.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-two-states-list-"));
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

// ── the fixture: rectangles [x0, y0, x1, y1) on a 96 x 64 sea (province 1), rows top-down ──────────────────────────────────
//        x: 8        28        52       70      90
//   y 8   [  2     ][   3     ]  sea   [  6    ]        3 is the province both states list
//    28   [  4     ][---------]        [-------]        7 is land in no state at all
//    32   [        ][   5     ]   [ 7 ]
const W = 96, H = 64, SEA = 1, SHARED = 3, LOOSE = 7;
const RECT = { 2: [8, 8, 28, 28], 3: [28, 8, 52, 32], 4: [8, 28, 28, 56], 5: [28, 32, 60, 62], 6: [70, 8, 90, 30], 7: [64, 40, 76, 52] };
const provAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const PER_STATE = md.STATE_BUILDING_SLOTS.map(([t]) => t), PER_PROVINCE = md.PER_LAND_PROVINCE_BUILDING_SLOTS;
const OTHER_ROW = "99;radar_station;1.00;9.50;1.00;0.00;0";                      // a file to append to, and a row that is nobody's here

/** One mod: `states` { id: [provinces] }, both listing `shared`. Which of the two the model gives it to is read off the model. */
function world(tag, states, shared = SHARED) {
  const mod = path.join(ROOT, tag), roots = { modRoot: mod, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
  write(mod, "descriptor.mod", `name="${tag}"\nreplace_path="history/states"\nreplace_path="map"\n`);
  write(mod, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(provAt(x, y))));
  write(mod, "map/heightmap.bmp", bmp8(W, H, (x, y) => (provAt(x, y) === SEA ? 80 : 120)));
  write(mod, "map/definition.csv", ["0;0;0;0;land;false;unknown;0", `1;${colour(1).join(";")};sea;false;ocean;0`]
    .concat(Object.keys(RECT).map((id) => `${id};${colour(+id).join(";")};land;false;plains;1`)).join("\n") + "\n");
  for (const [s, provs] of Object.entries(states)) {
    write(mod, `history/states/${s}-S.txt`, `state = {\n\tid = ${s}\n\tname = "STATE_${s}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  }
  const file = write(mod, "map/buildings.txt", OTHER_ROW + "\n");
  const rows = () => fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean).map((l) => l.split(";")).filter((c) => c.length >= 7)
    .map((c) => ({ sid: +c[0], type: c[1], province: provAt(Math.floor(+c[2]), H - 1 - Math.floor(+c[4])) }));
  const ids = Object.keys(states).map(Number), winner = (md.buildMapModel(roots).provinceToState || {})[shared], loser = ids.find((s) => s !== winner);
  return { roots, file, rows, states, ids, winner, loser, shared, own: states[loser].filter((p) => p !== shared) };
}
const inShared = (w, sid) => w.rows().filter((r) => r.sid === sid && r.province === w.shared);

// ── 1. the state that lists four provinces loses the shared one ────────────────────────────────────────────────────────
console.log("\n-- ⭐ 1. Auto-fix's slot pass: the state that does not get the province places nothing in it --");
{
  const w = world("four-loses", { 1: [2, SHARED, 4, 5], 9: [6, SHARED] });
  ok(w.ids.includes(w.winner) && w.loser === 1 && w.own.length === 3, `(the fixture: both states list province ${SHARED}; the model gives it to state ${w.winner}, so state ${w.loser} is left with three provinces of its own)`, { winner: w.winner, loser: w.loser });
  const near = md.stateBuildingAnchor({ ...w.roots, provinces: w.states[w.loser], positions: true });
  ok(!!near && near.positions.find((p) => p.province !== near.home).province === SHARED, `(…and province ${SHARED} is the nearest other province to its town province: asked without the state's id, its first position outside the town province is there)`);
  const fixed = md.fixStatesWithoutBuildingSlots(w.roots);
  ok(fixed && fixed.fixed === 2 && !(fixed.failed || []).length, "the slot pass furnishes both states", fixed);
  ok(inShared(w, w.loser).length === 0, `⭐⭐⭐ not one row keyed to state ${w.loser} stands in the province state ${w.winner} gets`, inShared(w, w.loser).map((r) => r.type));
  ok(inShared(w, w.winner).length > PER_PROVINCE.length && PER_PROVINCE.every((t) => inShared(w, w.winner).filter((r) => r.type === t).length === 1),
    `…CONTROL: state ${w.winner}'s rows do stand there, its per-province rows among them`, inShared(w, w.winner).length);
  const mine = w.rows().filter((r) => r.sid === w.loser), air = mine.filter((r) => r.type === "air_base");
  ok(air.length === 1 && w.own.includes(air[0].province), `⭐⭐ state ${w.loser}'s air base stands in a province that is its own`, air.map((r) => r.province));
  ok(mine.every((r) => w.own.includes(r.province)) && mine.filter((r) => PER_STATE.includes(r.type)).length === md.STATE_BUILDING_SLOTS.reduce((a, [, n]) => a + n, 0),
    "⭐⭐ …and so does every other row of its own, all of them written", mine.filter((r) => !w.own.includes(r.province)).map((r) => [r.type, r.province]));
  ok(PER_PROVINCE.every((t) => mine.filter((r) => r.type === t).length === w.own.length), `⭐ its per-province rows: one of each for each of its ${w.own.length} provinces, none for the one it does not get`, PER_PROVINCE.map((t) => mine.filter((r) => r.type === t).length));
  // the pass that follows in the same click hands a row to whichever state holds the land under it
  const rehome = md.fixBuildingsTxtPlacement({ ...w.roots, dryRun: true });
  ok(rehome && rehome.rehomed === 0, "⭐⭐⭐ the placement pass has no row to hand from one state to the other", rehome && { rehomed: rehome.rehomed, details: rehome.details });
  const without = md.findStatesWithoutSites(w.roots).map((f) => [f.stateId, f.missing]);
  ok(without.length === 0, "⭐⭐ no state is reported without an air base or a rocket site", without);
  const before = w.rows().length, again = md.fixStatesWithoutBuildingSlots(w.roots);
  ok(again && again.fixed === 0 && w.rows().length === before, "⭐⭐ …and a second pass writes nothing: it has converged", { fixed: again && again.fixed, rows: [before, w.rows().length] });
}

// ── 2. the other way round, and the writer called directly ─────────────────────────────────────────────────────────────
console.log("\n-- ⭐ 2. the same with the two-province state the one that loses, through the slot writer itself --");
{
  const w = world("two-loses", { 9: [2, SHARED, 4, 5], 1: [6, SHARED] });
  ok(w.winner === 9 && w.loser === 1 && w.own.length === 1, `(the fixture: the model gives province ${SHARED} to state ${w.winner} again — now the state with four provinces — and state ${w.loser} keeps one)`, { winner: w.winner, loser: w.loser });
  for (const sid of w.ids) {
    const r = md.ensureBuildingSlotsForState({ ...w.roots, stateId: sid, provinces: w.states[sid] });
    ok(r && r.changed === true, `ensureBuildingSlotsForState writes state ${sid}'s rows — asked, as its callers ask, with every province the state lists`, r);
  }
  ok(inShared(w, w.loser).length === 0 && w.rows().filter((r) => r.sid === w.loser).every((r) => w.own.includes(r.province)), `⭐⭐⭐ state ${w.loser}'s rows all stand in its own province, none in the one state ${w.winner} gets`, inShared(w, w.loser).map((r) => r.type));
  ok(inShared(w, w.winner).length > 0, `…CONTROL: state ${w.winner}'s do stand there`, inShared(w, w.winner).length);
  const rehome = md.fixBuildingsTxtPlacement({ ...w.roots, dryRun: true });
  ok(rehome && rehome.rehomed === 0 && md.findStatesWithoutSites(w.roots).length === 0, "⭐⭐ nothing to hand over, and no state without a site", rehome && rehome.rehomed);

  // ── 3. stateBuildingAnchor's own answer ──
  console.log("\n-- ⭐ 3. stateBuildingAnchor: asked for a state by id, it leaves out a province the model gives another --");
  const each = (sid, provinces) => [...md.stateBuildingAnchor({ ...w.roots, provinces, each: true, ...(sid == null ? {} : { stateId: sid }) }).keys()].sort((a, b) => a - b);
  ok(each(w.loser, w.states[w.loser]).join() === w.own.join(), `⭐⭐ state ${w.loser}: only the province it gets`, each(w.loser, w.states[w.loser]));
  ok(each(w.winner, w.states[w.winner]).join() === w.states[w.winner].slice().sort((a, b) => a - b).join(), `⭐ state ${w.winner}: all four, the shared one among them`, each(w.winner, w.states[w.winner]));
  ok(each(null, w.states[w.loser]).join() === w.states[w.loser].slice().sort((a, b) => a - b).join(),
    "⭐ asked with no state id — Generate land asks before the state's file is written — it answers for every province it is handed, as before", each(null, w.states[w.loser]));
  ok((md.buildMapModel(w.roots).provinceToState || {})[LOOSE] == null && each(w.loser, w.own.concat(LOOSE)).join() === w.own.concat(LOOSE).sort((a, b) => a - b).join(),
    `⭐⭐ …and a province the model gives NO state (${LOOSE}) stays: only another state's claim takes a province away`, each(w.loser, w.own.concat(LOOSE)));
  // …and only a claim on a province the model has in BOTH lists. createState's tests, and any caller ahead of the disk, ask for a
  // state the model does not have yet, or for a province its file does not list yet: that caller is believed, as it always was.
  const NEW = 20, taken = [4, 5];
  ok(!w.ids.includes(NEW) && taken.every((p) => w.states[w.winner].includes(p)) && each(NEW, taken).join() === taken.join(),
    `⭐⭐ a state the model does not have yet (${NEW}), asked for provinces state ${w.winner} lists: it is answered for both`, each(NEW, taken));
  ok(!w.states[w.loser].includes(4) && each(w.loser, w.own.concat(4)).join() === w.own.concat(4).sort((a, b) => a - b).join(),
    `⭐⭐ …and state ${w.loser}, asked for a province its own file does not list (4): it is answered for that one too`, each(w.loser, w.own.concat(4)));
  const v = world("ahead-of-the-disk", { 9: [2, SHARED, 4, 5], 1: [6, SHARED] });
  const r = md.ensureBuildingSlotsForState({ ...v.roots, stateId: NEW, provinces: taken });
  const mine = v.rows().filter((x) => x.sid === NEW);
  ok(r && r.changed === true && mine.filter((x) => PER_STATE.includes(x.type)).length === md.STATE_BUILDING_SLOTS.reduce((a, [, n]) => a + n, 0) && mine.every((x) => taken.includes(x.province)),
    `⭐⭐⭐ …and the slot writer furnishes state ${NEW} in them, every row of its own written`, { r: r && (r.reason || r.added), provinces: [...new Set(mine.map((x) => x.province))] });
}

// ── 4. the state's OWN rows, where the per-province rows' answer does not already keep them out ─────────────────────────
// The slot writer asks twice: for each province's town point (the per-province rows), then for the state's positions (its own
// rows), handing the second the first one's answer. That answer alone keeps the own rows out of the shared province — unless
// the shared province would have been the town province, or the per-province rows are not being written at all.
console.log("\n-- ⭐ 4. …and its own rows: where the shared province is the smaller of its two, and where one site is all that is asked for --");
{
  const area = (p) => (RECT[p][2] - RECT[p][0]) * (RECT[p][3] - RECT[p][1]);
  const w = world("town-lost", { 1: [4, 2], 9: [6, 2] }, 2);
  const asked = md.stateBuildingAnchor({ ...w.roots, provinces: w.states[w.loser], positions: true });
  ok(w.loser === 1 && w.shared === 2 && area(2) < area(4) && !!asked && asked.home === 2,
    "(the fixture: the shared province is the smaller of state 1's two — asked without the state's id, it is the state's town province)", { loser: w.loser, home: asked && asked.home });
  const r = md.ensureBuildingSlotsForState({ ...w.roots, stateId: w.loser, provinces: w.states[w.loser] });
  const mine = w.rows().filter((x) => x.sid === w.loser);
  ok(r && r.changed === true && mine.length > 0 && mine.every((x) => w.own.includes(x.province)), `⭐⭐⭐ state ${w.loser}'s rows stand in the province it keeps, not piled in the one it would have called its town`, [...new Set(mine.map((x) => x.province))]);

  // giveMovedStatesTheirSites gives a state back one site type (onlyTypes): no per-province row is written, so no answer is handed on
  const v = world("one-site", { 1: [2, SHARED, 4, 5], 9: [6, SHARED] });
  const one = md.ensureBuildingSlotsForState({ ...v.roots, stateId: v.loser, provinces: v.states[v.loser], onlyTypes: ["air_base"] });
  const air = v.rows().filter((x) => x.sid === v.loser);
  ok(one && one.changed === true && one.added === 1 && air.length === 1 && air[0].type === "air_base" && v.own.includes(air[0].province),
    `⭐⭐⭐ asked for an air base alone, state ${v.loser} is given one in a province that is its own`, air.map((x) => [x.type, x.province]));
}

try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* scratch only */ }
console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
