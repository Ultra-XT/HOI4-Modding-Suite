// #a-rebuilt-world-needs-its-own-regions — Redraw strategic regions, on a small world built over a base game whose regions
// were drawn for OTHER geography (testlib-region-rebuild-world.js). The owner played such a world (TEST 26) and saw the air
// map follow Earth's regions, seas without a naval card, and a Caspian that was not a sea. The redraw must fix all three
// WITHOUT breaking any rule the engine holds a region layout to:
//   · every province in exactly one region · no state across two regions · no sea-bearing region in two pieces over the
//     engine's graph (fractioned_naval_region refuses the map) · no hole in the ids · the naval supply queue within 70% ·
//     no sea region carrying snow, blizzard or sandstorm · one region per file Nova creates
// …and the three observations: land and sea in separate regions, the ringed lake made sea (with sea unit-stack rows), and
// the lakes that must stay lakes left alone.
//
// Back-out control (run by hand, 2026-09-24): with the island gate removed from planStrategicRegions — every small island
// joins its best-scoring sea region whatever it does to that region's shape — the two-islet state lands in one sea region
// while facing the other, and the "no fractioned region" checks below fail.
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { makeRegionWorld, treeHash, PROV } = require("./testlib-region-rebuild-world.js");

const W = makeRegionWorld("rules");
process.env.APPDATA = path.join(W.ROOT, "appdata");
process.env.NOVA_APP_DATA_DIR = process.env.APPDATA;
const md = require("./map-data.js");

const roots = { modRoot: W.MOD, gameRoot: W.GAME, dependencyRoots: [] };
// Scaled to the fixture: vanilla-sized targets would make one region per continent and one per sea.
const opts = { landPx: 6000, openSeaPx: 15000, coastEdges: 200, islandPx: 2500 };
let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

// ── before: the inherited layout is the base game's — the shape the owner saw ──
const m0 = md.buildMapModel(roots);
ok(m0.strategicRegions.length === 7, `the mod inherits the base game's 7 regions (got ${m0.strategicRegions.length})`);

const dry = md.rebuildStrategicRegions({ ...roots, dryRun: true, opts });
ok(dry.ok && dry.dryRun, `a dry run answers with a plan: ${JSON.stringify(dry).slice(0, 400)}`);
const before = treeHash(W.MOD);
ok(dry.summary.coastDrawnAfter > dry.summary.coastDrawnBefore, `the redraw draws more of the coast as a region border (${dry.summary.coastDrawnBefore}% → ${dry.summary.coastDrawnAfter}%)`);
ok(dry.summary.lakesToSea === 2 && [PROV.lakeSea, PROV.lakeIslet].every((p) => dry.summary.lakesToSeaSample.includes(p)),
  `exactly two lakes become sea — the one the sea rings and the one beside the islet (got ${dry.summary.lakesToSea}: ${dry.summary.lakesToSeaSample})`);
ok(JSON.stringify(treeHash(W.MOD)) === JSON.stringify(before), "a dry run writes nothing");

const res = md.rebuildStrategicRegions({ ...roots, opts });
ok(res.ok, `the redraw is written: ${JSON.stringify(res).slice(0, 600)}`);

// ── after: read back through the model, as the editor and the validators do ──
const m = md.buildMapModel(roots);
const type = new Map(m.provinces.map((p) => [+p.id, p.type]));
const listed = new Map();
for (const r of m.strategicRegions) for (const p of r.provinces) listed.set(p, (listed.get(p) || 0) + 1);
const without = W.ALL.filter((p) => !listed.has(p));
ok(without.length === 0, `every province is in a region (missing: ${without.slice(0, 5)})`);
ok([...listed.values()].every((n) => n === 1), "no province is in two regions");
const p2r = m.provinceToRegion;
const split = W.states.filter((provs) => new Set(provs.map((p) => p2r[p])).size > 1);
ok(split.length === 0, `no state spans two regions (${split.length})`);
const ids = m.strategicRegions.map((r) => +r.id).sort((a, b) => a - b);
ok(ids[0] === 1 && ids.every((id, i) => id === i + 1), `region ids run 1..${ids[ids.length - 1]} with no hole (${ids})`);

