// Unit test: flipProvinceToLand — the inverse of flipProvinceToSea, the primitive the land generator builds on.
// Retypes a SEA province → LAND in definition.csv (type land, terrain plains, a NON-ZERO continent, not coastal)
// keeping its id + pixels; it does NOT assign a state (a land province needs one — the generator does that),
// so it reports needsState. Builds a synthetic mod and verifies on disk. Run: node test-map-flip-land.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-flipland-"));
  mk(path.join(mod, "descriptor.mod"), 'name="FlipLand"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;sea;false;ocean;0;",   // sea provinces to turn into land
    "2;0;200;0;sea;false;ocean;0;",
    "3;0;0;200;land;false;plains;1;", // already land
  ].join("\r\n") + "\r\n");
  return mod;
}
const defRow = (mod, id) => { const m = new RegExp("(^|\\n)(" + id + ";[^\\r\\n]*)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")); return m ? m[2].split(";") : null; };

(() => {
  console.log("=== flipProvinceToLand (sea→land inverse primitive) ===");
  const mod = buildMod();
  try {
    // Default flip: sea → land, plains, continent 1, not coastal.
    const r = md.flipProvinceToLand({ modRoot: mod, provinceId: 1 });
    ok("flip reports changed + needsState", r.changed === true && r.needsState === true);
    const c1 = defRow(mod, 1);
    ok("province 1 type → land", c1[4] === "land");
    ok("province 1 terrain → plains", c1[6] === "plains");
    ok("province 1 continent → 1 (non-zero; sea=0 would error for land)", c1[7] === "1");
    ok("province 1 coastal → false", c1[5] === "false");
    ok("province 1 keeps its id + colour (200,0,0)", c1[0] === "1" && c1[1] === "200" && c1[2] === "0" && c1[3] === "0");

    // Custom continent + terrain are honoured.
    const r2 = md.flipProvinceToLand({ modRoot: mod, provinceId: 2, continent: 4, terrain: "hills" });
    ok("custom continent honoured", defRow(mod, 2)[7] === "4" && r2.continent === 4);
    ok("custom terrain honoured", defRow(mod, 2)[6] === "hills");

    // A continent of 0 is coerced to a valid non-zero (land must not be continent 0).
    const r3 = md.flipProvinceToLand({ modRoot: mod, provinceId: 2, continent: 0 });
    ok("continent 0 is coerced to 1 (land needs a non-zero continent)", r3.continent === 1 && defRow(mod, 2)[7] === "1");

    // A bad id is rejected, not thrown.
    const rb = md.flipProvinceToLand({ modRoot: mod, provinceId: "nope" });
    ok("a bad province id returns an error (no throw)", rb.changed === false && !!rb.error);

    // Round-trip with the sea flip: land→sea→land returns a valid land province. Force waterType:"sea" so the
    // setup is deterministic regardless of the province's coastal flag (inland would otherwise become a lake).
    md.flipProvinceToSea({ modRoot: mod, provinceId: 3, waterType: "sea" });
    ok("sea flip turned province 3 to sea", defRow(mod, 3)[4] === "sea");
    md.flipProvinceToLand({ modRoot: mod, provinceId: 3 });
    ok("land flip turns province 3 back to valid land (continent non-zero)", defRow(mod, 3)[4] === "land" && defRow(mod, 3)[7] === "1");

    console.log(`\ntest-map-flip-land: ${pass} checks passed`);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
})();
