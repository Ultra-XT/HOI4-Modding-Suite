// A province move leaves both states it touches an air base and a rocket site: the new state "+ New state" fills, and the
// state the province leaves. #a-province-move-keeps-every-state-its-sites
//
// THE DEFECT (batch 8 discovery F1). The page's "+ New state" queues create-state { name: "", owner } with NO provinces
// (public/map.js), and each click queues move-province { provinceId, toStateId }. createState's ensureBuildingSlotsForState
// finds no land to place on, and moveProvince never placed anything, so every new state the page made was saved with no
// air_base and no rocket_site_spawn row: state_no_air_base_or_rocket_site, FATAL (refuses-to-load), and Save stopped on every
// New state until Auto-fix. The other half: moveProvince -> rekeyBuildingAnchorsForProvince re-keys every row standing on the
// moved province to the target, so when that row was the source state's only air_base or rocket_site_spawn, the source — often
// a base-game state the modder never touched — was left without one.
//
// MEASURED on the base commit 5d4002b, in-process against vanilla in the page's order: create-state { name: "", owner: "PER" }
// answered id 1082 with buildingSlots "could not place: no land pixels found for this state"; move-province { 1896 -> 1082 }
// left 1082 with no air base and no rocket site (the independent disk checker of batch 8 discovery); move-province
// { 12793 -> 1082 }, the province East Azerbaijan's only air base and rocket site stand on, left state 1000 with neither, and
// findStatesWithoutSites named [1000]. Discovery (65978a2) measured 4 source states of 4 hit in one Save.
//
// THE FIX. The move does what the edit makes necessary, with the writers next door: a state getting its first land gets the
// standard building positions createState gives a state created with provinces (ensureBuildingSlotsForState), and a state the
// move took a usable site from gets that site back on its own remaining land, judged by the rule's own findStatesWithoutSites so
// the move and the Save gate cannot disagree. A move that takes no site and fills no empty state writes no buildings.txt.
//
// Requests are the page's: queueWrite bodies lifted from public/map.js, replayed the way flushMapSaves replays them
// (Object.assign({}, body, { modPath }), a create's id mapped into the STATE_ID_FIELDS of the writes behind it), then
// GET /api/map/validate and the real Save gate. Positions are read back by the pixel every building reader takes.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b9-sites-move");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

const RULE = "state_no_air_base_or_rocket_site";
const SITES = ["air_base", "rocket_site_spawn"];
const H = 256;
const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const fieldsMatch = /const STATE_ID_FIELDS = \[([^\]]*)\]/.exec(MASKED);
const STATE_ID_FIELDS = fieldsMatch ? [...fieldsMatch[1].matchAll(/"([A-Za-z]+)"/g)].map((m) => m[1]) : [];

/** The effective map/buildings.txt as rows: the mod's own when it ships one, else the game's. */
function rowsOf(mod) {
  const own = path.join(mod, "map", "buildings.txt");
  const src = fs.existsSync(own) ? own : path.join(world.GAME, "map", "buildings.txt");
  return fs.readFileSync(src, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(";")).filter((c) => c.length >= 7).map((c) => ({ state: parseInt(c[0], 10), type: c[1].trim(), x: parseFloat(c[2]), z: parseFloat(c[4]), line: c.join(";") }));
}
/** The province a row stands on, read the way the game and every Nova reader read it. */
const standsOn = (r) => lib.provAt(Math.floor(r.x), md.buildingZToPixelY(H, r.z));
const sitesOf = (mod, state, type) => rowsOf(mod).filter((r) => r.state === state && r.type === type);
const typeCounts = (mod, state) => { const o = {}; for (const r of rowsOf(mod)) if (r.state === state) o[r.type] = (o[r.type] || 0) + 1; return o; };
const ruleStates = (v) => lib.idsOf(v, RULE);

/** flushMapSaves, mirrored: each queued write in order, a create's real id mapped into the writes behind it. */
async function save(srv, mod, queue) {
  const idMap = {}, results = [];
  for (const w of queue) {
    const body = Object.assign({}, w.body);
    for (const f of STATE_ID_FIELDS) if (f in body && body[f] != null && idMap[body[f]] != null) body[f] = idMap[body[f]];
    const r = await srv.post(w.url, body, mod);
    results.push({ url: w.url, body, status: r.status, res: r.body });
    if (!r.body || !r.body.ok) break;
    if (w.meta && w.meta.create && r.body.id != null && w.meta.provisionalId != null) idMap[w.meta.provisionalId] = r.body.id;
  }
  return { idMap, results, ok: results.length === queue.length && results.every((x) => x.res && x.res.ok) };
}
// The page's two bodies, as public/map.js builds them ("+ New state", then a click on a province in Fill mode).
const newState = (owner, provisionalId) => ({ url: "/api/map/create-state", body: { name: "", owner }, meta: { create: true, provisionalId } });
const moveInto = (provinceId, toStateId) => ({ url: "/api/map/move-province", body: { provinceId, toStateId }, meta: {} });