const graph = md.provinceNeighbourGraph({ ...roots, model: m });
// the engine's flood (0x1401F1160 in hoi4.exe 1.19.4.1): every listed province carries it, over pixels + every adjacencies row — written out
// here rather than borrowed from the code under test
const pieces = (members) => { const inR = new Set(members), seen = new Set(); let n = 0; for (const s of members) { if (seen.has(s)) continue; n++; const q = [s]; seen.add(s); while (q.length) { const c = q.pop(); for (const x of graph.get(c) || []) if (inR.has(x) && !seen.has(x)) { seen.add(x); q.push(x); } } } return n; };
const fractioned = m.strategicRegions.filter((r) => r.provinces.some((p) => type.get(p) === "sea") && pieces(r.provinces) > 1);
ok(fractioned.length === 0, `no sea-bearing region is in two pieces (${fractioned.map((r) => r.id)})`);
const frDry = md.fixFractionedRegions({ ...roots, dryRun: true });
ok(!frDry || !(frDry.moved || (frDry.moves && frDry.moves.length)), `the fractioned-region fixer finds nothing to move: ${JSON.stringify(frDry).slice(0, 200)}`);
const bitmapRules = md.validateMapBitmap(roots);
const bitmapProblems = (bitmapRules && (bitmapRules.problems || bitmapRules)) || [];
const ruleIds = new Set((Array.isArray(bitmapProblems) ? bitmapProblems : []).map((p) => p.rule));
for (const r of ["fractioned_naval_region", "naval_region_queue_overflows", "province_no_region", "strategic_region_id_gap"]) ok(!ruleIds.has(r), `validateMapBitmap raises no ${r}`);
const modelRules = new Set((md.validateMapModel(m).problems || md.validateMapModel(m) || []).map((p) => p.rule));
for (const r of ["state_split_strategic_regions", "province_no_region", "province_in_two_regions", "strategic_region_id_gap"]) ok(!modelRules.has(r), `validateMapModel raises no ${r}`);

const q = md.navalRegionQueueDemand({ ...roots, model: m });
ok(q && q.queue <= 0.7 * q.n, `the naval supply queue fits: ${q && q.queue} of ${q && q.n}`);

// land and sea apart: no region holds both land and sea except a sea region holding a small island
const kind = (r) => { let land = 0, sea = 0; for (const p of r.provinces) { if (type.get(p) === "land") land++; else if (type.get(p) === "sea") sea++; } return { land, sea }; };
const mixed = m.strategicRegions.filter((r) => { const k = kind(r); return k.land && k.sea; });
ok(mixed.every((r) => r.provinces.includes(PROV.islet) && kind(r).land === 1), `the only mixed region is a sea region holding the one-province islet (${mixed.map((r) => r.id + ":" + JSON.stringify(kind(r)))})`);
ok(p2r[PROV.isletA] === p2r[PROV.isletB] && kind(m.strategicRegions.find((r) => r.id === p2r[PROV.isletA])).sea === 0,
  "the state on two islets facing different seas gets a land region of its own — joining either sea would cut it in two");

