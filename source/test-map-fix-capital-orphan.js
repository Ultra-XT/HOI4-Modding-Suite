// Unit test: fixForeignCapitals must re-point a capital on ALL THREE capital classes, not just the
// "owned by another country" one: a capital pointing at a DELETED state (capital_state_missing, which HOI4
// refuses) or an EMPTY state still owned by the country (empty_capital_state, which fails the load when a game
// starts) needs it too (#a-map-message-says-when-the-game-stops). The fix is the
// same — move the capital onto land the country actually holds. When the country owns NO land, auto-fix is
// impossible, so it must SKIP (the validator surfaces it for the user). Found by the map-ops fuzz harness.
// Run: node test-map-fix-capital-orphan.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
function bmp24(w, h, fn) {
  const rs = (w*3+3)&~3, is = rs*h; const b = Buffer.alloc(54+is);
  b.write("BM",0,"ascii"); b.writeUInt32LE(54+is,2); b.writeUInt32LE(54,10); b.writeUInt32LE(40,14);
  b.writeInt32LE(w,18); b.writeInt32LE(h,22); b.writeUInt16LE(1,26); b.writeUInt16LE(24,28); b.writeUInt32LE(0,30); b.writeUInt32LE(is,34);
  for (let y=0;y<h;y++){let o=54+(h-1-y)*rs; for(let x=0;x<w;x++){const[r,g,bl]=fn(x,y); b[o++]=bl; b[o++]=g; b[o++]=r;}}
  return b;
}
const COL = { 1:[10,10,10], 2:[20,20,20], 3:[30,30,30] };
const provAtX = (x) => (x <= 1 ? 1 : x <= 3 ? 2 : 3);
function baseMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-caporphan-"));
  mk(path.join(mod, "descriptor.mod"), 'name="CO"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(6, 2, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0","1;10;10;10;land;false;plains;1","2;20;20;20;land;false;plains;1","3;30;30;30;land;false;plains;1"].join("\n") + "\n");
  mk(path.join(mod, "common", "countries", "00.txt"), 'AAA = { color = { 200 10 10 } }\n');
  return mod;
}
const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower = 1000\n\tprovinces = { ${provs.join(" ")} }\n\thistory = { owner = ${owner} }\n}\n`;
const capOf = (mod) => { const m = /capital\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(mod, "history", "countries", "AAA.txt"), "utf8")); return m ? parseInt(m[1], 10) : null; };
const rules = (mod) => md.validateMapModel(md.buildMapModel({ modRoot: mod })).filter((p) => p.severity === "error").map((p) => p.rule);

// Case 1: capital points at a DELETED/non-existent state, country owns land -> re-point.
(() => {
  console.log("=== capital_state_missing: capital -> nonexistent state, country has land ===");
  const mod = baseMod();
  mk(path.join(mod, "history", "states", "1.txt"), st(1, [1, 2, 3], "AAA")); // only state; max id = 1 (no gap)
  mk(path.join(mod, "history", "countries", "AAA.txt"), "capital = 99\n");   // 99 doesn't exist
  try {
    ok("validator flags capital_state_missing", rules(mod).includes("capital_state_missing"), rules(mod));
    const r = md.fixForeignCapitals({ modRoot: mod });
    ok("fixer re-points the capital", r.fixed === 1 && r.details[0].to === 1, r);
    ok("capital is now AAA's real land state (1)", capOf(mod) === 1, capOf(mod));
    ok("validator clean of capital_state_missing", !rules(mod).includes("capital_state_missing"), rules(mod));
  } finally { fs.rmSync(mod, { recursive: true, force: true }); }
})();

// Case 2: capital state is EMPTY but still owned by the country, which owns OTHER land -> re-point.
(() => {
  console.log("=== empty_capital_state: capital state empty, country has other land ===");
  const mod = baseMod();
  mk(path.join(mod, "history", "states", "1.txt"), st(1, [], "AAA"));        // empty capital state
  mk(path.join(mod, "history", "states", "2.txt"), st(2, [1, 2, 3], "AAA")); // the real land
  mk(path.join(mod, "history", "countries", "AAA.txt"), "capital = 1\n");
  try {
    ok("validator flags empty_capital_state", rules(mod).includes("empty_capital_state"), rules(mod));
    const r = md.fixForeignCapitals({ modRoot: mod });
    ok("fixer re-points the capital to the land-holding state (2)", r.fixed === 1 && r.details[0].to === 2, r);
    ok("validator clean of empty_capital_state", !rules(mod).includes("empty_capital_state"), rules(mod));
  } finally { fs.rmSync(mod, { recursive: true, force: true }); }
})();

// Case 3: country owns NO land at all -> auto-fix impossible -> SKIP (surfaced for the user, not crashed on).
(() => {
  console.log("=== landless country: cannot auto-fix -> skipped, surfaced ===");
  const mod = baseMod();
  mk(path.join(mod, "history", "states", "1.txt"), st(1, [], "AAA"));        // empty; AAA owns no land anywhere
  mk(path.join(mod, "history", "countries", "AAA.txt"), "capital = 1\n");
  try {
    const r = md.fixForeignCapitals({ modRoot: mod });
    ok("fixer does NOT invent a capital (nothing fixed)", r.fixed === 0, r);
    ok("fixer reports the skip with a reason", (r.skipped || []).some((s) => s.tag === "AAA"), r.skipped);
    ok("validator still surfaces empty_capital_state for the user", rules(mod).includes("empty_capital_state"), rules(mod));
    console.log(`\ntest-map-fix-capital-orphan: ${pass} checks passed`);
  } finally { fs.rmSync(mod, { recursive: true, force: true }); }
})();
