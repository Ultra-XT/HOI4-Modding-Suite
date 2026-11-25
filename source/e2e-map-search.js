// MAP Find box (smart omni-search, read-only navigation): jump by state id / name, country TAG, or
// province ("p123" / "province 123"). Builds a temp mod and asserts each query selects+centers the right
// state (verified via the info panel's #miState / #miProvince). Run: npm run test:map-search
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

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-search-"));
  fs.mkdirSync(path.join(mod, "map"), { recursive: true });
  fs.mkdirSync(path.join(mod, "history", "states"), { recursive: true });
  fs.writeFileSync(path.join(mod, "descriptor.mod"),
    'name="Nova Search E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n', "utf8");
  fs.writeFileSync(path.join(mod, "map", "provinces.bmp"), bmp24(80, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  const defRows = ["0;0;0;0;land;false;unknown;0;", "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;",
    "3;0;0;200;land;false;plains;3;", "4;200;200;0;land;false;plains;3;", "5;200;0;200;land;false;plains;3;"];
  fs.writeFileSync(path.join(mod, "map", "definition.csv"), defRows.join("\r\n") + "\r\n", "utf8");
  const st = (id, tag, provs) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${provs} }\n\thistory = {\n\t\towner = ${tag}\n\t}\n}\n`;
  fs.writeFileSync(path.join(mod, "history", "states", "1.txt"), st(1, "AAA", "1 2"), "utf8");
  fs.writeFileSync(path.join(mod, "history", "states", "2.txt"), st(2, "BBB", "3 4"), "utf8");
  fs.writeFileSync(path.join(mod, "history", "states", "3.txt"), st(3, "CCC", "5"), "utf8");
  return mod;
}

(async () => {
  console.log("=== MAP FIND (smart search: state/country/province) E2E ===");
  const mod = buildMod();
  const PORT = 3581, BASE = `http://127.0.0.1:${PORT}`;
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

  const miState = () => page.evaluate(() => (document.getElementById("miState") || {}).textContent || "");
  const miProv = () => page.evaluate(() => (document.getElementById("miProvince") || {}).textContent || "");
  const search = async (q) => { await page.fill("#mapFindState", q); await page.press("#mapFindState", "Enter"); await page.waitForTimeout(120); };

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready", await mapSawReady(page));

    await search("2");
    ok("search by state id '2' selects state 2", (await miState()) === "2", await miState());

    await search("STATE_3");
    ok("search by loc-key name 'STATE_3' selects state 3", (await miState()) === "3", await miState());

    await search("BBB");
    ok("search by country tag 'BBB' jumps to its state (2)", (await miState()) === "2", await miState());

    await search("CCC");
    ok("search by country tag 'CCC' jumps to its state (3)", (await miState()) === "3", await miState());

    await search("p 4");
    ok("search 'p 4' selects the state owning province 4 (state 2)", (await miState()) === "2", await miState());
    ok("'p 4' focuses province 4", (await miProv()) === "4", await miProv());

    await search("province 5");
    ok("search 'province 5' selects state 3", (await miState()) === "3", await miState());
    ok("'province 5' focuses province 5", (await miProv()) === "5", await miProv());

    await search("tag:AAA");
    ok("forced 'tag:AAA' jumps to AAA's state (1)", (await miState()) === "1", await miState());

    // A query that matches nothing must not throw or change selection silently to garbage.
    await search("ZZZZ");
    ok("unknown query reports no match", /No state, country, or province/.test(await page.evaluate(() => document.getElementById("mapStatus").textContent)));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-SEARCH E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
