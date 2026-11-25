// Unit test: fixMalformedRivers + fixSeaContinents (two more Auto-fix crash repairs).
// fixMalformedRivers wipes SOURCELESS river components (a river with no green source / red-yellow flow marker
// is an orphan the game's tracer can't resolve → setup CTD) back to land, while keeping valid sourced rivers.
// fixSeaContinents forces SEA provinces to continent 0 (HOI4 requires it) while leaving lakes alone.
// Run: node test-map-fix-rivers-continents.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const md = require("./map-data.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); console.log("  ok  " + n); pass++; };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function bmp8(width, height, palette, indexFn) {
  const rowSize = (width + 3) & ~3, imageSize = rowSize * height, dataOffset = 54 + 256 * 4;
  const buf = Buffer.alloc(dataOffset + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(dataOffset, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(8, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34); buf.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { const c = palette[i] || { r: 0, g: 0, b: 0 }; const o = 54 + i * 4; buf[o] = c.b; buf[o + 1] = c.g; buf[o + 2] = c.r; buf[o + 3] = 0; }
  for (let y = 0; y < height; y++) { const row = dataOffset + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) buf[row + x] = indexFn(x, y) & 0xff; }
  return buf;
}

(() => {
  console.log("=== fixMalformedRivers + fixSeaContinents ===");

  // (A) fixMalformedRivers
  let mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-malriv-"));
  mk(path.join(mod, "descriptor.mod"), 'name="MalRiv"\nreplace_path="map"\n');
  const PAL = []; PAL[0] = { r: 0, g: 255, b: 0 }; PAL[3] = { r: 0, g: 225, b: 255 }; PAL[254] = { r: 122, g: 122, b: 122 };
  // sourced river: source(0) at (1,2), body(3) at (2,2),(3,2). sourceless fragment: body(3) at (6,5),(7,5).
  const W = 16, H = 8;
  const idxFn = (x, y) => {
    if (x === 1 && y === 2) return 0;                  // green source
    if (y === 2 && (x === 2 || x === 3)) return 3;      // its body (4-connected to the source)
    if (y === 5 && (x === 6 || x === 7)) return 3;      // SOURCELESS fragment
    return 254;                                         // land
  };
  const rp = path.join(mod, "map", "rivers.bmp");
  mk(rp, bmp8(W, H, PAL, idxFn));
  try {
    const r = md.fixMalformedRivers({ modRoot: mod });
    ok("fixMalformedRivers reports changed", r.ok === true && r.changed === true, r);
    ok("ADDS a source to the sourceless component (keeps the user's river, doesn't wipe it)", r.addedSources === 1 && r.removedComponents === 0, r);
    const m2 = md.readIndexedBmp(fs.readFileSync(rp));
    const at = (x, y) => fs.readFileSync(rp)[m2.pixelOffset(x, y)];
    ok("sourced river is KEPT (source 0 + body 3 still present)", at(1, 2) === 0 && at(2, 2) === 3 && at(3, 2) === 3, { s: at(1, 2), b1: at(2, 2), b2: at(3, 2) });
    ok("sourceless fragment is KEPT — one end becomes the green source (0), the other stays body (3)", (at(6, 5) === 0 && at(7, 5) === 3) || (at(6, 5) === 3 && at(7, 5) === 0), { a: at(6, 5), b: at(7, 5) });
    // #a-backup-must-not-ship-with-the-mod — safeModWrite's backup goes to Nova's own folder; a .bak beside
    // the file would ship to the Workshop with the mod.
    ok("no .bak was left beside rivers.bmp", !fs.existsSync(rp + ".bak"));
    const r2 = md.fixMalformedRivers({ modRoot: mod });
    ok("idempotent — the now-sourced river is left alone on a second pass", r2.changed === false && r2.addedSources === 0 && r2.removedComponents === 0, r2);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }

  // (B) fixSeaContinents
  mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-seacont-"));
  mk(path.join(mod, "descriptor.mod"), 'name="SeaCont"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;",
    "2;0;200;0;sea;false;ocean;5;",   // SEA with continent 5 → must become 0
    "3;0;0;200;lake;false;lakes;5;",  // LAKE with continent 5 → left as-is (wiki allows)
  ].join("\r\n") + "\r\n");
  const contOf = (id) => parseInt((new RegExp("(^|\\n)" + id + ";[^;]*;[^;]*;[^;]*;[^;]*;[^;]*;[^;]*;([0-9]+)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")) || [])[2], 10);
  try {
    const r = md.fixSeaContinents({ modRoot: mod });
    ok("fixSeaContinents reverts exactly 1 sea province", r.fixed === 1 && r.provinces[0] === 2, r);
    ok("disk: sea province 2 → continent 0", contOf(2) === 0, contOf(2));
    ok("disk: lake province 3 keeps continent 5 (untouched)", contOf(3) === 5, contOf(3));
    ok("idempotent — second pass fixes nothing", md.fixSeaContinents({ modRoot: mod }).fixed === 0);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }

  console.log(`\ntest-map-fix-rivers-continents: ${pass} checks passed`);
})();
