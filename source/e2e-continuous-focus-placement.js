// Continuous-focus PANEL placement (#3): the panel is positioned from the tree's continuous_focus_position,
// which is in HOI4 ENGINE PIXELS at the GUI's focus_spacing — VERIFIED 96×130 in both vanilla and Millennium
// Dawn's interface/nationalfocusview.gui. Nova used a mis-measured 120 px/cell on X, so the panel sat ~20%
// off horizontally relative to the focuses. This asserts cfPosToCanvas converts at 96 (x) / 130 (y): moving
// the position by one focus_spacing cell moves the canvas placement by exactly one GRID cell (96 / 130 px).
// Run: npm run test:continuous-focus-placement
"use strict";
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== CONTINUOUS-FOCUS PLACEMENT (96×130 focus_spacing conversion) ===");
  const PORT = 3726, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__novaCfPosToCanvas === "function" && typeof viewScale !== "undefined", null, { timeout: 20000 });

    // Force a known zoom so the px math is exact, then measure the conversion deltas.
    const r = await page.evaluate(() => {
      viewScale = 1; // 1:1 so 1 grid cell = GRID px on canvas
      const c = (x, y) => window.__novaCfPosToCanvas({ x, y });
      const base = c(0, 0);
      return {
        dxOneCell: c(96, 0).left - base.left,   // +1 focus_spacing cell on X
        dyOneCell: c(0, 130).top - base.top,    // +1 focus_spacing cell on Y
        dxThreeCells: c(288, 0).left - base.left, // +3 cells on X (288 = 3×96)
      };
    });
    ok("position is exposed for testing", true);
    // 96 px of continuous_focus_position == one GRID_X (96) on canvas at 1:1 (the OLD 120 would give ~76.8).
    ok("one focus_spacing cell on X moves the panel by GRID_X (96px), not 120-based ~77px", Math.abs(r.dxOneCell - 96) <= 1, r.dxOneCell);
    ok("one focus_spacing cell on Y moves the panel by GRID_Y (130px)", Math.abs(r.dyOneCell - 130) <= 1, r.dyOneCell);
    ok("placement is linear: 3 cells (288px) == 3×96 = 288px on canvas", Math.abs(r.dxThreeCells - 288) <= 2, r.dxThreeCells);

    // Wiki: continuous_focus_position = { x = 0 y = 0 } (BOTH zero) resets to the default → parse returns null
    // so the palette/default takes over (instead of pinning the panel to the canvas origin).
    const parse = (txt) => page.evaluate((t) => window.__novaParseTreeContinuousPosition(t), txt);
    ok("both-zero continuous_focus_position → null (resets to default)", (await parse("continuous_focus_position = { x = 0 y = 0 }")) === null);
    ok("no continuous_focus_position → null", (await parse("focus_tree = { id = x }")) === null);
    const brazil = await parse("continuous_focus_position = { x = 0 y = 1500 }");
    ok("x=0 but y!=0 (e.g. Brazil) is kept, not reset", brazil && brazil.x === 0 && brazil.y === 1500, brazil);
    const def = await parse("continuous_focus_position = { x = 50 y = 1000 }");
    ok("a real position (50,1000) is kept", def && def.x === 50 && def.y === 1000, def);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nCONTINUOUS-FOCUS-PLACEMENT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
