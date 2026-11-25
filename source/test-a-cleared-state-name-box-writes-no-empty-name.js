// A cleared State name box writes no empty name: the state keeps its name, and the answer says so and names it.
// ⛔ #a-cleared-name-box-is-no-name (B2-11)
//
// THE DEFECT (campaign B2-11, verified 2026-11-13). The state panel's name box, cleared, is read as "" (readStateForm trims it) and,
// being changed, is sent: set-state { stateId, nameKey, fields: { displayName: "" } }. writeMapEntityLocName refused only a null name
// and one equal to its key, so ` STATE_1:0 ""` went into the mod's localisation (in every language, by the rename follow): the game
// shows a blank state name, no Map Errors rule reports it, the model fell back to the file's name ("France" for vanilla's Corsica),
// and the page kept "Corsica" (its mirror is `fields.displayName || st.displayName`). The region and supply-area rename rows refuse an
// empty box at the click; the state panel never adopted it.
//
// Now the writer refuses an empty name for all three, and set-state answers `displayName` (the name the state has after the write) and
// `nameRefused` (one plain sentence, on the Save line too as a fileWarning) when the name was not written. The other fields of the same
// request are still written.
//
// Requests are the client's: public/map.js readStateForm + stageStateWrite are lifted and run against a panel filled the way showInfo
// fills it; flushMapSaves posts Object.assign({}, body, { modPath }).
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
const world = lib.makeWorld("b2-11-names");
lib.write(world.GAME, {
  "localisation/english/state_names_l_english.yml": `${BOM}l_english:\n STATE_1:0 "Ay"\n STATE_2:0 "Bee"\n STATE_3:0 "Cee"\n`,
  "localisation/english/strategic_region_names_l_english.yml": `${BOM}l_english:\n R2:0 "Land Region"\n`,
  "localisation/french/state_names_l_french.yml": `${BOM}l_french:\n STATE_1:0 "Ah"\n`,
});

