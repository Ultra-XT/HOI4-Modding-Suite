// ⛔ #a-coast-keeps-the-port-the-click-re-keys — one Auto-fix click leaves a coastal province with ONE port, also when the port it already
// has is keyed to another state.
//
// THE DEFECT (the B6 round's PLAUSIBLE one, from G3's notes; confirmed 2026-11-19). fixCoastalNoPort credits a port only to the province
// it stands on AND whose state its first column names, which is how the game reads the map now: a row keyed to a state that does not
// hold its land is "not within specified state … BUILDING IGNORED". But the click's last pass, fixBuildingsTxtPlacement, re-keys that
// very row to the state the province is in by then. So the port pass added a second row, and the click ended with two naval_base_spawn
// rows a pixel apart on one province: on a province fixStatelessLand homed (its row keyed to the state that was deleted), and on one
// its state file moved (its row keyed to the state it was in). Vanilla, Millennium Dawn, Old World Blues, Novum Vexillum and Rise of
// Nations have no province with two port rows (2,362 / 2,786 / 4,421 / 2,752 / 2,358 provinces with a port, one row each).
//
// THE NEXT DOOR. fixStatelessLand already counts the rows it gives a homed province "as the click will leave them", with the re-homes
// rehomesTheModOwns lists (#a-homed-province-keeps-the-rows-it-stood-on). The port pass now asks the same list and makes that re-key
// itself, for its write only: the province's own row, keyed to the state it is in, and no second row — the same answer called alone
// (section D) or in the click. The rule (coastal_no_port, its dry run) still judges the map as the game reads it before the click.
//
// Requests are the page's: GET /api/map/validate?modPath and POST /api/map/auto-fix { modPath } (testlib-two-layer-map.js).
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments, maskJsLiterals, jsBodyAt } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("coast-rekey-port");
const { createApp } = require("./server.js");
const md = require("./map-data.js");
const RULE = "coastal_no_port";

// 256x256, a mod that ships its whole map. Sea 1 across the top; below it land 2 (left) and land 3 (right), both on the sea; land 4
// along the bottom, inland. Province 2 is state 1's and has its own port; what province 3 is, and its port row's key, is each case's.
const W = 256, H = 256;
const provAt = (x, y) => (y < 64 ? 1 : y < 192 ? (x < 128 ? 2 : 3) : 4);
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0] };
const Z = (y) => md.pixelYToBuildingZ(H, y).toFixed(2);
const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
const SITES = ["1;air_base;32.00;9.50;" + Z(128) + ";0.00;0", "1;rocket_site_spawn;32.00;9.50;" + Z(128) + ";0.00;0",
  "2;air_base;64.00;9.50;" + Z(220) + ";0.00;0", "2;rocket_site_spawn;64.00;9.50;" + Z(220) + ";0.00;0"];
const PORT2 = "1;naval_base_spawn;32.00;9.50;" + Z(64) + ";0.00;1";
const portOf3 = (key) => key + ";naval_base_spawn;192.00;9.50;" + Z(64) + ";0.00;1";   // pixel (192, 64): province 3, facing sea 1
function portMod(name, portRows, states) {
  const files = {
    "descriptor.mod": `name="${name}"\nsupported_version="1.*"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="history/states"\n`,
    "map/provinces.bmp": lib.bmp24(W, H, (x, y) => COL[provAt(x, y)]),
    "map/definition.csv": ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1", "3;0;200;0;land;true;plains;1", "4;200;200;0;land;false;plains;1"].join("\r\n") + "\r\n",
    "map/buildings.txt": SITES.concat(portRows).join("\n"),
    "map/adjacencies.csv": "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n",
    "map/strategicregions/1-Sea.txt": lib.region(1, "1"),
    "map/strategicregions/2-Land.txt": lib.region(2, "2 3 4"),
  };
  for (const [f, body] of Object.entries(states)) files["history/states/" + f] = body;
  return world.mod(name, files);
}
const rowsOf = (mod) => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
/** The province a row stands on, read the way the game reads it: its own truncated pixel. */
const standsOn = (line) => { const c = line.split(";"); const x = Math.floor(parseFloat(c[2])), y = md.buildingZToPixelY(H, parseFloat(c[4])); return x < 0 || y < 0 || x >= W || y >= H ? 0 : provAt(x, y); };
const portsOn = (mod, province) => rowsOf(mod).filter((l) => l.split(";")[1] === "naval_base_spawn" && standsOn(l) === province);

