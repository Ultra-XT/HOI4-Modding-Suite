// MAP Auto-fix DISABLE warning (#2): turning OFF the auto-fix safety net is risky (the editor then won't
// repair crash-causing mistakes on its own), so disabling it must pop a confirm. Turning it back ON needs
// no warning. Drives: toggle ON→ (warn shown, still ON) → Cancel (stays ON) → toggle → Confirm (now OFF) →
// toggle OFF→ON with no warning. Run: npm run test:map-autofix-warn
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
const COL = [[200, 0, 0], [0, 200, 0], [120, 120, 120]];

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-afwarn-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova AFWarn E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\nreplace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(48, 16, (x) => COL[Math.floor(x / 16)]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;", "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;120;120;120;sea;false;ocean;0;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "history", "states", "1.txt"), 'state = {\n\tid = 1\n\tname = "S1"\n\tstate_category = rural\n\tprovinces = { 1 2 }\n\thistory = { owner = AAA }\n}\n');
  mk(path.join(mod, "history", "countries", "AAA.txt"), 'capital = 1\n');
  mk(path.join(mod, "map", "strategicregions", "r.txt"), 'strategic_region={\n\tid=1\n\tname="R1"\n\tprovinces={ 1 2 3 }\n\tweather={}\n}\n');
  mk(path.join(mod, "common", "countries", "colors.txt"), "AAA = {\n\tcolor = rgb { 10 20 30 }\n}\n");
  return mod;
}

const state = (page) => page.evaluate(() => ({
  warnShown: getComputedStyle(document.getElementById("mapAutofixWarn")).display !== "none",
  btn: (document.getElementById("mapAutoFix").textContent || "").trim(),
  ls: localStorage.getItem("nova_map_autofix"),
}));

(async () => {
  console.log("=== MAP AUTO-FIX DISABLE WARNING (#2) ===");
  const mod = buildMod();
  const PORT = 3724, BASE = `http://127.0.0.1:${PORT}`;
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

    let s = await state(page);
    ok("auto-fix starts ON", /ON/.test(s.btn) && s.warnShown === false, s);

    // Click to DISABLE → warning pops, but auto-fix is still ON until confirmed.
    await page.click("#mapAutoFix");
    s = await state(page);
    ok("clicking to disable shows the warning popup", s.warnShown === true, s);
    ok("auto-fix is STILL ON while the warning is open", /ON/.test(s.btn) && s.ls !== "0", s);

    // Cancel ("Keep Auto-fix ON") → stays ON.
    await page.click("#mapAutofixWarnCancel");
    s = await state(page);
    ok("Cancel keeps auto-fix ON", s.warnShown === false && /ON/.test(s.btn) && s.ls !== "0", s);

    // Click to disable again → Confirm ("Turn it off anyway") → now OFF.
    await page.click("#mapAutoFix");
    ok("warning reopens on a second disable attempt", (await state(page)).warnShown === true);
    await page.click("#mapAutofixWarnConfirm");
    s = await state(page);
    ok("Confirm turns auto-fix OFF", s.warnShown === false && /OFF/.test(s.btn) && s.ls === "0", s);

    // Re-enabling needs NO warning.
    await page.click("#mapAutoFix");
    s = await state(page);
    ok("re-enabling auto-fix needs no warning (straight back to ON)", s.warnShown === false && /ON/.test(s.btn) && s.ls === "1", s);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-AUTOFIX-WARN: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
