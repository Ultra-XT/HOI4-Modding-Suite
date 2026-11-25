// MAP wheel scrolling (end-to-end): the mouse wheel must SCROLL a floating panel the cursor is over (the
// tool dock, the ⌨ Keys popup, the info panel) instead of zooming the map underneath it. Browsers don't
// scroll on synthetic WheelEvents, so we assert the GUARD: a wheel over a panel is NOT preventDefault'd
// (so native scroll can happen), while a wheel over the bare canvas IS (the map still zooms). Run: npm run test:map-wheel
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const { armMapReady, waitForMapReady } = require("./testlib-map-ready.js");

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
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-wheel-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Wheel E2E"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;", "1;200;0;0;land;false;plains;1;", "2;0;200;0;land;false;plains;1;",
    "3;0;0;200;land;false;plains;1;", "4;200;200;0;sea;false;ocean;0;",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n');
  return mod;
}

(async () => {
  console.log("=== MAP wheel scrolling (panels scroll, canvas zooms) E2E ===");
  const mod = buildMod();
  const PORT = 3663, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
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
    await waitForMapReady(page);

    // Whether a cancelable wheel over a given selector gets preventDefault'd by the map's zoom handler.
    const wheelPrevented = (sel) => page.evaluate((s) => {
      const el = document.querySelector(s); if (!el) return "missing";
      const r = el.getBoundingClientRect();
      const evt = new WheelEvent("wheel", { deltaY: 120, clientX: r.left + Math.min(10, r.width / 2), clientY: r.top + r.height / 2, bubbles: true, cancelable: true });
      el.dispatchEvent(evt);
      return evt.defaultPrevented;
    }, sel);

    ok("wheel over the tool dock is NOT prevented (so it scrolls natively)", (await wheelPrevented("#mapToolPanel button")) === false);
    ok("wheel over the info-show button area / dock root not prevented", (await wheelPrevented("#mapToolPanel")) === false);
    ok("wheel over the bare canvas IS prevented (the map still zooms)", (await wheelPrevented("#mapCanvas")) === true);

    // Open the ⌨ Keys popup and confirm wheel over it scrolls (not prevented).
    await page.click("#mapKeysBtn");
    ok("Keys popup is open", await page.evaluate(() => getComputedStyle(document.getElementById("mapKeysOverlay")).display !== "none"));
    ok("wheel over the Keys popup is NOT prevented (so it scrolls)", (await wheelPrevented("#mapKeysModal")) === false);
    await page.keyboard.press("Escape");

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-WHEEL-SCROLL E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