(async () => {
  let srv = null;
  try {
    console.log("0. The port pass asks the re-homes the click's last pass applies, for its write and not for the rule's dry run");
    {
      const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
      const code = maskJsComments(src), lit = maskJsLiterals(src);
      const at = code.indexOf("function fixCoastalNoPort(");
      const span = at >= 0 ? jsBodyAt(lit, at) : null;
      const body = span ? code.slice(span[0], span[1] + 1) : "";
      rec("THE CONTROL: fixCoastalNoPort's body is found, comments masked", body.length > 2000, body.length);
      const dry = body.indexOf("if (dryRun) return"), scan = body.indexOf("buildingsTxtPlacementScan("), list = body.indexOf("rehomesTheModOwns(");
      rec("⭐⭐ it reads the re-home list fixBuildingsTxtPlacement writes (rehomesTheModOwns over buildingsTxtPlacementScan)", scan > 0 && list > scan, { scan, list });
      rec("⭐ …below the dry run's return, so coastal_no_port still judges the map as the game reads it now", dry > 0 && scan > dry, { dry, scan });
      const fx = code.indexOf("function fixBuildingsTxtPlacement(");
      const fspan = fx >= 0 ? jsBodyAt(lit, fx) : null;
      rec("THE CONTROL: …the list fixBuildingsTxtPlacement itself applies", !!fspan && code.slice(fspan[0], fspan[1] + 1).includes("rehomesTheModOwns("));
    }

    srv = await lib.startServer(createApp);
    const cases = [
      { label: "A. a homed province: 3 is in no state, and its port row is keyed to state 9, which is gone", key: "9",
        states: { "1-Coast.txt": st(1, "2"), "2-Inland.txt": st(2, "4") }, before: "land_not_in_state" },
      { label: "B. a moved province: 3 is in state 1, and its port row is keyed to state 2, which held it", key: "2",
        states: { "1-Coast.txt": st(1, "2 3"), "2-Inland.txt": st(2, "4") }, before: RULE },
    ];
    for (const c of cases) {
      console.log("\n" + c.label);
      const mod = portMod("Rekey " + c.label[0], [PORT2, portOf3(c.key)], c.states);
      rec("THE CONTROL: one port row stands on province 3, keyed to " + c.key, portsOn(mod, 3).length === 1 && portsOn(mod, 3)[0].split(";")[0] === c.key, portsOn(mod, 3));
      const v = await srv.validate(mod);
      rec("the validate request answered", !!v && v.ok === true, v && v.error);
      rec(`THE CONTROL: Map Errors says ${c.before} before the click`, lib.rulesIn(v).includes(c.before), lib.rulesIn(v));
      if (c.before === RULE) rec(`⭐ …${RULE} names province 3: the game ignores a row keyed to a state that does not hold its land`, lib.idsOf(v, RULE).includes(3), lib.idsOf(v, RULE));
      const r = await srv.autoFix(mod);
      rec("Auto-fix ran", r.status === 200 && r.body && r.body.ok === true, r.body);
      const mine = portsOn(mod, 3);
      rec("⭐⭐⭐ the click ends with ONE port row on province 3", mine.length === 1, mine);
      rec("⭐⭐ …its own row, re-keyed to state 1, the state province 3 is in", mine.length === 1 && mine[0] === portOf3("1"), mine);
      rec("…and province 2's port row is untouched", rowsOf(mod).includes(PORT2));
      const v2 = await srv.validate(mod);
      rec(`⭐⭐ Map Errors no longer says ${RULE} or building_wrong_state`, !lib.rulesIn(v2).includes(RULE) && !lib.rulesIn(v2).includes("building_wrong_state"), lib.rulesIn(v2));
      const after1 = rowsOf(mod).join("\n");
      await srv.autoFix(mod);
      rec("⭐ a second click leaves buildings.txt as it was", rowsOf(mod).join("\n") === after1);
    }

    console.log("\nC. THE CONTROL: a coastal province with no port row at all still gets one from the click");
    {
      const mod = portMod("Rekey C", [PORT2], { "1-Coast.txt": st(1, "2 3"), "2-Inland.txt": st(2, "4") });
      rec("THE CONTROL: no port row stands on province 3", portsOn(mod, 3).length === 0);
      const r = await srv.autoFix(mod);
      rec("Auto-fix ran", r.status === 200 && r.body && r.body.ok === true, r.body);
      const mine = portsOn(mod, 3);
      rec("⭐⭐ one click puts one port on province 3, keyed to state 1", mine.length === 1 && mine[0].split(";")[0] === "1", mine);
      rec(`…and ${RULE} is gone`, lib.idsOf(await srv.validate(mod), RULE).length === 0);
    }

    console.log("\nD. The port pass called on its own, outside the click: the moved province's own row is re-keyed, and no row is added");
    {
      const mod = portMod("Rekey D", [PORT2, portOf3("2")], { "1-Coast.txt": st(1, "2 3"), "2-Inland.txt": st(2, "4") });
      const dry = md.fixCoastalNoPort({ modRoot: mod, gameRoot: world.GAME, dependencyRoots: [], dryRun: true });
      rec(`THE CONTROL: the dry run (the rule) names province 3`, !!dry && (dry.targets || []).includes(3), dry);
      const r = md.fixCoastalNoPort({ modRoot: mod, gameRoot: world.GAME, dependencyRoots: [] });
      rec("it answered", !!r && !r.error, r);
      rec("⭐⭐ …and counts province 3 as given its port, by the re-key", !!r && r.added === 1 && (r.provinces || []).includes(3) && (r.rekeyed || []).includes(3), r);
      const mine = portsOn(mod, 3);
      rec("⭐⭐⭐ province 3 has ONE port row: its own, keyed to state 1", mine.length === 1 && mine[0] === portOf3("1"), mine);
      rec("…every other row keeps its bytes", rowsOf(mod).filter((l) => l !== portOf3("1")).join("\n") === SITES.concat([PORT2]).join("\n"), rowsOf(mod));
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a coast keeps the port the click re-keys: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
