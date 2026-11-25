// A sea province turned into land in the province inspector must not keep the sea's terrain.
// #a-flipped-sea-keeps-its-ocean-terrain
//
// Select a SEA province and the inspector's terrain dropdown holds its terrain, `ocean`. Change the Type
// dropdown to `land` and saveProvinceTerrain reads that dropdown as it stands — nothing repopulated it — and
// queues POST /api/map/set-province-terrain {provinceId, terrain:"ocean", type:"land", coastal}. The server
// falls through to setProvinceDefinition, which writes `<id>;r;g;b;land;false;ocean;1`.
//
// That function already clamps the CONTINENT on exactly this change (#land-row-continent-zero), raises the
// heightmap, recomputes every neighbour's coastal flag and drops the ports whose water became land. The
// terrain column, beside the continent, was the one thing it did not look at. Every other water→land writer
// in Nova supplies a land terrain: flipProvinceToLand (plains), fixInlandSeas (a land neighbour's, else
// plains) and generateLand (plains). The mirror direction in the same client function already resyncs the
// dropdown after land→water.
//
// Measured across the six shipping maps (vanilla, Millennium Dawn, Road to 56, Old World Blues, Novum
// Vexillum, Rise of Nations): 0 of 77,816 land rows carry `ocean`, and 0 carry any naval terrain. Old World
// Blues has 4 land rows on `lakes` and launches, so the repair is ONLY on a water→land change — an existing
// land province's terrain is left alone however unusual it is.
//
// The client half is the real saveProvinceTerrain lifted out of public/map.js and RUN, so this measures
// what the client queues rather than grepping it. The server half is POSTed exactly the body the client
// used to send, so a stale caller is covered too.
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (detail == null ? "" : "   " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 260)));
  if (!ok) fails.push(label);
};

// Everything this test writes stays in one mkdtemp sandbox: app data (where safeModWrite files its
// backups), the home dir and the mods root.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flipterr-"));
const APPDATA = path.join(SANDBOX, "appdata");
const HOME = path.join(SANDBOX, "home");
const MODS = path.join(SANDBOX, "mods");
for (const d of [APPDATA, HOME, MODS]) fs.mkdirSync(d, { recursive: true });
process.env.APPDATA = APPDATA;
process.env.XDG_CONFIG_HOME = APPDATA;
process.env.NOVA_APP_DATA_DIR = APPDATA;
process.env.NOVA_HOME_DIR = HOME;
process.env.HOI4_MODS_ROOT = MODS;

const md = require("./map-data.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

// A mod that owns its whole map, so vanilla's rows never merge into this fixture. Its own terrain file
// declares which categories are water — the code under test must read that, not a list of its own.
function makeMod(name) {
  const mod = path.join(MODS, name);
  mk(path.join(mod, "descriptor.mod"), `name="${name}"\nsupported_version="1.19.*"\nreplace_path="history/states"\nreplace_path="map"\n`);
  mk(path.join(mod, "common", "terrain", "00_terrain.txt"), [
    "categories = {",
    "\tunknown = { color = { 255 0 0 } }",
    "\tocean = { naval_terrain = yes color = { 40 83 176 } is_water = yes }",
    "\tlakes = { color = { 58 91 255 } is_water = yes }",
    "\tplains = { color = { 255 129 66 } }",
    "\tforest = { color = { 89 199 85 } }",
    "}",
    "",
  ].join("\n"));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0",
    "1;10;0;0;land;true;plains;1",
    "2;20;0;0;land;false;lakes;1",   // the Old World Blues shape: land on `lakes`, shipping, launches
    "3;30;0;0;lake;false;lakes;0",
    "4;40;0;0;sea;false;ocean;0",
    "5;50;0;0;sea;false;ocean;0",
    "6;60;0;0;sea;false;ocean;0",
    "",
  ].join("\r\n"));
  mk(path.join(mod, "map", "adjacencies.csv"), "From;To;Type;Through;start_x;start_y;stop_x;stop_y;adjacency_rule_name;Comment\n-1;-1;;-1;-1;-1;-1;-1;;\n");
  mk(path.join(mod, "history", "states", "1-Probe.txt"),
    "state = {\n\tid = 1\n\tname = \"STATE_1\"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n");
  return mod;
}
const rowOf = (mod, id) => (fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).find((l) => l.split(";")[0] === String(id)) || "");

