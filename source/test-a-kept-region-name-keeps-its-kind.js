// ⛔ #a-kept-name-keeps-its-kind — REDRAW KEEPS A MODDER'S REGION KEY ONLY ON THE REGION IT NAMED.
//
// #a-redraw-keeps-the-modders-names made the redraw keep a region's name key when the key is the modder's and the region "stays
// where it was". An independent review of that change (09-29) found "stays" too loose, each reproduced on the pure planner:
//   · a kept NOVA_REGION_<n> on region m ≠ n: region n takes its own key whatever else happens, so two live regions carried it,
//     the gate region_name_key_twice refused, and every later Redraw — dry run included — answered 400 with nothing in the UI
//     that could change a block's key;
//   · a kept key crossed KINDS: rename "North Sea" to "Mare Germanicum", raise land there, redraw — the new land was called
//     "Mare Germanicum". A province keeps its id and its region through Generate land, the brush and Delete map; only its kind
//     changes, and 34 of vanilla's 94 sea regions carry no naval_terrain to say what they were;
//   · "half of the new region was in the old one" is one way only: the one-province piece of a split region kept the whole
//     region's name, and the nine-province bulk lost it;
//   · NOVA_RESERVED_REGION_<id> (the empty regions fixNavalRegionQueue adds) counted as a key someone else wrote.
// Now the redraw records what each region it writes WAS (sea or land, with its key) beside the names it records, and a key is
// kept only on a region of the same kind that is mostly the same ground both ways.
//
// Part 1 drives the pure planner on the reviewer's own fixtures, each with a control that keeps. Part 2 drives the endpoint with
// the body public/map.js sends, so the record is written, read back and honoured through the real path.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { makeRegionWorld } = require("./testlib-region-rebuild-world.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 600))); fails.push(name); }
};

const G = makeRegionWorld("keepkind", { baseLoc: true });
process.env.HOI4_ROOT = G.GAME;
process.env.HOI4_MODS_ROOT = path.dirname(G.MOD);
if (!process.env.NOVA_APP_DATA_DIR) { process.env.APPDATA = path.join(G.ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; }

const md = require("./map-data.js");

// ── Part 1: the planner ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Every province a 100x100 block laid out on a row; adjacency only inside `groups` (the reviewer's probe, read-only).
function world({ types, baseType, groups, baseRegions, curRegion, states }) {
  const ids = Object.keys(types).map(Number);
  const pix = new Map(), cx = new Map(), cy = new Map(), edges = new Map(), graph = new Map();
  ids.forEach((p, i) => { pix.set(p, 10000); cx.set(p, 150 + i * 300); cy.set(p, 500); edges.set(p, new Map()); graph.set(p, new Set()); });
  for (const g of groups) for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i], b = g[i + 1];
    edges.get(a).set(b, 100); edges.get(b).set(a, 100); graph.get(a).add(b); graph.get(b).add(a);
  }
  const stats = { W: 4000, H: 2000, pix, cx, cy, edges };
  const model = {
    provinces: ids.map((id) => ({ id, type: types[id] })),
    states: states.map((s) => ({ id: s.id, provinces: s.provinces, name: `STATE_${s.id}` })),
    provinceToState: Object.fromEntries(states.flatMap((s) => s.provinces.map((p) => [p, s.id]))),
    provinceToRegion: curRegion,
  };
  const byId = new Map(), regionOf = new Map();
  for (const b of baseRegions) {
    let lp = 0, sp = 0;
    for (const p of b.members) { regionOf.set(p, b.id); if (baseType[p] === "land") lp += 10000; else sp += 10000; }
    byId.set(b.id, { id: b.id, nameKey: b.nameKey, file: `${b.id}-x.txt`, members: b.members, lp, sp, px: lp + sp, pos: [0, 500],
      cls: sp > 0 && sp / (lp + sp) >= 0.8 ? "sea" : (sp === 0 && lp > 0 ? "land" : "other"), body: null, navalTerrain: "", staticModifiers: "" });
  }
  const base = { typeOf: (p) => baseType[p], regionOf, byId, maxId: Math.max(...baseRegions.map((b) => b.id)), fromBelow: true };
  return { model, stats, graph, retyped: new Set(), base };
}
const keyOfPlan = (plan, id) => { const r = plan.regions.find((x) => x.id === id); return r ? r.nameKey : null; };
const keptIn = (plan, id) => { const r = plan.regions.find((x) => x.id === id); return !!(r && r.nameFrom && r.nameFrom.kept); };

