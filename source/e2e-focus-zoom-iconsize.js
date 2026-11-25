// Focus-tree zoom icon-size (#1): on a SMALL tree (no culling — e.g. most vanilla per-country trees), the
// geometry-only zoom resized the node BOXES but never re-ran the pixel layout of the inner icon/title, so
// zooming OUT shrank the box yet left the icon/title at the old size → focuses looked HUGE on zoom-out
// (only on small trees, i.e. "only when vanilla is active"). This renders a small tree, reads the focus icon
// size at 100%, zooms to 50%, and asserts the icon scaled down with the box. Run: npm run test:focus-zoom-iconsize
const { chromium } = require("playwright");
const { createApp } = require("./server.js");

const PORT = 3566, BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
const ok = (c, m, x) => { if (c) console.log("  ok  " + m); else { console.error("  FAIL " + m + (x !== undefined ? " -> " + JSON.stringify(x) : "")); failed++; } };

// A small tree (8 focuses, well under the 150-node culling threshold).
function smallTree(n) {
  let t = "focus_tree = {\n\tid = zt\n\tcountry = { factor = 0 modifier = { add = 10 tag = GER } }\n";
  for (let i = 0; i < n; i++) t += `\tfocus = {\n\t\tid = zf_${i}\n\t\ticon = GFX_goal_generic_construct_civ_factory\n\t\tx = ${(i % 4) * 2}\n\t\ty = ${Math.floor(i / 4) * 2}\n\t\tcost = 5\n\t}\n`;
  return t + "}\n";
}
const ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

(async () => {
  console.log("=== FOCUS ZOOM ICON-SIZE (#1: small-tree zoom shrinks the icon, not just the box) ===");
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 850 } });
  await ctx.addInitScript(() => { try { localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  // Read a visible focus node's icon width + its box width (px numbers).
  const sizes = () => page.evaluate(() => {
    const n = [...document.querySelectorAll(".node:not(.node--shared)")].find((x) => x.style.display !== "none" && x.querySelector(".node-icon"));
    if (!n) return null;
    const icon = n.querySelector(".node-icon");
    return { box: parseFloat(n.style.width) || 0, icon: parseFloat(icon.style.width) || 0, scale: viewScale };
  });

  try {
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof parseFocuses === "function" && typeof renderFocuses === "function" && document.getElementById("canvas"), { timeout: 15000 });
    await page.waitForTimeout(2000); // let the page's own init settle

    await page.evaluate(({ txt, icon }) => {
      parsed = resolveLayout(parseFocuses(txt));
      parsed.focuses.forEach((f) => { f.iconUrl = icon; f.iconKey = "GFX_zt"; f.iconSource = "asset"; });
      sourceText = txt; cfState = null; sharedFocuses = [];
      viewScale = 1; renderFocuses();
    }, { txt: smallTree(8), icon: ICON });
    await page.waitForFunction(() => { const n = [...document.querySelectorAll(".node:not(.node--shared)")].find((x) => x.querySelector(".node-icon")); return n && parseFloat(n.querySelector(".node-icon").style.width) > 0; }, { timeout: 12000 });

    const at100 = await sizes();
    ok(!!at100, "a focus node with an icon rendered at 100%", at100);
    ok(at100.scale === 1 && Math.abs(at100.icon - 96) < 2, "at 100% the icon is ~96px (full size)", at100);

    // Zoom out to 50%.
    await page.evaluate(() => setZoom(0.5));
    await page.waitForTimeout(300);
    const at50 = await sizes();
    ok(at50 && Math.abs(at50.scale - 0.5) < 0.01, "zoomed to 50%", at50);
    // THE FIX: the icon must scale down with the box (~48px), not stay at ~96px.
    ok(at50 && Math.abs(at50.icon - 48) < 4, "at 50% the icon shrank to ~48px (scales with zoom, not stuck big)", at50);
    ok(at50 && Math.abs(at50.box - 96 * 0.5 * (165 / 96)) < 6 || (at50 && at50.box < at100.box), "the node box also shrank", at50);
    // proportion sanity: icon/box ratio is preserved across zoom.
    ok(at50 && at100 && Math.abs((at50.icon / at50.box) - (at100.icon / at100.box)) < 0.05, "icon-to-box ratio preserved across zoom", { r100: at100.icon / at100.box, r50: at50.icon / at50.box });

    ok(errs.length === 0, "no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""));
  } catch (e) {
    ok(false, "threw: " + (e && e.stack ? e.stack : e));
  } finally {
    await browser.close();
    server.close();
  }
  if (failed) { console.error(`\nfocus-zoom-iconsize: ${failed} FAILED`); process.exit(1); }
  console.log("\nfocus-zoom-iconsize: all checks passed");
})();
