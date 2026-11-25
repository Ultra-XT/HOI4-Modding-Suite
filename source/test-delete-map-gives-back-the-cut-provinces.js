// ⛔ #delete-map-gives-back-the-cut — DELETE MAP GIVES BACK THE PROVINCES AN EARLIER GENERATE LAND CUT.
//
// Generate land cuts its raised ocean provinces into land-sized pieces, as many as Nova's border budget allows
// (#a-raised-province-is-cut-to-land-size). Delete map only retyped rows, so every piece stayed on the map as a small sea province
// and kept its borders: on the owner's flow the next Generate land on the same mod — a re-roll — was allowed no new province, and
// the ocean-sized provinces came back whole (the plan's critic, P1). Delete map now folds every family in Nova's record back into
// its parent. Pinned on testlib-split-world.js's world, each against a twin whose clicks never cut (splitLargeProvinces: false):
//   1. the owner's re-roll: Generate land → Delete map → Generate land (seed 2). After Delete map, definition.csv, every region and
//      provinces.bmp are the never-cut twin's (the bitmap but for the pixels the cut's X pass moved between two parents); unitstacks
//      lost exactly the pieces' rows; the mod's own order of battle names the parent where it named a piece, its comments untouched;
//      no folded id is named anywhere in the mod; Delete map's snapshot holds definition.csv and provinces.bmp as they were before the
//      click; and the second click cuts from the same borders, with the same budget, into as many new ids as the twin's second click,
//      numbered on from the first click's last id before the cut. A mod Nova never cut reads nothing past the record, writes nothing;
//   2. the adjacency rows the cut carried — walls between two families, a crossing's end re-homed — fold back: the file the cut made
//      holds the layer below's bytes again (and is not deleted);
//   3. a family that cannot fold (a piece the modder made a lake) stops the fold THERE: everything above it folds, nothing below,
//      and the ids left run 0..max with no gap;
//   4. a record that does not describe the map (a piece that does not reach its recorded parent: 🛟 Restore baseline puts an older
//      map back and leaves the record) folds nothing, and the map is the one a Delete map with no record leaves;
//   5. a fold that cannot write a region puts every file back over itself, and the record stays as it was;
//   6. a record from before this change, of a re-roll that never folded (a click that cut a piece of the click before): every pixel
//      ends on the province its piece was cut from, through every family, and no folded id is left;
//   7. the "P Q / Q P" corner the plan feared — pieces of two parents meeting at a corner — folds into two provinces on a diagonal,
//      which is not an X-crossing: a fold only renames ids, and a rename cannot part a 2 × 2 block's ids;
//   8. the page says it (provinceFoldNote, lifted out of public/map.js), the Save handler asks for it on every answer that has one
//      (its condition read out of the page), and Generate land no longer says Delete map keeps the cuts;
//   9. through the real endpoints and the page's own 💾 Save (flushMapSaves posts the one write Delete map queues): the victory-point
//      names Nova wrote for the pieces go from Nova's own state-names files, a name in the modder's own localisation stays, and is
//      counted, and the fold's note is handed to the status line with the write's other notes; the page's own map is reloaded from
//      the disk after the check (load() and buildFromImage, lifted and run), so 🌍 Generate land's 35% is 35% of the sea the fold left
//      — it counted the pieces too, and raised 52.8% of the ocean on the owner's world — and the gate's line, the fold's ⚠ note on it
//      though three notes stand ahead of it, is the one left on screen;
//  10. every reason provinceFoldPlan stops for, one family each (the modder's row on top, pieces not one run, a piece named twice, a
//      parent above its pieces, a colour shared with a row outside the family, a piece in another region): nothing of it folds;
//  11. a province the modder drew after the cut, on the row after the last, through Delete map: the fold stops at once, the row and its
//      pixels stay, and the map is the one a Delete map with no record leaves;
//  12. a fold that stopped (sections 3 and 4's answers), through the page's own Save and gate, both branches: its ⚠ note is on the line.
// Every expected id, row and pixel is derived from the record and the files as written. Binds no fixed port (listen(0)).
// Run: node test-delete-map-gives-back-the-cut-provinces.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fold-back-"));
// BEFORE map-data.js loads: app data, ~/.nova (the split record and Delete map's snapshots live there) and the mods root are this test's
process.env.APPDATA = path.join(ROOT, "appdata");
process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
process.env.HOI4_MODS_ROOT = path.join(ROOT, "mods");
for (const d of [process.env.APPDATA, process.env.NOVA_HOME_DIR, process.env.HOI4_MODS_ROOT]) fs.mkdirSync(d, { recursive: true });
const md = require("./map-data.js");
const SW = require("./testlib-split-world.js");
const PAGE = require("./testlib-map-page.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 600)));
  if (!cond) fails.push(label);
};
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");
const shaOf = (p) => (fs.existsSync(p) ? sha(fs.readFileSync(p)) : "absent");
/** every file under a folder → Map(relative path → sha1) */
function tree(dir) {
  const out = new Map();
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.set(path.relative(dir, p).replace(/\\/g, "/"), sha(fs.readFileSync(p))); } };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}
const treeDiff = (a, b) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort();
const defOf = (mod) => SW.readDef(path.join(mod, "map", "definition.csv"));
const maxRow = (mod) => Math.max(...defOf(mod).ids);
const noGap = (mod) => { const ids = defOf(mod).ids; return ids.every((id, i) => id === i); };
const bmpIds = (mod, def) => SW.decode(path.join(mod, "map", "provinces.bmp"), def || defOf(mod)).ids;
/** The families Nova cut, resolved the test's own way: each piece → the province it ends in, through every family (a parent that is a
 *  piece of another family's resolves on). */
function rootsOf(record) {
  const parentOf = new Map();
  for (const f of record.families) for (const q of f.pieces) parentOf.set(q, f.parent);
  const root = new Map();
  for (const q of parentOf.keys()) { let r = parentOf.get(q); while (parentOf.has(r)) r = parentOf.get(r); root.set(q, r); }
  return root;
}
/** Every whole-number token in every text file of the mod (comments masked) and every VICTORY_POINTS_<id> key, that is one of `ids`:
 *  Map(file → count). The list of files is the mod's own, walked — never typed in. */
function namesOf(mod, ids) {
  const out = new Map();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(txt|csv|yml)$/i.test(e.name)) continue;
      let t = fs.readFileSync(p, "latin1");
      if (!/\.csv$/i.test(e.name)) t = t.replace(/#[^\r\n]*/g, (m) => " ".repeat(m.length));
      let n = 0;
      for (const m of t.matchAll(/(?<![0-9A-Za-z_.])(\d+)(?![0-9.])/g)) if (ids.has(+m[1])) n++;
      for (const m of t.matchAll(/VICTORY_POINTS_(\d+)/g)) if (ids.has(+m[1])) n++;
      if (n) out.set(path.relative(mod, p).replace(/\\/g, "/"), n);
    }
  };
  walk(mod);
  return out;
}
const range = (lo, hi) => { const s = new Set(); for (let i = lo; i <= hi; i++) s.add(i); return s; };
/** unitstacks.txt's lines, as written */
const stackLines = (mod) => { const p = path.join(mod, "map", "unitstacks.txt"); return fs.existsSync(p) ? fs.readFileSync(p, "latin1").split("\n") : []; };
const stackOf = (ln) => { const m = /^\s*(\d+)\s*;/.exec(ln); return m ? +m[1] : -1; };
const readOnly = [];

