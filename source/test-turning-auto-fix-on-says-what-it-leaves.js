// ⛔ #turning-auto-fix-on-says-what-it-leaves — THE OFF LINE NAMES WHAT CLEARS AN EMPTIED STATE, AND TURNING 🛠 AUTO-FIX ON SAYS WHAT IT LEAVES
// (tool campaign B8-6).
//
// With 🛠 Auto-fix OFF, ↔ Move and 🧹 Erase leave a state they empty and warn — and the warning ended "…delete the state(s) or turn 🛠
// Auto-fix on." Turning it on deletes nothing: the flag is read only inside the stroke that empties a state (setAutoFix sets it and returns),
// so the state stayed, 💾 Save wrote it with no provinces, and Map Errors stopped at empty_state_with_content, the FATAL the line said it
// would prevent. The decision (Q3): a warning names what clears it. So the OFF lines name the steps that do (↶ Undo; after the Save, ⚠ Map
// Errors' 🔧 Auto-fix all) and say that turning Auto-fix on now does not; and the ON line names each state the page still holds empty.
//
// Every "Auto-fix is OFF" line is read out of public/map.js (comments masked); setAutoFix is lifted and run. Binds no port.
// Run: node test-turning-auto-fix-on-says-what-it-leaves.js
"use strict";
const vm = require("vm");
const T = require("./testlib-map-page.js");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "\n       " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 700) : "")); }
};

console.log("=== 1. every OFF line names the steps that clear the state, and promises nothing of the toggle ===");
const all = T.MASKED.split("\n").map((l, i) => ({ l, n: i + 1 })).filter((x) => /Auto-fix is OFF, so/.test(x.l));
// (🧹 Erase also has a line of its own for a state its stroke leaves holding only water, #an-erase-that-leaves-only-water-empties-the-state:
// Map Errors' 🔧 Auto-fix all leaves such a state as it is, so that line names the steps that give it land. It is held to its own words below.)
const wetLine = (l) => /has no land left, only the water of/.test(l);
const lines = all.filter((x) => !wetLine(x.l));
ok(lines.length >= 2, "the OFF lines are read from the page (↔ Move's and 🧹 Erase's)", lines.length);
// (moved with #a-move-that-leaves-only-water-empties-the-state, B1-29's Move twin: ↔ Move has a line of its own for a state its move leaves holding only
// water, whose step that gives it land is a Move, and whose 🛠 Auto-fix would merge it rather than delete it — so it is held to its own words here)
const wetLines = all.filter((x) => wetLine(x.l));
ok(wetLines.some((x) => /↶ Undo this stroke/.test(x.l)) && wetLines.some((x) => /↶ Undo this move/.test(x.l)), "the only-water OFF lines are read from the page (🧹 Erase's and ↔ Move's)", wetLines.length);
for (const { l, n } of wetLines) {
  ok(!/or turn 🛠 Auto-fix on\.?`/.test(l), `line ${n} (only water left): no longer ends "…or turn 🛠 Auto-fix on"`, l.trim().slice(-260));
  ok((/↶ Undo this stroke to give it its land back/.test(l) && /🔍 Inspect one of its provinces and set its Type to land/.test(l))
    || (/↶ Undo this move to give it its land back/.test(l) && /move a land province into it with ↔ Move province/.test(l)),
  `line ${n} (only water left): names the steps that give it land (↶ Undo; 🔍 Inspect, Type land — or, after a Move, a Move back)`, l.trim().slice(-300));
  ok(!/delete the state|Auto-fix all deletes/.test(l), `line ${n} (only water left): promises no delete that no tool makes of it`, l.trim().slice(-300));
  ok(/Turning 🛠 Auto-fix on now does not (?:delete|change) it: it acts only on a state emptied after it is on\./.test(l), `line ${n} (only water left): says turning Auto-fix on now does not act on it`, l.trim().slice(-200));
}
for (const { l, n } of lines) {
  ok(!/or turn 🛠 Auto-fix on\.?`/.test(l), `line ${n}: no longer ends "…or turn 🛠 Auto-fix on" (turning it on clears nothing)`, l.trim().slice(-260));
  ok(/↶ Undo this (?:move|stroke) to give/.test(l) && /after 💾 Save see ⚠ Map Errors, whose 🔧 Auto-fix all deletes an empty state it can/.test(l),
    `line ${n}: names the steps that clear it (↶ Undo; after the Save, ⚠ Map Errors' 🔧 Auto-fix all)`, l.trim().slice(-300));
  // (an empty state cannot be clicked, and the panel opens only on a selected PROVINCE — showInfo hides it without one — so neither
  // "add a province to it" nor "🗑 Delete state" is a step the modder can take for it)
  ok(!/add a province|🗑 Delete state|delete the state/.test(l), `line ${n}: names no step that cannot be taken on a state with no land`, l.trim().slice(-300));
  ok(/Turning 🛠 Auto-fix on now does not: it acts only on a state emptied after it is on\./.test(l), `line ${n}: says turning Auto-fix on now does not`, l.trim().slice(-200));
}
{
  const move = T.lift("function doMoveProvince(");
  const erase = T.lift("function commitEraseStroke(");
  ok(/Auto-fix is OFF, so[^`]*↶ Undo this move/.test(move), "↔ Move's line is in doMoveProvince and says ↶ Undo this move");
  ok(/Auto-fix is OFF, so[^`]*↶ Undo this stroke/.test(erase), "🧹 Erase's line is in commitEraseStroke and says ↶ Undo this stroke");
}

