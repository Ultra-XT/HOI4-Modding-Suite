// ⛔ #a-province-building-above-its-province-max (B4-9, the page part) — THE STATE PANEL'S NAVAL BASE HOLDS TO THE MOST ITS PROVINCE MAY HOLD.
//
// 🔍 → Naval base 25 → 💾 wrote `10721 = { naval_base = 25 }` into a vanilla state where common/buildings caps naval_base at province_max = 10,
// and nothing said a word (the campaign's repro-B4-9). The data part (group b) hands the page the caps with the map model —
// buildingProvinceMax { naval_base: 10, … } and strategicLocationExtras, counted as the server's provinceBuildingMaxAt counts them — and
// reports a level above it (province_building_over_max, a warning). The page now gives the field that max, and stageStateWrite refuses a
// level above it in one sentence, puts the field back, and stages the panel's other changes; a Save that stages the panel itself carries
// the sentence to its own line. A model without the caps (an older server's) leaves the field as it always was: no max, nothing refused.
//
// RUN, not grepped: the page's own provinceBuildingMaxOnPage, readStateForm and stageStateWrite (lifted from public/map.js) on a panel filled
// the way showInfo fills it, in BOTH model shapes; and flushMapSaves's carrying of the sentence, from its masked source.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("./testlib-map-page.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 500) : "")); } };

const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];
const CODE = ["function provinceBuildingMaxOnPage(", "function readStateForm()", "function stageStateWrite(sid, pid)"].map((o) => P.lift(o)).join("\n");

