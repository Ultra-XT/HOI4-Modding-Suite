// When two loaded history/states files declare one state id, the map shows — and edits — the block HOI4 keeps: the first in the
// game's own load order, which is ONE list of every layer's files (a higher layer's file replaces a lower one of the same name)
// sorted by name byte for byte. #the-state-the-game-keeps
//
// THE ENGINE (hoi4.exe 1.19.2, dumpbin; scratchpad batch10/leaks/engine):
//   * 0x140A55AC0 loads the state database from "history/states" through 0x140AAE5A0, which lists the folder with
//     0x1424C73B0(path, list, ".txt") and hands the list to 0x140AAC160.
//   * 0x1424C73B0 -> 0x1424C5170 (virtualfilesystem_physfs.cpp) enumerates through PhysFS with callback 0x1424C5EF0, which
//     inserts every name into a std::map keyed by the name: a tree walk comparing with memcmp (0x142574D50) over the shorter
//     length, then the length (0x1424C60C4..0x1424C60E8). A name already in the map is not inserted again. 0x1424C5170 then
//     walks that tree in order (leftmost node, in-order successor at 0x1424C5696..0x1424C577F). So the list is every mounted
//     layer's names at once, each name once, in byte order — case-sensitive, a shorter prefix first.
//   * 0x140AAC160 walks the list in order: each file is read in a "Short Task" while the previous one's blocks are inserted by
//     0x140AAD450 on the calling thread, so ids are claimed strictly in list order.
//   * 0x140AAD450 (statetemplate.cpp, batch 9) keeps the FIRST block loaded for an id and destroys later ones
//     ("State ID conflict: Both …", the new block freed at 0x140AAD8DF).
//
// THE DEFECT. buildMapModel merged states by id with the HIGHER LAYER winning, whatever the file names; statesBelow the same.
// editStateBlock edited the mod's own block for an id before looking below, and readEffectiveStateBlock read it. So a mod that
// declares a base state's id in a file whose name sorts AFTER the base file's was shown, and edited, a state the game destroys.
// MEASURED (read-only census, scratchpad batch10/leaks/engine/probe-dups.js): the six shipping maps have no such id, and the
// owner's own mods do — kurdistan's 3-Syria.txt and 677-Auckland.txt behind vanilla's 3-Swiss Plateau.txt and 677-Aleppo.txt,
// hellenic_ascendancy's 206-Southern Israel.txt behind 206-Minsk.txt: the editor showed Syria, Auckland and Southern Israel,
// and the game loads Swiss Plateau, Aleppo and Minsk.
//
// Through the page's requests over testlib-two-layer-map.js: GET /api/map/model, GET /api/map/validate, POST /api/map/set-state
// { stateId, fields } and POST /api/map/move-province { provinceId, toStateId }, each checked against an independent reading of
// the files in the engine's order.
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const W = lib.makeWorld("b10-state-kept");
const { createApp } = require("./server.js");
const md = require("./map-data.js");

// The game's state 2 carries a victory point on its province 2, so a move can show whose history it carried.
lib.write(W.GAME, { "history/states/2-B.txt": lib.st(2, "2 5", { history: "\t\tvictory_points = { 2 5 }\n" }) });

/** The states HOI4 keeps, read independently: roots low -> high, one list of names (a higher root replaces the same name,
 *  compared without case, as Nova's file layers do), sorted by UTF-8 bytes, the first block per id kept. */
function engineStates(roots) {
  const byName = new Map();
  for (const r of roots) {
    const d = path.join(r, "history", "states");
    let names = [];
    try { names = fs.readdirSync(d).filter((f) => /\.txt$/i.test(f)); } catch (_) { names = []; }
    for (const f of names) byName.set(f.toLowerCase(), { root: r, file: f });
  }
  const list = [...byName.values()].sort((a, b) => Buffer.compare(Buffer.from(a.file, "utf8"), Buffer.from(b.file, "utf8")));
  const out = new Map();
  for (const e of list) {
    for (const s of md.parseStatesText(fs.readFileSync(path.join(e.root, "history", "states", e.file), "utf8"))) {
      if (!out.has(s.id)) out.set(s.id, Object.assign({}, s, { file: e.file, root: e.root }));
    }
  }
  return out;
}
const stateOf = (model, id) => ((model && model.states) || []).find((s) => s.id === id) || null;
const sorted = (a) => (a || []).slice().sort((x, y) => x - y);
const readMod = (mod, rel) => fs.readFileSync(path.join(mod, ...rel.split("/")), "utf8");