console.log("\n[1a] another region's own NOVA_REGION_<n> is never kept");
{
  const W = world({
    types: { 1: "land", 2: "land", 3: "land", 4: "land" }, baseType: { 1: "land", 2: "land", 3: "land", 4: "land" },
    groups: [[1, 2], [3, 4]],
    baseRegions: [{ id: 1, nameKey: "NOVA_REGION_2", members: [1, 2] }, { id: 2, nameKey: "NOVA_REGION_9", members: [3, 4] }],
    curRegion: { 1: 1, 2: 1, 3: 2, 4: 2 },
    states: [{ id: 1, provinces: [1, 2] }, { id: 2, provinces: [3, 4] }],
  });
  const ctrl = md.planStrategicRegions({ ...W, opts: { nameAfterStates: [2], keepNameKeys: new Map([[1, "MY_KEY"]]) } });
  rec("(CONTROL: in this world region 1 keeps a key of the modder's)", keptIn(ctrl, 1) && keyOfPlan(ctrl, 1) === "MY_KEY", ctrl.regions.map((r) => [r.id, r.nameKey]));
  const plan = md.planStrategicRegions({ ...W, opts: { nameAfterStates: [2], keepNameKeys: new Map([[1, "NOVA_REGION_2"]]) } });
  rec("⭐⭐⭐ region 1 does not keep NOVA_REGION_2, which region 2 takes as its own", !keptIn(plan, 1) && keyOfPlan(plan, 1) !== "NOVA_REGION_2" && keyOfPlan(plan, 2) === "NOVA_REGION_2", plan.regions.map((r) => [r.id, r.nameKey]));
  const twice = md.regionRebuildGates(plan, { ...W, weatherBodyOf: () => null }).filter((g) => g.gate === "region_name_key_twice");
  rec("⭐⭐ …so the gate that refused every redraw after it has nothing to refuse", twice.length === 0, twice);
}

console.log("\n[1b] a key is kept only on a region of the kind it named");
{
  const W = world({
    types: { 1: "land", 2: "land", 3: "land", 4: "land" }, baseType: { 1: "sea", 2: "sea", 3: "land", 4: "land" },
    groups: [[1, 2], [3, 4]],
    baseRegions: [{ id: 5, nameKey: "STRATEGICREGION_5", members: [1, 2] }, { id: 6, nameKey: "STRATEGICREGION_6", members: [3, 4] }],
    curRegion: { 1: 5, 2: 5, 3: 6, 4: 6 },
    states: [{ id: 1, provinces: [1, 2] }, { id: 2, provinces: [3, 4] }],
  });
  const keep = new Map([[5, "MY_EAST_SEA"]]);
  const ctrl = md.planStrategicRegions({ ...W, opts: { keepNameKeys: keep, regionKindBefore: new Map([[5, "land"]]) } });
  rec("(CONTROL: a land region that was land keeps the key)", keptIn(ctrl, 5) && keyOfPlan(ctrl, 5) === "MY_EAST_SEA", ctrl.regions.map((r) => [r.id, r.cls, r.nameKey]));
  const plan = md.planStrategicRegions({ ...W, opts: { keepNameKeys: keep, regionKindBefore: new Map([[5, "sea"]]) } });
  const r5 = plan.regions.find((r) => r.id === 5);
  rec("(precondition: region 5 is land now)", r5 && r5.cls === "land", r5 && r5.cls);
  rec("⭐⭐⭐ land raised where a sea was does not keep the sea's key", !keptIn(plan, 5) && keyOfPlan(plan, 5) !== "MY_EAST_SEA", { key: keyOfPlan(plan, 5), from: r5 && r5.nameFrom });
  rec("⭐ …and the planner says so to the name writer: the region does not stay", r5 && r5.stays === false, r5 && r5.stays);
}

console.log("\n[1c] a split region's name goes with the bulk, never with a sliver");
{
  const types = {}, bt = {};
  for (let p = 1; p <= 10; p++) { types[p] = "land"; bt[p] = "land"; }
  const all10 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const states = all10.map((p) => ({ id: p, provinces: [p] }));
  const cur = Object.fromEntries(all10.map((p) => [p, 1]));
  const layout = (curRegion) => world({
    types, baseType: bt, groups: [[1], [2, 3, 4, 5, 6, 7, 8, 9, 10]],
    baseRegions: [{ id: 1, nameKey: "STRATEGICREGION_1", members: [1] }, { id: 2, nameKey: "STRATEGICREGION_2", members: [2, 3, 4, 5, 6, 7, 8, 9, 10] }],
    curRegion, states,
  });
  // the same planned one-province region, when that province WAS the whole of region 1
  const ctrl = md.planStrategicRegions({ ...layout(Object.fromEntries(all10.map((p) => [p, p === 1 ? 1 : 2]))), opts: { keepNameKeys: new Map([[1, "MY_BIG"]]) } });
  rec("(CONTROL: a one-province region that was the whole of its region keeps the key)", keptIn(ctrl, 1) && keyOfPlan(ctrl, 1) === "MY_BIG", ctrl.regions.map((r) => [r.id, r.provinces.length, r.nameKey]));
  const split = layout(cur);
  const plan = md.planStrategicRegions({ ...split, opts: { keepNameKeys: new Map([[1, "MY_BIG"]]) } });
  rec("(precondition: id 1 is now a one-province piece of the old ten)", (plan.regions.find((r) => r.id === 1) || {}).provinces.length === 1, plan.regions.map((r) => [r.id, r.provinces.length]));
  rec("⭐⭐ the one-province piece does not keep the ten-province region's key", !keptIn(plan, 1) && keyOfPlan(plan, 1) !== "MY_BIG", plan.regions.map((r) => [r.id, r.provinces.length, r.nameKey]));
}

