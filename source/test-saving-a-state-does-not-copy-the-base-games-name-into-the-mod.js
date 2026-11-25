// Saving a state, region or supply area under the name it already has writes no localisation: the mod keeps following the layer below.
// #saving-a-state-does-not-copy-the-base-games-name
//
// THE DEFECT (discovery F15, verified on 790cb21). The state panel's name box is filled from the model's displayName — the name
// localisation resolves through the base game, the dependencies and the mod — and stageStateWrite sends it back as
// fields.displayName on EVERY set-state, whatever was edited. /api/map/set-state called writeMapEntityLocName whenever displayName
// was present, and setLocalizationKeyInPlace writes the mod's own copy of any key the mod does not define ("inherited, or brand
// new") without comparing it to the inherited value. So one click on "Save state" with nothing typed, on vanilla's 1038, answered
// { changed: false, location: "base-unchanged", renamed: true } and gave the mod localisation/english/nova_state_names_l_english.yml
// = ` STATE_1038:0 "Jinan"` — vanilla's state_names_l_english.yml:1260 already says exactly that — and every later panel save of any
// field on any base state added another. Harm: a pin. An add-on stops following its dependency's renames of those states.
// set-region-name and set-supplyarea-name share the writer, and the rename row is pre-filled with the current name.
//
// Now writeMapEntityLocName asks what the layers below resolve the key to, and a name the mod does not define that is already
// exactly that name is not written. A real rename still writes; a key the mod defines is still edited in place.
//
// Requests are the client's: public/map.js stageStateWrite is lifted and run against a panel filled the way showInfo fills it;
// flushMapSaves posts Object.assign({}, body, { modPath }). The region rename body is applyRegionRename's.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const BOM = "﻿";
const world = lib.makeWorld("b11-names");
// The game names its states and its land region; server.js reads the game's localisation the first time it is asked, so it is
// written before the server is required.
lib.write(world.GAME, {
  "localisation/english/state_names_l_english.yml": `${BOM}l_english:\n STATE_1:0 "Ay"\n STATE_2:0 "Bee"\n STATE_3:0 "Cee"\n`,
  "localisation/english/strategic_region_names_l_english.yml": `${BOM}l_english:\n R2:0 "Land Region"\n`,
});
// A dependency that renames state 3 over the game's name.
world.mod("Dep Names", { "localisation/english/dep_state_names_l_english.yml": `${BOM}l_english:\n STATE_3:0 "Dep Three"\n` });

const { createApp } = require("./server.js");
const SERVER = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const lift = (signature) => {
  const at = MASKED.indexOf(signature);
  if (at < 0) return "";
  let d = 0;
  for (let i = MASKED.indexOf("{", at); i < MASKED.length; i++) {
    if (MASKED[i] === "{") d++;
    else if (MASKED[i] === "}") { d--; if (d === 0) return MAP.slice(at, i + 1); }
  }
  return "";
};
const STAGE = lift("function stageStateWrite(");
const READ = lift("function readStateForm(");   // (⛔ #a-panel-edit-sends-what-the-modder-changed — the panel as a write reads it)
const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];

