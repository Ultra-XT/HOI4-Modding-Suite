// ⛔ #an-emptied-state-keeps-its-dockyard-and-says-why (tool campaign B1-8).
//
// An erase (or a move) that takes a state's LAST land leaves the state with no provinces and its dockyard with no coast. Auto-fix's
// naval pass searches outward from the state's own provinces for the nearest coastal state of its owner, and a state with none finds
// nothing, so the summary said "no other state of POL has a coast" (and "of USA") while that country owned many coastal states. A state
// with no provinces stands nowhere, so no coast is nearest it: its buildings stay with it, and the answer now says that, and what
// clears it, instead of a false claim about the country.
//   1. fixNavalBuildingsWithoutCoast on a state with no provinces (owner AAA, which owns coastal states): the dockyard is left where it
//      is, and the reason names the empty state, not "no other state of AAA has a coast";
//   2. control: an inland state of BBB, which owns no other state, still gets the true "no other state of BBB has a coast";
//   3. the page's own Auto-fix summary carries the reason as the answer gives it;
//   4. source (comments masked): the reason is chosen on the state's provinces before the claim about the country.
// Binds no port. Run: node test-an-emptied-state-keeps-its-dockyard-and-says-why.js
"use strict";
const assert = require("assert");
const fs = require("fs"), os = require("os"), path = require("path");
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "nova-emptied-dockyard-"));
const md = require("./map-data.js");
const TL = require("./testlib-map-page.js");
const { maskJsComments, jsBodyAt } = require("./testlib-strip-comments.js");
let pass = 0;
const ok = (n, c, x) => { assert.ok(c, n + (x !== undefined ? " -> " + JSON.stringify(x).slice(0, 900) : "")); console.log("  ok  " + n); pass++; };
const write = (dir, rel, body) => { const p = path.join(dir, ...rel.split("/")); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
function bmp24(W, H, fn) {
  const rs = Math.floor((24 * W + 31) / 32) * 4, b = Buffer.alloc(54 + rs * H);
  b.write("BM", 0, "ascii"); b.writeUInt32LE(b.length, 2); b.writeUInt32LE(54, 10); b.writeUInt32LE(40, 14);
  b.writeInt32LE(W, 18); b.writeInt32LE(H, 22); b.writeUInt16LE(1, 26); b.writeUInt16LE(24, 28); b.writeUInt32LE(rs * H, 34);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [r, g, bl] = fn(x, y); const o = 54 + (H - 1 - y) * rs + x * 3; b[o] = bl; b[o + 1] = g; b[o + 2] = r; }
  return b;
}
//        x 10-20  20-30  30-40  40-50
//  y 5     2      3      4      5
//  y 15    6      7      8      9          7 and 8 inland
//  y 25   10     11     12     13          the rest is sea 1
const W = 60, H = 45, SEA = 1;
const RECT = {
  2: [10, 5, 20, 15], 3: [20, 5, 30, 15], 4: [30, 5, 40, 15], 5: [40, 5, 50, 15],
  6: [10, 15, 20, 25], 7: [20, 15, 30, 25], 8: [30, 15, 40, 25], 9: [40, 15, 50, 25],
  10: [10, 25, 20, 35], 11: [20, 25, 30, 35], 12: [30, 25, 40, 35], 13: [40, 25, 50, 35],
};
const shapeAt = (x, y) => { for (const [id, [x0, y0, x1, y1]] of Object.entries(RECT)) if (x >= x0 && x < x1 && y >= y0 && y < y1) return +id; return SEA; };
const colour = (id) => [(id * 37) % 256, (id * 71) % 256, 40 + id];
// state 1 AAA coastal; state 2 AAA EMPTY (an erase took its last land) with a dockyard; state 3 BBB inland (7) with a dockyard, BBB owns
// nothing else; state 4 AAA, the rest (coastal).
const STATES = { 1: [[2, 3, 6], "AAA", ""], 2: [[], "AAA", "\t\t\tdockyard = 4\n"], 3: [[7], "BBB", "\t\t\tdockyard = 2\n"], 4: [[4, 5, 8, 9, 10, 11, 12, 13], "AAA", ""] };
const BUILDINGS = "buildings = {\n\tnaval_base = {\n\t\tonly_costal = yes\n\t\tspawn_point = naval_base_spawn\n\t}\n\tdockyard = {\n\t\tonly_costal = yes\n\t\tlevel_cap = {\n\t\t\tshares_slots = yes\n\t\t}\n\t}\n}\n";
function makeMod(name) {
  const dir = path.join(ROOT, name);
  write(dir, "descriptor.mod", `name="${name}"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="common/buildings"\n`);
  write(dir, "map/provinces.bmp", bmp24(W, H, (x, y) => colour(shapeAt(x, y))));
  const defs = ["0;0;0;0;land;false;unknown;0", `${SEA};${colour(SEA).join(";")};sea;false;ocean;0`];
  for (let id = 2; id <= 13; id++) defs.push(`${id};${colour(id).join(";")};land;false;plains;1`);
  write(dir, "map/definition.csv", defs.join("\n") + "\n");
  write(dir, "common/buildings/00_buildings.txt", BUILDINGS);
  for (const [sid, [provs, owner, bld]] of Object.entries(STATES)) {
    write(dir, `history/states/${sid}-S.txt`, `state = {\n\tid = ${sid}\n\tname = "STATE_${sid}"\n\tmanpower = 1000\n\tstate_category = rural\n\tprovinces = { ${provs.join(" ")} }\n\thistory = {\n\t\towner = ${owner}\n\t\tbuildings = {\n\t\t\tinfrastructure = 2\n${bld}\t\t}\n\t}\n}\n`);
  }
  write(dir, "map/buildings.txt", "");
  return { modRoot: dir, gameRoot: path.join(ROOT, "no-game"), dependencyRoots: [] };
}
const stateFile = (roots, sid) => fs.readFileSync(path.join(roots.modRoot, "history", "states", `${sid}-S.txt`), "utf8");