// the lakes
ok(type.get(PROV.lakeSea) === "sea", "the lake the sea rings is sea now (the Caspian's case)");
const row = fs.readFileSync(path.join(W.MOD, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.startsWith(PROV.lakeSea + ";")).split(";");
ok(row[6] === "ocean" && row[7] === "0", `…with terrain ocean and continent 0 (${row.join(";")})`);
// a sea row's coastal column means "touches land" (vanilla 3,128 of 3,133; MD and OWB every one; the Caspian-as-sea maps write
// `sea;true;ocean`): false for the lake the sea rings, true for the one beside the islet
ok(row[5] === "false", `…and not coastal: it touches no land (${row.join(";")})`);
const rowI = fs.readFileSync(path.join(W.MOD, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.startsWith(PROV.lakeIslet + ";")).split(";");
ok(rowI[4] === "sea" && rowI[5] === "true", `⭐ the lake beside the islet is sea AND coastal — it touches land (${rowI.join(";")})`);
ok(type.get(PROV.lakeLand) === "lake", "the lake the land rings stays a lake");
ok(type.get(PROV.lakeState) === "lake", "the lake inside a state stays a lake");
ok(type.get(PROV.lakeShore) === "lake", "the shore lake whose land neighbour touches no other sea stays a lake — turning it would make land coastal with no port");
const us = md.findUnitStackMismatches ? md.findUnitStackMismatches({ ...roots }) : null;
if (us) ok(!(us.seaMissingFloor || []).some((r) => r.province === PROV.lakeSea), "the new sea province carries the sea unit-stack rows");
const stacks = fs.readFileSync(path.join(W.MOD, "map", "unitstacks.txt"), "utf8").split(/\r?\n/).filter((l) => l.startsWith(PROV.lakeSea + ";")).map((l) => +l.split(";")[1]);
ok([0, 1, 2, 9, 10, 11, 12, 21, 22, 23, 30, 31, 38].every((t) => stacks.includes(t)), `…every one of the thirteen a sea province carries (${stacks})`);

// weather: a sea region never takes snow from a donor
const dir = path.join(W.MOD, "map", "strategicregions");
const files = fs.readdirSync(dir);
for (const f of files) {
  const txt = fs.readFileSync(path.join(dir, f), "utf8");
  const blocks = md.strategicRegionBlocksIn(txt);
  ok(blocks.length <= 1, `${f} holds at most one region (${blocks.length})`);
  if (!blocks.length) continue;
  const provs = ((/provinces\s*=\s*\{([^}]*)\}/.exec(blocks[0].body) || [])[1] || "").match(/\d+/g) || [];
  const sea = provs.some((p) => type.get(+p) === "sea");
  const snow = /(^|[^A-Za-z_])snow\s*=\s*0*\.?0*[1-9]/.test(blocks[0].body);
  if (sea) ok(!snow, `${f} is a sea region and carries no snow`);
  // a region named after a base region takes that region's OWN key, so its translations keep resolving; a name Nova makes up
  // is NOVA_REGION_<id> (which kind of base region it may take is checked with the names below)
  ok(/name\s*=\s*"(NOVA_REGION_\d+|STRATEGICREGION_[1-7])"/.test(blocks[0].body), `${f} is named by a NOVA_REGION_ key or a base region's own key`);
}
// names: a region is never named after a base region of the OTHER kind. In the fixture the base game's water regions are
// 1 West Sea, 5 East Sea and 6 Mid Sea, its land regions 2 Old Continent (drowned in the mod), 3 A North and 4 A South. A sea
// takes the water region it covers most of at any share — the Caspian's case, whose four provinces are a small part of their
// new sea region (TEST 28 named it "State 818 Sea" while this asked for half) — and never "Old Continent".
{
  const WATER = new Set([1, 5, 6]), LANDB = new Set([2, 3, 4]);
  const named = res.regionsNamed || [];
  ok(named.length === m.strategicRegions.filter((r) => r.provinces.length).length, `every region that holds provinces is handed a name (${named.length})`);
  const wrongKind = named.filter((n) => n.nameFrom && n.nameFrom.baseRegion != null && !(n.cls === "sea" ? WATER : LANDB).has(n.nameFrom.baseRegion));
  ok(wrongKind.length === 0, `⭐ no region is named after a base region of the other kind (${JSON.stringify(wrongKind)})`);
  const seaNamed = named.filter((n) => n.cls === "sea");
  ok(seaNamed.length > 0 && seaNamed.every((n) => n.nameFrom && (WATER.has(n.nameFrom.baseRegion) || n.nameFrom.sea)), `every sea region is named from base water or from its coast (${JSON.stringify(seaNamed.map((n) => n.nameFrom))})`);
}
// ids from the layer below: the region holding continent A's north keeps the base id it overlaps most
ok([3, 4].includes(p2r[W.idAt(4, 0)]), `continent A's north keeps a base id it overlapped (3 or 4; got ${p2r[W.idAt(4, 0)]})`);

// weatherpositions: two rows for every region that holds provinces, each inside its region
const wp = fs.readFileSync(path.join(W.MOD, "map", "weatherpositions.txt"), "utf8").split(/\r?\n/).filter((l) => l.split(";").length >= 5);
const rowsFor = new Map();
for (const l of wp) { const c = l.split(";"); rowsFor.set(+c[0], (rowsFor.get(+c[0]) || []).concat([[+c[1], +c[3]]])); }
const cellOf = (x, z) => W.idAt(Math.floor(x / 32), Math.floor((255 - z) / 32));
for (const r of m.strategicRegions) {
  if (!r.provinces.length) continue;
  const rs = rowsFor.get(+r.id) || [];
  ok(rs.length === 2, `region ${r.id} has two weather rows (${rs.length})`);
  ok(rs.every(([x, z]) => p2r[cellOf(x, z)] === +r.id), `region ${r.id}'s weather rows sit inside it`);
}

// nothing was deleted: every file there before is still there
const after = treeHash(W.MOD);
ok(Object.keys(before).every((f) => f in after), "the redraw deleted no file");
// a backup copy of every file it overwrote
ok(res.backups && fs.existsSync(path.join(res.backups, "map", "definition.csv")), `definition.csv was copied into the redraw's backup folder first (${res.backups})`);

// ── regions_ignore_the_coastline: the warning that sends a modder to the button. Silent on every shipping map (the corpus
// test holds those numbers); here it must FIRE on a layout that ignores the coast entirely — one region swallowing the whole
// map, the base game's other files shadowed empty — and go quiet after the redraw. ──
{
  const C = makeRegionWorld("coastline");
  const cRoots = { modRoot: C.MOD, gameRoot: C.GAME, dependencyRoots: [] };
  const regionDir = path.join(C.MOD, "map", "strategicregions");
  fs.mkdirSync(regionDir, { recursive: true });
  fs.writeFileSync(path.join(regionDir, "1-West Sea.txt"), `strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ ${C.ALL.join(" ")} }\n\tweather={ }\n}\n`);
  for (const f of fs.readdirSync(path.join(C.GAME, "map", "strategicregions"))) if (!f.startsWith("1-")) fs.writeFileSync(path.join(regionDir, f), `strategic_region={\n\tid=${parseInt(f, 10)}\n\tname="R${parseInt(f, 10)}"\n\tprovinces={ }\n\tweather={ }\n}\n`);
  const share = md.coastRegionBorderShare({ ...cRoots });
  ok(share && share.share === 0, `one region over the whole map draws none of the coast (${JSON.stringify(share)})`);
  const fired = (md.validateMapBitmap(cRoots) || []).find((p) => p.rule === "regions_ignore_the_coastline");
  ok(fired && fired.severity === "warning" && /Redraw regions/.test(fired.message), `⭐ the coastline rule fires, as a warning that names the button: ${JSON.stringify(fired).slice(0, 200)}`);
  const labels = require("./public/map-rule-labels.js");
  ok(!labels.isFatalRule("regions_ignore_the_coastline"), "…and it is not in the fatal set — the game loads such a map (TEST 26 played nine months)");
  const r = md.rebuildStrategicRegions({ ...cRoots, opts });
  ok(r.ok, `the redraw is written over the swallowing region: ${JSON.stringify(r).slice(0, 300)}`);
  ok(!(md.validateMapBitmap(cRoots) || []).some((p) => p.rule === "regions_ignore_the_coastline"), "⭐ after the redraw the coastline rule is silent");
}

// ── the redraw deletes nothing, by construction: no delete call anywhere in its code ──
{
  const { stripJsComments } = require("./testlib-strip-comments.js");
  const src = stripJsComments ? stripJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8")) : fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const from = src.indexOf("function provincePixelStats("), to = src.indexOf("module.exports = {");
  const block = from > 0 && to > from ? src.slice(from, to) : "";
  ok(block.length > 20000, `the redraw's code was found (${block.length} chars)`);
  ok(!/\b(rmSync|unlinkSync|rmdirSync|unlink|rm)\s*\(/.test(block), "⭐ the redraw's code calls no delete — a failed write is put back by copying over, never by removing");
}

console.log(`✓ test-a-rebuilt-world-keeps-the-engine-rules.js — ${pass} checks`);