let S = null;
(async () => {
  try {
    S = await lib.startServer(createApp);
    const model = (mod) => fetch(`${S.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());

    console.log("\n=== 0. THE CONTROL: the engine reading of the fixture ===");
    {
      const e = engineStates([W.GAME]);
      rec("the game alone keeps its own state 2 (2-B.txt, provinces 2 5, a victory point on 2)",
        !!e.get(2) && e.get(2).file === "2-B.txt" && sorted(e.get(2).provinces).join() === "2,5" && (e.get(2).victoryPoints || []).some((v) => v.province === 2), e.get(2));
      rec("byte order puts \"2-B.txt\" before \"2-Z.txt\" and \"2-a.txt\", and \"2-A.txt\" before it",
        Buffer.compare(Buffer.from("2-B.txt"), Buffer.from("2-Z.txt")) < 0 && Buffer.compare(Buffer.from("2-B.txt"), Buffer.from("2-a.txt")) < 0 && Buffer.compare(Buffer.from("2-A.txt"), Buffer.from("2-B.txt")) < 0);
    }

    console.log("\n=== 1. the map shows the block HOI4 keeps ===");
    {
      const later = W.mod("Kept later name", { "history/states/2-Z.txt": lib.st(2, "5") });
      const m = await model(later);
      const e = engineStates([W.GAME, later]).get(2);
      rec("THE ENGINE: a mod's 2-Z.txt sorts after the game's 2-B.txt, so the game keeps 2-B.txt", e && e.file === "2-B.txt", e && e.file);
      const s2 = stateOf(m, 2);
      rec("⭐⭐⭐ the map's state 2 is the game's 2-B.txt, with provinces 2 and 5", !!s2 && s2.file === "2-B.txt" && sorted(s2.provinces).join() === "2,5", s2 && { file: s2.file, provinces: s2.provinces });
      rec("⭐⭐ …so province 2 belongs to state 2 on the map, as in the game", m.provinceToState && m.provinceToState[2] === 2, m.provinceToState && m.provinceToState[2]);

      const lower = W.mod("Kept lowercase name", { "history/states/2-a.txt": lib.st(2, "5") });
      const ml = await model(lower);
      const el = engineStates([W.GAME, lower]).get(2);
      rec("THE ENGINE: \"2-a.txt\" sorts after \"2-B.txt\" byte for byte (not alphabetically without case)", el && el.file === "2-B.txt", el && el.file);
      rec("⭐⭐ the map's state 2 is the game's 2-B.txt there too", !!stateOf(ml, 2) && stateOf(ml, 2).file === "2-B.txt", stateOf(ml, 2) && stateOf(ml, 2).file);

      const earlier = W.mod("Kept earlier name", { "history/states/2-A.txt": lib.st(2, "5") });
      const me = await model(earlier);
      rec("THE CONTROL: a mod's 2-A.txt sorts first, and the map's state 2 is the mod's, with province 5 only",
        !!stateOf(me, 2) && stateOf(me, 2).file === "2-A.txt" && sorted(stateOf(me, 2).provinces).join() === "5", stateOf(me, 2) && { file: stateOf(me, 2).file, provinces: stateOf(me, 2).provinces });

      const dep = W.mod("Kept dependency", { "history/states/2-M.txt": lib.st(2, "5") });
      const addon = W.mod("Kept addon", {}, ["Kept dependency"]);
      const ma = await model(addon);
      const ea = engineStates([W.GAME, dep, addon]).get(2);
      rec("THE ENGINE: a dependency's 2-M.txt sorts after the game's 2-B.txt, so an add-on over it gets the game's state 2", ea && ea.file === "2-B.txt", ea && ea.file);
      rec("⭐⭐ the add-on's map shows the game's state 2, not the dependency's", !!stateOf(ma, 2) && stateOf(ma, 2).file === "2-B.txt", stateOf(ma, 2) && stateOf(ma, 2).file);
    }

    console.log("\n=== 2. the layers below are read in the same order (state_no_manpower judged against what loads below) ===");
    {
      // Below the add-on: the dependency's 2-M.txt (no people) sorts after the game's 2-B.txt (1000), so below, state 2 has people.
      W.mod("Below dependency", { "history/states/2-M.txt": lib.st(2, "2 5", { manpower: 0 }) });
      const addon = W.mod("Below addon", { "history/states/2-A.txt": lib.st(2, "2 5", { manpower: 0 }) }, ["Below dependency"]);
      const v = await S.validate(addon);
      rec("⭐⭐⭐ an add-on whose own state 2 has no people, over layers whose loaded state 2 has 1000, is told so", lib.idsOf(v, "state_no_manpower").includes(2), lib.idsOf(v, "state_no_manpower"));
      // THE CONTROL: the dependency's no-people state sorts FIRST below, so an add-on that ships nothing inherited it.
      W.mod("Below dependency first", { "history/states/2-A.txt": lib.st(2, "2 5", { manpower: 0 }) });
      const plain = W.mod("Below addon plain", {}, ["Below dependency first"]);
      const vp = await S.validate(plain);
      rec("THE CONTROL: an add-on inheriting the loaded no-people state from its dependency is not told", !lib.idsOf(vp, "state_no_manpower").includes(2), lib.idsOf(vp, "state_no_manpower"));
    }

    console.log("\n=== 3. the page's edit lands in the block HOI4 keeps ===");
    {
      const mod = W.mod("Edit later name", { "history/states/2-Z.txt": lib.st(2, "5") });
      const before = readMod(mod, "history/states/2-Z.txt");
      const r = await S.post("/api/map/set-state", { stateId: 2, fields: { manpower: 4321 } }, mod);
      rec("the edit answered ok", r.status === 200 && r.body.ok === true, r);
      const e = engineStates([W.GAME, mod]).get(2);
      rec("⭐⭐⭐ the state 2 HOI4 keeps now has manpower 4321", !!e && +e.manpower === 4321, e && { file: e.file, manpower: e.manpower });
      rec("⭐⭐ …in the mod's copy of 2-B.txt, which replaces the game's", !!e && e.file === "2-B.txt" && path.resolve(e.root) === path.resolve(mod), e && { file: e.file, root: e.root });
      rec("⭐⭐ …and the block the game destroys, in 2-Z.txt, is left exactly as it was", readMod(mod, "history/states/2-Z.txt") === before);

      const earlier = W.mod("Edit earlier name", { "history/states/2-A.txt": lib.st(2, "5") });
      const r2 = await S.post("/api/map/set-state", { stateId: 2, fields: { manpower: 4321 } }, earlier);
      const e2 = engineStates([W.GAME, earlier]).get(2);
      rec("THE CONTROL: where the mod's 2-A.txt is the block kept, the edit lands there", r2.body.ok === true && !!e2 && e2.file === "2-A.txt" && +e2.manpower === 4321, e2 && { file: e2.file, manpower: e2.manpower });

      const plain = W.mod("Edit plain", {});
      const r3 = await S.post("/api/map/set-state", { stateId: 2, fields: { manpower: 4321 } }, plain);
      const e3 = engineStates([W.GAME, plain]).get(2);
      rec("THE CONTROL: a mod with no state files takes its own copy of 2-B.txt for the edit", r3.body.ok === true && !!e3 && e3.file === "2-B.txt" && +e3.manpower === 4321, e3 && { file: e3.file, manpower: e3.manpower });
    }

    console.log("\n=== 4. a province move carries the history of the block HOI4 keeps ===");
    {
      const mod = W.mod("Move later name", { "history/states/2-Z.txt": lib.st(2, "5") });
      const r = await S.post("/api/map/move-province", { provinceId: 2, toStateId: 3 }, mod);
      rec("the move answered ok", r.status === 200 && r.body.ok === true, r.body && (r.body.error || r.body.ok));
      const e = engineStates([W.GAME, mod]);
      const holders = [...e.values()].filter((s) => (s.provinces || []).includes(2)).map((s) => s.id);
      rec("⭐⭐⭐ in what HOI4 keeps, province 2 is in state 3 and nowhere else", holders.join() === "3", holders);
      rec("⭐⭐⭐ …and state 3 carries the victory point the kept state 2 had on it", ((e.get(3) || {}).victoryPoints || []).some((v) => v.province === 2 && v.value === 5), e.get(3) && e.get(3).victoryPoints);

      const plain = W.mod("Move plain", {});
      const r2 = await S.post("/api/map/move-province", { provinceId: 2, toStateId: 3 }, plain);
      const e2 = engineStates([W.GAME, plain]);
      const holders2 = [...e2.values()].filter((s) => (s.provinces || []).includes(2)).map((s) => s.id);
      rec("THE CONTROL: the same move in a mod with no state files puts province 2 and its victory point in state 3",
        r2.body.ok === true && holders2.join() === "3" && ((e2.get(3) || {}).victoryPoints || []).some((v) => v.province === 2), { holders: holders2, vps: e2.get(3) && e2.get(3).victoryPoints });
    }

    console.log("\n=== 5. Auto-fix gives people to the state HOI4 keeps (the sweep's locator reads the order editStateBlock edits) ===");
    {
      // Below the add-on, the game's 2-B.txt (1000 people) sorts before the dependency's 2-C.txt (none), so below, state 2 has people.
      // The add-on ships an empty 2-B.txt, which replaces the game's, and its own 2-Z.txt with people. What loads for the add-on: the
      // dependency's 2-C.txt, with no people — the add-on took them away, so the rule reports it and Auto-fix answers for it.
      const dep = W.mod("People dependency", { "history/states/2-C.txt": lib.st(2, "2 5", { manpower: 0 }) });
      const addon = W.mod("People addon", {
        "history/states/2-B.txt": "# state 2 is the dependency's now\n",
        "history/states/2-Z.txt": lib.st(2, "2 5"),
      }, ["People dependency"]);
      const zBefore = readMod(addon, "history/states/2-Z.txt");
      const e0 = engineStates([W.GAME, dep, addon]).get(2);
      rec("THE ENGINE: the add-on's state 2 is the dependency's 2-C.txt, with no people", !!e0 && e0.file === "2-C.txt" && !(+e0.manpower > 0), e0 && { file: e0.file, manpower: e0.manpower });
      const v0 = await S.validate(addon);
      rec("…and Map Errors reports state 2 without manpower", lib.idsOf(v0, "state_no_manpower").includes(2), lib.idsOf(v0, "state_no_manpower"));
      const r = await S.autoFix(addon);
      rec("the Auto-fix click answered ok", r.status === 200 && r.body.ok !== false, r.body && (r.body.error || Object.keys(r.body)));
      const e = engineStates([W.GAME, dep, addon]).get(2);
      rec("⭐⭐⭐ the state 2 HOI4 keeps now has people", !!e && +e.manpower > 0, e && { file: e.file, root: e.root, manpower: e.manpower });
      const v = await S.validate(addon);
      rec("⭐⭐ …so Map Errors no longer reports it", !lib.idsOf(v, "state_no_manpower").includes(2), lib.idsOf(v, "state_no_manpower"));
      rec("⭐⭐ …and the add-on's 2-Z.txt, which the game destroys, is left exactly as it was", readMod(addon, "history/states/2-Z.txt") === zBefore);
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (S) S.close();
    W.cleanup();
  }
  console.log(`\n=== the map shows and edits the state HOI4 keeps when two files declare its id: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
