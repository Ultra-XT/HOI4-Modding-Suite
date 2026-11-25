// MAP rivers OVERLAY (3a) + PAINT (3b): the editor can overlay map/rivers.bmp (an 8-bit indexed bitmap) on the
// map AND paint river pixels into it. Builds a temp mod with a SYNTHETIC 8-bit indexed rivers.bmp, loads the
// map, checks the /api/map/rivers-info + /rivers-png endpoints and the 🌊 Rivers toggle, then enters the Rivers
// paint tool, picks the Source swatch, clicks the canvas — and asserts the stroke is STAGED, not written: no
// rivers-paint POST fires, rivers.bmp on disk is untouched, and the 💾 Save button lights with a pending count
// (rivers used to save immediately, bypassing the staged-until-Save model every other tool uses). Only after
// clicking 💾 Save does it flush, and we assert ON DISK that ONLY the painted pixel changed to the chosen
// palette index while the BMP header + 256-colour palette are byte-for-byte unchanged. (Pixel correctness of the
// patch is also covered by the unit test test-map-rivers.js.) Run: npm run test:map-rivers
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const { armMapReady, waitForMapReady, mapSawReady } = require("./testlib-map-ready.js");
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
// 8-bit indexed BMP. palette: index→{r,g,b}; indexFn(x,y)→palette index.
function bmp8(width, height, palette, indexFn) {
  const rowSize = (width + 3) & ~3, imageSize = rowSize * height, dataOffset = 54 + 256 * 4;
  const buf = Buffer.alloc(dataOffset + imageSize);
  buf.write("BM", 0, "ascii");
  buf.writeUInt32LE(buf.length, 2); buf.writeUInt32LE(dataOffset, 10); buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18); buf.writeInt32LE(height, 22); buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(8, 28); buf.writeUInt32LE(0, 30); buf.writeUInt32LE(imageSize, 34); buf.writeUInt32LE(256, 46);
  for (let i = 0; i < 256; i++) { const c = palette[i] || { r: 0, g: 0, b: 0 }; const o = 54 + i * 4; buf[o] = c.b; buf[o + 1] = c.g; buf[o + 2] = c.r; buf[o + 3] = 0; }
  for (let y = 0; y < height; y++) { const row = dataOffset + (height - 1 - y) * rowSize; for (let x = 0; x < width; x++) buf[row + x] = indexFn(x, y) & 0xff; }
  return buf;
}
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rivers-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova Rivers E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(48, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  // A synthetic rivers.bmp: index 0 = green land, 1 = cyan river. Row 8 is a horizontal river.
  const PAL = []; PAL[0] = { r: 0, g: 255, b: 0 }; PAL[1] = { r: 0, g: 255, b: 255 }; PAL[2] = { r: 255, g: 0, b: 0 };
  mk(path.join(mod, "map", "rivers.bmp"), bmp8(48, 16, PAL, (x, y) => (y === 8 ? 1 : 0)));
  const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3"));
  return mod;
}

