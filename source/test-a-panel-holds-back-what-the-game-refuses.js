// ⛔ #a-panel-holds-back-what-the-game-refuses — THE STATE PANEL DOES NOT STAGE A DOCKYARD ON A STATE WITH NO COAST, OR A VICTORY POINT ON A
// PROVINCE THE STATE DOES NOT HOLD, AND SAYS SO (tool campaign B2-15, B2-32).
//
// B2-15: ⧉ Copy attrs from a coastal city and 📋 Paste attrs onto an inland state wrote the city's dockyards into a state with no coast (the
// Dockyard field had no coast check either). The Save stopped at the FATAL state_naval_building_without_coast, and 🔧 Auto-fix carried the
// dockyards to a coastal state the modder never touched, over its slots. ↔ Move already judged the coast at the click.
// B2-32: the panel took a victory point on a province of ANOTHER state, set-state wrote it (HOI4 logs it and does not show it:
// vp_not_in_state), and the 🏘 Town box addVpRow ticks painted a town on the other state's land.
//
// The page's own showInfo, saveState, stageStateWrite, Copy/Paste attrs and 💾 Save on a fake DOM (testlib-state-panel-page.js), each write
// sent to map-data.js as server.js's handler passes it. Binds no port, starts no server.
// Run: node test-a-panel-holds-back-what-the-game-refuses.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-panel-holds-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const L = require("./testlib-state-panel-page.js");
const { makeWorld, openPage, stateText, hist, DEFAULT_HISTORY } = L;
const { lift, MASKED } = require("./testlib-map-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "\n       " + JSON.stringify(x).slice(0, 700) : "")); }
};
const J = (x) => JSON.stringify(x);
let seq = 0;
const world = (opts) => {
  const roots = makeWorld(ROOT, `w${++seq}`, opts);
  return { roots, pg: openPage(md, roots, md.buildMapModel({ ...roots, cacheStableLayers: false })) };
};
const setStates = (pg) => pg.queue().filter((w) => w.url === "/api/map/set-state");
const navalRuleOn = (roots) => {
  const r = md.validateMapBitmap({ ...roots });
  return ((Array.isArray(r) ? r : (r && r.problems) || [])).find((p) => p.rule === "state_naval_building_without_coast") || null;
};
// the world (testlib-state-panel-page.js): state 4 = provinces 8 (inland) + 12 (coast), dockyard 7 and a 1939 8; state 2 = province 7, inland;
// state 1 = provinces 2 + 6, on the coast
{
  const { pg } = world();
  const coastOf = (sid) => pg.state(sid).provinces.some((p) => pg.ctx.provinceHasCoastOnPage(p));
  ok(coastOf(4) && !coastOf(2) && coastOf(1), "(the world: state 4 and state 1 have a coast, state 2 has none)", { 4: coastOf(4), 2: coastOf(2), 1: coastOf(1) });
}

