// 🌍 Generate land takes the ports that faced the sea it turned into land with it, and says so — as the province inspector's own
// sea → land change already does. #a-port-whose-water-became-land
//
// THE DEFECT. A naval_base_spawn row's 7th column is the SEA its ships lie in, and a port facing LAND is in the curated FATAL set
// (naval_base_water_is_gone): twelve such rows crashed the owner's launch a second after the main menu, and 0 of 17,187 shipping rows
// face land. setProvinceDefinition removes the ports facing a province the moment its water becomes land (removePortsAnchoredTo), and
// autoFixMap's stranded-port pass is commented "Nova now removes them as the water is raised". generateLand — the other writer that
// turns sea into land, and hundreds of provinces at a time — never adopted it.
//
// Measured on base c8e3c5f through the page's own Generate land handler on a fresh vanilla-based mod at the slider's minimum (157 of
// 3,133 sea, seed 7; scratchpad batch10/page/verify-f7.js): validate right after the write reported naval_base_water_is_gone for 117
// ports facing the new land.
//
// THE FIX removes them in the same write, in ONE pass over buildings.txt for every province the click raised (never a write and a
// backup per province), reports it as orphanedPorts like setProvinceDefinition does, and the page's status line names how many.
"use strict";

const fs = require("fs");
const path = require("path");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 500)));
  if (!ok) fails.push(label);
};

const L2 = require("./testlib-two-layer-map.js");
const world = L2.makeWorld("genports");   // before server.js: it reads HOI4_MODS_ROOT when it loads

