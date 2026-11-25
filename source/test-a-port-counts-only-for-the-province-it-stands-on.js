// A port counts only for the province it stands on: a coastal province whose neighbour's port stands a pixel from its border
// is still a coastal province with no port, and Map Errors and Auto-fix treat it as one. #a-port-counts-for-the-province-it-stands-on
//
// THE DEFECT (batch 8 discovery F9). fixCoastalNoPort — the coastal_no_port rule is its dry run, Auto-fix its write — credited a
// naval_base_spawn row to EVERY land province of the row's state in the 3x3 around round(x), row H-1-round(z). The window was
// added so "vanilla's 56 dock-pixel rows" counted for their own province, and it also handed a neighbour's port to a coastal
// province of the same state that has none. After Generate land + Auto-fix on a vanilla-based mod (discovery, 65978a2),
// provinces 7280, 10999 and 11105 kept coastal = true with no port standing on them, each credited with a port standing on a
// same-state neighbour (12297, 2153, 6009), and coastal_no_port said nothing.
//
// THE ENGINE (hoi4.exe, dumpbin; addresses are 1.19.4.1's unless marked). The buildings.txt loader, mapbuildings.cpp 0x141713640,
// truncates the row's x and z (cvttss2si, at 0x14165FFF8 in 1.19.2) and reads the province at that one pixel. A pixel that is not
// land drops the row — ": map building location is not over the land - ignoring instance." (test [province+0D2h],1 at
// 0x141714062) — unless its spawn kind is the one kind allowed on water (0x1406D0A60 is `cmp ecx,1 / sete al`). A port row then
// sets THAT province's port sea zone to column 7 (mov [province+0C8h] at 0x1417148DF). map.cpp 0x140AB7A70 logs
// "is setup as coastal but has no port building in the nudger"
// for each land, coastal province whose [province+0C8h] is still 0. So a port is the port of the province under its own
// truncated pixel and of no other; the 3x3 answered a Math.round artefact (read with floor, the six shipping maps have 0
// naval_base_spawn rows off their own state's land — test-a-building-over-water-is-reported-and-new-slots-stand-on-land.js).
//
// Requests are the page's: GET /api/map/validate?modPath and POST /api/map/auto-fix { modPath } (testlib-two-layer-map.js).
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

const world = lib.makeWorld("b9-sites-ports");
const { createApp } = require("./server.js");
const md = require("./map-data.js");
const RULE = "coastal_no_port";

// 256x256, a mod that ships its whole map. Sea 1 across the top; below it land 2 (left) and land 3 (right), both on the sea and
// both in state 1; land 4 along the bottom, inland, state 2.
const W = 256, H = 256;
const provAt = (x, y) => (y < 64 ? 1 : y < 192 ? (x < 128 ? 2 : 3) : 4);
const COL = { 1: [0, 0, 200], 2: [200, 0, 0], 3: [0, 200, 0], 4: [200, 200, 0] };
const Z = (y) => md.pixelYToBuildingZ(H, y).toFixed(2);          // the z a row needs to stand on top-down pixel row y
const SITES = ["1;air_base;32.00;9.50;" + Z(128) + ";0.00;0", "1;rocket_site_spawn;32.00;9.50;" + Z(128) + ";0.00;0",
  "2;air_base;64.00;9.50;" + Z(220) + ";0.00;0", "2;rocket_site_spawn;64.00;9.50;" + Z(220) + ";0.00;0"];
