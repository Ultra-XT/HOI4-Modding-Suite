// ⛔ #a-town-in-a-running-save-stays-ticked (B8-1) — A 🏘 TOWN BOX UNTICKED WHILE THE SAVE THAT PAINTS ITS TOWN RUNS IS PUT BACK, AND SAYS WHY.
//
// The state panel's 🏘 Town box is a "paint a town at this victory point when you Save" request. Unticked while the Save that carries
// that town was running (the town queued in it, or its request on its way), the box stayed unticked, the line said nothing, and the town
// was painted all the same; afterwards the box read unticked and a second Save said "Nothing to save." (the campaign's repro-B8-1, vanilla
// province 10540). The town cannot be taken back once the Save has it, so the box is put back with one sentence, as the Type dropdown
// puts itself back during a Save.
//
// RUN, not grepped: the page's own heldTownBox (lifted from public/map.js) is called with the page's state, and the state panel's
// delegated listener is checked to call it with the event's target before it counts the panel's changes.
"use strict";
const PAGE = require("./testlib-map-page.js");

let checks = 0; const fails = [];
const ok = (c, m, d) => { checks++; if (c) console.log("  ok   " + m); else { fails.push(m); console.log("  FAIL " + m + (d !== undefined ? "   -> " + JSON.stringify(d).slice(0, 400) : "")); } };

const TOWNS = "/api/map/victory-point-towns";
/** a 🏘 box in a victory-point row of province `prov` */
const townBox = (prov, { checked = false, cls = "mi-vp-town" } = {}) => {
  const provEl = { value: String(prov) };
  const row = { querySelector: (sel) => (sel === ".mi-vp-prov" ? provEl : null) };
  return { checked, classList: { contains: (c) => c === cls }, closest: (sel) => (sel === ".mi-vp-row" ? row : null) };
};
const page = (running, pendingWrites, townsSent) => {
  const flushMapSaves = function () {}; flushMapSaves.running = running ? Promise.resolve() : null;
  if (townsSent) flushMapSaves.townsSent = new Set(townsSent);
  return PAGE.runPage(["function heldTownBox("], { flushMapSaves, pendingWrites });
};

// 1. A Save runs and the town of 10540 is in it: the box is put back, and the line says why.
{
  const { sb, statuses } = page(true, [{ url: "/api/map/set-state", body: { stateId: 7 } }, { url: TOWNS, body: { stateId: 7, provinces: [10540] } }]);
  const box = townBox(10540);
  const held = sb.heldTownBox(box);
  ok(held === true, "a box unticked while the Save that holds its town runs is HELD", held);
  ok(box.checked === true, "…and is ticked again: it is what the Save paints", box.checked);
  const line = statuses[statuses.length - 1] || "";
  ok(/A Save is running/.test(line) && /10540/.test(line) && /Nothing was changed/.test(line), "…and the line names the province, the running Save, and that nothing changed", line);
}
// 2. The same box with a number given as a string in the queue (a body a test or an older page wrote) is the same town.
{
  const { sb } = page(true, [{ url: TOWNS, body: { stateId: 7, provinces: ["10540"] } }]);
  const box = townBox(10540);
  ok(sb.heldTownBox(box) === true && box.checked === true, "a town queued as \"10540\" is the box's town too");
}
// 3. A Save runs but carries OTHER towns: this box's untick is the modder's, and nothing is said.
{
  const { sb, statuses } = page(true, [{ url: TOWNS, body: { stateId: 7, provinces: [999] } }]);
  const box = townBox(10540);
  ok(sb.heldTownBox(box) === false && box.checked === false && statuses.length === 0, "a box whose town is not in the running Save unticks as it always did", { checked: box.checked, statuses });
}
// 4. No Save runs: unticking takes the town out at the next staging (stageStateWrite), so the box is left alone.
{
  const { sb, statuses } = page(false, [{ url: TOWNS, body: { stateId: 7, provinces: [10540] } }]);
  const box = townBox(10540);
  ok(sb.heldTownBox(box) === false && box.checked === false && statuses.length === 0, "outside a Save the box unticks and the line is untouched", { checked: box.checked, statuses });
}
// 5. Ticking a box during a Save, or any other field of the panel, is not held.
{
  const { sb, statuses } = page(true, [{ url: TOWNS, body: { stateId: 7, provinces: [10540] } }]);
  const ticked = townBox(10540, { checked: true });
  const other = townBox(10540, { cls: "mi-vp-val" });
  ok(sb.heldTownBox(ticked) === false && ticked.checked === true, "a box ticked during a Save is not touched");
  ok(sb.heldTownBox(other) === false && other.checked === false, "a field that is not a 🏘 box is not touched");
  ok(sb.heldTownBox(null) === false && sb.heldTownBox({}) === false, "no target, or a target with no classList, is not touched");
  ok(statuses.length === 0, "…and none of them writes a line", statuses);
}
// 6. The state panel's delegated listener calls it with the event's target, BEFORE it counts the panel's changes (a held box must not
//    count as an edit).
{
  const m = PAGE.MASKED;
  const at = m.indexOf('$("miEditFields").addEventListener(ev,');
  const lineEnd = at < 0 ? -1 : m.indexOf("\n", at);
  const listener = at < 0 ? "" : m.slice(at, lineEnd);
  ok(at >= 0, "the state panel has its delegated input/change listener", at);
  const h = listener.indexOf("heldTownBox("), u = listener.indexOf("updateSaveButton(");
  ok(h >= 0 && u > h, "…and it calls heldTownBox before updateSaveButton", listener);
  ok(/heldTownBox\(\s*e\s*&&\s*e\.target\s*\)/.test(listener), "…with the event's target", listener);
  ok(m.split('$("miEditFields").addEventListener(ev,').length === 2, "…and there is exactly one such listener");
}

