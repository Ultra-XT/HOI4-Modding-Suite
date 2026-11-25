// A replace_path line added to descriptor.mod while Nova is open is seen by the very next request.
// #a-descriptor-edited-while-nova-is-open
//
// THE DEFECT. The Delete-map dialog (public/map.js blankConfirmBody) tells a modder building a world from scratch to add
// replace_path="history/states" / replace_path="history/countries" to descriptor.mod first. The only way the page leaves
// them to do that is with Nova open. But readReplacePaths (map-data.js) memoised each root's answer in _replacePathCache
// for the life of the process — the ACTIVE mod's root included, whose layer buildMapModel otherwise re-reads on every
// build — so once the page had opened the mod, the model, Map Errors, the Save gate, Delete map and Generate land kept
// answering for the base game's states until Nova was restarted. server.js keeps its own copy of the same memo
// (getModReplacePaths, behind getActiveRoots), which every picker that honours replace_path reads.
//
// THE EVIDENCE (batch 8 discovery r10-replace.js, two fresh mods over vanilla on one server, 65978a2):
//   * line added AFTER the page opened the mod: the model still listed vanilla's states (provinceToState 10,272),
//     validate said 0 errors / 0 warnings with the gate clean, and the next create-state took id 1082. Read from disk the
//     game's way: 0 states, 10,154 land provinces in no state, 363 capitals on missing states.
//   * the same line written BEFORE any request for that mod: 0 states, 327 errors (capital_state_missing 324, land_not_in_state,
//     …), gate armed, next create-state id 1.
//   * the owner's own flow (f2a.js): after the line, Delete map's Save still answered survivors { states: 1081 } and asked for
//     the line already present, and Generate land numbered its states from 1082 over a map the game loads with no state 1..1081
//     (state_id_gap, FATAL, unreported).
//
// THE FIX. Both memos are kept only while descriptor.mod is the file they read: size, modified and changed times and file id,
// the stamp mapFileChangeStamp already keys a validate's bitmap comparison on (#a-map-file-changed-after-a-validate-is-asked-again).
//
// Judged by a CONTROL mod that carries the line from the start, so what the answer should be is measured, not typed in; and in
// both directions (a line added, a line removed). Requests are the page's: GET /api/map/model?modPath and
// GET /api/map/validate?modPath (opening the map, Map Errors, the Save gate), POST /api/map/create-state { name, owner, modPath }
// (flushMapSaves posts the queued body with modPath added), GET /api/focus/shared-available?modPath (the focus page, which warms
// server.js's memo) and GET /api/buildings/state-catalog?modPath (the focus building panel and the Army air-base picker).
"use strict";

const fs = require("fs");
const path = require("path");
const lib = require("./testlib-two-layer-map.js");
const { maskJsComments } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, ok, detail) => {
  checks++;
  console.log((ok ? "  ok   " : "  FAIL ") + label + (ok || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 700)));
  if (!ok) fails.push(label);
};

const world = lib.makeWorld("b9-rp-live");
const { createApp } = require("./server.js");

const LINE = 'replace_path="history/states"';
const descriptorOf = (mod) => path.join(mod, "descriptor.mod");
/** What a modder does in a text editor: append the line, in the file's own line endings. */
const addLine = (mod, line) => {
  const t = fs.readFileSync(descriptorOf(mod), "utf8");
  const eol = t.indexOf("\r\n") !== -1 ? "\r\n" : "\n";
  fs.writeFileSync(descriptorOf(mod), t.replace(/\s*$/, "") + eol + line + eol);
};
const removeLine = (mod, line) => {
  const t = fs.readFileSync(descriptorOf(mod), "utf8");
  const at = t.indexOf(line);
  if (at < 0) throw new Error("the line to remove is not in " + descriptorOf(mod));
  const end = t.indexOf("\n", at);
  fs.writeFileSync(descriptorOf(mod), t.slice(0, at) + (end < 0 ? "" : t.slice(end + 1)));
};
/** Rule -> how many problems of it, so two mods at different paths compare by what they are told, not by message text. */
const ruleCounts = (v) => {
  const out = {};
  for (const p of (v && v.problems) || []) out[p.rule] = (out[p.rule] || 0) + 1;
  return JSON.stringify(Object.keys(out).sort().map((k) => [k, out[k]]));
};