// ── Part 2: the endpoint ────────────────────────────────────────────────────────────────────────────────────────────────────
const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const at = MASKED.indexOf('$("mapRedrawConfirmBtn").addEventListener');
const handler = at < 0 ? "" : MAP.slice(at, MASKED.indexOf("addEventListener(", at + 30));
const bodyText = (/fetch\("\/api\/map\/rebuild-regions",[^]*?body:\s*JSON\.stringify\((\{[^}]*\})\)/.exec(handler) || [])[1] || "";
rec("(the dialog's request body was found in public/map.js)", /confirm:\s*true/.test(bodyText), bodyText);
const redrawBody = vm.runInNewContext("(" + bodyText + ")", { modPath: () => G.MOD });

const { createApp } = require("./server.js");
const roots = { modRoot: G.MOD, gameRoot: G.GAME, dependencyRoots: [] };
const REG_DIR = path.join(G.MOD, "map", "strategicregions");
const blockOf = (id) => {
  for (const f of fs.readdirSync(REG_DIR)) {
    const abs = path.join(REG_DIR, f);
    const text = fs.readFileSync(abs, "utf8");
    const b = md.strategicRegionBlocksIn(text).find((x) => x.id === id);
    if (b) return { abs, text, b };
  }
  return null;
};
const keyOf = (id) => { const k = blockOf(id); if (!k) return ""; const m = /\bname\s*=\s*"?([A-Za-z0-9_.]+)"?/.exec(k.text.slice(k.b.start, k.b.end)); return m ? m[1] : ""; };
const editBlock = (id, fn) => { const k = blockOf(id); if (!k) return false; fs.writeFileSync(k.abs, k.text.slice(0, k.b.start) + fn(k.text.slice(k.b.start, k.b.end)) + k.text.slice(k.b.end)); return true; };
const setBlockKey = (id, key) => editBlock(id, (block) => (/\bname\s*=/.test(block) ? block.replace(/\bname\s*=\s*"?[A-Za-z0-9_.]+"?/, () => `name="${key}"`) : block.replace(/\bid\s*=\s*\d+/, (m) => `${m}\n\tname="${key}"`)));
const RECORD = md.regionNameRecordPath(G.MOD);
const readRecord = () => { try { return JSON.parse(fs.readFileSync(RECORD, "utf8")); } catch (_) { return null; } };
const setKinds = (fn) => { const r = readRecord() || {}; r["#kinds"] = fn(r["#kinds"] || {}); fs.writeFileSync(RECORD, JSON.stringify(r, null, 1)); };

