// MAP supply hubs + railways frontend: "🏭 Hub" mode toggles a supply node on a clicked province; "🛤 Rail"
// mode collects a province chain and Finish lays a railway. Both write immediately. Builds a temp mod, adds
// + removes a hub and draws a 3-province railway, asserting supply_nodes.txt / railways.txt on disk.
// Run: npm run test:map-supply-ui
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { chromium } = require("playwright");
const { createApp } = require("./server.js");
const { armMapReady, waitForMapReady, mapSawReady } = require("./testlib-map-ready.js");
const md = require("./map-data.js");

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
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-supui-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova SupUI E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(48, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  mk(path.join(mod, "map", "supply_nodes.txt"), "");
  mk(path.join(mod, "map", "railways.txt"), "");
  const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3"));
  return mod;
}
const hubs = (mod) => md.parseSupplyNodes(fs.readFileSync(path.join(mod, "map", "supply_nodes.txt"), "utf8"));
const rails = (mod) => md.parseRailways(fs.readFileSync(path.join(mod, "map", "railways.txt"), "utf8"));

(async () => {
  console.log("=== MAP SUPPLY HUBS + RAILWAYS (frontend) E2E ===");
  const mod = buildMod();
  const PORT = 3586, BASE = `http://127.0.0.1:${PORT}`;
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
  const waitStatus = (re) => page.waitForFunction((rs) => new RegExp(rs).test((document.getElementById("mapStatus") || {}).textContent || ""), re.source, { timeout: 12000 });

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
    ok("located provinces 1, 2, 3", mids["1"] && mids["2"] && mids["3"], mids);

    // ── Supply hubs: add on prov 1, add on prov 2, then remove prov 1 (toggle) — all STAGED, then Save. ──
    await page.click("#mapModeSupplyHub");
    await clickAt(mids["1"]); await clickAt(mids["2"]); await clickAt(mids["1"]); // add 1, add 2, remove 1
    ok("hub edits are staged (Save count > 0)", parseInt(await page.evaluate(() => (document.getElementById("mapSaveCount") || {}).textContent), 10) > 0);
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /✓\s*Saved/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    ok("disk: hub on province 2 saved", hubs(mod).some((n) => n.province === 2), hubs(mod));
    ok("disk: hub on province 1 removed (toggle)", !hubs(mod).some((n) => n.province === 1), hubs(mod));

    // ── Railway: draw 1 → 2 → 3, Finish (staged), then Save. ──
    await page.click("#mapModeRailway");
    await clickAt(mids["1"]); await clickAt(mids["2"]); await clickAt(mids["3"]);
    ok("rail bar shows 3 provinces", (await page.evaluate(() => (document.getElementById("mapRailCount") || {}).textContent)) === "3");
    await page.click("#mapRailFinish");
    await waitStatus(/Railway across 3 provinces/);
    ok("railway is staged (Save count > 0)", parseInt(await page.evaluate(() => (document.getElementById("mapSaveCount") || {}).textContent), 10) > 0);
    await page.click("#mapSaveAll");
    await page.waitForFunction(() => /✓\s*Saved/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 15000 });
    const rw = rails(mod);
    ok("disk: a railway across provinces 1,2,3 was saved", rw.some((x) => JSON.stringify(x.provinces) === JSON.stringify([1, 2, 3])), rw);

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-SUPPLY-UI E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
