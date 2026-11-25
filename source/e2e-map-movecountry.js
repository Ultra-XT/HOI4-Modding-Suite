// MAP 🚚 Move country (EXPERIMENTAL pixel-drag) end-to-end: render a real provinces.bmp, enter Move-country
// mode, DRAG a country's land to a new spot, confirm the experimental warning, and verify the country's pixels
// actually moved on provinces.bmp (the file changed) via the POST → reload flow. Pixel-level correctness + the
// wiped-province auto-clean are covered by the unit test test-map-drag-country.js. Run: npm run test:map-movecountry
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
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
// province 1 (AAA land) left; province 3 (BBB land) middle; province 2 (sea) is open ocean to drag into.
const provAtX = (x) => (x < 24 ? 1 : x < 36 ? 3 : 2);
const COL = { 1: [200, 0, 0], 2: [0, 0, 200], 3: [0, 200, 0] };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-movec-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova MoveCountry E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(72, 16, (x) => COL[provAtX(x)]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;1;", "2;0;0;200;sea;false;ocean;0;", "3;0;200;0;land;false;plains;1;",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tprovinces = { 1 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  mk(path.join(mod, "history", "states", "3.txt"), 'state = {\n\tid = 3\n\tname = "STATE_3"\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = BBB\n\t}\n}\n');
  mk(path.join(mod, "history", "countries", "AAA.txt"), 'capital = 1\n');
  mk(path.join(mod, "history", "countries", "BBB.txt"), 'capital = 3\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 }\n\tweather={}\n}\n');
  return mod;
}

(async () => {
  console.log("=== MAP 🚚 Move country (experimental pixel-drag) E2E ===");
  // SKIPPED BY DESIGN: the Move-country tool is deliberately DISABLED in the UI (its button tooltip:
  // "temporarily disabled — it can scatter province pixels and break the map"), so driving it e2e can
  // only time out on the disabled button. The pixel-drag logic itself stays covered by the unit test
  // test-map-drag-country.js. Re-enable this e2e when the tool ships again.
  console.log("  SKIP — Move-country is intentionally disabled in the UI; unit coverage lives in test-map-drag-country.js");
  console.log("\nMAP-MOVECOUNTRY E2E: skipped (tool disabled by design)");
  process.exit(0);
  // eslint-disable-next-line no-unreachable
  const mod = buildMod();
  const PORT = 3629, BASE = `http://127.0.0.1:${PORT}`;
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
    await waitForMapReady(page);
    ok("map reaches Ready", await mapSawReady(page));

    const bmpBefore = fs.readFileSync(path.join(mod, "map", "provinces.bmp"));

    // Probe a screen point over AAA's land (province 1).
    const probe = await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
      const r = canvas.getBoundingClientRect(), found = {}, stepX = Math.max(2, Math.floor(r.width / 70)), cy = Math.round(r.top + r.height / 2);
      for (let cx = Math.ceil(r.left + 2); cx < r.right - 2; cx += stepX) { wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true })); const m = /prov\D*(\d+)/.exec(hud.textContent || ""); if (m && !found[m[1]]) found[m[1]] = { cx, cy }; }
      return found;
    });
    ok("UI hit-tests province 1 (AAA's land)", !!probe["1"], probe);

    // Regression guard: select a DIFFERENT country (BBB) in the paint dropdown — dragging AAA's land must
    // still move AAA (the country you grabbed wins over the dropdown).
    await page.evaluate(() => { const s = document.getElementById("mapCountrySelect"); if (s) { s.value = "BBB"; s.dispatchEvent(new Event("change", { bubbles: true })); } });

    // Enter Move-country mode and DRAG AAA's land to the right (into the ocean).
    await page.click("#mapModeMovecountry");
    ok("Move-country tool becomes active", await page.evaluate(() => document.getElementById("mapModeMovecountry").classList.contains("active")));
    await page.evaluate((p) => {
      const wrap = document.getElementById("mapWrap");
      wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: p.cx + 60, clientY: p.cy, bubbles: true }));
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: p.cx + 140, clientY: p.cy, bubbles: true }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx + 140, clientY: p.cy, bubbles: true }));
    }, probe["1"]);

    // The experimental confirm appears, naming the country picked from the drag-start province's owner.
    ok("confirm modal opens after the drag", await page.evaluate(() => getComputedStyle(document.getElementById("mapMoveCountryConfirm")).display !== "none"));
    ok("confirm names the country (AAA)", /AAA/.test(await page.evaluate(() => document.getElementById("mapMoveCountryMsg").textContent)));

    // Confirm → POST → reload.
    const moveResp = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/api/map/drag-country"), { timeout: 15000 });
    await page.click("#mapMoveCountryConfirmBtn");
    const resp = await moveResp; const body = await resp.json().catch(() => ({}));
    ok("drag-country POST succeeded + moved pixels", resp.status() === 200 && body.ok === true && body.movedPixels > 0, { status: resp.status(), body });
    ok("the move was rightward (positive dx)", body.dx > 0, body.dx);
    ok("the DRAGGED country (AAA) moved, not the dropdown's (BBB)", body.tag === "AAA", body.tag);
    // The move result + damage report survives the reload as the FINAL status (regression: load() doneMsg).
    await page.waitForFunction(() => /Moved\s+AAA\s+by/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok("the move result/damage status persists past the reload", /Moved\s+AAA\s+by/i.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)));

    // Disk: provinces.bmp actually changed (the country's pixels relocated).
    const bmpAfter = fs.readFileSync(path.join(mod, "map", "provinces.bmp"));
    ok("provinces.bmp changed on disk (pixels moved)", !bmpBefore.equals(bmpAfter));
    // AAA's far-left pixel (well inside its old land) should now be sea (province 1 slid right, source backfilled).
    const pixel = (buf, x, y) => { const off = buf.readUInt32LE(10) + (16 - 1 - y) * ((72 * 3 + 3) & ~3) + x * 3; return [buf[off + 2], buf[off + 1], buf[off]]; };
    ok("AAA's old far-left pixel is now ocean (it moved away + backfilled)", JSON.stringify(pixel(bmpAfter, 1, 8)) === JSON.stringify(COL[2]), pixel(bmpAfter, 1, 8));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-MOVECOUNTRY E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
