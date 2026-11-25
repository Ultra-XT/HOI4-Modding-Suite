// ⛔ #a-raised-province-is-cut-to-land-size — A CUT THAT CANNOT BE DONE IS NOT DONE, AND ONE THAT FAILS PUTS EVERY FILE BACK.
//
// Generate land cuts its raised ocean provinces to the size of the land below in ONE write — definition.csv, provinces.bmp, every
// strategic region a piece joins, the adjacency rows it carries, then the record of the families. This pins every way it may not
// happen, on testlib-split-world.js's world, each against a twin click made with splitLargeProvinces: false:
//   1. the mod does not own map/provinces.bmp → skipped, and the click writes exactly the files, byte for byte, the uncut one does;
//   2. no layer below to size a province by → skipped, with no typed stand-in for the base game's 399.1 px;
//   3. a strategic region the cut must write is read-only → the cut is put back: definition.csv, provinces.bmp and every region
//      file are the uncut click's byte for byte, none removed, and the click says why and raises the land whole;
//   4. the record cannot be written (the last step) → every file is put back, and a file the cut CREATED — a region, the adjacencies
//      — is given the bytes of the copy below it, which is what loaded there before: never deleted (CLAUDE.md ⛔1, ⛔4); through the
//      click as well, whose answer names those copies;
//   5. a border budget of 3 cuts at most 3 more provinces; one of 0 cuts none, and says the limit is used up;
//   6. a coast its own check refuses is not written, and the bitmap differs from the source by the cut's pixels alone;
//   7. two clicks on two copies write the same bytes;
//   8. the record names every new id under its parent, and a second click appends to it — each family saying which click cut it;
//   9. the regions that load name the ids a new province would take → skipped, and says which;
//  10. the page says each of these (generatedProvinceSplitNote, lifted out of public/map.js), from what the click reported: the
//      borders the map has NOW (after a cut, its count after it), the earlier clicks' cuts only where there were some, "put back"
//      only where something had been written, the copies a failed cut leaves the mod holding, and the map below by its name when it
//      is a dependency's, not the base game's.
// Binds no port.
// Run: node test-a-split-is-skipped-where-it-cannot-be-done.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-split-skip-"));
// BEFORE map-data.js loads: app data, ~/.nova (the split record lives there) and the mods root are this test's
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
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!cond) fails.push(label);
};
const sha = (b) => crypto.createHash("sha1").update(b).digest("hex");
/** every file under a folder → Map(relative path → sha1) */
function tree(dir) {
  const out = new Map();
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out.set(path.relative(dir, p).replace(/\\/g, "/"), sha(fs.readFileSync(p))); } };
  if (fs.existsSync(dir)) walk(dir);
  return out;
}
const treeDiff = (a, b) => [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort();
const maxRow = (mod) => Math.max(...SW.readDef(path.join(mod, "map", "definition.csv")).ids);
const readOnly = [];

const SEED = 1, W = SW.W, H = SW.H;
const S = SW.makeShapes();                       // the owner's flow: the mod's definition.csv ends where the one below does
const game = path.join(ROOT, "game");
SW.makeGame(game, S);
const COUNT = Math.max(1, Math.round(S.N * 35 / 100));
const mk = (name, o = {}) => SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, name), S, Object.assign({ name: "split skip" }, o));
const gen = (m, extra = {}, gameRoot = game) => md.generateLand(Object.assign({ modRoot: m, gameRoot, dependencyRoots: [], count: COUNT, seed: SEED, ownerMode: "inherit", owner: "" }, extra));
let note = null;
try { note = PAGE.runPage(["function generatedProvinceSplitNote("]).sb.generatedProvinceSplitNote; } catch (_) { note = null; }
const said = {};

