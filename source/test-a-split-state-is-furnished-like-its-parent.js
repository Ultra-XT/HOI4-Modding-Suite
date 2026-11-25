// ⛔ #a-split-state-is-furnished-like-its-parent — A STATE THE STATE-ID FLOOR SPLITS OFF GETS THE AIR BASE ITS PARENT HAS.
//
// Auto-fix's fixStateIdFloor splits a rebuilt world's largest states until every id the loaded scripts name exists
// (#a-world-keeps-the-base-games-state-ids). The base game's orders of battle fly air wings into a state BY ID, which is why
// Generate land writes an air base into every state they name (#an-air-wing-needs-somewhere-to-land) — and a state the floor
// makes is exactly one of the ids those scripts name. It was written with no buildings at all: TEST 31 (played 09-30) had 249
// such states and not one air base between them, and the owner's error.log says "State 849 has no air base" and "State 1036
// has no air base".
//
// A fresh world no longer reaches the floor (Generate land makes every id itself — test-a-generated-world-has-every-state-id-
// the-scripts-name.js), so this is for the worlds that still do: one built before that, one whose land could not reach the
// ceiling when it was generated. There, a new state is furnished like the state it came from:
//   · the parent's UNDATED history has an air base → the new state gets `air_base = 1` and the parent's infrastructure, in the
//     buildings block the ports its provinces carried are in
//   · the parent has none — a state a modder built without one — → the new state gets none
//   · …unless its OWN id asks for one: an air_wings block keys it → at least 1, and room for the planes a started order of battle
//     bases there (#an-air-base-holds-the-planes-it-starts-with — Generate land's rule, generatedAirBaseLevels); counted apart
//     (airBasesAsked) and said apart on the page, which said every new air base came "as the state they came from has"
//   · no city: a core is painted by Generate land inside the height raise, and nowhere else
//
// Pinned on the floor's own fixture shape: a base game of eight states whose event names state 8, under a world of three.
"use strict";
const fs = require("fs"), os = require("os"), path = require("path"), crypto = require("crypto");

const APPDATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nova-split-furnished-appdata-"));
process.env.NOVA_APP_DATA_DIR = APPDATA_DIR;
process.env.APPDATA = APPDATA_DIR;
process.env.XDG_CONFIG_HOME = APPDATA_DIR;
process.env.NOVA_HOME_DIR = path.join(APPDATA_DIR, "home");
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};
const tmps = [APPDATA_DIR];
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "nova-split-furnished-" + t + "-")); tmps.push(d); return d; };
const mk = (root, rel, body) => { const p = path.join(root, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); };

// ── the fixture map: 8x8 provinces of 32px, ids 1..64 by row; rows 0–1 (1..16) are land, and row 1 (9..16) is the coast ──
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
/** history: the lines of the state's history after its owner, each already indented */
const state = (id, provs, owner, manpower, history) =>
  `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = ${manpower}\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n`
  + `\thistory = {\n\t\towner = ${owner}\n\t\tadd_core_of = ${owner}\n${history}\t}\n}\n`;

// the base game: 8 states of two provinces each, and an event that names state 8 — so its scripts reach its highest id.
// ⛔ #an-id-the-scripts-name-goes-back-to-its-country — the floor cuts each id from the country that held it below, and the
// largest state only when the world has no splittable state of that country. These were ZZZ's, a country this world does not
// have, so the floor walks the largest states and splits all three, which every check below needs; which country's land an id
// goes to is pinned in test-an-id-the-scripts-name-goes-back-to-its-country.js.
const GAME = tmp("game");
mk(GAME, "map/provinces.bmp", BMP);
mk(GAME, "map/definition.csv", DEFINITION);
for (let id = 1; id <= 8; id++) mk(GAME, `history/states/${id}-S.txt`, state(id, [2 * id - 1, 2 * id], "ZZZ", 2000, `\t\tvictory_points = { ${2 * id} 3 }\n\t\tbuildings = { infrastructure = 2 }\n`));
mk(GAME, "events/base.txt", "namespace = base\ncountry_event = {\n\tid = base.1\n\toption = {\n\t\tname = base.1.a\n\t\t8 = { add_core_of = ROOT }\n\t}\n}\n");
// …and one building position, in the middle of province 1 (with no map/buildings.txt anywhere a new state is given no
// positions at all, and the air base this file is about would have no ground to stand on)
mk(GAME, "map/buildings.txt", `1;air_base;16.00;10.40;${(255 - 16).toFixed(2)};0.00;0\n`);
const CEILING = 8;

