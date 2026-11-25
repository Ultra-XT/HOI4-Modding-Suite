// MAP modal dismissal (end-to-end): every action modal (Generate land, Delete map, New country) must close
// on Escape AND on clicking the dim backdrop — but NOT when clicking inside the dialog box. Matches the ⌨
// Keys popup, so dismissal is consistent everywhere. Run: npm run test:map-modal-close
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
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-modalclose-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Modal Close E2E"\nreplace_path="history/states"\nreplace_path="map"\nreplace_path="map/strategicregions"\n');
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
  console.log("=== MAP modal dismissal (Esc + backdrop) E2E ===");
  const mod = buildMod();
  const PORT = 3665, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
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

  const disp = (id) => page.evaluate((i) => getComputedStyle(document.getElementById(i)).display, id);
  const clickBackdrop = (id) => page.evaluate((i) => { const ov = document.getElementById(i); ov.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); }, id);
  const clickInside = (id) => page.evaluate((i) => { const box = document.getElementById(i).querySelector("div"); box.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); }, id);

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page);

    // ── Generate land: Esc closes ──
    await page.click("#mapGenerateLand");
    ok("Generate modal opens", (await disp("mapGenConfirm")) === "flex");
    await clickInside("mapGenConfirm");
    ok("clicking inside the Generate dialog keeps it open", (await disp("mapGenConfirm")) === "flex");
    await page.keyboard.press("Escape");
    ok("Escape closes the Generate modal", (await disp("mapGenConfirm")) === "none");

    // ── Delete map: backdrop closes ──
    await page.click("#mapDeleteMap");
    ok("Delete-map modal opens", (await disp("mapBlankConfirm")) === "flex");
    await clickBackdrop("mapBlankConfirm");
    ok("clicking the backdrop closes the Delete-map modal", (await disp("mapBlankConfirm")) === "none");
    // reopen + Esc
    await page.click("#mapDeleteMap");
    await page.keyboard.press("Escape");
    ok("Escape closes the Delete-map modal too", (await disp("mapBlankConfirm")) === "none");

    // ── New country: claim a state, open, Esc closes (even though focus is in the tag input) ──
    await page.click("#mapModeNewcountry");
    const probe = await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
      const r = canvas.getBoundingClientRect(), cy = Math.round(r.top + r.height / 2);
      for (let cx = Math.ceil(r.left + 2); cx < r.right - 2; cx += Math.max(2, Math.floor(r.width / 50))) { wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true })); if (/land/.test(hud.textContent || "")) return { cx, cy }; }
      return null;
    });
    if (probe) { await page.evaluate((p) => { const wrap = document.getElementById("mapWrap"); wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true })); window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true })); }, probe); }
    await page.click("#mapNewCountryCreateBtn");
    ok("New-country modal opens after claiming", (await disp("mapNewCountryModal")) === "flex");
    await page.focus("#mapNewCountryTag"); // focus an input inside the modal
    await page.keyboard.press("Escape");
    ok("Escape closes the New-country modal even while typing in its field", (await disp("mapNewCountryModal")) === "none");

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-MODAL-CLOSE E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
