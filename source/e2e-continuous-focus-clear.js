// Continuous-focus box is always CLEAR of focuses, ON the canvas, and BESIDE the tree. continuous_focus_
// position is authored inconsistently across mods (relative to grid 0 vs the tree top-left; some park the
// box far from the tree, or above the canvas origin so it renders off the top) — and the box is draggable
// in-game so authors are loose with it. cfClearedPosition (window.__novaCfClearedPosition) keeps the drawn
// box clear + on-canvas + near the tree, derived from the LIVE layout (any mod incl. vanilla, no hardcode),
// but leaves an already-good authored spot exactly as-is. Builds trees in-page (like e2e-focus-perf).
// Run: npm run test:continuous-focus-clear
"use strict";
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

// A column OFFSET from the origin: grid x=5, rows 5/10/15 — so a box at (0,0) would be off the top-left
// (negative canvas) and a box at x=0 would be left of the tree. (ids on their own line for parseFocuses.)
const TREE = `focus_tree = {
\tid = clear_test
\tcountry = { factor = 0 modifier = { add = 10 tag = GER } }
\tfocus = {
\t\tid = col_a
\t\ticon = GFX_goal_generic_construct_civ_factory
\t\tx = 5
\t\ty = 5
\t}
\tfocus = {
\t\tid = col_b
\t\ticon = GFX_goal_generic_construct_civ_factory
\t\tx = 5
\t\ty = 10
\t}
\tfocus = {
\t\tid = col_c
\t\ticon = GFX_goal_generic_construct_civ_factory
\t\tx = 5
\t\ty = 15
\t}
}
`;

(async () => {
  console.log("=== CONTINUOUS FOCUS box: clear + on-canvas + near the tree ===");
  const PORT = 3747, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  const run = (px, py) => page.evaluate(({ txt, x, y }) => {
    parsed = resolveLayout(parseFocuses(txt));
    updateViewportShiftFromBounds();
    const ox = BASE_OFFSET + viewportShiftX, oy = BASE_OFFSET + viewportShiftY;
    let bbL = 1e9, bbR = -1e9;
    const boxes = (parsed.focuses || []).map((f) => {
      const fx = ox + (f.displayX !== undefined ? f.displayX : (f.x || 0)) * GRID_X;
      const fy = oy + (f.displayY !== undefined ? f.displayY : (f.y || 0)) * GRID_Y;
      bbL = Math.min(bbL, fx); bbR = Math.max(bbR, fx + NODE_WIDTH);
      return { left: fx, top: fy, right: fx + NODE_WIDTH, bottom: fy + NODE_HEIGHT };
    });
    const ov = (p) => { const L = ox + p.x, T = oy + p.y, R = L + 770, B = T + 380; return boxes.filter((b) => L < b.right && R > b.left && T < b.bottom && B > b.top).length; };
    const input = { x, y };
    const result = window.__novaCfClearedPosition(input);
    const L = ox + result.x, T = oy + result.y;
    return { result, overlapAtInput: ov(input), overlapAtResult: ov(result), changed: result.x !== input.x || result.y !== input.y, onCanvas: L >= 0 && T >= 0, nearX: L + 770 > bbL && L < bbR };
  }, { txt: TREE, x: px, y: py });

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__novaCfClearedPosition === "function" && typeof parseFocuses === "function", null, { timeout: 25000 });
    ok("clear-position rule is exposed for testing", true);

    // 1) Box aimed straight at the column (x=5 → 480px, y=10 → 1300px) → overlaps → nudged clear, same x.
    const over = await run(480, 1300);
    ok("an overlapping authored position overlaps to begin with", over.overlapAtInput > 0, over);
    ok("overlap → the box is moved", over.changed === true, over);
    ok("overlap → result clears EVERY focus", over.overlapAtResult === 0, over);
    ok("overlap → keeps the authored x (slides vertically)", over.result.x === 480, over);
    ok("overlap → result stays on-canvas", over.onCanvas === true, over);

    // 2) Box parked off the top-left (0,0 → negative canvas; the free_states/Belarus class) → pulled back
    //    on-canvas, beside the tree, and clear — even though the authored spot itself didn't hit a focus.
    const off = await run(0, 0);
    ok("an off-canvas authored position is repositioned", off.changed === true, off);
    ok("off-canvas → result is ON the canvas (no negative coords)  [free_states fix]", off.onCanvas === true, off);
    ok("off-canvas → result sits beside the tree (x overlaps the tree)  [Belarus fix]", off.nearX === true, off);
    ok("off-canvas → result clears every focus", off.overlapAtResult === 0, off);

    // 3) A clear gap beside the column (grid 5,6 → 480,780; fits between rows 5 and 10) → left UNCHANGED.
    const clear = await run(480, 780);
    ok("a clear position beside the tree has 0 overlap", clear.overlapAtInput === 0, clear);
    ok("a clear position beside the tree is returned UNCHANGED (data respected)", clear.changed === false, clear);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nCONTINUOUS-FOCUS-CLEAR: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
