// Unit test: dragCountryShape — the EXPERIMENTAL true pixel-drag country mover. It physically moves a country's
// province pixels on provinces.bmp by (dx,dy), backfills the vacated area with sea, overwrites the destination,
// and — crucially — keeps a small SEED of any province it would fully cover, so it survives as a valid province
// in its state (a province left with 0 pixels is a div-by-zero crash, and the old "flip it to sea" cleanup left a
// 0-pixel ghost that autoFixMap flip-flopped into stateless land). Verifies on disk. Run: node test-map-drag-country.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

const W = 24, H = 8;
// columns 0-7 = province 1 (AAA land, red), 8-9 = province 3 (CCC land, green), 10-23 = province 2 (sea, blue).
const COL = { 1: [200, 0, 0], 2: [0, 0, 200], 3: [0, 200, 0] };
const provAt = (x) => (x < 8 ? 1 : x < 10 ? 3 : 2);
function bmp24() {
  const rowSize = (W * 3 + 3) & ~3, imageSize = rowSize * H, buf = Buffer.alloc(54 + imageSize);
  buf[0] = 0x42; buf[1] = 0x4d; buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(W, 18); buf.writeInt32LE(H, 22); buf.writeUInt16LE(1, 26); buf.writeUInt16LE(24, 28); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < H; y++) { let off = 54 + (H - 1 - y) * rowSize; for (let x = 0; x < W; x++) { const [r, g, b] = COL[provAt(x)]; buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-drag-"));
  mk(path.join(mod, "descriptor.mod"), 'name="Drag"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24());
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;1;", "2;0;0;200;sea;false;ocean;0;", "3;0;200;0;land;false;plains;1;",
  ].join("\r\n") + "\r\n");
  const st = (id, provs, owner) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${owner}\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1", "AAA"));
  mk(path.join(mod, "history", "states", "3.txt"), st(3, "3", "CCC"));
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 }\n\tweather={}\n}\n');
  return mod;
}
// read a pixel's RGB from the saved provinces.bmp
function pixel(mod, x, y) {
  const buf = fs.readFileSync(path.join(mod, "map", "provinces.bmp"));
  const dataOffset = buf.readUInt32LE(10), rowSize = (W * 3 + 3) & ~3, off = dataOffset + (H - 1 - y) * rowSize + x * 3;
  return [buf[off + 2], buf[off + 1], buf[off]];
}
const defRow = (mod, id) => { const m = new RegExp("(^|\\n)(" + id + ";[^\\r\\n]*)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")); return m ? m[2].split(";") : null; };
const stateProvs = (mod, id) => { const p = path.join(mod, "history", "states", id + ".txt"); if (!fs.existsSync(p)) return null; const m = /provinces\s*=\s*\{([^}]*)\}/.exec(fs.readFileSync(p, "utf8")); return m ? (m[1].match(/\d+/g) || []).map(Number) : []; };

(() => {
  console.log("=== dragCountryShape (experimental true pixel-drag) ===");
  const mod = buildMod();
  try {
    // Move AAA (province 1, cols 0-7) RIGHT by 8 → lands on cols 8-15: it fully covers province 3 (cols 8-9)
    // and part of sea province 2; source cols 0-7 backfill to sea (province 2's colour).
    const r = md.dragCountryShape({ modRoot: mod, tag: "AAA", dx: 8, dy: 0 });
    ok("drag reports ok + experimental + moved 64 pixels", r.ok === true && r.experimental === true && r.movedPixels === 64, r);

    // The pixels actually moved on provinces.bmp.
    ok("source (0,0) is now sea (province 2's colour)", JSON.stringify(pixel(mod, 0, 0)) === JSON.stringify(COL[2]));
    ok("destination (8,4) is now province 1 (red — the country moved here, below the seed)", JSON.stringify(pixel(mod, 8, 4)) === JSON.stringify(COL[1]));
    ok("destination (15,0) is province 1 (right edge of the moved shape)", JSON.stringify(pixel(mod, 15, 0)) === JSON.stringify(COL[1]));
    ok("untouched far sea (20,0) still province 2", JSON.stringify(pixel(mod, 20, 0)) === JSON.stringify(COL[2]));

    // Province 3 (cols 8-9) was fully covered → instead of being wiped to a 0-pixel ghost (a div-by-zero crash),
    // it KEEPS a small seed and survives as a valid LAND province in its state.
    ok("the would-be-wiped province 3 is reported as seeded", Array.isArray(r.seededProvinces) && r.seededProvinces.includes(3), r.seededProvinces);
    ok("province 3's seed survives on the map at (8,0) — not a 0-pixel ghost", JSON.stringify(pixel(mod, 8, 0)) === JSON.stringify(COL[3]));
    ok("seeded province 3 stays LAND in definition.csv (not flipped to a 0-pixel sea)", defRow(mod, 3)[4] === "land");
    ok("seeded province 3 stays in its state (not orphaned)", (stateProvs(mod, 3) || []).includes(3));

    // The MOVED country's own province keeps its id + land type (only its pixels relocated).
    ok("moved province 1 keeps id + land type (geometry-only move)", defRow(mod, 1)[4] === "land" && defRow(mod, 1)[0] === "1");
    ok("moved province 1 still owned by AAA (state untouched)", (stateProvs(mod, 1) || []).includes(1));

    // Guards.
    ok("refuses a zero offset", md.dragCountryShape({ modRoot: mod, tag: "AAA", dx: 0, dy: 0 }).ok === false);
    ok("refuses a country with no provinces", md.dragCountryShape({ modRoot: mod, tag: "ZZZ", dx: 5, dy: 0 }).ok === false);

    console.log(`\ntest-map-drag-country: ${pass} checks passed`);
  } finally {
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
})();