(async () => {
  let srv = null;
  try {
    console.log("0. Why a modder edits descriptor.mod with Nova open");
    {
      const MAP = maskJsComments(fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8"));
      const at = MAP.indexOf("function blankConfirmBody(");
      const body = at < 0 ? "" : MAP.slice(at, MAP.indexOf("\n  }", at));
      rec("the Delete-map dialog still tells the modder to add replace_path=\"history/states\" to descriptor.mod",
        body.indexOf("'replace_path=\"history/states\"'") !== -1 && /descriptor\.mod/.test(body), body.slice(0, 200));
    }

    srv = await lib.startServer(createApp);
    const get = (u) => fetch(srv.base + u).then((r) => r.json());
    const model = (mod) => get(`/api/map/model?modPath=${encodeURIComponent(mod)}`);
    const catalog = async (mod) => (await get(`/api/buildings/state-catalog?${new URLSearchParams({ modPath: mod })}`)).items || [];
    const sharedFocus = (mod) => get(`/api/focus/shared-available?modPath=${encodeURIComponent(mod)}`);
    const createState = (mod) => srv.post("/api/map/create-state", { name: "", owner: "" }, mod);
    const gameStates = Object.keys(lib.GAME_STATES).length;

    // ── what the answers are when the line is there from the start ──
    console.log("\n1. CONTROL: a mod written with the line before any request");
    const B = world.mod("rp control with line", {});
    addLine(B, LINE);
    const mB = await model(B);
    const vB = await srv.validate(B);
    const gB = await lib.saveGate(vB);
    const catB = (await catalog(B)).length;
    const cB = await createState(B);
    rec("the model loads none of the base game's states", (mB.states || []).length === 0, (mB.states || []).length);
    rec("…so its land is in no state and Save stops", gB.crashes > 0, gB.status);
    rec("…the state catalogue offers none", catB === 0, catB);
    rec("…and a new state takes id 1", cB.status === 200 && cB.body.id === 1, cB.body);

    console.log("\n2. CONTROL: a plain mod over the same game");
    const D = world.mod("rp control plain", {});
    const mD = await model(D);
    const vD = await srv.validate(D);
    const catD = (await catalog(D)).length;
    const cD = await createState(D);
    rec(`the model loads the base game's ${gameStates} states`, (mD.states || []).length === gameStates, (mD.states || []).length);
    rec("…the catalogue offers them", catD === gameStates, catD);
    rec(`…and a new state takes id ${gameStates + 1}`, cD.status === 200 && cD.body.id === gameStates + 1, cD.body);

    console.log("\n3. ⭐⭐⭐ The page opens a mod, THEN the modder adds the line");
    {
      const A = world.mod("rp added while open", {});
      const m0 = await model(A);
      const v0 = await srv.validate(A);
      await sharedFocus(A);
      rec("before the edit the page shows the base game's states", (m0.states || []).length === gameStates, (m0.states || []).length);
      rec("…and Map Errors reads like the plain mod's", ruleCounts(v0) === ruleCounts(vD), { v0: ruleCounts(v0), plain: ruleCounts(vD) });
      addLine(A, LINE);
      const m1 = await model(A);
      rec("⭐⭐⭐ the next model loads none of the base game's states", (m1.states || []).length === (mB.states || []).length, { now: (m1.states || []).length, control: (mB.states || []).length });
      rec("⭐⭐ …and no province is in a state the game no longer loads", Object.keys(m1.provinceToState || {}).length === Object.keys(mB.provinceToState || {}).length,
        { now: Object.keys(m1.provinceToState || {}).length, control: Object.keys(mB.provinceToState || {}).length });
      const v1 = await srv.validate(A);
      rec("⭐⭐⭐ Map Errors now tells it what the control mod is told", ruleCounts(v1) === ruleCounts(vB), { now: ruleCounts(v1), control: ruleCounts(vB) });
      const g1 = await lib.saveGate(v1);
      rec("⭐⭐⭐ …and the Save gate stops for the same number of problems", g1.crashes === gB.crashes && g1.crashes > 0, { now: g1.crashes, control: gB.crashes, status: g1.status });
      const cat1 = (await catalog(A)).length;
      rec("⭐⭐ the state catalogue (server.js's own replace_path memo) offers what the control's does", cat1 === catB, { now: cat1, control: catB });
      const c1 = await createState(A);
      rec("⭐⭐⭐ a new state takes the id the control's took", c1.status === 200 && c1.body.id === cB.body.id, { now: c1.body, control: cB.body.id });
    }

    console.log("\n4. ⭐⭐ The mirror: a mod opened WITH the line, then the modder takes it out");
    {
      const C = world.mod("rp removed while open", {});
      addLine(C, LINE);
      const m0 = await model(C);
      await srv.validate(C);
      await sharedFocus(C);
      rec("with the line the page shows no base state", (m0.states || []).length === 0, (m0.states || []).length);
      removeLine(C, LINE);
      rec("(the line really is gone from descriptor.mod)", fs.readFileSync(descriptorOf(C), "utf8").indexOf("replace_path") === -1);
      const m1 = await model(C);
      rec("⭐⭐ the next model loads the base game's states again", (m1.states || []).length === (mD.states || []).length, { now: (m1.states || []).length, plain: (mD.states || []).length });
      const v1 = await srv.validate(C);
      rec("⭐⭐ …Map Errors reads like the plain mod's", ruleCounts(v1) === ruleCounts(vD), { now: ruleCounts(v1), plain: ruleCounts(vD) });
      const cat1 = (await catalog(C)).length;
      rec("⭐ …the state catalogue offers the base game's states", cat1 === catD, { now: cat1, plain: catD });
      const c1 = await createState(C);
      rec("⭐⭐ …and a new state takes the id the plain mod's took", c1.status === 200 && c1.body.id === cD.body.id, { now: c1.body, plain: cD.body.id });
    }

    console.log("\n5. CONTROL: an untouched descriptor keeps its answer across requests");
    {
      const E = world.mod("rp untouched", {});
      addLine(E, LINE);
      const a = await model(E), b = await model(E);
      rec("two models of the same unedited mod agree", (a.states || []).length === 0 && (b.states || []).length === 0, [(a.states || []).length, (b.states || []).length]);
    }
  } catch (e) {
    rec("harness threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e), false);
  } finally {
    if (srv) srv.close();
    world.cleanup();
    console.log(`\n=== a replace_path added while Nova is open is seen at once: ${checks} checks, ${fails.length} failed ===`);
    if (fails.length) { fails.forEach((f) => console.log("   FAILED: " + f)); process.exitCode = 1; }
  }
})();
