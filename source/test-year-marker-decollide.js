// Regression (bug-hunt #6): free year markers get no collision guard, so a user can drag one exactly onto
// another. resolveYearMarkersForApply then emits two instantTextBoxType blocks at the SAME game pixel and
// in-game the second label is hidden behind the first (silent visual loss). decollideYearMarkers spreads
// same-pixel/DIFFERENT-text markers apart while leaving same-text stacks and distinct-pixel markers untouched.
// This test runs the ACTUAL shipped function source extracted from public/research.js (it is browser-only, no
// module.exports — so we brace-match it out of the file and eval it, guaranteeing we test the real bytes).
// Run: node test-year-marker-decollide.js
"use strict";
const fs = require("fs"), path = require("path");
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  PASS", n); } else { fail++; console.log("  FAIL", n, x != null ? "→ " + JSON.stringify(x) : ""); } };

// ── extract `function decollideYearMarkers(...) { … }` from the shipped source by brace-matching ──
const src = fs.readFileSync(path.join(__dirname, "public", "research.js"), "utf8");
const start = src.indexOf("function decollideYearMarkers(");
if (start < 0) { console.log("  FAIL could not locate decollideYearMarkers in research.js"); process.exit(1); }
const bodyOpen = src.indexOf("{", start);
let depth = 0, end = -1;
for (let i = bodyOpen; i < src.length; i++) {
  const c = src[i];
  if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) { end = i + 1; break; } }
}
const fnSrc = src.slice(start, end);
// The function reads YEAR_LABEL_DEFAULT_PX — the size an un-resized year marker shows at, shared with the
// resize handle and the toolbar so they cannot drift from each other (#year-label-click-resizes). Extracting
// the function alone leaves that out of scope, so lift the declaration out of the SAME source rather than
// hardcoding the number here, which would just move the drift into this file.
const declM = /const YEAR_LABEL_DEFAULT_PX = (\d+);/.exec(src);
if (!declM) { console.log("  FAIL could not find YEAR_LABEL_DEFAULT_PX in research.js"); process.exit(1); }
const YEAR_LABEL_DEFAULT_PX = Number(declM[1]);
// eslint-disable-next-line no-eval
const decollideYearMarkers = eval("(" + fnSrc + ")");

try {
  ok("extracted a function", typeof decollideYearMarkers === "function");

  // CASE 1 — the bug: same pixel, DIFFERENT year (horizontal ruler) → spread along y; first stays put
  {
    const m = [{ id: "a", year: 1936, x: 300, y: 200, fontSize: 13, h: 16 }, { id: "b", year: 1940, x: 300, y: 200, fontSize: 13, h: 16 }];
    decollideYearMarkers(m, false);
    ok("case1: markers no longer share a pixel", m[0].x !== m[1].x || m[0].y !== m[1].y, m);
    ok("case1: first marker unmoved (exact placement preserved)", m[0].x === 300 && m[0].y === 200);
    ok("case1: second nudged on y (cross axis), x unchanged", m[1].x === 300 && m[1].y > 200, m[1]);
  }

  // CASE 2 — intentional same-number stack: same pixel, SAME year → untouched
  {
    const m = [{ id: "a", year: 1936, x: 300, y: 200, h: 16 }, { id: "b", year: 1936, x: 300, y: 200, h: 16 }];
    decollideYearMarkers(m, false);
    ok("case2: same-year overlap left as-is (feature preserved)", m[1].x === 300 && m[1].y === 200, m[1]);
  }

  // CASE 3 — normal distinct pixels → never moved (hardened transform preserved)
  {
    const m = [{ id: "a", year: 1936, x: 300, y: 200, h: 16 }, { id: "b", year: 1940, x: 450, y: 200, h: 16 }];
    decollideYearMarkers(m, false);
    ok("case3: distinct-pixel markers unchanged", m[0].x === 300 && m[0].y === 200 && m[1].x === 450 && m[1].y === 200, m);
  }

  // CASE 4 — vertical ruler: same pixel, different year → nudge x (cross), era (y) preserved
  {
    const m = [{ id: "a", year: 1936, x: 50, y: 130, h: 16 }, { id: "b", year: 1940, x: 50, y: 130, h: 16 }];
    decollideYearMarkers(m, true);
    ok("case4: vertical nudges x (cross axis)", m[0].x !== m[1].x, m);
    ok("case4: vertical preserves era (y) for both", m[0].y === 130 && m[1].y === 130, m);
  }

  // CASE 5 — three different years on one pixel → all three end distinct
  {
    const m = [{ id: "a", year: 1936, x: 300, y: 200, h: 16 }, { id: "b", year: 1940, x: 300, y: 200, h: 16 }, { id: "c", year: 1944, x: 300, y: 200, h: 16 }];
    decollideYearMarkers(m, false);
    const ys = m.map((x) => x.y);
    ok("case5: three distinct-year markers all end on distinct pixels", new Set(ys).size === 3, ys);
  }

  // CASE 6 — gap uses box height when present, else a sane minimum (never 0 → always separates)
  {
    const m = [{ id: "a", year: 1936, x: 10, y: 10 }, { id: "b", year: 1940, x: 10, y: 10 }]; // no h, no fontSize
    decollideYearMarkers(m, false);
    ok("case6: separates even without h/fontSize (min gap)", m[1].y - m[0].y >= 12, [m[0].y, m[1].y]);
  }
} catch (e) { fail++; console.log("  FAIL threw →", e && e.stack || e); }

console.log(`\nYEAR-MARKER-DECOLLIDE: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
