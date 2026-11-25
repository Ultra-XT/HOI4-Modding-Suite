// MAP country colour picker (end-to-end): the 🎨 picker beside the Paint dropdown edits the selected
// country's colour in common/countries/colors.txt and recolours the map. Builds a mod with a colours file,
// deep-links the Map to AAA, asserts the picker reflects AAA's current colour, changes it, and verifies the
// colour on disk changed while color_ui + another country are preserved. Run: npm run test:map-country-color
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const mapData = require("./map-data.js");

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
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-colorui-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Colour E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;1;", "2;0;200;0;land;false;plains;1;",
    "3;0;0;200;land;false;plains;1;", "4;200;200;0;sea;false;ocean;0;",
  ].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n');
  // Mod ships its OWN colours file (so the edit is in-place, not a base-seed).
  // ⛔ The fixture's countries are DECLARED, as every country the game loads is. Since 611fe820 the Paint picker offers only tags a
  // common/country_tags file of the mod or a layer below declares, and since 7bd94df7 a deep link's tag becomes the brush only when
  // the picker offers it: ?tag=AAA was refused, the select never read AAA, and the wait for it timed out (final-int, 2026-11-21).
  mk(path.join(mod, "common", "country_tags", "00_e2e_countries.txt"), 'AAA = "countries/AAA.txt"\nBBB = "countries/BBB.txt"\n');
  mk(path.join(mod, "common", "countries", "colors.txt"),
    "AAA = {\n\tcolor = rgb { 10 20 30 }\n\tcolor_ui = rgb { 40 50 60 }\n}\nBBB = {\n\tcolor = rgb { 1 2 3 }\n}\n");
  return mod;
}
const colorsTxt = (mod) => fs.readFileSync(path.join(mod, "common", "countries", "colors.txt"), "utf8");

(async () => {
  console.log("=== MAP country colour picker E2E ===");
  const mod = buildMod();
  const PORT = 3643, BASE = `http://127.0.0.1:${PORT}`;
  const app = createApp();
  const server = await new Promise((res) => { const s = app.listen(PORT, () => res(s)); });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await ctx.addInitScript((m) => { try { localStorage.setItem("activeModPath", m); localStorage.setItem("nova_seen_welcome", "1"); localStorage.setItem("hoi4_help_dismissed", "1"); } catch (_) {} }, mod);
  const page = await ctx.newPage();
  // Auto-dismiss the validate-after-save error overlay: these fixtures use tiny (sub-256) bitmaps,
  // so bmp_bad_dimensions correctly fires after every save and the modal would block all later clicks.
  // Tests assert on DISK BYTES + API responses, not the overlay (e2e-map-fixall.js, which tests the
  // overlay itself, is excluded from this injection).
  await page.addInitScript(() => { const attach = () => { if (!document.documentElement) return setTimeout(attach, 0); new MutationObserver(() => { const o = document.getElementById('mapErrOverlay'); if (o) o.remove(); }).observe(document.documentElement, { childList: true, subtree: true }); }; attach(); });
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e.message || e)));

  try {
    // Deep-link straight to AAA so the picker is populated with its colour.
    await page.goto(`${BASE}/map.html?tag=AAA`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (document.getElementById("mapCountrySelect") || {}).value === "AAA", null, { timeout: 30000 });

    ok("colour picker is enabled when a country is selected", false === await page.evaluate(() => document.getElementById("mapCountryColor").disabled));
    // 10,20,30 → #0a141e
    ok("picker reflects AAA's current colour (#0a141e)", "#0a141e" === (await page.evaluate(() => document.getElementById("mapCountryColor").value)).toLowerCase(), await page.evaluate(() => document.getElementById("mapCountryColor").value));

    // Change AAA's colour via the picker → it STAGES the write (obeys discard now; no immediate disk write).
    await page.evaluate(() => { const i = document.getElementById("mapCountryColor"); i.value = "#ff7700"; i.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.waitForFunction(() => /colour set/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok("status confirms the colour is staged (Save to write)", /🎨 AAA's colour set/i.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)));
    ok("staged: colors.txt NOT changed before Save", JSON.stringify(mapData.parseCountryColors(colorsTxt(mod)).AAA) === JSON.stringify([10, 20, 30]), mapData.parseCountryColors(colorsTxt(mod)).AAA);

    // Save → the staged colour flushes to colors.txt.
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /Saved|stopped|refused/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 20000 });
    const parsed = mapData.parseCountryColors(colorsTxt(mod));
    ok("disk: AAA primary colour is now 255,119,0 after Save", JSON.stringify(parsed.AAA) === JSON.stringify([255, 119, 0]), parsed.AAA);
    ok("disk: AAA color_ui untouched (40,50,60)", /color_ui\s*=\s*rgb\s*\{\s*40 50 60\s*\}/.test(colorsTxt(mod)));
    ok("disk: BBB (other country) untouched", JSON.stringify(parsed.BBB) === JSON.stringify([1, 2, 3]), parsed.BBB);

    // #12 DISCARD-SAFETY (the "stray cyan colour" report): pick a NEW colour but DON'T save → it must never
    // reach colors.txt. (Re-select AAA first; clearing the selection above disabled the picker.)
    await page.evaluate(() => { const s = document.getElementById("mapCountrySelect"); s.value = "AAA"; s.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.evaluate(() => { const i = document.getElementById("mapCountryColor"); i.value = "#00ffff"; i.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.waitForFunction(() => /colour set/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 10000 });
    ok("discard-safety: an unsaved colour is NOT written to colors.txt (stays the last SAVED 255,119,0)", JSON.stringify(mapData.parseCountryColors(colorsTxt(mod)).AAA) === JSON.stringify([255, 119, 0]), mapData.parseCountryColors(colorsTxt(mod)).AAA);

    // Picker is disabled again when no country is selected.
    await page.evaluate(() => { const s = document.getElementById("mapCountrySelect"); s.value = ""; s.dispatchEvent(new Event("change", { bubbles: true })); });
    ok("picker disabled when no country selected", true === await page.evaluate(() => document.getElementById("mapCountryColor").disabled));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-COUNTRY-COLOR-UI E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
