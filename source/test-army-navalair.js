// Naval + Air starting OOB writer: generate fleets/task-forces/ships + air wings and inject them into a
// mod-owned history/units/*.txt, preserving everything else. Round-trip safe via unit-data's parser.
// Run: node test-army-navalair.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createApp } = require("./server.js");
const unitData = require("./unit-data.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const balanced = (s) => (s.replace(/#.*$/gm, "").replace(/"[^"]*"/g, '""').match(/{/g) || []).length === (s.replace(/#.*$/gm, "").replace(/"[^"]*"/g, '""').match(/}/g) || []).length;

(async () => {
  const PORT = 3947, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-navalair-"));
  const mk = (rel, body) => { const p = path.join(mod, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body, "utf8"); };
  mk("descriptor.mod", 'name="Nova Naval/Air Test"\n');
  const post = (route, body) => fetch(`${BASE}${route}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const readFile = (name) => fs.readFileSync(path.join(mod, "history", "units", name), "utf8");

  try {
    console.log("=== pure generators produce vanilla-shaped PDX ===");
    const ship = unitData.genShip({ name: 'ARA "Test"', definition: "destroyer", equipment: "destroyer_1", owner: "ARG", amount: 1, version_name: "X Class" });
    // The quote in the ship's name is ESCAPED, not deleted (#oob-name-backslash) — deleting it out of an
    // already-escaped name left a lone backslash that ate the closing quote. `ARA "Test"` is a realistic
    // ship name, and HOI4 reads \" fine (Millennium Dawn writes exactly that in its division names).
    ok("genShip shape", /ship = \{ name = "ARA \\"Test\\"" definition = destroyer equipment = \{ destroyer_1 = \{ amount = 1 owner = ARG version_name = "X Class" \} \} \}/.test(ship), ship);
    ok("…and the generated ship line is still a well-formed, brace-balanced quoted string",
      (() => { let b = 0; for (const c of ship) { if (c === "{") b++; else if (c === "}") b--; }
        return b === 0 && /name = ("(?:[^"\\]|\\.)*")/.test(ship) && !/\n/.test(ship.trim().slice(0, -1)); })(), ship);
    ok("genShip strips the inner quote (no escape)", !/ARA "Test"/.test(ship), ship);
    const fleet = unitData.genFleet({ name: "Home Fleet", naval_base: 12364, ships: [{ name: "A", definition: "battleship", equipment: "battleship_1", owner: "ARG", pride: true }] });
    ok("genFleet nests fleet>task_force>ship + naval_base", /fleet = \{[\s\S]*naval_base = 12364[\s\S]*task_force = \{[\s\S]*ship = \{ name = "A"[\s\S]*pride_of_the_fleet = yes/.test(fleet), fleet);
    ok("generated fleet brace-balanced", balanced(fleet), fleet);

    console.log("\n=== create a NAVY on an empty file ===");
    const r1 = await post("/api/army/naval-air", { modPath: mod, tag: "ARG", domain: "naval",
      fleets: [{ name: "Armada", naval_base: 12364, ships: [
        { name: "ARA Rivadavia", definition: "battleship", equipment: "battleship_1", owner: "ARG", pride: true },
        { name: "ARA Moreno", definition: "battleship", equipment: "battleship_1", owner: "ARG", amount: 1 },
      ] }] });
    ok("naval save ok", r1 && r1.ok === true && r1.file === "ARG_nova_navy.txt", r1);
    let navy = readFile("arg_nova_navy.txt");
    ok("units>fleet written", /units = \{[\s\S]*fleet = \{[\s\S]*task_force/.test(navy), navy);
    ok("both ships present", /ARA Rivadavia/.test(navy) && /ARA Moreno/.test(navy), navy);
    ok("naval file brace-balanced", balanced(navy), navy);
    ok("round-trips through the parser", unitData.serializeUnitsFile(unitData.parseUnitsFile(navy)) === navy, "round-trip drift");
    ok("read-model sees 1 navy block", unitData.summarizeUnitsFile(navy).navy === 1, unitData.summarizeUnitsFile(navy));

    console.log("\n=== append a 2nd fleet into the SAME units block (preserve the first) ===");
    const r2 = await post("/api/army/naval-air", { modPath: mod, tag: "ARG", domain: "naval",
      fleets: [{ name: "Submarines", naval_base: 12364, ships: [{ name: "ARA Santa Fe", definition: "submarine", equipment: "submarine_1", owner: "ARG" }] }] });
    navy = readFile("arg_nova_navy.txt");
    ok("append ok + first fleet still there", r2.ok === true && /Armada/.test(navy) && /Submarines/.test(navy) && /ARA Rivadavia/.test(navy), navy);
    ok("still ONE units block (2 fleets inside)", (navy.match(/units = \{/g) || []).length === 1 && (navy.match(/fleet = \{/g) || []).length === 2, navy);
    ok("append brace-balanced + round-trips", balanced(navy) && unitData.serializeUnitsFile(unitData.parseUnitsFile(navy)) === navy, navy);

    console.log("\n=== create an AIR FORCE (separate file) ===");
    const r3 = await post("/api/army/naval-air", { modPath: mod, tag: "ARG", domain: "air",
      airWings: [{ state: 278, groups: [
        { equipment: "fighter_equipment_0", owner: "ARG", amount: 18 },
        { equipment: "CAS_equipment_1", owner: "ARG", amount: 12 },
      ] }] });
    ok("air save ok", r3.ok === true && r3.file === "ARG_nova_air.txt", r3);
    let air = readFile("arg_nova_air.txt");
    ok("air_wings>state>groups written (owner quoted)", /air_wings = \{[\s\S]*278 = \{[\s\S]*fighter_equipment_0 = \{ owner = "ARG" amount = 18 \}[\s\S]*CAS_equipment_1 = \{ owner = "ARG" amount = 12 \}/.test(air), air);
    ok("air file brace-balanced + round-trips", balanced(air) && unitData.serializeUnitsFile(unitData.parseUnitsFile(air)) === air, air);

    console.log("\n=== add a group to an EXISTING state (merge, not duplicate) ===");
    const r4 = await post("/api/army/naval-air", { modPath: mod, tag: "ARG", domain: "air",
      airWings: [{ state: 278, groups: [{ equipment: "tac_bomber_equipment_1", owner: "ARG", amount: 6 }] }] });
    air = readFile("arg_nova_air.txt");
    ok("merged into state 278 (no 2nd 278 block)", r4.ok === true && (air.match(/(^|\n)\s*278 = \{/g) || []).length === 1 && /tac_bomber_equipment_1 = \{ owner = "ARG" amount = 6 \}/.test(air), air);
    ok("original groups still present", /fighter_equipment_0/.test(air) && /CAS_equipment_1/.test(air), air);
    ok("merge brace-balanced + round-trips", balanced(air) && unitData.serializeUnitsFile(unitData.parseUnitsFile(air)) === air, air);

    console.log("\n=== add a NEW state to the same air file ===");
    const r5 = await post("/api/army/naval-air", { modPath: mod, tag: "ARG", domain: "air",
      airWings: [{ state: 300, groups: [{ equipment: "fighter_equipment_1", owner: "ARG", amount: 20 }] }] });
    air = readFile("arg_nova_air.txt");
    ok("new state 300 added, 278 preserved, one air_wings block", r5.ok === true && /300 = \{/.test(air) && /278 = \{/.test(air) && (air.match(/air_wings = \{/g) || []).length === 1, air);
    ok("two states brace-balanced", balanced(air), air);

    console.log("\n=== preserve hand-authored content (comments + instant_effect) ===");
    mk("history/units/ARG_hand.txt", '# hand authored\nunits = {\n\tdivision = { name = "1 Inf" location = 1 division_template = "Inf" }\n}\ninstant_effect = { add_equipment_production = { equipment = { type = fighter_equipment_0 } } }\n');
    const r6 = await post("/api/army/naval-air", { modPath: mod, tag: "ARG", domain: "naval", fileName: "ARG_hand.txt",
      fleets: [{ name: "Fleet2", naval_base: 5, ships: [{ name: "S", definition: "destroyer", equipment: "destroyer_1", owner: "ARG" }] }] });
    const hand = readFile("ARG_hand.txt");
    ok("division + comment + instant_effect all preserved, fleet added to the units block", r6.ok === true && /# hand authored/.test(hand) && /1 Inf/.test(hand) && /add_equipment_production/.test(hand) && /Fleet2/.test(hand) && (hand.match(/units = \{/g) || []).length === 1, hand);
    ok("hand file brace-balanced + round-trips", balanced(hand) && unitData.serializeUnitsFile(unitData.parseUnitsFile(hand)) === hand, hand);

    console.log("\n=== blank naval base omits location/naval_base (falsy-zero — no province 0) ===");
    const rz = await post("/api/army/naval-air", { modPath: mod, tag: "ARG", domain: "naval", fileName: "ARG_nova_navy.txt", fleets: [{ name: "NoBaseFleet", naval_base: 0, ships: [{ name: "S", definition: "destroyer", equipment: "destroyer_1", owner: "ARG" }] }] });
    const nbTxt = readFile("ARG_nova_navy.txt");
    ok("a blank naval base writes NO `naval_base = 0` / `location = 0` (would reference invalid province 0)", rz.ok === true && !/naval_base = 0\b/.test(nbTxt) && !/location = 0\b/.test(nbTxt) && /NoBaseFleet/.test(nbTxt) && balanced(nbTxt), nbTxt);

    console.log("\n=== country history WIRING (set_naval_oob / set_air_oob) ===");
    const cdir = path.join(mod, "history", "countries");
    const wN = await post("/api/army/naval-air", { modPath: mod, tag: "NVY", domain: "naval", fleets: [{ name: "Home Fleet", naval_base: 1, ships: [{ name: "s", definition: "destroyer", equipment: "destroyer_1", owner: "NVY" }] }] });
    ok("naval wire ok + ref returned", wN.ok === true && wN.ref === "NVY_nova_navy", wN);
    const wA = await post("/api/army/naval-air", { modPath: mod, tag: "NVY", domain: "air", airWings: [{ state: 1, groups: [{ equipment: "fighter_equipment_0", owner: "NVY", amount: 5 }] }] });
    ok("air wire ok + ref returned", wA.ok === true && wA.ref === "NVY_nova_air", wA);
    const nvyPath = fs.readdirSync(cdir).map((f) => path.join(cdir, f)).find((p) => /^NVY/i.test(path.basename(p)));
    ok("country history created for NVY", !!nvyPath, cdir);
    let ch = nvyPath ? fs.readFileSync(nvyPath, "utf8") : "";
    ok("Nova OOB region + BOTH refs (merge, not clobber)", /# >>> NOVA naval\/air OOB >>>/.test(ch) && /set_naval_oob = "NVY_nova_navy"/.test(ch) && /set_air_oob = "NVY_nova_air"/.test(ch), ch);
    ok("wired history brace-balanced", balanced(ch), ch);
    // idempotent: a re-save doesn't duplicate the region or the ref line. On coastal 12364: this used 2, land with no sea beside it, where
    // a task force is now refused (#a-berth-the-mods-own-file-gives-is-judged-on-a-map-it-never-changed) — and a refused re-save wrote
    // nothing, so the check below would have passed on a file no re-save had touched. Hence the save is required to succeed.
    const reSave = await post("/api/army/naval-air", { modPath: mod, tag: "NVY", domain: "naval", fleets: [{ name: "Fleet2", naval_base: 12364, ships: [{ name: "s2", definition: "destroyer", equipment: "destroyer_1", owner: "NVY" }] }] });
    ch = fs.readFileSync(nvyPath, "utf8");
    ok("the re-save itself succeeded", reSave.ok === true, reSave);
    ok("region + naval ref NOT duplicated on re-save", (ch.match(/# >>> NOVA naval\/air OOB >>>/g) || []).length === 1 && (ch.match(/set_naval_oob/g) || []).length === 1, ch);

    console.log("\n=== GET reads back the wired state ===");
    const gg = await fetch(`${BASE}/api/army/naval-air?modPath=${encodeURIComponent(mod)}&tag=NVY`).then((r) => r.json());
    ok("GET returns refs + fleet/wing counts", gg.ok === true && gg.refs.naval === "NVY_nova_navy" && gg.refs.air === "NVY_nova_air" && gg.navy && gg.navy.navy >= 1 && gg.air && gg.air.airWings >= 1, gg);

    console.log("\n=== replacedExisting warns on a foreign set_naval_oob ===");
    mk("history/countries/BOB.txt", 'capital = 1\nset_naval_oob = "BOB_vanilla_navy"\n');
    const rf = await post("/api/army/naval-air", { modPath: mod, tag: "BOB", domain: "naval", fleets: [{ name: "F", naval_base: 1, ships: [{ name: "s", definition: "destroyer", equipment: "destroyer_1", owner: "BOB" }] }] });
    ok("replacedExisting flagged when a foreign ref exists", rf.ok === true && rf.replacedExisting === true, rf);
    const bob = fs.readFileSync(path.join(cdir, "BOB.txt"), "utf8");
    ok("foreign ref preserved + Nova ref appended AFTER it (last-wins)", /BOB_vanilla_navy/.test(bob) && /set_naval_oob = "BOB_nova_navy"/.test(bob) && bob.indexOf("BOB_vanilla_navy") < bob.indexOf("BOB_nova_navy"), bob);
    ok("BOB history brace-balanced", balanced(bob), bob);

    console.log("\n=== guards ===");
    const bad1 = await post("/api/army/naval-air", { modPath: mod, tag: "AR", domain: "naval", fleets: [] });
    ok("bad tag rejected", bad1.ok === false, bad1);
    const bad2 = await post("/api/army/naval-air", { modPath: mod, tag: "ARG", domain: "naval", fleets: [{ name: "F", ships: [{ name: "x", definition: "destroyer", equipment: "destroyer_1", owner: "ZZZZ" }] }] });
    ok("bad owner tag rejected", bad2.ok === false, bad2);
    const bad3 = await post("/api/army/naval-air", { modPath: mod, tag: "ARG", domain: "air", airWings: [{ state: 278, groups: [{ equipment: "x = 1 } evil", owner: "ARG", amount: 5 }] }] });
    ok("injection-shaped equipment key rejected", bad3.ok === false, bad3);
    const bad4 = await post("/api/army/naval-air", { modPath: mod, tag: "ARG", domain: "naval", fleets: [{ name: "F", ships: [] }] });
    ok("empty (no ships) rejected", bad4.ok === false, bad4);
    const gameRoot = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
    const bad5 = await post("/api/army/naval-air", { modPath: gameRoot, tag: "ARG", domain: "naval", fleets: [{ name: "F", ships: [{ name: "s", definition: "destroyer", equipment: "destroyer_1", owner: "ARG" }] }] });
    ok("game-root write rejected", bad5.ok === false, bad5);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }

  console.log(`\nNAVAL-AIR: ${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
  try { server.closeAllConnections && server.closeAllConnections(); } catch (_) {}
  server.close();
})();
