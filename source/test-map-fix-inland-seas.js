// Unit test: fixInlandSeas — the auto-fix that detects + repairs ISOLATED INLAND SEAS (a sea province cut off
// from the main ocean → HOI4 divides by zero → CTD). It reverts such provinces to land, BUT preserves a legit
// Caspian-style inland sea (one that lives in a SEA strategic region). Builds a synthetic provinces.bmp with:
// a 2-province ocean, an inland sea in a LAND region (must revert), and an inland sea in a SEA region (must
// keep). Run: node test-map-fix-inland-seas.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp24(width, height, pixelFn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = pixelFn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
// Column → province. 1 land | 2 SEA(inland, land region) | 3 land | 4 SEA(Caspian, sea region) | 5 land |
// 6,7 SEA(the ocean, connected) | 8 land.
const COL = { 1: [200, 0, 0], 2: [0, 200, 0], 3: [0, 0, 200], 4: [200, 200, 0], 5: [200, 0, 200], 6: [0, 200, 200], 7: [100, 150, 200], 8: [150, 100, 50] };
const provAtX = (x) => (x <= 3 ? 1 : x <= 5 ? 2 : x <= 9 ? 3 : x <= 11 ? 4 : x <= 15 ? 5 : x <= 17 ? 6 : x <= 19 ? 7 : 8);

