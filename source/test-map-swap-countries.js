// Unit test: swapCountries — the crash-safe "country mover". HOI4's province model makes physically dragging a
// country's pixels crash-prone (0-pixel ghosts that can't be deleted without breaking id contiguity), so we
// relocate a country by OWNERSHIP: every state of A becomes B's and vice-versa, and each capital is re-pointed
// at a state it now owns (a foreign capital crashes). No pixels move. Builds a synthetic mod, verifies on disk.
// Run: node test-map-swap-countries.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-swap-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Swap"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;1;", "2;0;200;0;land;false;plains;1;",
    "3;0;0;200;land;false;plains;1;", "4;200;200;0;land;false;plains;1;",
  ].join("\r\n") + "\r\n");
  const st = (id, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${id} }\n\thistory = {\n\t\towner = ${owner}\n\t\tadd_core_of = ${owner}\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "AAA"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "AAA"));
  mk(path.join(mod, "history", "states", "3.txt"), st(3, "BBB"));
  mk(path.join(mod, "history", "states", "4.txt"), st(4, "BBB"));
  mk(path.join(mod, "history", "countries", "AAA.txt"), 'capital = 1\noob = "AAA_1936"\n');
  mk(path.join(mod, "history", "countries", "BBB.txt"), 'capital = 3\noob = "BBB_1936"\n');
  return mod;
}
const ownerOf = (mod, id) => { const t = fs.readFileSync(path.join(mod, "history", "states", id + ".txt"), "utf8"); return (/owner\s*=\s*(\w+)/.exec(t) || [])[1]; };
const capitalOf = (mod, tag) => { const t = fs.readFileSync(path.join(mod, "history", "countries", tag + ".txt"), "utf8"); return parseInt((/capital\s*=\s*(\d+)/.exec(t) || [])[1], 10); };

(() => {
  console.log("=== swapCountries (crash-safe country mover) ===");
  const mod = buildMod();
  try {
    const r = md.swapCountries({ modRoot: mod, tagA: "AAA", tagB: "BBB" });
    ok("swap reports changed + 4 states reassigned", r.changed === true && r.swapped === 4, r);

    // Ownership swapped: AAA's old states now BBB, BBB's old states now AAA.
    ok("state 1 (was AAA) is now BBB", ownerOf(mod, 1) === "BBB");
    ok("state 2 (was AAA) is now BBB", ownerOf(mod, 2) === "BBB");
    ok("state 3 (was BBB) is now AAA", ownerOf(mod, 3) === "AAA");
    ok("state 4 (was BBB) is now AAA", ownerOf(mod, 4) === "AAA");

    // Capitals re-pointed at a state each country NOW owns (no foreign/dangling capital → no crash).
    const capA = capitalOf(mod, "AAA"), capB = capitalOf(mod, "BBB");
    ok("AAA's capital is now a state AAA owns (3 or 4)", ownerOf(mod, capA) === "AAA" && [3, 4].includes(capA), capA);
    ok("BBB's capital is now a state BBB owns (1 or 2)", ownerOf(mod, capB) === "BBB" && [1, 2].includes(capB), capB);

    // Province geometry untouched (this is the whole point vs a pixel-drag): definition unchanged.
    ok("definition.csv province ids/types unchanged (no pixels moved)", (() => {
      const csv = fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8");
      return /1;200;0;0;land/.test(csv) && /4;200;200;0;land/.test(csv);
    })());

    // The rest of each country file is preserved.
    ok("country files keep their other content (oob)", /oob\s*=/.test(fs.readFileSync(path.join(mod, "history", "countries", "AAA.txt"), "utf8")));

    // Guard: swapping a country that owns nothing is refused (would be a no-op / degenerate).
    const r2 = md.swapCountries({ modRoot: mod, tagA: "AAA", tagB: "ZZZ" });
    ok("refuses to swap when a country owns no states", r2.changed === false && !!r2.error);
    ok("refuses to swap a country with itself", md.swapCountries({ modRoot: mod, tagA: "AAA", tagB: "AAA" }).changed === false);

    console.log(`\ntest-map-swap-countries: ${pass} checks passed`);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
})();
