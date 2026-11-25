// ⛔ #a-refused-dockyard-is-not-a-save-gate (tool campaign B1-31).
//
// Raising land in front of all of a country's ports (POL's two, ROM's) left FATAL state_naval_building_without_coast after Auto-fix:
// fixNavalBuildingsWithoutCoast carries a landlocked dockyard to the nearest coastal state of the same country, deletes none, and a
// country with no other coast keeps it — so Save stayed stopped and no Map tool could clear it. The coordinator's decision: decide on
// evidence whether it is a real crash; if only precautionary, it must not be FATAL. The evidence (Nova's own reading of hoi4.exe 1.19.4.1,
// in test-a-naval-base-the-game-refuses-is-a-warning-and-a-landlocked-dockyard-claims-no-crash.js: statehistory.cpp logs "Trying to set
// invalid state building" and takes the next entry; the one launch blamed on it died in the flag atlas; FATAL_OUTCOME was "untested") is
// precautionary. So the rule left the fatal set and stays an ERROR with its Auto-fix, and its words name the Map step that clears it.
//   1. the label module: not in FATAL (the live set, comments masked), no FATAL_OUTCOME, a hint saying Save does not stop;
//   2. the rule's message, read out of map-data.js: no crash claim, "does not stop Save", the state panel's Dockyard field;
//   3. a country whose only state lost its coast: one Auto-fix leaves no FATAL, keeps the dockyard (it deletes none) and the error row.
// Run: node test-a-refused-dockyard-is-not-a-save-gate.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
const labels = require("./public/map-rule-labels.js");
const { maskJsComments } = require("./testlib-strip-comments.js");
const RULE = "state_naval_building_without_coast";
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}

console.log("=== 1. the label module ===");
ok("not in the fatal set", !labels.isFatalRule(RULE) && !labels.FATAL.has(RULE));
ok("…so no fatal outcome either", labels.fatalOutcome(RULE) === "", labels.fatalOutcome(RULE));
{
  const src = fs.readFileSync(path.join(__dirname, "public", "map-rule-labels.js"), "utf8");
  const masked = maskJsComments(src);
  const a = masked.indexOf("const FATAL = new Set(["), b = a < 0 ? -1 : masked.indexOf("]);", a);
  ok("the live FATAL list (comments masked) does not name it", a > 0 && b > a && masked.slice(a, b).indexOf(`"${RULE}"`) === -1);
  const hint = labels.mapRuleFixHint(RULE);
  ok("its hint says Save does not stop and names the state panel's Dockyard field, and claims no crash",
    /Save does not stop/.test(hint) && /state panel's Dockyard field/.test(hint) && !/crash/i.test(hint), hint);
}

console.log("=== 2. the rule's message in map-data.js ===");
{
  const src = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
  const masked = maskJsComments(src);
  const at = masked.indexOf(`rule: "${RULE}"`);
  ok("the rule is pushed exactly once", at > 0 && masked.indexOf(`rule: "${RULE}"`, at + 1) === -1);
  const m = masked.indexOf("message: `", at), e = m < 0 ? -1 : masked.indexOf("`,", m + 10);
  const msg = m > 0 && e > m ? masked.slice(m, e) : "";
  ok("its message says the game takes the next entry and Save does not stop", /takes the next entry/.test(msg) && /does not stop Save/.test(msg), msg.slice(0, 300));
  ok("…names the state panel's Dockyard field", /state panel's Dockyard field/.test(msg));
  ok("…and no longer says Save stops for it", !/stops Save for it until/.test(msg) && !/Save stops for it/.test(msg));
}


console.log("=== 3. a country whose only state lost its coast: one Auto-fix leaves no FATAL and deletes no dockyard ===");
// testlib-two-layer-map's world: sea 1 across the top, land 2 and 3 on the coast, 4 and 5 inland. The mod gives inland state 1 = { 4 }
// to BBB, its only state, with a dockyard: it touches no sea, and BBB has no other state to carry it to.
const lib = require("./testlib-two-layer-map.js");
const W = lib.makeWorld("refuseddockyard");   // before server.js: it reads HOI4_MODS_ROOT when it loads
const { createApp } = require("./server.js");
const MOD = W.mod("Refused Dockyard", {
  "history/states/1-A.txt": 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { 4 }\n\thistory = {\n\t\towner = BBB\n\t\tbuildings = {\n\t\t\tdockyard = 2\n\t\t}\n\t}\n}\n',
});
(async () => {
  let S = null;
  try {
    S = await lib.startServer(createApp);
    const v0 = await S.validate(MOD);
    ok("setup: the landlocked dockyard is reported", lib.idsOf(v0, RULE).includes(1), lib.rulesIn(v0));
    const fx = await S.autoFix(MOD);
    ok("Auto-fix answered", fx.status === 200, fx.body && fx.body.error);
    const v1 = await S.validate(MOD);
    const row = ((v1 && v1.problems) || []).find((p) => p.rule === RULE);
    ok("the row stays, as an error (Auto-fix deletes no dockyard, and BBB has no other coast)", row && row.severity === "error", lib.rulesIn(v1));
    ok("…the dockyard is still in the file", /dockyard\s*=\s*2/.test(fs.readFileSync(path.join(MOD, "history", "states", "1-A.txt"), "utf8")));
    const fatal = ((v1 && v1.problems) || []).filter((p) => labels.isFatalRule(p.rule)).map((p) => p.rule);
    ok("⭐⭐⭐ one Auto-fix leaves no problem Save stops for", fatal.length === 0, fatal);
    const g = await lib.saveGate(v1);
    ok("⭐⭐⭐ …so the page's own Save gate does not arm", g.crashes === 0 && !g.armed, { crashes: g.crashes, status: String(g.status || "").slice(0, 200) });
    console.log(`\ntest-a-refused-dockyard-is-not-a-save-gate: ${pass} checks passed`);
  } catch (e) { console.error(e && e.stack || e); process.exitCode = 1; }
  finally { if (S) S.close(); W.cleanup(); }
})();