function makeWorld(states) {
  const m = tmp("mod");
  mk(m, "descriptor.mod", 'name="split fixture"\nreplace_path="history/states"\n');
  for (const s of states) mk(m, `history/states/${s.id}-W.txt`, state(s.id, s.provinces, s.owner, s.manpower, s.history));
  return m;
}
const ctx = (m) => ({ modRoot: m, gameRoot: GAME, dependencyRoots: [] });
const fileOf = (m, id) => { const dir = path.join(m, "history", "states"); for (const f of fs.readdirSync(dir)) { const t = fs.readFileSync(path.join(dir, f), "utf8"); if (new RegExp("\\bid\\s*=\\s*" + id + "\\b").test(t)) return t.replace(/\r\n/g, "\n"); } return ""; };
const historyOf = (t) => { const at = t.indexOf("history"), open = t.indexOf("{", at); let d = 0; for (let i = open; i < t.length; i++) { if (t[i] === "{") d++; else if (t[i] === "}" && --d === 0) return t.slice(open + 1, i); } return ""; };
/** The depth-0 statements of a script body, comments already stripped: [{ key, value }] for `key = value`, [{ key, body }] for `key = { … }`. */
const entries = (body) => {
  const out = [], re = /([A-Za-z0-9_.]+)\s*=\s*(\{|[^\s{}]+)/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[2] !== "{") { out.push({ key: m[1], value: m[2] }); continue; }
    let d = 0, i = re.lastIndex - 1;
    for (; i < body.length; i++) { if (body[i] === "{") d++; else if (body[i] === "}" && --d === 0) break; }
    out.push({ key: m[1], body: body.slice(re.lastIndex, i) });
    re.lastIndex = i + 1;
  }
  return out;
};
/** What a state's text builds at STATE level — { undated: { key: level }, dated: [{ date, key, level }] } — read by this file's
 *  own walk, not by the code under test: history's own `buildings = { }`, and each `<date> = { buildings = { } }`. A province's
 *  `<id> = { … }` block is not a state level. */
const levels = (text) => {
  const out = { undated: {}, dated: [] };
  const read = (ctx, date) => {
    for (const e of entries(ctx)) if (e.key === "buildings" && e.body != null)
      for (const q of entries(e.body)) if (q.value != null && /^[a-z_]+$/.test(q.key) && /^\d+$/.test(q.value)) { if (date) out.dated.push({ date, key: q.key, level: +q.value }); else out.undated[q.key] = +q.value; }
  };
  const h = historyOf(text.replace(/#[^\n]*/g, ""));
  read(h, null);
  for (const e of entries(h)) if (/^\d+\.\d+\.\d+$/.test(e.key) && e.body != null) read(e.body, e.key);
  return out;
};
const levelsOf = (m, id) => levels(fileOf(m, id));
const level = (m, id, key) => levelsOf(m, id).undated[key] || 0;
const treeHash = (root) => {
  const h = crypto.createHash("sha1");
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { h.update(path.relative(root, p)); h.update(fs.readFileSync(p)); } } };
  walk(root);
  return h.digest("hex");
};

// ── the world: three states over the sixteen land provinces ────────────────────────────────────────────────────────────
//   1  row 0, eight provinces — an air base and a victory point, infrastructure 3
//   2  half of row 1 — NO air base (the control: a state a modder built without one), infrastructure 2
//   3  the other half — an air base of FOUR, infrastructure 4, and a port at each end
const WORLD = [
  { id: 1, provinces: [1, 2, 3, 4, 5, 6, 7, 8], owner: "AAA", manpower: 8000, airBase: 1, infrastructure: 3,
    history: "\t\tvictory_points = { 1 20 }\n\t\tbuildings = {\n\t\t\tinfrastructure = 3\n\t\t\tair_base = 1\n\t\t}\n" },
  { id: 2, provinces: [9, 10, 11, 12], owner: "BBB", manpower: 4000, airBase: 0, infrastructure: 2,
    history: "\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t}\n" },
  { id: 3, provinces: [13, 14, 15, 16], owner: "BBB", manpower: 4000, airBase: 4, infrastructure: 4, ports: { 13: 2, 16: 3 },
    history: "\t\tbuildings = {\n\t\t\tinfrastructure = 4\n\t\t\tair_base = 4\n\t\t\t13 = {\n\t\t\t\tnaval_base = 2\n\t\t\t}\n\t\t\t16 = {\n\t\t\t\tnaval_base = 3\n\t\t\t}\n\t\t}\n" },
];
const byId = new Map(WORLD.map((s) => [s.id, s]));

