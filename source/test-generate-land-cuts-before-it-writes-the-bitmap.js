// ⛔ #a-raised-province-is-cut-to-land-size — WHERE THE CUT SITS IN GENERATE LAND, AND THAT IT ASKS THE ONE SIMPLE-POINT TEST.
//
// The cut must run between the coast step's compute and the ONE provinces.bmp write, so the coast's pixels and the cut's go down in
// one write — written apart, or only the new ids' pixels, they left a real X-crossing. Its write goes definition.csv → provinces.bmp
// → the regions → the adjacencies → the record, and a write that fails puts files back OVER themselves, never deleting one. The state
// layer is cut, halved and owned over the parents, and the pieces join their groups right after the owners are settled — before the
// keep pass, which counts them. And the split's X pass asks the coast step's raster helpers: it carried its own private copy of each,
// which answered the same on every case measured, and two copies of one rule drift. Read off the source with comments and literals
// masked (testlib-strip-comments.js), so this file's own prose and the anchors' comments cannot satisfy it.
// Run: node test-generate-land-cuts-before-it-writes-the-bitmap.js
"use strict";
const fs = require("fs");
const path = require("path");
const { maskJsLiterals, stripJsComments, jsBodyAt } = require("./testlib-strip-comments.js");

let checks = 0;
const fails = [];
const rec = (label, cond, detail) => {
  checks++;
  console.log((cond ? "  ok   " : "  FAIL ") + label + (cond || detail == null ? "" : "   -> " + (typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)));
  if (!cond) fails.push(label);
};
const SRC = fs.readFileSync(path.join(__dirname, "map-data.js"), "utf8");
const CODE = maskJsLiterals(SRC);           // length-preserving: an index here is an index in SRC
const STRIPPED = stripJsComments(SRC);
const all = (code, needle) => { const out = []; for (let i = code.indexOf(needle); i >= 0; i = code.indexOf(needle, i + 1)) out.push(i); return out; };
const body = (name) => { const at = CODE.indexOf(`function ${name}(`); const b = at < 0 ? null : jsBodyAt(CODE, at); return b ? { from: b[0], to: b[1], code: CODE.slice(b[0], b[1] + 1) } : null; };

console.log("\n-- one simple-point test, one X-crossing scan of a raster --");
const simpleFns = [...STRIPPED.matchAll(/function\s+(\w*[Ss]implePoint\w*)\s*\(/g)].map((m) => m[1]);
rec("⭐⭐ map-data.js declares ONE simple-point test", simpleFns.length === 1 && simpleFns[0] === "rasterIsSimplePoint", simpleFns);
const rasterX = [...STRIPPED.matchAll(/function\s+(\w*XCrossings)\s*\(\s*W\s*,\s*H\s*,\s*ids\b/g)].map((m) => m[1]);
rec("⭐ …and ONE X-crossing scan of a raster", rasterX.length === 1 && rasterX[0] === "rasterXCrossings", rasterX);
const clear = body("clearSplitXCrossings"), cut = body("splitProvincesIntoPieces");
rec("⭐ the split's X pass asks both, and the cut asks the scan", !!clear && !!cut && clear.code.includes("rasterIsSimplePoint(") && clear.code.includes("rasterXCrossings(") && cut.code.includes("rasterXCrossings("),
  { clear: !!clear, cut: !!cut });

console.log("\n-- the block's place in Generate land --");
const gl = body("generateLand");
rec("(generateLand's body was found)", !!gl);
if (gl) {
  const at = (needle) => all(gl.code, needle).map((i) => gl.from + i);
  const rough = at("roughenGeneratedCoast("), plan = at("planGeneratedProvinceSplit("), write = at("writeGeneratedProvinceSplit("), bmp = at("writeProvincesRaster(");
  rec("(one coast compute, one plan, one write of the cut, at least one provinces.bmp write)", rough.length === 1 && plan.length === 1 && write.length === 1 && bmp.length >= 1, { rough, plan, write, bmp });
  rec("⭐⭐ the cut sits after the coast's compute and before EVERY provinces.bmp write of the click", rough[0] < plan[0] && plan[0] < write[0] && bmp.every((b) => b > write[0]), { rough, plan, write, bmp });
  const anchor = SRC.indexOf("// ⛔ #a-raised-province-is-cut-to-land-size —", rough[0]);
  rec("…and the block opens with its own ⛔ anchor line, between the two", anchor > rough[0] && anchor < plan[0] && all(SRC.slice(rough[0], plan[0]), "#a-raised-province-is-cut-to-land-size").length >= 1, anchor);
  // the owner passes settle the owners in ONE call (`ownership = …`); the kept-coast block asks assignGeneratedStateOwners too, of each
  // pick alone and before the cut (#a-kept-coast-keeps-its-sea), so EVERY call must come before the join, and the settling one once
  const owners = at("assignGeneratedStateOwners("), settle = at("ownership = assignGeneratedStateOwners("), keep = at("keepEveryCountryBelow("), join = at("familyOf.get(Number(p))");
  rec("⭐ the pieces join their groups after the owners are settled over the parents, and before the keep pass counts them", settle.length === 1 && owners.length >= 1 && keep.length === 1 && join.length === 1 && owners.every((o) => o < join[0]) && join[0] < keep[0], { owners, settle, join, keep });
  const ret = SRC.slice(gl.from, gl.to + 1);
  rec("…and the report carries provinceSplit on its own line, after coasts", /\n\s*coasts,\r?\n(\s*\/\/[^\n]*\r?\n)*\s*provinceSplit,\r?\n/.test(ret));
}

console.log("\n-- the one write --");
const w = body("writeGeneratedProvinceSplit");
rec("(writeGeneratedProvinceSplit's body was found)", !!w);
if (w) {
  const first = (needle) => w.code.indexOf(needle);
  const order = ["safeModWrite(modCsv", "writeProvincesRaster(", "editBlockInDir(", "carryAdjacenciesOverSplit(", "appendProvinceSplitRecord("].map(first);
  rec("⭐ definition.csv, then provinces.bmp, then the regions, then the adjacencies, then the record", order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1])) && all(w.code, "writeProvincesRaster(").length === 1, order);
  const deleting = [...w.code.matchAll(/\b(unlinkSync|rmSync|rmdirSync|unlink|rm|rmdir)\s*\(/g)].map((m) => m[1]);
  rec("⭐⭐ and nothing in it deletes a file: a cut put back is written back OVER", deleting.length === 0 && /catch\s*\(\s*e\s*\)\s*\{[^]*safeModWrite\(\s*d\.file\s*,\s*d\.bytes/.test(w.code), deleting);
}

console.log(`\n=== generate land cuts before it writes the bitmap: ${checks} checks, ${fails.length} failed ===`);
if (fails.length) { fails.forEach((x) => console.log("   FAILED: " + x)); process.exitCode = 1; }