const { createApp } = require("./server.js");
const SERVER = maskJsComments(fs.readFileSync(path.join(__dirname, "server.js"), "utf8"));
const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const MASKED = maskJsComments(MAP);
const liftFrom = (masked, raw, signature) => {
  const at = masked.indexOf(signature);
  if (at < 0) return "";
  let d = 0;
  for (let i = masked.indexOf("{", at); i < masked.length; i++) {
    if (masked[i] === "{") d++;
    else if (masked[i] === "}") { d--; if (d === 0) return raw.slice(at, i + 1); }
  }
  return "";
};
const STAGE = liftFrom(MASKED, MAP, "function stageStateWrite(");
const READ = liftFrom(MASKED, MAP, "function readStateForm(");
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
  vm.runInContext(`${READ}\n${STAGE}\nglobalThis.__stage = stageStateWrite;\nstateFormBaseline = { stateId: ${st.id}, provinceId: ${pid}, shown: readStateForm() };`, sb);
  if (edit) edit(inputs);
  sb.__stage(st.id, pid);
  return queued.find((q) => q.url === "/api/map/set-state");
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
    console.log("0. The code, as this test runs it");
    rec("readStateForm and stageStateWrite lifted out of public/map.js", STAGE.length > 500 && READ.length > 100, { STAGE: STAGE.length, READ: READ.length });
    rec("a cleared box is read as \"\" (the box's value, trimmed)", /displayName: \$\("miNameInp"\)\.value\.trim\(\)/.test(READ));
    const W = liftFrom(SERVER, SERVER, "function writeMapEntityLocName(");
    rec("⭐ writeMapEntityLocName refuses an empty name before it asks anything else", /\|\| name == null\) return "";\s*if \(!String\(name\)\.trim\(\)\) return "";/.test(W), W.slice(0, 300));

    srv = await lib.startServer(createApp);
    const model = async (mod) => fetch(`${srv.base}/api/map/model?modPath=${encodeURIComponent(mod)}`).then((r) => r.json());
    const stateOf = async (mod, id) => ((await model(mod)).states || []).find((s) => s.id === id);

    console.log("\n1. ⛔ The State name box cleared on a base-game state the game names \"Ay\", and Save");
    {
      const mod = world.mod("Cleared Name", {});
      const st = await stateOf(mod, 1);
      rec("the page shows the game's name for it", !!st && st.displayName === "Ay", st && st.displayName);
      const w = pageBody(st, 4, (i) => { i.miNameInp.value = "   "; });
      rec("the page queues set-state with displayName \"\" (what a cleared box sends)", !!w && w.body.fields && w.body.fields.displayName === "", w);
      const before = lib.tree(mod);
      const r = await srv.post(w.url, w.body, mod);
      rec("the save answered", r.status === 200 && r.body.ok === true, r.body);
      rec("⭐⭐⭐ the mod's localisation does not define STATE_1 at all (no empty name in any language)", definitions(mod, "STATE_1").length === 0, definitions(mod, "STATE_1"));
      rec("⭐⭐⭐ …and no file in the mod was written", lib.written(before, lib.tree(mod)).length === 0, lib.written(before, lib.tree(mod)));
      rec("⭐⭐ the answer claims no rename", r.body.renamed !== true, r.body);
      rec("⭐⭐ the answer names the name the state keeps (displayName \"Ay\")", r.body.displayName === "Ay", r.body);
      rec("⭐⭐ …and says in a plain sentence that the name was not written, and why",
        typeof r.body.nameRefused === "string" && /State name box was empty/.test(r.body.nameRefused) && /keeps the name “Ay”/.test(r.body.nameRefused) && /nothing was written/.test(r.body.nameRefused), r.body.nameRefused);
      rec("⭐ …on the Save line too (fileWarning, which the page's Save prints)", typeof r.body.fileWarning === "string" && r.body.fileWarning.indexOf(r.body.nameRefused) !== -1, r.body.fileWarning);
      rec("⭐ the model still names the state \"Ay\", which is what the page mirror shows", ((await stateOf(mod, 1)) || {}).displayName === "Ay");
    }

    console.log("\n2. ⛔ A cleared name box AND a population typed in the same panel: the population is written, the name is not");
    {
      const mod = world.mod("Cleared Name Plus Manpower", {});
      const st = await stateOf(mod, 1);
      const w = pageBody(st, 4, (i) => { i.miNameInp.value = ""; i.miManpowerInp.value = "4321"; });
      rec("the page queues both fields", !!w && w.body.fields.displayName === "" && String(w.body.fields.manpower) === "4321", w && w.body);
      const r = await srv.post(w.url, w.body, mod);
      rec("the save answered ok and wrote the state", r.status === 200 && r.body.ok === true && r.body.changed === true, r.body);
      const file = path.join(mod, "history", "states", "1-A.txt");
      rec("⭐⭐ the population reached the state's file", fs.existsSync(file) && /manpower\s*=\s*4321/.test(fs.readFileSync(file, "utf8")), fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "(no file)");
      rec("⭐⭐⭐ …and no empty name was written", definitions(mod, "STATE_1").length === 0, definitions(mod, "STATE_1"));
      rec("⭐⭐ the refusal is said beside it", typeof r.body.nameRefused === "string" && r.body.displayName === "Ay", r.body);
    }

    console.log("\n3. THE CONTROL: a real rename is written, and its answer names the new name");
    {
      const mod = world.mod("Real Rename", {});
      const st = await stateOf(mod, 2);
      const w = pageBody(st, 2, (i) => { i.miNameInp.value = "Beeville"; });
      const r = await srv.post(w.url, w.body, mod);
      rec("the rename saved", r.status === 200 && r.body.ok === true && r.body.renamed === true, r.body);
      rec("⚠️ the answer names the name written, and refuses nothing", r.body.displayName === "Beeville" && r.body.nameRefused === undefined, r.body);
      const defs = definitions(mod, "STATE_2");
      rec("⚠️ the mod now defines STATE_2 \"Beeville\", once", defs.length === 1 && defs[0].value === "Beeville", defs);
      rec("⚠️ …and the model shows it", ((await stateOf(mod, 2)) || {}).displayName === "Beeville");
    }

    console.log("\n4. THE CONTROL: the name the layers below already give it writes nothing, and the answer still names it");
    {
      const mod = world.mod("Same Name", {});
      const before = lib.tree(mod);
      const r = await srv.post("/api/map/set-state", { stateId: 3, nameKey: "STATE_3", fields: { displayName: "Cee" } }, mod);
      rec("nothing written, no rename claimed, no refusal said", r.body.ok === true && r.body.renamed !== true && r.body.nameRefused === undefined && lib.written(before, lib.tree(mod)).length === 0, r.body);
      rec("…and displayName is the name it has", r.body.displayName === "Cee", r.body);
    }

    console.log("\n4b. ⛔ A name the writer cannot write (its file is read-only) is said, and a save of nothing else is a failed one");
    {
      // (this branch was reached through a Workshop download in test-a-workshop-download-is-never-written.js until the mod-root gate
      // refused that before the name was asked; a read-only names file reaches it for any mod: the rename over it fails)
      const mod = world.mod("Locked Name", {});
      const st = await stateOf(mod, 2);
      const w1 = pageBody(st, 2, (i) => { i.miNameInp.value = "Beeville"; });
      const r1 = await srv.post(w1.url, w1.body, mod);
      const english = definitions(mod, "STATE_2").filter((d) => /english/.test(d.file));
      rec("(a first rename wrote the English name file)", r1.body.renamed === true && english.length === 1, { res: r1.body, english });
      const file = english.length ? path.join(mod, ...english[0].file.split("/")) : "";
      const bytes = file ? fs.readFileSync(file) : Buffer.alloc(0);
      if (file) fs.chmodSync(file, 0o444);
      try {
        const st2 = await stateOf(mod, 2);
        const w2 = pageBody(st2, 2, (i) => { i.miNameInp.value = "Beetown"; });
        const r2 = await srv.post(w2.url, w2.body, mod);
        rec("⭐⭐ the save is a failed one (400, not ok), and claims no rename", r2.status === 400 && r2.body.ok === false && r2.body.renamed !== true, r2);
        rec("⭐⭐ …and says in a plain sentence that the new name could not be written, and which name the state keeps",
          typeof r2.body.nameRefused === "string" && /new name “Beetown” could not be written/.test(r2.body.nameRefused) && /keeps the name “Beeville”/.test(r2.body.nameRefused) && r2.body.displayName === "Beeville", r2.body);
        rec("⭐ …and the file is as it was", file && fs.readFileSync(file).equals(bytes));
      } finally { if (file) fs.chmodSync(file, 0o644); }
    }

    console.log("\n5. ⛔ The shared writer: an empty region name sent straight to the API writes nothing either");
    {
      const mod = world.mod("Cleared Region", {});
      const before = lib.tree(mod);
      const r = await srv.post("/api/map/set-region-name", { nameKey: "R2", name: "  " }, mod);
      rec("⭐⭐ no file written, and no rename claimed", lib.written(before, lib.tree(mod)).length === 0 && r.body.renamed !== true, { res: r.body, written: lib.written(before, lib.tree(mod)) });
    }
  } catch (e) {
    console.error("HARNESS ERROR", e && e.stack ? e.stack.split("\n").slice(0, 12).join("\n") : e);
    fails.push("harness error");
  } finally {
    if (srv) srv.close();
    world.cleanup();
  }
  console.log(`\n=== a cleared state name box writes no empty name: ${checks} checks, ${fails.length} failed ===`);
  if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  else if (checks < 20) { console.log("   too few checks ran"); process.exitCode = 1; }
})();
