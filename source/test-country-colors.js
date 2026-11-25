// parseCountryColors turns common/countries/colors.txt into the {TAG:[r,g,b]} the Map editor paints with.
// HOI4 writes country colour four ways — `rgb {…}`, `hsv {h s v}` (0–1 floats), `hsv360 {h s v}`, and a
// bare `color = {…}` (HSV if every value ≤1, else RGB). A bug in the hsv→rgb math or the bare-form heuristic
// silently mis-colours a whole nation on the map. test-map-data.js covers rgb + one pure-red hsv; this locks
// the rest: hsv360, the cardinal hues, the bare-form heuristic both ways, clamping, and color_ui being ignored.
"use strict";
const { parseCountryColors } = require("./map-data.js");

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, e != null ? "→ " + e : ""); } };
// Wrap a `color = …` line in a valid 2–4 char tag block and return the parsed [r,g,b].
const col = (colorLine) => parseCountryColors(`ZZZ = { ${colorLine} }`).ZZZ;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// hsv (0–1) cardinal hues → pure R/G/B.
check("hsv 0,1,1 → red", eq(col(`color = hsv { 0 1 1 }`), [255, 0, 0]), JSON.stringify(col(`color = hsv { 0 1 1 }`)));
check("hsv 0.3333,1,1 → green", eq(col(`color = hsv { 0.33333 1 1 }`), [0, 255, 0]), JSON.stringify(col(`color = hsv { 0.33333 1 1 }`)));
check("hsv 0.6667,1,1 → blue", eq(col(`color = hsv { 0.66667 1 1 }`), [0, 0, 255]), JSON.stringify(col(`color = hsv { 0.66667 1 1 }`)));

// hsv360 (degrees) → same cardinal hues (the longer keyword must win the regex over `hsv`).
check("hsv360 0 → red", eq(col(`color = hsv360 { 0 1 1 }`), [255, 0, 0]), JSON.stringify(col(`color = hsv360 { 0 1 1 }`)));
check("hsv360 120 → green", eq(col(`color = hsv360 { 120 1 1 }`), [0, 255, 0]), JSON.stringify(col(`color = hsv360 { 120 1 1 }`)));
check("hsv360 240 → blue", eq(col(`color = hsv360 { 240 1 1 }`), [0, 0, 255]), JSON.stringify(col(`color = hsv360 { 240 1 1 }`)));

// value/saturation respected: hsv(0,0,0.5) → mid grey ~128.
{
  const g = col(`color = hsv { 0 0 0.5 }`);
  check("hsv 0,0,0.5 → mid grey (r=g=b≈128)", g && g[0] === g[1] && g[1] === g[2] && g[0] >= 126 && g[0] <= 129, JSON.stringify(g));
}

// rgb is taken verbatim and CLAMPED to 0–255 on the high side (real colors.txt is always non-negative).
check("rgb verbatim", eq(col(`color = rgb { 12 34 56 }`), [12, 34, 56]));
check("rgb clamps overflow to 255", eq(col(`color = rgb { 300 1000 128 }`), [255, 255, 128]), JSON.stringify(col(`color = rgb { 300 1000 128 }`)));

// bare `color = {…}` heuristic: all values ≤1 → treat as HSV; otherwise RGB.
check("bare all-≤1 → HSV (0 1 1 → red)", eq(col(`color = { 0 1 1 }`), [255, 0, 0]), JSON.stringify(col(`color = { 0 1 1 }`)));
check("bare with a value >1 → RGB", eq(col(`color = { 200 10 10 }`), [200, 10, 10]), JSON.stringify(col(`color = { 200 10 10 }`)));

// color_ui is ignored when the primary color is present (the FIRST `color` wins).
check("uses color, not color_ui", eq(col(`color = rgb { 1 2 3 }\n\tcolor_ui = rgb { 9 9 9 }`), [1, 2, 3]), JSON.stringify(col(`color = rgb { 1 2 3 }\n\tcolor_ui = rgb { 9 9 9 }`)));

// Multiple tags parsed independently.
{
  const all = parseCountryColors(`GER = { color = rgb { 10 20 30 } }\nFRA = { color = hsv360 { 240 1 1 } }`);
  check("two tags parsed independently", eq(all.GER, [10, 20, 30]) && eq(all.FRA, [0, 0, 255]), JSON.stringify(all));
}

// A tag with no colour → absent, no throw.
check("a tag with no color is skipped (no throw)", parseCountryColors(`GER = { something = 1 }`).GER === undefined);

console.log(`\nCOUNTRY-COLORS TEST: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