const SEED = 1, W = SW.W, H = SW.H;
const S = SW.makeShapes();
// every land province of the layer below has its Standstill, so the cut's pieces get unit rows of their own (B2) for the fold to take back
const landStands = new Map();
{
  const sum = new Map();
  for (let i = 0; i < W * H; i++) { const p = S.gameIds[i]; if (S.typeOf(p) !== "land") continue; const e = sum.get(p) || [0, 0, 0]; e[0] += i % W; e[1] += Math.floor(i / W); e[2]++; sum.set(p, e); }
  for (const [p, e] of sum) landStands.set(p, [e[0] / e[2] + 0.5, H - 1 - e[1] / e[2] + 0.5]);
}
const game = path.join(ROOT, "game");
SW.makeGame(game, S, { unitstacks: landStands });
const COUNT = Math.max(1, Math.round(S.N * 35 / 100));
const mk = (name, o = {}) => SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, name), S, Object.assign({ name: "fold back" }, o));
const gen = (m, extra = {}, gameRoot = game) => md.generateLand(Object.assign({ modRoot: m, gameRoot, dependencyRoots: [], count: COUNT, seed: SEED, ownerMode: "inherit", owner: "" }, extra));
const blank = (m, gameRoot = game) => md.blankMapToSea({ modRoot: m, gameRoot, dependencyRoots: [] });
/** a Delete map with no record to fold: the record set aside while it runs (this test's own temp folder) and put back after */
function blankUnfolded(m, gameRoot = game) {
  const p = md.provinceSplitRecordPath(m), had = fs.existsSync(p);
  if (had) fs.renameSync(p, p + ".aside");
  try { return blank(m, gameRoot); } finally { if (had) fs.renameSync(p + ".aside", p); }
}
let note = null, splitNote = null;
try { const sb = PAGE.runPage(["function provinceFoldNote(", "function generatedProvinceSplitNote("]).sb; note = sb.provinceFoldNote; splitNote = sb.generatedProvinceSplitNote; } catch (e) { console.log("  (lift failed: " + e.message + ")"); }
// …and two of the page's own statement runs, lifted out of public/map.js and run: blankMapLocal's flip of every land province to sea,
// and the count 🌍 Generate land's confirm sends for its slider's share of the ocean
const pageLines = (from, to, args, ret) => {
  const s = PAGE.MASKED.indexOf(from), e = s < 0 ? -1 : PAGE.MASKED.indexOf(to, s);
  if (s < 0 || e < 0) throw new Error(`public/map.js has no "${from}" … "${to}"`);
  return new Function(...args, PAGE.MAP.slice(s, e) + `\nreturn ${ret};`);
};
let flipToSea = null, genCount = null;
try { flipToSea = pageLines("let flipped = 0;", "provinceToOwner = {};", ["provinceType", "provinceDef"], "flipped"); } catch (e) { console.log("  (lift failed: " + e.message + ")"); }
try { genCount = pageLines("let seaCount = 0;", "const ownerTag = ", ["provinceType", "pct"], "count"); } catch (e) { console.log("  (lift failed: " + e.message + ")"); }
const said = {};

