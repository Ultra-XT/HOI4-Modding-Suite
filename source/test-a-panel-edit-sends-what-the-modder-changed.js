// ⛔ #a-panel-edit-sends-what-the-modder-changed — A STATE PANEL EDIT SENDS ONLY WHAT THE MODDER CHANGED SINCE THE PANEL WAS SHOWN. (Review of the
// coast rows, F1; the states lens's T01, T03, T08(b)(c), T09.)
//
// The panel sent every field it shows as authoritative, so whatever the page's copy of a state had fallen behind reached the file on the
// modder's next edit of anything. On the base game: paint 6845 into state 359 and Save, and 359's file holds `victory_points = { 6845 20 }`
// and `6845 = { naval_base = 8 }`. Click 6845 in the same page, where the panel showed naval base 0 and only 6882's victory point; type a
// population, Save: the file has lost the 20 and the level 8 naval base, and the line says "Saved 1 change". Seen in a real browser too (T09).
// Every stale copy had the same way to the disk: a merge's kept state, a dropped paint's dockyards.
//
// Two halves: stageStateWrite sends only the fields that differ from what the panel was filled with (setStateFieldsInBlock leaves a field it
// is not sent as it is), and doMoveProvince, doMergeState, the erase brush and a dropped paint move each province's victory point and
// province building block on the page, so the panel shows what the file holds.
//
// Requests are the client's: the page's own showInfo, saveState, stageStateWrite and tools run in a sandbox (testlib-state-panel-page.js), and
// each write goes to map-data.js as server.js's handler passes it. Binds no port. Run: node test-a-panel-edit-sends-what-the-modder-changed.js
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-panel-sends-"));
process.env.APPDATA = path.join(ROOT, "appdata"); process.env.NOVA_APP_DATA_DIR = process.env.APPDATA; process.env.XDG_CONFIG_HOME = process.env.APPDATA;
process.env.NOVA_HOME_DIR = path.join(ROOT, "home");
fs.mkdirSync(process.env.APPDATA, { recursive: true });
fs.mkdirSync(process.env.NOVA_HOME_DIR, { recursive: true });
const md = require("./map-data.js");
const L = require("./testlib-state-panel-page.js");
const { makeWorld, openPage, stateText, hist } = L;