/** The panel as showInfo fills it for `st` at province `pid`, the Naval base typed as `level`, then the page's own stageStateWrite. */
function stage({ model, st, pid, level, manpower }) {
  const inputs = {
    miNameInp: { value: String(st.displayName || "") }, miOwnerSel: { value: String(st.owner || "") }, miCoresInp: { value: "" },
    miManpowerInp: { value: String(st.manpower || 0) }, miCategoryInp: { value: "" },
    miNavalBase: { value: String(((st.provinceBuildings || {})[pid] || {}).naval_base || 0) },
  };
  const bld = BLD.map((b) => ({ dataset: { bld: b }, value: "0" })), res = RES.map((r) => ({ dataset: { res: r }, value: "0" }));
  const queued = [];
  const sb = {
    console, model, pushUndo: () => {}, rebaselineStateForm: () => {}, provinceToOwner: {}, pendingWrites: [], stateFormBaseline: null,
    stateById: new Map([[st.id, JSON.parse(JSON.stringify(st))]]), $: (id) => inputs[id] || { value: "" }, collectVps: () => [],
    document: { querySelectorAll: (sel) => (/data-bld/.test(sel) ? bld : /data-res/.test(sel) ? res : []), createElement: () => ({}) },
    queueWrite: (url, body, meta) => queued.push({ url, body, meta: meta || {} }), countrySelect: { options: [{ value: st.owner || "" }], appendChild() {} },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(`${CODE}\nglobalThis.__stage = stageStateWrite; globalThis.__cap = provinceBuildingMaxOnPage;\nstateFormBaseline = { stateId: ${st.id}, provinceId: ${pid}, shown: readStateForm() };`, sb);
  inputs.miNavalBase.value = String(level);
  if (manpower != null) inputs.miManpowerInp.value = String(manpower);
  const staged = sb.__stage(st.id, pid);
  return { staged, queued, said: sb.__stage.said || "", field: inputs.miNavalBase.value, cap: sb.__cap };
}
const ST = { id: 683, displayName: "Northeastern Canada", owner: "CAN", manpower: 100, provinces: [10721, 10722], provinceBuildings: { 10721: { naval_base: 2 } } };
const CAPS = { buildingProvinceMax: { naval_base: 10, bunker: 10, coastal_bunker: 10 }, strategicLocationExtras: {} };
const pb = (q) => (q && q.body && q.body.fields && q.body.fields.provinceBuildings) || null;

console.log("\n=== a model with the caps (group b's buildMapModel) ===");
{
  const over = stage({ model: CAPS, st: ST, pid: 10721, level: 25 });
  ok(over.staged === null && over.queued.length === 0, "⭐⭐⭐ a naval base of 25 where the province may hold 10 is not staged", over.queued);
  ok(/^🚫 Province 10721 can hold a naval base of at most 10 \(province_max in common\/buildings\), so 25 was not staged and the Naval base field is back at 2\.$/.test(over.said), "⭐⭐ …in one sentence that names the cap and where it comes from", over.said);
  ok(String(over.field) === "2", "…and the field is back at what the province holds", over.field);
  const withMore = stage({ model: CAPS, st: ST, pid: 10721, level: 25, manpower: 500 });
  ok(withMore.queued.length === 1 && withMore.queued[0].body.fields.manpower === "500" && !pb(withMore.queued[0]) && /at most 10/.test(withMore.said), "⭐⭐ the panel's other changes are staged as usual, without the naval base", withMore.queued.map((q) => q.body));
  const atCap = stage({ model: CAPS, st: ST, pid: 10721, level: 10 });
  ok(atCap.queued.length === 1 && JSON.stringify(pb(atCap.queued[0])) === JSON.stringify([{ province: 10721, building: "naval_base", level: 10 }]) && !atCap.said, "⭐ the cap itself is staged", atCap.queued.map((q) => q.body));
  const sl = { ...ST, strategicLocations: [{ province: 10721, location: "natural_harbor" }] };
  const harbour = { ...CAPS, strategicLocationExtras: { natural_harbor: { naval_base: 2 } } };
  ok(stage({ model: harbour, st: sl, pid: 10721, level: 12 }).queued.length === 1, "⭐ a strategic location's extra levels count (natural_harbor: 10 + 2)");
  const sl13 = stage({ model: harbour, st: sl, pid: 10721, level: 13 });
  ok(sl13.queued.length === 0 && /at most 12 \(province_max in common\/buildings, with 2 more from its strategic location\)/.test(sl13.said), "…and are said when the level goes past them", sl13.said);
  ok(stage({ model: harbour, st: sl, pid: 10722, level: 11 }).queued.length === 0, "…only on the province the location names");
  const stateWide = { ...ST, strategicLocations: [{ location: "natural_harbor", effect: "strategic_state_location" }] };
  ok(stage({ model: harbour, st: stateWide, pid: 10722, level: 12 }).queued.length === 1, "…or on every province, for a strategic_state_location (as the server counts it)");
}

console.log("\n=== a model without them (an older server's): the field holds to nothing, as before ===");
{
  const old = stage({ model: { states: [] }, st: ST, pid: 10721, level: 25 });
  ok(old.queued.length === 1 && JSON.stringify(pb(old.queued[0])) === JSON.stringify([{ province: 10721, building: "naval_base", level: 25 }]) && !old.said, "⭐⭐ 25 is staged, as it always was", old.queued.map((q) => q.body));
  ok(old.cap(ST, 10721, "naval_base") === null, "…and the page knows no cap", old.cap(ST, 10721, "naval_base"));
}

console.log("\n=== the field's max, and the Save's line (the masked source) ===");
{
  const M = P.MASKED;
  const show = maskJsComments(P.lift("function showInfo("));
  ok(/provinceBuildingMaxOnPage\(st, selected\.provinceId, "naval_base"\)/.test(show) && /nb\.max = String\(cap\.max\)/.test(show) && /removeAttribute\("max"\)/.test(show), "⭐ showInfo gives the Naval base field the province's max, and takes it away when the model names none");
  const flush = maskJsComments(P.lift("async function flushMapSaves", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }"));
  ok(/stageStateWrite\(stateFormBaseline\.stateId, stateFormBaseline\.provinceId\); panelSaid = stageStateWrite\.said \|\| "";/.test(flush) && /const dropped = \[\];\s*if \(panelSaid\) dropped\.push\(panelSaid\);/.test(flush), "⭐⭐ a Save that stages the panel itself carries the refusal to its own line (its notes)");
  ok(M.split("function provinceBuildingMaxOnPage(").length === 2, "…and the page has one such helper");
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
