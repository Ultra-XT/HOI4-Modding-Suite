// Unit test: createState must STEAL its provinces from whatever state currently owns them — otherwise a
// province lives in two states at once (HOI4 can only place it in one → "province in two states" crash).
// This is what makes "carve a new state/country out of existing territory" safe. It also strips the stolen
// province's victory point + province-buildings from the old state, so nothing references a province it no
// longer owns. Found by the map-ops fuzz harness. Run: node test-map-create-state-steal.js
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

(() => {
  console.log("=== createState steals provinces from their old state (no province-in-two-states) ===");
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-csteal-"));
  mk(path.join(mod, "descriptor.mod"), 'name="CS"\nreplace_path="history/states"\nreplace_path="map"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(6, 2, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0","1;10;10;10;land;false;plains;1","2;20;20;20;land;false;plains;1","3;30;30;30;land;false;plains;1"].join("\n") + "\n");
  // State 1 owns provinces 1 AND 2, with a victory point on province 2 (the one we'll steal).
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "S1"\n\tmanpower = 1000\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t\tvictory_points = { 2 10 }\n\t}\n}\n');
  mk(path.join(mod, "history", "states", "2.txt"), 'state = {\n\tid = 2\n\tname = "S2"\n\tmanpower = 1000\n\tprovinces = { 3 }\n\thistory = { owner = AAA }\n}\n');
  const errsOf = () => md.validateMapModel(md.buildMapModel({ modRoot: mod })).filter((p) => p.severity === "error");

  try {
    const r = md.createState({ modRoot: mod, name: "Carved", owner: "BBB", provinces: [2] });
    ok("createState succeeded", r.ok !== false, r);
    const model = md.buildMapModel({ modRoot: mod });
    const stateOf = (pid) => (model.states.find((s) => (s.provinces || []).includes(pid)) || {}).id;
    ok("province 2 now belongs to exactly ONE state (the new one)", model.states.filter((s) => (s.provinces || []).includes(2)).length === 1, model.states.map((s) => `${s.id}{${(s.provinces||[]).join(",")}}`));
    ok("the new state owns province 2", stateOf(2) === r.id, { newId: r.id, owner: stateOf(2) });
    ok("old state 1 no longer owns province 2 (kept province 1)", !((model.states.find((s) => s.id === 1).provinces || []).includes(2)) && (model.states.find((s) => s.id === 1).provinces || []).includes(1));
    ok("no province_in_two_states error", !errsOf().some((p) => p.rule === "province_in_two_states"), errsOf().map((p) => p.rule));
    const oldText = fs.readFileSync(path.join(mod, "history", "states", "1.txt"), "utf8");
    ok("old state's victory point on the stolen province is gone (nothing stranded)", !/victory_points\s*=\s*\{[^}]*\b2\b/.test(oldText), oldText.replace(/\s+/g, " "));

    console.log(`\ntest-map-create-state-steal: ${pass} checks passed`);
  } finally { try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {} }
})();
