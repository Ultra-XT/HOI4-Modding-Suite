// Unit test: fixOrphanedStateBuildings — drops `<prov> = { ... }` building blocks from a state's history that
// the state doesn't own (not in its provinces list) or that sit on a now-SEA province. HOI4 logs "Trying to set
// province building in state that doesn't own it" / "invalid province building" for these (non-fatal, but the
// building vanishes + clutters error.log). Leftover when land with a naval base is erased to sea but the block
// stayed in a state that already dropped the province. Run: node test-map-fix-orphaned-buildings.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

(() => {
  console.log("=== fixOrphanedStateBuildings (orphan naval bases left in state history) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-orphbld-"));
  try {
    mk(path.join(mod, "descriptor.mod"), 'name="Orph"\nreplace_path="history/states"\nreplace_path="map"\n');
    mk(path.join(mod, "map", "definition.csv"), [
      "0;0;0;0;land;false;unknown;0",
      "1;200;0;0;land;false;plains;1",   // owned land
      "2;0;200;0;land;false;plains;1",   // NOT owned by state 1
      "3;0;0;200;sea;false;ocean;0",      // a sea province (a naval base on it is invalid)
    ].join("\r\n") + "\r\n");
    // state 1 owns ONLY province 1, but its buildings hold blocks for 1 (ok), 2 (not owned), 3 (sea).
    mk(path.join(mod, "history", "states", "1.txt"),
      'state = {\n\tid = 1\n\tname = "S1"\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = {\n\t\towner = AAA\n\t\tbuildings = {\n\t\t\tinfrastructure = 1\n\t\t\t1 = { naval_base = 2 }\n\t\t\t2 = { naval_base = 8 }\n\t\t\t3 = { naval_base = 4 }\n\t\t}\n\t}\n}\n');
    const stTxt = () => fs.readFileSync(path.join(mod, "history", "states", "1.txt"), "utf8");
    const hasProvBlock = (id) => new RegExp(`(?<![0-9])${id}\\s*=\\s*\\{`).test(stTxt());

    const dry = md.fixOrphanedStateBuildings({ modRoot: mod, dryRun: true });
    ok("dry run detects 2 orphans (province 2 not owned + province 3 sea), writes nothing", dry.removed === 2 && hasProvBlock(2) && hasProvBlock(3), dry);

    const r = md.fixOrphanedStateBuildings({ modRoot: mod });
    ok("removes the 2 orphan building blocks", r.ok && r.removed === 2, r);
    ok("province 1's block (owned land) is KEPT", hasProvBlock(1) && /1\s*=\s*\{\s*naval_base\s*=\s*2/.test(stTxt()), stTxt());
    ok("the not-owned province 2 block is gone", !hasProvBlock(2), stTxt());
    ok("the sea province 3 block is gone", !hasProvBlock(3), stTxt());
    ok("the non-province building (infrastructure = 1) is preserved", /infrastructure\s*=\s*1/.test(stTxt()), stTxt());
    ok("idempotent — a second pass removes nothing", md.fixOrphanedStateBuildings({ modRoot: mod }).removed === 0);

    console.log(`\ntest-map-fix-orphaned-buildings: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