(async () => {
  let srv = null;
  try {
    console.log("0. The page's requests, as this test sends them");
    rec("the page queues \"+ New state\" as create-state { name: \"\", owner } with no provinces",
      /queueWrite\("\/api\/map\/create-state", \{ name: "", owner \}, \{ create: true, provisionalId: provId \}\)/.test(MASKED));
    rec("…and a province click as move-province { provinceId, toStateId }",
      /queueWrite\("\/api\/map\/move-province", \{ provinceId, toStateId \}, \{ fromStateId(?: \}\)|, )/.test(MASKED)); // (the meta carries the click's dockyards too: #a-moved-coast-takes-its-dockyards)
    rec("STATE_ID_FIELDS is read out of public/map.js and maps toStateId", STATE_ID_FIELDS.includes("toStateId"), STATE_ID_FIELDS);
    // The game: state 1 = { 4 }, state 2 = { 2 5 }, state 3 = { 3 }. State 2's air base and rocket site stand on province 2.
    const gameState2Sites = rowsOf(world.GAME).filter((r) => r.state === 2 && SITES.includes(r.type));
    rec("THE CONTROL: the game's state 2 has one air base and one rocket site, both standing on its province 2",
      gameState2Sites.length === 2 && SITES.every((t) => gameState2Sites.some((r) => r.type === t)) && gameState2Sites.every((r) => standsOn(r) === 2),
      gameState2Sites.map((r) => [r.type, standsOn(r)]));
    rec("THE CONTROL: …and nothing stands on province 5", rowsOf(world.GAME).every((r) => standsOn(r) !== 5));

    srv = await lib.startServer(createApp);

    console.log("\n1. ⛔ \"+ New state\", click province 5, Save — the new state gets its air base and rocket site");
    {
      const mod = world.mod("Sites New State", {});
      rec("THE CONTROL: the fresh mod has no state without its sites", ruleStates(await srv.validate(mod)).length === 0);
      const s = await save(srv, mod, [newState("AAA", -1), moveInto(5, -1)]);
      rec("the Save ran every write", s.ok, s.results.map((x) => [x.url, x.status, x.res && (x.res.error || x.res.ok)]));
      const id = s.idMap[-1];
      const create = s.results[0] && s.results[0].res;
      rec("THE CONTROL: the create itself had no land to place anything on — the move is what fills the state",
        !!create && create.buildingSlots && create.buildingSlots.changed === false, create && create.buildingSlots);
      for (const t of SITES) {
        const rows = sitesOf(mod, id, t);
        rec(`⭐⭐⭐ the new state ${id} has a ${t}`, rows.length >= 1, typeCounts(mod, id));
        rec(`⭐⭐ …standing on its own province 5`, rows.length >= 1 && rows.every((r) => standsOn(r) === 5), rows.map((r) => [r.line, standsOn(r)]));
      }
      // The control body the page never sends: the same province named in the create. createState places the standard rows then.
      const ctl = world.mod("Sites Control", {});
      const c = await save(srv, ctl, [{ url: "/api/map/create-state", body: { name: "", owner: "AAA", provinces: [5] }, meta: { create: true, provisionalId: -1 } }]);
      const cid = c.idMap[-1];
      const want = typeCounts(ctl, cid);
      rec("THE CONTROL: create-state with provinces [5] gives its state every standard position", c.ok && md.STATE_BUILDING_SLOTS.every(([t, n]) => (want[t] || 0) >= n), want);
      rec("⭐⭐ the page's New state + click ends with the same building positions as that create", JSON.stringify(typeCounts(mod, id)) === JSON.stringify(want),
        { page: typeCounts(mod, id), create: want });
      const v = await srv.validate(mod);
      rec(`⭐⭐⭐ Map Errors no longer reports ${RULE}`, ruleStates(v).length === 0, ruleStates(v));
      rec("…nor a building standing in the wrong state or on water", lib.idsOf(v, "building_wrong_state").length === 0 && lib.idsOf(v, "building_not_over_land").length === 0,
        lib.rulesIn(v));
      const gate = await lib.saveGate(v);
      rec("⭐⭐⭐ the Save gate stops for nothing", gate.crashes === 0 && !gate.armed, gate.status);
    }

    console.log("\n2. ⛔ \"+ New state\", click province 2 (where state 2's sites stand), Save — state 2 keeps an air base and a rocket site");
    {
      const mod = world.mod("Sites Source State", {});
      const s = await save(srv, mod, [newState("AAA", -1), moveInto(2, -1)]);
      rec("the Save ran every write", s.ok, s.results.map((x) => [x.url, x.status, x.res && (x.res.error || x.res.ok)]));
      const id = s.idMap[-1];
      for (const t of SITES) {
        const src = sitesOf(mod, 2, t);
        rec(`⭐⭐⭐ state 2 still has a ${t}`, src.length >= 1, typeCounts(mod, 2));
        rec(`⭐⭐⭐ …standing on the land it kept, province 5`, src.length >= 1 && src.every((r) => standsOn(r) === 5), src.map((r) => [r.line, standsOn(r)]));
        rec(`⭐⭐ …and exactly one: the move gives back the site it took, not a second`, src.length === 1, src.map((r) => r.line));
        const tgt = sitesOf(mod, id, t);
        rec(`the new state ${id} has the ${t} that stands on province 2`, tgt.some((r) => standsOn(r) === 2) && tgt.every((r) => standsOn(r) === 2), tgt.map((r) => [r.line, standsOn(r)]));
      }
      const gameOthers = rowsOf(world.GAME).filter((r) => r.state === 2 && !SITES.includes(r.type)).length;
      const nowOthers = rowsOf(mod).filter((r) => r.state === 2 && !SITES.includes(r.type)).length;
      rec("⭐⭐ state 2 is given back only its sites: no other row is added for it", nowOthers <= gameOthers, { game: gameOthers, now: nowOthers });
      const v = await srv.validate(mod);
      rec(`⭐⭐⭐ Map Errors no longer reports ${RULE}`, ruleStates(v).length === 0, ruleStates(v));
      rec("…nor a building standing in the wrong state or on water", lib.idsOf(v, "building_wrong_state").length === 0 && lib.idsOf(v, "building_not_over_land").length === 0, lib.rulesIn(v));
      const gate = await lib.saveGate(v);
      rec("⭐⭐⭐ the Save gate stops for nothing", gate.crashes === 0 && !gate.armed, gate.status);
      // No .bak exemption any more: a writer that leaves one beside the modder's file has added a file to the
      // mod, and this list is exactly the assertion that would say so. #a-backup-must-not-ship-with-the-mod
      const files = Object.keys(lib.tree(mod)).filter((f) => !/^localisation\//i.test(f)).sort();
      rec("⭐⭐ overlay: the mod holds the two state files and buildings.txt the move writes, and nothing else of the map",
        JSON.stringify(files) === JSON.stringify(["descriptor.mod", "history/states/2-B.txt", `history/states/${id}-STATE_${id}.txt`, "map/buildings.txt"].sort()), files);
    }

    console.log("\n3. THE CONTROL: a move between two states that keep their sites writes no buildings.txt");
    {
      const mod = world.mod("Sites Plain Move", {});
      const s = await save(srv, mod, [moveInto(5, 3)]);
      rec("the Save ran", s.ok, s.results.map((x) => [x.url, x.status, x.res && (x.res.error || x.res.ok)]));
      rec("⭐⭐ the mod ships no buildings.txt: nothing was materialised for a move that takes no site", !fs.existsSync(path.join(mod, "map", "buildings.txt")), Object.keys(lib.tree(mod)));
      const v = await srv.validate(mod);
      rec(`…and nothing reports ${RULE}`, ruleStates(v).length === 0, ruleStates(v));
    }

    console.log("\n4. ⛔ The other caller of the same re-key: create-state WITH provinces (an API client) leaves the state it takes from its sites");
    {
      const mod = world.mod("Sites Create With Provinces", {});
      const s = await save(srv, mod, [{ url: "/api/map/create-state", body: { name: "", owner: "AAA", provinces: [2] }, meta: { create: true, provisionalId: -1 } }]);
      rec("the create ran", s.ok, s.results.map((x) => [x.url, x.status, x.res && (x.res.error || x.res.ok)]));
      for (const t of SITES) {
        const src = sitesOf(mod, 2, t);
        rec(`⭐⭐⭐ state 2 still has exactly one ${t}, standing on province 5`, src.length === 1 && standsOn(src[0]) === 5, src.map((r) => [r.line, standsOn(r)]));
      }
      const v = await srv.validate(mod);
      rec(`⭐⭐ Map Errors reports no ${RULE}`, ruleStates(v).length === 0, ruleStates(v));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a province move leaves both states an air base and a rocket site: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
