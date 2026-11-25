// 🧱 #a-world-keeps-the-base-games-state-ids + #a-new-state-has-no-name — THE STATES THE FLOOR MAKES GET NAMES.
//
// fixStateIdFloor splits a rebuilt world's largest states until every id the loaded scripts name exists — 249 new states on
// the owner's world in one click. createState writes `name = "STATE_833"` and nothing saying what STATE_833 reads as, so
// without a localisation line the game shows the raw key on the map and in every list. The carve (fixFractionedRegions)
// hit exactly this and POST /api/map/auto-fix names what it makes; the floor must be named the same way, by the same
// helper, into the same file. Driven through the request the Map Errors popup sends.
"use strict";
const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");

let pass = 0;
const fails = [];
const rec = (name, cond, detail) => {
  if (cond) { console.log("  ok   " + name); pass++; }
  else { console.log("  FAIL " + name + (detail === undefined ? "" : "   → " + JSON.stringify(detail).slice(0, 500))); fails.push(name); }
};

const world = lib.makeWorld("floor-names");
const { createApp } = require("./server.js");
// The base game (states 1..3) gets an event that names state 3, so the loaded scripts reach its highest id.
lib.write(world.GAME, { "events/base.txt": "namespace = base\ncountry_event = {\n\tid = base.1\n\toption = { name = base.1.a 3 = { add_core_of = ROOT } }\n}\n" });

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);
    // A rebuilt world: ONE state over the base game's four land provinces, where the base game has three.
    const mod = world.mod("floor names", {
      "descriptor.mod": `name="floor names"\nsupported_version="1.*"\nreplace_path="history/states"\n`,
      "history/states/1-W.txt": lib.st(1, "2 5 3 4", { manpower: 4000 }),
    });
    const v0 = await srv.validate(mod);
    rec("CONTROL: validate reports the shortfall — 2 ids the base game's event can name are missing",
      ((v0.problems || []).find((p) => p.rule === "state_ids_below_base") || {}).total === 2, (v0.problems || []).map((p) => p.rule));

    const c = await srv.autoFix(mod);
    const fl = (c.body && c.body.fixes && c.body.fixes.stateIdFloor) || {};
    rec("the click is answered", c.status === 200 && c.body && c.body.ok === true, c.body && c.body.error);
    rec("⭐⭐⭐ the floor made the 2 missing states, and says which", fl.added === 2 && (fl.statesMade || []).length === 2, fl);
    const locFile = path.join(mod, "localisation", "english", "replace", "nova_state_names_l_english.yml");
    const loc = fs.existsSync(locFile) ? fs.readFileSync(locFile, "utf8") : "";
    const keys = (fl.statesMade || []).map((s) => s.name);
    rec("⭐⭐⭐ every state the floor made has a name in the mod's state-names file", keys.length === 2 && keys.every((k) => new RegExp(`^\\s*${k}:\\d*\\s*"[A-Z][a-z]{3,10}"`, "m").test(loc)), { keys, loc });   // made-up names (#a-generated-world-names-its-places)
    rec("⭐⭐ …and the click reports it beside the floor, where the popup reads it", fl.stateNames && fl.stateNames.written === 2 && !fl.stateNames.error, fl.stateNames);
    const v1 = await srv.validate(mod);
    rec("⭐⭐ the shortfall is gone after the click", !(v1.problems || []).some((p) => p.rule === "state_ids_below_base"), (v1.problems || []).map((p) => p.rule));

    // #a-generated-capital-sits-on-its-rail — a state with a victory point is split into states that each get one (6f6a5c0), and
    // every one of those points is named after the state it is in: TEST 31's rehearsal had 249 of 1,081 points named by nothing.
    // The modder names STATE_2 "Homeland" themselves; a point in the state keyed STATE_2 reads that, not a made-up name.
    console.log("\n-- ⭐⭐⭐ the victory point each new state is given is named after it --");
    const BOM = String.fromCharCode(0xfeff);
    const vmod = world.mod("floor names vp", {
      "descriptor.mod": `name="floor names vp"\nsupported_version="1.*"\nreplace_path="history/states"\n`,
      "history/states/1-W.txt": lib.st(1, "2 5 3 4", { manpower: 4000, history: "\t\tvictory_points = { 2 5 }\n" }),
      "localisation/english/my_state_names_l_english.yml": `${BOM}l_english:\n STATE_2:0 "Homeland"\n`,
    });
    const vc = await srv.autoFix(vmod);
    const vfl = (vc.body && vc.body.fixes && vc.body.fixes.stateIdFloor) || {};
    rec("the floor made 2 states from the state with a victory point", vc.status === 200 && vfl.added === 2, { status: vc.status, floor: vfl, error: vc.body && vc.body.error });
    const model = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(vmod)}`).then((r) => r.json());
    const locText = (() => {
      let t = "";
      const walk = (d) => { if (!fs.existsSync(d)) return; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.yml$/i.test(e.name)) t += "\n" + fs.readFileSync(p, "utf8"); } };
      walk(path.join(vmod, "localisation", "english"));
      return t;
    })();
    const named = (key) => { const m = new RegExp(`^[ \\t]*${key}:\\d*[ \\t]*"(.*)"`, "m").exec(locText); return m ? m[1] : null; };
    const made = (vfl.statesMade || []).map((s) => (model.states || []).find((x) => x.id === s.id)).filter(Boolean);
    const pairs = made.map((s) => ({ id: s.id, key: s.name, shows: s.displayName, vps: (s.victoryPoints || []).map((v) => ({ province: v.province, name: named(`VICTORY_POINTS_${v.province}`) })) }));
    rec("each new state has a victory point of its own", pairs.length === 2 && pairs.every((p) => p.vps.length === 1), pairs);
    rec("⭐⭐⭐ …and each point reads what its state reads", pairs.length === 2 && pairs.every((p) => p.vps.length === 1 && p.vps[0].name && p.vps[0].name === p.shows), pairs);
    const home = pairs.find((p) => p.key === "STATE_2");
    rec("⭐⭐ the state keyed STATE_2 reads the modder's \"Homeland\", and so does its point", !!home && home.shows === "Homeland" && home.vps.length === 1 && home.vps[0].name === "Homeland", pairs);
    rec("⭐ the click says it named 2 points", vfl.stateNames && vfl.stateNames.victoryPoints === 2 && !vfl.stateNames.error, vfl.stateNames);
  } catch (e) {
    rec("the test ran to the end", false, String((e && e.stack) || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n${pass} passed, ${fails.length} failed`);
  if (fails.length) { console.log("FAILED: " + fails.join(" | ")); process.exit(1); }
})();
