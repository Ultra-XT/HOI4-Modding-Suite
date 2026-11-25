// MAP marquee (rubber-band) multi-select: Shift+drag a box in Inspect mode → every state whose centroid
// is inside the box joins the multi-selection (then the bulk bar applies). Builds a mod with 5 spread-out
// states, shift-drags a box over the left few, and asserts 2+ got selected. Run: npm run test:map-marquee
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
  for (let y = 0; y < height; y++) { let off = 54 + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) { const [r, g, b] = pixelFn(x, y); buf[off++] = b; buf[off++] = g; buf[off++] = r; } }
  return buf;
}
// 5 stripes (16px each) → 5 single-province states, well spread across the width.
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0], [200, 0, 200]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-marq-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Marquee E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(80, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;",
    "4;200;200;0;land;false;plains;3;", "5;200;0;200;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  for (let i = 1; i <= 5; i++) mk(path.join(mod, "history", "states", i + ".txt"),
    `state = {\n\tid = ${i}\n\tname = "STATE_${i}"\n\tstate_category = rural\n\tprovinces = { ${i} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`);
  return mod;
}

(async () => {
  console.log("=== MAP MARQUEE (rubber-band multi-select) E2E ===");
  const mod = buildMod();
  const PORT = 3587, BASE = `http://127.0.0.1:${PORT}`;
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

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready", await mapSawReady(page));

    // Find the screen x of provinces 1 and 3 (the box will span 1..3 along the centre row).
    const mids = await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
      const r = canvas.getBoundingClientRect(), cy = Math.round(r.top + r.height / 2), xs = {};
      for (let cx = Math.ceil(r.left + 1); cx < r.right - 1; cx += 1) {
        wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true }));
        const m = /prov\D*(\d+)/.exec(hud.textContent || ""); if (m) (xs[m[1]] = xs[m[1]] || []).push(cx);
      }
      const mid = {}; for (const k in xs) mid[k] = { cx: xs[k][Math.floor(xs[k].length / 2)], cy };
      return mid;
    });
    ok("located provinces 1 and 3", mids["1"] && mids["3"], mids);

    // Shift+drag a box from just left of province 1 to just right of province 3, around the centre row.
    const box = { x0: mids["1"].cx - 20, y0: mids["1"].cy - 40, x1: mids["3"].cx + 20, y1: mids["3"].cy + 40 };
    await page.evaluate((b) => {
      const wrap = document.getElementById("mapWrap");
      wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: b.x0, clientY: b.y0, shiftKey: true, bubbles: true }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: (b.x0 + b.x1) / 2, clientY: (b.y0 + b.y1) / 2, shiftKey: true, buttons: 1, bubbles: true }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: b.x1, clientY: b.y1, shiftKey: true, buttons: 1, bubbles: true }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: b.x1, clientY: b.y1, shiftKey: true, bubbles: true }));
    }, box);

    const count = parseInt(await page.evaluate(() => (document.getElementById("mapMultiCount") || {}).textContent), 10);
    ok("marquee selected at least 2 states", count >= 2, count);
    ok("the multi-select bar is shown", await page.evaluate(() => document.getElementById("mapMultiBar").style.display !== "none"));

    // A plain click (no shift) clears the marquee selection.
    await page.evaluate((b) => {
      const wrap = document.getElementById("mapWrap");
      wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: b.x0, clientY: b.y0, bubbles: true }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: b.x0, clientY: b.y0, bubbles: true }));
    }, box);
    ok("plain click clears the marquee selection", await page.evaluate(() => document.getElementById("mapMultiBar").style.display === "none"));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-MARQUEE E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
