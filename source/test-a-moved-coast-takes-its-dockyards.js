// ⛔ #a-moved-coast-takes-its-dockyards — A STATE THAT GIVES AWAY ITS LAST COAST GIVES ITS DOCKYARDS WITH IT. (Review of the map
// tools, SUS-1.)
//
// A dockyard is a coast's building: hoi4.exe refuses one in a state with no province beside the sea, and Nova's Save gate stops on it
// (state_naval_building_without_coast, curated fatal). A state paint (move-province) carried only the province's own history, so
// painting Pennsylvania's one coastal province, 6845, into state 359 left 360 with `dockyard = 7` and a 1939 `dockyard = 8` and no
// coast; the gate's one-click repair, Auto-fix, deleted the 7 and left the dated 8 stranded, and 359, which holds the coast now, got
// none. Five base-game states have that shape. Now the dockyards go where the coast goes, summed with the receiving state's own at
// every moment either sets one (the merge's stateHistoryToCarry / giveStateHistory), their comments with them, and the page says so at
// the click and on the Save line.
//
// Fixture: state 4 holds 8 (inland) and 12, its only coastal province, `dockyard = 7` with a caption, and a 1939.1.1 `dockyard = 8`
// with a trailing comment beside an `arms_factory = 2`; state 3 is coastal with `dockyard = 2` and a 1939.1.1 `dockyard = 3`.
//   1. move-province { provinceId: 12, toStateId: 3 }, as the page sends it: state 3 holds 9 and, from 1939, 11; state 4 holds none in
//      any moment, keeps its arms factory; the comments went with the levels; the answer says what moved; the map check finds no
//      dockyard without a coast, and Auto-fix's naval pass would remove nothing.
//   2. + New state (create-state { name: "", owner }, then the same move): the new state holds 7 and, from 1939, 8, each line with its
//      own comment where it was.
//   3. create-state with provinces [12] (the carve): the same.
//   4. Controls — a move of 8 (inland) carries nothing; once state 4 holds a second coastal province, a move of 12 carries nothing;
//      a merge of 4 into 3 gives 3 the dockyards once (9, and 11 from 1939), not twice.
//   5. The page: coastDockyardsThatGo, navalCarriedNote and reconcileNavalCarry, run as public/map.js has them, and its list of the levels
//      is the server's; its doMoveProvince, run in a sandbox: the click says it on the status line, moves the page's copy and queues the
//      body as before with what it moved in the meta — and judges a coast a staged erase made by the neighbour graph, as the erase brush
//      does; erasing the province before the Save puts the page's copy back (eraseProvinceLocal, unmirrorDroppedMove); the Save loop
//      says it and makes the page's copy agree with what the Save carried.
//   6. Painted out and back before the Save, with Undo never pressed (review of the coast rows, CR-R1).
//   7. Delete state counts every moment of the dockyards it takes, as the carry reads them (review of the coast rows, CR-R4): the
//      model's dated levels (navalDated), the page's reading of them against the carry's for the fixture and every base-game state, the
//      Delete confirm's words, and on five shapes of the two states' levels the click, the Save's carry and the put-back of an erased
//      paint, each against the server's moveProvince on a copy, and the merge click against the server's mergeState on another.
// Binds no port. Run: node test-a-moved-coast-takes-its-dockyards.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-coast-dockyards-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const { lift } = require("./testlib-map-page.js");
const { stripJsComments } = require("./testlib-strip-comments.js");
// ⛔ #a-deleted-state-says-every-dockyard-it-takes — the page's helpers its dockyard code calls (stateNavalLevels, navalLevelsWords,
// navalDatedAfterCarry, giveNavalDated), lifted with whatever below lifts that code
let NAVAL_HELPERS = "", NAVAL_HELPERS_ERROR = "";
try { NAVAL_HELPERS = ["function stateNavalLevels(", "function navalLevelsWords(", "function navalDatedAfterCarry(", "function giveNavalDated("].map((o) => lift(o)).join("\n") + "\n"; }
catch (e) { NAVAL_HELPERS_ERROR = e.message; }

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 700) : "")); }
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
//        x 10-20  20-30  30-40  40-50
//  y 5     2      3      4      5
//  y 15    6      7      8      9          7 and 8 inland
//  y 25   10     11     12     13          the rest is sea 1
const W = 60, H = 45, SEA = 1;
const RECT = {
  2: [10, 5, 20, 15], 3: [20, 5, 30, 15], 4: [30, 5, 40, 15], 5: [40, 5, 50, 15],
  6: [10, 15, 20, 25], 7: [20, 15, 30, 25], 8: [30, 15, 40, 25], 9: [40, 15, 50, 25],
  10: [10, 25, 20, 35], 11: [20, 25, 30, 35], 12: [30, 25, 40, 35], 13: [40, 25, 50, 35],
};
const shapeAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
const STATES = { 1: [2, 3, 6], 2: [7], 3: [4, 5, 9, 10, 11, 13], 4: [8, 12] };
const BUILDINGS = "buildings = {\n\tnaval_base = {\n\t\tonly_costal = yes\n\t\tspawn_point = naval_base_spawn\n\t}\n\tdockyard = {\n\t\tonly_costal = yes\n\t\tlevel_cap = {\n\t\t\tshares_slots = yes\n\t\t}\n\t}\n}\n";
const HISTORY = {
  4: "\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t\t# the yards on the river\n\t\t\tdockyard = 7\n\t\t\t12 = { naval_base = 3 }\n\t\t}\n"
    + "\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 8 # more yards by 1939\n\t\t\t\tarms_factory = 2\n\t\t\t}\n\t\t}\n",
  3: "\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n\t\t\tdockyard = 2\n\t\t}\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 3\n\t\t\t}\n\t\t}\n",
};
function makeMod(name, { crlf = false, history = HISTORY } = {}) {
  const dir = path.join(ROOT, name);
  write(dir, "descriptor.mod", `name="${name}"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="common/buildings"\n`);
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(shapeAt(x, y))));
  write(dir, "map/heightmap.bmp", bmp8(W, H, (x, y) => (shapeAt(x, y) === SEA ? 80 : 110)));
  const defs = ["0;0;0;0;land;false;unknown;0", `${SEA};${colour(SEA).join(";")};sea;false;ocean;0`];
  for (let id = 2; id <= 13; id++) defs.push(`${id};${colour(id).join(";")};land;false;plains;1`);
  write(dir, "map/definition.csv", defs.join("\n") + "\n");
  write(dir, "common/buildings/00_buildings.txt", BUILDINGS);
  for (const [sid, provs] of Object.entries(STATES)) {
    const body = `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n${history[sid] || "\t\towner = AAA\n"}\t}\n}\n`;
    write(dir, `history/states/${sid}-S.txt`, crlf ? body.replace(/\n/g, "\r\n") : body);
  }
  write(dir, "map/buildings.txt", "");
  return { modRoot: dir, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
}
const stateText = (roots, sid) => { const d = path.join(roots.modRoot, "history", "states"); for (const f of fs.readdirSync(d)) { const t = fs.readFileSync(path.join(d, f), "utf8"); if (new RegExp("\\bid\\s*=\\s*" + sid + "\\b").test(t)) return t; } return ""; };
const block = (roots, sid) => stateText(roots, sid).replace(/\r\n/g, "\n");
// The test reads the levels with a brace walk of its own, not with the fix's helper, so it judges the disk the same way before and after.
// statements(s, from, to): each `key = value` / `key = { … }` at depth 0 of s[from, to), s with its comments masked to spaces.
function statements(s, from, to) {
  const out = [];
  const head = /([A-Za-z0-9_.]+)[ \t\r\n]*=[ \t\r\n]*/y, word = /[^ \t\r\n{}]+/y;
  let i = from;
  while (i < to) {
    while (i < to && /[ \t\r\n]/.test(s[i])) i++;
    if (i >= to) break;
    head.lastIndex = i;
    const m = head.exec(s);
    if (!m) { if (s[i] === "{") { let d = 0, k = i; for (; k < to; k++) { if (s[k] === "{") d++; else if (s[k] === "}" && --d === 0) break; } i = k + 1; } else i++; continue; }
    const j = head.lastIndex;
    if (s[j] === "{") {
      let d = 0, k = j;
      for (; k < to; k++) { if (s[k] === "{") d++; else if (s[k] === "}" && --d === 0) break; }
      out.push({ key: m[1], start: j + 1, end: k });
      i = k + 1;
    } else {
      word.lastIndex = j;
      const v = word.exec(s);
      out.push({ key: m[1], value: v ? v[0] : "" });
      i = v ? word.lastIndex : j + 1;
    }
  }
  return out;
}
const levels = (roots, sid) => {
  const s = block(roots, sid).replace(/#[^\n]*/g, (c) => " ".repeat(c.length));
  const st = statements(s, 0, s.length).find((t) => t.key === "state" && t.end !== undefined);
  const hist = st && statements(s, st.start, st.end).find((t) => t.key === "history" && t.end !== undefined);
  if (!hist) return [];
  const out = [];
  const read = (b, date) => { for (const t of statements(s, b.start, b.end)) if (t.key === "dockyard" && t.end === undefined) out.push(`${date || "undated"} ${t.value}`); };
  for (const t of statements(s, hist.start, hist.end)) {
    if (t.end === undefined) continue;
    if (t.key === "buildings") read(t, null);
    else if (/^\d+\.\d+\.\d+$/.test(t.key)) for (const u of statements(s, t.start, t.end)) if (u.key === "buildings" && u.end !== undefined) read(u, t.key);
  }
  return out.sort();
};
const stranded = (roots) => {
  const undated = md.fixNavalBuildingsWithoutCoast({ ...roots, dryRun: true });
  const dated = md.findDatedNavalBuildingsWithoutCoast({ ...roots, model: md.buildMapModel({ ...roots, cacheStableLayers: true }) });
  return { undated: (undated && undated.states) || [], dated: (dated || []).map((d) => `${d.stateId}@${d.date}`) };
};
// a comment's caption: the code line under it, or the line it trails
const captionOf = (text, comment) => {
  const lines = text.split("\n");
  const i = lines.findIndex((l) => l.includes(comment));
  if (i < 0) return null;
  if (lines[i].trim().startsWith("#")) { for (let k = i + 1; k < lines.length; k++) if (lines[k].trim() && !lines[k].trim().startsWith("#")) return lines[k].trim(); return ""; }
  return lines[i].slice(0, lines[i].indexOf("#")).trim();
};

console.log("\n=== 0. the fixture ===");
{
  const roots = makeMod("fixture");
  const sea = md.landProvincesTouchingSea({ ...roots, model: md.buildMapModel({ ...roots, cacheStableLayers: true }) });
  ok(sea.has(12) && !sea.has(8), "(12 is state 4's only coastal province; 8 is inland)");
  ok(JSON.stringify(levels(roots, 4)) === JSON.stringify(["1939.1.1 8", "undated 7"]), "(state 4 holds dockyard = 7 and, from 1939.1.1, 8)", levels(roots, 4));
  ok(!stranded(roots).undated.length && !stranded(roots).dated.length, "(no dockyard stands without a coast before the edit)", stranded(roots));
}

console.log("\n=== 1. A state paint of 12 into state 3 — move-province { provinceId: 12, toStateId: 3 } ===");
{
  const roots = makeMod("paint", { crlf: true });
  const m = md.moveProvince({ ...roots, provinceId: 12, toStateId: 3 });
  ok(!!m && m.changed && !m.error, "(the move answered changed)", m && m.error);
  ok(JSON.stringify(levels(roots, 3)) === JSON.stringify(["1939.1.1 11", "undated 9"]), "⭐⭐ state 3, which holds the coast now, has the dockyards summed with its own: 9, and from 1939.1.1 11", levels(roots, 3));
  ok(!levels(roots, 4).length, "⭐⭐ state 4, landlocked now, holds no dockyard in any moment", levels(roots, 4));
  const s4 = block(roots, 4), s3 = block(roots, 3);
  ok(/arms_factory = 2/.test(s4) && /infrastructure = 2/.test(s4) && !/#\s*(the yards|more yards)/.test(s4), "⭐ state 4 keeps its other levels, and the dockyards' comments left with them", s4);
  ok(/# the yards on the river/.test(s3) && /# more yards by 1939/.test(s3), "⭐ the comments went with the levels to state 3", s3);
  ok(!/\r?\n\r?\n\r?\n/.test(stateText(roots, 4)) && stateText(roots, 4).split("\r\n").length - 1 === stateText(roots, 4).split("\n").length - 1, "(state 4's file keeps its CRLF line endings throughout, no blank gap where the lines were cut)");
  const st = stranded(roots);
  ok(!st.undated.includes(4) && !st.dated.some((d) => d.startsWith("4@")), "⭐⭐ the map check finds no dockyard without a coast — the Save gate does not stop, and Auto-fix's naval pass removes nothing", st);
  ok(Array.isArray(m.navalCarried) && m.navalCarried.length === 1 && m.navalCarried[0].from === 4 && m.navalCarried[0].to === 3 && m.navalCarried[0].province === 12
    && JSON.stringify(m.navalCarried[0].levels.map((l) => `${l.date || "undated"} ${l.level}`).sort()) === JSON.stringify(["1939.1.1 8", "undated 7"]), "⭐ the answer says what moved, from where to where (the Save line reads it)", m.navalCarried);
}

console.log("\n=== 2. + New state: create-state { name: \"\", owner }, then move-province 12 ===");
{
  const roots = makeMod("new-state");
  const c = md.createState({ ...roots, name: "", owner: "AAA" });
  const m = md.moveProvince({ ...roots, provinceId: 12, toStateId: c.id });
  ok(!!m && m.changed, "(the move answered changed)", m && m.error);
  ok(JSON.stringify(levels(roots, c.id)) === JSON.stringify(["1939.1.1 8", "undated 7"]), `⭐⭐ the new state ${c.id} holds dockyard = 7 and, from 1939.1.1, 8`, levels(roots, c.id));
  ok(!levels(roots, 4).length, "⭐ state 4 holds none", levels(roots, 4));
  const t = block(roots, c.id);
  ok(captionOf(t, "# the yards on the river") === "dockyard = 7" && captionOf(t, "# more yards by 1939") === "dockyard = 8", "⭐⭐ each comment captions its own level in the new state, as it did in the old", { a: captionOf(t, "# the yards on the river"), b: captionOf(t, "# more yards by 1939") });
}

console.log("\n=== 3. create-state with provinces [12] (the carve) ===");
{
  const roots = makeMod("carve");
  const c = md.createState({ ...roots, name: "", owner: "AAA", provinces: [12] });
  ok(!!c && c.ok, "(create-state answered ok)", c);
  ok(JSON.stringify(levels(roots, c.id)) === JSON.stringify(["1939.1.1 8", "undated 7"]) && !levels(roots, 4).length, `⭐⭐ the new state ${c.id} holds the dockyards, state 4 none`, { now: levels(roots, c.id), four: levels(roots, 4) });
  ok(Array.isArray(c.navalCarried) && c.navalCarried.length === 1 && c.navalCarried[0].from === 4, "⭐ the answer says so", c.navalCarried);
  ok(!stranded(roots).undated.includes(4), "(no dockyard stands without a coast)", stranded(roots));
}

console.log("\n=== 4. Controls ===");
{
  const roots = makeMod("inland");
  const m = md.moveProvince({ ...roots, provinceId: 8, toStateId: 2 });
  ok(!!m && m.changed && !m.navalCarried && JSON.stringify(levels(roots, 4)) === JSON.stringify(["1939.1.1 8", "undated 7"]), "⭐ moving 8, inland, carries nothing: state 4 keeps its coast and its dockyards", { carried: m && m.navalCarried, four: levels(roots, 4) });
}
{
  const roots = makeMod("two-coasts");
  md.moveProvince({ ...roots, provinceId: 13, toStateId: 4 });
  const m = md.moveProvince({ ...roots, provinceId: 12, toStateId: 3 });
  ok(!!m && m.changed && !m.navalCarried && JSON.stringify(levels(roots, 4)) === JSON.stringify(["1939.1.1 8", "undated 7"]), "⭐ with 13 coastal in state 4 too, moving 12 carries nothing", { carried: m && m.navalCarried, four: levels(roots, 4) });
}
{
  const roots = makeMod("merge");
  const r = md.mergeState({ ...roots, sourceStateId: 4, targetStateId: 3 });
  ok(!!r && r.changed !== false && !r.error, "(merge-state 4 → 3 answered)", r && r.error);
  ok(JSON.stringify(levels(roots, 3)) === JSON.stringify(["1939.1.1 11", "undated 9"]), "⭐⭐ a merge gives state 3 the dockyards once — 9, and 11 from 1939 — not twice", levels(roots, 3));
}

// the click itself, run: the page's doMoveProvince in a sandbox holding the fixture as the page holds it (one strategic region, so no
// region question is asked; each state's manpower, category and cores as its file has them, which the state panel echoes back)
const page = (coastalCsv, opts = {}) => {
  const ctx = {
    console, window: { novaConfirm: () => {}, confirm: () => true }, status: "", undo: [], pendingWrites: [], autoFix: true, statusEl: null,
    paintDiff: new Map(), moveSource: null, moveTarget: null, provNeighborsCache: null, provinceToOwner: {},
    provinceType: new Map([[1, "sea"], ...Object.keys(RECT).map((p) => [+p, "land"])]),
    provinceDef: new Map([[1, { type: "sea", coastal: false }], ...Object.keys(RECT).map((p) => [+p, { type: "land", coastal: coastalCsv.has(+p) }])]),
    model: {
      states: Object.entries(STATES).map(([sid, provs]) => ({ id: +sid, name: `S${sid}`, owner: "AAA", provinces: provs.slice(), manpower: 1000, category: "rural", cores: [],
        buildings: +sid === 4 ? { infrastructure: 2, dockyard: 7 } : +sid === 3 ? { infrastructure: 2, dockyard: 2 } : { infrastructure: 2 } })),
      provinceToState: Object.fromEntries(Object.entries(STATES).flatMap(([sid, provs]) => provs.map((p) => [p, +sid]))),
      provinceToRegion: Object.fromEntries(Object.keys(RECT).map((p) => [p, 10])), strategicRegions: [{ id: 10, provinces: Object.keys(RECT).map(Number) }], capitals: {},
    },
  };
  // (⛔ #a-deleted-state-says-every-dockyard-it-takes — `opts.model`: each state's levels as the server's model of a fixture gives them,
  // its undated `buildings` and its `navalDated`)
  if (opts.model) for (const s of ctx.model.states) {
    const t = (opts.model.states || []).find((x) => x.id === s.id);
    if (!t) continue;
    s.buildings = Object.assign({}, t.buildings || {});
    if (t.navalDated) s.navalDated = t.navalDated.map((d) => Object.assign({}, d)); else delete s.navalDated;
  }
  ctx.stateById = new Map(ctx.model.states.map((s) => [s.id, s]));
  ctx.setStatus = (m) => { ctx.status = String(m); };
  ctx.pushUndo = (l) => { ctx.undo.push(l); };
  ctx.queueWrite = (url, body, meta) => { ctx.pendingWrites.push({ url, body: body || {}, meta: meta || {} }); return { ok: true, deferred: true }; };
  ctx.setMapDirty = () => {}; ctx.recolorAll = () => {}; ctx.draw = () => {};
  ctx.deleteEmptiedStates = () => ({ deleted: [], keptCapitals: [], keptInherited: [] });
  ctx.inheritedEmptyWarning = () => "";
  // the neighbour graph the page builds from its border geometry: these rectangles, and the sea round them
  ctx.buildProvNeighbors = () => {
    const adj = new Map(), add = (a, b) => { if (a === b) return; for (const [x, y] of [[a, b], [b, a]]) { if (!adj.has(x)) adj.set(x, new Set()); adj.get(x).add(y); } };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const a = shapeAt(x, y); if (x + 1 < W) add(a, shapeAt(x + 1, y)); if (y + 1 < H) add(a, shapeAt(x, y + 1)); }
    ctx.provNeighborsCache = adj;
  };
  if (opts.erase) { ctx.provinceType.set(opts.erase, "sea"); ctx.provinceDef.set(opts.erase, { type: "sea", coastal: false }); }
  vm.createContext(ctx);
  let code = "";
  ctx.selected = null; ctx.stateFormBaseline = null; ctx.info = { style: {} };   // (what the merge click clears)
  try { code = ["function regionMoveStrays(", "function stateMoveRegionTarget(", "function setProvinceRegionLocally(", "function stageProvinceRegionMove(", "function doMoveProvince(", "function coastDockyardsThatGo(",
    "function unmirrorDroppedMove(", "function paintDropRefusal(", "function reconcileNavalCarry(", "function moveProvinceLevels(", "function eraseProvinceLocal(", "function mergeRegionPlan(", "function doMergeState("].map((o) => lift(o)).join("\n")
    + "\n" + NAVAL_HELPERS + lift("const NAVAL_ONLY_STATE_KEYS =", ";").replace(/^const /, "var ") + "\n" + lift("const STATE_ID_FIELDS =", ";").replace(/^const /, "var "); }
  catch (e) { ctx.liftError = e.message; return ctx; }
  vm.runInContext(code, ctx);
  ctx.erasedThisStroke = new Set(); ctx.eraseEmptied = new Set(); ctx.eraseSkippedInland = new Set(); ctx.eraseHeld = new Map();
  return ctx;
};
const CSV_COAST = new Set([2, 3, 4, 5, 6, 9, 10, 11, 12, 13]);           // the fixture's coast, as definition.csv says it

console.log("\n=== 5. The page ===");
{
  const box = {};
  try {
    const code = [lift("const NAVAL_ONLY_STATE_KEYS =", ";"), lift("function coastDockyardsThatGo("), lift("function navalCarriedNote("), lift("function reconcileNavalCarry("), NAVAL_HELPERS].join("\n");
    vm.runInNewContext(code + "\nthis.coastDockyardsThatGo = coastDockyardsThatGo; this.navalCarriedNote = navalCarriedNote; this.reconcileNavalCarry = reconcileNavalCarry; this.KEYS = NAVAL_ONLY_STATE_KEYS;", box);
  } catch (e) {
    box.coastDockyardsThatGo = () => []; box.navalCarriedNote = () => ""; box.reconcileNavalCarry = () => 0;
    ok(false, "⭐ the page has coastDockyardsThatGo, navalCarriedNote, reconcileNavalCarry and its list of the levels a coast carries", e.message);
  }
  {
    // the page's copy after the Save: as the click mirrored it when the two agree; the Save's carry applied where the click judged no
    // last coast; the click's mirror put back where the Save carried none
    const states = () => new Map([[3, { id: 3, buildings: { dockyard: 2 } }], [4, { id: 4, buildings: { dockyard: 7, infrastructure: 2 } }]]);
    const carried = [{ from: 4, to: 3, province: 12, levels: [{ date: null, key: "dockyard", level: 7 }, { date: "1939.1.1", key: "dockyard", level: 8 }] }];
    let S = states();
    S.get(3).buildings.dockyard = 9; delete S.get(4).buildings.dockyard;             // as doMoveProvince mirrored it
    const same = box.reconcileNavalCarry(3, [{ from: 4, keys: { dockyard: 7 } }], carried, (id) => S.get(id));
    ok(same === 0 && S.get(3).buildings.dockyard === 9 && !("dockyard" in S.get(4).buildings), "⭐ the click's copy and the Save agree: nothing changes", { same, s: [...S.values()] });
    S = states();
    const applied = box.reconcileNavalCarry(3, [], carried, (id) => S.get(id));
    ok(applied === 1 && S.get(3).buildings.dockyard === 9 && !("dockyard" in S.get(4).buildings) && S.get(4).buildings.infrastructure === 2, "⭐ the Save carried what the click did not judge a last coast: the page's copy follows (9 in state 3, none in 4; the dated 8 is not a panel level)", [...S.values()]);
    S = states();
    S.get(3).buildings.dockyard = 9; delete S.get(4).buildings.dockyard;
    const back = box.reconcileNavalCarry(3, [{ from: 4, keys: { dockyard: 7 } }], [], (id) => S.get(id));
    ok(back === 1 && S.get(3).buildings.dockyard === 2 && S.get(4).buildings.dockyard === 7, "⭐ the click mirrored a carry the Save did not make: the page's copy is put back", [...S.values()]);
  }
  ok(Array.isArray(md.NAVAL_ONLY_STATE_BUILDINGS) && md.NAVAL_ONLY_STATE_BUILDINGS.includes("dockyard") && JSON.stringify(box.KEYS) === JSON.stringify(md.NAVAL_ONLY_STATE_BUILDINGS), "(the page's list of the levels a coast carries is map-data.js's NAVAL_ONLY_STATE_BUILDINGS)", { page: box.KEYS, server: md.NAVAL_ONLY_STATE_BUILDINGS });
  const coastal = new Set([12, 13, 9]);
  const four = { id: 4, name: "Penn", provinces: [8], buildings: { dockyard: 7, infrastructure: 2 } };
  const got = box.coastDockyardsThatGo(12, [four], (p) => coastal.has(p));
  ok(got.length === 1 && got[0].state === four && got[0].keys.dockyard === 7, "⭐ the click judges 12 to be state 4's last coast, with its 7 dockyards", got);
  ok(!box.coastDockyardsThatGo(8, [{ ...four, provinces: [12] }], (p) => coastal.has(p)).length, "(an inland province takes none)");
  ok(!box.coastDockyardsThatGo(12, [{ ...four, provinces: [8, 13] }], (p) => coastal.has(p)).length, "(a state with another coast keeps them)");
  const note = box.navalCarriedNote([{ from: 4, to: 3, province: 12, levels: [{ date: null, key: "dockyard", level: 7 }, { date: "1939.1.1", key: "dockyard", level: 8 }] }], (sid) => `S${sid}`);
  ok(/Province 12 was S4's last coast/.test(note) && /to S3/.test(note) && /7 dockyards/.test(note) && /8 dockyards from 1939\.1\.1/.test(note), "⭐ the Save line names the province, both states and every level it carried", note);
  const map = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n"));
  const move = map.slice(map.indexOf("function doMoveProvince("), map.indexOf("function eraseProvinceLocal("));
  ok(/coastDockyardsThatGo\(provinceId,/.test(move) && /yardNote/.test(move.slice(move.indexOf("setStatus("))), "⭐ the state paint asks it at the click and says it on the status line, before anything is saved", null);
  ok(/queueWrite\("\/api\/map\/move-province", \{ provinceId, toStateId \}, \{ fromStateId, yards: yards\.map\(/.test(move), "(the queued move carries what the click mirrored, for the Save to check against)", null);
  // Delete state on a state that still has provinces says the dockyards it holds go with it — a new state made from a state's last coast
  // holds them now — run as the page has the two lines: a saved state holding 7, one holding 1, one holding none; and a new state not
  // saved yet holding the 7 its click moved, which Delete discards with the moves that filled it, giving the 7 back (unmirrorDroppedMove,
  // run by test-map-discard-new-state.js), so nothing is said of them
  {
    const at = map.indexOf('$("miDeleteBtn").addEventListener("click"');
    const leave = at < 0 ? -1 : map.indexOf("Deleting it will leave them in NO state", at);   // (the capital's confirm, above it, also ends "Delete anyway?")
    const del = leave < 0 ? "" : map.slice(at, map.indexOf("Delete anyway?", leave) + 40);
    const m = del.match(/\n\s*const yards = [^\n]*\n\s*const yardWords = [^\n]*/);
    // (⛔ #a-deleted-state-says-every-dockyard-it-takes — the two lines count with the page's stateNavalLevels and navalLevelsWords: section 7)
    const words = (sid, buildings, navalDated) => {
      if (!m) return null;
      try { return vm.runInNewContext(`var NAVAL_ONLY_STATE_KEYS = ${JSON.stringify(box.KEYS)};\n${NAVAL_HELPERS}` + m[0] + "\n[yardWords]", { sid, st: { id: sid, provinces: [12], buildings, ...(navalDated ? { navalDated } : {}) } })[0]; }
      catch (e) { return "ERR " + e.message; }
    };
    const seven = words(4, { dockyard: 7, infrastructure: 2 }), one = words(4, { dockyard: 1 }), none = words(4, { infrastructure: 2 }), fresh = words(-1, { dockyard: 7 });
    ok(typeof seven === "string" && /Its 7 dockyards go with it, unless its provinces are moved out first/.test(seven) && /\$\{yardWords\}\\n\\nDelete anyway\?/.test(del),
      "⭐ Delete state says the dockyards a state holds go with it, before they do", seven);
    ok(typeof one === "string" && /Its 1 dockyard goes with it/.test(one) && /takes it along/.test(one), "(one dockyard is said as one)", one);
    ok(none === "", "(a state holding none is told nothing of them)", none);
    ok(fresh === "", "⭐ a new state not saved yet is discarded with the moves that filled it, and its dockyards go back with them: nothing is said of them", fresh);
  }
  {
    const p = page(CSV_COAST);
    if (p.liftError) ok(false, "⭐ the page's doMoveProvince runs", p.liftError);
    else {
      p.doMoveProvince(12, 4, 3);
      const s3 = p.stateById.get(3), s4 = p.stateById.get(4), w = p.pendingWrites.find((x) => x.url === "/api/map/move-province");
      ok(/⚓ Province 12 was S4's last coast: its 7 dockyards go with it to S3/.test(p.status) && /\(unsaved/.test(p.status), "⭐⭐ the click says it on the status line, before anything is saved", p.status);
      ok(s3.buildings.dockyard === 9 && !("dockyard" in s4.buildings) && s4.buildings.infrastructure === 2, "⭐ the page's copy moves them at the click, inside the move's Undo step (the state panel shows where they are)", { s3: s3.buildings, s4: s4.buildings, undo: p.undo });
      ok(!!w && JSON.stringify(w.meta.yards) === JSON.stringify([{ from: 4, keys: { dockyard: 7 } }]) && w.meta.fromStateId === 4 && JSON.stringify(w.body) === JSON.stringify({ provinceId: 12, toStateId: 3 }),
        "⭐ the queued move's body is as before, and its meta says what the click moved", w);
    }
  }
  {
    const p = page(CSV_COAST);
    if (!p.liftError) {
      p.doMoveProvince(8, 4, 2);
      ok(!/⚓/.test(p.status) && p.stateById.get(4).buildings.dockyard === 7 && JSON.stringify((p.pendingWrites[0] || {}).meta.yards) === "[]", "(moving 8, inland, moves nothing and says nothing of it)", p.status);
    }
  }
  {
    // a staged erase made 8 coastal, which definition.csv does not know yet: the page asks the neighbour graph, as the erase brush does
    const p = page(CSV_COAST, { erase: 4 });
    if (!p.liftError) {
      p.doMoveProvince(12, 4, 3);
      ok(!/⚓/.test(p.status) && p.stateById.get(4).buildings.dockyard === 7, "⭐ with 4 erased to sea (staged), 8 is coastal by its sea neighbour though its column says no: 12 is not state 4's last coast, nothing moves", p.status);
    }
  }
  {
    // 12 painted into state 3 and then erased before the Save: the erase brush drops the staged move, so the Save never carries what the
    // click moved, and the page's copy goes back to what the files hold
    const p = page(CSV_COAST);
    if (!p.liftError) {
      let code = "";
      try { code = ["function eraseProvinceLocal(", "function unmirrorDroppedMove(", "function reconcileNavalCarry("].map((o) => lift(o)).join("\n"); }
      catch (e) { ok(false, "⭐ the page has eraseProvinceLocal and unmirrorDroppedMove", e.message); }
      if (code) {
        vm.runInContext(code, p);
        p.erasedThisStroke = new Set(); p.eraseEmptied = new Set(); p.eraseSkippedInland = new Set(); p.eraseHeld = new Map();
        p.doMoveProvince(12, 4, 3);
        const mirrored = p.stateById.get(3).buildings.dockyard === 9 && !("dockyard" in p.stateById.get(4).buildings);
        const erased = p.eraseProvinceLocal(12);
        const s3 = p.stateById.get(3), s4 = p.stateById.get(4);
        ok(mirrored && erased === true && !p.pendingWrites.some((x) => x.url === "/api/map/move-province"), "(the click mirrored the 7, and the erase dropped the staged move of 12)", p.pendingWrites.map((x) => x.url));
        ok(s4.buildings.dockyard === 7 && s3.buildings.dockyard === 2 && s4.buildings.infrastructure === 2, "⭐⭐ painted and then erased unsaved: state 4's 7 dockyards are back on the page, where the files hold them, and state 3 has its own 2", { s3: s3.buildings, s4: s4.buildings });
      }
    }
  }
  const flush = map.slice(map.indexOf("async function flushMapSaves("), map.indexOf("async function flushMapSaves(") + 60000);
  ok(/navalCarriedNote\(res\.navalCarried/.test(flush), "(the Save loop reads the answer's navalCarried)", null);
  ok(/reconcileNavalCarry\(body\.toStateId, mirrored, res\.navalCarried/.test(flush) && /w\.meta\.yards\.map\(\(y\) => \(\{ from: remap\(y\.from\)/.test(flush), "⭐ …and makes the page's copy agree with it, the click's states remapped as the Save sent them", null);
  const remapQ = map.slice(map.indexOf("function remapQueuedStateId("), map.indexOf("function remapQueuedStateId(") + 3000);
  ok(/Array\.isArray\(w\.meta\.yards\)\) for \(const y of w\.meta\.yards\) if \(y && y\.from === provId\) y\.from = realId/.test(remapQ), "(a new state's provisional id in what the click mirrored becomes its real id with the queue's other references)", null);
}

console.log("\n=== 6. Painted out and back before the Save, with Undo never pressed (review of the coast rows, CR-R1) ===");
// A stray stroke painted back: 12, state 4's last coast, painted into state 3 and then back into 4, nothing saved between. Each click
// asked its own question, and the second found state 3 still coastal, so it carried nothing back: the Save carried the 7 (and the 1939
// 8) to state 3 and left state 4 — its coast back — with none, while the second click said only "Province 12 → state 4". The return
// now takes the paint that took them out of the Save, as the erase brush and the discard of a new state take a staged move out, and
// both files stay as they were. A state edit staged between the two clicks used to write the page's copy as the first paint left it,
// every building in it, until ⛔ #a-panel-edit-sends-what-the-modder-changed: the panel sends what the modder changed. And a write of either
// state queued since refuses the click (⛔ #a-dropped-paint-refuses-what-rests-on-it): nothing moves, the panel's write stays as typed, and the
// Save carries the coast with its dockyards as the first paint said.
{
  const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
  const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
  const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];
  let STAGE = "";
  try { STAGE = lift("function readStateForm(") + "\n" + lift("function stageStateWrite("); } catch (e) { ok(false, "(the page has stageStateWrite)", e.message); }
  // the state panel's own stageStateWrite, on the panel as showInfo fills it from the page's copy of `sid`, clicked on province `pid`, with what `edit` types
  const panelWrite = (p, sid, pid, edit) => {
    const st = p.stateById.get(sid);
    const inputs = {
      miNameInp: { value: String(st.displayName || st.name || "") }, miOwnerSel: { value: String(st.owner || "") }, miCoresInp: { value: (st.cores || []).join(", ") },
      miManpowerInp: { value: String(st.manpower || 0) }, miCategoryInp: { value: String(st.category || "") },
      miNavalBase: { value: String(((st.provinceBuildings || {})[pid] || {}).naval_base || 0) },
    };
    const bld = BLD.map((b) => ({ dataset: { bld: b }, value: String((st.buildings || {})[b] || 0) }));
    const res = RES.map((r) => ({ dataset: { res: r }, value: String((st.resources || {})[r] || 0) }));
    // (pendingWrites: the page's own queue, which the staging walks for the state's queued towns, ⛔ #a-queued-town-is-the-panels-own)
    const sb = { console, pushUndo: (l) => p.pushUndo(l), rebaselineStateForm: () => {}, provinceToOwner: p.provinceToOwner, stateById: p.stateById, stateFormBaseline: null,
      pendingWrites: p.pendingWrites,
      $: (id) => inputs[id] || { value: "" }, collectVps: () => [], queueWrite: (url, body, meta) => p.queueWrite(url, body, meta),
      document: { querySelectorAll: (sel) => (/data-bld/.test(sel) ? bld : /data-res/.test(sel) ? res : []), createElement: () => ({}) },
      countrySelect: { options: [{ value: st.owner || "" }], appendChild() {} } };
    sb.globalThis = sb;
    vm.createContext(sb);
    vm.runInContext(`${STAGE}\nglobalThis.__stage = stageStateWrite;\nstateFormBaseline = { stateId: ${sid}, provinceId: ${pid}, shown: readStateForm() };`, sb);   // what showInfo leaves
    if (edit) edit(inputs);
    sb.__stage(sid, pid);
    return p.pendingWrites[p.pendingWrites.length - 1];
  };
  const typeManpower = (inputs) => { inputs.miManpowerInp.value = "123456"; };
  // the Save: each queued body, as server.js's handler passes it to map-data.js
  const replay = (roots, writes) => writes.map((w) => {
    const b = w.body || {};
    if (w.url === "/api/map/move-province") return md.moveProvince({ ...roots, provinceId: b.provinceId, fromStateId: b.fromStateId, toStateId: b.toStateId });
    if (w.url === "/api/map/set-state") return md.writeStateFields({ ...roots, stateId: b.stateId, fields: b.fields || {} });
    if (w.url === "/api/map/flip-province-sea") return md.flipProvinceToSea({ ...roots, provinceId: b.provinceId });
    return { error: "not replayed: " + w.url };
  });
  const moves = (p, pid) => p.pendingWrites.filter((x) => x.url === "/api/map/move-province" && x.body && x.body.provinceId === pid);
  const copy = (p) => ({ S3: p.stateById.get(3).buildings.dockyard || 0, S4: p.stateById.get(4).buildings.dockyard || 0 });
  const FOUR = JSON.stringify(["1939.1.1 8", "undated 7"]), THREE = JSON.stringify(["1939.1.1 3", "undated 2"]);
  {
    const p = page(CSV_COAST);
    if (p.liftError) ok(false, "⭐ the page's doMoveProvince runs", p.liftError);
    else {
      p.doMoveProvince(12, 4, 3);
      p.doMoveProvince(12, 3, 4);
      ok(/⚓ Province 12 is back in S4, whose last coast it was: its 7 dockyards come back with it from S3/.test(p.status), "⭐⭐ the click that paints it back says the dockyards come back with it", p.status);
      ok(JSON.stringify(copy(p)) === JSON.stringify({ S3: 2, S4: 7 }), "⭐ the page's copy holds them where the files do: 7 in state 4, state 3 its own 2", copy(p));
      ok(!moves(p, 12).length, "⭐⭐ neither paint of 12 is left in the Save", p.pendingWrites.map((x) => ({ url: x.url, body: x.body })));
      ok(p.undo.length === 2, "(each click is its own Undo step: Undo after the return gives back the first paint and what it moved)", p.undo);
      const roots = makeMod("round-trip");
      const was = { 3: stateText(roots, 3), 4: stateText(roots, 4) };
      const answers = replay(roots, p.pendingWrites);
      ok(stateText(roots, 3) === was[3] && stateText(roots, 4) === was[4], "⭐⭐ the Save leaves both files as they were: state 4 still holds its 7 and, from 1939, 8; state 3 its 2 and 3", { three: levels(roots, 3), four: levels(roots, 4), answers });
    }
  }
  {
    const p = page(CSV_COAST);
    if (!p.liftError && STAGE) {
      p.doMoveProvince(12, 4, 3);
      const edit = panelWrite(p, 4, 8, typeManpower);
      p.doMoveProvince(12, 3, 4);
      const edited = p.pendingWrites.find((x) => x.url === "/api/map/set-state" && x.body && x.body.stateId === 4);
      ok(!!edit && !!edited && !("buildings" in edited.body.fields) && edited.body.fields.manpower === "123456", "⭐ state 4's panel, saved between the two clicks with a manpower typed, sends the manpower and no building", edited && edited.body.fields);
      ok(/^🚫 Putting province 12 back into S4 would undo/.test(p.status) && /Save first, or use Undo/.test(p.status) && moves(p, 12).length === 1 && JSON.stringify(copy(p)) === JSON.stringify({ S3: 9, S4: 0 }), "⭐ …and the paint back is refused: the edit names the state the paint took from, nothing moves", { status: p.status, copy: copy(p) });
      const roots = makeMod("round-trip-four-edited");
      const answers = replay(roots, p.pendingWrites);
      ok(JSON.stringify(levels(roots, 4)) === "[]" && levels(roots, 3).includes("undated 9"), "⭐⭐ …and the Save does as the page says: the coast and its dockyards in state 3, and no `dockyard = 0` written on state 4", { four: levels(roots, 4), three: levels(roots, 3), answers });
    }
  }
  {
    const p = page(CSV_COAST);
    if (!p.liftError && STAGE) {
      p.doMoveProvince(12, 4, 3);
      panelWrite(p, 3, 4, typeManpower);
      p.doMoveProvince(12, 3, 4);
      ok(/^🚫 Putting province 12 back into S4 would undo/.test(p.status) && moves(p, 12).length === 1, "⭐ a write of the state it went to refuses the paint back as well", p.status);
      const roots = makeMod("round-trip-three-edited");
      const answers = replay(roots, p.pendingWrites);
      ok(JSON.stringify(levels(roots, 4)) === "[]" && levels(roots, 3).includes("undated 9"), "⭐⭐ …and no dockyard is made from nothing: state 3 holds its own 2 and the 7 the Save carried", { three: levels(roots, 3), four: levels(roots, 4), answers });
    }
  }
  {
    // the erase brush, the other click that takes a staged move back out, with state 4's panel saved between
    const p = page(CSV_COAST);
    if (!p.liftError && STAGE) {
      p.doMoveProvince(12, 4, 3);
      panelWrite(p, 4, 8, typeManpower);
      ok(p.eraseProvinceLocal(12) === false && /^🚫 Erasing province 12 would undo/.test(p.eraseHeld.get(12)) && moves(p, 12).length === 1, "⭐⭐ painted, its state edited, then erased unsaved: the erase is refused, in words the stroke's end says", p.eraseHeld.get(12));
    }
  }
  {
    // controls: what is not a paint back of a coast that took dockyards keeps both moves, as before
    const p = page(CSV_COAST);
    if (!p.liftError) {
      p.doMoveProvince(8, 4, 2);
      p.doMoveProvince(8, 2, 4);
      ok(moves(p, 8).length === 2, "(8, inland, painted out and back: its two moves stay queued — no dockyard went with it)", moves(p, 8).map((x) => x.body));
    }
    const q = page(CSV_COAST);
    if (!q.liftError) {
      q.doMoveProvince(12, 4, 3);
      q.doMoveProvince(12, 3, 2);
      ok(moves(q, 12).length === 2 && JSON.stringify(copy(q)) === JSON.stringify({ S3: 9, S4: 0 }) && !/is back in/.test(q.status), "(12 painted on into state 2, not back: the first paint stays, and the dockyards stay in state 3, where the coast went with it)", { moves: moves(q, 12).map((x) => x.body), copy: copy(q), status: q.status });
    }
  }
}

console.log("\n=== 7. Delete state counts every moment of the dockyards it takes, as the carry reads them (review of the coast rows, CR-R4) ===");
// Delete state removes the state's file, its dated blocks with it, and its confirm counted only the undated `buildings` the page holds:
// the base game's 360-Pennsylvania said 7 where 7, and from 1939 8, go, and 517-Victoria (a 1939 `dockyard = 1`, none undated) said
// nothing. The model now gives each state its dated naval-only levels (navalDated, read with stateLevelsOfHistory, as the carry reads a
// state), the page counts both (stateNavalLevels, navalLevelsWords) and keeps the dated ones in step with what the carry writes
// (navalDatedAfterCarry: the two summed at every moment either sets one) at the click, at the Save, and when a dropped paint is put back.
// Five shapes of the two states' levels, each moved through the server's moveProvince on one copy and through the page's doMoveProvince
// on the model of another, must agree; and so must the page's reading and the carry's of every state of the base game.
let skipped = 0;
{
  if (NAVAL_HELPERS_ERROR) ok(false, "⭐ the page has stateNavalLevels, navalLevelsWords, navalDatedAfterCarry and giveNavalDated", NAVAL_HELPERS_ERROR);
  const H = {};
  try { vm.runInNewContext(`var NAVAL_ONLY_STATE_KEYS = ${JSON.stringify(md.NAVAL_ONLY_STATE_BUILDINGS)};\n${NAVAL_HELPERS}\nthis.levels = stateNavalLevels;`, H); }
  catch (e) { ok(false, "(the page's helpers run)", e.message); }
  const levelsOf = (s) => { try { return H.levels(s); } catch (_) { return []; } };
  const asText = (L) => L.filter((l) => l.level > 0 || l.date).map((l) => `${l.date || "undated"} ${l.level}`).sort();
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // the page's two Delete state lines, run as the page has them
  const map = stripJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8").replace(/\r\n/g, "\n"));
  const at = map.indexOf('$("miDeleteBtn").addEventListener("click"');
  const leave = at < 0 ? -1 : map.indexOf("Deleting it will leave them in NO state", at);
  const del = leave < 0 ? "" : map.slice(at, map.indexOf("Delete anyway?", leave) + 40);
  const lines = del.match(/\n\s*const yards = [^\n]*\n\s*const yardWords = [^\n]*/);
  const deleteWords = (s) => {
    if (!lines) return null;
    try { return vm.runInNewContext(`var NAVAL_ONLY_STATE_KEYS = ${JSON.stringify(md.NAVAL_ONLY_STATE_BUILDINGS)};\n${NAVAL_HELPERS}` + lines[0] + "\n[yardWords]", { sid: s.id, st: s })[0]; }
    catch (e) { return "ERR " + e.message; }
  };
  const stOf = (m, id) => (m.states || []).find((s) => s.id === id) || {};

  // the model, as /api/map/model gives it
  const roots = makeMod("cr-r4-model");
  const m0 = md.buildMapModel({ ...roots, cacheStableLayers: false });
  ok(same(stOf(m0, 4).navalDated, [{ date: "1939.1.1", key: "dockyard", level: 8 }]) && same(stOf(m0, 3).navalDated, [{ date: "1939.1.1", key: "dockyard", level: 3 }]) && !("navalDated" in stOf(m0, 1)),
    "⭐ the model gives each state its dated dockyards (state 4: 8 from 1939; 3: 3) and none to a state that holds none", { s4: stOf(m0, 4).navalDated, s3: stOf(m0, 3).navalDated, s1: stOf(m0, 1).navalDated });
  ok(same(asText(levelsOf(stOf(m0, 4))), levels(roots, 4)) && same(asText(levelsOf(stOf(m0, 3))), levels(roots, 3)),
    "⭐ the page reads both states' levels as their files hold them", { page4: asText(levelsOf(stOf(m0, 4))), file4: levels(roots, 4) });
  const w4 = deleteWords(stOf(m0, 4));
  ok(typeof w4 === "string" && /Its 7 dockyards \(8 from 1939\.1\.1\) go with it, unless its provinces are moved out first: the last of its coast to leave takes them along\./.test(w4),
    "⭐⭐ Delete state says every moment of the dockyards it takes: 7, and 8 from 1939", w4);
  const wv = deleteWords({ id: 4, provinces: [12], buildings: { infrastructure: 3 }, navalDated: [{ date: "1939.1.1", key: "dockyard", level: 1 }] });
  ok(typeof wv === "string" && /Its 1 dockyard from 1939\.1\.1 goes with it/.test(wv) && /takes it along/.test(wv), "⭐⭐ …and a dockyard that exists from 1939 alone, which it did not mention at all", wv);
  ok(deleteWords({ id: -1, provinces: [12], buildings: { dockyard: 7 }, navalDated: [{ date: "1939.1.1", key: "dockyard", level: 8 }] }) === "", "(a new state not saved yet still says nothing: Delete discards it, and its moves give them back)");
  // the shapes the corpus ships: the base game's 911-Fyn writes `dockyard = 1` and, from 1939, 1 (one dockyard, in both moments); Rise of Nations'
  // 989-Liguria 1 and, from 1939, 3. A dated 0 ends the level before it, and is no dockyard to say.
  const wSame = deleteWords({ id: 4, provinces: [12], buildings: { dockyard: 1 }, navalDated: [{ date: "1939.1.1", key: "dockyard", level: 1 }] });
  ok(typeof wSame === "string" && /Its 1 dockyard goes with it/.test(wSame) && /takes it along/.test(wSame), "⭐ a moment that repeats the level before it is not said: 1 dockyard, not \"1 dockyard (1 from 1939.1.1)\", which reads as two", wSame);
  const wMore = deleteWords({ id: 4, provinces: [12], buildings: { dockyard: 1 }, navalDated: [{ date: "1939.1.1", key: "dockyard", level: 3 }] });
  ok(typeof wMore === "string" && /Its 1 dockyard \(3 from 1939\.1\.1\) goes with it/.test(wMore), "⭐ …and one dockyard that becomes three reads as its subject: \"Its 1 dockyard (3 from 1939.1.1) goes\"", wMore);
  const wBack = deleteWords({ id: 4, provinces: [12], buildings: { dockyard: 3 }, navalDated: [{ date: "1939.1.1", key: "dockyard", level: 0 }, { date: "1941.1.1", key: "dockyard", level: 3 }] });
  ok(typeof wBack === "string" && /Its 3 dockyards \(3 from 1941\.1\.1\) go with it/.test(wBack), "(a dated 0 is not said, and what comes back after it is)", wBack);
  ok(deleteWords({ id: 4, provinces: [12], buildings: {}, navalDated: [{ date: "1939.1.1", key: "dockyard", level: 0 }] }) === "", "(a dated 0 alone is no dockyard to say)");

  // the base game, read only: every state's levels as the page reads its model, against the carry's own reading of the file
  const dir = path.join("D:/SteamLibrary/steamapps/common/Hearts of Iron IV", "history", "states");
  if (!fs.existsSync(dir)) { skipped++; console.log("  SKIP the base game's states: not installed"); }
  else {
    let n = 0, withDated = 0, datedOnly = 0;
    const off = [], unsaid = [];
    for (const f of fs.readdirSync(dir).filter((x) => /\.txt$/i.test(x))) {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      const parsed = md.parseStatesText(text);
      if (parsed.length !== 1) continue;
      const s = parsed[0], carry = md.navalStateLevelsOf(text).map((l) => ({ date: l.date, key: l.key, level: l.level }));
      n++;
      if (!same(levelsOf(s).filter((l) => l.level > 0), carry)) off.push(f);
      if (!carry.some((l) => l.date)) continue;
      withDated++;
      if (!carry.some((l) => !l.date)) datedOnly++;
      const w = deleteWords({ ...s, provinces: (s.provinces || []).length ? s.provinces : [1] }) || "";
      // (a moment repeating the level before it holds the same dockyards: 4 of the base game's, 911-Fyn among them, and it is not said)
      const needed = carry.filter((l, k) => !l.date || !k || carry[k - 1].level !== l.level);
      if (!needed.every((l) => (l.date ? w.includes(`${l.level} from ${l.date}`) || w.includes(`${l.level} dockyard${l.level === 1 ? "" : "s"} from ${l.date}`) : w.includes(`Its ${l.level} dockyard`)))) unsaid.push(`${f}: ${w}`);
      if (carry.some((l, k) => l.date && k && carry[k - 1].level === l.level && w.includes(`from ${l.date}`))) unsaid.push(`${f} says a moment that repeats the level before it: ${w}`);
    }
    ok(n > 900 && off.length === 0 && withDated > 0 && datedOnly > 0, `⭐⭐ every one of the base game's ${n} states: the page reads its levels as the carry reads its file (${withDated} hold dated dockyards, ${datedOnly} of them dated ones alone)`, off.slice(0, 5));
    ok(unsaid.length === 0, `⭐ …and Delete state says every moment of each of the ${withDated}`, unsaid.slice(0, 3));
  }

  // a state whose only buildings block is dated, its `buildings` read from that block (buildingsDated; Rise of Nations' 607-China 7 has the
  // shape, and no installed map has one holding a dockyard): every moment is one moment, not taken twice
  {
    const text = 'state = {\n\tid = 4\n\tname = "S"\n\tprovinces = { 12 }\n\thistory = {\n\t\towner = AAA\n\t\t1939.1.1 = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = 3\n\t\t\t}\n\t\t}\n\t}\n}\n';
    const s = md.parseStatesText(text)[0];
    ok(s.buildingsDated === true && s.buildings.dockyard === 3 && same(levelsOf(s), md.navalStateLevelsOf(text).map((l) => ({ date: l.date, key: l.key, level: l.level }))),
      "⭐ a state whose only buildings block is dated: the page reads its one moment as the carry reads it, not twice", { levels: levelsOf(s), buildings: s.buildings });
    const w = deleteWords(s);
    ok(typeof w === "string" && w.includes("Its 3 dockyards from 1939.1.1 go with it"), "⭐ …and Delete state says that one moment", w);
    const B = {};
    try { vm.runInNewContext(`var NAVAL_ONLY_STATE_KEYS = ${JSON.stringify(md.NAVAL_ONLY_STATE_BUILDINGS)};\n${lift("function coastDockyardsThatGo(")}\nthis.go = coastDockyardsThatGo;`, B); }
    catch (e) { ok(false, "(coastDockyardsThatGo runs)", e.message); B.go = () => []; }
    const y = B.go(12, [{ ...s, provinces: [] }], () => true);
    ok(y.length === 1 && y[0].keys.dockyard === 3 && !y[0].dated, "⭐ …and a state paint of its last coast gives its levels once, as the click always moved that block's", y.map((x) => ({ keys: x.keys, dated: x.dated })));
  }

  // the click, the Save and the put-back, on five shapes of the two states' levels, against the server's own carry
  const H3 =(u, dated) => `\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n${u ? `\t\t\tdockyard = ${u}\n` : ""}\t\t}\n` + dated.map(([d, l]) => `\t\t${d} = {\n\t\t\tbuildings = {\n\t\t\t\tdockyard = ${l}\n\t\t\t}\n\t\t}\n`).join("");
  const SHAPES = [
    { name: "both dated", history: HISTORY, says: "its 7 dockyards (8 from 1939.1.1) go with it to S3", gone: "Its 9 dockyards (11 from 1939.1.1) go with it" },
    { name: "the giver dated", history: { 4: HISTORY[4], 3: H3(2, []) }, says: "its 7 dockyards (8 from 1939.1.1) go with it to S3", gone: "Its 9 dockyards (10 from 1939.1.1) go with it" },
    { name: "the taker dated", history: { 3: HISTORY[3], 4: H3(7, []) }, says: "its 7 dockyards go with it to S3", gone: "Its 9 dockyards (10 from 1939.1.1) go with it" },
    { name: "the giver's from 1939 alone (517-Victoria's shape)", history: { 3: HISTORY[3], 4: H3(0, [["1939.1.1", 1]]) }, says: "its 1 dockyard from 1939.1.1 goes with it to S3", gone: "Its 2 dockyards (4 from 1939.1.1) go with it" },
    { name: "a moment of each", history: { 3: H3(1, [["1938.6.1", 4]]), 4: H3(2, [["1940.1.1", 5]]) }, says: "its 2 dockyards (5 from 1940.1.1) go with it to S3", gone: "Its 3 dockyards (6 from 1938.6.1, 9 from 1940.1.1) go with it" },
  ];
  SHAPES.forEach((sh, i) => {
    const server = makeMod(`cr-r4-shape-${i}`, { history: sh.history });
    const model = md.buildMapModel({ ...server, cacheStableLayers: false });
    const before = { 3: levels(server, 3), 4: levels(server, 4) };
    const mv = md.moveProvince({ ...server, provinceId: 12, toStateId: 3 });
    const after = { 3: levels(server, 3), 4: levels(server, 4) };
    ok(!!mv && mv.changed && Array.isArray(mv.navalCarried) && mv.navalCarried.length === 1 && after[4].length === 0, `(${sh.name}: the server's state paint of 12 carries state 4's dockyards to 3: ${after[3].join(", ")})`, { mv: mv && mv.navalCarried, after });
    const p = page(CSV_COAST, { model });
    if (p.liftError) { ok(false, `${sh.name}: the page's doMoveProvince runs`, p.liftError); return; }
    p.doMoveProvince(12, 4, 3);
    const pg = (q, sid) => asText(levelsOf(q.stateById.get(sid)));
    ok(same(pg(p, 3), after[3]) && same(pg(p, 4), after[4]), `⭐⭐ ${sh.name}: the click leaves the page's copy holding what the Save's carry writes`, { page3: pg(p, 3), file3: after[3], page4: pg(p, 4), file4: after[4] });
    ok(p.status.includes(`⚓ Province 12 was S4's last coast: ${sh.says}`), `⭐ ${sh.name}: …says it at the click: "${sh.says}"`, p.status);
    const w3 = deleteWords(p.stateById.get(3));
    ok(typeof w3 === "string" && w3.includes(sh.gone), `⭐⭐ ${sh.name}: …and Delete state on state 3 then says "${sh.gone}"`, w3);
    // the Save's carry, on a page whose click did not mirror it
    const q = page(CSV_COAST, { model });
    if (!q.liftError) {
      q.reconcileNavalCarry(3, [], mv.navalCarried, (id) => q.stateById.get(id));
      ok(same(pg(q, 3), after[3]) && same(pg(q, 4), after[4]), `⭐ ${sh.name}: the Save's carry, which the click did not mirror, leaves the page's copy the same`, { page3: pg(q, 3), file3: after[3], page4: pg(q, 4) });
    }
    // the paint dropped unsaved (the erase brush): the page's copy is the files' again
    const erased = p.eraseProvinceLocal(12);
    ok(erased === true && same(pg(p, 3), before[3]) && same(pg(p, 4), before[4]), `⭐ ${sh.name}: …and erasing 12 before the Save puts both states' copies back as the files hold them`, { page3: pg(p, 3), file3: before[3], page4: pg(p, 4), file4: before[4] });
    // ⛔ the merge: mergeState sums every moment as the carry does (stateHistoryToCarry), the page keeps the kept state and goes on showing it
    // with no reload, and its click mirrored only the undated levels, so Delete state on it then said less than goes
    const merged = makeMod(`cr-r4-merge-${i}`, { history: sh.history });
    const mg = md.mergeState({ ...merged, sourceStateId: 4, targetStateId: 3 });
    ok(!!mg && mg.changed !== false && !mg.error && same(levels(merged, 3), after[3]), `(${sh.name}: the server's merge of 4 into 3 leaves state 3 holding the same: ${levels(merged, 3).join(", ")})`, { error: mg && mg.error, file3: levels(merged, 3), carry: after[3] });
    const r = page(CSV_COAST, { model });
    if (r.liftError) { ok(false, `${sh.name}: the page's doMergeState runs`, r.liftError); return; }
    r.doMergeState(4, 3);
    ok(r.pendingWrites.some((w) => w.url === "/api/map/merge-state") && !r.stateById.has(4), `(${sh.name}: the merge click queued the merge and took state 4 off the page)`, r.status);
    ok(same(pg(r, 3), levels(merged, 3)), `⭐⭐ ${sh.name}: the merge click leaves the kept state's copy holding what the merge writes`, { page3: pg(r, 3), file3: levels(merged, 3) });
    const wm = deleteWords(r.stateById.get(3));
    ok(typeof wm === "string" && wm.includes(sh.gone), `⭐⭐ ${sh.name}: …and Delete state on the kept state then says "${sh.gone}"`, wm);
  });
  const flush = map.slice(map.indexOf("async function flushMapSaves("), map.indexOf("async function flushMapSaves(") + 60000);
  ok(/w\.meta\.yards\.map\(\(y\) => \(\{ from: remap\(y\.from\), keys: y\.keys, \.\.\.\(y\.dated \? \{ dated: y\.dated \} : \{\}\) \}\)\)/.test(flush), "(the Save hands reconcileNavalCarry the dated moments the click moved, with the rest of what it mirrored)", null);
}

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} SKIPPED (not counted as passes)` : ""}`);
try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
process.exit(fail ? 1 : 0);
