// ⛔ #erase-can-only-cut-one-province-deep — THE CLIENT HALF, STILL LIVE AFTER THE SERVER HALF WAS FIXED.
//
// Only COASTAL land may be erased to water: an inland province turned to sea is an orphaned body with no
// naval connection, and HOI4 loads it and then divides by zero. Both sides enforce that.
//
// The trouble is definition.csv's `coastal` column. Nothing updates it when the map changes, so the moment
// you erase a coastal province its inland neighbour is genuinely on the shore while its column still says
// false. map-data fixed this by second-guessing a `false` against the bitmap (provinceTouchesWater), and the
// wiki agrees: "If bitmap and province definition disagree on whether or not a province is coastal … bitmap's
// results will be preferred."
//
// The brush never reached that code. eraseProvinceLocal refused first, on the column alone, so the stroke
// still could not cut deeper than one province and the documented workaround — run Auto-fix between every
// ring — was still required. Measured in the running editor on vanilla's Scottish coast:
//
//     click 11297 (coastal)  -> "🧹 Erased 1 coastal province to sea."
//     click 9269  (its inland neighbour, now bordering that new water)
//                            -> "Those provinces are INLAND … Nothing was changed."
//
// ⭐ The fix must NOT become "allow everything". Land with no water neighbour at all is still refused, which
// is the second half of every case below — and after the fix, clicking two provinces further inland in the
// same session was still correctly refused.
"use strict";
const fs = require("fs");
const path = require("path");

let pass = 0;
const fails = [];
const ok = (cond, label, detail) => {
  if (cond === true) { pass++; console.log("  ok   " + label); }
  else { fails.push(label); console.log("  FAIL " + label + (detail !== undefined ? "   -> " + JSON.stringify(detail).slice(0, 320) : "")); }
};

const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
function lift(name) {
  const a = SRC.indexOf("function " + name + "(");
  if (a < 0) return null;
  let paren = 0, bodyStart = -1;
  for (let i = SRC.indexOf("(", a); i < SRC.length; i++) {
    if (SRC[i] === "(") paren++;
    else if (SRC[i] === ")") { paren--; if (!paren) { bodyStart = SRC.indexOf("{", i); break; } }
  }
  if (bodyStart < 0) return null;
  let d = 0, end = -1;
  for (let i = bodyStart; i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  return end < 0 ? null : SRC.slice(a, end);
}

const fnSrc = lift("eraseProvinceLocal");
ok(!!fnSrc, "eraseProvinceLocal was found in public/map.js");

// A coastline: 1 = sea, 2 = coastal land, 3 = land behind it, 4 = land behind THAT, 9 = an isolated inland
// province touching nothing but land. Only 2 has coastal=true in the definition, exactly like a real map.
function harness() {
  const erasedThisStroke = new Set();
  const eraseSkippedInland = new Set();
  const provinceType = new Map([[1, "sea"], [2, "land"], [3, "land"], [4, "land"], [9, "land"]]);
  const provinceDef = new Map([
    [1, { id: 1, type: "sea", coastal: false }],
    [2, { id: 2, type: "land", coastal: true }],
    [3, { id: 3, type: "land", coastal: false }],
    [4, { id: 4, type: "land", coastal: false }],
    [9, { id: 9, type: "land", coastal: false }],
  ]);
  const neighbours = new Map([
    [1, new Set([2])], [2, new Set([1, 3])], [3, new Set([2, 4])], [4, new Set([3, 9])], [9, new Set([4])],
  ]);
  const model = { states: [{ id: 100, provinces: [2, 3, 4, 9] }], provinceToState: { 2: 100, 3: 100, 4: 100, 9: 100 } };
  const queued = [];
  // #the-erase-brush-counts-only-what-it-flipped — eraseProvinceLocal takes the stroke's Undo step at its first flip, so it calls pushUndo.
  const run = new Function(
    "erasedThisStroke", "provinceType", "provinceDef", "eraseSkippedInland", "model", "provinceToOwner",
    "pendingWrites", "queueWrite", "provNeighborsCache", "buildProvNeighbors", "pushUndo",
    lift("moveProvinceLevels") + "\nreturn (" + fnSrc + ")")(
    erasedThisStroke, provinceType, provinceDef, eraseSkippedInland, model, {},
    [], (url, body) => queued.push({ url, body }), neighbours, () => {}, () => {});
  return { run, erasedThisStroke, eraseSkippedInland, provinceType, queued };
}

console.log("\n-- the coast itself still erases, and inland land still does not --");
{
  const h = harness();
  ok(h.run(2) === true, "the coastal province is erased", h.eraseSkippedInland);
  ok(h.provinceType.get(2) === "sea", "…and is water now");
}
{
  const h = harness();
  ok(h.run(9) === false, "a province with no water neighbour at all is refused");
  ok(h.eraseSkippedInland.has(9), "…and recorded as skipped-inland, so the message can say so");
}

console.log("\n-- ⭐ and the brush now cuts deeper than one province --");
{
  const h = harness();
  ok(h.run(2) === true, "ring 1 (coastal) goes");
  ok(h.run(3) === true, "⭐ ring 2 goes too — it borders the water ring 1 just became", h.eraseSkippedInland);
  ok(h.run(4) === true, "…and ring 3", h.eraseSkippedInland);
  ok(h.eraseSkippedInland.size === 0, "nothing was skipped along the way", [...h.eraseSkippedInland]);
  ok(h.queued.length === 3, "three flips were queued for Save", h.queued.length);
}

console.log("\n-- …one ring at a time, never further than the water has actually reached --");
{
  // ⭐ THE GUARD. Ring 3 must be refused while ring 2 is still land — otherwise the fix has simply stopped
  // checking, and an isolated inland sea is the crash it exists to prevent.
  const h = harness();
  ok(h.run(2) === true, "ring 1 goes");
  ok(h.run(4) === false, "ring 3 is refused while ring 2 is still land", [...h.eraseSkippedInland]);
  ok(h.eraseSkippedInland.has(4), "…and is reported as inland");
  ok(h.run(9) === false, "…and so is the province beyond it");
}

console.log("\n-- the column is still the fast path: only a `false` is second-guessed --");
{
  // A province whose column says coastal is taken at its word without consulting the graph at all, which is
  // what map-data does ("the column is right the overwhelming majority of the time").
  const h = harness();
  const before = h.provinceType.get(2);
  ok(before === "land" && h.run(2) === true, "a column-coastal province needs no neighbour check");
  ok(/pdef\.coastal/.test(fnSrc), "…and the source still consults the column first", fnSrc.slice(0, 200));
  ok(/provNeighborsCache/.test(fnSrc), "…falling back to the province-adjacency graph", fnSrc.slice(0, 200));
}

console.log(`\n=== the erase brush can cut more than one province deep: ${pass} checks, ${fails.length} failed ===`);
fails.forEach((f) => console.log("   FAILED: " + f));
process.exit(fails.length ? 1 : 0);