try {
  const W = makeWorld(WORLD);
  console.log("=== the floor splits the world's three states into eight ===");
  const before = WORLD.map((s) => ({ id: s.id, airBase: level(W, s.id, "air_base"), infrastructure: level(W, s.id, "infrastructure") }));
  rec("(the fixture: states 1 and 3 have an undated air base, state 2 has none)", before.map((s) => s.airBase).join() === WORLD.map((s) => s.airBase).join(), before);
  const r = md.fixStateIdFloor(ctx(W));
  const made = r.statesMade || [];
  rec("THE CONTROL: the floor adds the five missing states, with no errors", r.added === CEILING - WORLD.length && made.length === r.added && !(r.errors || []).length && !r.stoppedShort && !r.vpErrors, r);
  // the state each new one goes back to: its parent, or its parent's parent when the floor split a state it had just made
  const parentOf = new Map(made.map((s) => [s.id, s.from]));
  const rootOf = (id) => { let p = id; while (parentOf.has(p)) p = parentOf.get(p); return p; };
  const from = (root) => made.filter((s) => rootOf(s.id) === root).map((s) => s.id);
  rec("(the fixture: every one of the three states was split, and one new state came out of a state the floor had made)",
    WORLD.every((s) => from(s.id).length >= 1) && made.some((s) => parentOf.has(s.from)), made.map((s) => [s.from, s.id]));

  console.log("\n=== a new state has the air base its parent has ===");
  const withBase = WORLD.filter((s) => s.airBase >= 1).flatMap((s) => from(s.id)), without = WORLD.filter((s) => !s.airBase).flatMap((s) => from(s.id));
  rec("⭐⭐⭐ every state split from one with an air base has `air_base = 1` in its undated history", withBase.length >= 2 && withBase.every((id) => level(W, id, "air_base") === 1), withBase.map((id) => [id, levelsOf(W, id).undated]));
  rec("⭐⭐ …level 1, whatever the parent's: state 3's is 4, and it is somewhere to land that is given, not an airfield copied", from(3).every((id) => level(W, id, "air_base") === 1) && byId.get(3).airBase === 4, from(3).map((id) => [id, level(W, id, "air_base")]));
  rec("⭐⭐ …and its parent's infrastructure: 3 out of state 1, 4 out of state 3", withBase.every((id) => level(W, id, "infrastructure") === byId.get(rootOf(id)).infrastructure), withBase.map((id) => [id, rootOf(id), level(W, id, "infrastructure")]));
  rec("⭐⭐⭐ THE CONTROL: a state split from one WITHOUT an air base has none — and no buildings written for it at all", without.length >= 1 && without.every((id) => level(W, id, "air_base") === 0 && !/buildings/.test(fileOf(W, id))), without.map((id) => fileOf(W, id)));
  const grand = made.filter((s) => parentOf.has(s.from));
  rec("⭐⭐ a state split from one the floor had just made is furnished as that one was", grand.length >= 1 && grand.every((s) => level(W, s.id, "air_base") === (byId.get(rootOf(s.id)).airBase ? 1 : 0)), grand.map((s) => [s.from, s.id, level(W, s.id, "air_base")]));
  rec("the parents keep what they had: the air base is given, not moved", WORLD.every((s) => level(W, s.id, "air_base") === s.airBase && level(W, s.id, "infrastructure") === s.infrastructure), WORLD.map((s) => [s.id, levelsOf(W, s.id).undated]));
  rec("⭐ the floor says how many it gave (airBases), every one of them as its parent has (airBasesAsked 0)", r.airBases === withBase.length && r.airBasesAsked === 0, { airBases: r.airBases, airBasesAsked: r.airBasesAsked, withBase });

  console.log("\n=== in the one buildings block, with the ports its land carried and the victory point it was given ===");
  const model = md.buildMapModel(ctx(W));
  const holder = (p) => model.states.find((s) => (s.provinces || []).map(Number).includes(p));
  const ports = byId.get(3).ports;
  const carried = Object.keys(ports).map(Number).filter((p) => holder(p).id !== 3);
  rec("(the fixture: a port of state 3's went to a new state with its province)", carried.length >= 1, Object.keys(ports).map((p) => [p, holder(+p).id]));
  rec("⭐⭐ the port is in the new state's history at its own level, beside the air base: ONE undated buildings block",
    carried.every((p) => { const t = fileOf(W, holder(p).id), h = historyOf(t); return (h.match(/buildings\s*=\s*\{/g) || []).length === 1 && new RegExp(p + "\\s*=\\s*\\{\\s*naval_base\\s*=\\s*" + ports[p] + "\\s*\\}").test(h) && level(W, holder(p).id, "air_base") === 1; }),
    carried.map((p) => fileOf(W, holder(p).id)));
  rec("…and the model reads both: the air base at state level, the port under its province", carried.every((p) => +((holder(p).buildings || {}).air_base) === 1 && +(((holder(p).provinceBuildings || {})[p] || {}).naval_base) === ports[p]), carried.map((p) => [holder(p).buildings, holder(p).provinceBuildings]));
  const vpChildren = from(1);
  rec("⭐⭐ a state split from one with a victory point has its own AND the air base — the one write gave both",
    vpChildren.length >= 1 && vpChildren.every((id) => { const s = model.states.find((x) => x.id === id); return (s.victoryPoints || []).length === 1 && s.provinces.map(Number).includes(+s.victoryPoints[0].province) && level(W, id, "air_base") === 1; }) && r.victoryPoints === vpChildren.length,
    vpChildren.map((id) => fileOf(W, id)));
  const rows = fs.readFileSync(path.join(W, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.split(";")).filter((c) => c.length >= 7);
  rec("every new state has its one air_base position in map/buildings.txt — the ground its air base stands on", made.every((s) => rows.filter((c) => +c[0] === s.id && c[1] === "air_base").length === 1), made.map((s) => rows.filter((c) => +c[0] === s.id && c[1] === "air_base").length));

  console.log("\n=== a second click writes nothing ===");
  const h1 = treeHash(W);
  const again = md.fixStateIdFloor(ctx(W));
  rec("⭐⭐⭐ the floor adds nothing and the mod is byte-identical", again.added === 0 && !again.airBases && treeHash(W) === h1, again);
  // …and through the button: the same world, split by "Auto-fix all" with every other pass of the click running after it
  const A = makeWorld(WORLD);
  const click1 = md.autoFixMap(ctx(A)), floor1 = (click1.fixes || {}).stateIdFloor || {}, h2 = treeHash(A);
  const given = (floor1.statesMade || []).filter((s) => level(A, s.id, "air_base") === 1).length;
  rec("THE CONTROL: the click's own floor pass split the world and gave the same air bases", floor1.added === r.added && floor1.airBases === r.airBases && given === r.airBases, { added: floor1.added, airBases: floor1.airBases, given });
  const click2 = md.autoFixMap(ctx(A)), floor2 = (click2.fixes || {}).stateIdFloor || {};
  rec("⭐⭐⭐ a second Auto-fix click writes nothing: no pass of the click takes an air base back out, or finds more to do", !floor2.added && treeHash(A) === h2,
    { same: treeHash(A) === h2, nothingToFix: click2.nothingToFix, fixes: Object.entries(click2.fixes || {}).filter(([, v]) => v && (v.changed || v.fixed || v.added || v.removed || v.moved)).map(([k]) => k) });

  // …and the page says what the click gave — the line its own summary code builds from this answer — and a state it could not write
  // to by name (the floor files that under vpErrors, which the page prints as "new state N was made, but …")
  const P = require("./testlib-map-page.js");
  const line = P.autoFixSummary({ ok: true, fixes: { stateIdFloor: r } });
  rec("the Auto-fix report on the page names the air bases the split gave, as their parents have", line.includes(`${r.airBases} new state(s) got an air base, as the state they came from has`) && !/has none/.test(line), line.slice(0, 400));
  const page = require("./testlib-strip-comments.js").stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
  const at = page.indexOf("fr.fixes.stateIdFloor"), said = at === -1 ? "" : page.slice(at, page.indexOf("sifNames", at));
  rec("…and the states it could not give one", /sif\.vpErrors/.test(said), said.slice(0, 200));

  console.log("\n=== a write that fails is said by name, and no air base is counted for it ===");
  // The new state's victory point and its air base go in through ONE write. Fail that write for one state — the disk fills at
  // the moment its file is written with `air_base` in it (safeModWrite writes the text to a temp file first; that is the call
  // failed here) — and the floor must name the state rather than count an air base no wing can land on.
  const F = makeWorld(WORLD);
  const victim = made.length ? made[made.length - 1].id : 0;   // the last state the floor makes: nothing is split from it afterwards
  const victimHadVp = ((model.states.find((s) => s.id === victim) || {}).victoryPoints || []).length;
  rec("(the fixture: the last state the floor makes comes from one with an air base)", withBase.includes(victim), { victim, withBase });
  const realWrite = fs.writeFileSync;
  let refusedWrites = 0;
  fs.writeFileSync = function (target, data, ...rest) {
    if (typeof target === "number" && typeof data === "string" && new RegExp("\\bid = " + victim + "\\b").test(data) && /\bair_base = 1\b/.test(data)) {
      refusedWrites++;
      const e = new Error("ENOSPC: no space left on device, write"); e.code = "ENOSPC"; throw e;
    }
    return realWrite.call(fs, target, data, ...rest);
  };
  let fr;
  try { fr = md.fixStateIdFloor(ctx(F)); } finally { fs.writeFileSync = realWrite; }
  const named = (fr.vpErrors || []).filter((e) => e.state === victim);
  rec("THE CONTROL: exactly one write was refused, and the floor still made all five states", refusedWrites === 1 && fr.added === r.added && !(fr.errors || []).length, { refusedWrites, added: fr.added, errors: fr.errors });
  rec("⭐⭐⭐ the state whose write failed has no air base, and the floor does not count one for it", level(F, victim, "air_base") === 0 && fr.airBases === r.airBases - 1, { airBases: fr.airBases, was: r.airBases, file: fileOf(F, victim) });
  rec("⭐⭐⭐ …and says so by name, with the reason the write gave", named.filter((e) => /no air base/.test(e.reason) && /ENOSPC/.test(e.reason)).length === 1, fr.vpErrors);
  rec("…beside the victory point the same write would have given it", victimHadVp === 1 && named.filter((e) => /no victory point/.test(e.reason)).length === 1 && fr.victoryPoints === r.victoryPoints - 1 && named.length === 2, { victimHadVp, named, victoryPoints: fr.victoryPoints });
  rec("every other new state is furnished as before", withBase.filter((id) => id !== victim).every((id) => level(F, id, "air_base") === 1) && (fr.vpErrors || []).every((e) => e.state === victim), (fr.vpErrors || []).map((e) => e.state));

  console.log("\n=== UNDATED: an air base the parent only has from a later date is not one to land on at the start ===");
  const D = makeWorld([
    { id: 1, provinces: [1, 2, 3, 4, 5, 6, 7, 8], owner: "AAA", manpower: 8000,
      history: "\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tair_base = 6\n\t\t\t}\n\t\t}\n" },
    { id: 2, provinces: [9, 10, 11, 12, 13, 14, 15, 16], owner: "BBB", manpower: 8000,
      history: "\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t\tair_base = 2\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tair_base = 5\n\t\t\t}\n\t\t}\n" },
  ]);
  const dr = md.fixStateIdFloor(ctx(D)), dMade = dr.statesMade || [];
  const dParent = new Map(dMade.map((s) => [s.id, s.from]));
  const dRoot = (id) => { let p = id; while (dParent.has(p)) p = dParent.get(p); return p; };
  const dFrom = (root) => dMade.filter((s) => dRoot(s.id) === root).map((s) => s.id);
  rec("THE CONTROL: the floor split both states of the dated world", dr.added === CEILING - 2 && dFrom(1).length >= 1 && dFrom(2).length >= 1, dr);
  rec("⭐⭐⭐ a parent whose only air base is dated 1939 gives none", dFrom(1).every((id) => level(D, id, "air_base") === 0 && !/air_base/.test(fileOf(D, id))), dFrom(1).map((id) => fileOf(D, id)));
  rec("⭐⭐ a parent with one undated AND a larger one dated gives the undated `air_base = 1`, and no date is copied", dFrom(2).every((id) => level(D, id, "air_base") === 1 && levelsOf(D, id).dated.length === 0) && dr.airBases === dFrom(2).length, dFrom(2).map((id) => levelsOf(D, id)));

  console.log("\n=== …and a new state an order of battle flies a wing into has room for its planes, whatever its parent has ===");
  // ⛔ #an-air-base-holds-the-planes-it-starts-with — the control above stands: a base-less parent's child that nothing names gets
  // none. But the new state's id is one the base game's scripts name, and its orders of battle may base a wing in it — TEST 31's
  // "State 849 has no air base" was such a child. So the floor asks the new id what Generate land asks of each state it writes: an
  // air_wings block keying it asks for one, and the planes a started order of battle bases there ask for room (⌈planes /
  // AIRBASE_CAPACITY_MULT⌉). Here a copy of the base game starts BBB with a wing of 250 planes in the state split from state 2;
  // another holds only an order of battle no country starts, keying it.
  {
    const MULT = 100, PLANES = 250;
    const target = without[0];
    rec("(the fixture: state 2, which has no air base, gave the floor a new state, and the planes need more than one level's room)", without.length >= 1 && Math.ceil(PLANES / MULT) > 1, without);
    const wing = (id, planes) => `\t${id} = {\n\t\tname = "W${id}"\n\t\tfighter_equipment_0 = {\n\t\t\towner = "BBB"\n\t\t\tamount = ${planes}\n\t\t}\n\t}\n`;
    /** the world split over a copy of the base game holding these orders of battle */
    const splitOver = (tag, files) => {
      const g = tmp(tag);
      fs.cpSync(GAME, g, { recursive: true });
      mk(g, "common/defines/00_defines.lua", `NDefines = {\nNAir = {\n\tAIRBASE_CAPACITY_MULT = ${MULT},\n},\n}\n`);
      for (const [rel, body] of Object.entries(files)) mk(g, rel, body);
      const m = makeWorld(WORLD), res = md.fixStateIdFloor({ modRoot: m, gameRoot: g, dependencyRoots: [] });
      return { m, res, made: res.statesMade || [] };
    };
    const started = splitOver("game-air", { "history/countries/BBB - B.txt": 'set_air_oob = "BBB_air"\n', "history/units/BBB_air.txt": `air_wings = {\n${wing(target, PLANES)}}\n` });
    const quiet = splitOver("game-air-unstarted", { "history/units/ZZZ_event_air.txt": `air_wings = {\n${wing(target, PLANES)}}\n` });
    const cuts = (list) => list.map((s) => s.from + ">" + s.id).join();
    rec("(the fixture: the floor splits both worlds exactly as before — an order of battle decides no cut)", cuts(started.made) === cuts(made) && cuts(quiet.made) === cuts(made), [cuts(started.made), cuts(quiet.made)]);
    rec("⭐⭐⭐ the new state BBB's wing of " + PLANES + " planes is based in has an air base with room for them — its parent has none", level(started.m, target, "air_base") === Math.ceil(PLANES / MULT), { id: target, levels: levelsOf(started.m, target) });
    rec("⭐⭐ the same state keyed only by an order of battle no country starts has somewhere to land: level 1, its planes never flown in", level(quiet.m, target, "air_base") === 1, { id: target, levels: levelsOf(quiet.m, target) });
    rec("…every other new state is furnished as before, and the floor counts the one more", [started, quiet].every((x) => withBase.every((id) => level(x.m, id, "air_base") === 1)
      && without.filter((id) => id !== target).every((id) => level(x.m, id, "air_base") === 0) && x.res.airBases === withBase.length + 1), [started.res.airBases, quiet.res.airBases, withBase.length]);
    // …and says why apart: the one more is not "as the state they came from has" — its parent has none; its own id asked
    const said = P.autoFixSummary({ ok: true, fixes: { stateIdFloor: started.res } });
    rec("⭐⭐ the floor counts it apart: airBasesAsked 1", [started, quiet].every((x) => x.res.airBasesAsked === 1), [started.res.airBasesAsked, quiet.res.airBasesAsked]);
    rec("⭐⭐ …and the page says the rest came from their parents and that one from an order of battle",
      said.includes(`${withBase.length} new state(s) got an air base, as the state they came from has`)
      && said.includes("1 new state(s) got one though the state they came from has none, because an order of battle bases air wings in it"), said.slice(0, 500));
  }

  console.log("\n=== the write itself: giveUndatedStateLevels ===");
  const give = md.giveUndatedStateLevels;
  rec("it is exported", typeof give === "function");
  if (typeof give === "function") {
    const GIVE = { infrastructure: 2, air_base: 1 };
    const lv = (t, k) => levels(t).undated[k] || 0;
    // a state whose history has a port and nothing at state level
    const port = state(9, [5, 6], "AAA", 100, "\t\tbuildings = {\n\t\t\t6 = {\n\t\t\t\tnaval_base = 3 # the harbour\n\t\t\t}\n\t\t}\n");
    const a = give(port, GIVE);
    rec("⭐⭐ the levels go into the buildings block the state has, ahead of its province block, which stays as written",
      lv(a, "air_base") === 1 && lv(a, "infrastructure") === 2 && (a.match(/buildings\s*=/g) || []).length === 1 && a.includes("\t\t\t6 = {\n\t\t\t\tnaval_base = 3 # the harbour\n\t\t\t}\n") && a.indexOf("air_base") < a.indexOf("6 = {"), a);
    // no undated block, and a dated one: the new block goes before the date, which is left exactly as it was
    const datedOnly = state(9, [5, 6], "AAA", 100, "\t\t# the war\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t6 = {\n\t\t\t\t\tnaval_base = 5\n\t\t\t\t}\n\t\t\t}\n\t\t}\n");
    const b = give(datedOnly, GIVE), dated = "\t\t# the war\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\t6 = {\n\t\t\t\t\tnaval_base = 5\n\t\t\t\t}\n\t\t\t}\n\t\t}\n";
    rec("⭐⭐⭐ a state whose only buildings block is a DATED one gets an undated block of its own, before the date and its caption — not an air base from 1939",
      lv(b, "air_base") === 1 && levels(b).dated.length === 0 && b.includes(dated) && b.indexOf("air_base") < b.indexOf("# the war"), b);
    const read = (md.parseStatesText(b) || [])[0];
    rec("…which the model reads as the state's own", !!read && +(read.buildings || {}).air_base === 1 && +(read.buildings || {}).infrastructure === 2, read && read.buildings);
    // a level the state already writes stays the state's
    const has = state(9, [5, 6], "AAA", 100, "\t\tbuildings = {\n\t\t\tinfrastructure = 5\n\t\t\tair_base = 3\n\t\t}\n");
    rec("⭐⭐ a level the state already writes undated stays as written, and nothing is written twice", give(has, GIVE) === has, give(has, GIVE));
    const half = give(state(9, [5, 6], "AAA", 100, "\t\tbuildings = {\n\t\t\tinfrastructure = 5\n\t\t}\n"), GIVE);
    rec("…one it does not write is added beside it", lv(half, "infrastructure") === 5 && lv(half, "air_base") === 1 && (half.match(/infrastructure/g) || []).length === 1, half);
    const none = state(9, [5, 6], "AAA", 100, "");
    const c = give(none, GIVE);
    rec("a history with no buildings gets the block", lv(c, "air_base") === 1 && lv(c, "infrastructure") === 2 && /owner = AAA/.test(c), c);
    rec("nothing to give, nothing written: no level, a level of 0, a key that is not a building's", give(none, {}) === none && give(none, { air_base: 0 }) === none && give(none, { "air base": 1 }) === none);
    const commented = state(9, [5, 6], "AAA", 100, "\t\t# buildings = { air_base = 9 }\n");
    const d = give(commented, GIVE);
    rec("a commented-out buildings block is not the state's: it stays a comment, and a real one is written", d.includes("# buildings = { air_base = 9 }") && lv(d, "air_base") === 1, d);
  }
} finally {
  for (const t of tmps) { try { fs.rmSync(t, { recursive: true, force: true }); } catch (_) {} }
}
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
