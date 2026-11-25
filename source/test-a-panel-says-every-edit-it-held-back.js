// ⛔ #a-panel-says-every-edit-it-held-back — ONE STAGING OF THE STATE PANEL CAN HOLD BACK TWO THINGS, AND IT SAYS BOTH.
//
// Two fixes of the b2b4 round write the same carrier, stageStateWrite.said, which the panel's callers and 💾 Save put on their line:
// the naval base refused above its province_max (B4-9, group e: "🚫 Province … can hold a naval base of at most …") and the dockyard
// held back on a state with no coast (B2-15, group c: "⚓ State … has no coast …"). Merged, the second assignment replaced the first,
// so a staging that refused both said only the dockyard, and the Naval base field went back to its old value with no reason given.
// Now each is said, the refusal first, and each field is put back.
//
// RUN, not grepped: the page's own provinceBuildingMaxOnPage, readStateForm, heldPanelEdits and stageStateWrite (lifted from
// public/map.js), on a panel filled the way showInfo fills it, with the naval-only keys read from the page's NAVAL_ONLY_STATE_KEYS
// and the building fields from map.html. Binds no port.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 500) : "")); } };

const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];
const NAVAL = P.lift("const NAVAL_ONLY_STATE_KEYS =", ";").replace(/^const /, "var ");
const CODE = ["function provinceBuildingMaxOnPage(", "function readStateForm()", "function heldPanelEdits(", "function stageStateWrite(sid, pid)"]
  .map((o) => P.lift(o)).join("\n") + "\n" + NAVAL;
const naval = vm.runInNewContext(NAVAL + "; NAVAL_ONLY_STATE_KEYS");
const yard = naval.find((k) => BLD.includes(k));
ok(!!yard, "a naval-only building of the page is a field of the state panel (map.html)", { naval, BLD });

/** The panel as showInfo fills it for `st` at province `pid`, then `edit` typed into it, then the page's own stageStateWrite. */
function stage({ model, st, pid, naval: level, yardTo }) {
  const inputs = {
    miNameInp: { value: String(st.displayName || "") }, miOwnerSel: { value: String(st.owner || "") }, miCoresInp: { value: "" },
    miManpowerInp: { value: String(st.manpower || 0) }, miCategoryInp: { value: "" },
    miNavalBase: { value: String(((st.provinceBuildings || {})[pid] || {}).naval_base || 0) },
  };
  const bld = BLD.map((b) => ({ dataset: { bld: b }, value: String((st.buildings || {})[b] || 0) })), res = RES.map((r) => ({ dataset: { res: r }, value: "0" }));
  const queued = [];
  const sb = {
    console, model, pushUndo: () => {}, rebaselineStateForm: () => {}, provinceToOwner: {}, pendingWrites: [], stateFormBaseline: null,
    stateById: new Map([[st.id, JSON.parse(JSON.stringify(st))]]), $: (id) => inputs[id] || { value: "", querySelectorAll: () => [] }, collectVps: () => [],
    document: { querySelectorAll: (sel) => (/data-bld/.test(sel) ? bld : /data-res/.test(sel) ? res : []), createElement: () => ({}) },
    queueWrite: (url, body, meta) => queued.push({ url, body, meta: meta || {} }), countrySelect: { options: [{ value: st.owner || "" }], appendChild() {} },
    provinceHasCoastOnPage: () => false,   // a state with no coast: every one of its provinces is inland
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(`${CODE}\nglobalThis.__stage = stageStateWrite;\nstateFormBaseline = { stateId: ${st.id}, provinceId: ${pid}, shown: readStateForm() };`, sb);
  if (level != null) inputs.miNavalBase.value = String(level);
  if (yardTo != null) bld.find((b) => b.dataset.bld === yard).value = String(yardTo);
  const staged = sb.__stage(st.id, pid);
  return { staged, queued, said: String(sb.__stage.said || ""), navalField: inputs.miNavalBase.value, yardField: bld.find((b) => b.dataset.bld === yard).value };
}

const ST = { id: 683, displayName: "Inland", owner: "CAN", manpower: 100, provinces: [10721, 10722], buildings: {}, provinceBuildings: { 10721: { naval_base: 2 } } };
const MODEL = { buildingProvinceMax: { naval_base: 10 }, strategicLocationExtras: {}, provinceToState: { 10721: 683, 10722: 683 } };
const REFUSED = /🚫 Province 10721 can hold a naval base of at most 10 \(province_max in common\/buildings\), so 25 was not staged and the Naval base field is back at 2\./;
const HELD = /⚓ State 683 has no coast, so its /;

console.log("\n=== each alone (the controls) ===");
{
  const n = stage({ model: MODEL, st: ST, pid: 10721, naval: 25 });
  ok(REFUSED.test(n.said) && !HELD.test(n.said), "a naval base over its province_max alone: the refusal is said", n.said);
  const y = stage({ model: MODEL, st: ST, pid: 10721, yardTo: 3 });
  ok(HELD.test(y.said) && !REFUSED.test(y.said), "a dockyard raised on a state with no coast alone: the hold is said", y.said);
  ok(y.queued.length === 0 && String(y.yardField) === "0", "…nothing is staged, and the field is back at what the state holds", { q: y.queued, f: y.yardField });
}

console.log("\n=== both in one staging ===");
{
  const b = stage({ model: MODEL, st: ST, pid: 10721, naval: 25, yardTo: 3 });
  ok(REFUSED.test(b.said), "⭐⭐⭐ the naval base refusal is still said when the dockyard is held in the same staging", b.said);
  ok(HELD.test(b.said), "⭐⭐ …and so is the dockyard's hold", b.said);
  ok(b.said.search(REFUSED) < b.said.search(HELD), "…the refusal first, as the panel staged them", b.said);
  ok(b.queued.length === 0 && b.staged === null, "⭐ nothing is staged", b.queued);
  ok(String(b.navalField) === "2" && String(b.yardField) === "0", "⭐ both fields are back at what the province and the state hold", { naval: b.navalField, yard: b.yardField });
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
