// MAP heatmaps (read-only data viz): "Color by → Manpower / Factories / Victory points" recolours each
// state cold(blue)→hot(red) by a metric, with a legend. Pure client-side (no writes). This builds a temp
// total-conversion mod with two states of very different metrics, loads map.html, switches each heat mode
// and asserts (a) the legend appears with the right title + max, and (b) the high-metric province renders
// HOTTER (redder) than the low-metric one. Run: node e2e-map-heatmap.js (npm run test:map-heatmap)
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const { armMapReady, waitForMapReady, mapSawReady } = require("./testlib-map-ready.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };

function bmp24(width, height, pixelFn) {
  const rowSize = (width * 3 + 3) & ~3, imageSize = rowSize * height;
  const buf = Buffer.alloc(54 + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(54 + imageSize, 2); buf.writeUInt32LE(54, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34);
  for (let y = 0; y < height; y++) {
    let off = 54 + (height - 1 - y) * rowSize;
    for (let x = 0; x < width; x++) { const [r, g, b] = pixelFn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; }
  }
  return buf;
}
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0]];
const provAtX = (x) => Math.floor(x / 16) + 1;

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-heat-"));
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"),
    'name="Nova Heat E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n', "utf8");
  fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  const defRows = ["0;0;0;0;land;false;unknown;0;", "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;",
    "3;0;0;200;land;false;plains;3;", "4;200;200;0;sea;false;ocean;0;"];
  fs.writeFileSync(path.join(mod, "map", "definition.csv"), defRows.join("\r\n") + "\r\n", "utf8");
  // State 1 = HOT on every metric; State 2 = cold/none.
  fs.writeFileSync(path.join(mod, "history", "states", "1-Hot.txt"),
    'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tmanpower = 1000000\n\tprovinces = { 1 2 }\n' +
    '\thistory = {\n\t\towner = AAA\n\t\tvictory_points = { 1 20 }\n\t\tbuildings = {\n\t\t\tindustrial_complex = 8\n\t\t\tarms_factory = 2\n\t\t}\n\t}\n}\n', "utf8");
  fs.writeFileSync(path.join(mod, "history", "states", "2-Cold.txt"),
    'state = {\n\tid = 2\n\tname = "STATE_2"\n\tstate_category = rural\n\tmanpower = 1000\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = BBB\n\t}\n}\n', "utf8");
  return mod;
}

(async () => {
  console.log("=== MAP HEATMAPS (color-by data) E2E ===");
  const mod = buildMod();
  const PORT = 3578, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  await armMapReady(page);
  // Auto-dismiss the validate-after-save error overlay: these fixtures use tiny (sub-256) bitmaps,
  // so bmp_bad_dimensions correctly fires after every save and the modal would block all later clicks.
  // Tests assert on DISK BYTES + API responses, not the overlay (e2e-map-fixall.js, which tests the
  // overlay itself, is excluded from this injection).
  await page.addInitScript(() => { const attach = () => { if (!document.documentElement) return setTimeout(attach, 0); new MutationObserver(() => { const o = document.getElementById('mapErrOverlay'); if (o) o.remove(); }).observe(document.documentElement, { childList: true, subtree: true }); }; attach(); });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  // Read an RGB pixel from the VISIBLE canvas at a client point (canvas is same-origin → not tainted).
  const pixelAt = (cx, cy) => page.evaluate(({ cx, cy }) => {
    const cv = document.getElementById("mapCanvas"), r = cv.getBoundingClientRect();
    const sx = Math.round((cx - r.left) * (cv.width / r.width)), sy = Math.round((cy - r.top) * (cv.height / r.height));
    const g = cv.getContext("2d").getImageData(sx, sy, 1, 1).data;
    return [g[0], g[1], g[2]];
  }, { cx, cy });

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready", await mapSawReady(page));

    // Find the MIDPOINT screen x of each province along the centre row (interior pixel, avoids borders).
    const mids = await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
      const r = canvas.getBoundingClientRect(), cy = Math.round(r.top + r.height / 2);
      const xs = {}; // pid -> [cx,...]
      for (let cx = Math.ceil(r.left + 1); cx < r.right - 1; cx += 1) {
        wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true }));
        const m = /prov\D*(\d+)/.exec(hud.textContent || ""); if (m) (xs[m[1]] = xs[m[1]] || []).push(cx);
      }
      const mid = {}; for (const k in xs) mid[k] = { cx: xs[k][Math.floor(xs[k].length / 2)], cy };
      return mid;
    });
    ok("located province 1 (hot state) + province 3 (cold state)", mids["1"] && mids["3"], mids);

    const legend = () => page.evaluate(() => {
      const el = document.getElementById("mapLegend");
      return { shown: el && el.style.display !== "none", title: (document.getElementById("mapLegendTitle") || {}).textContent || "", max: (document.getElementById("mapLegendMax") || {}).textContent || "" };
    });

    // owner mode first: legend must be hidden.
    await page.selectOption("#mapColorBy", "owner");
    await page.waitForTimeout(150);
    ok("legend hidden in non-heat (owner) mode", !(await legend()).shown);

    const cases = [
      { mode: "heat_manpower", title: "Population", max: "1,000,000" },
      { mode: "heat_factories", title: "Factories", max: "10" },
      { mode: "heat_victory", title: "Victory points", max: "20" },
    ];
    for (const c of cases) {
      await page.selectOption("#mapColorBy", c.mode);
      await page.waitForTimeout(200);
      const lg = await legend();
      ok(`${c.mode}: legend visible`, lg.shown, lg);
      ok(`${c.mode}: legend title = ${c.title}`, lg.title.includes(c.title), lg);
      ok(`${c.mode}: legend max = ${c.max}`, lg.max.replace(/\s/g, "") === c.max, lg);
      const hot = await pixelAt(mids["1"].cx, mids["1"].cy);
      const cold = await pixelAt(mids["3"].cx, mids["3"].cy);
      ok(`${c.mode}: high-metric province renders HOTTER (redder) than low`, hot[0] > cold[0] + 30 && hot[2] < cold[2] + 6, { hot, cold });
    }

    // Back to owner: legend hides again.
    await page.selectOption("#mapColorBy", "owner");
    await page.waitForTimeout(150);
    ok("legend hidden again after returning to owner mode", !(await legend()).shown);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-HEATMAP E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
