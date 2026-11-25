// Regression: a SINGLE Auto-fix must leave no empty state even when fixForeignCapitals relocates a capital
// AFTER fixEmptyStates already ran. fixEmptyStates deliberately SKIPS a capital's empty state; fixForeignCapitals
// then re-points that capital to a real land-holding state, leaving the old one empty + non-capital — which
// nothing re-checked, so it survived one Auto-fix as a fatal empty_state_with_content. The final empty-state
// sweep in autoFixMap now catches it. Run: node test-map-autofix-empty-capital.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(w, h, fn) {
  const rs = (w * 3 + 3) & ~3, is = rs * h; const b = Buffer.alloc(54 + is);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(54 + is, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18); b.writeInt32LE(h, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(0, 30); b.writeUInt32LE(is, 34);
  for (let y = 0; y < h; y++) { let o = 54 + (h - 1 - y) * rs; for (let x = 0; x < w; x++) { const [r, g, bl] = fn(x, y); b[o++] = bl; b[o++] = g; b[o++] = r; } }
  return b;
}
const COL = { 1: [10, 10, 10], 2: [20, 20, 20] };
const provAtX = (x) => (x <= 2 ? 1 : 2);

(() => {
  console.log("=== one Auto-fix leaves no empty state after a capital is relocated off it ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-empcap-"));
  mk(path.join(mod, "descriptor.mod"), 'name="EC"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(6, 2, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0", "1;10;10;10;land;false;plains;1", "2;20;20;20;land;false;plains;1"].join("\n") + "\n");
  mk(path.join(mod, "map", "strategicregions", "00.txt"), 'strategic_region = { id = 1 name = "R" provinces = { 1 2 } }');
  // AAA owns state 10 (real land) and state 11 (EMPTY but with buildings content). AAA's capital points at 11.
  mk(path.join(mod, "history", "states", "10.txt"), 'state = {\n\tid = 10\n\tname = "Main"\n\tmanpower = 1000\n\tprovinces = { 1 2 }\n\thistory = { owner = AAA add_core_of = AAA }\n}\n');
  mk(path.join(mod, "history", "states", "11.txt"), 'state = {\n\tid = 11\n\tname = "Cap"\n\tmanpower = 1000\n\tprovinces = { }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = { arms_factory = 3 }\n\t}\n}\n');
  mk(path.join(mod, "history", "countries", "AAA.txt"), "capital = 11\n");
  const emptyRules = () => md.validateMapModel(md.buildMapModel({ modRoot: mod })).filter((p) => /^empty_state|empty_capital_state$/.test(p.rule)).map((p) => p.rule);

  try {
    ok("setup: starts with an empty capital state error", emptyRules().length > 0, emptyRules());
    const r = md.autoFixMap({ modRoot: mod });
    ok("autoFixMap ok", r.ok, r);
    ok("ONE Auto-fix leaves NO empty-state error of any kind", emptyRules().length === 0, emptyRules());
    ok("the relocated-off empty state file (11) is gone", !fs.existsSync(path.join(mod, "history", "states", "11.txt")));
    const cap = (md.buildMapModel({ modRoot: mod }).capitals || {}).AAA;
    const capState = md.buildMapModel({ modRoot: mod }).states.find((s) => s.id === cap);
    ok("AAA's capital now points at a state that holds land", capState && (capState.provinces || []).length > 0, { cap, capState });
    console.log(`\ntest-map-autofix-empty-capital: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