/** The panel as showInfo fills it for `st`, `edit` typed into it, then public/map.js's own stageStateWrite. Returns the queued write. */
function pageBody(st, pid, edit) {
  const inputs = {
    miNameInp: { value: String(st.displayName || st.name || "") },
    miOwnerSel: { value: String(st.owner || "") },
    miCoresInp: { value: (st.cores || []).join(", ") },
    miManpowerInp: { value: String(st.manpower || 0) },
    miCategoryInp: { value: String(st.category || "") },
    miNavalBase: { value: String(((st.provinceBuildings || {})[pid] || {}).naval_base || 0) },
  };
  const bld = BLD.map((b) => ({ dataset: { bld: b }, value: String((st.buildings || {})[b] || 0) }));
  const res = RES.map((r) => ({ dataset: { res: r }, value: String((st.resources || {})[r] || 0) }));
  const queued = [];
  const sb = {
    // (pendingWrites: stageStateWrite replaces the state's queued 🏘 towns in the page's queue: #a-queued-town-is-the-panels-own)
    console, pushUndo: () => {}, rebaselineStateForm: () => {}, provinceToOwner: {}, pendingWrites: [], stateFormBaseline: null,
    stateById: new Map([[st.id, JSON.parse(JSON.stringify(st))]]),
    $: (id) => inputs[id] || { value: "" },
    collectVps: () => (st.victoryPoints || []).map((v) => ({ province: parseInt(v.province, 10), value: parseInt(v.value, 10) })).filter((v) => Number.isFinite(v.province) && Number.isFinite(v.value) && v.value > 0),
    document: { querySelectorAll: (sel) => (/data-bld/.test(sel) ? bld : /data-res/.test(sel) ? res : []), createElement: () => ({}) },
    queueWrite: (url, body, meta) => queued.push({ url, body, meta: meta || {} }),
    countrySelect: { options: [{ value: st.owner || "" }], appendChild() {} },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(`${READ}\n${STAGE}\nglobalThis.__stage = stageStateWrite;\nstateFormBaseline = { stateId: ${st.id}, provinceId: ${pid}, shown: readStateForm() };`, sb);   // what showInfo leaves
  if (edit) edit(inputs);
  sb.__stage(st.id, pid);
  return queued[0];
}

/** Every definition of `key` in the mod's own localisation: [{ file, value }]. */
function definitions(mod, key) {
  const out = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.yml$/i.test(e.name)) continue;
      for (const line of fs.readFileSync(p, "utf8").replace(BOM, "").split(/\r?\n/)) {
        const m = /^\s*([A-Za-z0-9_.\-]+):\d*\s*"(.*)"\s*$/.exec(line);
        if (m && m[1] === key) out.push({ file: path.relative(mod, p).replace(/\\/g, "/"), value: m[2] });
      }
    }
  };
  walk(path.join(mod, "localisation"));
  return out;
}

