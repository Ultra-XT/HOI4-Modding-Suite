// MAP deep-link (end-to-end): other tabs (Country Setup) open the Map focused on a country + tool via
// query params — map.html?tag=GER&tool=capital. Verifies the brush is pre-loaded with the tag, the named
// tool is activated, the view centres on the country, and that a PLAIN load (no params) does none of that.
// This is the plumbing every "edit this on the Map" redirect rides on. Run: npm run test:map-deeplink
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const { armMapReady, waitForMapReady, mapSawReady, mapStatusSeen } = require("./testlib-map-ready.js");

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
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-deeplink-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Deeplink E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), [
    "0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;1;", "2;0;200;0;land;false;plains;1;",
    "3;0;0;200;land;false;plains;1;", "4;200;200;0;sea;false;ocean;0;",
  ].join("\r\n") + "\r\n");
  // AAA owns state 1 (prov 1,2). BBB owns state 2 (prov 3). AAA's capital is state 1.
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "STATE_1"\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n');
  mk(path.join(mod, "history", "states", "2.txt"), 'state = {\n\tid = 2\n\tname = "STATE_2"\n\tstate_category = rural\n\tprovinces = { 3 }\n\thistory = {\n\t\towner = BBB\n\t}\n}\n');
  mk(path.join(mod, "history", "countries", "AAA.txt"), 'capital = 1\noob = "AAA_1936"\n');
  // ⛔ AAA and BBB are DECLARED, as every country the game loads is. Since 7bd94df7 a deep link's tag becomes the brush only when the
  // Paint picker offers it, and the picker offers only tags a common/country_tags file of the mod or a layer below declares: this
  // fixture declared none, so ?tag=AAA was refused, the select never read AAA, and every scenario timed out (measured on final-int,
  // 2026-11-21). No colour is given to either on purpose: a deep-linked country with no colour is the render-tail path round 2's
  // review broke (syncCountryColorInput), which the latch wait after each goto below must catch.
  mk(path.join(mod, "common", "country_tags", "00_e2e_countries.txt"), 'AAA = "countries/AAA.txt"\nBBB = "countries/BBB.txt"\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="REGION_1"\n\tprovinces={ 1 2 3 4 }\n\tweather={}\n}\n');
  return mod;
}

(async () => {
  console.log("=== MAP deep-link E2E ===");
  const mod = buildMod();
  const PORT = 3641, BASE = `http://127.0.0.1:${PORT}`;
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
    // 1) Deep-link with a tag + tool.
    await page.goto(`${BASE}/map.html?tag=AAA&tool=capital`, { waitUntil: "domcontentloaded" });
    // ⛔ THROUGH THE LATCH, as every map e2e waits. Waiting for the select's value alone missed a load that failed AFTER the jump:
    // the review of 2eb5886f made syncCountryColorInput throw for a deep-linked country with no colour, in the render's tail
    // right after applyDeepLink wrote "→ AAA …", and the log check below still found that jump line after Ready, so the test
    // passed while the map lay on "Render error: …" (the screen re-read this replaced had failed it). waitForMapReady throws
    // on a load that failed after it began, naming the line.
    await waitForMapReady(page);
    await page.waitForFunction(() => (document.getElementById("mapCountrySelect") || {}).value === "AAA", null, { timeout: 30000 });
    ok("?tag=AAA pre-loads the paint brush with AAA", "AAA" === await page.evaluate(() => document.getElementById("mapCountrySelect").value));
    ok("&tool=capital activates the Set-capital tool", await page.evaluate(() => document.getElementById("mapModeCapital").classList.contains("active")));
    // The jump line is read from the latch's log, not off the screen: like Ready, it is a transient line. The rivers overlay's
    // "🌊 Rivers overlay on." replaces it as soon as the rivers PNG decodes (about 55 ms later on the base game's, under 3 ms on a
    // tiny one, #map-ready-lasts-a-millisecond), so a re-read passed only while it won that race. The log also says WHERE it came:
    // applyDeepLink runs in the render's tail, so the jump line follows the Ready line of the same load.
    const seen1 = await mapStatusSeen(page);
    const ready1 = seen1.findIndex((t) => /\bReady\b/.test(t)), jump1 = seen1.findIndex((t) => /^→\s*AAA\b/.test(t));
    ok("view centres on the country (status reports the jump, after Ready)", ready1 >= 0 && jump1 > ready1, seen1);

    // 2) A tag the dropdown didn't already have is still selectable (option appended).
    await page.goto(`${BASE}/map.html?tag=BBB&tool=paint`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page);
    await page.waitForFunction(() => (document.getElementById("mapCountrySelect") || {}).value === "BBB", null, { timeout: 30000 });
    ok("?tag=BBB&tool=paint selects BBB + activates Paint", await page.evaluate(() => document.getElementById("mapCountrySelect").value === "BBB" && document.getElementById("mapModePaint").classList.contains("active")));

    // 3) An unknown/garbage tool is ignored (no crash, stays on default Inspect), tag still applies.
    await page.goto(`${BASE}/map.html?tag=AAA&tool=not_a_real_tool`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page);
    await page.waitForFunction(() => (document.getElementById("mapCountrySelect") || {}).value === "AAA", null, { timeout: 30000 });
    ok("an unknown tool name is ignored (stays on Inspect, no crash)", await page.evaluate(() => document.getElementById("mapModeInspect").classList.contains("active") && !document.getElementById("mapModeCapital").classList.contains("active")));

    // 4) A PLAIN load applies NO deep-link.
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page);
    ok("plain load: brush stays empty (no deep-link)", "" === await page.evaluate(() => document.getElementById("mapCountrySelect").value));
    ok("plain load: stays on Inspect (no tool forced)", await page.evaluate(() => document.getElementById("mapModeInspect").classList.contains("active")));
    ok("plain load: normal Ready status, and no deep-link \"→\" line after it", (await mapSawReady(page)) && !(await mapStatusSeen(page)).some((t) => /^→/.test(t)), await mapStatusSeen(page));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-DEEPLINK E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
