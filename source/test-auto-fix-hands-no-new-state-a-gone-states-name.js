// ⛔ THE STATES AUTO-FIX MAKES ARE NOT HANDED A GONE STATE'S NAME EITHER. #a-new-state-takes-no-name-a-gone-state-left
//
// Auto-fix makes states two ways — the carve gives a cut-off piece a state of its own (#a-cut-off-piece-gets-a-state-of-its-own),
// and the state-id floor splits states until every id the loaded scripts name exists (#a-world-keeps-the-base-games-state-ids) —
// and each takes the next free id, whose key STATE_<id> Nova's own state-names file can still name for a state that is gone: a
// state file deleted by hand, or one 🛟 Restore baseline took away, leaves its line behind. Both creators KEPT such a line, as
// Generate land and "+ New state" did (test-a-new-state-takes-no-name-a-gone-state-left.js has those and the whole story). Now a
// line only Nova's file holds for a key being created is written over; a name in the modder's OWN localisation is still theirs.
//
// Driven through the request the Map Errors popup sends: POST /api/map/auto-fix { modPath }. The fixtures are the ones
// test-a-cut-off-piece-gets-a-state-of-its-own.js and test-auto-fix-names-the-states-the-state-floor-makes.js use.
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const lib = require("./testlib-two-layer-map.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("gone-name-autofix");
const BOM = String.fromCharCode(0xfeff);
// a second language below, so "written over" has to reach it too
lib.write(world.GAME, { "localisation/german/base_l_german.yml": `${BOM}l_german:\n STATE_1:0 "Erdeins"\n` });
const { createApp } = require("./server.js");

const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "");
const hash = (p) => (fs.existsSync(p) ? crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex") : "absent");
/** What one file defines: key → raw value (between the outer quotes). */
const defs = (p) => { const m = new Map(); for (const x of read(p).replace(BOM, "").matchAll(/^[ \t]*([A-Za-z0-9_.]+):\d*[ \t]*"(.*)"[ \t]*\r?$/gm)) m.set(x[1], x[2]); return m; };
const NOVA = (mod, lang) => path.join(mod, "localisation", lang, "replace", `nova_state_names_l_${lang}.yml`);
const LANGS = ["english", "german"];
const SHAPE = /^[A-Z][a-z]{3,10}$/;   // a made-up name (#a-generated-world-names-its-places)
/** Nova's own files, English and German, naming `key` "Gonename" — what a state deleted by hand leaves behind. */
const leftover = (key) => Object.fromEntries(LANGS.map((l) => [`localisation/${l}/replace/nova_state_names_l_${l}.yml`, `${BOM}l_${l}:\n ${key}:0 "Gonename"\n`]));

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);

    console.log("1. ⭐⭐⭐ The carve: a cut-off island's new state takes a name of its own, not the line a gone state left");
    {
      // The island (3) is cut off from the sea region it touches, and no region can take its whole state (2) — the carve's shape
      // in test-a-cut-off-piece-gets-a-state-of-its-own.js. The mod ships states 1 and 2, so the carved state is 3.
      const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0], 5: [0, 0, 120] };
      const at = (x, y) => (y < 128 ? (x >= 192 && x < 224 && y >= 32 && y < 64 ? 3 : x < 128 ? 1 : 5) : (x >= 32 && x < 96 ? 2 : 4));
      const DEF = ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1",
        "3;0;200;0;land;true;plains;1", "4;200;200;0;land;true;plains;1", "5;0;0;120;sea;false;ocean;0"].join("\r\n") + "\r\n";
      const BUILD = [
        "1;air_base;176.00;9.50;56.00;0.00;0", "1;rocket_site_spawn;176.00;9.50;56.00;0.00;0",
        "2;air_base;48.00;9.50;56.00;0.00;0", "2;rocket_site_spawn;48.00;9.50;56.00;0.00;0",
        "2;naval_base_spawn;48.00;9.50;126.00;0.00;1", "1;naval_base_spawn;176.00;9.50;126.00;0.00;5",
        "2;naval_base_spawn;208.00;9.50;223.00;0.00;5",
      ].join("\n");
      const mod = world.mod("carve gone name", {
        "descriptor.mod": `name="carve gone name"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map/strategicregions"\n`,
        "map/provinces.bmp": lib.bmp24(256, 256, (x, y) => COL[at(x, y)]),
        "map/definition.csv": DEF,
        "map/buildings.txt": BUILD,
        "map/strategicregions/1-R.txt": lib.region(1, "1 2 3 4"),
        "map/strategicregions/2-R.txt": lib.region(2, "5"),
        "history/states/1-S.txt": lib.st(1, "4"),
        "history/states/2-S.txt": lib.st(2, "2 3"),
        ...leftover("STATE_3"),
      });
      rec("CONTROL: validate names island 3 as cut off", lib.idsOf(await srv.validate(mod), "fractioned_naval_region").join(",") === "3", lib.rulesIn(await srv.validate(mod)));
      rec("PRECONDITION: no state 3 loads, and Nova's files still name STATE_3 \"Gonename\" in English and German",
        !(((await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json())).states || []).some((s) => s.id === 3))
          && LANGS.every((l) => defs(NOVA(mod, l)).get("STATE_3") === "Gonename"), LANGS.map((l) => defs(NOVA(mod, l)).get("STATE_3")));
      const c = await srv.autoFix(mod);
      const f = (c.body && c.body.fixes && c.body.fixes.fractionedRegions) || {};
      const made = (f.statesMade || [])[0] || {};
      rec("the click carves state 3, keyed STATE_3, for the island", c.status === 200 && (f.statesMade || []).length === 1 && made.id === 3 && made.name === "STATE_3", { status: c.status, error: c.body && c.body.error, f });
      const en = defs(NOVA(mod, "english")).get("STATE_3");
      rec("⭐⭐⭐ the carved state is called by a made-up name of its own, not \"Gonename\"", en !== "Gonename" && SHAPE.test(String(en)), en);
      rec("⭐⭐ …in German too", defs(NOVA(mod, "german")).get("STATE_3") === en, defs(NOVA(mod, "german")).get("STATE_3"));
      rec("⭐ the click says it named the state, and kept nothing", f.carvedStateNames && f.carvedStateNames.written === 1 && f.carvedStateNames.kept === 0 && !f.carvedStateNames.error, f.carvedStateNames);
    }

    console.log("\n2. ⭐⭐⭐ The state-id floor: its new states take names of their own, and each point pairs with its state");
    {
      // The base game's event names state 3, so a rebuilt world of ONE state is split into 1, 2 and 3 (the floor test's shape);
      // the state with a victory point gives each new state one of its own. The modder names STATE_2 themselves — that stays.
      lib.write(world.GAME, { "events/base.txt": "namespace = base\ncountry_event = {\n\tid = base.1\n\toption = { name = base.1.a 3 = { add_core_of = ROOT } }\n}\n" });
      const OWN = "localisation/english/my_state_names_l_english.yml";
      const mod = world.mod("floor gone name", {
        "descriptor.mod": `name="floor gone name"\nsupported_version="1.*"\nreplace_path="history/states"\n`,
        "history/states/1-W.txt": lib.st(1, "2 5 3 4", { manpower: 4000, history: "\t\tvictory_points = { 2 5 }\n" }),
        [OWN]: `${BOM}l_english:\n STATE_2:0 "Homeland"\n`,
        ...leftover("STATE_3"),
      });
      const own = hash(path.join(mod, OWN));
      const c = await srv.autoFix(mod);
      const fl = (c.body && c.body.fixes && c.body.fixes.stateIdFloor) || {};
      const keys = (fl.statesMade || []).map((s) => s.name).sort();
      rec("the floor makes states 2 and 3, the keys the modder's file and the leftover line name", c.status === 200 && JSON.stringify(keys) === JSON.stringify(["STATE_2", "STATE_3"]), { status: c.status, error: c.body && c.body.error, fl });
      const model = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
      const en = defs(NOVA(mod, "english"));
      const s3 = (model.states || []).find((s) => s.id === 3) || {};
      rec("⭐⭐⭐ state 3 is called by a made-up name of its own, not \"Gonename\" — on the map and in Nova's file", en.get("STATE_3") !== "Gonename" && SHAPE.test(String(en.get("STATE_3"))) && s3.displayName === en.get("STATE_3"), { file: en.get("STATE_3"), map: s3.displayName });
      rec("⭐⭐ …in German too", defs(NOVA(mod, "german")).get("STATE_3") === en.get("STATE_3"), defs(NOVA(mod, "german")).get("STATE_3"));
      const pairs = (fl.statesMade || []).map((m) => (model.states || []).find((s) => s.id === m.id)).filter(Boolean)
        .map((s) => ({ id: s.id, shows: s.displayName, points: (s.victoryPoints || []).map((v) => en.get(`VICTORY_POINTS_${v.province}`)) }));
      rec("⭐⭐⭐ each new state's victory point reads what its state reads — \"Homeland\" for the modder's STATE_2", pairs.length === 2 && pairs.every((p) => p.points.length === 1 && p.points[0] === p.shows)
        && (pairs.find((p) => p.id === 2) || {}).shows === "Homeland", pairs);
      rec("⭐ the click says it named one state and kept the modder's one", fl.stateNames && fl.stateNames.written === 1 && fl.stateNames.kept === 1 && !fl.stateNames.error, fl.stateNames);
      rec("⚠️ the modder's own file is byte-identical", hash(path.join(mod, OWN)) === own);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== Auto-fix hands no new state a gone state's name: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