(async () => {
  let srv = null;
  try {
    console.log("0. The page's code, as this test runs it");
    rec("stageStateWrite lifted out of public/map.js", STAGE.length > 500, STAGE.length);
    rec("showInfo fills the name box with the model's displayName", /\$\("miNameInp"\)\.value = st\.displayName \|\| st\.name \|\| "";/.test(MASKED));
    // (⛔ #a-panel-edit-sends-what-the-modder-changed — it went on every save until the panel sent only what changed; the name typed back is what still reaches this)
    rec("…and stageStateWrite sends what the box holds when it changed, with nameKey = st.name",
      /displayName: \$\("miNameInp"\)\.value\.trim\(\)/.test(READ) && /const nameKey = \(stateById\.get\(sid\) \|\| \{\}\)\.name;/.test(STAGE));
    rec("the region rename row is pre-filled with the region's current name, and Apply queues set-region-name { nameKey, name }",
      /\$\("miRegionRenameInput"\)\.value = r \? \(r\.displayName \|\| r\.name \|\| ""\) : "";/.test(MASKED) && /queueWrite\("\/api\/map\/set-region-name", \{ nameKey: r\.name, name \}\)/.test(MASKED));
    rec("set-state, set-region-name and set-supplyarea-name all write through writeMapEntityLocName",
      ["/api/map/set-state", "/api/map/set-region-name", "/api/map/set-supplyarea-name"].every((ep) => {
        const at = SERVER.indexOf(`app.post("${ep}"`); const next = SERVER.indexOf("app.post(", at + 10);
        return at !== -1 && /writeMapEntityLocName\(/.test(SERVER.slice(at, next));
      }));

    srv = await lib.startServer(createApp);
    const model = async (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const stateOf = async (mod, id) => ((await model(mod)).states || []).find((s) => s.id === id);

    console.log("\n1. ⛔ Save state with nothing typed, on a base-game state the game names \"Bee\"");
    {
      const mod = world.mod("Names Unchanged", {});
      const st = await stateOf(mod, 2);
      rec("the page shows the game's name for it", !!st && st.displayName === "Bee", st && st.displayName);
      rec("the page queues nothing: the panel sends what changed", pageBody(st, 2) === undefined, pageBody(st, 2));
      // …and the same name sent all the same, as a name typed away and back in one panel sends it
      const w = { url: "/api/map/set-state", body: { stateId: 2, nameKey: "STATE_2", fields: { displayName: "Bee" } } };
      const before = lib.tree(mod);
      const r = await srv.post(w.url, w.body, mod);
      rec("the save ran", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐⭐ the mod's localisation does not define STATE_2", definitions(mod, "STATE_2").length === 0, definitions(mod, "STATE_2"));
      rec("⭐⭐⭐ …and no file in the mod was written at all", lib.written(before, lib.tree(mod)).length === 0, lib.written(before, lib.tree(mod)));
      rec("⭐⭐ the response does not claim a rename", r.body.renamed !== true, r.body);
      rec("the page still shows \"Bee\"", ((await stateOf(mod, 2)) || {}).displayName === "Bee");
    }

    console.log("\n2. THE CONTROL: a real rename is written, and shown");
    let renamedMod = null;
    {
      renamedMod = world.mod("Names Renamed", {});
      const st = await stateOf(renamedMod, 2);
      const w = pageBody(st, 2, (i) => { i.miNameInp.value = "Beeville"; });
      const r = await srv.post(w.url, w.body, renamedMod);
      rec("the rename saved", r.status === 200 && r.body.ok === true && r.body.renamed === true, r.body);
      const defs = definitions(renamedMod, "STATE_2");
      rec("⚠️ the mod now defines STATE_2 \"Beeville\", once", defs.length === 1 && defs[0].value === "Beeville", defs);
      rec("⚠️ …and the page shows it", ((await stateOf(renamedMod, 2)) || {}).displayName === "Beeville");
    }

    console.log("\n3. THE CONTROL: a key the mod defines is still edited in place — even back to the game's name");
    {
      const st = await stateOf(renamedMod, 2);
      const w = pageBody(st, 2, (i) => { i.miNameInp.value = "Bee"; });
      const r = await srv.post(w.url, w.body, renamedMod);
      rec("the save ran", r.status === 200 && r.body.ok === true, r.body);
      const defs = definitions(renamedMod, "STATE_2");
      rec("⚠️ the mod's own line now says \"Bee\" (the modder's own key, edited where it is)", defs.length === 1 && defs[0].value === "Bee", defs);
    }

    console.log("\n4. ⛔ An add-on over a dependency that renames state 3: save it untouched, then give it the game's name");
    {
      const mod = world.mod("Names Addon", {}, ["Dep Names"]);
      const st = await stateOf(mod, 3);
      rec("the page shows the dependency's name", !!st && st.displayName === "Dep Three", st && st.displayName);
      const before = lib.tree(mod);
      rec("the page queues nothing", pageBody(st, 3) === undefined, pageBody(st, 3));
      const w = { url: "/api/map/set-state", body: { stateId: 3, nameKey: "STATE_3", fields: { displayName: "Dep Three" } } };
      const r = await srv.post(w.url, w.body, mod);
      rec("the save ran", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐⭐ nothing was written: the add-on keeps following its dependency's name", lib.written(before, lib.tree(mod)).length === 0 && definitions(mod, "STATE_3").length === 0, { written: lib.written(before, lib.tree(mod)), defs: definitions(mod, "STATE_3") });
      const w2 = pageBody(st, 3, (i) => { i.miNameInp.value = "Cee"; });
      const r2 = await srv.post(w2.url, w2.body, mod);
      const defs = definitions(mod, "STATE_3");
      rec("⚠️ typing the GAME's name, which the dependency overrides, is a rename: the add-on gets its own \"Cee\"", r2.body.ok === true && defs.length === 1 && defs[0].value === "Cee", { res: r2.body, defs });
    }

    console.log("\n5. ⛔ Apply a region rename with the name the region already has, then a new one");
    {
      const mod = world.mod("Names Region", {});
      const region = ((await model(mod)).strategicRegions || []).find((x) => x.name === "R2");
      rec("the page shows the game's region name", !!region && region.displayName === "Land Region", region);
      const before = lib.tree(mod);
      const r = await srv.post("/api/map/set-region-name", { nameKey: region.name, name: region.displayName }, mod);
      rec("the rename answered ok", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐⭐ nothing was written", lib.written(before, lib.tree(mod)).length === 0 && definitions(mod, "R2").length === 0, { written: lib.written(before, lib.tree(mod)), defs: definitions(mod, "R2") });
      rec("⭐⭐ …and the answer does not claim a rename", r.body.renamed !== true, r.body);
      const r2 = await srv.post("/api/map/set-region-name", { nameKey: "R2", name: "Heartland" }, mod);
      const defs = definitions(mod, "R2");
      rec("⚠️ a new name is written", r2.body.ok === true && r2.body.renamed === true && defs.length === 1 && defs[0].value === "Heartland", { res: r2.body, defs });
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== saving a state does not copy the base game's name into the mod: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
})();