console.log("=== 1. B2-15: 📋 Paste attrs from a coastal state onto one with no coast leaves the dockyards off, and says so ===");
{
  const { pg, roots } = world();
  pg.inspect(12); pg.ctx.copyStateAttrs();
  pg.inspect(7); pg.ctx.pasteStateAttrs();
  const w = setStates(pg).find((x) => x.body.stateId === 2);
  ok(!!w && !("dockyard" in ((w.body.fields || {}).buildings || {})), "the set-state the paste staged carries no dockyard", w && w.body.fields);
  ok(!!w && ((w.body.fields || {}).buildings || {}).infrastructure === 2, "…and the rest of the profile goes (infrastructure 2)", w && w.body.fields);
  ok(/^📋 Pasted dev profile onto state 2/.test(pg.last()) && /⚓ State 2 has no coast, so its dockyards stay as they were: HOI4 refuses a dockyard in a state with no coast/.test(pg.last()),
    "the paste's line says the dockyards stayed off, and why", pg.last());
  ok(!pg.state(2).buildings || !Number(pg.state(2).buildings.dockyard), "the page's copy of state 2 holds no dockyard", pg.state(2).buildings);
  pg.save();
  ok(!/dockyard/.test(stateText(roots, 2).replace(/#[^\n]*/g, "")), "the Save writes no dockyard into state 2's file", stateText(roots, 2));
  // (state_naval_building_without_coast is one of the bitmap rules: validateMapBitmap holds it, as the Save's check runs it)
  ok(typeof md.validateMapBitmap === "function", "(map-data.js exports validateMapBitmap, which holds state_naval_building_without_coast)");
  ok(!navalRuleOn(roots), "the map has no state_naval_building_without_coast after the Save", navalRuleOn(roots));
}

console.log("=== 2. B2-15: the Dockyard field on a state with no coast, by Save state and by 💾 Save ===");
{
  const { pg } = world();
  pg.inspect(7); pg.setBuilding("dockyard", 3); pg.saveStateButton();
  ok(setStates(pg).length === 0, "Save state stages nothing when the dockyard was the only edit", pg.queue().map((w) => w.body));
  ok(/^⚓ State 2 has no coast/.test(pg.last()), "…and says why", pg.last());
}
(async () => {
  {
    const { pg, roots } = world();
    pg.inspect(7); pg.setBuilding("dockyard", 3); pg.setBuilding("arms_factory", 2);
    const line = await pg.flush();
    ok(/⚓ State 2 has no coast/.test(line), "💾 Save straight after typing it: the Save's line says the dockyard was held", line);
    const t = stateText(roots, 2).replace(/#[^\n]*/g, "");
    ok(!/dockyard/.test(t) && /arms_factory\s*=\s*2/.test(t), "…writes the other building, and no dockyard", t);
  }
  {
    const { pg } = world();
    pg.inspect(2); pg.setBuilding("dockyard", 3); pg.saveStateButton();
    const w = setStates(pg)[0];
    ok(!!w && ((w.body.fields || {}).buildings || {}).dockyard === 3, "CONTROL: a coastal state's dockyard is staged as typed", w && w.body.fields);
    ok(!/⚓/.test(pg.last()), "…and nothing is said of a coast", pg.last());
  }
  {
    const { pg } = world({ history: Object.assign({}, DEFAULT_HISTORY, { 2: hist(5) }) });
    pg.inspect(7); pg.setBuilding("dockyard", 0); pg.saveStateButton();
    const w = setStates(pg)[0];
    ok(!!w && ((w.body.fields || {}).buildings || {}).dockyard === 0 && !/⚓/.test(pg.last()), "lowering a dockyard on a state with no coast is staged (that is how it is put right)", w && w.body.fields);
  }

  console.log("=== 3. B2-32: a victory point on a province the state does not hold is not added, and is said ===");
  {
    const { pg, roots } = world();
    pg.inspect(12); pg.ctx.addVpRow(2);
    const rows = pg.$("miVpList").querySelectorAll();
    rows[rows.length - 1].querySelector(".mi-vp-val").value = "1";
    pg.saveStateButton();
    ok(setStates(pg).length === 0 && !pg.queue().some((w) => /victory-point-towns/.test(w.url)), "nothing is staged: no set-state, no town", pg.queue().map((w) => [w.url, w.body]));
    ok(/^🏅 Province 2 is not one of state 4's provinces \(it is in state 1\), so its victory point was not added: HOI4 logs a victory point outside its state and does not show it\./.test(pg.last()),
      "the line names the province, the state that holds it, and what HOI4 does", pg.last());
    ok(!pg.state(4).victoryPoints.some((v) => v.province === 2) && !pg.vpRows().some((r) => /^2:/.test(r)), "the page's copy and the panel do not have it", { page: pg.state(4).victoryPoints, panel: pg.vpRows() });
    pg.save();
    ok(!/victory_points\s*=\s*\{[^}]*\b2 1\b/.test(stateText(roots, 4)), "nothing reaches state 4's file", stateText(roots, 4));
  }
  {
    const { pg } = world();
    pg.inspect(12); pg.ctx.addVpRow(8);
    const rows = pg.$("miVpList").querySelectorAll();
    rows[rows.length - 1].querySelector(".mi-vp-val").value = "1";
    pg.ctx.addVpRow(6);
    pg.$("miVpList").querySelectorAll().slice(-1)[0].querySelector(".mi-vp-val").value = "2";
    pg.saveStateButton();
    const w = setStates(pg)[0];
    ok(!!w && J(w.body.fields.victoryPoints) === J([{ province: 12, value: 5 }, { province: 8, value: 1 }]), "a row on the state's own province is staged; the other is held", w && w.body.fields);
    ok(/^State 4 edited/.test(pg.last()) && /🏅 Province 6 is not one of state 4's provinces \(it is in state 1\)/.test(pg.last()), "…and the line says both", pg.last());
  }
  {
    // a row the panel was SHOWN with stays as it is, even off the state's land: the panel did not add it
    const H = Object.assign({}, DEFAULT_HISTORY, { 4: DEFAULT_HISTORY[4].replace("12 5 # the harbour town", "12 5 # the harbour town\n\t\t\t2 3") });
    const { pg } = world({ history: H });
    pg.inspect(12);
    const r0 = pg.$("miVpList").querySelectorAll()[0];
    r0.querySelector(".mi-vp-val").value = "6";
    pg.saveStateButton();
    const w = setStates(pg)[0];
    ok(!!w && J(w.body.fields.victoryPoints) === J([{ province: 12, value: 6 }, { province: 2, value: 3 }]) && !/🏅/.test(pg.last()), "a victory point the state already had off its land is left as it is", { fields: w && w.body.fields, line: pg.last() });
  }

  console.log("=== 4. heldPanelEdits: no 🏘 town is painted at a province the state does not hold ===");
  {
    const code = ["function provinceHasCoastOnPage(", "function heldPanelEdits("].map((o) => lift(o)).join("\n") + "\n" + lift("const NAVAL_ONLY_STATE_KEYS =", ";").replace(/^const /, "var ");
    const sb = { model: { provinceToState: { 1: 9, 2: 9, 5: 4 } }, provinceType: new Map(), provinceDef: new Map(), provNeighborsCache: new Map(), buildProvNeighbors() {} };
    vm.createContext(sb); vm.runInContext(code, sb);
    const st = { id: 9, provinces: [1, 2] };
    const shown = { victoryPoints: [{ province: 5, value: 1 }], buildings: {}, towns: [] };
    const now = { victoryPoints: [{ province: 5, value: 1 }, { province: 1, value: 2 }], towns: [5, 1] };
    const fields = { victoryPoints: now.victoryPoints.slice() };
    const words = sb.heldPanelEdits(9, fields, now, shown, st);
    ok(J(now.towns) === J([1]) && words.some((w) => /^🏘 No town is painted at province 5: it is not state 9's/.test(w)),
      "a ticked town on a row the state already had off its land is not painted, and is said", { towns: now.towns, words });
    ok(J(fields.victoryPoints) === J(now.victoryPoints), "…while the row itself is left as it is", fields);
  }

  console.log("=== 5. the coast is judged as ↔ Move judges it ===");
  {
    const body = (src) => src.slice(src.indexOf("{") + 1, src.lastIndexOf("}")).split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
    const mine = body(lift("function provinceHasCoastOnPage("));
    const at = MASKED.indexOf("const coastalOnPage = (p) => {");
    ok(at >= 0, "doMoveProvince still has its coastalOnPage");
    const end = MASKED.indexOf("\n    };", at);
    const theirs = body(MASKED.slice(at, end + "\n    };".length).replace(/;\s*$/, ""));
    ok(mine === theirs, "provinceHasCoastOnPage asks what doMoveProvince's coastalOnPage asks, statement for statement", { mine, theirs });
  }

  console.log("=== 6. a held edit is taken back out of the panel, so the next edit is judged against what the state holds (review of the fix) ===");
  {
    // 💾 Save with nothing else staged: no reload follows, so the panel stays as it was left
    const { pg, roots } = world();
    pg.inspect(7); pg.setBuilding("dockyard", 4);
    const first = await pg.flush();
    const field = () => pg.bld.find((i) => i.dataset.bld === "dockyard").value;
    ok(/⚓ State 2 has no coast/.test(first) && /Nothing else to save\.$/.test(first), "a dockyard typed on a state with no coast is held by 💾 Save, and said", first);
    ok(field() === "0", "…and the panel's Dockyard field reads what the state holds (0), not the 4 that was held", field());
    pg.setBuilding("dockyard", 2);
    const second = await pg.flush();
    ok(/⚓ State 2 has no coast/.test(second) && !setStates(pg).length, "a lower dockyard typed after it (2) is judged against the state's 0, held and said", { second, queue: pg.queue().map((w) => w.body) });
    ok(!/dockyard/.test(stateText(roots, 2).replace(/#[^\n]*/g, "")) && !navalRuleOn(roots), "…so no dockyard reaches state 2's file, and no state_naval_building_without_coast is left", stateText(roots, 2));
  }
  {
    const { pg, roots } = world();
    pg.inspect(12); pg.ctx.addVpRow(2);
    const rows = pg.$("miVpList").querySelectorAll();
    rows[rows.length - 1].querySelector(".mi-vp-val").value = "1";
    const first = await pg.flush();
    ok(/🏅 Province 2 is not one of state 4's provinces/.test(first), "a victory point on another state's province is held by 💾 Save, and said", first);
    ok(!pg.vpRows().some((r) => /^2:/.test(r)), "…and its row is out of the panel", pg.vpRows());
    pg.$("miVpList").querySelectorAll()[0].querySelector(".mi-vp-val").value = "7";
    await pg.flush();
    const t = stateText(roots, 4).replace(/#[^\n]*/g, "");
    ok(/victory_points\s*=\s*\{\s*12 7\s*\}/.test(t) && !/victory_points\s*=\s*\{[^}]*\b2 1\b/.test(t), "an edit of the state's own victory point after it writes that one only, not the held row", t);
  }

  console.log("=== 7. (review) the held dockyard's line claims a Save stop only while the curated fatal set holds the rule ===");
  {
    // (group a's B1-31 takes state_naval_building_without_coast out of the fatal set: both shapes, and this tree's own set)
    const ML = require("./public/map-rule-labels.js");
    const shapes = [["this tree's own fatal set", ML, ML.isFatalRule("state_naval_building_without_coast")],
      ["a fatal set without the rule (B1-31)", { isFatalRule: () => false }, false],
      ["a fatal set with it", { isFatalRule: (r) => r === "state_naval_building_without_coast" }, true],
      ["no rule labels loaded", undefined, false]];
    for (const [shape, labels, stops] of shapes) {
      const { pg } = world();
      pg.ctx.window.NovaMapRuleLabels = labels;
      pg.inspect(7); pg.setBuilding("dockyard", 3); pg.saveStateButton();
      const line = pg.last();
      ok(/⚓ State 2 has no coast, so its dockyards stay as they were: HOI4 refuses a dockyard in a state with no coast/.test(line)
        && /the Save would stop on it/.test(line) === stops && (stops || /the building never appears/.test(line)),
        `${shape}: the line says the Save would stop ${stops ? "" : "NOT "}— as the fatal set says`, line);
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) {}
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log("  FAIL " + (e && e.stack || e)); process.exit(1); });