try {
  console.log("\n-- 1. the mod does not own map/provinces.bmp --");
  {
    const a = mk("nobmp", { ownBmp: false }), c = mk("nobmp-ctl", { ownBmp: false });
    const r = gen(a), rc = gen(c, { splitLargeProvinces: false });
    said.notOwned = r;
    rec("(both clicks made the world)", r.changed === true && rc.changed === true, { a: r.error, c: rc.error });
    rec("⭐ the cut is skipped: the mod does not own the shapes", r.provinceSplit && r.provinceSplit.changed === false && r.provinceSplit.why === "notOwned" && !r.provinceSplit.error, r.provinceSplit);
    const d = treeDiff(tree(a), tree(c));
    rec("⭐⭐ …and the click wrote exactly the files the uncut click wrote, byte for byte", d.length === 0, d.slice(0, 8));
    rec("…the land raised whole: no row past the last, the same provinces raised", maxRow(a) === S.N && r.flippedProvinces === rc.flippedProvinces && !fs.existsSync(path.join(a, "map", "provinces.bmp")), { max: maxRow(a), f: [r.flippedProvinces, rc.flippedProvinces] });
  }

  console.log("\n-- 2. no layer below --");
  {
    const a = mk("nobelow", { ownRegions: true });
    const r = gen(a, {}, null);
    said.noLayerBelow = r;
    rec("(the click made the world over nothing)", r.changed === true, r.error);
    rec("⭐⭐ the cut is skipped: no map below sizes a province — and no typed stand-in sized it instead", r.provinceSplit && r.provinceSplit.changed === false && r.provinceSplit.why === "noLayerBelow" && !r.provinceSplit.target && maxRow(a) === S.N, r.provinceSplit);
  }

  console.log("\n-- 3. a strategic region the cut must write is read-only --");
  {
    // the regions the cut writes, in its order (the record's families, by parent), learnt from a twin that cuts
    const t = mk("ro-twin", { ownRegions: true });
    gen(t);
    const order = [];
    for (const f of md.readProvinceSplitRecord(t).families) { const r = S.regionOf(f.parent); if (!order.includes(r)) order.push(r); }
    rec("(the twin's cut writes more than one region, so one is written before the read-only one)", order.length >= 2, order);
    const a = mk("ro", { ownRegions: true }), c = mk("ro-ctl", { ownRegions: true });
    const locked = path.join(a, "map", "strategicregions", `${order[order.length - 1]}-REGION.txt`);
    fs.chmodSync(locked, 0o444); readOnly.push(locked);
    const r = gen(a), rc = gen(c, { splitLargeProvinces: false });
    said.error = r;
    const ps = r.provinceSplit || {};
    rec("⭐ the cut says it could not be written, and why — and that it put back definition.csv, provinces.bmp and the regions before",
      r.changed === true && ps.changed === false && (ps.error || "").includes(`${order[order.length - 1]}-REGION.txt`) && /read-only/.test(ps.error || "") && ps.restored === 2 + order.length - 1 && !ps.notRestored,
      { error: ps.error, restored: ps.restored, notRestored: ps.notRestored, regions: order.length });
    const ta = tree(path.join(a, "map")), tc = tree(path.join(c, "map"));
    rec("⭐⭐⭐ definition.csv, provinces.bmp and every region file are the uncut click's byte for byte, and no file is removed", treeDiff(ta, tc).length === 0 && ta.size === tc.size && ta.has(`strategicregions/${order[order.length - 1]}-REGION.txt`), treeDiff(ta, tc));
    rec("…and the land is raised whole, nothing recorded", maxRow(a) === S.N && r.flippedProvinces === rc.flippedProvinces && md.readProvinceSplitRecord(a).families.length === 0);
  }

  console.log("\n-- 4. the record cannot be written: every file put back, a created one from the copy below --");
  {
    // a wall the cut carries, so map/adjacencies.csv is created too: P and Q side by side, anchored at their far sides
    const S4 = SW.makeShapes({ big: [{ x0: 288, y0: 32, w: 48, h: 48, key: "P" }, { x0: 336, y0: 32, w: 48, h: 48, key: "Q" }] });
    const P = S4.idOf.get("P"), Q = S4.idOf.get("Q");
    const game4 = path.join(ROOT, "game4");
    const ADJ = `From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n${P};${Q};impassable;-1;-1;-1;-1;-1;;Great Wall\n-1;-1;;-1;-1;-1;-1;-1;;\n`;
    SW.makeGame(game4, S4, { adjacencies: ADJ, unitstacks: new Map([[P, [290.5, H - 1 - 56 + 0.5]], [Q, [382.5, H - 1 - 56 + 0.5]]]) });
    const mod = SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, "norecord"), S4, { name: "split skip" });
    const picked = [P, Q].concat([...S4.keyOf.keys()].filter((id) => S4.typeOf(id) === "sea").slice(0, 6)).map(String);
    // the record's folder is a FILE: the last step of the write throws
    const block = path.dirname(md.provinceSplitRecordPath(mod));
    fs.mkdirSync(path.dirname(block), { recursive: true }); fs.writeFileSync(block, "not a folder");
    const before = tree(mod);
    const model = md.buildMapModel({ modRoot: mod, gameRoot: game4, dependencyRoots: [], cacheStableLayers: true });
    const lines = fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split("\n");
    const cut = md.planGeneratedProvinceSplit({ modRoot: mod, gameRoot: game4, dependencyRoots: [], picked, lines, model, p2r: model.provinceToRegion || {}, seed: SEED });
    const w = cut.write ? md.writeGeneratedProvinceSplit({ modRoot: mod, gameRoot: game4, dependencyRoots: [], write: cut.write, picked }) : { ok: null, error: cut.report.skipped };
    fs.unlinkSync(block);   // this test's own stand-in, under its own temp folder
    const after = tree(mod), created = [...after.keys()].filter((k) => !before.has(k)).sort();
    const below = (rel) => sha(fs.readFileSync(path.join(game4, ...rel.split("/"))));
    rec("(the cut was planned, carried a wall, and its last step failed)", w.ok === false && /record of the cut could not be written/.test(w.error || "") && cut.write.regions.size >= 1, { ok: w.ok, error: w.error });
    rec("⭐⭐ every file the mod had is back, byte for byte, and none is removed", [...before.keys()].every((k) => after.get(k) === before.get(k)), [...before.keys()].filter((k) => after.get(k) !== before.get(k)));
    rec("⭐⭐⭐ every file the cut created — its regions and map/adjacencies.csv — is still there, holding the bytes of the copy below it",
      created.length === cut.write.regions.size + 1 && created.includes("map/adjacencies.csv") && created.every((k) => after.get(k) === below(k)), { created, regions: cut.write.regions.size });
    rec("…and the report names them", JSON.stringify((w.copiedFromBelow || []).slice().sort()) === JSON.stringify(created) && w.restored === 2 + created.length, { copied: w.copiedFromBelow, restored: w.restored });
    // …and through the click, whose answer is what the page words: a mod that ships no regions of its own, so the cut creates them
    const g = mk("norecord-click"), gBlock = path.dirname(md.provinceSplitRecordPath(g));
    fs.mkdirSync(path.dirname(gBlock), { recursive: true }); fs.writeFileSync(gBlock, "not a folder");
    const before2 = tree(g), r = gen(g);
    fs.unlinkSync(gBlock);
    // ⛔ #generate-land-pads-the-queue-and-re-berths-the-fleets — the click now ENDS by padding the supply queue with empty regions of its
    // own (`<id>-Nova Reserve.txt`, ids n..newN-1, as its report says), after the cut: those are the pad's new files, not the cut's.
    const q = (r.crashRepairs || {}).navalRegionQueue || {};
    const padded = new Set(Array.from({ length: Math.max(0, (q.newN || 0) - (q.n || 0)) }, (_, i) => `map/strategicregions/${q.n + i}-Nova Reserve.txt`));
    const newRegions = [...tree(g).keys()].filter((k) => !before2.has(k) && k.startsWith("map/strategicregions/")).sort();
    const made = newRegions.filter((k) => !padded.has(k)), ps = r.provinceSplit || {};
    said.copied = r;
    rec("(the click's other new regions are the queue pad's, exactly as many as it says it added — none of the cut's is set aside)",
      newRegions.filter((k) => padded.has(k)).length === (q.added || 0) && padded.size === (q.added || 0) && [...padded].every((k) => newRegions.includes(k)),
      { pad: q, padded: [...padded], newRegions });
    rec("(the click's cut failed at the record, and its answer names the region files it created, which hold the copy below's bytes)",
      r.changed === true && ps.changed === false && /record of the cut could not be written/.test(ps.error || "") && made.length > 0
      && JSON.stringify((ps.copiedFromBelow || []).filter((k) => k.startsWith("map/strategicregions/")).sort()) === JSON.stringify(made)
      && made.every((k) => sha(fs.readFileSync(path.join(g, ...k.split("/")))) === sha(fs.readFileSync(path.join(game, ...k.split("/"))))),
      { error: ps.error, copied: ps.copiedFromBelow, made });
  }

  console.log("\n-- 5. the border budget --");
  {
    const a = mk("budget3"), b = mk("budget0");
    const r3 = gen(a, { _splitBudget: 3 }), r0 = gen(b, { _splitBudget: 0 });
    said.budget = r0; said.binds = r3;
    const p3 = r3.provinceSplit || {}, p0 = r0.provinceSplit || {};
    rec("⭐ a budget of 3 cuts at most 3 more provinces", p3.changed === true && p3.newIds > 0 && p3.newIds <= 3 && p3.target.allowed === 3 && maxRow(a) === S.N + p3.newIds, { newIds: p3.newIds, target: p3.target });
    rec("⭐⭐ a budget of 0 cuts none, and says the limit is used up", p0.changed === false && p0.why === "budget" && /border limit is used up/.test(p0.skipped || "") && maxRow(b) === S.N, p0);
  }

  console.log("\n-- 6. a coast its own check refuses --");
  {
    const K = S.idOf.get(SW.brickKey(300, 100));
    const a = mk("refused", { keepLand: new Set([K]) });
    const src = path.join(ROOT, "refused-source.bmp");
    fs.copyFileSync(path.join(a, "map", "provinces.bmp"), src);
    // the break: a pixel of the land the mod kept, which never moves, handed to the province after it
    const r = gen(a, { _coastTestTamper: (ids, raster) => { const i = raster.ids.indexOf(K); if (i >= 0) ids[i] = K + 1; } });
    const ps = r.provinceSplit || {};
    rec("(the coast was refused by its check, and the cut went ahead on the bitmap as it was)", !!(r.coasts && r.coasts.refused) && ps.changed === true, { coasts: r.coasts, split: ps.changed });
    const fam = new Map();
    for (const f of md.readProvinceSplitRecord(a).families) for (const q of f.pieces) fam.set(q, f.parent);
    const def = SW.readDef(path.join(a, "map", "definition.csv"));
    const now = SW.decode(path.join(a, "map", "provinces.bmp"), def).ids;
    const was = SW.decode(src, def).ids;
    let other = 0, cut = 0;
    for (let i = 0; i < now.length; i++) { if (now[i] === was[i]) continue; if (fam.get(now[i]) === was[i]) cut++; else other++; }
    rec("⭐⭐ the bitmap differs from the source by the cut's pixels alone (and the ones the report says the X pass moved)", cut > 0 && other === (ps.movedBetweenParents || 0), { cut, other, moved: ps.movedBetweenParents });
  }

  console.log("\n-- 7. twin clicks --");
  const t1 = mk("twin1"), t2 = mk("twin2");
  const g1 = gen(t1), g2 = gen(t2);
  {
    const d = treeDiff(tree(path.join(t1, "map")), tree(path.join(t2, "map")));
    rec("⭐ two clicks on two copies cut the same: definition.csv, provinces.bmp, every region, byte for byte", g1.provinceSplit.changed === true && d.length === 0, d.slice(0, 6));
    rec("…and record the same families", JSON.stringify(md.readProvinceSplitRecord(t1).families) === JSON.stringify(md.readProvinceSplitRecord(t2).families));
  }

  console.log("\n-- 8. the record --");
  {
    const recd = md.readProvinceSplitRecord(t1), of = new Map();
    for (const f of recd.families) for (const q of f.pieces) of.set(q, f.parent);
    const newIds = SW.readDef(path.join(t1, "map", "definition.csv")).ids.filter((id) => id > S.N);
    rec("⭐⭐ the record names every new id once, under a parent that is a raised province, and the mod's last id before the cut",
      recd.definitionMaxBefore === S.N && newIds.length === g1.provinceSplit.newIds && newIds.every((q) => of.has(q) && of.get(q) <= S.N) && of.size === newIds.length && recd.families.length === g1.provinceSplit.split,
      { families: recd.families.length, pieces: of.size, newIds: newIds.length, max: recd.definitionMaxBefore });
    const maxBefore = maxRow(t1);
    // every province the first click left sea, its ocean cells among them: the second click has some to cut
    const def1 = SW.readDef(path.join(t1, "map", "definition.csv"));
    const seaLeft = def1.ids.filter((id) => id > 0 && def1.rows.get(id).type === "sea").length;
    const g3 = gen(t1, { count: seaLeft, seed: SEED + 1 });
    const again = md.readProvinceSplitRecord(t1), added = again.families.slice(recd.families.length);
    rec("⭐ a second click appends its families after the first's, from the mod's last id, and keeps the first click's last id", g3.provinceSplit && g3.provinceSplit.changed === true && again.definitionMaxBefore === S.N
      && JSON.stringify(again.families.slice(0, recd.families.length)) === JSON.stringify(recd.families) && added.length === g3.provinceSplit.split
      && Math.min(...added.flatMap((f) => f.pieces)) === maxBefore + 1 && maxRow(t1) === maxBefore + g3.provinceSplit.newIds, { second: g3.provinceSplit && { changed: g3.provinceSplit.changed, why: g3.provinceSplit.why, error: g3.provinceSplit.error }, families: again.families.length, max: again.definitionMaxBefore });
    // ⛔ a re-roll cuts a piece, or a parent, again: each family says which click cut it, by that click's last id before it
    const first = again.families.slice(0, recd.families.length);
    rec("⭐⭐ each family carries its own click's last id: the first click's S.N, the second's the first's last — and every piece is past it, every parent not",
      added.length > 0 && first.every((f) => f.definitionMaxBefore === S.N) && added.every((f) => f.definitionMaxBefore === maxBefore)
      && again.families.every((f) => f.parent <= f.definitionMaxBefore && f.pieces.every((q) => q > f.definitionMaxBefore)),
      again.families.map((f) => [f.parent, f.definitionMaxBefore, Math.min(...f.pieces)]).slice(0, 4).concat(added.map((f) => [f.parent, f.definitionMaxBefore, Math.min(...f.pieces)]).slice(0, 4)));
    said.cut = g1;
    // a click whose budget is used up on a map earlier clicks cut: those cuts count, and the page says so
    const g4 = gen(t2, { count: 5, seed: SEED + 2, _splitBudget: 0 });
    said.budgetEarlier = g4;
    rec("(control: a click on the twin the first click cut, its budget used up, is skipped for it — and its report counts the earlier pieces)",
      g4.changed === true && g4.provinceSplit && g4.provinceSplit.why === "budget" && g4.provinceSplit.target.earlierPieces === g2.provinceSplit.newIds && (said.budget.provinceSplit.target || {}).earlierPieces === 0,
      g4.provinceSplit);
  }

  console.log("\n-- 9. the regions that load name the ids a new province would take --");
  {
    // the layer below defines 4 provinces past the mod's last row, and its regions name them; this mod ships none of its own
    const S9 = SW.makeShapes({ extras: 4 });
    const game9 = path.join(ROOT, "game9");
    SW.makeGame(game9, S9);
    const a = SW.makeMod(path.join(process.env.HOI4_MODS_ROOT, "named"), S9, { name: "split skip" });
    const r = gen(a, {}, game9);
    said.idsNamedBelow = r;
    const ps = r.provinceSplit || {};
    rec("⭐⭐ the cut is skipped, and says which ids the regions name", r.changed === true && ps.changed === false && ps.why === "idsNamedBelow" && (ps.skipped || "").includes(String(S9.N + 1)) && maxRow(a) === S9.N, ps);
  }

  console.log("\n-- 11. a state id the scripts name that the parents cannot reach, and the pieces could --");
  {
    // the groups are cut, halved and owned over the PARENTS, so it is the parents that say whether a named id is in reach: with
    // the pieces counted, the click would halve every state down to one province and still stop short
    const parents = g1.flippedProvinces, pieces = g1.provinceSplit.newIds, C = parents + Math.ceil(pieces / 2);
    const game11 = path.join(ROOT, "game11");
    fs.cpSync(game, game11, { recursive: true });
    SW.write(game11, "events/ceiling.txt", `namespace = ceiling\ncountry_event = {\n\tid = ceiling.1\n\toption = {\n\t\tname = ceiling.1.a\n\t\t${C} = { add_core_of = ROOT }\n\t}\n}\n`);
    // …an id the layer below declares (the ceiling is never one it does not): a state of no land, so no province's facts move
    SW.write(game11, `history/states/${C}-CEILING.txt`, `state = {\n\tid = ${C}\n\tname = "STATE_${C}"\n\tmanpower = 1\n\tstate_category = rural\n\tprovinces = { }\n}\n`);
    const a = mk("ceiling"), c = mk("ceiling-ctl");
    const r = gen(a, {}, game11), rc = gen(c, { splitLargeProvinces: false }, game11);
    rec("(control: the scripts name a state id past the parents and within the parents and their pieces, and the click cut the same)",
      C > parents && C <= parents + pieces && r.provinceSplit.changed === true && r.flippedProvinces === parents && r.provinceSplit.newIds === pieces && (r.stateIds || {}).ceiling === C, { C, parents, pieces, ceiling: (r.stateIds || {}).ceiling });
    rec("⭐⭐ out of reach, as for the uncut click: no state is halved chasing it", (r.stateIds || {}).unreachable === true && (rc.stateIds || {}).unreachable === true && r.stateIds.halved === 0 && rc.stateIds.halved === 0 && r.createdStates === rc.createdStates,
      { cut: r.stateIds, uncut: rc.stateIds, states: [r.createdStates, rc.createdStates] });
  }

  console.log("\n-- 12. a map below that is not the base game's --");
  {
    // an add-on: its dependency ships the map (a copy of the game's), so the land a province is sized by is the dependency's
    const dep = path.join(ROOT, "dependency");
    fs.cpSync(path.join(game, "map"), path.join(dep, "map"), { recursive: true });
    SW.write(dep, "descriptor.mod", 'name="the map below"\n');
    const r = gen(mk("addon"), { dependencyRoots: [dep] });
    said.addon = r;
    rec("(control: the add-on's cut happened, sized by its dependency's land; the base game's click says the base game's)",
      r.changed === true && r.provinceSplit.changed === true && r.provinceSplit.target.belowIsGame === false && said.cut.provinceSplit.target.belowIsGame === true, r.provinceSplit && r.provinceSplit.target);
  }

  console.log("\n-- 10. the page says it --");
  rec("generatedProvinceSplitNote was lifted out of public/map.js and runs", typeof note === "function");
  if (typeof note === "function") {
    const n = (k) => note(said[k]), num = (x) => Number(x || 0).toLocaleString();
    rec("⭐ not owned: the mod does not own the shapes", /does not own map\/provinces\.bmp and map\/definition\.csv/.test(n("notOwned")), n("notOwned"));
    rec("⭐ no layer below: nothing to size a province by", /no map below this mod to size a land province by/.test(n("noLayerBelow")), n("noLayerBelow"));
    // ⛔ Nova's budget, not the game's limit (Old World Blues ships 65,460 borders and loads), and the earlier cuts only where there were some
    const tb = said.budget.provinceSplit.target;
    rec("⭐⭐ the budget: NOVA's budget is used up, the borders the map has against it — and no earlier cut is blamed where there was none",
      /Nova's province border budget is used up/.test(n("budget")) && n("budget").includes(`The map has ${num(tb.segmentsBefore)} province borders, against the ${num(tb.limit)} Nova keeps a map under.`)
      && !/earlier/.test(n("budget")) && !/the game can show/.test(n("budget")), n("budget"));
    const te = said.budgetEarlier.provinceSplit.target;
    // ⛔ #delete-map-gives-back-the-cut — Delete map gives them back now (test-delete-map-gives-back-the-cut-provinces.js), and the line says so
    rec("⭐⭐ …and where earlier clicks did cut, it says how many provinces of the map they cut, which Delete map gives back",
      n("budgetEarlier").includes(`the ${num(te.earlierPieces)} provinces earlier clicks cut among them: Delete map gives those back before a new world is generated`), n("budgetEarlier"));
    // ⛔ after a cut where the budget binds, the borders the map has AFTER it — not the count before the cut
    const tc = said.binds.provinceSplit.target;
    rec("(control: the budget of 3 binds, and the cut changed the border count)", tc.binds === true && said.binds.provinceSplit.changed === true && tc.segmentsAfter !== tc.segmentsBefore, tc);
    rec("⭐⭐ a cut the budget held back says the borders the map has after it", n("binds").includes(`The map has ${num(tc.segmentsAfter)} province borders, against the ${num(tc.limit)}`) && !n("binds").includes(`has ${num(tc.segmentsBefore)} `), n("binds"));
    // ⛔ "put back" only when something had been written
    rec("⭐ a cut that failed after writing: not written, and what it wrote was put back", /could not be written/.test(n("error")) && /was put back/.test(n("error")) && !/nothing had been written/.test(n("error")) && said.error.provinceSplit.restored > 0, n("error"));
    // the answer a throw in the PLAN leaves (generateLand's catch round planGeneratedProvinceSplit: { changed: false, error }) —
    // nothing was written, so nothing was put back
    const planThrow = note({ provinceSplit: { changed: false, error: "no free province colour left" } });
    rec("⭐⭐ a cut that failed before it wrote anything says so, not that anything was put back", /could not be written \(no free province colour left\), and nothing had been written\./.test(planThrow) && !/put back/.test(planThrow), planThrow);
    // ⛔ a failed cut's copies of the map below are said, not left silent (PLAN §6.14)
    const cp = said.copied.provinceSplit.copiedFromBelow || [];
    rec("⭐⭐ a failed cut that had made files the map below provides says how many, names them, and that the mod now holds copies of them",
      cp.length > 0 && n("copied").includes(`It had made ${num(cp.length)} files the map below provides (${cp.slice(0, 3).join(", ")}`) && /will not follow an update of that map/.test(n("copied")), n("copied"));
    rec("…and one that made none says nothing of copies", !/It had made/.test(n("error")) && !(said.error.provinceSplit.copiedFromBelow || []).length, n("error"));
    rec("⭐ the ids the regions name", n("idsNamedBelow").includes(String(SW.makeShapes({ extras: 4 }).N + 1)) && /left whole/.test(n("idsNamedBelow")), n("idsNamedBelow"));
    rec("…and a cut says what it cut, by the base game's land", n("cut").startsWith(` Provinces: cut ${said.cut.provinceSplit.split.toLocaleString()} ocean-sized`) && /about the base game's size \(its land averages/.test(n("cut")), n("cut"));
    // ⛔ an add-on's provinces are sized by its dependency's land (Millennium Dawn's 306.7 px), which is not the base game's
    rec("⭐⭐ an add-on's cut says it was sized by the map below, not the base game", /about the map below's size \(its land averages/.test(n("addon")) && !/base game/.test(n("addon")), n("addon"));
  }
} catch (e) {
  rec("the test ran to the end", false, String((e && e.stack) || e).slice(0, 800));
} finally {
  for (const f of readOnly) { try { fs.chmodSync(f, 0o666); } catch (_) {} }
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}   // this test's own temp folder — never a mod directory (⛔ CLAUDE.md #1)
}
console.log(`\n=== a split is skipped where it cannot be done: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
