// THE STATE PANEL SHOWS WHAT IT STAGES, AND SAYS WHAT IT CHANGED OF WHAT WAS TYPED — leftovers of the tool campaign's state-panel lows.
//
//   B2-12 ⛔ #a-population-of-0-is-written-as-1 — Population 0 → Save state → 💾 Save wrote `manpower = 1` (the writer floors it,
//         setStateFieldsInBlock), while the panel and the page's copy still read 0 and nothing said why. The page's copy now holds what the
//         writer writes, the field is put at it, and the floor is said — at the panel and at the bulk bar's "set population".
//   L2    (group e's review) — a naval base already above its province_max (from an older Nova) lowered to a level still above it was
//         refused, and the field went back to the higher level; a lowering is now staged, and said to be still above the cap.
//   L1    (group e's review; fixed at the base by the join of 38c649c2) — during a running Save, a staging that refuses a naval base and
//         keeps an unticked town says both.
//
// RUN, not grepped: the page's own readStateForm, stageStateWrite, bulkSetField and bulkSetManpower (lifted from public/map.js), on a panel
// filled the way showInfo fills it; the floor they mirror is the writer's own, asked of map-data.js's setStateFieldsInBlock. Binds no port.
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("./testlib-map-page.js");
const mapData = require("./map-data.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 500) : "")); } };

const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
const BLD = [...new Set([...html.matchAll(/data-bld="([a-z_]+)"/g)].map((m) => m[1]))];
const RES = [...new Set([...html.matchAll(/data-res="([a-z_]+)"/g)].map((m) => m[1]))];
const NAVAL = P.lift("const NAVAL_ONLY_STATE_KEYS =", ";").replace(/^const /, "var ");
const CODE = ["function provinceBuildingMaxOnPage(", "function readStateForm()", "function heldPanelEdits(", "function stageStateWrite(sid, pid)", "function collectVps()"]
  .map((o) => P.lift(o)).join("\n") + "\n" + NAVAL;

/** What the writer puts in a state file for a typed population: setStateFieldsInBlock's own answer, or null when it leaves the line alone. */
function written(typed) {
  const out = mapData.setStateFieldsInBlock("state = {\n\tid = 1\n\tmanpower = 500\n\tprovinces = { 1 }\n}\n", { manpower: typed });
  const m = /manpower\s*=\s*(-?\d+)/.exec(out);
  return m ? Number(m[1]) : null;
}

/** The panel as showInfo fills it for `st`, then `edit` typed into it, then the page's own stageStateWrite. */
function stage({ st, pid, manpower, naval, running, untickTown, model }) {
  const inputs = {
    miNameInp: { value: String(st.displayName || "") }, miOwnerSel: { value: String(st.owner || "") }, miCoresInp: { value: "" },
    miManpowerInp: { value: String(st.manpower || 0) }, miCategoryInp: { value: "" },
    miNavalBase: { value: String(((st.provinceBuildings || {})[pid] || {}).naval_base || 0) },
  };
  const town = { checked: true };
  const rows = (st.victoryPoints || []).map((v) => ({ querySelector: (sel) => (sel === ".mi-vp-prov" ? { value: String(v.province) } : sel === ".mi-vp-val" ? { value: String(v.value) } : sel === ".mi-vp-town" ? town : null), remove() {} }));
  inputs.miVpList = { querySelectorAll: () => rows };
  const bld = BLD.map((b) => ({ dataset: { bld: b }, value: String((st.buildings || {})[b] || 0) })), res = RES.map((r) => ({ dataset: { res: r }, value: "0" }));
  const queued = [];
  const sb = {
    console, model: model || { buildingProvinceMax: { naval_base: 10 }, strategicLocationExtras: {}, provinceToState: {} },
    pushUndo: () => {}, rebaselineStateForm: () => {}, provinceToOwner: {}, pendingWrites: [], stateFormBaseline: null,
    stateById: new Map([[st.id, JSON.parse(JSON.stringify(st))]]), $: (id) => inputs[id] || { value: "", querySelectorAll: () => [] },
    document: { querySelectorAll: (sel) => (/data-bld/.test(sel) ? bld : /data-res/.test(sel) ? res : []), createElement: () => ({}) },
    queueWrite: (url, body, meta) => queued.push({ url, body, meta: meta || {} }), countrySelect: { options: [{ value: st.owner || "" }], appendChild() {} },
    provinceHasCoastOnPage: () => true,
  };
  if (running) sb.flushMapSaves = Object.assign(function flushMapSaves() {}, { running: true });
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(`${CODE}\nglobalThis.__stage = stageStateWrite;\nstateFormBaseline = { stateId: ${st.id}, provinceId: ${pid}, shown: readStateForm() };`, sb);
  if (manpower != null) inputs.miManpowerInp.value = String(manpower);
  if (naval != null) inputs.miNavalBase.value = String(naval);
  if (untickTown) town.checked = false;
  const staged = sb.__stage(st.id, pid);
  return { staged, queued, said: String(sb.__stage.said || ""), field: inputs.miManpowerInp.value, navalField: inputs.miNavalBase.value, page: sb.stateById.get(st.id) };
}

const ST = { id: 1, displayName: "Corsica", owner: "FRA", manpower: 500, provinces: [3838], buildings: {}, provinceBuildings: {} };
const FLOOR = /Population (\S+) is written as 1: HOI4 warns of a land state with no people \("State has no people living in it"\), so Nova keeps at least 1\./;

console.log("\n-- B2-12: the writer's floor, asked of the writer --");
const w0 = written("0"), w500 = written("500"), wBlank = written("");
ok(w0 === 1 && w500 === 500 && wBlank === 500, "THE CONTROL: setStateFieldsInBlock writes 0 as 1, 500 as 500, and leaves a blank alone", { w0, w500, wBlank });

console.log("\n-- B2-12: the state panel --");
{
  const z = stage({ st: ST, pid: 3838, manpower: 0 });
  ok(z.queued.length === 1 && z.queued[0].body.fields.manpower === "0", "THE CONTROL: Population 0 is staged as the panel always sent it", z.queued.map((q) => q.body));
  ok(z.page.manpower === w0, "⭐⭐⭐ the page's copy of the state holds what the writer writes (1), not 0", z.page.manpower);
  ok(String(z.field) === String(w0), "⭐⭐ …and so does the Population field", z.field);
  ok(FLOOR.test(z.said) && FLOOR.exec(z.said)[1] === "0", "⭐⭐ …and the line says 0 is written as 1, and why", z.said);
  const n = stage({ st: ST, pid: 3838, manpower: 750 });
  ok(n.page.manpower === 750 && String(n.field) === "750" && !FLOOR.test(n.said), "THE CONTROL: Population 750 is 750, with nothing said", { m: n.page.manpower, said: n.said });
  const neg = stage({ st: ST, pid: 3838, manpower: -4 });
  ok(neg.page.manpower === written("-4") && FLOOR.test(neg.said), "⭐ a negative population is floored as the writer floors it, and said", { m: neg.page.manpower, w: written("-4"), said: neg.said });
  const blank = stage({ st: ST, pid: 3838, manpower: "" });
  ok(blank.page.manpower === wBlank && String(blank.field) === String(wBlank) && !FLOOR.test(blank.said), "⭐ a cleared field leaves the population as the writer leaves it, and the field shows it again", { m: blank.page.manpower, field: blank.field, said: blank.said });
}

console.log("\n-- B2-12: the bulk bar's set population --");
{
  const BULK = ["function bulkSetField(", "function bulkSetManpower("].map((o) => P.lift(o)).join("\n");
  const st2 = { id: 2, manpower: 300 }, st3 = { id: 3, manpower: 900 };
  let line = "";
  const queued = [];
  const sb = {
    multiSelect: new Set([2, 3]), stateById: new Map([[2, st2], [3, st3]]), pushUndo: () => {}, recolorAll() {}, draw() {}, showInfo() {},
    queueWrite: (url, body) => queued.push({ url, body }), setStatus: (t) => { line = String(t); }, $: (id) => (id === "mapMultiManpower" ? { value: "0" } : null),
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(`${BULK}\nbulkSetManpower();`, sb);
  ok(queued.length === 2 && queued.every((q) => q.url === "/api/map/set-state" && q.body.fields.manpower === 0), "THE CONTROL: both selected states are staged with population 0, as before", queued.map((q) => q.body));
  ok(st2.manpower === w0 && st3.manpower === w0, "⭐⭐ the page's copies hold what the writer writes for each", { s2: st2.manpower, s3: st3.manpower });
  ok(/^set population 1 → 2 states \(unsaved — click 💾 Save\)\./.test(line) && FLOOR.test(line), "⭐⭐ …and the bar's line says 1, and why", line);
}

console.log("\n-- group e's review L2: a naval base already above its province_max can be lowered --");
{
  const OVER = { id: 683, displayName: "Northeastern Canada", owner: "CAN", manpower: 100, provinces: [10721, 10722], buildings: {}, provinceBuildings: { 10721: { naval_base: 25 } } };
  const pb = (q) => q && q.body && q.body.fields && q.body.fields.provinceBuildings;
  const ctl = stage({ st: Object.assign({}, OVER, { provinceBuildings: { 10721: { naval_base: 2 } } }), pid: 10721, naval: 25 });
  ok(ctl.queued.length === 0 && /^🚫 Province 10721 can hold a naval base of at most 10 \(province_max in common\/buildings\), so 25 was not staged and the Naval base field is back at 2\.$/.test(ctl.said),
    "THE CONTROL: a raise above the cap is refused as before, in the same sentence", { q: ctl.queued, said: ctl.said });
  const low = stage({ st: OVER, pid: 10721, naval: 15 });
  ok(low.queued.length === 1 && JSON.stringify(pb(low.queued[0])) === JSON.stringify([{ province: 10721, building: "naval_base", level: 15 }]), "⭐⭐⭐ 25 lowered to 15 is staged, not put back at 25", low.queued.map((q) => q.body));
  ok(String(low.navalField) === "15", "⭐⭐ …the field keeps the 15 typed", low.navalField);
  ok(/^⚠ Province 10721 can hold a naval base of at most 10 \(province_max in common\/buildings\): 15 is staged, as it lowers the 25 the province holds, but it is still above that — set 10 or less\.$/.test(low.said), "⭐⭐ …and the line says it is still above the cap", low.said);
  const up = stage({ st: OVER, pid: 10721, naval: 30 });
  ok(up.queued.length === 0 && /so 30 was not staged and the Naval base field is back at 25\./.test(up.said) && String(up.navalField) === "25", "⭐ 25 raised to 30 is still refused", { q: up.queued, said: up.said });
  const toCap = stage({ st: OVER, pid: 10721, naval: 10 });
  ok(toCap.queued.length === 1 && JSON.stringify(pb(toCap.queued[0])) === JSON.stringify([{ province: 10721, building: "naval_base", level: 10 }]) && !toCap.said, "⭐ 25 lowered to the cap is staged with nothing to say", { q: toCap.queued.map((q) => q.body), said: toCap.said });
}

console.log("\n-- group e's review L1 (fixed at the base, held here): during a running Save, a refused naval base and an unticked town are both said --");
{
  const ST2 = { id: 683, displayName: "Coast", owner: "CAN", manpower: 100, provinces: [10721, 10722], buildings: {}, provinceBuildings: { 10721: { naval_base: 2 } }, victoryPoints: [{ province: 10722, value: 5 }] };
  const both = stage({ st: ST2, pid: 10721, naval: 25, running: true, untickTown: true });
  ok(/🚫 Province 10721 can hold a naval base of at most 10/.test(both.said), "⭐⭐ the refusal is said", both.said);
  ok(/The 🏘 town of province 10722 is in the Save that is running/.test(both.said) && both.said.indexOf("🚫") < both.said.indexOf("🏘"), "⭐ …and so is the town the running Save keeps, after it", both.said);
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