console.log("=== 2. turning it ON names each state the page still holds empty ===");
const fnSrc = T.liftFrom(T.MAP, T.MASKED, "const setAutoFix = (on) =>", "\n  };");
const run = (states) => {
  const ctx = { autoFix: false, localStorage: { setItem() {} }, renderAutoFixBtn() {}, setStatus(s) { ctx.status = String(s); }, stateById: new Map(states.map((s) => [s.id, s])) };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(fnSrc + "\nglobalThis.setAutoFix = setAutoFix;", ctx);
  ctx.setAutoFix(true); const on = ctx.status;
  ctx.setAutoFix(false); const off = ctx.status;
  return { on, off };
};
{
  const r = run([{ id: 7, name: "STATE_7", displayName: "Jutland", provinces: [] }, { id: 8, name: "STATE_8", provinces: [1, 2] }, { id: -1, name: "STATE_new1", provinces: [] }]);
  ok(/^🛠 Auto-fix ON — a state you empty with ↔ Move province or 🧹 Erase is deleted for you/.test(r.on), "the ON line still says what it does", r.on);
  ok(/⚠ Jutland \(state 7\) is still empty: turning it on does not delete a state emptied before\. ↶ Undo the edit that emptied it, or after 💾 Save see ⚠ Map Errors\./.test(r.on),
    "…and names the state still empty, and what clears it", r.on);
  ok(!/state 8\b/.test(r.on) && !/state -1\b/.test(r.on), "…not a state with land, nor a new state with none (the Save's purge drops that one)", r.on);
  ok(!/still empty/.test(r.off), "the OFF line says nothing of it", r.off);
}
{
  const r = run([{ id: 8, name: "STATE_8", provinces: [1] }]);
  ok(!/⚠/.test(r.on), "with no state empty, the ON line is just what it does", r.on);
}
{
  const many = Array.from({ length: 7 }, (_, i) => ({ id: 10 + i, name: `STATE_${10 + i}`, provinces: [] }));
  const r = run(many);
  ok(/STATE_10 \(state 10\), .* and 2 more are still empty: turning it on does not delete states emptied before\. ↶ Undo the edit that emptied them/.test(r.on), "seven: five named, the rest counted", r.on);
}

console.log("=== 3. the toggle's own OFF line and its dialog name only steps a Map tool can take (review of the fix) ===");
{
  const fs = require("fs"), path = require("path");
  const r = run([]);
  const html = fs.readFileSync(path.join(__dirname, "public", "map.html"), "utf8");
  const at = html.indexOf('<div id="mapAutofixWarn"');
  const dialog = at < 0 ? "" : html.slice(at, html.indexOf('id="mapAutofixWarnCancel"', at)).replace(/<[^>]+>/g, "");
  ok(dialog.length > 100, "the Auto-fix dialog is read from map.html", dialog.length);
  for (const [what, text] of [["the OFF line", r.off], ["the dialog", dialog]]) {
    // (an empty state cannot be clicked, so neither "fill it" nor "delete it" is a step the modder can take on the map)
    ok(!/fill it|delete it|fill or delete/i.test(text), `${what} names no step that cannot be taken on a state with no land`, text);
    ok(/↶ Undo the edit that emptied it/.test(text) && /⚠ Map Errors' 🔧 Auto-fix all/.test(text), `${what} names the steps that clear it (↶ Undo; after the Save, ⚠ Map Errors' 🔧 Auto-fix all)`, text);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
