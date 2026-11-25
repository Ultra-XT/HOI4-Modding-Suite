// MAP bucket-fill ownership: in Paint mode, Shift+click flood-fills the contiguous blob of provinces
// sharing the clicked province's owner and reassigns them all to the Paint country. Layout (a row):
// 1=AAA 2=AAA 3=CCC(barrier) 4=AAA. Bucket-fill from prov 1 → states 1,2 become CCC; state 4 (AAA but
// across the barrier) stays AAA. Asserts on disk after Save. Run: npm run test:map-bucketfill
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
const ownerOf = (mod, id) => (/owner\s*=\s*([A-Za-z0-9_]+)/.exec(fs.readFileSync(path.join(mod, "history", "states", id + ".txt"), "utf8")) || [])[1];

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-bucket-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Bucket E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(64, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;", "4;200;200;0;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  const st = (id, tag, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = ${tag}\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "AAA", "1"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "AAA", "2"));
  mk(path.join(mod, "history", "states", "3.txt"), st(3, "CCC", "3")); // barrier (different owner)
  mk(path.join(mod, "history", "states", "4.txt"), st(4, "AAA", "4")); // AAA but across the barrier
  // ⛔ The fixture's countries are DECLARED, as every country the game loads is. Since 611fe820 the Paint picker offers only tags a
  // common/country_tags file of the mod or a layer below declares, so CCC was no option and selecting it timed out after 30 s
  // (measured on final-int, 2026-11-21).
  mk(path.join(mod, "common", "country_tags", "00_e2e_countries.txt"), 'AAA = "countries/AAA.txt"\nCCC = "countries/CCC.txt"\n');
  return mod;
}

(async () => {
  console.log("=== MAP BUCKET-FILL ownership E2E ===");
  const mod = buildMod();
  const PORT = 3589, BASE = `http://127.0.0.1:${PORT}`;
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

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready", await mapSawReady(page));

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
    ok("located province 1 (AAA blob)", mids["1"], mids);

    // Paint mode, pick CCC, Shift+click province 1 → flood the contiguous AAA blob (1,2) to CCC.
    await page.click("#mapModePaint");
    await page.selectOption("#mapCountrySelect", "CCC");
    await clickAt(mids["1"], true);
    const saveN = parseInt(await page.evaluate(() => (document.getElementById("mapSaveCount") || {}).textContent), 10);
    ok("bucket-fill staged exactly the 2 contiguous AAA states", saveN === 2, saveN);

    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /✓\s*Saved/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });

    ok("disk: state 1 (AAA) → CCC", ownerOf(mod, 1) === "CCC", ownerOf(mod, 1));
    ok("disk: state 2 (AAA, contiguous) → CCC", ownerOf(mod, 2) === "CCC", ownerOf(mod, 2));
    ok("disk: state 3 (barrier) stays CCC", ownerOf(mod, 3) === "CCC", ownerOf(mod, 3));
    ok("disk: state 4 (AAA but across the barrier) stays AAA — non-contiguous not filled", ownerOf(mod, 4) === "AAA", ownerOf(mod, 4));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-BUCKETFILL E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