// 7. (review of B8-1) THE TOWN IS ALREADY PAINTED BY THE SAVE THAT IS STILL RUNNING: answered, its write left the queue, and the Save runs on
//    for seconds (the check of the map it ends with). An untick then stayed unticked in silence over a painted town and the next Save said
//    "Nothing to save." — the same loss in a later window. The Save keeps what it sent (flushMapSaves.townsSent), and the box is held.
{
  const { sb, statuses } = page(true, [{ url: "/api/map/set-state", body: { stateId: 8 } }], [10540]);
  const box = townBox(10540);
  ok(sb.heldTownBox(box) === true && box.checked === true, "⭐⭐ a box whose town this running Save has already painted (no longer queued) is held too", { checked: box.checked });
  ok(/A Save is running/.test(statuses[statuses.length - 1] || "") && /10540/.test(statuses[statuses.length - 1] || ""), "…and says why", statuses);
  const other = page(true, [], [999]);
  const b2 = townBox(10540);
  ok(other.sb.heldTownBox(b2) === false && b2.checked === false && other.statuses.length === 0, "…while a box whose town the Save never sent unticks as it always did", { checked: b2.checked });
}
// 8. …and flushMapSaves keeps that record: a fresh one when a Save starts, each town added before its request goes (derived from the source).
{
  const flush = PAGE.lift("async function flushMapSaves()", "} finally { if (btn) btn.disabled = false; updateSaveButton(); }\n  }");
  const { maskJsComments } = require("./testlib-strip-comments.js");
  const f = maskJsComments(flush);
  const run = f.indexOf("flushMapSaves.running = new Promise"), fresh = f.indexOf("flushMapSaves.townsSent = new Set()");
  ok(run >= 0 && fresh > run && fresh < f.indexOf("const dropped = []"), "⭐ a Save starts a fresh record of the towns it sends, as it starts to run", { run, fresh });
  const req = f.indexOf('fetch("/api/map/victory-point-towns"'), add = f.lastIndexOf("flushMapSaves.townsSent.add(", req);
  ok(req > 0 && add > 0 && add < req && f.slice(add, req).indexOf("let res;") !== -1, "⭐ …and adds each town before its request is sent", { req, add });
}

console.log(`\n${checks - fails.length}/${checks} checks passed`);
if (fails.length) { console.log("FAILED:\n  " + fails.join("\n  ")); process.exit(1); }