/** west / east: the terrain of the land on each side of the inland sea (provinces 1 and 3) */
function buildMod({ west = "plains", east = "hills", terrainFile = "" } = {}) {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-inlandsea-"));
  if (terrainFile) mk(path.join(mod, "common", "terrain", "00_terrain.txt"), terrainFile);
  mk(path.join(mod, "descriptor.mod"), 'name="InlandSea"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(24, 4, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    `1;200;0;0;land;false;${west};3;`,
    "2;0;200;0;sea;false;ocean;0;",        // inland sea in a LAND region → must REVERT
    `3;0;0;200;land;false;${east};3;`,
    "4;200;200;0;sea;false;ocean;0;",       // inland sea in a SEA region (Caspian) → must KEEP
    "5;200;0;200;land;false;plains;3;",
    "6;0;200;200;sea;false;ocean;0;",       // ocean
    "7;100;150;200;sea;false;ocean;0;",     // ocean (adjacent to 6 → the main ocean = 2 provinces)
    "8;150;100;50;land;false;desert;3;",
  ].join("\r\n") + "\r\n");
  const reg = (id, provs) => `strategic_region={\n\tid=${id}\n\tname="REGION_${id}"\n\tprovinces={ ${provs} }\n\tweather={}\n}\n`;
  mk(path.join(mod, "map", "strategicregions", "land.txt"), reg(100, "1 2 3 5 8"));  // mostly land → land region
  mk(path.join(mod, "map", "strategicregions", "caspian.txt"), reg(200, "4"));        // all sea → sea region
  mk(path.join(mod, "map", "strategicregions", "ocean.txt"), reg(300, "6 7"));        // the ocean
  return mod;
}
const typeOf = (mod, id) => { const m = new RegExp("(^|\\n)" + id + ";[^;]*;[^;]*;[^;]*;([^;]*)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")); return m ? m[2] : null; };
const terrainOf = (mod, id) => { const row = fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8").split(/\r?\n/).map((l) => l.split(";")).find((c) => +c[0] === id); return row ? row[6] : null; };
/** the terrain province 2 comes out with, between land of those two kinds */
const filledBetween = (west, east, terrainFile) => {
  const mod = buildMod({ west, east, terrainFile });
  try { const r = md.fixInlandSeas({ modRoot: mod }); return { fixed: r.fixed, type: typeOf(mod, 2), terrain: terrainOf(mod, 2), said: ((r.details || [])[0] || {}).terrain }; }
  finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
};

(() => {
  console.log("=== fixInlandSeas (revert isolated inland seas, keep Caspian-style) ===");
  const mod = buildMod();
  try {
    const r = md.fixInlandSeas({ modRoot: mod });
    ok("reverts exactly 1 inland-sea province (the land-region one)", r.fixed === 1, r);
    ok("keeps 1 legit sea body (the sea-region 'Caspian')", r.keptSeaBodies === 1, r);
    ok("the reverted province is the land-region inland sea (prov 2)", r.details && r.details[0] && r.details[0].province === 2, r.details);
    ok("disk: inland-sea prov 2 → LAND", typeOf(mod, 2) === "land", typeOf(mod, 2));
    ok("disk: reverted prov 2 took a land neighbour's terrain (plains/hills)", ["plains", "hills"].includes((new RegExp("(^|\\n)2;[^;]*;[^;]*;[^;]*;[^;]*;[^;]*;([^;]*)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")) || [])[2]));
    ok("disk: Caspian prov 4 STAYS sea (sea region protected it)", typeOf(mod, 4) === "sea", typeOf(mod, 4));
    ok("disk: ocean provs 6 + 7 STAY sea (the main ocean is never touched)", typeOf(mod, 6) === "sea" && typeOf(mod, 7) === "sea");

    // Idempotent: a second pass finds nothing (prov 2 is land now, the rest are valid).
    const r2 = md.fixInlandSeas({ modRoot: mod });
    ok("a second pass reverts nothing (idempotent)", r2.fixed === 0, r2);

    // ⛔ #a-filled-in-sea-is-not-a-city — THE FILL NEVER COPIES `urban`. A province typed urban is painted a city core, and
    // which provinces are cities is decided per state by the city pass. Found on the owner's flow (Generate land 35%, seed 1,
    // then Auto-fix all): 8 of the 71 cut-off seas this pass filled lay beside a city and came out as cities themselves.
    console.log("\n=== a filled-in sea beside a city is not a city ===");
    const plain = filledBetween("forest", "hills");
    ok("THE CONTROL: between forest and hills it takes the terrain of the first land beside it (forest)", plain.fixed === 1 && plain.type === "land" && plain.terrain === "forest" && plain.said === "forest", plain);
    const westCity = filledBetween("urban", "hills");
    ok("with a city on that side and hills on the other it takes the hills, not the city", westCity.fixed === 1 && westCity.type === "land" && westCity.terrain === "hills" && westCity.said === "hills", westCity);
    const eastCity = filledBetween("forest", "urban");
    ok("…and a city on the other side changes nothing: the first land beside it still answers", eastCity.terrain === "forest", eastCity);
    const bothCities = filledBetween("urban", "urban");
    ok("with nothing but cities beside it, it is land of the default terrain (plains) — still not a city", bothCities.fixed === 1 && bothCities.type === "land" && bothCities.terrain === "plains" && bothCities.said === "plains", bothCities);
    // (review AS-9) A city is what the map says one is: `port` here has a graphical entry that is spawn_city, as Hearts of Minecraft paints its `port` with city ground.
    const CITY_PORT = ["categories = {", "\tocean = { color = { 0 0 200 } is_water = yes }", "\tport = { color = { 140 110 100 } }", "\thills = { color = { 248 255 153 } }", "}",
      "terrain = {", "\tport_13 = { type = port color = { 13 } texture = 10 spawn_city = yes }", "\tocean = { type = ocean color = { 15 } }", "}", ""].join("\n");
    const portCity = filledBetween("port", "hills", CITY_PORT);
    ok("⭐ a terrain this map declares a city is not ground to spread either, whatever it is called", portCity.fixed === 1 && portCity.type === "land" && portCity.terrain === "plains" && portCity.said === "plains", portCity);
    const portPlain = filledBetween("port", "hills");
    ok("THE CONTROL: with no such declaration, `port` is ground like any other", portPlain.fixed === 1 && portPlain.terrain === "port", portPlain);

    console.log(`\ntest-map-fix-inland-seas: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
