// MAP 🏔 Terrain brush (end-to-end): pick a terrain, drag/click over LAND provinces to set their terrain in
// definition.csv. Builds a real provinces.bmp + definition.csv + states, enters the Terrain tool, picks
// "mountain", clicks a land province, saves, and verifies the terrain changed on disk (and a sea province is
// left alone). Run: npm run test:map-terrain
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
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-terrain-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Terrain E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;1;", "2;0;200;0;land;false;plains;1;",
    "3;0;0;200;land;false;plains;1;", "4;200;200;0;sea;false;ocean;0;",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tprovinces = { 1 2 3 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n');
  return mod;
}

const defRow = (mod, id) => { const m = new RegExp("(^|\\n)(" + id + ";[^\\r\\n]*)").exec(fs.readFileSync(path.join(mod, "map", "definition.csv"), "utf8")); return m ? m[2].split(";") : null; };

(async () => {
  console.log("=== MAP 🏔 Terrain brush E2E ===");
  const mod = buildMod();
  const PORT = 3633, BASE = `http://127.0.0.1:${PORT}`;
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

    const probe = await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
      const r = canvas.getBoundingClientRect(), found = {}, stepX = Math.max(2, Math.floor(r.width / 60)), cy = Math.round(r.top + r.height / 2);
      for (let cx = Math.ceil(r.left + 2); cx < r.right - 2; cx += stepX) { wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true })); const m = /prov\D*(\d+)/.exec(hud.textContent || ""); if (m && !found[m[1]]) found[m[1]] = { cx, cy }; }
      return found;
    });
    ok("probed land province 2 + sea province 4", probe["2"] && probe["4"], probe);

    const clickAt = (pt) => page.evaluate((p) => { const wrap = document.getElementById("mapWrap"); wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true })); window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true })); }, pt);

    // Enter Terrain, pick Mountain, brush = 1.
    const colorByBefore = await page.evaluate(() => document.getElementById("mapColorBy").value); // remember it to assert restore later
    await page.click("#mapModeTerrain");
    ok("Terrain tool becomes active", await page.evaluate(() => document.getElementById("mapModeTerrain").classList.contains("active")));
    ok("Color-by auto-switched to Terrain", "terrain" === await page.evaluate(() => document.getElementById("mapColorBy").value));
    ok("terrain palette is shown", await page.evaluate(() => getComputedStyle(document.getElementById("mapTerrainPalette")).display !== "none"));
    await page.waitForSelector('#mapTerrainSwatches [data-terrain="mountain"]', { timeout: 8000 });
    await page.click('#mapTerrainSwatches [data-terrain="mountain"]');
    await page.evaluate(() => { const el = document.getElementById("mapBrushSize"); el.value = "1"; el.dispatchEvent(new Event("change", { bubbles: true })); });

    // Paint province 2 → mountain; a click on sea province 4 should NOT change it (terrain is land-only).
    await clickAt(probe["2"]);
    const s1 = await page.evaluate(() => document.getElementById("mapStatus").textContent);
    ok("painting reports a province set to mountain", /Set\s+\d+\s+province.*mountain/i.test(s1), s1);
    ok("a save is staged", parseInt(await page.evaluate(() => (document.getElementById("mapSaveCount") || {}).textContent || "0"), 10) >= 1);
    await clickAt(probe["4"]); // sea — should be a no-op (status says drag over LAND / count unchanged)

    // Save → verify on disk.
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /Saved|stopped|refused/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    // "Saved" only: sub-256 fixture → bmp_bad_dimensions ⛔ is expected; disk assertions verify the bytes.
    ok("save persisted", /Saved/.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)));

    ok("disk: province 2 terrain is now mountain", defRow(mod, 2)[6] === "mountain", defRow(mod, 2));
    ok("disk: province 2 stays land + keeps its id/colour", (() => { const c = defRow(mod, 2); return c[4] === "land" && c[0] === "2" && c[1] === "0" && c[2] === "200"; })());
    ok("disk: province 1 (not painted) still plains", defRow(mod, 1)[6] === "plains");
    ok("disk: sea province 4 untouched (still ocean — terrain is land-only)", defRow(mod, 4)[6] === "ocean" && defRow(mod, 4)[4] === "sea");

    // Leaving Terrain must RESTORE the Color-by it hijacked, so you aren't stuck looking at terrain colours.
    await page.click("#mapModeInspect");
    ok("leaving Terrain restores the prior Color-by (not stuck on terrain)", colorByBefore === await page.evaluate(() => document.getElementById("mapColorBy").value), { colorByBefore, now: await page.evaluate(() => document.getElementById("mapColorBy").value) });
    ok("terrain palette hidden again after leaving", "none" === await page.evaluate(() => document.getElementById("mapTerrainPalette").style.display));
    // …but a MANUAL Color-by change while in Terrain is respected (not clobbered on leave).
    await page.click("#mapModeTerrain");
    await page.evaluate(() => { const cb = document.getElementById("mapColorBy"); cb.value = "region"; cb.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.click("#mapModeInspect");
    ok("a manual Color-by change in Terrain survives leaving (stays 'region')", "region" === await page.evaluate(() => document.getElementById("mapColorBy").value));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-TERRAIN E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