(async () => {
try {
  console.log("\n-- 1. the owner's re-roll: Generate land, Delete map, Generate land again --");
  const A = mk("reroll"), T = mk("reroll-twin");
  const a1 = gen(A), t1 = gen(T, { splitLargeProvinces: false });
  const recA = md.readProvinceSplitRecord(A), max1 = maxRow(A), folded = range(S.N + 1, max1), rootA = rootsOf(recA);
  rec("(control: the click cut, every new id from the mod's last + 1 is recorded under a parent, and the twin's did not cut)",
    a1.provinceSplit.changed === true && a1.provinceSplit.newIds > 0 && max1 === S.N + a1.provinceSplit.newIds && rootA.size === a1.provinceSplit.newIds
    && [...folded].every((q) => rootA.has(q)) && t1.provinceSplit.changed === false && maxRow(T) === S.N, { cut: a1.provinceSplit.newIds, max1, recorded: rootA.size });
  const usBefore = stackLines(A);
  rec("(control: the pieces were given unit rows of their own)", usBefore.some((ln) => folded.has(stackOf(ln))), usBefore.length);
  // the mod's own order of battle stands a fleet and a division on a piece — and a line the modder commented out names one too
  const piece = Math.max(...folded), parentOfPiece = rootA.get(piece);
  const oob = (base, div) => `units = {\r\n\tfleet = {\r\n\t\tname = "Home Fleet"\r\n\t\tnaval_base = ${base}\r\n\t\ttask_force = {\r\n\t\t\tname = "TF"\r\n\t\t\tlocation = ${base}\r\n\t\t}\r\n\t}\r\n`
    + `\tdivision = {\r\n\t\tname = "D1"\r\n\t\tlocation = ${div}\t# location = ${piece} before the re-roll\r\n\t\tdivision_template = "Inf"\r\n\t}\r\n}\r\n`;
  SW.write(A, "history/units/ZZZ_fold.txt", oob(piece, piece));
  SW.write(T, "history/units/ZZZ_fold.txt", oob(parentOfPiece, parentOfPiece));
  // every place the mod's own orders of battle name a piece — the test's own count, comments masked
  const unitPlaces = (mod) => {
    let n = 0;
    const dir = path.join(mod, "history", "units");
    for (const u of fs.existsSync(dir) ? fs.readdirSync(dir) : []) for (const m of fs.readFileSync(path.join(dir, u), "utf8").replace(/#[^\r\n]*/g, "").matchAll(/\b(?:location|naval_base)\s*=\s*(\d+)/g)) if (folded.has(+m[1])) n++;
    return n;
  };
  const placesBefore = unitPlaces(A);
  // the record of the land Nova drew rivers on names the click's pieces (generateLand hands generateRivers its picked list, the pieces
  // pushed onto it); where this small world drew no river, the record is given a piece the way generateRivers would add it
  const riversRec = (mod) => { try { return JSON.parse(fs.readFileSync(md.generatedRiversRecordPath(mod), "utf8")).provinces; } catch (_) { return null; } };
  if (!(riversRec(A) || []).some((q) => folded.has(q))) md.recordGeneratedRivers({ modRoot: A, provinceIds: [piece, parentOfPiece] });
  const riversBefore = riversRec(A) || [];
  const riversWant = [...new Set(riversBefore.map((q) => (rootA.has(q) ? rootA.get(q) : q)))].sort((x, y) => x - y);
  const defA0 =fs.readFileSync(path.join(A, "map", "definition.csv")), bmpA0 = fs.readFileSync(path.join(A, "map", "provinces.bmp"));
  const t0 = Date.now(), bA = blank(A), msA = Date.now() - t0, bT = blank(T);
  const f = bA.provinceFold || {};
  said.fold = bA; said.none = bT;
  rec("⭐ Delete map folded every family back: as many provinces as the cut made, the ids past the mod's last before it",
    f.changed === true && f.families === recA.families.length && f.provinces === a1.provinceSplit.newIds && f.from === S.N + 1 && f.to === max1 && f.left === 0 && !f.stopped, f);
  rec("⭐ a mod Nova never cut: nothing is read past the record and nothing is written for it", JSON.stringify(bT.provinceFold) === JSON.stringify({ changed: false }) && !fs.existsSync(md.provinceSplitRecordPath(T)), bT.provinceFold);
  const dA = defOf(A);
  rec("⭐⭐ definition.csv ends at the mod's last id before the cut — byte for byte the never-cut twin's",
    maxRow(A) === recA.definitionMaxBefore && recA.definitionMaxBefore === S.N && noGap(A) && shaOf(path.join(A, "map", "definition.csv")) === shaOf(path.join(T, "map", "definition.csv")), { max: maxRow(A), before: recA.definitionMaxBefore });
  {
    const ia = bmpIds(A, dA), it = bmpIds(T, dA);
    let diff = 0, strange = 0;
    for (let i = 0; i < ia.length; i++) if (ia[i] !== it[i]) { diff++; if (ia[i] < 0 || it[i] < 0) strange++; }
    rec("⭐⭐ provinces.bmp is the never-cut twin's, but for the pixels the cut's X pass moved between two parents",
      diff === (a1.provinceSplit.movedBetweenParents || 0) && strange === 0 && (diff > 0 || shaOf(path.join(A, "map", "provinces.bmp")) === shaOf(path.join(T, "map", "provinces.bmp"))),
      { diff, moved: a1.provinceSplit.movedBetweenParents, strange });
  }
  {
    // the region file that LOADS at each name: the mod's own, else the layer below's — the cut copied the regions its pieces joined into
    // the mod, and the twin, which cut nothing, still loads them from below
    const loads = (mod, name) => { const own = path.join(mod, "map", "strategicregions", name); return fs.existsSync(own) ? own : path.join(game, "map", "strategicregions", name); };
    const names = [...new Set([A, T, game].flatMap((r) => { const d = path.join(r, "map", "strategicregions"); return fs.existsSync(d) ? fs.readdirSync(d) : []; }))].sort();
    const differ = names.filter((nm) => shaOf(loads(A, nm)) !== shaOf(loads(T, nm)));
    const madeByCut = [...tree(path.join(A, "map", "strategicregions")).keys()].filter((nm) => !fs.existsSync(path.join(T, "map", "strategicregions", nm)) && fs.existsSync(path.join(game, "map", "strategicregions", nm)));
    rec("⭐⭐ every strategic region that loads is the never-cut twin's, byte for byte — the files the cut copied in hold the layer below's bytes again, and are not deleted",
      differ.length === 0 && madeByCut.length > 0 && madeByCut.every((nm) => fs.existsSync(path.join(A, "map", "strategicregions", nm))), { differ: differ.slice(0, 6), madeByCut });
  }
  rec("⭐ the record keeps no family, and keeps the mod's last id before the cut", md.readProvinceSplitRecord(A).families.length === 0 && md.readProvinceSplitRecord(A).definitionMaxBefore === S.N);
  {
    const want = usBefore.filter((ln) => !folded.has(stackOf(ln))), got = stackLines(A);
    rec("⭐ unitstacks.txt lost exactly the pieces' rows, and every other line is as it was", JSON.stringify(got) === JSON.stringify(want) && f.unitRows === usBefore.length - want.length && f.unitRows > 0,
      { rows: f.unitRows, before: usBefore.length, after: got.length });
  }
  rec("⭐⭐ the mod's own order of battle names the province the piece was cut from — a fleet's base, its task force's place, a division's — and the comment is the modder's, untouched",
    shaOf(path.join(A, "history", "units", "ZZZ_fold.txt")) === shaOf(path.join(T, "history", "units", "ZZZ_fold.txt")) && placesBefore >= 3 && f.units.moved === placesBefore && unitPlaces(A) === 0 && f.units.files.includes("ZZZ_fold.txt"),
    { units: f.units, placesBefore, left: unitPlaces(A) });
  {
    const left = namesOf(A, folded);
    rec("⭐⭐⭐ no folded id is named anywhere in the mod (every text file of it, comments aside)", left.size === 0, [...left].slice(0, 8));
  }
  rec("⭐ the record of the land Nova drew rivers on names the province each piece was cut from, never a folded id (else the next Generate land learns its rivers from the old world on a new province that reuses the id)",
    riversBefore.some((q) => folded.has(q)) && JSON.stringify(riversRec(A)) === JSON.stringify(riversWant) && (f.rivers || {}).rehomed === riversBefore.filter((q) => folded.has(q)).length,
    { before: riversBefore.filter((q) => folded.has(q)).length, after: (riversRec(A) || []).filter((q) => folded.has(q)).length, report: f.rivers });
  {
    const snap = bA.snapshotPath;
    rec("⭐ Delete map's snapshot holds definition.csv and provinces.bmp as they were BEFORE the click (a second copy would hold the retype)",
      !!snap && shaOf(path.join(snap, "map", "definition.csv")) === sha(defA0) && shaOf(path.join(snap, "map", "provinces.bmp")) === sha(bmpA0) && bA.overwriteSnapshotFailed === 0,
      { snap, def: shaOf(path.join(snap || "", "map", "definition.csv")) === sha(defA0), bmp: shaOf(path.join(snap || "", "map", "provinces.bmp")) === sha(bmpA0) });
    const copies = fs.readdirSync(path.dirname(md.provinceSplitRecordPath(A))).filter((n) => /before-delete-map/.test(n));
    rec("…and a copy of the record as it was stands beside it", copies.length === 1 && JSON.stringify(JSON.parse(fs.readFileSync(path.join(path.dirname(md.provinceSplitRecordPath(A)), copies[0]), "utf8")).families) === JSON.stringify(recA.families), copies);
  }
  // the second click, on both
  const a2 = gen(A, { seed: 2 }), t2 = gen(T, { seed: 2 });
  const s2 = a2.provinceSplit || {}, s2t = t2.provinceSplit || {};
  rec("⭐⭐⭐ the second click cuts as the never-cut twin's second click: from the same borders, the same budget, as many new ids — and no earlier cut counts",
    s2.changed === true && s2.target.earlierPieces === 0 && s2.target.segmentsBefore === s2t.target.segmentsBefore && s2.target.allowed === s2t.target.allowed && s2.newIds === s2t.newIds,
    { reroll: s2.target && { seg: s2.target.segmentsBefore, allowed: s2.target.allowed, earlier: s2.target.earlierPieces, newIds: s2.newIds }, twin: s2t.target && { seg: s2t.target.segmentsBefore, allowed: s2t.target.allowed, newIds: s2t.newIds } });
  rec("⭐⭐ …with the first click's budget, and its new ids numbered on from the mod's last id before the first cut, with no gap",
    s2.target.allowed === a1.provinceSplit.target.allowed && maxRow(A) === S.N + s2.newIds && noGap(A) && Math.min(...md.readProvinceSplitRecord(A).families.flatMap((x) => x.pieces)) === S.N + 1,
    { allowed: [a1.provinceSplit.target.allowed, s2.target.allowed], max: maxRow(A), newIds: s2.newIds });
  console.log(`  (Delete map with the fold on this world: ${msA} ms, the fold ${f.ms} ms)`);

  console.log("\n-- 2. the adjacency rows the cut carried --");
  {
    const S2 = SW.makeShapes({ big: [{ x0: 288, y0: 32, w: 48, h: 48, key: "P" }, { x0: 336, y0: 32, w: 48, h: 48, key: "Q" }, { x0: 256, y0: 120, w: 48, h: 48, key: "X" }] });
    const at = (x, y) => S2.idOf.get(S2.keyAt[y * W + x]);
    const P = at(300, 50), Q = at(350, 50), X = at(280, 140), O2 = at(220, 150), Y = at(258, 175);
    const z = (y) => H - 1 - y + 0.5;
    const ADJ = ["From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment", `${P};${Q};impassable;-1;-1;-1;-1;-1;;Great Wall`,
      `${X};${Y};sea;${O2};258;${H - 1 - 160};259;${H - 1 - 176};;Coast Strait`, "-1;-1;;-1;-1;-1;-1;-1;;"].join("\r\n") + "\r\n";
    const game2 = path.join(ROOT, "game2");
    SW.makeGame(game2, S2, { adjacencies: ADJ, unitstacks: new Map([[P, [290.5, z(56)]], [Q, [382.5, z(56)]], [X, [302.5, z(144)]]]) });
    const m = SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, "adj"), S2, { name: "fold back", keepLand: new Set([Y]) });
    const picked = [P, Q, X].map(String);
    const model = md.buildMapModel({ modRoot: m, gameRoot: game2, dependencyRoots: [], cacheStableLayers: true });
    const lines = fs.readFileSync(path.join(m, "map", "definition.csv"), "utf8").split("\n");
    const cut = md.planGeneratedProvinceSplit({ modRoot: m, gameRoot: game2, dependencyRoots: [], picked, lines, model, p2r: model.provinceToRegion || {}, seed: SEED });
    const w = cut.write ? md.writeGeneratedProvinceSplit({ modRoot: m, gameRoot: game2, dependencyRoots: [], write: cut.write, picked }) : { ok: false };
    const adjFile = path.join(m, "map", "adjacencies.csv");
    rec("(control: the cut carried walls between P's and Q's families and moved the strait's X end, into a file it made from the one below)",
      w.ok === true && w.adjacencies.added > 0 && w.adjacencies.rehomed === 1 && fs.existsSync(adjFile) && shaOf(adjFile) !== shaOf(path.join(game2, "map", "adjacencies.csv")), w.adjacencies);
    const b = blank(m, game2), fa = (b.provinceFold || {}).adjacencies || {};
    rec("⭐⭐ the fold takes every carried row back: the file holds the layer below's bytes again — and is still there, never deleted",
      fs.existsSync(adjFile) && shaOf(adjFile) === shaOf(path.join(game2, "map", "adjacencies.csv")), fs.existsSync(adjFile) ? fs.readFileSync(adjFile, "utf8").slice(0, 400) : "deleted");
    rec("⭐ …and says so: every carried wall a copy of the wall it came from, and the strait's end back on X", fa.dropped === w.adjacencies.added && fa.rehomed === w.adjacencies.added + w.adjacencies.rehomed, { fold: fa, carried: w.adjacencies });
  }

  console.log("\n-- 3. a family that cannot fold stops the fold there --");
  {
    const L = mk("lake");
    gen(L);
    const r = md.readProvinceSplitRecord(L);
    const byTop = r.families.slice().sort((x, y) => Math.max(...y.pieces) - Math.max(...x.pieces));
    const F1 = byTop[1], lake = Math.min(...F1.pieces);
    rec("(control: the click cut at least three families)", byTop.length >= 3, byTop.length);
    // the modder retypes a piece of the second-newest family to a lake before Delete map, which keeps lakes
    const defFile = path.join(L, "map", "definition.csv");
    const t = fs.readFileSync(defFile, "utf8"), lt = t.replace(new RegExp(`^(${lake};\\d+;\\d+;\\d+;)land;`, "m"), "$1lake;");
    rec("(control: the piece was retyped)", lt !== t, lake);
    fs.writeFileSync(defFile, lt);
    const b = blank(L), fl = b.provinceFold || {};
    said.stop = b;
    rec("⭐⭐ the newest family folds, and the fold stops at the family with a lake in it, saying why",
      fl.changed === true && fl.families === 1 && fl.stopped && fl.stopped.parent === F1.parent && /lake/.test(fl.stopped.why) && fl.left === r.families.length - 1, fl);
    rec("⭐⭐⭐ …so the ids left run 0..max with no gap, ending at that family's last piece", noGap(L) && maxRow(L) === Math.max(...F1.pieces), { max: maxRow(L), want: Math.max(...F1.pieces) });
    const kept = md.readProvinceSplitRecord(L).families;
    rec("⭐ the record keeps every family it did not fold, as it was", JSON.stringify(kept) === JSON.stringify(r.families.filter((x) => x !== byTop[0])), kept.length);
    const ids = new Set(bmpIds(L));
    rec("…and the lake's family is untouched on the map: every piece of it still has its pixels", F1.pieces.every((q) => ids.has(q)));
  }

  console.log("\n-- 4. a record that does not describe the map --");
  {
    const R = mk("stale", { ownRegions: true }), Rt = mk("stale-twin", { ownRegions: true });
    gen(R); gen(Rt);
    const r = md.readProvinceSplitRecord(R);
    const top = r.families.slice().sort((x, y) => Math.max(...y.pieces) - Math.max(...x.pieces))[0];
    // a province far from the top family — touching none of it — that the record now names its parent; both mods move it into the
    // parent's strategic region, so it is the PIXELS that tell the record from the map, not the region
    const def = defOf(R), ids = bmpIds(R, def), members = new Set([top.parent, ...top.pieces]);
    const touching = new Set();
    for (let i = 0; i < ids.length; i++) {
      if (!members.has(ids[i])) continue;
      const x = i % W;
      for (const nb of [x > 0 ? i - 1 : i + W - 1, x < W - 1 ? i + 1 : i - W + 1, i - W, i + W]) if (nb >= 0 && nb < ids.length) touching.add(ids[nb]);
    }
    const p2r0 = md.buildMapModel({ modRoot: R, gameRoot: game, dependencyRoots: [], cacheStableLayers: true }).provinceToRegion || {};
    const rp = p2r0[String(top.parent)];
    const other = def.ids.find((id) => id > 0 && id <= S.N && !members.has(id) && !touching.has(id) && p2r0[String(id)] !== undefined && p2r0[String(id)] !== rp);
    for (const m of [R, Rt]) {
      const dir = path.join(m, "map", "strategicregions");
      for (const nm of fs.readdirSync(dir)) {
        const p = path.join(dir, nm), t = fs.readFileSync(p, "utf8"), id = +(/\bid\s*=\s*(\d+)/.exec(t) || [])[1];
        let out = t;
        if (id === p2r0[String(other)]) out = out.replace(new RegExp(`(provinces = \\{[^}]*?) ${other}(?![0-9])`), "$1");
        if (id === rp) out = out.replace(/(provinces = \{[^}]*?)\s*\}/, `$1 ${other} }`);
        if (out !== t) fs.writeFileSync(p, out);
      }
    }
    const p2r = md.buildMapModel({ modRoot: R, gameRoot: game, dependencyRoots: [], cacheStableLayers: true }).provinceToRegion || {};
    rec("(control: such a province exists, and stands in the parent's region now)", other !== undefined && p2r[String(other)] === rp, { parent: top.parent, rp, other, now: p2r[String(other)] });
    const stale = { version: 1, definitionMaxBefore: r.definitionMaxBefore, families: r.families.map((x) => (x === top ? Object.assign({}, x, { parent: other }) : x)) };
    fs.writeFileSync(md.provinceSplitRecordPath(R), JSON.stringify(stale));
    const b = blank(R), bt = blankUnfolded(Rt), fs4 = b.provinceFold || {};
    said.stale = b;
    rec("⭐⭐ nothing folds: the first family's piece does not reach the parent the record names, and it says so",
      fs4.changed === false && fs4.stopped && fs4.stopped.parent === other && /does not reach/.test(fs4.stopped.why), fs4);
    const d = treeDiff(tree(path.join(R, "map")), tree(path.join(Rt, "map")));
    rec("⭐⭐⭐ …and the map is the one a Delete map with no record leaves, byte for byte", d.length === 0, d.slice(0, 6));
  }

  console.log("\n-- 5. a fold that cannot write puts every file back --");
  {
    const F = mk("ro", { ownRegions: true }), Ft = mk("ro-twin", { ownRegions: true });
    gen(F); gen(Ft);
    const r = md.readProvinceSplitRecord(F), pieces = new Set(r.families.flatMap((x) => x.pieces));
    const dir = path.join(F, "map", "strategicregions");
    const named = fs.readdirSync(dir).filter((n) => [...(fs.readFileSync(path.join(dir, n), "utf8").match(/\d+/g) || [])].some((v) => pieces.has(+v))).sort();
    const locked = path.join(dir, named[named.length - 1]);
    fs.chmodSync(locked, 0o444); readOnly.push(locked);
    const b = blank(F), bt = blankUnfolded(Ft), fr = b.provinceFold || {};
    said.error = b;
    rec("⭐ the fold says it could not be written, and that it put back what it had written", fr.changed === false && /read-only|EPERM|EACCES|permission/i.test(fr.error || "") && fr.restored >= 2 && !fr.notRestored, fr);
    const d = treeDiff(tree(path.join(F, "map")), tree(path.join(Ft, "map")));
    rec("⭐⭐⭐ every map file is the one a Delete map with no record leaves, byte for byte, and none is removed", d.length === 0 && tree(path.join(F, "map")).size === tree(path.join(Ft, "map")).size, d.slice(0, 6));
    rec("⭐⭐ …and the record still holds every family", JSON.stringify(md.readProvinceSplitRecord(F).families) === JSON.stringify(r.families));
  }

  console.log("\n-- 6. a record from before this change: a re-roll that never folded --");
  {
    const N6 = mk("nested");
    gen(N6);
    blankUnfolded(N6);   // Delete map as it was: the pieces stay, as small sea provinces
    const sea = defOf(N6).ids.filter((id) => id > 0 && defOf(N6).rows.get(id).type === "sea").length;
    const g2 = gen(N6, { count: Math.round(sea * 0.6), seed: 2 });
    const r = md.readProvinceSplitRecord(N6), firstMax = Math.min(...r.families.filter((x) => x.definitionMaxBefore > S.N).map((x) => x.definitionMaxBefore));
    rec("(control: the second click cut again, and cut at least one piece of the first click's)", g2.provinceSplit.changed === true && r.families.some((x) => x.parent > S.N && x.parent <= firstMax),
      { second: g2.provinceSplit.newIds, nested: r.families.filter((x) => x.parent > S.N).length });
    const def0 = defOf(N6), before = bmpIds(N6, def0), root = rootsOf(r), max = maxRow(N6);
    const b = blank(N6), fn = b.provinceFold || {};
    rec("⭐⭐ every family folds, newest first, and the map ends at the mod's last id before the first cut", fn.changed === true && fn.left === 0 && fn.families === r.families.length && maxRow(N6) === S.N && noGap(N6), fn);
    const after = bmpIds(N6);
    let wrong = 0;
    for (let i = 0; i < before.length; i++) { const want = root.has(before[i]) ? root.get(before[i]) : before[i]; if (after[i] !== want) wrong++; }
    rec("⭐⭐⭐ every pixel ends on the province its piece was cut from, through every family — and every other pixel is as it was", wrong === 0, wrong);
    const left = namesOf(N6, range(S.N + 1, max));
    rec("⭐⭐ no folded id is named anywhere in the mod", left.size === 0, [...left].slice(0, 8));
  }

  console.log("\n-- 7. the corner of two parents is not an X-crossing --");
  {
    // P = 1 cut into 4 and 5, Q = 2 cut into 6, and Q meets itself at a corner between 4 and 5: P's pieces on one diagonal, Q on the
    // other. Before: three provinces in the block. After: P Q / Q P — the block the plan feared.
    const w = 8, h = 4, Pr = 1, Qr = 2;
    const grid = [
      [1, 1, 1, 1, 1, 1, 6, 2],
      [1, 4, 2, 3, 3, 1, 6, 2],
      [1, 2, 5, 3, 3, 1, 2, 2],
      [1, 1, 1, 1, 1, 1, 2, 2],
    ];
    const ids = Int32Array.from(grid.flat());
    const rows = new Map([[0, { type: "land", colour: 0 }], ...[1, 2, 3, 4, 5, 6].map((id) => [id, { type: "sea", colour: 1000 + id }])]);
    const plan = md.provinceFoldPlan({ W: w, H: h, ids, families: [{ parent: Pr, pieces: [4, 5] }, { parent: Qr, pieces: [6] }], rows, defMax: 6 });
    rec("(control: no X-crossing before)", SW.xCrossings(ids, w, h) === 0 && md.rasterXCrossings(w, h, ids).length === 0);
    rec("(the two families fold, Q's first)", plan.folded.length === 2 && plan.folded[0].parent === Qr && plan.newMax === 3 && !plan.stopped, { folded: plan.folded, stopped: plan.stopped });
    const blockAfter = [plan.ids[1 * w + 1], plan.ids[1 * w + 2], plan.ids[2 * w + 1], plan.ids[2 * w + 2]];
    rec("⭐ the fold makes the block P Q / Q P", JSON.stringify(blockAfter) === JSON.stringify([Pr, Qr, Qr, Pr]), blockAfter);
    rec("⭐⭐ …which is not an X-crossing — by the test's own judge and the game's rule as Nova reads it", SW.xCrossings(plan.ids, w, h) === 0 && md.rasterXCrossings(w, h, plan.ids).length === 0);
  }

  console.log("\n-- 8. the page says it --");
  rec("provinceFoldNote and generatedProvinceSplitNote were lifted out of public/map.js and run", typeof note === "function" && typeof splitNote === "function");
  if (typeof note === "function") {
    const n = (x) => Number(x || 0).toLocaleString();
    const fo = said.fold.provinceFold, nf = note(fo);
    rec("⭐ a fold: how many provinces, out of how many raised, which ids, and that their borders count no more",
      nf.includes(`gave back the ${n(fo.provinces)} provinces an earlier Generate land had cut out of ${n(fo.families)} raised ocean`) && nf.includes(`(ids ${n(fo.from)}–${n(fo.to)})`) && /no longer count against Nova's province border budget/.test(nf) && !/⚠/.test(nf), nf);
    rec("…and the order-of-battle places it moved", nf.includes(`${n(fo.units.moved)} places in your mod's history/units`), nf);
    rec("⭐ a mod Nova never cut: nothing is said", note(said.none.provinceFold) === "", note(said.none.provinceFold));
    const st = said.stop.provinceFold, ns = note(st);
    rec("⭐⭐ a fold that stopped: how many it left, and why", ns.includes(`It left ${n(st.left)} cut`) && ns.includes(st.stopped.why) && /no gap/.test(ns), ns);
    const er = said.error.provinceFold, ne = note(er);
    rec("⭐ a fold that could not be written: why, that it was put back, and what that costs", ne.startsWith("⚠ Delete map could not give back") && /was put back/.test(ne) && /border budget/.test(ne), ne);
    rec("…and a fold the record could not be read for says so", /did not give back/.test(note({ changed: false, skipped: "the record cannot be read" })));
    // the Save handler asks for the note only when the answer carries something to say (so the Save tests that lift it need not lift
    // this note): its condition, read out of public/map.js, must agree with the note on every answer this test's clicks gave
    const m = /const pf = res\.provinceFold;\s*const note = ([^\n]+?) \? provinceFoldNote\(pf\) : "";/.exec(PAGE.MASKED);
    let ask = null;
    try { ask = m ? new Function("pf", "return !!(" + m[1] + ");") : null; } catch (_) { ask = null; }
    const answers = [said.fold, said.none, said.stop, said.stale, said.error].map((b) => b && b.provinceFold).concat([{ changed: false, skipped: "the record cannot be read" }]);
    rec("⭐ the Save handler asks for the note on every answer that has one, and on no other (its condition, run on the six answers above)",
      !!ask && answers.every((f) => !!f && ask(f) === (note(f) !== "")), { condition: m && m[1], asked: ask && answers.map((f) => f && ask(f)), said: answers.map((f) => f && note(f) !== "") });
  }
  if (typeof splitNote === "function") {
    const s = splitNote({ provinceSplit: { changed: false, why: "budget", target: { segmentsBefore: 62001, limit: 62000, earlierPieces: 12 } } });
    rec("⭐ Generate land no longer says Delete map keeps the cuts: it says Delete map gives them back", /12 provinces earlier clicks cut among them: Delete map gives those back/.test(s) && !/does not give those back/.test(s), s);
  }

  console.log("\n-- 9. through the endpoints: the victory-point names of the pieces --");
  {
    process.env.HOI4_ROOT = game;
    const { createApp } = require("./server.js");
    const M = mk("names");
    let server = null;
    try {
      server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
      const base = `http://127.0.0.1:${server.address().port}`;
      const post = (ep, body) => fetch(base + ep, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({}, body, { modPath: M })) })
        .then(async (r) => ({ s: r.status, b: await r.json().catch(() => ({})) }));
      // Generate land's body is the page's (public/map.js): { modPath, count, seed, ownerMode, owner, replacesExistingWorld }; Delete map's is {}
      const g = await post("/api/map/generate-land", { count: COUNT, seed: SEED, ownerMode: "inherit", owner: "", replacesExistingWorld: true });
      const r = md.readProvinceSplitRecord(M), pieces = new Set(r.families.flatMap((x) => x.pieces));
      const novaFile = path.join(M, "localisation", "english", "replace", "nova_state_names_l_english.yml");
      const vpKeys = (p) => (fs.existsSync(p) ? [...fs.readFileSync(p, "utf8").matchAll(/^\s*VICTORY_POINTS_(\d+):/gm)].map((m) => +m[1]) : []);
      const onPieces = vpKeys(novaFile).filter((id) => pieces.has(id));
      rec("(control: the click cut, and Nova named victory points that stand on pieces)", g.s === 200 && g.b.ok === true && pieces.size > 0 && onPieces.length > 0, { status: g.s, error: g.b.error, pieces: pieces.size, onPieces: onPieces.length });
      // the modder names one piece's victory point in their own file
      const own = SW.write(M, "localisation/english/my_points_l_english.yml", `﻿l_english:\n VICTORY_POINTS_${onPieces[0]}:0 "Modders Point"\n`), ownSha = shaOf(own);
      // 🗑 Delete map → 💾 Save, through the page's own code. The page's map as it stood at the click: the model it loaded after Generate
      // land, every land province flipped to sea by blankMapLocal's own loop. blankMapLocal queues ONE write (queueWrite(
      // "/api/map/blank-to-sea", {})); flushMapSaves posts it, hands the notes it made of the answer to the page's own mapCrashGate (the
      // real validate behind it), and — the fold having renumbered the map — reloads the page's map through the page's own load() and
      // buildFromImage, the bitmap a FakeImage that decodes after load() has returned, as a browser's does
      const seen = await fetch(`${base}/api/map/model?modPath=${encodeURIComponent(M)}`).then((x) => x.json());
      const provinceType = new Map(), provinceDef = new Map();
      for (const p of seen.provinces || []) { provinceType.set(p.id, p.type); provinceDef.set(p.id, p); }
      const flipped = flipToSea ? flipToSea(provinceType, provinceDef) : 0;
      const seaOnPage = [...provinceType.values()].filter((t) => t === "sea").length, countBefore = genCount ? genCount(provinceType, 35) : null;
      const answers = [], gated = [], riversCalls = [];
      const page = PAGE.runPage([
        ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
        "function markSaveBoundary", "function queueWrite(url, body, meta)",
        ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"],
        "async function mapCrashGate(", "async function load(doneMsg)", "function buildFromImage(img, doneMsg)",
      ], PAGE.loadGlobals({
        console, JSON, Image: PAGE.fakeImageClass({ width: W, height: H }),
        pendingWrites: [], paintDiff: new Map(), stateById: new Map(), model: { states: [] }, provinceType, provinceDef,
        stagedRiverEdits: [], riversShow: true, loadRiversOverlay: (msg) => { riversCalls.push(msg); },
        undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0,
        baseImageData: null, baseImageDataPristine: null,
        setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => M,
        isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
        stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
        remapQueuedStateId: () => {}, remapLocalStateId: () => {},
        adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
        fetch: async (url, opts) => {
          const r = await fetch(base + url, opts);
          if (String(url).indexOf("/api/map/validate") !== 0) { try { answers.push({ url, status: r.status, res: await r.clone().json() }); } catch (_) {} }
          return r;
        },
      }));
      // the page's own gate, run — and what it is handed and the line it sets kept
      const realGate = page.sb.mapCrashGate;
      page.sb.mapCrashGate = async (a) => { const at = gated.push({ a }) - 1; gated[at].line = await realGate(a); return gated[at].line; };
      page.sb.queueWrite("/api/map/blank-to-sea", {});
      await page.sb.flushMapSaves();
      await PAGE.settle(120);   // the reloaded bitmap decodes after load() has returned
      const b = answers.find((a) => a.url === "/api/map/blank-to-sea") || {};
      const fb = (b.res && b.res.provinceFold) || {};
      rec("⭐⭐ Delete map folded the pieces back and took Nova's victory-point names for them out of its own file", b.status === 200 && fb.changed === true
        && vpKeys(novaFile).filter((id) => pieces.has(id)).length === 0 && fb.names && fb.names.removed === onPieces.length, { status: b.status, names: fb.names, left: vpKeys(novaFile).filter((id) => pieces.has(id)).length });
      rec("⭐⭐ …and the modder's own name stays, byte for byte, and is counted", shaOf(own) === ownSha && (fb.names || {}).theirs === 1, fb.names);
      if (typeof note === "function") rec("…which the page says", /Your own localisation still names 1 of their victory points/.test(note(fb)), note(fb));
      const warned = gated.length === 1 ? gated[0].a.writeWarnings || [] : [];
      rec("⭐⭐ 💾 Save hands the note the page makes of the fold, every word of it, to the status line with the write's other notes",
        typeof note === "function" && note(fb) !== "" && warned.filter((w) => w === note(fb)).length === 1 && !gated[0].a.stopped, { gated: gated.length, warned: warned.map((w) => w.slice(0, 80)) });
      // ⛔ the page's map after 💾 Save: 🌍 Generate land counts its slider's share off the page's provinceType, and refuses to run until
      // the Delete map is saved — so the copy the Save leaves is the one it counts
      const diskDef = defOf(M), diskSea = diskDef.ids.filter((id) => id > 0 && diskDef.rows.get(id).type === "sea").length;
      const want = Math.max(1, Math.round(diskSea * 35 / 100));
      rec("(control: the page's flip and Generate land's count were lifted out of public/map.js, and at the click the count took the pieces in — more than 35% of the sea the fold leaves)",
        typeof flipToSea === "function" && typeof genCount === "function" && flipped > 0 && countBefore === Math.max(1, Math.round(seaOnPage * 35 / 100)) && countBefore > want,
        { flipped, seaOnPage, countBefore, diskSea, want });
      {
        const pt = page.sb.provinceType, maxOnPage = pt && pt.size ? Math.max(...pt.keys()) : -1, count = genCount && pt ? genCount(pt, 35) : null;
        rec("⭐⭐⭐ after 💾 Save the page's map is the disk's: no province past the last id the fold left, and 🌍 Generate land's 35% is 35% of the sea on disk",
          maxOnPage === maxRow(M) && maxOnPage === fb.from - 1 && count === want, { maxOnPage, disk: maxRow(M), from: fb.from, count, want });
      }
      const blankAt = answers.findIndex((a) => a.url === "/api/map/blank-to-sea"), modelAt = answers.findIndex((a, i) => i > blankAt && /^\/api\/map\/model\?/.test(a.url));
      rec("⭐ …read again from the disk after the write and its check: the model asked for once more, after the fold", blankAt >= 0 && modelAt > blankAt, answers.map((a) => a.url.split("?")[0]));
      // ⛔ the line it leaves: the gate's, kept through the reload — and with the fold's note on it, though three of the save's own notes
      // stand ahead of it (the line shows three, and a note carrying ⚠ is never the one cut off)
      const line = gated.length === 1 ? gated[0].line : null, last = page.statuses[page.statuses.length - 1];
      const at = typeof note === "function" ? warned.indexOf(note(fb)) : -1;
      rec("(control: three of the save's own notes stand ahead of the fold's, and the fold's carries a ⚠)", at >= 3 && /⚠/.test(note(fb)), { at, notes: warned.length });
      rec("⭐⭐ the line 💾 Save leaves on screen carries the fold's note, every word of it — the gate's line, kept on screen by the reload",
        typeof line === "string" && line.includes(note(fb)) && last === line, { last: String(last).slice(0, 400) });
      rec("⭐ …and the rivers overlay the reload brings back says nothing over it", riversCalls.length > 0 && riversCalls.every((x) => x === false), riversCalls);
    } finally { if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); } }
  }

  console.log("\n-- 10. every reason the fold stops for, one family each --");
  {
    // one family, P = 1 cut into its pieces, on a strip the test draws; the rows sea, each its own colour, all in one region, unless
    // the case says otherwise. Each case is a record or a map Nova must not fold, and must say why: nothing of it folds, the last id
    // stays, and no pixel moves.
    const w = 6, h = 2;
    const sea = (ids, over = {}) => new Map(ids.map((id) => [id, Object.assign({ type: id === 0 ? "land" : "sea", colour: id === 0 ? 0 : 1000 + id }, over[id] || {})]));
    const run = ({ grid, families, rows, defMax, regionOf }) => {
      const ids = Int32Array.from(grid.flat());
      return { ids, plan: md.provinceFoldPlan({ W: w, H: h, ids, families, rows, defMax, regionOf }) };
    };
    const held = ({ ids, plan }, defMax) => plan.folded.length === 0 && plan.newMax === defMax && plan.ids.every((v, i) => v === ids[i]) && plan.changed.length === 0;
    const base = { grid: [[0, 1, 2, 3, 1, 0], [0, 1, 1, 1, 1, 0]], families: [{ parent: 1, pieces: [2, 3] }], rows: sea([0, 1, 2, 3]), defMax: 3 };
    {
      const c = run(base);
      rec("(control: the strip's family folds when nothing stands in its way)", c.plan.folded.length === 1 && !c.plan.stopped && c.plan.newMax === 1 && c.plan.ids.every((v) => v === 0 || v === 1), { stopped: c.plan.stopped, newMax: c.plan.newMax });
    }
    const cases = [
      { name: "a row on top of definition.csv that Nova's record does not say Nova cut — the modder's own province, drawn after the cut",
        why: /^province 4 is the last row of map\/definition\.csv, and Nova's record does not say Nova cut it$/, defMax: 4,
        grid: [[0, 1, 2, 3, 1, 0], [0, 1, 4, 1, 1, 0]], rows: sea([0, 1, 2, 3, 4]) },
      { name: "pieces that are not one run of ids — a row between them that is not the family's",
        why: /^its provinces are not one run of ids$/, defMax: 4, families: [{ parent: 1, pieces: [2, 4] }],
        grid: [[0, 1, 2, 3, 1, 0], [0, 1, 4, 1, 1, 0]], rows: sea([0, 1, 2, 3, 4]) },
      { name: "a record naming one of a family's pieces twice", why: /^Nova's record names one of its provinces twice$/,
        families: [{ parent: 1, pieces: [2, 3, 3] }] },
      { name: "a parent above its pieces — a later id, which no cut of Nova's makes", why: /^its parent 4 is not below its pieces$/, defMax: 4,
        families: [{ parent: 1, pieces: [4] }, { parent: 4, pieces: [3] }], grid: [[0, 1, 2, 3, 4, 0], [0, 1, 1, 1, 1, 0]], rows: sea([0, 1, 2, 3, 4]), folds: 1 },
      { name: "a piece sharing its colour with a row outside the family — the rename would take that province's pixels too",
        why: /^province 3 shares its colour with another row$/, defMax: 4, families: [{ parent: 1, pieces: [3, 4] }],
        // province 2 shares piece 3's colour, so its pixel — bottom right — reads as 3, the way a bitmap read by colour reads it
        grid: [[0, 1, 3, 4, 1, 0], [0, 1, 1, 1, 3, 0]], rows: sea([0, 1, 2, 3, 4], { 2: { colour: 1003 } }) },
      { name: "a piece in another strategic region than its parent — its ground would move between regions",
        why: /^province 3 is in strategic region 11, its parent 1 in 10$/, regionOf: (id) => (id === 3 ? 11 : 10) },
    ];
    for (const k of cases) {
      const o = Object.assign({}, base, k), c = run(o), defMax = o.defMax;
      const okStop = !!c.plan.stopped && k.why.test(c.plan.stopped.why);
      // a case whose first family folds before the one that cannot (the parent-above case): only that one folds
      const okHeld = k.folds ? c.plan.folded.length === k.folds && c.plan.newMax === defMax - k.folds : held(c, defMax);
      rec(`⭐⭐ ${k.name}: the fold stops there, says why, and folds nothing of it`, okStop && okHeld,
        { why: c.plan.stopped && c.plan.stopped.why, folded: c.plan.folded.length, newMax: c.plan.newMax, defMax });
    }
  }

  console.log("\n-- 11. a province the modder drew on top of the cut, through Delete map --");
  {
    // after Generate land the modder paints a province of their own — a 4 × 4 block inside a province no family names — and gives it
    // the next row of definition.csv, a sea row. Delete map's fold must not fold under it: a fold ends definition.csv at the last id it
    // leaves, and here that would cut the modder's row off and leave its pixels a colour no row names.
    const Q = mk("modder-on-top"), Qt = mk("modder-on-top-twin");
    gen(Q); gen(Qt);
    const r = md.readProvinceSplitRecord(Q), named = new Set(r.families.flatMap((x) => [x.parent, ...x.pieces]));
    const def0 = defOf(Q), max0 = maxRow(Q), ids0 = bmpIds(Q, def0);
    let spot = null;
    for (let y = 2; y < H - 8 && !spot; y++) for (let x = 2; x < W - 8 && !spot; x++) {
      const p = ids0[y * W + x];
      if (p <= 0 || named.has(p)) continue;
      let same = true;
      for (let dy = -1; dy < 5 && same; dy++) for (let dx = -1; dx < 5 && same; dx++) if (ids0[(y + dy) * W + x + dx] !== p) same = false;
      if (same) spot = { x, y, p };
    }
    // a colour no row of the mod or the layer below names
    const usedCol = new Set();
    for (const f of [path.join(Q, "map", "definition.csv"), path.join(game, "map", "definition.csv")]) for (const [, row] of SW.readDef(f).rows) usedCol.add(row.colour);
    let col = (7 << 16) | (201 << 8) | 77;
    while (usedCol.has(col)) col++;
    const NEW = max0 + 1, rgb = [(col >> 16) & 255, (col >> 8) & 255, col & 255];
    const row = `${NEW};${rgb[0]};${rgb[1]};${rgb[2]};sea;false;ocean;0`;
    for (const m of [Q, Qt]) {
      const bmpFile = path.join(m, "map", "provinces.bmp"), buf = fs.readFileSync(bmpFile), off = buf.readUInt32LE(10), rs = Math.floor((24 * W + 31) / 32) * 4;
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) { const o = off + (H - 1 - (spot.y + dy)) * rs + (spot.x + dx) * 3; buf[o] = rgb[2]; buf[o + 1] = rgb[1]; buf[o + 2] = rgb[0]; }
      fs.writeFileSync(bmpFile, buf);
      const defFile = path.join(m, "map", "definition.csv"), t = fs.readFileSync(defFile, "utf8"), eol = t.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
      fs.writeFileSync(defFile, t + (t.endsWith("\n") ? "" : eol) + row + eol);
    }
    rec("(control: the click cut, and the modder's province is painted inside one no family names, on the row after the last)",
      r.families.length > 0 && !!spot && maxRow(Q) === NEW && bmpIds(Q).filter((v) => v === NEW).length === 16, { families: r.families.length, spot, NEW });
    const b = blank(Q), bt = blankUnfolded(Qt), fq = b.provinceFold || {};
    rec("⭐⭐ the fold stops at once, and says it is the modder's row on top that stops it",
      fq.changed === false && !!fq.stopped && fq.stopped.why === `province ${NEW} is the last row of map/definition.csv, and Nova's record does not say Nova cut it` && fq.left === r.families.length, fq);
    const lines = fs.readFileSync(path.join(Q, "map", "definition.csv"), "utf8").split(/\r?\n/);
    const idsAfter = bmpIds(Q);
    rec("⭐⭐⭐ the modder's row is there, byte for byte, its 16 pixels still its own, and no pixel is a colour no row names",
      lines.includes(row) && maxRow(Q) === NEW && idsAfter.filter((v) => v === NEW).length === 16 && idsAfter.every((v) => v >= 0), { last: lines.filter(Boolean).slice(-1)[0], unknown: idsAfter.filter((v) => v < 0).length });
    const d = treeDiff(tree(path.join(Q, "map")), tree(path.join(Qt, "map")));
    rec("⭐⭐ …and the map is the one a Delete map with no record leaves, byte for byte", d.length === 0, d.slice(0, 6));
  }

  console.log("\n-- 12. a fold that stopped is on the line 💾 Save leaves --");
  if (typeof note === "function") {
    // the answers of sections 3 (a fold that stopped part-way) and 4 (a record that does not describe the map: nothing folded), each
    // through the page's own flushMapSaves and mapCrashGate: once over a map the check finds nothing on, once over one it finds a
    // problem Save stops for — the two branches that word the save's own notes
    const L = require("./public/map-rule-labels.js");
    const fatal = [...L.FATAL][0];
    const checksOf = { quiet: { ok: true, errors: 0, warnings: 0, problems: [] },
      fatal: { ok: true, errors: 1, warnings: 0, problems: [{ rule: fatal, severity: "error", message: "a problem Save stops for", total: 1 }] } };
    rec("(control: the problem the second check finds is one Save stops for)", L.isFatalRule(fatal), fatal);
    for (const [which, answer] of [["a fold that stopped part-way", said.stop], ["a fold that gave back none", said.stale]]) {
      for (const [branch, v] of Object.entries(checksOf)) {
        const gatedHere = [], reloaded = [];
        const page = PAGE.runPage([
          ["const STATE_ID_FIELDS = ", "\n"], "function orphanedQueuedWrites(writes)", "function emptyNewStateWrites(writes, stateById)",
          "function markSaveBoundary", "function queueWrite(url, body, meta)",
          ["async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"], "async function mapCrashGate(",
        ], {
          console, JSON, load: async (msg) => { reloaded.push(msg); },
          pendingWrites: [], paintDiff: new Map(), stateById: new Map(), model: { states: [] },
          stagedRiverEdits: [], riversShow: false, undoStack: [], redoStack: [], historyLabels: [], saveGeneration: 0,
          baseImageData: null, baseImageDataPristine: null,
          setMapDirty: () => {}, updateSaveButton: () => {}, modPath: () => "C:/mods/x",
          isVanillaTarget: () => false, problemsPanelOpen: () => false, refreshProblems: () => {}, renderCheckpoints: () => {},
          buildPidGrid: () => {}, computeCentroids: () => {}, recolorAll: () => {}, draw: () => {}, loadRiversOverlay: () => {},
          stateFormDirty: () => false, stateFormBaseline: null, stageStateWrite: () => {},
          remapQueuedStateId: () => {}, remapLocalStateId: () => {},
          adoptMergeRegions: () => {}, openMapErrorsModal: () => {}, saveMapBackup: () => {}, updateUndoButtons: () => {},
          fetch: async (url) => {
            const body = String(url).indexOf("/api/map/validate") === 0 ? v : Object.assign({ ok: true }, answer);
            return { ok: true, status: 200, json: async () => body, clone() { return this; } };
          },
        });
        const realGate = page.sb.mapCrashGate;
        page.sb.mapCrashGate = async (a) => { gatedHere.push(a); return realGate(a); };
        page.sb.queueWrite("/api/map/blank-to-sea", {});
        await page.sb.flushMapSaves();
        const notes = gatedHere.length === 1 ? gatedHere[0].writeWarnings || [] : [], fn = note(answer.provinceFold), at = notes.indexOf(fn);
        const last = page.statuses[page.statuses.length - 1] || "";
        const plain = notes.filter((t) => !/⚠/.test(t)).length, warned = notes.length - plain, hidden = plain - Math.max(0, 3 - warned);
        rec(`(control: ${which}, ${branch} check: three of the save's own notes stand ahead of the fold's ⚠ note)`, at >= 3 && /⚠/.test(fn), { at, notes: notes.length });
        rec(`⭐⭐ ${which}, ${branch} check: the line Save leaves carries the fold's note, every word of it, and counts the notes it does not show`,
          last.includes(fn) && (hidden > 0 ? last.includes(`…and ${hidden} more`) : true), { last: last.slice(0, 500), hidden });
        rec(`…and the page's map is reloaded only when the fold renumbered it (${which})`, reloaded.length === (answer.provinceFold.changed === true ? 1 : 0), reloaded.length);
      }
    }
  }
} catch (e) {
  rec("the test ran to the end", false, String((e && e.stack) || e).slice(0, 900));
} finally {
  for (const f of readOnly) { try { fs.chmodSync(f, 0o666); } catch (_) {} }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // this test's own temp folder — never a mod directory (⛔ CLAUDE.md #1)
}
console.log(`\n=== delete map gives back the cut provinces: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
