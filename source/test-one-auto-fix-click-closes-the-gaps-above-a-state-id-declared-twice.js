// One "Auto-fix all" click closes the state-id gaps above a state id declared twice: the references follow the state HOI4 keeps,
// the declaration HOI4 discards gets an id of its own, the click says so, and a second click writes nothing.
// #a-state-id-declared-twice-follows-the-state-hoi4-keeps
//
// THE DEFECT (batch 8 autofix, A-audit-dup-ids; test-map-stress seeds 7 and 424242). closeStateIdGaps slides the highest id down
// into the lowest gap, and checks each move by asking whether the old id is gone. When that id is declared by two state blocks
// the move takes one of them, the other still declares it, and the loop stopped with "couldn't move state 45 into gap 2 —
// stopping to avoid a loop". MEASURED on batch 8's stress-7 snapshot (probe-c.js): click 1 renumbered 2.txt's 45 into gap 2 and
// rewrote every reference to 45 (supply area { 1 45 3 45 } -> { 1 2 3 2 }, BBB's capital 45 -> 2), stopped with that error and
// left state_id_gap; click 2 renumbered 45.txt's 45 into gap 4 and wrote 4 files. Seed 424242's snapshot the same, 41 -> 2 then 4.
//
// WHAT THE GAME DOES WITH A DUPLICATE (hoi4.exe 1.19.2, statetemplate.cpp's loader 0x140AAD450): each `state = { }` it parses is
// looked up by id in the state table; if a state already holds that id (0x140AAD6E9) it logs `State ID conflict: Both "…" ( … )
// and "…" ( … )` (0x140AAD72D), destroys the NEW block (0x140AAD8DF) and moves on. So the first block loaded keeps the id, every
// reference to it names that state, and a later block with the same id is not in the game at all. (A community summary of the
// History/states page said the last one wins; the code says first. None of vanilla, Millennium Dawn or Road to 56 ships one.)
// renumberStateId moves the first declaration in listTxt's order — the one HOI4 keeps — and its references with it, which is
// exactly right; only the loop's check was wrong.
//
// Requests are the page's: POST /api/map/auto-fix { modPath }, GET /api/map/validate?modPath; the summary is the Map Errors
// popup's own click handler, lifted out of public/map.js and run on this click's answer.
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const P = require("./testlib-map-page.js");   // withNoteHelpers: the summary's note helpers, derived not named

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 900)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b9-dup-gap");
const { createApp } = require("./server.js");

const idsIn = (mod) => {
  const dir = path.join(mod, "history", "states"), out = {};
  for (const f of fs.readdirSync(dir).sort()) { const t = fs.readFileSync(path.join(dir, f), "utf8"); const m = /(?:^|\n)\s*id\s*=\s*(\d+)/.exec(t); const p = /provinces\s*=\s*\{([^}]*)\}/.exec(t); out[f] = { id: m ? +m[1] : null, provinces: p ? p[1].trim() : "" }; }
  return out;
};

/** The Map Errors popup's "🔧 Auto-fix all" click, run with `answer` as the auto-fix response; returns the status line it sets. */
async function popupSummary(answer) {
  const labels = require("./public/map-rule-labels.js");
  const MAP = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
  const MASKED = maskJsComments(MAP);
  const s = MASKED.indexOf("function openMapErrorsModal(");
  const e = s < 0 ? -1 : MASKED.indexOf("\n  }", s);
  const modal = s < 0 || e < 0 ? "" : MAP.slice(s, e + 4);
  if (modal.length < 2000) throw new Error("could not lift openMapErrorsModal");
  let status = "";
  const mkEl = () => { const q = new Map(), listeners = {}; return { style: {}, value: "", disabled: false, textContent: "", innerHTML: "", title: "", listeners,
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); }, removeEventListener() {}, focus() {}, click() {}, remove() {}, appendChild() {},
    querySelector(sel) { if (!q.has(sel)) q.set(sel, mkEl()); return q.get(sel); } }; };
  const overlays = [];
  const sb = {
    console, JSON, encodeURIComponent, window: { NovaMapRuleLabels: labels },
    document: { getElementById: () => null, createElement: () => { const o = mkEl(); overlays.push(o); return o; }, body: { appendChild() {} }, addEventListener() {}, removeEventListener() {} },
    setTimeout: () => 0, statusEl: { style: {} }, setStatus: (x) => { status = String(x); }, modPath: () => "D:/fixture", escHtml: (x) => String(x == null ? "" : x),
    // ⚠️ Note helpers are LIFTED, not stubbed. Stubbing the three this test knew about meant a fourth
    // (duplicateStatesLeftNote) arriving in public/map.js threw "is not defined" from inside the click's own
    // catch, reported as "Auto-fix failed: …" and blaming the page. See withNoteHelpers below.
    hasPendingMapEdits: () => false, load: async () => {},
    fetch: async (url) => ({ json: async () => (String(url).indexOf("/api/map/auto-fix") === 0 ? answer : { ok: false }) }),
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(P.withNoteHelpers(modal) + "\nglobalThis.__modal = openMapErrorsModal;", sb);
  sb.__modal({ ok: true, errors: 1, warnings: 0, problems: [{ severity: "error", rule: "state_id_gap", message: "gap" }] });
  const ov = overlays[overlays.length - 1];
  const fixBtn = ov && ov.querySelector("#mapErrFix");
  for (const fn of ((fixBtn && fixBtn.listeners.click) || [])) await fn({});
  return status;
}

