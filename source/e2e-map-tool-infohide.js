// MAP info-panel ↔ tool: the Inspect info/edit panel (#mapInfo) must HIDE whenever a tool (terrain, paint,
// erase, capital…) is active — a user mistook the still-open side panel for the terrain chooser. It re-shows
// when you return to Inspect and have a province selected. This drives: select a province in Inspect (panel
// shows) → pick a tool (panel hides) → back to Inspect (panel re-shows). Run: npm run test:map-tool-infohide
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const { armMapReady, waitForMapReady } = require("./testlib-map-ready.js");

let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log("  ok  " + n); } else { fail++; console.error("  FAIL " + n + (x !== undefined ? " -> " + JSON.stringify(x) : "")); } };
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

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
const COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [120, 120, 120]];
const provAtX = (x) => Math.floor(x / 16) + 1;

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-infohide-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova InfoHide E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;", "4;120;120;120;sea;false;ocean;0;",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(mod, "history", "countries", "AAA.txt"), 'capital = 1\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n');
  mk(path.join(mod, "common", "countries", "colors.txt"), "AAA = {\n\tcolor = rgb { 10 20 30 }\n}\n");
  return mod;
}

const infoShown = (page) => page.evaluate(() => getComputedStyle(document.getElementById("mapInfo")).display !== "none");

(async () => {
  console.log("=== MAP TOOL INFO-HIDE (side panel hides while a tool is active) ===");
  const mod = buildMod();
  const PORT = 3722, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
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

    // In Inspect, select a province (HUD-probe its screen coords, then click) → the info panel shows.
    const pt = await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
      const r = canvas.getBoundingClientRect(), cy = Math.round(r.top + r.height / 2);
      for (let cx = Math.ceil(r.left + 1); cx < r.right - 1; cx += 2) {
        wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true }));
        if (/prov\D*1\b/.test(hud.textContent || "")) return { cx, cy };
      }
      return null;
    });
    ok("probed province 1 on screen", !!pt, pt);
    await page.evaluate((p) => { const wrap = document.getElementById("mapWrap"); wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true })); window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true })); }, pt);
    await page.waitForFunction(() => getComputedStyle(document.getElementById("mapInfo")).display !== "none", null, { timeout: 8000 }).catch(() => {});
    ok("Inspect + selection: info panel is SHOWN", await infoShown(page));

    // Pick the Terrain tool → the panel hides.
    await page.click("#mapModeTerrain");
    ok("Terrain tool active: info panel is HIDDEN", (await infoShown(page)) === false);

    // Other tools too (Erase, Capital, Paint).
    await page.click("#mapModeErase");
    ok("Erase tool active: info panel stays HIDDEN", (await infoShown(page)) === false);
    await page.click("#mapModeCapital");
    ok("Capital tool active: info panel stays HIDDEN", (await infoShown(page)) === false);

    // Back to Inspect → the panel returns (selection preserved).
    await page.click("#mapModeInspect");
    ok("Back to Inspect: info panel is SHOWN again", await infoShown(page));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-TOOL-INFOHIDE: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
