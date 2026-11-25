// Unit test: dragCountryShape must never leave a province with 0 pixels. When the dragged country fully
// covers a province, that province would be wiped to 0 pixels — itself a div-by-zero crash, and the old
// "flip it to sea" cleanup left a ghost that autoFixMap flip-flopped into a stateless land province
// (land_not_in_state). The fix restores a small SEED of any wiped province (like the paint tool), so it
// survives in its existing state. Found by the map-ops fuzz harness. Run: node test-map-drag-seed.js
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
const COL = { 1:[10,10,10], 2:[20,20,20], 3:[30,30,30], 4:[40,40,40], 5:[50,50,50], 6:[60,60,60], 7:[0,0,200], 8:[0,0,210] };
const provAt = (x, y) => (Math.floor(x/4)) + (Math.floor(y/4))*4 + 1; // 16x8 -> 8 provinces (1-6 land, 7-8 sea)
const W = 16, H = 8;

(() => {
  console.log("=== dragCountryShape never wipes a province to 0 pixels (restores a seed) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-dragseed-"));
  mk(path.join(mod, "descriptor.mod"), 'name="DS"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(W, H, (x, y) => COL[provAt(x, y)]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0","1;10;10;10;land;false;plains;1","2;20;20;20;land;false;plains;1","3;30;30;30;land;false;plains;1","4;40;40;40;land;false;plains;1","5;50;50;50;land;false;plains;1","6;60;60;60;land;false;plains;1","7;0;0;200;sea;false;ocean;0","8;0;0;210;sea;false;ocean;0"].join("\n") + "\n");
  const st = (id, p, o) => `state = {\n\tid = ${id}\n\tname = "S${id}"\n\tmanpower=100000\n\tstate_category=rural\n\tprovinces = { ${p.join(" ")} }\n\thistory = { owner = ${o} }\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, [1, 2], "AAA"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, [3, 4], "AAA"));
  mk(path.join(mod, "history", "states", "3.txt"), st(3, [5], "BBB"));
  mk(path.join(mod, "history", "states", "4.txt"), st(4, [6], "BBB"));
  mk(path.join(mod, "history", "countries", "AAA.txt"), "capital = 1\n");
  mk(path.join(mod, "history", "countries", "BBB.txt"), "capital = 3\n");
  mk(path.join(mod, "common", "countries", "00.txt"), 'AAA = { color = { 200 10 10 } }\nBBB = { color = { 10 10 200 } }\n');
  const pixelCount = (id) => { const c = COL[id]; const bmp = md.readBmp24(fs.readFileSync(path.join(mod, "map", "provinces.bmp"))); let n = 0; for (let i = 0; i < bmp.rgb.length; i += 3) if (bmp.rgb[i] === c[0] && bmp.rgb[i+1] === c[1] && bmp.rgb[i+2] === c[2]) n++; return n; };

  try {
    // Drag AAA (provinces 1,2,3,4) by (+5,+1): it fully covers province 4's territory.
    const r = md.dragCountryShape({ modRoot: mod, tag: "AAA", dx: 5, dy: 1 });
    ok("drag succeeds", r.ok === true, r);
    ok("the would-be-wiped province (4) is reported as seeded", (r.seededProvinces || []).includes(4), r);
    // every province that exists in the definition still has at least one pixel (no 0-pixel div-by-zero ghost)
    let zero = [];
    for (let id = 1; id <= 8; id++) if (pixelCount(id) === 0) zero.push(id);
    ok("no province was left with 0 pixels", zero.length === 0, { zeroPixelProvinces: zero });
    ok("the seeded province (4) has a real (>=1 px) footprint", pixelCount(4) >= 1, pixelCount(4));

    md.autoFixMap({ modRoot: mod });
    const errs = md.validateMapModel(md.buildMapModel({ modRoot: mod })).filter((p) => p.severity === "error");
    ok("no land_not_in_state after autofix (the ghost flip-flop is gone)", !errs.some((p) => p.rule === "land_not_in_state"), errs.map((p) => p.rule));
    const m = md.buildMapModel({ modRoot: mod });
    ok("province 4 is still owned by a state (not orphaned)", m.states.some((s) => (s.provinces || []).includes(4)), m.states.map((s) => `${s.id}{${(s.provinces||[]).join(",")}}`));

    console.log(`\ntest-map-drag-seed: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