// ── the client function, lifted and run ─────────────────────────────────────────────────────────────
const CODE = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
function fnText(name) {
  const at = CODE.indexOf(`function ${name}(`);
  if (at === -1) return "";
  const open = CODE.indexOf("{", at);
  let d = 0;
  for (let i = open; i < CODE.length; i++) { if (CODE[i] === "{") d++; else if (CODE[i] === "}") { d--; if (d === 0) return CODE.slice(at, i + 1); } }
  return "";
}
// ⛔ #a-sea-made-land-takes-the-coast-its-dockyards-stood-on — and the two helpers its sea → land branch asks what the change takes the
// coast of (review of the coast rows, CR-R3), with the page's list of the levels a coast carries
// (…and ⛔ #a-deleted-state-says-every-dockyard-it-takes — the two they read and say a state's dockyards with)
const SAVE = fnText("saveProvinceTerrain") + "\n" + fnText("coastsASeaMadeLandTakes") + "\n" + fnText("seaMadeLandNavalWords") + "\n" + fnText("stateNavalLevels") + "\n" + fnText("navalLevelsWords")
  + "\n" + ((CODE.match(/const NAVAL_ONLY_STATE_KEYS = [^;]*;/) || [""])[0]);

// Drive the inspector the way a user does: the dropdowns hold what fillInspector put in them, then ONE of
// them changes and the change handler runs.
function runInspector(model, pdef, change) {
  const els = {
    miTypeSel: { value: pdef.type },
    miTerrainSel: { value: pdef.terrain },
    miCoastalChk: { checked: !!pdef.coastal },
  };
  Object.assign(els.miTypeSel, change.type ? { value: change.type } : {});
  Object.assign(els.miTerrainSel, change.terrain ? { value: change.terrain } : {});
  if (change.coastal != null) els.miCoastalChk.checked = change.coastal;
  const queued = [];
  const ctx = {
    selected: { provinceId: pdef.id },
    provinceDef: new Map([[pdef.id, Object.assign({}, pdef)]]),
    $: (id) => els[id],
    model,
    window: { confirm: () => true },
    pushUndo() {}, beginEraseStroke() {}, eraseProvinceLocal() { return false; }, commitEraseStroke() {},
    computeSeaAdjacency() {}, seaAdjacent: null,
    provNeighborsCache: new Map(), buildProvNeighbors() {},
    queueWrite(url, body) { queued.push({ url, body }); return { ok: true, deferred: true }; },
    provinceType: new Map(), setStatus() {}, pendingWrites: [],
  };
  vm.createContext(ctx);
  vm.runInContext(SAVE + "\nsaveProvinceTerrain();", ctx);
  return { queued, els, local: ctx.provinceDef.get(pdef.id) };
}

