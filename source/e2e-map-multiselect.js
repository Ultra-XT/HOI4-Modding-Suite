// MAP multi-select + bulk edit (slice 1): shift-click selects MULTIPLE states; "Set owner → Paint
// country" reassigns them all in one undoable batch through the deferred Save path. Builds a temp mod,
// shift-clicks two states, bulk-sets their owner, saves, and asserts BOTH on disk. Run: npm run test:map-multiselect
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
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0], [200, 0, 200]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-multi-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Multi E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(80, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;",
    "4;200;200;0;land;false;plains;3;", "5;200;0;200;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  const st = (id, tag, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = ${tag}\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "AAA", "1 2"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "BBB", "3 4"));
  mk(path.join(mod, "history", "states", "3.txt"), st(3, "CCC", "5"));
  // ⛔ The fixture's countries are DECLARED, as every country the game loads is. Since 611fe820 the Paint picker offers only tags a
  // common/country_tags file of the mod or a layer below declares, so CCC was no option and selecting it timed out after 30 s
  // (measured on final-int, 2026-11-21).
  mk(path.join(mod, "common", "country_tags", "00_e2e_countries.txt"), 'AAA = "countries/AAA.txt"\nBBB = "countries/BBB.txt"\nCCC = "countries/CCC.txt"\n');
  return mod;
}
const ownerOf = (mod, id) => (/owner\s*=\s*([A-Za-z0-9_]+)/.exec(fs.readFileSync(path.join(mod, "history", "states", id + ".txt"), "utf8")) || [])[1];

(async () => {
  console.log("=== MAP MULTI-SELECT + BULK OWNER E2E ===");
  const mod = buildMod();
  const PORT = 3583, BASE = `http://127.0.0.1:${PORT}`;
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

  const clickAt = (pt, shift) => page.evaluate(({ p, shift }) => {
    const wrap = document.getElementById("mapWrap");
    wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: p.cx, clientY: p.cy, bubbles: true, shiftKey: !!shift }));
    window.dispatchEvent(new MouseEvent("mouseup", { clientX: p.cx, clientY: p.cy, bubbles: true, shiftKey: !!shift }));
  }, { p: pt, shift });
  const barShown = () => page.evaluate(() => document.getElementById("mapMultiBar").style.display !== "none");
  const count = () => page.evaluate(() => (document.getElementById("mapMultiCount") || {}).textContent);

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready", await mapSawReady(page));
    ok("multi-select bar hidden initially", !(await barShown()));

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
    ok("located provinces 1 (state1) + 3 (state2)", mids["1"] && mids["3"], mids);

    // Shift-click two provinces in different states → both states selected.
    await clickAt(mids["1"], true);
    await clickAt(mids["3"], true);
    ok("multi-select bar appears", await barShown());
    ok("two states are selected", (await count()) === "2", await count());

    // Bulk-assign owner CCC to the selection, then Save → both states' files updated.
    await page.selectOption("#mapCountrySelect", "CCC");
    await page.click("#mapMultiSetOwner");
    const saveN = await page.evaluate(() => (document.getElementById("mapSaveCount") || {}).textContent);
    ok("two owner edits staged", parseInt(saveN, 10) === 2, saveN);
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /✓\s*Saved/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });

    ok("disk: state 1 owner is now CCC", ownerOf(mod, 1) === "CCC", ownerOf(mod, 1));
    ok("disk: state 2 owner is now CCC", ownerOf(mod, 2) === "CCC", ownerOf(mod, 2));
    ok("disk: state 3 owner unchanged (CCC)", ownerOf(mod, 3) === "CCC", ownerOf(mod, 3));

    // A plain (no-shift) click clears the multi-selection.
    await clickAt(mids["1"], false);
    ok("plain click clears the multi-selection (bar hidden)", !(await barShown()));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-MULTISELECT E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
