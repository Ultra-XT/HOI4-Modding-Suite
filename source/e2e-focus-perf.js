// Focus-tree performance: viewport culling (B) + geometry-only zoom (A). On a large tree, only the
// nodes near the viewport should be painted (display!=="none"); panning reveals more and lays them out
// at the current zoom; a small tree is never culled. Builds the tree IN-PAGE (parseFocuses) so there's
// no /api/load dependency or startup auto-load race. Run: node e2e-focus-perf.js (npm run test:focus-perf)
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

const PORT = 3571;
const BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

// Build a focus_tree string with N focuses laid out on a wide grid (id on its own line, as parseFocuses expects).
function perfTree(n, perRow) {
  let t = "focus_tree = {\n\tid = perf_tree\n\tcountry = { factor = 0 modifier = { add = 5 tag = TST } }\n";
  for (let i = 0; i < n; i++) t += `\tfocus = {\n\t\tid = perf_${i}\n\t\ticon = GFX_goal_generic_construct_civ_factory\n\t\tx = ${(i % perRow) * 2}\n\t\ty = ${Math.floor(i / perRow) * 2}\n\t\tcost = 5\n\t}\n`;
  return t + "}\n";
}

(async () => {
  console.log("=== FOCUS PERF (culling + geometry-only zoom) E2E ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 850 } });
  // Fresh context → empty localStorage → no startup auto-load to race with our in-page render.
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  // A 1x1 transparent PNG — give every focus a resolvable iconUrl so the >280-node LAZY icon path engages
  // (so the culling reveal-loads-icon fix is actually exercised, not skipped as "no icon").
  const ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  // Render an in-page tree of `n` focuses and return node stats.
  const render = (n, perRow) => page.evaluate(({ txt, icon }) => {
    parsed = resolveLayout(parseFocuses(txt));
    parsed.focuses.forEach((f) => { f.iconUrl = icon; f.iconKey = "GFX_perf_test"; f.iconSource = "asset"; });
    sourceText = txt; cfState = null; sharedFocuses = [];
    if (document.querySelector(".canvas-scroll")) { document.querySelector(".canvas-scroll").scrollLeft = 0; document.querySelector(".canvas-scroll").scrollTop = 0; }
    viewScale = 1;
    renderFocuses();
    return parsed.focuses.length;
  }, { txt: perfTree(n, perRow), icon: ICON });
  const stats = () => page.evaluate(() => {
    const all = [...document.querySelectorAll(".node:not(.node--shared)")];
    return { total: all.length, visible: all.filter((n) => n.style.display !== "none").length };
  });

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof parseFocuses === "function" && typeof renderFocuses === "function" && document.getElementById("canvas"), { timeout: 15000 });
    await page.waitForTimeout(2500); // let the page's own init/auto-load settle before we render in-page

    // --- Large tree: culling active ---
    const parsedN = await render(300, 14);
    ok(parsedN === 300, "300-focus tree parsed in-page", parsedN);
    // wait for the chunked render to FINISH (all 300 nodes) AND culling to apply (some display:none)
    await page.waitForFunction(() => { const a = [...document.querySelectorAll(".node:not(.node--shared)")]; return a.length === 300 && a.some((n) => n.style.display === "none"); }, { timeout: 12000 }).catch(() => {});
    const big = await stats();
    ok(big.total === 300, "all 300 nodes exist in the DOM", big);
    ok(big.visible < big.total, "viewport culling: only on-screen nodes painted", big);
    ok(big.visible > 0 && big.visible < 200, "a sensible subset is painted (not all, not none)", big);

    // --- Pan reveals culled nodes AND lays them out at the current scale ---
    await page.evaluate(() => { const sc = document.querySelector(".canvas-scroll"); sc.scrollLeft += 1500; sc.scrollTop += 1500; });
    await page.waitForTimeout(400);
    const rev = await page.evaluate(() => {
      const v = [...document.querySelectorAll(".node:not(.node--shared)")].filter((n) => n.style.display !== "none");
      const s = v.find((n) => n.querySelector(".node-icon"));
      return { count: v.length, iconW: s ? (s.querySelector(".node-icon") || {}).style.width : "" };
    });
    ok(rev.count > 0, "panning reveals nodes in the new region", rev);
    ok(/^\d+(\.\d+)?px$/.test(rev.iconW), "revealed nodes are laid out at the current scale (icon sized)", rev);
    // Regression: revealed nodes must have their (lazy) icon LOADED — the IntersectionObserver misses
    // display:none→"" toggles, so culling now loads it directly. No revealed node should be left blank.
    const icons = await page.evaluate(() => {
      const v = [...document.querySelectorAll(".node:not(.node--shared)")].filter((n) => n.style.display !== "none");
      return { visible: v.length, pendingLazy: v.filter((n) => { const im = n.querySelector(".node-icon"); return im && im.dataset.lazySrc; }).length, withSrc: v.filter((n) => { const im = n.querySelector(".node-icon"); return im && im.getAttribute("src"); }).length };
    });
    ok(icons.pendingLazy === 0, "revealed nodes have no blank/pending icons (culling loads them)", icons);
    ok(icons.withSrc === icons.visible, "every revealed node's icon src is set", icons);

    // --- Geometry-only zoom keeps culling + doesn't throw ---
    const zoomErr = await page.evaluate(() => { try { setZoom(0.6); setZoom(1.4); setZoom(1); return ""; } catch (e) { return String(e && e.message || e); } });
    ok(zoomErr === "", "geometry-only zoom runs without error", zoomErr);
    await page.waitForTimeout(400);
    const afterZoom = await stats();
    ok(afterZoom.total === 300 && afterZoom.visible < afterZoom.total, "still culled after zoom (count stable)", afterZoom);

    // --- Small tree: never culled ---
    await render(20, 6);
    await page.waitForTimeout(800);
    const small = await stats();
    ok(small.total === 20 && small.visible === 20, "small tree (<150) is not culled — all painted", small);

    ok(errs.length === 0, "no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""));
  } catch (e) {
    ok(false, "threw: " + (e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) { console.error(`\ne2e-focus-perf: ${failed} FAILED`); process.exit(1); }
  console.log("\ne2e-focus-perf: all checks passed");
})();