let server = null;
(async () => {
  try {
    const PROBE = makeMod("clientprobe");
    const model = md.buildMapModel({ modRoot: PROBE, gameRoot: null, dependencyRoots: [], cacheStableLayers: false });
    const cats = model.terrainCategories || [];
    const water = new Set(cats.filter((c) => c.water).map((c) => c.name));
    const land = new Set(cats.filter((c) => !c.water).map((c) => c.name));
    const def = (id) => (model.provinces || []).find((p) => p.id === id);

    console.log("[control] the fixture is what this test thinks it is");
    rec("the model reads the mod's terrain file, water flags included", water.has("ocean") && water.has("lakes") && land.has("plains"), cats);
    rec("province 4 is sea on ocean", def(4) && def(4).type === "sea" && def(4).terrain === "ocean", def(4));
    rec("saveProvinceTerrain was lifted out of public/map.js", SAVE.length > 1500, SAVE.length + " chars");

    console.log("\n1. ⛔ The inspector: sea → land");
    {
      const r = runInspector(model, def(4), { type: "land" });
      const w = r.queued[0] || { body: {} };
      rec("one write was queued, to the terrain endpoint", r.queued.length === 1 && w.url === "/api/map/set-province-terrain", r.queued);
      rec("…turning the province into land", w.body.type === "land", w.body);
      rec("⭐⭐⭐ …with a LAND terrain, not the sea's", land.has(String(w.body.terrain)) && !water.has(String(w.body.terrain)), w.body);
      rec("⭐⭐ the dropdown now shows what was queued, as the land→sea direction already does", r.els.miTerrainSel.value === w.body.terrain, { select: r.els.miTerrainSel.value, queued: w.body.terrain });
      rec("⭐ …and the page's own copy agrees, so terrain map-mode stops drawing it as sea", r.local.terrain === w.body.terrain, r.local);
    }

    console.log("\n2. Controls: what the inspector must NOT rewrite");
    {
      const r = runInspector(model, def(2), { coastal: true });
      const w = r.queued[0] || { body: {} };
      rec("⭐⭐ an existing land province on `lakes` keeps it (Old World Blues ships four)", w.body.terrain === "lakes" && w.body.type === "land", w.body);
      const r2 = runInspector(model, def(1), { terrain: "forest" });
      rec("an ordinary terrain repaint goes through untouched", (r2.queued[0] || { body: {} }).body.terrain === "forest", r2.queued);
    }

    // ── the server, sent the body the client used to send ────────────────────────────────────────────
    const { createApp } = require("./server.js");
    const PORT = 54163;
    const app = createApp();
    await new Promise((resolve, reject) => { server = app.listen(PORT, resolve); server.on("error", reject); });
    const post = (ep, body) => fetch(`http://127.0.0.1:${PORT}${ep}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }).then(async (res) => ({ s: res.status, b: await res.json().catch(() => ({})) }));

    console.log("\n3. ⛔ The endpoint: a stale `ocean` on a sea → land change");
    {
      const MOD = makeMod("serverprobe");
      const r = await post("/api/map/set-province-terrain", { modPath: MOD, provinceId: 4, terrain: "ocean", type: "land", coastal: false });
      rec("the request succeeded", r.s === 200 && r.b && r.b.ok !== false, r.b);
      const cols = rowOf(MOD, 4).split(";");
      rec("the row is land", cols[4] === "land", rowOf(MOD, 4));
      rec("⭐⭐⭐ …and its terrain is a land terrain on disk", land.has(cols[6]) && !water.has(cols[6]), rowOf(MOD, 4));
      rec("…with the continent clamp beside it still applied", Number(cols[7]) >= 1, rowOf(MOD, 4));

      const lk = await post("/api/map/set-province-terrain", { modPath: MOD, provinceId: 3, terrain: "lakes", type: "land", coastal: false });
      const lc = rowOf(MOD, 3).split(";");
      rec("⭐⭐ a lake → land change does not keep `lakes` either", lk.s === 200 && lc[4] === "land" && land.has(lc[6]) && !water.has(lc[6]), rowOf(MOD, 3));

      const own = await post("/api/map/set-province-terrain", { modPath: MOD, provinceId: 5, terrain: "forest", type: "land", coastal: false });
      rec("a land terrain CHOSEN on a sea → land change is kept", own.s === 200 && rowOf(MOD, 5).split(";")[6] === "forest", rowOf(MOD, 5));

      const keep = await post("/api/map/set-province-terrain", { modPath: MOD, provinceId: 2, terrain: "lakes", type: "land", coastal: true });
      rec("⭐⭐ an existing land row on `lakes` is left on `lakes`", keep.s === 200 && rowOf(MOD, 2).split(";")[6] === "lakes" && rowOf(MOD, 2).split(";")[5] === "true", rowOf(MOD, 2));
    }

    console.log("\n4. ⭐ The whole chain: what the client queues, sent as Save sends it");
    {
      const MOD = makeMod("chainprobe");
      const m = md.buildMapModel({ modRoot: MOD, gameRoot: null, dependencyRoots: [], cacheStableLayers: false });
      const q = runInspector(m, (m.provinces || []).find((p) => p.id === 6), { type: "land" }).queued[0] || { body: {} };
      // flushMapSaves: Object.assign({}, w.body, { modPath: modPath() })
      const r = await post(q.url || "/api/map/set-province-terrain", Object.assign({}, q.body, { modPath: MOD }));
      const cols = rowOf(MOD, 6).split(";");
      rec("⭐⭐ the saved row is land on a land terrain", r.s === 200 && cols[4] === "land" && land.has(cols[6]) && !water.has(cols[6]), rowOf(MOD, 6));
    }

    console.log(`\n=== a sea turned to land does not keep its ocean terrain: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 10).join("\n") : e);
    process.exitCode = 1;
  } finally {
    if (server) { try { server.closeAllConnections(); } catch (_) {} try { server.close(); } catch (_) {} }
    try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (_) {}
  }
})();