// A mod that owns its whole map. 256x256: land 1-12 are a 4x3 grid of 64px squares (states 1, 2, 3 by row); below them sea 13
// (x < 96, and x >= 240 across the wrap), sea 14 (x < 176) and sea 15 — split off the 64px grid, and 13 wrapping round the seam, so
// the sea boundary adds no four-province corner (the land grid's own corners are X-crossings, which nothing here reads). Two ports
// face each sea, so whichever one the generator raises, two ports must go and four must stay.
// ⚠️ THREE SEAS, NOT TWO. Whether naval_base_spawn is judged sea-anchored is a vote over the file's rows (anchorKeyedBuildingTypes),
// and with two seas the raised one's ports tie the other's: the rule then reads the type as anchored to land on purpose and reports
// nothing, before and after any fix — a check that cannot fail. Vanilla's 2,362 sea-facing ports never tie; four against two does not.
const provAt = (x, y) => (y < 192 ? Math.floor(x / 64) + Math.floor(y / 64) * 4 + 1 : (x < 96 || x >= 240 ? 13 : x < 176 ? 14 : 15));
const SEAS = [13, 14, 15];
const COL = (p) => [p * 16, 255 - p * 8, (p * 37) % 256];
const Z = (y) => (255 - y).toFixed(2);
const port = (x, sea) => `3;naval_base_spawn;${x.toFixed(2)};9.50;${Z(190)};0.00;${sea}`;
const PORTS = { 13: [port(32, 13), port(80, 13)], 14: [port(112, 14), port(144, 14)], 15: [port(200, 15), port(224, 15)] };
const site = (state, type, x, y) => `${state};${type};${x.toFixed(2)};9.50;${Z(y)};0.00;0`;
const OTHERS = [
  site(1, "air_base", 32, 32), site(1, "rocket_site_spawn", 36, 32),
  site(2, "air_base", 32, 96), site(2, "rocket_site_spawn", 36, 96),
  site(3, "air_base", 32, 160), site(3, "rocket_site_spawn", 36, 160),
  site(3, "arms_factory", 160, 150),                                  // no anchor at all
  `3;floating_harbor;100.00;9.50;${Z(220)};0.00;10`,                  // stands on water, anchored to LAND on purpose
];
function makeMod(name) {
  const rows = ["0;0;0;0;land;false;unknown;0"];
  for (let p = 1; p <= 12; p++) { const [r, g, b] = COL(p); rows.push(`${p};${r};${g};${b};land;${p >= 9 ? "true" : "false"};plains;1`); }
  for (const p of SEAS) { const [r, g, b] = COL(p); rows.push(`${p};${r};${g};${b};sea;false;ocean;0`); }
  const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tmanpower = 5000\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  return world.mod(name, {
    "descriptor.mod": `name="${name}"\nsupported_version="1.*"\nreplace_path="history/states"\nreplace_path="map"\n`,
    "map/provinces.bmp": L2.bmp24(256, 256, (x, y) => COL(provAt(x, y))),
    "map/definition.csv": rows.join("\n") + "\n",
    "history/states/1-A.txt": st(1, "1 2 3 4"), "history/states/2-B.txt": st(2, "5 6 7 8"), "history/states/3-C.txt": st(3, "9 10 11 12"),
    "history/countries/AAA - Aland.txt": "capital = 1\n",
    "map/strategicregions/1-Land.txt": "strategic_region={\n\tid=1\n\tname=\"R1\"\n\tprovinces={ 1 2 3 4 5 6 7 8 9 10 11 12 }\n\tweather={}\n}\n",
    "map/strategicregions/2-Sea.txt": "strategic_region={\n\tid=2\n\tname=\"R2\"\n\tprovinces={ 13 14 15 }\n\tnaval_terrain = water_deep_ocean\n\tweather={}\n}\n",
    "map/adjacencies.csv": "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;-1;-1;-1;-1;-1;-1;-1\n",
    "map/buildings.txt": [...PORTS[13], ...PORTS[14], ...PORTS[15], ...OTHERS].join("\n"),
  });
}
const buildingRows = (mod) => fs.readFileSync(path.join(mod, "map", "buildings.txt"), "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const typeOf = (mod, id) => ((fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "").split(";")[4] || "");
const rulesIn = (v) => ((v && v.problems) || []).map((p) => p.rule);

const P = require("./testlib-map-page.js");
const { createApp } = require("./server.js");

(async () => {
  const srv = await L2.startServer(createApp);
  try {
    console.log("1. ⛔ Generate land raises a sea two ports face");
    {
      const MOD = makeMod("Gen Ports");
      const v0 = await srv.validate(MOD);
      rec("THE CONTROL: before it, no port faces land", !rulesIn(v0).includes("naval_base_water_is_gone"), rulesIn(v0));
      // The page's body: count = max(1, round(sea × 5%)) at the slider's minimum, and the seed field.
      const r = await srv.post("/api/map/generate-land", { count: 1, seed: 7 }, MOD);
      rec("the generator ran and raised one sea province", r.status === 200 && r.body.ok === true && r.body.flippedProvinces === 1, r.body);
      const raisedList = SEAS.filter((p) => typeOf(MOD, p) === "land");
      const raised = raisedList[0], others = SEAS.filter((p) => p !== raised);
      rec("THE CONTROL: exactly one of the three seas is land now", raisedList.length === 1, Object.fromEntries(SEAS.map((p) => [p, typeOf(MOD, p)])));
      const rows = buildingRows(MOD);
      rec("⭐⭐⭐ the response says it took the two ports that faced it", !!(r.body.orphanedPorts && r.body.orphanedPorts.removed === 2), r.body.orphanedPorts);
      rec("⭐⭐⭐ …and no port on disk faces the land it made", !rows.some((l) => l.split(";")[1] === "naval_base_spawn" && l.split(";")[6] === String(raised)), rows.filter((l) => /naval_base_spawn/.test(l)));
      const v1 = await srv.validate(MOD);
      console.log("     (problems after: " + JSON.stringify(rulesIn(v1)) + ")");
      rec("⭐⭐ …so Map Errors has no port facing land to report", !rulesIn(v1).includes("naval_base_water_is_gone"), (v1.problems || []).filter((p) => p.rule === "naval_base_water_is_gone").map((p) => String(p.message).slice(0, 160)));
      rec("⚠️ the four ports facing the seas that stayed sea are untouched, word for word", others.every((s) => PORTS[s].every((l) => rows.includes(l))), { others, rows });
      rec("⚠️ …and so is every other row: the land-anchored harbour, the factory, the air bases and rocket sites", OTHERS.every((l) => rows.includes(l)), OTHERS.filter((l) => !rows.includes(l)));
    }

    console.log("\n2. ⛔ …and the page says so");
    {
      const MOD = makeMod("Gen Ports Page");
      const model = await fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(MOD)}`).then((x) => x.json());
      const provinceType = new Map((model.provinces || []).map((p) => [p.id, p.type]));
      const requests = [], log = [], els = {};
      const el = (id, props) => { els[id] = Object.assign(P.element(), props || {}); return els[id]; };
      el("mapGenConfirmBtn", { disabled: false }); el("mapGenPct", { value: "5" }); el("mapGenSeed", { value: "7" });
      const page = P.runPage([
        ['if ($("mapGenConfirmBtn")) $("mapGenConfirmBtn").addEventListener("click"', "\n  });"],
        "async function load(doneMsg)", "function buildFromImage(img, doneMsg)", "async function mapCrashGate(", "function openMapErrorsModal(",
        "async function reloadAfterImmediateWrite(",
      ], P.loadGlobals({
        modPath: () => MOD, provinceType, closeGenConfirm: () => {}, $: (id) => els[id] || el(id),
        Image: P.fakeImageClass({ log }),
        fetch: async (url, opts) => {
          const res = await fetch(srv.base + String(url), opts);
          const body = await res.json().catch(() => ({}));
          requests.push({ url: String(url).split("?")[0], body });
          return { ok: res.ok, status: res.status, json: async () => body };
        },
      }));
      els.mapGenConfirmBtn.listeners.click[0]();
      for (let i = 0; i < 400 && !log.includes("image-loaded"); i++) await P.settle(10);
      await P.settle(60);
      const gen = requests.find((q) => q.url === "/api/map/generate-land");
      rec("THE CONTROL: the click generated one province", !!(gen && gen.body.ok === true && gen.body.flippedProvinces === 1), gen && gen.body);
      const last = page.statuses[page.statuses.length - 1] || "";
      rec("⭐⭐ the status line left on screen names the ports Generate land took out of map/buildings.txt", /Removed 2 ports?\b/.test(last) && /buildings\.txt/.test(last), { last, statuses: page.statuses });
      rec("⚠️ …and still says what it generated", /Generated 1 land province/.test(last), last);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 5).join(" | ") : e), false);
  } finally {
    srv.close();
    world.cleanup();
    console.log(`\n=== generated land takes the ports that faced its sea with it: ${checks} checks, ${fails.length} failed ===`);
    fails.forEach((f) => console.log("   FAILED: " + f));
    process.exitCode = fails.length ? 1 : 0;
  }
})();
