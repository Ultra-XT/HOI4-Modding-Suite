// MAP create a strategic region + supply area (#roadmap). Both are additive: a new valid block (region gets
// a cloned weather block) is appended to a mod file + its display name written to localisation; existing map
// files are untouched. This builds a temp mod with one region (to clone weather from) + one supply area,
// creates a new region and a new supply area via the ✛ UI, and verifies both blocks + loc on disk.
// Run: npm run test:map-region-create
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
const REGION1 = 'strategic_region={ id=1 name="STRATEGICREGION_1" provinces={ 1 2 3 } weather={ period={ between={ 0.0 30.0 } temperature={ -5.0 20.0 } no_phenomenon=0.500 rain_light=1.000 rain_heavy=0.150 snow=0.000 blizzard=0.000 arctic_water=0.000 mud=0.000 sandstorm=0.000 min_snow_level=0.000 } } }\n';

function buildMod() {
  const mod = fs.mkdtempSync(path.join(os.tmpdir(), "nova-rgncreate-"));
  mk(path.join(mod, "descriptor.mod"),
    'name="Nova RegionCreate E2E"\nreplace_path="history/states"\nreplace_path="history/countries"\nreplace_path="map"\n' +
    'replace_path="map/strategicregions"\nreplace_path="map/supplyareas"\nreplace_path="common/countries"\n');
  mk(path.join(mod, "map", "provinces.bmp"), bmp24(48, 16, (x) => STRIPE_COL[provAtX(x) - 1]));
  mk(path.join(mod, "map", "definition.csv"), ["0;0;0;0;land;false;unknown;0;",
    "1;200;0;0;land;false;plains;3;", "2;0;200;0;land;false;plains;3;", "3;0;0;200;land;false;plains;3;"].join("\r\n") + "\r\n");
  mk(path.join(mod, "map", "buildings.txt"), "");
  mk(path.join(mod, "map", "strategicregions", "r.txt"), REGION1);
  mk(path.join(mod, "map", "supplyareas", "a.txt"), 'supply_area={ id=1 name="SUPPLYAREA_1" value=10 states={ 1 2 } }\n');
  const st = (id, p) => `state = {\n\tid = ${id}\n\tname = "STATE_${id}"\n\tstate_category = rural\n\tprovinces = { ${p} }\n\thistory = {\n\t\towner = AAA\n\t}\n}\n`;
  mk(path.join(mod, "history", "states", "1.txt"), st(1, "1 2"));
  mk(path.join(mod, "history", "states", "2.txt"), st(2, "3"));
  return mod;
}
const rd = (mod, ...p) => { try { return fs.readFileSync(path.join(mod, ...p), "utf8"); } catch (_) { return ""; } };

(async () => {
  console.log("=== MAP region + supply-area CREATE E2E ===");
  const mod = buildMod();
  const PORT = 3602, BASE = `http://127.0.0.1:${PORT}`;
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

  try {
    await page.goto(`${BASE}/map.html`, { waitUntil: "domcontentloaded" });
    await waitForMapReady(page, { orError: true });
    ok("map reaches Ready", await mapSawReady(page));
    const mids = await probe();
    ok("located province 1", !!mids["1"], mids);
    await clickAt(mids["1"]); // selects province 1 + state 1 → region & supply rows show

    // --- Create a new strategic region via ✛ ---
    await page.click("#miRegionNew");
    ok("region create row opens", await page.evaluate(() => (document.getElementById("miRegionNewRow") || {}).style.display === "flex"));
    await page.fill("#miRegionNewInput", "My Test Region");
    await page.click("#miRegionNewApply");
    await page.waitForFunction(() => /Created strategic region/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 10000 });
    ok("the new region appears in the dropdown (selected)", await page.evaluate(() => /My Test Region/.test(document.getElementById("miRegionSel").textContent) && document.getElementById("miRegionSel").value === "2"));
    const rtxt = rd(mod, "map", "strategicregions", "zz_nova_regions.txt");
    ok("disk: new region block id=2 with the nova name key", /strategic_region\s*=\s*\{[\s\S]*id\s*=\s*2[\s\S]*name\s*=\s*"nova_strategicregion_2"/.test(rtxt), rtxt.slice(0, 120));
    ok("disk: the new region has a (cloned) weather block", /weather\s*=\s*\{[\s\S]*period\s*=\s*\{[\s\S]*temperature/.test(rtxt), rtxt.length);
    ok('disk: region display name written to loc (nova_strategicregion_2 → "My Test Region")', /nova_strategicregion_2:\d*\s+"My Test Region"/.test(rd(mod, "localisation", "english", "replace", "nova_region_names_l_english.yml")));
    ok("the original region file is untouched", /name\s*=\s*"STRATEGICREGION_1"/.test(rd(mod, "map", "strategicregions", "r.txt")));

    // --- Create a new supply area via ✛ ---
    await page.click("#miSupplyNew");
    ok("supply create row opens", await page.evaluate(() => (document.getElementById("miSupplyNewRow") || {}).style.display === "flex"));
    await page.fill("#miSupplyNewInput", "My Supply Zone");
    await page.click("#miSupplyNewApply");
    await page.waitForFunction(() => /Created supply area/.test((document.getElementById("mapStatus") || {}).textContent || ""), null, { timeout: 10000 });
    ok("the new supply area appears in the dropdown (selected)", await page.evaluate(() => /My Supply Zone/.test(document.getElementById("miSupplySel").textContent) && document.getElementById("miSupplySel").value === "2"));
    const atxt = rd(mod, "map", "supplyareas", "zz_nova_areas.txt");
    ok("disk: new supply_area block id=2 with the nova name key", /supply_area\s*=\s*\{[\s\S]*id\s*=\s*2[\s\S]*name\s*=\s*"nova_supplyarea_2"/.test(atxt), atxt.slice(0, 120));
    ok('disk: supply-area display name written to loc', /nova_supplyarea_2:\d*\s+"My Supply Zone"/.test(rd(mod, "localisation", "english", "nova_supplyarea_names_l_english.yml")));

    ok("no uncaught page errors" + (errs.length ? " (" + errs.join("; ") + ")" : ""), errs.length === 0);
  } catch (e) {
    ok("threw: " + (e && e.stack ? e.stack : e), false);
  } finally {
    await browser.close();
    server.close();
    try { fs.rmSync(mod, { recursive: true, force: true }); } catch (_) {}
  }
  console.log(`\nMAP-REGION-CREATE E2E: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