const st = (id, provs, coastal) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
function portMod(name, portRows) {
  return world.mod(name, {
    "descriptor.mod": `name="${name}"\nsupported_version="1.*"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="history/states"\n`,
    "map/provinces.bmp": lib.bmp24(W, H, (x, y) => COL[provAt(x, y)]),
    "map/definition.csv": ["0;0;0;0;land;false;unknown;0", "1;0;0;200;sea;false;ocean;0", "2;200;0;0;land;true;plains;1", "3;0;200;0;land;true;plains;1", "4;200;200;0;land;false;plains;1"].join("\r\n") + "\r\n",
    "map/buildings.txt": SITES.concat(portRows).join("\n"),
    "map/adjacencies.csv": "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n",
    "map/strategicregions/1-Sea.txt": lib.region(1, "1"),
    "map/strategicregions/2-Land.txt": lib.region(2, "2 3 4"),
    "history/states/1-Coast.txt": st(1, "2 3"),
    "history/states/2-Inland.txt": st(2, "4"),
  });
}
const rowsOf = (mod) => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
/** The province a row stands on, read the way the game reads it: its own truncated pixel. */
const standsOn = (line) => { const c = line.split(";"); const x = Math.floor(parseFloat(c[2])), y = md.buildingZToPixelY(H, parseFloat(c[4])); return x < 0 || y < 0 || x >= W || y >= H ? 0 : provAt(x, y); };
const portsOn = (mod, province) => rowsOf(mod).filter((l) => l.split(";")[1] === "naval_base_spawn" && standsOn(l) === province);
const touchesSea = (p) => { for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) { const a = provAt(x, y); if (a === p && (provAt(x, y - 1) === 1 || (x > 0 && provAt(x - 1, y) === 1))) return true; } return false; };

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);

    console.log("1. ⛔ Province 3's port stands on province 3, a pixel from province 2's border — province 2 has none");
    {
      const PORT3 = "1;naval_base_spawn;128.00;9.50;" + Z(64) + ";0.00;1";       // pixel (128, 64): province 3; (127, 64) is province 2
      const mod = portMod("Neighbour Port", [PORT3]);
      rec("THE CONTROL: provinces 2 and 3 both touch the sea in the bitmap, and province 4 does not", touchesSea(2) && touchesSea(3) && !touchesSea(4));
      rec("THE CONTROL: the port row stands on province 3", standsOn(PORT3) === 3, standsOn(PORT3));
      rec("THE CONTROL: …a pixel from province 2: the pixel to its left is province 2's", provAt(127, 64) === 2);
      rec("THE CONTROL: no port row stands on province 2", portsOn(mod, 2).length === 0);
      const v = await srv.validate(mod);
      rec("the validate request answered", !!v && v.ok === true, v && v.error);
      rec(`⭐⭐⭐ Map Errors reports ${RULE} for province 2`, lib.idsOf(v, RULE).includes(2), lib.rulesIn(v));
      rec("⭐⭐ …and not for province 3, whose own port counts", !lib.idsOf(v, RULE).includes(3), lib.idsOf(v, RULE));

      const before = rowsOf(mod);
      const r = await srv.autoFix(mod);
      rec("Auto-fix ran", r.status === 200 && r.body && r.body.ok === true, r.body);
      const mine = portsOn(mod, 2);
      rec("⭐⭐⭐ one click puts a port on province 2 itself", mine.length === 1, rowsOf(mod).filter((l) => !before.includes(l)));
      rec("⭐⭐ …keyed to province 2's state and facing the sea beside it", mine.length === 1 && mine[0].split(";")[0] === "1" && mine[0].split(";")[6] === "1", mine);
      rec("…and province 3's port row is untouched", rowsOf(mod).includes(PORT3));
      const v2 = await srv.validate(mod);
      rec(`⭐⭐ Map Errors no longer reports ${RULE}`, lib.idsOf(v2, RULE).length === 0, lib.idsOf(v2, RULE));
      const after1 = rowsOf(mod).join("\n");
      await srv.autoFix(mod);
      rec("⭐ a second click leaves buildings.txt as it was", rowsOf(mod).join("\n") === after1);
    }

    console.log("\n2. ⛔ A port row a pixel onto the water counts for no province — the game drops it before it is anyone's port");
    {
      const WET = "1;naval_base_spawn;32.00;9.50;" + Z(63) + ";0.00;1";         // pixel (32, 63): sea 1, one row above province 2
      const PORT3 = "1;naval_base_spawn;192.00;9.50;" + Z(64) + ";0.00;1";      // province 3's own, well away from province 2
      const mod = portMod("Wet Port", [WET, PORT3]);
      rec("THE CONTROL: the row stands on the sea, and the pixel below it is province 2's", standsOn(WET) === 1 && provAt(32, 64) === 2);
      const v = await srv.validate(mod);
      rec(`⭐⭐⭐ Map Errors reports ${RULE} for province 2`, lib.idsOf(v, RULE).includes(2), lib.rulesIn(v));
      rec("⭐⭐ …and building_not_over_land names that row as standing on water — the same row, read the same way",
        ((v.problems || []).find((p) => p.rule === "building_not_over_land") || { items: [] }).items.some((i) => i.type === "naval_base_spawn" && i.stateId === 1), lib.rulesIn(v));
      rec("…while province 3, with its own port, is not reported", !lib.idsOf(v, RULE).includes(3), lib.idsOf(v, RULE));
      const r = await srv.autoFix(mod);
      rec("Auto-fix ran", r.status === 200 && r.body && r.body.ok === true, r.body);
      rec("⭐⭐ one click puts a port on province 2's own land", portsOn(mod, 2).length === 1, rowsOf(mod));
      rec(`⭐ …and ${RULE} is gone`, lib.idsOf(await srv.validate(mod), RULE).length === 0);
    }

    console.log("\n3. THE CONTROL: a province whose own port stands on it is not reported, and Auto-fix writes nothing for it");
    {
      const PORT2 = "1;naval_base_spawn;32.00;9.50;" + Z(64) + ";0.00;1", PORT3 = "1;naval_base_spawn;192.00;9.50;" + Z(64) + ";0.00;1";
      const mod = portMod("Own Ports", [PORT2, PORT3]);
      rec("THE CONTROL: each port stands on its own province", standsOn(PORT2) === 2 && standsOn(PORT3) === 3);
      const v = await srv.validate(mod);
      rec(`⭐⭐ nothing reports ${RULE}`, lib.idsOf(v, RULE).length === 0, lib.idsOf(v, RULE));
      const before = lib.tree(mod);
      await srv.autoFix(mod);
      rec("…and buildings.txt is not touched by a click", lib.tree(mod)["map/buildings.txt"] === before["map/buildings.txt"]);
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a port counts only for the province it stands on: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