try {
  console.log("=== 1-2. the naval pass on an emptied state, and the control ===");
  {
    const roots = makeMod("fix");
    const r = md.fixNavalBuildingsWithoutCoast(roots);
    ok("the pass ran", r && !r.error, r);
    const left = Array.isArray(r.left) ? r.left : [];
    const of2 = left.filter((l) => l.stateId === 2), of3 = left.filter((l) => l.stateId === 3);
    ok("state 2's dockyard (no provinces left) stays where it is, said in `left`", of2.length === 1 && of2[0].key === "dockyard" && /dockyard = 4/.test(stateFile(roots, 2)), left);
    ok("…and the reason names the empty state, not a claim that AAA (which owns coastal states 1 and 4) has no coast",
      /no provinces left/.test(of2[0].why) && !/no other state of AAA has a coast/.test(of2[0].why), of2[0]);
    ok("…and points at the empty state's own row", /they stay with the state, which Map Errors reports as empty/.test(of2[0].why), of2[0].why);
    // (review) the reason names no step a Map tool cannot take: no tool puts a province into a state that has none, an empty state cannot
    // be clicked, and Delete refuses a state from a layer below (B1-8's own Danzig, on a vanilla add-on)
    ok("…and names no step the map cannot take (land back into an empty state, or deleting it)", !/land back|delete it/i.test(of2[0].why), of2[0].why);
    ok("control: BBB's inland state 3 gets the true claim (BBB owns no other state)", of3.length === 1 && of3[0].why === "no other state of BBB has a coast", of3);
    ok("nothing was carried from the empty state", !(r.carried || []).some((c) => c.from === 2), r.carried);

    console.log("=== 3. the page's own summary ===");
    const line = TL.autoFixSummary({ ok: true, fixes: { navalNoCoast: r } });
    ok("the summary carries the empty state's reason and not the false claim",
      /its state has no provinces left/.test(line) && !/no other state of AAA has a coast/.test(line), line);
  }

  console.log("=== 4. source (comments masked) ===");
  {
    const masked = maskJsComments(fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8"));
    const opening = "function fixNavalBuildingsWithoutCoast(";
    const at = masked.indexOf(opening);
    if (at < 0 || masked.indexOf(opening, at + 1) !== -1) throw new Error("map-data.js: not found exactly once: " + opening);
    const span = jsBodyAt(masked, at);
    const body = masked.slice(span[0], span[1] + 1);
    const claim = body.indexOf("no other state of ${");
    const empty = body.indexOf("its state has no provinces left");
    ok("the reason is chosen on the state's provinces before the claim about its country", claim > 0 && empty > 0 && empty < claim && body.slice(empty, claim).length < 300, { claim, empty });
  }
  console.log(`\ntest-an-emptied-state-keeps-its-dockyard-and-says-why: ${pass} checks passed`);
} finally {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* this test's own temp fixture */ }
}