(async () => {
  let srv = null;
  try {
    srv = await lib.startServer(createApp);

    console.log("1. ⛔⛔ State 45 declared in two files, with the ids 2 and 3 missing below it");
    // The game's provinces: 4 in state 1, 2 and 5 in 2-B.txt's block, 3 in 45-C.txt's. 2-B.txt sorts first, so HOI4 keeps its 45.
    const mod = world.mod("dup gap", {
      "descriptor.mod": 'name="dup gap"\nsupported_version="1.*"\nreplace_path="history/states"\n',
      "history/states/1-A.txt": lib.st(1, "4"),
      "history/states/2-B.txt": lib.st(45, "2 5"),
      "history/states/45-C.txt": lib.st(45, "3"),
      "map/supplyareas/1-S.txt": 'supply_area = {\n\tid = 1\n\tname = "S"\n\tvalue = 1\n\tstates = { 1 45 }\n}\n',
      "history/countries/AAA - A.txt": "capital = 45\n",
    });
    const before = await srv.validate(mod);
    rec("CONTROL: validate names state_id_gap before the click", lib.rulesIn(before).includes("state_id_gap"), lib.rulesIn(before));
    rec("CONTROL: …and the two files really declare 45", idsIn(mod)["2-B.txt"].id === 45 && idsIn(mod)["45-C.txt"].id === 45, idsIn(mod));

    const c1 = await srv.autoFix(mod);
    const sg = (c1.body && c1.body.fixes && c1.body.fixes.stateGaps) || {};
    rec("click 1 is answered", c1.status === 200 && c1.body && c1.body.ok === true, c1.body);
    rec("⭐⭐⭐ the gap-closer did not stop with an error", !sg.error, sg);
    rec("⭐⭐⭐ …it moved 45 twice, into 2 and then 3", JSON.stringify((sg.renumbered || []).map((r) => [r.from, r.to])) === JSON.stringify([[45, 2], [45, 3]]), sg.renumbered);
    const ids = idsIn(mod);
    rec("⭐⭐ the state HOI4 keeps (2-B.txt, provinces 2 5) is state 2", ids["2-B.txt"] && ids["2-B.txt"].id === 2 && ids["2-B.txt"].provinces === "2 5", ids);
    const discarded = Object.entries(ids).find(([, v]) => v.provinces === "3");
    rec("⭐⭐ the declaration HOI4 discards (provinces 3) is state 3, in a file named for it", !!discarded && discarded[1].id === 3 && /^3-/.test(discarded[0]), ids);
    const cap = fs.readFileSync(path.join(mod, "history", "countries", "AAA - A.txt"), "utf8");
    const sa = fs.readFileSync(path.join(mod, "map", "supplyareas", "1-S.txt"), "utf8");
    rec("⭐⭐ references followed the state HOI4 keeps: the capital is 2", /capital\s*=\s*2\b/.test(cap), cap);
    rec("⭐ …and the supply area lists { 1 2 }", /states\s*=\s*\{\s*1\s+2\s*\}/.test(sa), sa);
    const note = String(sg.duplicateNote || "");
    rec("⭐⭐⭐ the answer says what it did with the duplicate: names 45, the file HOI4 keeps and the one it discards", /\b45\b/.test(note) && /2-B\.txt/.test(note) && /45-C\.txt/.test(note), sg);

    const after = await srv.validate(mod);
    rec("⭐⭐⭐ after ONE click there is no state_id_gap and no duplicate_state_id", !lib.rulesIn(after).includes("state_id_gap") && !lib.rulesIn(after).includes("duplicate_state_id"), lib.rulesIn(after));
    const t1 = lib.tree(mod);
    const c2 = await srv.autoFix(mod);
    const sg2 = (c2.body && c2.body.fixes && c2.body.fixes.stateGaps) || {};
    rec("⭐⭐⭐ click 2 writes nothing and renumbers nothing", lib.written(t1, lib.tree(mod)).length === 0 && !((sg2.renumbered || []).length), { wrote: lib.written(t1, lib.tree(mod)), stateGaps: sg2 });

    console.log("\n2. ⭐⭐ The Map Errors popup's summary line says it — its own click handler, run on click 1's answer");
    {
      const status = await popupSummary(c1.body);
      rec("the summary reports the renumber", /renumbered 2 state/.test(status), status);
      rec("⭐⭐ …and the duplicate note, word for word", note.length > 0 && status.indexOf(note) !== -1, status);
    }
  } catch (e) {
    rec("harness", false, String(e && e.stack || e));
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== one Auto-fix click closes the gaps above a state id declared twice: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
  }
})();
