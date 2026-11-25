// Unit test: flipProvinceToSea — the crash-safe "erase land" geometry primitive. Per the HOI4 rules (province
// ids must stay contiguous, min 8px, every province needs a region, no stateless land), erasing land must NOT
// delete the province or zero its pixels — instead it FLIPS the province to WATER: retype in definition.csv
// (continent→0, coastal→false), remove it from its state (drop VP/buildings), and LEAVE it in its strategic
// region. CRUCIAL: a COASTAL province becomes "sea"/ocean (stays connected to the naval graph), but an INLAND
// province becomes a "lake"/lakes — an inland "sea" is an isolated ocean province that SILENTLY CRASHES HOI4
// (the bug that broke a launch). Builds a synthetic mod and verifies all of that on disk. Run: node test-map-flip-sea.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flipsea-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Flip"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;",
    "2;0;200;0;land;true;forest;3;",
    "3;0;0;200;land;false;hills;3;",
    "4;200;200;0;land;false;plains;3;",
  ].join("\r\n") + "\r\n");
  const st = (id, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3"));
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n');
  return mod;
}

const defRow = (mod, id) => { const m = new RegExp("(^|\\n)(" + id + ";[^\\r\\n]*)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")); return m ? m[2].split(";") : null; };
const stateProvs = (mod, file) => { const m = /provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(path.join(mod, "history", "states", file), "utf8")); return m ? (m[1].match(/\d+/g) || []).map(Number) : []; };

(() => {
  console.log("=== flipProvinceToSea (land→sea geometry primitive) ===");
  const mod = buildMod();
  try {
    const regionBefore = fs.readFileSync(path.join(mod, "map", "strategicregions", "r.txt"), "utf8");

    // Flip province 2 — COASTAL (coastal=true) → becomes real SEA. (state 1 owns {1,2} → stays non-empty).
    const r = md.flipProvinceToSea({ modRoot: mod, provinceId: 2 });
    ok("flip reports changed", r.changed === true);
    ok("a COASTAL province flips to SEA (connected to the ocean)", r.type === "sea");
    const row2 = defRow(mod, 2);
    ok("definition.csv: province 2 type → sea", row2[4] === "sea");
    ok("definition.csv: province 2 terrain → ocean", row2[6] === "ocean");
    ok("definition.csv: province 2 continent → 0", row2[7] === "0");
    ok("definition.csv: province 2 coastal → false", row2[5] === "false");
    ok("definition.csv: province 2 KEEPS its id + colour (no delete/renumber)", row2[0] === "2" && row2[1] === "0" && row2[2] === "200" && row2[3] === "0");
    ok("state 1 no longer owns province 2", !stateProvs(mod, "1.txt").includes(2));
    ok("state 1 still owns province 1", stateProvs(mod, "1.txt").includes(1));
    ok("no state emptied (state 1 kept province 1)", Array.isArray(r.emptiedStates) && r.emptiedStates.length === 0);
    ok("strategic region file untouched (province 2 stays in its region)", fs.readFileSync(path.join(mod, "map", "strategicregions", "r.txt"), "utf8") === regionBefore);
    ok("province ids stay contiguous (province 3 row still present)", !!defRow(mod, 3));

    // Flip province 3 — INLAND (coastal=false) → must be REFUSED. An inland province turned to water (sea OR
    // lake) is an isolated water province with no naval link; HOI4 loads it then DIVIDES BY ZERO building the
    // gamestate (a real crash). So it's rejected, and definition.csv is left untouched.
    const row3before = defRow(mod, 3).join(";");
    const r2 = md.flipProvinceToSea({ modRoot: mod, provinceId: 3 });
    ok("an INLAND province is REFUSED (can't make isolated water)", r2.changed === false && r2.isolatedWater === true, r2);
    ok("the refusal explains it must be coastal", typeof r2.error === "string" && /coastal/i.test(r2.error));
    ok("definition.csv: refused inland province 3 is UNCHANGED (still land)", defRow(mod, 3).join(";") === row3before && defRow(mod, 3)[4] === "land");

    // An explicit waterType overrides the guard (used for pixel-less ghost cleanup in dragCountryShape).
    const rForce = md.flipProvinceToSea({ modRoot: mod, provinceId: 4, waterType: "sea" });
    ok("an explicit waterType:'sea' is honored even for an inland province", rForce.type === "sea" && defRow(mod, 4)[4] === "sea");

    // Re-flipping an already-water province keeps its KIND (idempotent: sea stays sea).
    const r3 = md.flipProvinceToSea({ modRoot: mod, provinceId: 2 });
    ok("re-flipping an already-sea province keeps it sea + emptied no states", r3.type === "sea" && r3.emptiedStates.length === 0);
    const r3b = md.flipProvinceToSea({ modRoot: mod, provinceId: 4 });
    ok("re-flipping an already-sea province (forced earlier) keeps it sea", r3b.type === "sea" && defRow(mod, 4)[4] === "sea");

    // A bad id is rejected, not thrown.
    const rb = md.flipProvinceToSea({ modRoot: mod, provinceId: "x" });
    ok("a bad province id returns an error (no throw)", rb.changed === false && !!rb.error);

    console.log(`\ntest-map-flip-sea: ${pass} checks passed`);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
})();
