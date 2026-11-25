// Unit test: Auto-fix the "capital owned by another country" error (capital_state_owned_by_other).
// When you paint a country's capital state over to someone else, that country owns land but no longer
// owns its `capital = N` state. hoi4.exe refuses that capital and logs it ("Attempting to set capital
// state #… , they dont own it!"); Millennium Dawn, Novum Vexillum and Rise of Nations ship the shape and
// launch, so it is an error, not a crash (test-a-map-message-claims-only-what-the-engine-shows.js, B).
// The validator flagged this but autoFixMap couldn't fix it, so "Auto-fix all" looped forever. autoFixMap
// now re-points each broken capital onto the country's own most important land-holding state (its highest
// victory point, then VP sum, manpower, lowest id — capitalStateFor; it was "the most provinces", which picks the
// shipped capital for 36% of countries: test-a-capital-is-its-countrys-most-important-state.js) — WITHOUT undoing
// the territory edit. Builds a synthetic mod, runs the fix on disk, asserts it's correct AND
// idempotent.
// Run: node test-map-fix-capital.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");

let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-fixcap-"));
  mk(path.join(mod, "descriptor.mod"), 'name="FixCap"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;1;", "2;0;200;0;land;false;plains;1;",
    "3;0;0;200;land;false;plains;1;", "4;200;200;0;land;false;plains;1;",
  ].join("\r\n") + "\r\n");
  // state 1 = AAA's authored capital, but it's OWNED BY BBB (the user painted it away). AAA still owns
  // states 2 + 4 (its real land). BBB owns 1 + 3 and its own capital (3), so BBB is fine.
  const st = (id, owner, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t\tadd_core_of = ${owner}\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "BBB", "1"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "AAA", "2"));      // AAA, 1 province
  mk(path.join(mod, "history", "states", "3.txt"), st(3, "BBB", "3"));
  mk(path.join(mod, "history", "states", "4.txt"), st(4, "AAA", "4"));      // AAA, 1 province
  mk(path.join(mod, "history", "countries", "AAA.txt"), 'capital = 1\noob = "AAA_1936"\n'); // capital owned by BBB!
  mk(path.join(mod, "history", "countries", "BBB.txt"), 'capital = 3\noob = "BBB_1936"\n'); // owns its capital → fine
  return mod;
}
const ownerOf = (mod, id) => (/owner\s*=\s*(\w+)/.exec(fs.readFileSync(path.join(mod, "history", "states", id + ".txt"), "utf8")) || [])[1];
const capitalOf = (mod, tag) => parseInt((/capital\s*=\s*(\d+)/.exec(fs.readFileSync(path.join(mod, "history", "countries", tag + ".txt"), "utf8")) || [])[1], 10);

(() => {
  console.log("=== Auto-fix: capital owned by another country ===");
  const mod = buildMod();
  try {
    const r = md.autoFixMap({ modRoot: mod });
    ok("autoFixMap succeeds", r.ok === true, r);
    const cap = (r.fixes && r.fixes.capitals) || {};
    ok("it reports fixing exactly 1 foreign capital", cap.fixed === 1, cap);
    ok("the fix detail is AAA: capital 1 → a state AAA owns", cap.details && cap.details[0] && cap.details[0].tag === "AAA" && cap.details[0].from === 1, cap.details);

    // On disk: AAA's capital now points at a state AAA actually owns (2 or 4), and the TERRITORY edit
    // is untouched — state 1 is still BBB's (the fix did NOT hand the annexed state back).
    const capA = capitalOf(mod, "AAA");
    ok("AAA's capital re-pointed to a state AAA owns (2 or 4)", [2, 4].includes(capA) && ownerOf(mod, capA) === "AAA", { capA, owner: ownerOf(mod, capA) });
    ok("the territory edit is preserved — state 1 is still owned by BBB", ownerOf(mod, 1) === "BBB");
    ok("BBB's own valid capital was left alone (still 3)", capitalOf(mod, "BBB") === 3);

    // Idempotent: a second pass finds nothing — i.e. the error is genuinely CLEARED, not looping
    // (the exact bug the user hit: 'Auto-fix all' kept failing because the capital was never touched).
    //
    // ⚠️ Two shapes count as "found nothing" now. Auto-fix stops before the fixers when the mod has no
    // reported problems at all (#auto-fix-materialised-43-MB-to-repair-nothing — a clean Millennium Dawn
    // add-on used to gain 43.6 MB of MD's map from one click), so a fully-repaired mod short-circuits and
    // `fixes` is empty. That IS this assertion's point, more directly than the old reading of it: the
    // second pass had nothing to do. If any problem does remain, the fixers run and the capital count must
    // be 0.
    const r2 = md.autoFixMap({ modRoot: mod });
    const cap2 = r2.fixes && r2.fixes.capitals;
    ok("a second auto-fix finds 0 foreign capitals (error cleared, no loop)",
      r2.nothingToFix === true || (cap2 && cap2.fixed === 0), { nothingToFix: r2.nothingToFix, capitals: cap2 });

    console.log(`\ntest-map-fix-capital: ${pass} checks passed`);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
})();
