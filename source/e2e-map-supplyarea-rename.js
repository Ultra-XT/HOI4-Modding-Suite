// MAP supply-area RENAME (#roadmap): a supply area's name="<KEY>" is a localisation key (like regions), so
// renaming writes ONLY localisation, never the crash-prone map files. Builds a temp mod with a named supply
// area, selects a state in it, renames it via ✎, Saves, and verifies the localisation .yml on disk.
// Run: npm run test:map-supplyarea-rename
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
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-saren-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova SupplyRename E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(48, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  mk(path.join(mod, "map", "strategicregions", "r.txt"),
    'strategic_region = { id = 1 name = "STRATEGICREGION_1" provinces = { 1 2 3 } }\n');
  mk(path.join(mod, "map", "supplyareas", "a.txt"),
    'supply_area = { id = 1 name = "SUPPLYAREA_1" value = 3 states = { 1 2 } }\n');
  const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3"));
  return mod;
}
const locPath = (mod) => path.join(mod, "localisation", "english", "nova_supplyarea_names_l_english.yml");
const locText = (mod) => { try { return fs.readFileSync(locPath(mod), "utf8"); } catch (_) { return ""; } };

(async () => {
  console.log("=== MAP supply-area RENAME E2E ===");
  const mod = buildMod();
  const PORT = 3599, BASE = `http://127.0.0.1:${PORT}`;
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
  const clickAt = (pt) => page.evaluate((p) => {
    const wrap = document.getElementById("mapWrap");
    wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true }));
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true }));
  }, pt);
  const probe = () => page.evaluate(() => {
    const wrap = document.getElementById("mapWrap"), canvas = document.getElementById("mapCanvas"), hud = document.getElementById("mapHud");
    const r = canvas.getBoundingClientRect(), cy = Math.round(r.top + r.height / 2), xs = {};
    for (let cx = Math.ceil(r.left + 1); cx < r.right - 1; cx += 1) {
      wrap.dispatchEvent(new MouseEvent("mousemove", { clientX: cx, clientY: cy, bubbles: true }));
      const m = /prov\D*(\d+)/.exec(hud.textContent || ""); if (m) (xs[m[1]] = xs[m[1]] || []).push(cx);
    }
    const mid = {}; for (const k in xs) mid[k] = { cx: xs[k][Math.floor(xs[k].length / 2)], cy };
    return mid;
  });
  const saveCount = () => page.evaluate(() => parseInt((document.getElementById("mapSaveCount") || {}).textContent, 10) || 0);

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready", await mapSawReady(page));

    const mids = await probe();
    ok("located province 1", !!mids["1"], mids);

    // Select province 1 → state 1 → its supply area (area 1) shows in the info panel.
    await clickAt(mids["1"]);
    ok("supply row is shown for the selected state", await page.evaluate(() => (document.getElementById("miSupplyRow") || {}).style.display === "flex"));
    ok("supply selector shows area 1", "1" === (await page.evaluate(() => (document.getElementById("miSupplySel") || {}).value || "")));

    // Open the rename control → input prefilled, then rename.
    await page.click("#miSupplyRename");
    ok("rename row opens", await page.evaluate(() => (document.getElementById("miSupplyRenameRow") || {}).style.display === "flex"));
    await page.fill("#miSupplyRenameInput", "Test Supply Zone");
    await page.click("#miSupplyRenameApply");
    await page.waitForFunction(() => /renamed to/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 8000 });
    ok("rename is staged (Save count > 0)", (await saveCount()) > 0, await saveCount());
    ok("rename row closes after applying", await page.evaluate(() => (document.getElementById("miSupplyRenameRow") || {}).style.display === "none"));
    ok("dropdown shows the new supply-area name", /Test Supply Zone/.test(await page.evaluate(() => document.getElementById("miSupplySel").textContent)));

    // Save → verify the localisation file on disk (NOT the map files).
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /✓\s*Saved/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok('disk: nova_supplyarea_names_l_english.yml has SUPPLYAREA_1 → "Test Supply Zone"',
      /SUPPLYAREA_1:\d*\s+"Test Supply Zone"/.test(locText(mod)), locText(mod));
    ok("the supplyareas file still has the original name key (map file untouched)",
      /name\s*=\s*"SUPPLYAREA_1"/.test(fs.readFileSync(path.join(mod, "map", "supplyareas", "a.txt"), "utf8")));

    // RELOAD → the renamed supply area must STILL show the new name (model re-resolves displayName from the
    // freshly-written loc — proves the loc-cache epoch was invalidated by the write, full round-trip).
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForMapReady(page);
    const mids2 = await probe();
    await clickAt(mids2["1"]);
    await page.waitForFunction(() => /Test Supply Zone/.test((document.getElementById("miSupplySel") || {}).textContent || ""), null, { timeout: 8000 }).catch(() => {});
    ok("after reload the supply area still shows the renamed name (loc round-trip)", /Test Supply Zone/.test(await page.evaluate(() => document.getElementById("miSupplySel").textContent)));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-SUPPLYAREA-RENAME E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
