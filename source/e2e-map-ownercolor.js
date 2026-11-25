// MAP fallback owner colours: for country tags with NO colors.txt entry, ownerColor generates a colour by
// hashing the tag to a hue. A duplicate hslToRgb made ownerColor feed a 0–1 fraction to the DEGREES
// version, collapsing every generated owner to ~the same red ([~200,66,65]). This asserts the generated
// owner colours are actually SPREAD across hues (large pairwise distance), not clustered. Run: npm run test:map-ownercolor
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
// 5 stripes of 16px → 5 single-province states with distinct ownerless tags.
const STRIPE_COL = [[200, 0, 0], [0, 200, 0], [0, 0, 200], [200, 200, 0], [200, 0, 200]];
const provAtX = (x) => Math.floor(x / 16) + 1;
const mk = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
const TAGS = ["AAA", "BBB", "CCC", "DDD", "EEE"];

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-ownercol-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova OwnerColor E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n'); // no colors.txt → all owners use the generated fallback
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(80, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;",
    "4;200;200;0;land;false;plains;3;", "5;200;0;200;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  TAGS.forEach((tag, i) => mk(path.join(mod, "history", "states", (i + 1) + ".txt"),
    `state = {\n\tid = ${i + 1}\n\tname = "STATE_${i + 1}"\n\tstate_category = rural\n\tprovinces = { ${i + 1} }\n\thistory = {\n\t\towner = ${tag}\n\t}\n}\n`));
  return mod;
}

(async () => {
  console.log("=== MAP fallback OWNER COLOURS (hslToRgb fix) E2E ===");
  const mod = buildMod();
  const PORT = 3590, BASE = `http://127.0.0.1:${PORT}`;
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
  const pixelAt = (cx, cy) => page.evaluate(({ cx, cy }) => {
    const cv = document.getElementById("mapCanvas"), r = cv.getBoundingClientRect();
    const sx = Math.round((cx - r.left) * (cv.width / r.width)), sy = Math.round((cy - r.top) * (cv.height / r.height));
    const g = cv.getContext("2d").getImageData(sx, sy, 1, 1).data; return [g[0], g[1], g[2]];
  }, { cx, cy });

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready (owner colour mode is the default)", await mapSawReady(page));

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
    ok("located all 5 owned provinces", [1, 2, 3, 4, 5].every((i) => mids[String(i)]), mids);

    const cols = [];
    for (let i = 1; i <= 5; i++) cols.push(await pixelAt(mids[String(i)].cx, mids[String(i)].cy));
    // Max pairwise Chebyshev distance: with the bug every fallback owner is ~[200,66,65] (distance ~0);
    // with the fix the 5 hues are spread around the wheel (distance well over 100).
    let maxd = 0;
    for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) {
      const d = Math.max(Math.abs(cols[a][0] - cols[b][0]), Math.abs(cols[a][1] - cols[b][1]), Math.abs(cols[a][2] - cols[b][2]));
      if (d > maxd) maxd = d;
    }
    ok("generated owner colours are SPREAD across hues (not all the same red)", maxd > 80, { maxd, cols });
    // Not every colour should be red-dominant (the bug made r the max channel for all of them).
    const redDominant = cols.filter((c) => c[0] >= c[1] && c[0] >= c[2]).length;
    ok("not all generated owner colours are red-dominant", redDominant < cols.length, { redDominant, cols });

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-OWNERCOLOR E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