let pass = 0, fail = 0, skipped = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 600) : "")); }
};
const J = (x) => JSON.stringify(x);
const model = (roots) => md.buildMapModel({ ...roots, cacheStableLayers: false });
let seq = 0;
const world = (opts) => { const roots = makeWorld(ROOT, `w${++seq}`, opts); return { roots, pg: openPage(md, roots, model(roots)) }; };
const vpsOf = (t) => (t.replace(/#[^\n]*/g, "").match(/(?<![A-Za-z0-9_])victory_points\s*=\s*\{[^}]*\}/g) || []).map((s) => s.replace(/victory_points\s*=\s*\{|\}/g, "").trim().replace(/\s+/g, " "));
const blockOf = (t, p) => { const m = t.replace(/#[^\n]*/g, "").match(new RegExp("(?<![0-9])" + p + "\\s*=\\s*\\{[^{}]*\\}")); return m ? m[0].replace(/\s+/g, " ") : null; };
const stateFields = (w) => Object.keys((w.body && w.body.fields) || {}).sort();

console.log("\n=== 1. The base game's Pennsylvania: 6845 painted into state 359, saved, then a population typed on 359 ===");
{
  const GAME = "D:/SteamLibrary/steamapps/common/Hearts of Iron IV";
  if (!fs.existsSync(path.join(GAME, "history", "states"))) { skipped++; console.log("  SKIP the base game: not installed"); }
  else {
    const dir = path.join(ROOT, "over-vanilla");
    L.write(dir, "descriptor.mod", 'name="over-vanilla"\n');
    const roots = { modRoot: dir, gameRoot: GAME, dependencyRoots: [] };
    const m = model(roots);
    const sea = md.landProvincesTouchingSea({ ...roots, model: m });
    const seaId = m.provinces.find((p) => p.type === "sea").id;
    const pg = openPage(md, roots, m, { neighbours: () => { const adj = new Map(); for (const p of sea) adj.set(p, new Set([seaId])); return adj; } });
    pg.move(6845, 359);
    ok(pg.urls().join() === "move-province", "(the paint queued one move)", pg.urls());
    ok(/went with|go with it/.test(pg.last()), "(the click said the dockyards go with it)", pg.last());
    const s359 = pg.state(359), s360 = pg.state(360);
    ok(s359.victoryPoints.some((v) => v.province === 6845 && v.value === 20) && !s360.victoryPoints.some((v) => v.province === 6845), "⭐ the page moves 6845's victory point (20) with it at the click", { to: s359.victoryPoints, from: s360.victoryPoints });
    ok(((s359.provinceBuildings || {})[6845] || {}).naval_base === 8 && !(s360.provinceBuildings || {})[6845], "⭐ …and its naval base (level 8)", { to: s359.provinceBuildings, from: s360.provinceBuildings });
    pg.save();
    const before = stateText(roots, 359);
    ok(vpsOf(before).includes("6845 20") && /naval_base = 8/.test(blockOf(before, 6845) || ""), "(359's file holds the victory point and the naval base after the Save)", { vp: vpsOf(before), block: blockOf(before, 6845) });
    pg.inspect(6845);
    ok(pg.$("miNavalBase").value == 8, "⭐⭐ the panel of 359, clicked on 6845, shows the level 8 naval base the file holds", pg.$("miNavalBase").value);
    ok(pg.vpRows().includes("6845:20") && pg.vpRows().includes("6882:5"), "⭐⭐ …and both victory points", pg.vpRows());
    pg.$("miManpowerInp").value = "4000000";
    pg.saveStateButton();
    ok(pg.urls().join() === "set-state" && J(stateFields(pg.queue()[0])) === J(["manpower"]), "⭐⭐ a population typed on 359 sends the population alone", pg.queue().map((w) => w.body));
    pg.save();
    const after = stateText(roots, 359);
    ok(vpsOf(after).includes("6845 20") && vpsOf(after).includes("6882 5"), "⭐⭐ the file keeps the moved victory point", vpsOf(after));
    ok(/naval_base = 8/.test(blockOf(after, 6845) || ""), "⭐⭐ …and the level 8 naval base", blockOf(after, 6845));
    ok(/manpower\s*=\s*4000000/.test(after), "(…and has the new population)");
    ok(after.replace(/manpower\s*=\s*\d+/, "") === before.replace(/manpower\s*=\s*\d+/, ""), "⭐ nothing else in the file changed by a byte", null);
    pg.inspect(6845);
    pg.$("miNavalBase").value = "9";
    pg.saveStateButton();
    pg.save();
    ok(/naval_base = 9/.test(blockOf(stateText(roots, 359), 6845) || ""), "(a naval base typed there still lands on it)", blockOf(stateText(roots, 359), 6845));
    // the giver's panel: nothing of 6845 goes back into 360
    const before360 = stateText(roots, 360);
    const s = pg.state(360).provinces[0];
    pg.inspect(s);
    ok(!pg.vpRows().includes("6845:20"), "⭐ the giver's panel does not show the victory point that left", pg.vpRows());
    pg.$("miManpowerInp").value = "4000001";
    pg.saveStateButton();
    pg.save();
    ok(!/6845/.test(stateText(roots, 360)), "⭐ …and a population typed there writes nothing of 6845 back into 360", vpsOf(stateText(roots, 360)));
    ok(stateText(roots, 360).replace(/manpower\s*=\s*\d+/, "") === before360.replace(/manpower\s*=\s*\d+/, ""), "(360's file changes by its population alone)");
  }
}

console.log("\n=== 2. Each field the panel shows, typed on its own, sends that field alone ===");
{
  const ROWS = [
    ["the name", (p) => { p.$("miNameInp").value = "Harbourland"; }, { displayName: "Harbourland" }],
    ["the owner", (p) => { p.$("miOwnerSel").value = "BBB"; }, { owner: "BBB" }],
    ["— none — as the owner, said out loud", (p) => { p.$("miOwnerSel").value = ""; }, { clearOwner: true }],
    ["the cores", (p) => { p.$("miCoresInp").value = "aaa, bbb"; }, { cores: ["AAA", "BBB"] }],
    ["the population", (p) => { p.$("miManpowerInp").value = "5555"; }, { manpower: "5555" }],
    ["the category", (p) => { p.$("miCategoryInp").value = "town"; }, { category: "town" }],
    ["one building", (p) => p.setBuilding("arms_factory", 3), { buildings: { arms_factory: 3 } }],
    ["one resource", (p) => p.setResource("oil", 2.5), { resources: { oil: 2.5 } }],
    ["the clicked province's naval base", (p) => { p.$("miNavalBase").value = "6"; }, { provinceBuildings: [{ province: 12, building: "naval_base", level: 6 }] }],
  ];
  for (const [name, edit, want] of ROWS) {
    const { pg } = world();
    pg.inspect(12);
    edit(pg);
    const sent = pg.ctx.pendingWrites.length;
    pg.saveStateButton();
    const w = pg.queue()[sent];
    ok(!!w && J(w.body.fields) === J(want), `⭐ ${name} sends only that`, w && w.body.fields);
  }
  {
    // a victory point row: the server makes the list what it is sent, so the list goes, whole, as the panel holds it
    const { pg, roots } = world();
    pg.inspect(12);
    pg.ctx.addVpRow(8);
    const rows = pg.$("miVpList").querySelectorAll();
    rows[rows.length - 1].querySelector(".mi-vp-val").value = "1";
    pg.saveStateButton();
    ok(J(pg.queue()[0].body.fields) === J({ victoryPoints: [{ province: 12, value: 5 }, { province: 8, value: 1 }] }), "⭐ a victory point row sends the list as the panel holds it", pg.queue()[0].body.fields);
    pg.save();
    ok(J(vpsOf(stateText(roots, 4)).sort()) === J(["12 5", "8 1"]) && /# the harbour town/.test(stateText(roots, 4)), "(…and the file keeps the old one, its comment with it, and has the new one)", vpsOf(stateText(roots, 4)));
  }
  {
    const { pg, roots } = world();
    const was = stateText(roots, 4);
    pg.inspect(12);
    pg.saveStateButton();
    ok(!pg.queue().length, "⭐ nothing typed, Save state: nothing is staged", pg.queue().map((w) => w.body));
    ok(pg.ctx.undoStack.length === 0, "(…and no Undo step for it)", pg.ctx.historyLabels);
    ok(!/edited/.test(pg.last()), "(…and the line does not say the state was edited)", pg.last());
    ok(stateText(roots, 4) === was, "(the file is untouched)");
  }
  {
    // the signature reads the text, a write reads the value: "05" is dirty until staged, then clean, with nothing sent
    const { pg } = world();
    pg.inspect(12);
    pg.setBuilding("arms_factory", "00");
    ok(pg.ctx.stateFormDirty() === true, "(the panel reads dirty on 00 where it showed 0)");
    pg.saveStateButton();
    ok(!pg.queue().length && pg.ctx.stateFormDirty() === false, "⭐ a value that is the same number sends nothing, and leaves the panel clean", { q: pg.queue().map((w) => w.body), dirty: pg.ctx.stateFormDirty() });
  }
  {
    // two edits in a row: each sends its own, and the page's copy has both
    const { pg, roots } = world();
    pg.inspect(12);
    pg.$("miManpowerInp").value = "2000";
    pg.saveStateButton();
    pg.setBuilding("infrastructure", 5);
    pg.saveStateButton();
    ok(J(pg.queue().map((w) => w.body.fields)) === J([{ manpower: "2000" }, { buildings: { infrastructure: 5 } }]), "⭐ a second edit sends the second field alone", pg.queue().map((w) => w.body.fields));
    ok(pg.state(4).manpower === 2000 && pg.state(4).buildings.infrastructure === 5 && pg.state(4).buildings.dockyard === 7, "⭐ the page's copy has both, and keeps what was not typed", pg.state(4));
    pg.save();
    const t = stateText(roots, 4);
    ok(/manpower\s*=\s*2000/.test(t) && /infrastructure = 5/.test(t) && /dockyard = 7/.test(t) && /# the harbour town/.test(t), "(the file has both)", t);
  }
}

console.log("\n=== 3. What a page copy behind the file can no longer do ===");
{
  // a page copy behind the file: the panel fills from it, and only a typed field goes
  const { pg, roots } = world();
  pg.state(4).victoryPoints = [];
  pg.state(4).provinceBuildings = {};
  pg.state(4).buildings = { infrastructure: 2 };
  pg.inspect(12);
  pg.$("miCategoryInp").value = "town";
  pg.saveStateButton();
  pg.save();
  const t = stateText(roots, 4);
  ok(vpsOf(t).includes("12 5") && /naval_base = 3/.test(blockOf(t, 12) || "") && /dockyard = 7/.test(t) && /state_category\s*=\s*town/.test(t), "⭐⭐ a copy with no victory point, no naval base and no dockyards deletes none of them from the file", t);
}
{
  // the model changing under an open panel (the Save's carry, a tool) is not an edit either
  const { pg, roots } = world();
  pg.inspect(12);
  pg.state(4).buildings = Object.assign({}, pg.state(4).buildings, { dockyard: 0 });
  pg.$("miManpowerInp").value = "1234";
  pg.saveStateButton();
  ok(J(pg.queue()[0].body.fields) === J({ manpower: "1234" }), "⭐ the page's copy changing under the open panel sends nothing of it", pg.queue()[0].body.fields);
  pg.save();
  ok(/dockyard = 7/.test(stateText(roots, 4)), "(the file keeps its dockyards)");
}

console.log("\n=== 4. The callers: the selection moved on, the pasted fields, a new state's id ===");
{
  // typed, then another state clicked: showInfo stages it for the state it belongs to, with the province it was typed on
  const { pg } = world();
  pg.inspect(12);
  pg.$("miNavalBase").value = "6";
  pg.inspect(4);
  ok(pg.queue().length === 1 && pg.queue()[0].body.stateId === 4 && J(pg.queue()[0].body.fields) === J({ provinceBuildings: [{ province: 12, building: "naval_base", level: 6 }] }), "⭐ typed and moved on: staged for the state and the province it was typed on, and only that", pg.queue().map((w) => w.body));
  ok(pg.state(3).provinceBuildings[4] === undefined, "(the state clicked next is not touched)", pg.state(3).provinceBuildings);
  ok(/State 4 edited/.test(pg.last()), "(…and says so)", pg.last());
  ok(pg.ctx.stateFormDirty() === false, "(the new state's panel is clean)");
}
{
  // browsing, nothing typed
  const { pg } = world();
  pg.inspect(12); pg.inspect(4); pg.inspect(2); pg.inspect(8);
  ok(!pg.queue().length, "(browsing four provinces with nothing typed stages nothing)", pg.queue());
}
{
  // a stage for a state the panel does not hold writes nothing: its inputs are another state's
  const { pg } = world();
  pg.inspect(12);
  pg.$("miManpowerInp").value = "777";
  const r = pg.ctx.stageStateWrite(3, 4);
  ok(r === null && !pg.queue().length, "⭐ the panel's fields are never staged for a state it was not filled from", { r, q: pg.queue().map((w) => w.body) });
}
{
  // ⧉ Copy attrs / 📋 Paste: the dev profile, as a typed edit: owner, name, cores, victory points stay the state's own
  const { pg, roots } = world();
  pg.state(1).buildings = { arms_factory: 4, dockyard: 0 };
  pg.state(1).category = "town";
  pg.state(1).manpower = 9000;
  pg.inspect(2);
  pg.ctx.copyStateAttrs();
  pg.inspect(12);
  pg.ctx.pasteStateAttrs();
  const f = pg.queue()[0].body.fields;
  ok(J(Object.keys(f).sort()) === J(["buildings", "category", "manpower"]), "⭐ a paste sends what it changed of the dev profile, and nothing of the state's identity", f);
  ok(f.buildings.arms_factory === 4 && f.buildings.dockyard === 0 && !("infrastructure" in f.buildings && f.buildings.infrastructure === 2), "(the pasted levels, a 0 included)", f.buildings);
  ok(pg.state(4).owner === "AAA" && pg.state(4).victoryPoints.length === 1, "(the state's owner and victory points stay)", pg.state(4));
  ok(/^📋 Pasted dev profile onto state 4 — click 💾 Save/.test(pg.last()), "(the line says to Save)", pg.last());
  pg.save();
  ok(/manpower\s*=\s*9000/.test(stateText(roots, 4)) && vpsOf(stateText(roots, 4)).includes("12 5"), "(the file: the pasted population, the victory point kept)");
  pg.inspect(12);
  pg.ctx.pasteStateAttrs();
  ok(!pg.queue().length && /^📋 State 4 already has this dev profile, so nothing was staged\./.test(pg.last()), "⭐ the same profile pasted again stages nothing, and does not say to Save", { q: pg.urls(), s: pg.last() });
}
{
  // Undo takes the edit back, the queue and the copy both
  const { pg, roots } = world();
  const was = stateText(roots, 4);
  pg.inspect(12);
  pg.$("miManpowerInp").value = "2222";
  pg.saveStateButton();
  pg.undo();
  ok(!pg.queue().length && pg.state(4).manpower === 1000 && pg.ctx.stateFormBaseline === null, "⭐ Undo takes the write and the copy back, and disarms the panel", { q: pg.queue(), mp: pg.state(4).manpower });
  pg.redo();
  ok(pg.queue().length === 1 && pg.state(4).manpower === 2222, "(…and Redo brings them back)", pg.state(4).manpower);
  pg.undo();
  pg.save();
  ok(stateText(roots, 4) === was, "(the file is untouched)");
}
{
  // a new state: the panel holds a placeholder name and a population of 0, which nobody typed
  const { pg, roots } = world();
  const id = pg.newState();
  pg.move(12, id);
  pg.ctx.mode = "inspect";
  pg.inspect(12);
  pg.$("miCategoryInp").value = "town";
  pg.saveStateButton();
  const w = pg.queue().find((x) => x.url === "/api/map/set-state");
  ok(J(w.body.fields) === J({ category: "town" }), "⭐ a new state's panel sends no placeholder name and no population of 0", w.body.fields);
  // typed after the create came back: the panel's state is that state still
  pg.save();
  const real = pg.state(pg.ctx.model.provinceToState[12]);
  ok(real.id > 0 && pg.ctx.stateFormBaseline.stateId === real.id, "⭐ the Save gave the state its id, and the panel's baseline follows it", { real: real.id, base: pg.ctx.stateFormBaseline && pg.ctx.stateFormBaseline.stateId });
  pg.$("miManpowerInp").value = "3333";
  pg.saveStateButton();
  ok(pg.queue().length === 1 && pg.queue()[0].body.stateId === real.id && J(pg.queue()[0].body.fields) === J({ manpower: "3333" }), "⭐ …so what is typed next is staged for it", pg.queue().map((w) => w.body));
  pg.save();
  ok(/manpower\s*=\s*3333/.test(stateText(roots, real.id)), "(…and lands in its file)");
}

console.log("\n=== 5. The page shows what the file holds: move, merge, erase, a dropped paint ===");
{
  // the inland province of two: the victory point and the block move with any paint, not only a coast's
  const H = { 4: "\t\towner = AAA\n\t\tvictory_points = { 8 3 }\n\t\tbuildings = {\n\t\t\t8 = { bunker = 2 }\n\t\t}\n" };
  const { pg, roots } = world({ history: H });
  pg.move(8, 2);
  ok(pg.state(2).victoryPoints.some((v) => v.province === 8 && v.value === 3) && !pg.state(4).victoryPoints.length, "⭐ an inland province's victory point moves with it", { to: pg.state(2).victoryPoints, from: pg.state(4).victoryPoints });
  ok((pg.state(2).provinceBuildings[8] || {}).bunker === 2 && !pg.state(4).provinceBuildings[8], "⭐ …and its province block", { to: pg.state(2).provinceBuildings, from: pg.state(4).provinceBuildings });
  pg.save();
  const t = stateText(roots, 2);
  ok(vpsOf(t).includes("8 3") && /bunker = 2/.test(blockOf(t, 8) || ""), "(the server carried the same)", t);
  pg.inspect(8);
  ok(pg.vpRows().includes("8:3"), "(the panel shows it)", pg.vpRows());
}
{
  // a merge: the kept state shows what it takes, and an edit of it keeps them (T08 b, c)
  const { pg, roots } = world({ history: { 4: L.DEFAULT_HISTORY[4], 5: "\t\towner = AAA\n\t\tvictory_points = { 13 2 }\n" } });
  pg.merge(4, 5);
  const s5 = pg.state(5);
  ok(J(s5.victoryPoints.map((v) => v.province).sort((a, b) => a - b)) === J([12, 13]) && (s5.provinceBuildings[12] || {}).naval_base === 3, "⭐⭐ a merge moves the source's victory points and province blocks onto the kept state, at the click", { vps: s5.victoryPoints, pb: s5.provinceBuildings });
  pg.undo();
  ok(pg.state(4) && J(pg.state(4).victoryPoints) === J([{ province: 12, value: 5 }]) && J(pg.state(5).victoryPoints) === J([{ province: 13, value: 2 }]) && !pg.state(5).provinceBuildings[12], "⭐ Undo puts them back", { four: pg.state(4) && pg.state(4).victoryPoints, five: pg.state(5).victoryPoints });
  pg.redo();
  pg.save();
  pg.inspect(12);
  ok(pg.$("miNavalBase").value == 3 && pg.vpRows().includes("12:5") && pg.vpRows().includes("13:2"), "⭐ the kept state's panel, clicked on a merged province, shows both", { nb: pg.$("miNavalBase").value, vps: pg.vpRows() });
  pg.$("miManpowerInp").value = "1234";
  pg.saveStateButton();
  pg.save();
  const t = stateText(roots, 5);
  ok(vpsOf(t).includes("12 5") && vpsOf(t).includes("13 2") && /naval_base = 3/.test(blockOf(t, 12) || ""), "⭐⭐ …and a population typed there deletes none of them", { vps: vpsOf(t), block: blockOf(t, 12) });
}
{
  // erased: the server takes the province's victory point and block with it, and so does the page
  const { pg, roots } = world();
  pg.erase(12);
  ok(!pg.state(4).victoryPoints.length && !pg.state(4).provinceBuildings[12], "⭐ an erased province's victory point and block leave the page's copy", pg.state(4));
  pg.save();
  pg.inspect(8);
  ok(!pg.vpRows().length, "(the panel shows none)", pg.vpRows());
  pg.ctx.addVpRow(8);
  const rows = pg.$("miVpList").querySelectorAll();
  rows[rows.length - 1].querySelector(".mi-vp-val").value = "1";
  pg.saveStateButton();
  pg.save();
  ok(J(vpsOf(stateText(roots, 4))) === J(["8 1"]), "⭐ a victory point list edited afterwards does not write the sea province's back", vpsOf(stateText(roots, 4)));
}
{
  // a paint painted back: the file was never touched, and the page's copy is back where it was
  const { pg } = world();
  const at = J(pg.state(4));
  pg.move(12, 3);
  ok(pg.state(3).victoryPoints.some((v) => v.province === 12), "(the paint moved the victory point)");
  pg.move(12, 4);
  ok(!pg.queue().length, "(the paint back left nothing queued)", pg.urls());
  ok(!pg.state(3).victoryPoints.some((v) => v.province === 12) && !pg.state(3).provinceBuildings[12], "⭐ a paint back takes the victory point and the block out of the taker", pg.state(3));
  ok(pg.state(4).victoryPoints.some((v) => v.province === 12 && v.value === 5) && (pg.state(4).provinceBuildings[12] || {}).naval_base === 3, "⭐ …and gives them back to the state the files hold them in", pg.state(4));
  const both = (s) => J({ v: s.victoryPoints, p: s.provinceBuildings });
  ok(both(pg.state(4)) === both(JSON.parse(at)), "(as it was)", both(pg.state(4)));
}
{
  // a new state's paint discarded
  const { pg } = world();
  const id = pg.newState();
  pg.move(12, id);
  ok(pg.state(id).victoryPoints.some((v) => v.province === 12) && !pg.state(4).victoryPoints.length, "(the paint moved the victory point into the new state)", pg.state(id));
  pg.deleteState(id, 12);
  ok(!pg.state(id) && pg.state(4).victoryPoints.some((v) => v.province === 12 && v.value === 5) && (pg.state(4).provinceBuildings[12] || {}).naval_base === 3, "⭐ the discard of the new state gives its province's victory point and block back", pg.state(4));
  ok(!pg.queue().length, "(nothing is left queued)", pg.urls());
}
{
  // Undo of a paint
  const { pg } = world();
  pg.move(12, 3);
  pg.undo();
  ok(pg.state(4).victoryPoints.some((v) => v.province === 12) && !pg.state(3).victoryPoints.some((v) => v.province === 12), "⭐ Undo of a paint puts them back too", { four: pg.state(4).victoryPoints, three: pg.state(3).victoryPoints });
}

console.log(`\n${pass} passed, ${fail} failed${skipped ? `, ${skipped} SKIPPED (not counted as passes)` : ""}`);
try { fs.rmSync(ROOT, { recursive: true, force: true, maxRetries: 3 }); } catch (_) {}
process.exit(fail ? 1 : 0);
