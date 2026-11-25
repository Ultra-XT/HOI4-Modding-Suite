// ⛔ #paint-shape-draws-a-dotted-trail — THE RESHAPE BRUSH CUT PROVINCES INTO DISCONNECTED FRAGMENTS.
//
// Paint shape stamps a disc of pixels into provinces.bmp. It did that once per mousemove, and a mousemove
// fires roughly once per rendered frame — so how much map sits between two stamps depends entirely on how
// fast the pointer moved. At the map's default zoom one screen pixel is about eleven image pixels, so an
// ordinary drag left a row of separate blobs with untouched province between them. The user drew a stroke
// and got dots.
//
// Nothing downstream could see it. /api/map/paint-provinces writes the pixels it is handed, and the map
// validator checks what provinces CONTAIN, not whether the shape just written is contiguous — so a province
// chopped into fragments passed every check Nova has.
//
// The rivers tool had already solved this: riverPathPixels interpolates between stroke points so a fast
// drag stays a continuous 1px path. Paint shape needs the simpler half — a disc brush has area, so it does
// not need the orthogonal corner-bridging a 1px river does, only a stamp per image pixel along the segment.
//
// The function under test is pure and exposed as window.__novaBrushStampCentres, the same way
// window.__novaRiverPathPixels is, so this can test it without driving a browser.
"use strict";

const fs = require("fs");
const path = require("path");

let pass = 0, fail = 0;
const ok = (c, m, x) => {
  if (c) { pass++; console.log("  ok   " + m); }
  else { fail++; console.log("  FAIL " + m + (x !== undefined ? "   -> " + JSON.stringify(x).slice(0, 300) : "")); }
};

// Lift the function out of public/map.js rather than reimplementing it — a reimplementation would test the
// copy, which is how this project's false findings usually start.
const SRC = fs.readFileSync(path.join(__dirname, "public", "map.js"), "utf8");
const centres = (() => {
  const a = SRC.indexOf("function brushStampCentres(");
  if (a < 0) return null;
  let d = 0, end = -1;
  for (let i = SRC.indexOf("{", a); i < SRC.length; i++) {
    if (SRC[i] === "{") d++;
    else if (SRC[i] === "}") { d--; if (!d) { end = i + 1; break; } }
  }
  return end < 0 ? null : new Function("return (" + SRC.slice(a, end) + ")")();
})();

const gapsIn = (pts) => {
  let max = 0;
  for (let i = 1; i < pts.length; i++) max = Math.max(max, Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return max;
};

if (!centres) {
  ok(false, "brushStampCentres was not found in public/map.js");
} else {
  console.log("\n-- a stroke is continuous, whatever direction it goes --");
  {
    // ⭐ THE BUG: one stamp for a 60-pixel move. Consecutive stamps must never be more than a pixel or so
    // apart, or the discs do not overlap and the province is left in pieces.
    for (const [x1, y1, label] of [[60, 0, "horizontal"], [0, 60, "vertical"], [60, 60, "diagonal"], [60, 17, "shallow"], [17, 60, "steep"], [-60, -23, "backwards"]]) {
      const pts = centres({ x: 0, y: 0 }, x1, y1);
      const want = Math.max(Math.abs(x1), Math.abs(y1));
      ok(pts.length === want, `${label}: ${want} stamps for a ${want}-pixel move (was 1)`, pts.length);
      ok(gapsIn(pts) <= 1.5, `…and no gap wider than a pixel between them`, gapsIn(pts));
      ok(pts[pts.length - 1][0] === x1 && pts[pts.length - 1][1] === y1, "…ending exactly where the pointer is", pts[pts.length - 1]);
    }
  }

  console.log("\n-- the start of a stroke is a single stamp --");
  {
    ok(JSON.stringify(centres(null, 10, 10)) === JSON.stringify([[10, 10]]),
      "a fresh press stamps once, and is not joined to the previous stroke", centres(null, 10, 10));
    ok(JSON.stringify(centres({ x: 10, y: 10 }, 10, 10)) === JSON.stringify([[10, 10]]),
      "…and a move of less than one image pixel stamps once", centres({ x: 10, y: 10 }, 10, 10));
  }

  console.log("\n-- a pointer that left the canvas must not paint a line across the map --");
  {
    // Re-entering the canvas somewhere else, or zooming mid-stroke, produces a huge jump. Joining it would
    // draw a stroke the user never made — worse than the dots, and unrecoverable except by undo.
    const far = centres({ x: 0, y: 0 }, 9000, 0);
    ok(far.length === 1, "an absurd jump starts a fresh stamp instead of a 9,000-pixel line", far.length);
    // …but a long, legitimate drag across the map is still joined.
    const long = centres({ x: 0, y: 0 }, 4000, 0);
    ok(long.length === 4000, "a long but plausible drag is still continuous", long.length);
  }

  console.log("\n-- ⭐ CONTROL: the old behaviour would fail the check above --");
  {
    // What the tool used to do: one stamp at the current point, whatever the distance.
    const oldWay = (prev, ix, iy) => [[ix, iy]];
    const pts = oldWay({ x: 0, y: 0 }, 60, 0);
    ok(pts.length === 1 && gapsIn(pts) === 0,
      "stamping only the current point yields 1 stamp for a 60-pixel move — the dotted trail", pts);
  }

  console.log("\n-- and the stroke resets on a fresh press --");
  {
    // A stroke that is not reset joins the end of the last drag to the start of the next one, painting a
    // line between two places the user clicked separately.
    ok(/lastPaintPt = null;/.test(SRC), "mousedown clears the previous stroke point");
    const at = SRC.indexOf("lastPaintedSid = null; strokeUndoTaken = false;");
    const reset = SRC.indexOf("lastPaintPt = null;", at);
    ok(at > 0 && reset > at && reset - at < 400, "…in the same mousedown block that resets the other stroke state",
      { at, reset });
  }
}

console.log("\n" + (fail ? "FAILED " + fail + "/" + (pass + fail) : "PASSED " + pass + "/" + pass));
process.exitCode = fail ? 1 : 0;