(async () => {
  let server = null;
  try {
    server = await new Promise((res, rej) => { const s = createApp().listen(0, "127.0.0.1", () => res(s)); s.on("error", rej); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body) => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (x) => ({ status: x.status, body: await x.json().catch(() => ({})) }));
    const redraw = async (label) => {
      const r = await post("/api/map/rebuild-regions", redrawBody);
      rec(`(${label}: the redraw is written)`, r.status === 200 && r.body.ok === true, r.body);
      return r;
    };

    console.log("\n[2a] the redraw records what each region it wrote was");
    await redraw("first redraw");
    let m = md.buildMapModel(roots);
    const N = m.provinceToRegion[G.idAt(4, 0)], E = m.provinceToRegion[G.idAt(14, 0)], Wst = m.provinceToRegion[G.idAt(7, 0)];
    rec("(precondition: the north of continent A and the east and west seas are three regions)", N != null && E != null && Wst != null && new Set([N, E, Wst]).size === 3, { N, E, Wst });
    const kinds = (readRecord() || {})["#kinds"] || {};
    rec("⭐⭐ the record says which is land and which is sea, with the key each was written under",
      kinds[N] && kinds[N][1] === "land" && kinds[N][0] === keyOf(N) && kinds[E] && kinds[E][1] === "sea" && kinds[Wst] && kinds[Wst][1] === "sea", { N: kinds[N], E: kinds[E], W: kinds[Wst], keyN: keyOf(N) });

    console.log("\n[2b] a key of the modder's is kept on the sea it named — and not once that region is recorded as land");
    rec("(the modder writes a key of their own into the east sea's block, with a line in their own localisation)", setBlockKey(E, "MY_EAST_SEA"), null);
    const ownLoc = path.join(G.MOD, "localisation", "english", "my_regions_l_english.yml");
    fs.mkdirSync(path.dirname(ownLoc), { recursive: true });
    fs.writeFileSync(ownLoc, "﻿l_english:\n MY_EAST_SEA:0 \"The Modder's Sea\"\n");
    await redraw("redraw with the modder's key");
    rec("(CONTROL: the sea keeps the modder's key)", keyOf(E) === "MY_EAST_SEA", keyOf(E));
    rec("(…and the record now holds it as a sea)", (((readRecord() || {})["#kinds"] || {})[E] || [])[0] === "MY_EAST_SEA", ((readRecord() || {})["#kinds"] || {})[E]);
    setKinds((k) => Object.assign(k, { [E]: ["MY_EAST_SEA", "land"] }));
    await redraw("redraw after the region is recorded as land");
    rec("⭐⭐⭐ a sea recorded as land when that key was given does not keep it", keyOf(E) !== "MY_EAST_SEA", keyOf(E));

    console.log("\n[2c] a record counts only while the block has the key it was made under; with none, a block that carries naval_terrain was a sea");
    rec("(the modder gives the north of continent A a key of their own)", setBlockKey(N, "MY_NORTH"), null);
    fs.writeFileSync(ownLoc, "﻿l_english:\n MY_EAST_SEA:0 \"The Modder's Sea\"\n MY_NORTH:0 \"The Modder's North\"\n");
    // what a redraw recorded for this id under another key: the modder has rewritten the block since, so it says nothing of it
    setKinds(() => ({ [N]: ["SOME_OTHER_KEY", "sea"] }));
    await redraw("redraw with a record made under another key");
    rec("(CONTROL: the land keeps it — a record made under another key is not this block's)", keyOf(N) === "MY_NORTH", keyOf(N));
    setKinds(() => ({}));
    rec("(the north's block is given a naval_terrain)", editBlock(N, (block) => block.replace(/\bprovinces\s*=/, (x) => `naval_terrain=water_shallow_sea\n\t${x}`)), null);
    await redraw("redraw of a land region whose block says it was a sea");
    rec("⭐⭐ a land region whose block says it was a sea does not keep that block's key", keyOf(N) !== "MY_NORTH", keyOf(N));

    console.log("\n[2d] NOVA_RESERVED_REGION_<id> is Nova's key, not the modder's");
    rec("(the west sea's block carries the key fixNavalRegionQueue gives an empty region)", setBlockKey(Wst, `NOVA_RESERVED_REGION_${Wst}`), null);
    await redraw("redraw over a reserved key");
    rec("⭐⭐ the redraw names it like any region of its own", keyOf(Wst) !== `NOVA_RESERVED_REGION_${Wst}` && keyOf(Wst) !== "", keyOf(Wst));

    console.log("\n[2e] a record Nova cannot read is never written over (second review)");
    // written fresh over it, the record would hold only this click's names, and every name an earlier redraw wrote would read
    // as the modder's for good
    fs.writeFileSync(RECORD, "{ this is not json");
    await redraw("redraw over an unreadable record");
    rec("⭐⭐ the unreadable record is left as it was", fs.readFileSync(RECORD, "utf8") === "{ this is not json", fs.readFileSync(RECORD, "utf8").slice(0, 120));

    console.log("\n[2f] a redraw refused before it plans reads none of the modder's localisation (second review)");
    // whose names are whose is asked only when the plan needs it: it reads every .yml of every language under the mod — 1.3 s
    // on Millennium Dawn — and a redraw the endpoint refuses (here: the mod has no definition.csv of its own) never plans
    const REFUSED = path.join(path.dirname(G.MOD), "refused");
    fs.cpSync(G.MOD, REFUSED, { recursive: true });
    fs.rmSync(path.join(REFUSED, "map", "definition.csv"));
    const theirYml = path.join(REFUSED, "localisation", "english", "my_regions_l_english.yml");
    rec("(precondition: the copy carries a localisation file of the modder's own)", fs.existsSync(theirYml), theirYml);
    const realRead = fs.readFileSync;
    const readYml = [];
    fs.readFileSync = function (p, ...rest) { if (/\.yml$/i.test(String(p)) && String(p).startsWith(REFUSED)) readYml.push(String(p)); return realRead.call(this, p, ...rest); };
    let refused = null;
    try { refused = await post("/api/map/rebuild-regions", { modPath: REFUSED, dryRun: true }); } finally { fs.readFileSync = realRead; }
    rec("(the redraw is refused before it plans)", refused && refused.status === 400 && refused.body.refused === "map-not-owned", refused && refused.body);
    rec("⭐ …and it read no .yml of the mod's", readYml.length === 0, readYml);
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} server.close(); }
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
})();
