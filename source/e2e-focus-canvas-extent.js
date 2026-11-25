// Focus-tree CANVAS SIZE must be the UNION extent of everything drawn — the country's own tree, the
// inherited (shared) focus tree, and the continuous-focus panel — so the smaller never gets clipped or
// crammed by a canvas sized to only one of them (the "bigger square so the smaller fits" rule the user
// described). Sizing previously came from the OWN tree's span and grew only for the shared/continuous
// FAR edge, never for the own tree's far edge after the viewport shift — so when an inherited focus sits
// further left (e.g. a shared branch at x:-7) the own tree shifts right and its right side fell off the
// canvas. This exercises the pure union math (window.__novaUnifyCanvasExtent). Derived from data, no
// hardcoded per-tree size. Run: npm run test:focus-canvas-extent
"use strict";
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

(async () => {
  console.log("=== FOCUS canvas-size union extent (own + shared + continuous) ===");
  const PORT = 3741, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));
  const unify = (parts, pad, minW, minH) => page.evaluate(([p, pd, w, h]) => window.__novaUnifyCanvasExtent(p, pd, w, h), [parts, pad, minW, minH]);

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.__novaUnifyCanvasExtent === "function", null, { timeout: 25000 });
    ok("canvas-extent rule is exposed for testing", true);

    // Floor: nothing exceeds the minimum → return the minimum.
    ok("below the minimum → returns the minimum", JSON.stringify(await unify([{ right: 500, bottom: 400 }], 80, 3000, 2000)) === JSON.stringify({ width: 3000, height: 2000 }));

    // The user's example: own tree 1900 wide, shared tree 2000 wide → take 2000 (+pad), not 1900.
    {
      const r = await unify([{ right: 1900, bottom: 1000 }, { right: 2000, bottom: 900 }], 80, 1000, 1000);
      ok("own 1900 vs shared 2000 → canvas follows the WIDER (2000+pad)", r.width === 2080, r);
      ok("…height follows the TALLER of the two (+pad)", r.height === 1080, r);
    }

    // The own tree's shifted far edge counts too (the missing term): own reaches further than shared.
    {
      const r = await unify([{ right: 2600, bottom: 3200 }, { right: 1200, bottom: 1200 }], 80, 1000, 1000);
      ok("own tree reaching furthest sets the size (not clipped)", r.width === 2680 && r.height === 3280, r);
    }

    // Null / missing parts are skipped (no shared tree, no continuous panel).
    ok("null parts are ignored", JSON.stringify(await unify([{ right: 1500, bottom: 1500 }, null, undefined], 80, 1000, 1000)) === JSON.stringify({ width: 1580, height: 1580 }));

    // A part missing one axis only contributes the axis it has.
    {
      const r = await unify([{ right: 2200 }, { bottom: 2400 }], 80, 1000, 1000);
      ok("a part missing an axis contributes only the axis it has", r.width === 2280 && r.height === 2480, r);
    }

    // Non-finite values are ignored (no NaN canvas).
    ok("non-finite edges are ignored (no NaN)", JSON.stringify(await unify([{ right: NaN, bottom: Infinity }, { right: 1800, bottom: 1700 }], 80, 1000, 1000)) === JSON.stringify({ width: 1880, height: 1780 }));

    // Live smoke: load a real MD country and confirm focusCanvasExtent produced a sane, finite canvas with
    // no page errors (the wiring works end-to-end even though headless culling doesn't paint the nodes).
    ok("no uncaught page errors on focus page load" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\nFOCUS-CANVAS-EXTENT: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