(async () => {
  console.log("=== MAP rivers OVERLAY (3a) + PAINT (3b) E2E ===");
  const mod = buildMod();
  const PORT = 3604, BASE = `http://127.0.0.1:${PORT}`;
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
    // Not a re-read of #mapStatus: rivers are on by default, and on this fixture's own tiny rivers.bmp "🌊 Rivers overlay on."
    // replaces Ready about a millisecond later. The latch is what the page wrote, not what is on screen now.
    ok("map reaches Ready", await mapSawReady(page));

    // /api/map/rivers-info reports the bmp size + palette.
    const info = await page.evaluate((m) => fetch("/api/map/rivers-info?modPath=" + encodeURIComponent(m)).then((r) => r.json()), mod);
    ok("rivers-info: ok with 48x16 dims", info.ok && info.width === 48 && info.height === 16, info);
    ok("rivers-info: palette index 1 is the cyan river (0,255,255)", info.palette && info.palette[1] && info.palette[1].r === 0 && info.palette[1].g === 255 && info.palette[1].b === 255, info.palette && info.palette[1]);

    // /api/map/rivers-png returns a real PNG image.
    const png = await page.evaluate((m) => fetch("/api/map/rivers-png?modPath=" + encodeURIComponent(m)).then(async (r) => ({ type: r.headers.get("content-type"), bytes: [...new Uint8Array((await r.arrayBuffer()).slice(0, 8))] })), mod);
    ok("rivers-png: served as image/png", /image\/png/.test(png.type || ""), png.type);
    ok("rivers-png: starts with the PNG magic bytes", JSON.stringify(png.bytes) === JSON.stringify([137, 80, 78, 71, 13, 10, 26, 10]), png.bytes);

    // The 🌊 Rivers toggle (inside the Layers dropdown) loads the overlay (status confirms). Rivers is ON by
    // default now, so toggle OFF then ON to exercise the overlay (re)load and land on the "overlay on" status.
    await page.click("#mapLayersBtn");
    await page.click("#mapRivers"); // off
    await page.click("#mapRivers"); // on → (re)loads the overlay
    await page.waitForFunction(() => /Rivers overlay on/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 8000 });
    ok("toggling 🌊 Rivers loads the overlay", await page.evaluate(() => document.getElementById("mapRivers").checked));

    // ── Slice 3b: RIVERS PAINT. Enter the Rivers tool, pick the Source swatch (index 2, distinct from land=0 and
    // river=1), brush=1 (single pixel), click the canvas centre, save → assert on disk. ──
    const riversPath = path.join(mod, "map", "rivers.bmp");
    const origBuf = fs.readFileSync(riversPath);
    const origMeta = mapData.readIndexedBmp(origBuf);

    // Capture the exact pixels the UI POSTs so we can read those bytes back off disk (the front↔back contract).
    let paintBody = null;
    page.on("request", (req) => {
      if (req.method() === "POST" && req.url().includes("/api/map/rivers-paint")) {
        try { paintBody = JSON.parse(req.postData() || "{}"); } catch (_) {}
      }
    });

    await page.click("#mapModeRivers");
    await page.waitForFunction(() => /Rivers/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 8000 });
    // Swatches are built from /api/map/rivers-info; wait for the Source swatch (red, palette index 2) to appear.
    await page.waitForSelector('#mapRiversSwatches [data-river-idx="2"]', { timeout: 8000 });
    await page.click('#mapRiversSwatches [data-river-idx="2"]');
    ok("Rivers palette renders a swatch for index 2", true);

    // ── Palette classification (wiki-verified scheme) against the REAL standard HOI4 palette. The classifier
    // is a pure fn exposed for testing; feed it the documented 12-colour palette + grey land/white sea. ──
    const stdPal = [
      { r: 0, g: 255, b: 0 }, { r: 255, g: 0, b: 0 }, { r: 255, g: 252, b: 0 },           // 0 source, 1 flow-in, 2 flow-out
      { r: 0, g: 225, b: 255 }, { r: 0, g: 200, b: 255 }, { r: 0, g: 150, b: 255 }, { r: 0, g: 100, b: 255 }, // 3-6 small
      { r: 0, g: 0, b: 255 }, { r: 0, g: 0, b: 225 }, { r: 0, g: 0, b: 200 }, { r: 0, g: 0, b: 150 }, { r: 0, g: 0, b: 100 }, // 7-11 large
    ];
    while (stdPal.length < 254) stdPal.push({ r: 2, g: 0, b: 1 });
    stdPal[254] = { r: 122, g: 122, b: 122 }; stdPal[255] = { r: 255, g: 255, b: 255 }; // land grey, sea white
    const cls = await page.evaluate((p) => window.__novaClassifyRiverPalette(p).map((it) => ({ i: it.i, role: it.role, label: it.label })), stdPal);
    const byRole = (r) => cls.filter((it) => it.role === r);
    ok("classifier: SOURCE is green index 0 (not red — the old bug)", byRole("source").length === 1 && byRole("source")[0].i === 0, byRole("source"));
    ok("classifier: flow-IN is red index 1", byRole("flowin").length === 1 && byRole("flowin")[0].i === 1, byRole("flowin"));
    ok("classifier: flow-OUT is yellow index 2", byRole("flowout").length === 1 && byRole("flowout")[0].i === 2, byRole("flowout"));
    ok("classifier: erase is the grey land index 254 (not the green source)", byRole("erase").length === 1 && byRole("erase")[0].i === 254, byRole("erase"));
    ok("classifier: 4 SMALL rivers (indices 3-6)", JSON.stringify(byRole("small").map((it) => it.i)) === JSON.stringify([3, 4, 5, 6]), byRole("small"));
    ok("classifier: 5 LARGE rivers (indices 7-11)", JSON.stringify(byRole("large").map((it) => it.i)) === JSON.stringify([7, 8, 9, 10, 11]), byRole("large"));
    ok("classifier: the widest LARGE river is labelled the 'giant' (index 11)", (byRole("large").slice(-1)[0] || {}).i === 11 && /giant/i.test((byRole("large").slice(-1)[0] || {}).label || ""), byRole("large").slice(-1));
    ok("classifier: the white SEA (255) is never offered as a paint action", !cls.some((it) => it.i === 255), cls.map((it) => it.i));

    // ── River PATH must be 1px wide AND orthogonally connected (HOI4: 1px thick, no diagonal connections —
    // a thick band / diagonal-only path is exactly what rendered as the in-game black scribbles). ──
    const rpath = await page.evaluate(() => window.__novaRiverPathPixels(2, 2, 20, 9)); // a shallow diagonal drag
    const ortho = rpath.every((p, n) => n === 0 || (Math.abs(p[0] - rpath[n - 1][0]) + Math.abs(p[1] - rpath[n - 1][1]) === 1));
    ok("river path: every step is orthogonal (no diagonal-only connection)", ortho, rpath.slice(0, 6));
    ok("river path: starts and ends exactly on the drag endpoints", rpath[0][0] === 2 && rpath[0][1] === 2 && rpath[rpath.length - 1][0] === 20 && rpath[rpath.length - 1][1] === 9, [rpath[0], rpath[rpath.length - 1]]);
    // 1px wide = no 2x2 filled block anywhere along the path.
    const set = new Set(rpath.map((p) => p[0] + "," + p[1]));
    const has2x2 = rpath.some((p) => set.has(p[0] + "," + p[1]) && set.has((p[0] + 1) + "," + p[1]) && set.has(p[0] + "," + (p[1] + 1)) && set.has((p[0] + 1) + "," + (p[1] + 1)));
    ok("river path: no 2x2 block (stays 1px thick, never a band)", !has2x2);
    const steep = await page.evaluate(() => window.__novaRiverPathPixels(5, 30, 8, 2)); // a steep, reversed drag
    ok("river path: a steep/reversed drag is also fully orthogonal", steep.every((p, n) => n === 0 || (Math.abs(p[0] - steep[n - 1][0]) + Math.abs(p[1] - steep[n - 1][1]) === 1)), steep.slice(0, 6));

    // Brush = 1 px → paintRiversAt R = max(0, brush-1) = 0 → exactly one pixel.
    await page.evaluate(() => { const el = document.getElementById("mapBrushSize"); el.value = "1"; el.dispatchEvent(new Event("change", { bubbles: true })); });

    // A clean click at the canvas centre: mousedown on #mapWrap, mouseup on window, no movement between.
    // With staging this must NOT hit the network — it stages the stroke and lights the Save button.
    await page.evaluate(() => {
      const wrap = document.getElementById("mapWrap");
      const r = document.getElementById("mapCanvas").getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
      wrap.dispatchEvent(new MouseEvent("mousedown", { clientX: cx, clientY: cy, bubbles: true }));
      window.dispatchEvent(new MouseEvent("mouseup", { clientX: cx, clientY: cy, bubbles: true }));
    });
    await page.waitForFunction(() => /staged/i.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 8000 });

    // THE FIX: painting a river is a STAGED edit — nothing is written to disk until 💾 Save.
    ok("painting a river does NOT save immediately (no rivers-paint POST fired)", paintBody === null, paintBody);
    ok("rivers.bmp on disk is byte-for-byte UNCHANGED before Save", fs.readFileSync(riversPath).equals(origBuf));
    const staged = await page.evaluate(() => ({ count: document.getElementById("mapSaveCount").textContent, disabled: document.getElementById("mapSaveAll").disabled }));
    ok("the stroke is staged — 💾 Save shows a pending count and is enabled", staged.count !== "0" && staged.disabled === false, staged);

    // Now SAVE → the staged stroke flushes to rivers.bmp (one rivers-paint POST), and the dirty count clears.
    const paintResp = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/api/map/rivers-paint"), { timeout: 10000 });
    await page.click("#mapSaveAll");
    const resp = await paintResp; // the POST resolving means writeRiversPaint has written the file to disk
    ok("💾 Save flushes the staged river stroke (rivers-paint POST 200)", resp.status() === 200, resp.status());
    await page.waitForFunction(() => document.getElementById("mapSaveCount").textContent === "0", null, { timeout: 10000 });
    ok("after Save the map is no longer dirty (Save count back to 0)", true);

    ok("the flushed POST carried edits at palette index 2", !!paintBody && Array.isArray(paintBody.edits) && paintBody.edits.length >= 1 && paintBody.edits.every((e) => e.index === 2), paintBody);
    const painted = new Set((paintBody.edits || []).map((e) => e.x + "," + e.y));
    ok("brush=1 staged exactly one pixel", painted.size === 1, [...painted]);

    // Read the patched file back off disk and parse it.
    const newBuf = fs.readFileSync(riversPath);
    const newMeta = mapData.readIndexedBmp(newBuf);
    ok("dimensions unchanged after paint", newMeta.width === origMeta.width && newMeta.height === origMeta.height, { w: newMeta.width, h: newMeta.height });
    // Header (first 54 bytes) byte-for-byte identical.
    ok("BMP header bytes unchanged", origBuf.slice(0, 54).equals(newBuf.slice(0, 54)));
    // The 256-entry BGRA palette (immediately after the 54-byte header) byte-for-byte identical.
    const palBytes = 256 * 4;
    ok("256-colour palette unchanged", origBuf.slice(54, 54 + palBytes).equals(newBuf.slice(54, 54 + palBytes)));

    // Every painted pixel now reads palette index 2; every OTHER pixel is exactly as it was.
    let paintedOk = true, othersOk = true;
    for (let y = 0; y < origMeta.height; y++) {
      for (let x = 0; x < origMeta.width; x++) {
        const o = origMeta.pixelOffset(x, y), n = newMeta.pixelOffset(x, y);
        if (painted.has(x + "," + y)) { if (newBuf[n] !== 2) paintedOk = false; }
        else if (origBuf[o] !== newBuf[n]) othersOk = false;
      }
    }
    ok("painted pixel(s) now hold the chosen index (2)", paintedOk);
    ok("no other pixel changed (only the painted spot)", othersOk);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-RIVERS E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
